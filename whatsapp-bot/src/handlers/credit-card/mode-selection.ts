/**
 * Credit Mode Selection Handler (WhatsApp)
 *
 * Handles the conversational flow for credit mode vs simple mode selection.
 * Triggered when a user adds their first credit card transaction and needs to choose
 * how they want to track their credit card.
 *
 * Story: 1-3-credit-mode-vs-simple-mode-selection-whatsapp
 * Acceptance Criteria: AC3.1, AC3.2, AC3.3, AC3.4
 */

import { getSupabaseClient } from '../../services/database/supabase-client.js'
import {
  getPendingTransactionContext,
  clearPendingTransactionContext,
  PendingTransactionContext
} from '../../services/conversation/pending-transaction-state.js'
import { getUserLocale, getMessages } from '../../localization/i18n.js'
import { trackEvent } from '../../analytics/tracker.js'
import { logger } from '../../services/monitoring/logger.js'

/**
 * Parse user response to determine mode choice
 *
 * Valid inputs for Credit Mode: "1", "crédito", "credit", "modo crédito", "credit mode"
 * Valid inputs for Simple Mode: "2", "simples", "simple", "modo simples", "simple mode"
 *
 * @param message - User's response message
 * @returns 'credit' | 'simple' | null (null = invalid input)
 */
function parseModeChoice(message: string): 'credit' | 'simple' | null {
  const normalized = message.toLowerCase().trim()

  // Option 1: Credit Mode
  if (
    normalized === '1' ||
    normalized.includes('crédito') ||
    normalized.includes('credit') ||
    normalized.includes('modo crédito') ||
    normalized.includes('credit mode')
  ) {
    return 'credit'
  }

  // Option 2: Simple Mode
  if (
    normalized === '2' ||
    normalized.includes('simples') ||
    normalized.includes('simple') ||
    normalized.includes('modo simples') ||
    normalized.includes('simple mode')
  ) {
    return 'simple'
  }

  // Invalid input
  return null
}

/**
 * Update payment method with selected credit mode
 *
 * @param paymentMethodId - Payment method UUID
 * @param userId - User UUID
 * @param creditMode - True for Credit Mode, False for Simple Mode
 * @returns Success status
 */
async function updateCreditMode(
  paymentMethodId: string,
  userId: string,
  creditMode: boolean
): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabaseClient()

  try {
    const { error } = await supabase
      .from('payment_methods')
      .update({ credit_mode: creditMode })
      .eq('id', paymentMethodId)
      .eq('user_id', userId)
      .is('credit_mode', null) // Safety check: only update if not yet set

    if (error) {
      logger.error('Error updating credit mode', {
        paymentMethodId,
        userId,
        creditMode
      }, error)
      return { success: false, error: error.message }
    }

    logger.info('Credit mode updated successfully', {
      paymentMethodId,
      userId,
      creditMode
    })

    return { success: true }
  } catch (error) {
    logger.error('Unexpected error updating credit mode', {
      paymentMethodId,
      userId,
      creditMode
    }, error as Error)
    return { success: false, error: 'Unexpected error' }
  }
}

/**
 * Create transaction from pending context
 *
 * @param userId - User UUID
 * @param context - Pending transaction context
 * @returns Transaction ID or null if failed
 */
async function createTransactionFromPending(
  userId: string,
  context: PendingTransactionContext
): Promise<{ success: boolean; transactionId?: string; error?: string }> {
  const supabase = getSupabaseClient()

  try {
    // Generate user-readable transaction ID
    const { data: idData, error: idError } = await supabase.rpc('generate_transaction_id')

    if (idError) {
      logger.error('Error generating transaction ID', { userId }, idError)
      return { success: false, error: idError.message }
    }

    const userReadableId = idData

    // Create transaction
    const { data, error } = await supabase
      .from('transactions')
      .insert({
        user_id: userId,
        payment_method_id: context.paymentMethodId,
        amount: context.amount,
        category_id: context.categoryId || null,
        description: context.description || null,
        date: context.date,
        type: context.transactionType,
        user_readable_id: userReadableId
      })
      .select('id')
      .single()

    if (error) {
      logger.error('Error creating transaction from pending context', {
        userId,
        paymentMethodId: context.paymentMethodId
      }, error)
      return { success: false, error: error.message }
    }

    logger.info('Transaction created from pending context', {
      userId,
      transactionId: data.id,
      userReadableId,
      paymentMethodId: context.paymentMethodId
    })

    return { success: true, transactionId: data.id }
  } catch (error) {
    logger.error('Unexpected error creating transaction from pending context', {
      userId
    }, error as Error)
    return { success: false, error: 'Unexpected error' }
  }
}

/**
 * Handle credit mode selection flow
 *
 * Main handler for mode selection conversational flow.
 * Parses user response, updates database, confirms transaction, tracks analytics.
 *
 * @param message - User's message/response
 * @param whatsappNumber - User's WhatsApp number (for conversation state)
 * @param userId - User UUID (for database operations)
 * @returns Response message to send to user
 */
export async function handleModeSelection(
  message: string,
  whatsappNumber: string,
  userId: string
): Promise<string> {
  const startTime = performance.now()

  try {
    // Get pending transaction context
    const context = getPendingTransactionContext(whatsappNumber)

    if (!context) {
      logger.warn('No pending transaction context found for mode selection', {
        whatsappNumber,
        userId
      })
      // No pending transaction - user may have timed out or context was cleared
      // Return generic error or guide user to start again
      const locale = await getUserLocale(userId)
      const messages = getMessages(locale)
      return 'Não encontrei uma transação pendente. Por favor, adicione sua despesa novamente.'
    }

    // Get user locale for localized messages
    const locale = await getUserLocale(userId)
    const messages = getMessages(locale)

    // Parse mode choice from user response
    const choice = parseModeChoice(message)

    if (!choice) {
      // Invalid input - send clarification prompt (AC3.4)
      logger.info('Invalid mode selection input', {
        whatsappNumber,
        userId,
        message: message.substring(0, 50) // Log first 50 chars only
      })
      return messages.credit_mode.invalid_input
    }

    const creditMode = choice === 'credit'

    // Update payment method with selected mode (AC3.2, AC3.3)
    const updateResult = await updateCreditMode(
      context.paymentMethodId,
      userId,
      creditMode
    )

    if (!updateResult.success) {
      logger.error('Failed to update credit mode', {
        whatsappNumber,
        userId,
        paymentMethodId: context.paymentMethodId,
        error: updateResult.error
      })
      // Return user-friendly error message (Edge Case 3)
      return 'Algo deu errado. Por favor, tente novamente.'
    }

    // Create transaction from pending context (AC3.2, AC3.3)
    const transactionResult = await createTransactionFromPending(userId, context)

    if (!transactionResult.success) {
      logger.error('Failed to create transaction after mode selection', {
        whatsappNumber,
        userId,
        paymentMethodId: context.paymentMethodId,
        error: transactionResult.error
      })
      // Mode was set, but transaction failed - user can retry (Edge Case 4)
      return 'Modo atualizado, mas não consegui criar a transação. Por favor, adicione sua despesa novamente.'
    }

    // Clear conversation state (AC3.2, AC3.3)
    clearPendingTransactionContext(whatsappNumber)

    // Track analytics event (AC3.2, AC3.3)
    // Fire-and-forget - does not block user flow
    trackEvent(
      'credit_mode_selected',
      userId,
      {
        paymentMethodId: context.paymentMethodId,
        mode: choice,
        channel: 'whatsapp',
        locale: locale,
        transactionId: transactionResult.transactionId
      }
    )

    // Calculate total flow time (Performance Target: < 1 second)
    const duration = performance.now() - startTime
    if (duration > 1000) {
      logger.warn('Mode selection flow exceeded 1 second', {
        userId,
        durationMs: Math.round(duration)
      })
    } else {
      logger.info('Mode selection flow completed', {
        userId,
        mode: choice,
        durationMs: Math.round(duration)
      })
    }

    // Return confirmation message (AC3.2, AC3.3)
    if (creditMode) {
      return messages.credit_mode.confirmation_credit
    } else {
      return messages.credit_mode.confirmation_simple
    }
  } catch (error) {
    logger.error('Unexpected error in handleModeSelection', {
      whatsappNumber,
      userId
    }, error as Error)
    return 'Algo deu errado. Por favor, tente novamente.'
  }
}

/**
 * Send mode selection prompt to user
 *
 * Sends the initial prompt explaining Credit Mode vs Simple Mode options.
 * Called when needsCreditModeSelection() returns true.
 *
 * @param userId - User UUID
 * @returns Prompt message to send to user
 */
export async function sendModeSelectionPrompt(userId: string): Promise<string> {
  try {
    const locale = await getUserLocale(userId)
    const messages = getMessages(locale)

    logger.info('Sending mode selection prompt', { userId, locale })

    return messages.credit_mode.selection_prompt
  } catch (error) {
    logger.error('Error sending mode selection prompt', { userId }, error as Error)
    // Fallback to Portuguese (default)
    const messages = getMessages('pt-br')
    return messages.credit_mode.selection_prompt
  }
}
