/**
 * Installment Delete Handler
 * Epic 2 Story 2.7: Delete Installment Plan
 *
 * Handles deleting installments permanently via WhatsApp conversation flow
 * Multi-step flow: list → select → confirm → execute
 */

import { getSupabaseClient } from '../../services/database/supabase-client.js'
import { getUserSession } from '../../auth/session-manager.js'
import { logger } from '../../services/monitoring/logger.js'
import { messages as ptBR } from '../../localization/pt-br.js'
import { messages as en } from '../../localization/en.js'
import { getUserLocale } from '../../localization/i18n.js'
import { trackEvent } from '../../analytics/index.js'
import { WhatsAppAnalyticsEvent } from '../../analytics/events.js'
import {
  storePendingDeleteContext,
  getPendingDeleteContext,
  clearPendingDeleteContext,
  type InstallmentOption
} from '../../services/conversation/pending-delete-state.js'

/**
 * Handle delete request flow
 * AC7.4: WhatsApp Support
 */
export async function handleDeleteRequest(
  whatsappNumber: string,
  message: string
): Promise<string> {
  try {
    const session = await getUserSession(whatsappNumber)
    if (!session) {
      return ptBR.notAuthenticated
    }

    const locale = await getUserLocale(session.userId)
    const messages = locale === 'pt-br' ? ptBR : en

    // Check if user has pending delete conversation
    const pendingDelete = getPendingDeleteContext(whatsappNumber)

    if (pendingDelete) {
      // Continue existing conversation
      return await handleDeleteConversation(whatsappNumber, message, session.userId, locale, pendingDelete, messages)
    } else {
      // Start new delete flow
      return await startDeleteFlow(whatsappNumber, session.userId, locale, messages)
    }
  } catch (error) {
    logger.error('Error handling delete request', {
      whatsappNumber,
      error: error instanceof Error ? error.message : 'Unknown error'
    })
    return 'Erro ao processar solicitação de deleção. Tente novamente.'
  }
}

/**
 * Start a new delete flow by listing active installments
 */
async function startDeleteFlow(
  whatsappNumber: string,
  userId: string,
  locale: 'pt-br' | 'en',
  messages: any
): Promise<string> {
  const supabase = getSupabaseClient()

  // Fetch active installments with payment details
  const { data: plans, error } = await supabase
    .from('installment_plans')
    .select(`
      id,
      description,
      total_amount,
      total_installments,
      payment_method:payment_methods!inner (
        name
      ),
      category:categories (
        icon
      )
    `)
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })

  if (error) {
    logger.error('Error fetching active installments for delete', {
      userId,
      error: error.message
    })
    return messages.installmentDelete.error
  }

  if (!plans || plans.length === 0) {
    return messages.installmentDelete.no_active
  }

  // For each plan, get payment details
  const installmentOptions: InstallmentOption[] = []

  for (const plan of plans) {
    const { data: payments } = await supabase
      .from('installment_payments')
      .select('status, amount')
      .eq('plan_id', plan.id)

    let payments_paid = 0
    let amount_paid = 0
    let payments_pending = 0
    let amount_remaining = 0

    for (const payment of payments || []) {
      if (payment.status === 'paid') {
        payments_paid++
        amount_paid += payment.amount
      } else if (payment.status === 'pending') {
        payments_pending++
        amount_remaining += payment.amount
      }
    }

    // Supabase returns joined tables as arrays
    const category = Array.isArray(plan.category) ? plan.category[0] : plan.category
    const paymentMethod = Array.isArray(plan.payment_method) ? plan.payment_method[0] : plan.payment_method

    installmentOptions.push({
      plan_id: plan.id,
      description: plan.description,
      emoji: category?.icon || '📦',
      payment_method_name: paymentMethod?.name || 'Unknown',
      total_amount: plan.total_amount,
      total_installments: plan.total_installments,
      payments_paid,
      amount_paid,
      payments_pending,
      amount_remaining
    })
  }

  // Store conversation context
  storePendingDeleteContext(whatsappNumber, {
    step: 'select',
    installments: installmentOptions,
    locale
  })

  // Track analytics
  trackEvent(userId, WhatsAppAnalyticsEvent.INSTALLMENT_DELETE_DIALOG_OPENED, {
    installmentCount: installmentOptions.length,
    channel: 'whatsapp'
  })

  // Build list message
  let listMessage = messages.installmentDelete.list_prompt + '\n\n'

  installmentOptions.forEach((installment, index) => {
    const numberEmoji = `${index + 1}️⃣`
    listMessage += messages.installmentDelete.list_item(
      numberEmoji,
      installment.description,
      installment.total_amount,
      installment.total_installments
    ) + '\n'
    listMessage += messages.installmentDelete.list_status(
      installment.payments_paid,
      installment.payments_pending
    ) + '\n\n'
  })

  listMessage += messages.installmentDelete.list_footer

  return listMessage
}

/**
 * Handle ongoing delete conversation
 */
async function handleDeleteConversation(
  whatsappNumber: string,
  message: string,
  userId: string,
  locale: 'pt-br' | 'en',
  context: any,
  messages: any
): Promise<string> {
  const trimmedMessage = message.trim().toLowerCase()

  // Check for cancel
  if (trimmedMessage === 'cancelar' || trimmedMessage === 'cancel') {
    clearPendingDeleteContext(whatsappNumber)

    // Track analytics
    if (context.selectedPlanId) {
      const selectedInstallment = context.installments.find(
        (i: InstallmentOption) => i.plan_id === context.selectedPlanId
      )
      if (selectedInstallment) {
        trackEvent(userId, WhatsAppAnalyticsEvent.INSTALLMENT_DELETE_CANCELLED, {
          planId: context.selectedPlanId,
          paidCount: selectedInstallment.payments_paid,
          pendingCount: selectedInstallment.payments_pending,
          channel: 'whatsapp'
        })
      }
    }

    return messages.installmentDelete.cancelled
  }

  if (context.step === 'select') {
    // User is selecting which installment to delete
    const selection = parseInt(trimmedMessage)

    if (isNaN(selection) || selection < 1 || selection > context.installments.length) {
      const validRange = `1-${context.installments.length}`
      return messages.installmentDelete.invalid_selection(validRange)
    }

    const selectedInstallment = context.installments[selection - 1]

    // Update context to confirmation step
    storePendingDeleteContext(whatsappNumber, {
      step: 'confirm',
      installments: context.installments,
      selectedPlanId: selectedInstallment.plan_id,
      locale
    })

    // Build confirmation message
    let confirmMessage = messages.installmentDelete.confirmation_title + '\n\n'
    confirmMessage += messages.installmentDelete.confirmation_intro + '\n\n'
    confirmMessage += messages.installmentDelete.confirmation_details(
      selectedInstallment.emoji,
      selectedInstallment.description,
      selectedInstallment.total_amount,
      selectedInstallment.total_installments
    ) + '\n\n'
    confirmMessage += messages.installmentDelete.confirmation_status + '\n'
    confirmMessage += messages.installmentDelete.confirmation_paid(
      selectedInstallment.payments_paid,
      selectedInstallment.amount_paid
    ) + '\n'
    confirmMessage += messages.installmentDelete.confirmation_pending(
      selectedInstallment.payments_pending,
      selectedInstallment.amount_remaining
    ) + '\n\n'
    confirmMessage += messages.installmentDelete.confirmation_what_happens + '\n'
    confirmMessage += messages.installmentDelete.confirmation_plan_removed + '\n'
    confirmMessage += messages.installmentDelete.confirmation_pending_deleted(
      selectedInstallment.payments_pending
    ) + '\n'
    confirmMessage += messages.installmentDelete.confirmation_paid_preserved(
      selectedInstallment.payments_paid
    ) + '\n'
    confirmMessage += messages.installmentDelete.confirmation_commitments_updated(
      selectedInstallment.amount_remaining
    ) + '\n'
    confirmMessage += messages.installmentDelete.confirmation_irreversible + '\n\n'
    confirmMessage += messages.installmentDelete.confirm_prompt

    return confirmMessage

  } else if (context.step === 'confirm') {
    // User is confirming deletion
    if (trimmedMessage === 'confirmar' || trimmedMessage === 'confirm') {
      // Execute deletion
      const result = await executeDelete(userId, context.selectedPlanId, messages)
      clearPendingDeleteContext(whatsappNumber)

      if (result.success) {
        // Track analytics
        const selectedInstallment = context.installments.find(
          (i: InstallmentOption) => i.plan_id === context.selectedPlanId
        )
        if (selectedInstallment) {
          trackEvent(userId, WhatsAppAnalyticsEvent.INSTALLMENT_DELETED, {
            planId: context.selectedPlanId,
            description: selectedInstallment.description,
            paidCount: selectedInstallment.payments_paid,
            pendingCount: selectedInstallment.payments_pending,
            paidAmount: selectedInstallment.amount_paid,
            pendingAmount: selectedInstallment.amount_remaining,
            channel: 'whatsapp'
          })
        }

        // Build success message
        let successMessage = messages.installmentDelete.success_title + '\n\n'
        successMessage += messages.installmentDelete.success_description(
          selectedInstallment.description
        ) + '\n\n'
        successMessage += messages.installmentDelete.success_impact + '\n'
        successMessage += messages.installmentDelete.success_pending_deleted(
          selectedInstallment.payments_pending
        ) + '\n'
        successMessage += messages.installmentDelete.success_paid_preserved(
          selectedInstallment.payments_paid
        ) + '\n'
        successMessage += messages.installmentDelete.success_commitments_updated(
          selectedInstallment.amount_remaining
        ) + '\n\n'
        successMessage += messages.installmentDelete.success_footer

        return successMessage
      } else {
        // Track failure analytics
        trackEvent(userId, WhatsAppAnalyticsEvent.INSTALLMENT_DELETE_FAILED, {
          planId: context.selectedPlanId,
          errorType: 'execution_error',
          errorMessage: result.error || 'Unknown error',
          channel: 'whatsapp'
        })

        return result.error || messages.installmentDelete.error
      }
    } else {
      // Invalid confirmation response
      return messages.installmentDelete.confirm_prompt
    }
  }

  // Unknown step - clear context and start over
  clearPendingDeleteContext(whatsappNumber)
  return messages.installmentDelete.error
}

/**
 * Execute the deletion via Supabase
 * Uses the same atomic deletion logic as the web frontend
 */
async function executeDelete(
  userId: string,
  planId: string,
  messages: any
): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabaseClient()

  try {
    // Step 1: Verify ownership
    const { data: plan, error: planError } = await supabase
      .from('installment_plans')
      .select('id, user_id')
      .eq('id', planId)
      .eq('user_id', userId)
      .single()

    if (planError || !plan) {
      logger.error('Plan not found or unauthorized', {
        userId,
        planId,
        error: planError?.message
      })
      return {
        success: false,
        error: messages.installmentDelete.error_not_found
      }
    }

    // Step 2: Get payment transaction IDs for paid payments
    const { data: paidPayments, error: paymentsError } = await supabase
      .from('installment_payments')
      .select('transaction_id')
      .eq('plan_id', planId)
      .eq('status', 'paid')
      .not('transaction_id', 'is', null)

    if (paymentsError) {
      logger.error('Error fetching paid payments', {
        userId,
        planId,
        error: paymentsError.message
      })
      return {
        success: false,
        error: messages.installmentDelete.error
      }
    }

    // Step 3: Unlink paid transactions (orphan them)
    if (paidPayments && paidPayments.length > 0) {
      const transactionIds = paidPayments
        .map(p => p.transaction_id)
        .filter((id): id is string => id !== null)

      if (transactionIds.length > 0) {
        const { error: unlinkError } = await supabase
          .from('transactions')
          .update({ installment_payment_id: null, updated_at: new Date().toISOString() })
          .in('id', transactionIds)

        if (unlinkError) {
          logger.error('Error unlinking paid transactions', {
            userId,
            planId,
            transactionIds,
            error: unlinkError.message
          })
          return {
            success: false,
            error: messages.installmentDelete.error
          }
        }
      }
    }

    // Step 4: Delete plan (CASCADE deletes all payments)
    const { error: deleteError } = await supabase
      .from('installment_plans')
      .delete()
      .eq('id', planId)
      .eq('user_id', userId)

    if (deleteError) {
      logger.error('Error deleting installment plan', {
        userId,
        planId,
        error: deleteError.message
      })
      return {
        success: false,
        error: messages.installmentDelete.error
      }
    }

    logger.info('Installment plan deleted successfully (WhatsApp)', {
      userId,
      planId,
      paidTransactionsOrphaned: paidPayments?.length || 0
    })

    return { success: true }

  } catch (error) {
    logger.error('Unexpected error during delete execution', {
      userId,
      planId,
      error: error instanceof Error ? error.message : 'Unknown error'
    })
    return {
      success: false,
      error: messages.installmentDelete.error
    }
  }
}
