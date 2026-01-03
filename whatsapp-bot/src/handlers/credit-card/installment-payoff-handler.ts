/**
 * Installment Payoff Handler
 * Epic 2 Story 2.5: Mark Installment as Paid Off Early
 *
 * Handles paying off installments early via WhatsApp conversation flow
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
  storePendingPayoffContext,
  getPendingPayoffContext,
  clearPendingPayoffContext,
  type InstallmentOption
} from '../../services/conversation/pending-payoff-state.js'

/**
 * Handle payoff request flow
 * AC5.4: WhatsApp Support
 */
export async function handlePayoffRequest(
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

    // Check if user has pending payoff conversation
    const pendingPayoff = getPendingPayoffContext(whatsappNumber)

    if (pendingPayoff) {
      // Continue existing conversation
      return await handlePayoffConversation(whatsappNumber, message, session.userId, locale, pendingPayoff, messages)
    } else {
      // Start new payoff flow
      return await startPayoffFlow(whatsappNumber, session.userId, locale, messages)
    }
  } catch (error) {
    logger.error('Error handling payoff request', {
      whatsappNumber,
      error: error instanceof Error ? error.message : 'Unknown error'
    })
    return 'Erro ao processar solicitação de quitação. Tente novamente.'
  }
}

/**
 * Start a new payoff flow by listing active installments
 */
async function startPayoffFlow(
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
    logger.error('Error fetching active installments for payoff', {
      userId,
      error: error.message
    })
    return messages.installmentPayoff.error
  }

  if (!plans || plans.length === 0) {
    return messages.installmentPayoff.no_active
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
  storePendingPayoffContext(whatsappNumber, {
    step: 'select',
    installments: installmentOptions,
    locale
  })

  // Build list message
  let listMessage = messages.installmentPayoff.list_active + '\n\n'

  installmentOptions.forEach((installment, index) => {
    listMessage += `${index + 1}. ${messages.installmentPayoff.installment_summary(
      installment.emoji,
      installment.description,
      installment.payment_method_name,
      installment.total_amount,
      installment.total_installments,
      installment.payments_paid,
      installment.total_installments,
      installment.amount_remaining
    )}\n\n`
  })

  const numbers = installmentOptions.map((_, i) => i + 1).join(', ')
  listMessage += messages.installmentPayoff.select_prompt(numbers)

  return listMessage
}

/**
 * Continue payoff conversation based on user response
 */
async function handlePayoffConversation(
  whatsappNumber: string,
  message: string,
  userId: string,
  locale: 'pt-br' | 'en',
  context: any,
  messages: any
): Promise<string> {
  const normalizedMessage = message.toLowerCase().trim()

  // Handle cancellation at any step
  if (normalizedMessage === 'cancelar' || normalizedMessage === 'cancel') {
    clearPendingPayoffContext(whatsappNumber)
    return messages.installmentPayoff.cancelled
  }

  if (context.step === 'select') {
    // User is selecting which installment to pay off
    return await handleInstallmentSelection(whatsappNumber, normalizedMessage, context, messages)
  } else if (context.step === 'confirm') {
    // User is confirming or cancelling payoff
    return await handlePayoffConfirmation(whatsappNumber, normalizedMessage, userId, context, messages)
  }

  // Unknown step
  clearPendingPayoffContext(whatsappNumber)
  return messages.installmentPayoff.error
}

/**
 * Handle installment selection (by number or description)
 */
async function handleInstallmentSelection(
  whatsappNumber: string,
  message: string,
  context: any,
  messages: any
): Promise<string> {
  let selectedInstallment: InstallmentOption | null = null

  // Try numeric selection first
  const numericMatch = message.match(/^\d+$/)
  if (numericMatch) {
    const index = parseInt(numericMatch[0], 10) - 1
    if (index >= 0 && index < context.installments.length) {
      selectedInstallment = context.installments[index]
    }
  }

  // Try fuzzy description matching
  if (!selectedInstallment) {
    const matchedInstallments = context.installments.filter((inst: InstallmentOption) =>
      inst.description.toLowerCase().includes(message)
    )

    if (matchedInstallments.length === 1) {
      selectedInstallment = matchedInstallments[0]
    } else if (matchedInstallments.length > 1) {
      // Ambiguous - ask for numeric selection
      const numbers = context.installments.map((_: any, i: number) => i + 1).join(', ')
      return messages.installmentPayoff.invalid_selection(numbers)
    }
  }

  if (!selectedInstallment) {
    // Invalid selection
    const numbers = context.installments.map((_: any, i: number) => i + 1).join(', ')
    return messages.installmentPayoff.invalid_selection(numbers)
  }

  // Update context to confirmation step
  storePendingPayoffContext(whatsappNumber, {
    step: 'confirm',
    installments: context.installments,
    selectedPlanId: selectedInstallment.plan_id,
    locale: context.locale
  })

  // Build confirmation message
  const confirmationMessage =
    messages.installmentPayoff.confirmation_title + '\n\n' +
    messages.installmentPayoff.confirmation_details(
      selectedInstallment.emoji,
      selectedInstallment.description,
      selectedInstallment.payment_method_name,
      selectedInstallment.total_amount,
      selectedInstallment.total_installments,
      selectedInstallment.payments_paid,
      selectedInstallment.amount_paid,
      selectedInstallment.payments_pending,
      selectedInstallment.amount_remaining
    ) + '\n\n' +
    messages.installmentPayoff.confirm_prompt

  return confirmationMessage
}

/**
 * Handle payoff confirmation (sim/não)
 */
async function handlePayoffConfirmation(
  whatsappNumber: string,
  message: string,
  userId: string,
  context: any,
  messages: any
): Promise<string> {
  if (message === 'sim' || message === 'yes') {
    // Execute payoff
    return await executePayoff(whatsappNumber, userId, context, messages)
  } else if (message === 'não' || message === 'nao' || message === 'no') {
    // Cancel payoff
    clearPendingPayoffContext(whatsappNumber)
    return messages.installmentPayoff.cancelled
  } else {
    // Invalid response
    return messages.installmentPayoff.confirm_prompt
  }
}

/**
 * Execute the payoff operation
 */
async function executePayoff(
  whatsappNumber: string,
  userId: string,
  context: any,
  messages: any
): Promise<string> {
  const supabase = getSupabaseClient()
  const planId = context.selectedPlanId

  if (!planId) {
    clearPendingPayoffContext(whatsappNumber)
    return messages.installmentPayoff.error
  }

  // Find the installment details for success message
  const installment = context.installments.find((i: InstallmentOption) => i.plan_id === planId)

  if (!installment) {
    clearPendingPayoffContext(whatsappNumber)
    return messages.installmentPayoff.error
  }

  try {
    // Call RPC function to pay off installment atomically
    const { data: rpcData, error: rpcError } = await supabase.rpc('delete_installment_plan_atomic', {
      p_user_id: userId,
      p_plan_id: planId,
      p_delete_type: 'paid_off'
    })

    if (rpcError) {
      logger.error('RPC error paying off installment via WhatsApp', {
        userId,
        planId,
        error: rpcError.message
      })

      // Track failure
      trackEvent(
        WhatsAppAnalyticsEvent.INSTALLMENT_PAYOFF_FAILED,
        userId,
        {
          userId,
          planId,
          error: rpcError.message,
          channel: 'whatsapp',
          timestamp: new Date().toISOString()
        }
      )

      clearPendingPayoffContext(whatsappNumber)
      return messages.installmentPayoff.error
    }

    const result = Array.isArray(rpcData) ? rpcData[0] : rpcData

    if (!result || !result.success) {
      logger.error('Payoff failed via WhatsApp', {
        userId,
        planId,
        errorMessage: result?.error_message
      })

      trackEvent(
        WhatsAppAnalyticsEvent.INSTALLMENT_PAYOFF_FAILED,
        userId,
        {
          userId,
          planId,
          error: result?.error_message || 'Unknown error',
          channel: 'whatsapp',
          timestamp: new Date().toISOString()
        }
      )

      clearPendingPayoffContext(whatsappNumber)
      return messages.installmentPayoff.error
    }

    // Success!
    trackEvent(
      WhatsAppAnalyticsEvent.INSTALLMENT_PAID_OFF_EARLY,
      userId,
      {
        userId,
        planId,
        total_amount: installment.total_amount,
        total_installments: installment.total_installments,
        payments_paid: installment.payments_paid,
        payments_pending: installment.payments_pending,
        remaining_amount: installment.amount_remaining,
        channel: 'whatsapp',
        timestamp: new Date().toISOString()
      }
    )

    clearPendingPayoffContext(whatsappNumber)

    return messages.installmentPayoff.success(
      installment.emoji,
      installment.description,
      installment.payments_pending,
      installment.amount_remaining
    )
  } catch (error) {
    logger.error('Unexpected error paying off installment via WhatsApp', {
      userId,
      planId,
      error: error instanceof Error ? error.message : 'Unknown error'
    })

    clearPendingPayoffContext(whatsappNumber)
    return messages.installmentPayoff.error
  }
}
