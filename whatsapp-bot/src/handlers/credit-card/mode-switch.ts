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
import { getUserSession } from '../../auth/session-manager.js'
import { ParsedIntent } from '../../types.js'

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
    logger.error('[mode-switch] Unexpected error checking installments:', error instanceof Error ? error : new Error(String(error)))
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
    logger.error('[mode-switch] Unexpected error during mode switch:', error instanceof Error ? error : new Error(String(error)))
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
  const messages = getMessages(locale as 'pt-br' | 'en')
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
      return messages.credit_mode.switch_warning?.(activeInstallments) || 'Warning: You have active installments.'
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

    const modeString = targetMode ? 'credit' : 'simple'
    return messages.credit_mode.mode_switched_success?.(paymentMethodName, modeString as 'credit' | 'simple') || 'Mode switched successfully.'
  } else {
    logger.error('[mode-switch] Failed to switch mode:', { error: result.error })
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
  const messages = getMessages(locale as 'pt-br' | 'en')

  // Get conversation state
  const state = await getConversationState(userId, 'mode_switch_confirm')

  if (!state) {
    logger.warn('[mode-switch] No conversation state found for user:', { userId })
    return 'Erro: Contexto não encontrado. Por favor, tente novamente.'
  }

  const context = state as ModeSwitchContext

  // Parse user's choice
  const choice = parseWarningChoice(message)

  if (!choice) {
    // Invalid input - prompt again
    return messages.credit_mode.invalid_switch_option || 'Invalid option. Please try again.'
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

    return messages.credit_mode.mode_switch_cancelled || 'Mode switch cancelled.'
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
    const modeString = context.targetMode ? 'credit' : 'simple'
    const successMessage = messages.credit_mode.mode_switched_success?.(context.paymentMethodName, modeString as 'credit' | 'simple') || 'Mode switched successfully.'

    if (cleanupInstallments) {
      const payoffMessage = messages.credit_mode.mode_switched_payoff?.(context.activeInstallments) || 'Installments paid off.'
      return `${successMessage}\n\n${payoffMessage}`
    } else {
      const keepMessage = messages.credit_mode.mode_switched_keep || 'Active installments will continue.'
      return `${successMessage}\n\n${keepMessage}`
    }
  } else {
    logger.error('[mode-switch] Failed to switch mode:', { error: result.error })
    return 'Erro ao alterar modo. Por favor, tente novamente.'
  }
}

/**
 * Handle credit mode switch request from AI intent
 *
 * Main entry point for credit mode switching via WhatsApp.
 * Handles card selection for multi-card users.
 *
 * @param whatsappNumber - User's WhatsApp number
 * @param intent - Parsed intent from AI with targetMode and optional paymentMethodName
 * @returns Response message
 */
export async function handleModeSwitchRequest(
  whatsappNumber: string,
  intent: ParsedIntent
): Promise<string> {
  try {
    const session = await getUserSession(whatsappNumber)
    if (!session) {
      return 'Você precisa estar autenticado para usar este comando.'
    }

    const locale = await getUserLocale(session.userId)
    const messages = getMessages(locale as 'pt-br' | 'en')

    const { targetMode, paymentMethodName } = intent.entities

    // Validate target mode
    if (!targetMode || (targetMode !== 'credit' && targetMode !== 'simple')) {
      logger.warn('[mode-switch] Invalid target mode', { userId: session.userId, targetMode })
      return 'Erro: Modo inválido. Use "crédito" ou "simples".'
    }

    const targetModeBoolean = targetMode === 'credit'

    // Fetch user's credit cards
    const supabase = getSupabaseClient()
    const { data: creditCards, error: pmError } = await supabase
      .from('payment_methods')
      .select('id, name, credit_mode')
      .eq('user_id', session.userId)
      .eq('type', 'credit')

    if (pmError) {
      logger.error('[mode-switch] Error fetching payment methods', { userId: session.userId }, pmError)
      return messages.genericError
    }

    // Scenario 1: No credit cards
    if (!creditCards || creditCards.length === 0) {
      logger.info('[mode-switch] User has no credit cards', { userId: session.userId })
      return locale === 'pt-br'
        ? 'Você não tem nenhum cartão de crédito cadastrado. Cadastre um cartão primeiro no app web.'
        : 'You have no credit cards registered. Please add a credit card first in the web app.'
    }

    // Scenario 2: Single credit card - auto-select
    if (creditCards.length === 1) {
      const card = creditCards[0]

      logger.info('[mode-switch] Auto-selected single credit card', {
        userId: session.userId,
        paymentMethodId: card.id,
        currentMode: card.credit_mode,
        targetMode: targetModeBoolean
      })

      return await initiateModeSwitchFlow(
        session.userId,
        card.id,
        card.name,
        card.credit_mode,
        locale
      )
    }

    // Scenario 3: Multiple credit cards - need selection
    // If paymentMethodName provided, try to find matching card
    if (paymentMethodName) {
      const matchedCard = creditCards.find(card =>
        card.name.toLowerCase().includes(paymentMethodName.toLowerCase()) ||
        paymentMethodName.toLowerCase().includes(card.name.toLowerCase())
      )

      if (matchedCard) {
        logger.info('[mode-switch] Matched card by name', {
          userId: session.userId,
          paymentMethodName,
          matchedCardId: matchedCard.id
        })

        return await initiateModeSwitchFlow(
          session.userId,
          matchedCard.id,
          matchedCard.name,
          matchedCard.credit_mode,
          locale
        )
      }
    }

    // Store pending context for card selection
    await setConversationState(session.userId, 'mode_switch_select', {
      targetMode: targetModeBoolean,
      creditCards: creditCards.map(card => ({
        id: card.id,
        name: card.name,
        currentMode: card.credit_mode
      })),
      locale
    })

    // Format card selection prompt
    const cardList = creditCards
      .map((card, index) => {
        const modeLabel = card.credit_mode
          ? (locale === 'pt-br' ? 'Modo Crédito' : 'Credit Mode')
          : (locale === 'pt-br' ? 'Modo Simples' : 'Simple Mode')
        return `(${index + 1}) ${card.name} - ${modeLabel}`
      })
      .join('\n')

    return locale === 'pt-br'
      ? `Qual cartão você deseja alterar?\n\n${cardList}`
      : `Which card do you want to switch?\n\n${cardList}`

  } catch (error) {
    logger.error('[mode-switch] Error in handleModeSwitchRequest', { whatsappNumber }, error as Error)
    return 'Erro ao processar solicitação. Por favor, tente novamente.'
  }
}

/**
 * Handle user's card selection response
 *
 * Called when user has pending mode_switch_select state and responds with card choice.
 *
 * @param userId - User UUID
 * @param message - User's message (card number or name)
 * @param locale - User locale
 * @returns Response message
 */
export async function handleModeSwitchCardSelection(
  userId: string,
  message: string,
  locale: string
): Promise<string | null> {
  const state = await getConversationState(userId, 'mode_switch_select')

  if (!state) {
    return null // No pending selection
  }

  const { targetMode, creditCards } = state as {
    targetMode: boolean
    creditCards: Array<{ id: string; name: string; currentMode: boolean }>
    locale: string
  }

  // Try to parse as number (1, 2, 3, etc.)
  const cardIndex = parseInt(message.trim()) - 1

  let selectedCard: typeof creditCards[0] | undefined

  if (cardIndex >= 0 && cardIndex < creditCards.length) {
    selectedCard = creditCards[cardIndex]
  } else {
    // Try to match by name
    selectedCard = creditCards.find(card =>
      card.name.toLowerCase().includes(message.toLowerCase()) ||
      message.toLowerCase().includes(card.name.toLowerCase())
    )
  }

  if (!selectedCard) {
    // Invalid selection - prompt again
    return locale === 'pt-br'
      ? 'Cartão não encontrado. Por favor, escolha um número da lista ou digite o nome do cartão.'
      : 'Card not found. Please choose a number from the list or type the card name.'
  }

  // Clear pending state
  await clearConversationState(userId, 'mode_switch_select')

  // Initiate mode switch flow
  return await initiateModeSwitchFlow(
    userId,
    selectedCard.id,
    selectedCard.name,
    selectedCard.currentMode,
    locale
  )
}
