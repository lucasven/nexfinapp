/**
 * Credit Mode Switching Handler (WhatsApp)
 *
 * Handles mode switching between Credit Mode and Simple Mode with data implications warning.
 * When switching FROM Credit Mode TO Simple Mode with active installments, displays warning
 * and allows user to choose what to do with installments.
 *
 * Story: 1-5-mode-switching-with-data-implications-warning
 * Acceptance Criteria: AC5.2, AC5.14
 */

import { getSupabaseClient } from '../../services/database/supabase-client.js'
import {
  setConversationState,
  getConversationState,
  clearConversationState
} from '../../services/conversation/state-manager.js'
import { getUserLocale, getMessages } from '../../localization/i18n.js'
import { trackEvent } from '../../analytics/tracker.js'
import { logger } from '../../services/monitoring/logger.js'

interface ModeSwitchContext {
  paymentMethodId: string
  paymentMethodName: string
  currentMode: boolean
  targetMode: boolean
  activeInstallments: number
}

/**
 * Parse user's choice from the warning dialog
 *
 * Valid inputs:
 * - "1": Keep installments active
 * - "2": Pay off all installments
 * - "3": Cancel mode switch
 *
 * @param message - User's response message
 * @returns 'keep' | 'payoff' | 'cancel' | null (null = invalid input)
 */
function parseWarningChoice(message: string): 'keep' | 'payoff' | 'cancel' | null {
  const normalized = message.toLowerCase().trim()

  if (normalized === '1' || normalized.includes('manter') || normalized.includes('keep')) {
    return 'keep'
  }

  if (normalized === '2' || normalized.includes('quitar') || normalized.includes('pay')) {
    return 'payoff'
  }

  if (normalized === '3' || normalized.includes('cancel')) {
    return 'cancel'
  }

  return null
}

/**
 * Check for active installments for a payment method
 *
 * @param paymentMethodId - Payment method UUID
 * @param userId - User UUID
 * @returns Count of active installments
 */
async function checkActiveInstallments(
  paymentMethodId: string,
  userId: string
): Promise<number> {
  const supabase = getSupabaseClient()

  try {
    const { data, error } = await supabase
      .from('installment_plans')
      .select('id')
      .eq('payment_method_id', paymentMethodId)
      .eq('user_id', userId)
      .eq('status', 'active')

    if (error) {
      logger.error('[mode-switch] Error checking installments:', error)
      return 0
    }

    return data?.length || 0
  } catch (error) {
    logger.error('[mode-switch] Unexpected error checking installments:', error)
    return 0
  }
}

/**
 * Update payment method mode and optionally clean up installments
 *
 * @param paymentMethodId - Payment method UUID
 * @param userId - User UUID
 * @param newMode - Target mode (true = Credit, false = Simple)
 * @param cleanupInstallments - Whether to pay off active installments
 * @returns Success status
 */
async function switchMode(
  paymentMethodId: string,
  userId: string,
  newMode: boolean,
  cleanupInstallments: boolean
): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabaseClient()

  try {
    // If cleaning up installments, update them first
    if (cleanupInstallments) {
      // Mark installment plans as paid_off
      const { error: planError } = await supabase
        .from('installment_plans')
        .update({ status: 'paid_off' })
        .eq('payment_method_id', paymentMethodId)
        .eq('user_id', userId)
        .eq('status', 'active')

      if (planError) {
        logger.error('[mode-switch] Error updating installment plans:', planError)
        return { success: false, error: planError.message }
      }

      // Get plan IDs to update payments
      const { data: plans } = await supabase
        .from('installment_plans')
        .select('id')
        .eq('payment_method_id', paymentMethodId)
        .eq('user_id', userId)
        .eq('status', 'paid_off')

      if (plans && plans.length > 0) {
        // Cancel pending payments
        const { error: paymentsError } = await supabase
          .from('installment_payments')
          .update({ status: 'cancelled' })
          .in('plan_id', plans.map(p => p.id))
          .eq('status', 'pending')

        if (paymentsError) {
          logger.error('[mode-switch] Error updating installment payments:', paymentsError)
          // Continue anyway - installment plans are already updated
        }
      }
    }

    // Update payment method mode
    const { error: modeError } = await supabase
      .from('payment_methods')
      .update({ credit_mode: newMode })
      .eq('id', paymentMethodId)
      .eq('user_id', userId)

    if (modeError) {
      logger.error('[mode-switch] Error updating payment method mode:', modeError)
      return { success: false, error: modeError.message }
    }

    return { success: true }
  } catch (error) {
    logger.error('[mode-switch] Unexpected error during mode switch:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Handle mode switch initiation
 *
 * Called when user requests to switch modes (detected via NLP/AI).
 * Checks for active installments and either proceeds directly or shows warning.
 *
 * @param userId - User UUID
 * @param paymentMethodId - Payment method UUID
 * @param paymentMethodName - Payment method name (for messaging)
 * @param currentMode - Current mode (true = Credit, false = Simple)
 * @param locale - User locale (pt-BR or en)
 * @returns Response message
 */
export async function initiateModeSwitchFlow(
  userId: string,
  paymentMethodId: string,
  paymentMethodName: string,
  currentMode: boolean | null,
  locale: string
): Promise<string> {
  const messages = getMessages(locale)
  const targetMode = !currentMode

  // Check for active installments only if switching TO Simple Mode
  if (currentMode === true && targetMode === false) {
    const activeInstallments = await checkActiveInstallments(paymentMethodId, userId)

    if (activeInstallments > 0) {
      // Store conversation state for multi-turn dialog
      await setConversationState(userId, 'mode_switch_confirm', {
        paymentMethodId,
        paymentMethodName,
        currentMode,
        targetMode,
        activeInstallments
      })

      // Send warning message
      return messages.credit_mode.switch_warning(activeInstallments)
    }
  }

  // No installments or switching TO Credit Mode - proceed directly
  const result = await switchMode(paymentMethodId, userId, targetMode, false)

  if (result.success) {
    // Track analytics
    await trackEvent(userId, 'credit_mode_switched', {
      paymentMethodId,
      previousMode: currentMode ? 'credit' : 'simple',
      newMode: targetMode ? 'credit' : 'simple',
      hadActiveInstallments: false,
      installmentsCleanedUp: false,
      channel: 'whatsapp'
    })

    return messages.credit_mode.mode_switched_success
  } else {
    logger.error('[mode-switch] Failed to switch mode:', result.error)
    return 'Erro ao alterar modo. Por favor, tente novamente.'
  }
}

/**
 * Handle user's response to the mode switch warning
 *
 * Called when user replies to the warning dialog (1, 2, or 3).
 * Processes their choice and completes the mode switch.
 *
 * @param userId - User UUID
 * @param message - User's message
 * @param locale - User locale (pt-BR or en)
 * @returns Response message
 */
export async function handleModeSwitchWarningResponse(
  userId: string,
  message: string,
  locale: string
): Promise<string> {
  const messages = getMessages(locale)

  // Get conversation state
  const state = await getConversationState(userId, 'mode_switch_confirm')

  if (!state) {
    logger.warn('[mode-switch] No conversation state found for user:', userId)
    return 'Erro: Contexto não encontrado. Por favor, tente novamente.'
  }

  const context = state as ModeSwitchContext

  // Parse user's choice
  const choice = parseWarningChoice(message)

  if (!choice) {
    // Invalid input - prompt again
    return messages.credit_mode.invalid_switch_option
  }

  // Clear conversation state
  await clearConversationState(userId, 'mode_switch_confirm')

  // Handle choice
  if (choice === 'cancel') {
    // Track cancellation
    await trackEvent(userId, 'mode_switch_cancelled', {
      paymentMethodId: context.paymentMethodId,
      reason: 'installment_warning',
      activeInstallments: context.activeInstallments
    })

    return messages.credit_mode.mode_switch_cancelled
  }

  // Execute mode switch
  const cleanupInstallments = choice === 'payoff'
  const result = await switchMode(
    context.paymentMethodId,
    userId,
    context.targetMode,
    cleanupInstallments
  )

  if (result.success) {
    // Track analytics
    await trackEvent(userId, 'credit_mode_switched', {
      paymentMethodId: context.paymentMethodId,
      previousMode: context.currentMode ? 'credit' : 'simple',
      newMode: context.targetMode ? 'credit' : 'simple',
      hadActiveInstallments: true,
      installmentsCleanedUp: cleanupInstallments,
      channel: 'whatsapp'
    })

    // Return appropriate confirmation message
    if (cleanupInstallments) {
      return messages.credit_mode.mode_switched_payoff(context.activeInstallments)
    } else {
      return messages.credit_mode.mode_switched_keep
    }
  } else {
    logger.error('[mode-switch] Failed to switch mode:', result.error)
    return 'Erro ao alterar modo. Por favor, tente novamente.'
  }
}
