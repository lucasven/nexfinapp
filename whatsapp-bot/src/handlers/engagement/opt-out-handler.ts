/**
 * Opt-Out Handler
 *
 * Handles user requests to opt out of or back into:
 * 1. Onboarding tips (Story 3.5) - "parar dicas" / "stop tips"
 * 2. Re-engagement messages (Epic 6) - "parar" / "stop"
 *
 * IMPORTANT: Tips and re-engagement are SEPARATE settings!
 * - onboarding_tips_enabled: Controls tier celebrations, contextual hints
 * - reengagement_opt_out: Controls goodbye messages, weekly reviews
 *
 * Epic: 1 - Foundation & Message Infrastructure
 * Story: 3.5 - Skip Onboarding Command
 * Implementation: Epic 6 - User Preferences & Web Integration (re-engagement)
 */

import { logger } from '../../services/monitoring/logger.js'
import { getSupabaseClient } from '../../services/database/supabase-client.js'
import { trackEvent, WhatsAppAnalyticsEvent } from '../../analytics/index.js'
import { messages as ptBrMessages } from '../../localization/pt-br.js'
import { messages as enMessages } from '../../localization/en.js'

// =============================================================================
// Tip Command Patterns (Story 3.5)
// AC-3.5.5: Case-insensitive matching
// =============================================================================

/**
 * Patterns for disabling onboarding tips
 * AC-3.5.1: "parar dicas" or "stop tips" disables tips
 */
const DISABLE_TIP_PATTERNS = [
  /^parar\s*dicas$/i,
  /^stop\s*tips$/i,
  /^desativar\s*dicas$/i,
  /^disable\s*tips$/i,
]

/**
 * Patterns for enabling onboarding tips
 * AC-3.5.2: "ativar dicas" or "enable tips" re-enables tips
 */
const ENABLE_TIP_PATTERNS = [
  /^ativar\s*dicas$/i,
  /^enable\s*tips$/i,
  /^start\s*tips$/i,
  /^ligar\s*dicas$/i,
]

/**
 * Check if a message is a tip enable/disable command
 *
 * AC-3.5.1: "parar dicas" or "stop tips" → 'disable'
 * AC-3.5.2: "ativar dicas" or "enable tips" → 'enable'
 * AC-3.5.5: Case-insensitive matching
 *
 * @param messageText - The incoming message text
 * @returns 'disable' | 'enable' | null
 */
export function isTipCommand(messageText: string): 'disable' | 'enable' | null {
  const normalized = messageText.trim()

  // Check disable patterns
  if (DISABLE_TIP_PATTERNS.some((p) => p.test(normalized))) {
    return 'disable'
  }

  // Check enable patterns
  if (ENABLE_TIP_PATTERNS.some((p) => p.test(normalized))) {
    return 'enable'
  }

  return null
}

/**
 * Handle tip opt-out/opt-in command
 *
 * AC-3.5.1: Disable tips, sends confirmation
 * AC-3.5.2: Enable tips, sends confirmation
 * AC-3.5.4: Tip preference is separate from re-engagement opt-out
 *
 * @param userId - The user's ID
 * @param messageText - Raw message text
 * @param locale - User's preferred language
 * @returns Confirmation message or null if not a tip command
 */
export async function handleTipOptOut(
  userId: string,
  messageText: string,
  locale: 'pt-BR' | 'en'
): Promise<string | null> {
  const command = isTipCommand(messageText)

  if (!command) {
    return null
  }

  const supabase = getSupabaseClient()
  const newValue = command === 'enable'

  try {
    const { error } = await supabase
      .from('user_profiles')
      .update({ onboarding_tips_enabled: newValue })
      .eq('user_id', userId)

    if (error) {
      logger.error('Failed to update tip preference', { userId, command }, error)
      return locale === 'pt-BR'
        ? '❌ Erro ao atualizar preferência. Tente novamente.'
        : '❌ Error updating preference. Please try again.'
    }

    logger.info('Tip preference updated', { userId, command, newValue })

    // Return localized confirmation
    if (command === 'disable') {
      return locale === 'pt-BR'
        ? "✅ Dicas desativadas. Envie 'ativar dicas' para reativar."
        : "✅ Tips disabled. Send 'enable tips' to re-enable."
    } else {
      return locale === 'pt-BR'
        ? '✅ Dicas ativadas! Você receberá sugestões após ações.'
        : '✅ Tips enabled! You will receive suggestions after actions.'
    }
  } catch (error) {
    logger.error('Unexpected error in handleTipOptOut', { userId }, error as Error)
    return locale === 'pt-BR'
      ? '❌ Erro inesperado. Tente novamente.'
      : '❌ Unexpected error. Please try again.'
  }
}

// =============================================================================
// Re-engagement Opt-Out (Epic 6 - stub)
// =============================================================================

export interface OptOutContext {
  userId: string
  whatsappJid: string
  command: 'opt_out' | 'opt_in'
  locale: 'pt-BR' | 'en'
}

export interface OptOutResult {
  success: boolean
  previousState: boolean
  newState: boolean
  confirmationSent: boolean
  error?: string
}

/**
 * Process opt-out or opt-in command for RE-ENGAGEMENT (not tips!)
 *
 * AC-6.1.1: Updates user_profiles.reengagement_opt_out to true for opt-out
 * AC-6.1.2: Updates user_profiles.reengagement_opt_out to false for opt-in
 * AC-6.1.4: Idempotent - same value can be set multiple times without error
 * AC-6.1.5: Graceful error handling with user-friendly messages
 *
 * @param context - Information about the opt-out request
 * @returns Result indicating success and new preference state
 */
export async function handleOptOutCommand(
  context: OptOutContext
): Promise<OptOutResult> {
  const { userId, command, locale } = context
  const optOut = command === 'opt_out'
  const messages = locale === 'pt-BR' ? ptBrMessages : enMessages

  logger.info('Processing re-engagement opt-out/opt-in command', {
    userId,
    command,
    locale,
    reengagement_opt_out: optOut
  })

  try {
    const supabase = getSupabaseClient()

    // Get current state before update
    const { data: currentProfile, error: fetchError } = await supabase
      .from('user_profiles')
      .select('reengagement_opt_out')
      .eq('user_id', userId)
      .single()

    if (fetchError) {
      logger.error('Failed to fetch current opt-out state', {
        userId,
        command,
        error: fetchError
      })
      return {
        success: false,
        previousState: false,
        newState: false,
        confirmationSent: false,
        error: messages.engagementOptOutError
      }
    }

    const previousState = currentProfile?.reengagement_opt_out ?? false

    // AC-6.1.4: Update is idempotent - same value can be set multiple times
    const { error: updateError } = await supabase
      .from('user_profiles')
      .update({ reengagement_opt_out: optOut })
      .eq('user_id', userId)

    if (updateError) {
      logger.error('Failed to update reengagement_opt_out', {
        userId,
        command,
        error: updateError
      })
      return {
        success: false,
        previousState,
        newState: previousState,
        confirmationSent: false,
        error: messages.engagementOptOutError
      }
    }

    logger.info('Successfully updated reengagement_opt_out', {
      userId,
      previousState,
      newState: optOut
    })

    // AC-6.1.1, AC-6.1.2: Track PostHog event (don't fail if tracking fails)
    try {
      trackEvent(
        WhatsAppAnalyticsEvent.ENGAGEMENT_PREFERENCE_CHANGED,
        userId,
        {
          user_id: userId,
          preference: optOut ? 'opted_out' : 'opted_in',
          source: 'whatsapp',
          timestamp: new Date().toISOString()
        }
      )
    } catch (trackingError) {
      logger.warn('Failed to track PostHog event (non-critical)', {
        userId,
        error: trackingError
      })
    }

    // Return success with localized confirmation message
    return {
      success: true,
      previousState,
      newState: optOut,
      confirmationSent: true,
      error: undefined
    }
  } catch (error) {
    logger.error('Unexpected error in handleOptOutCommand', {
      userId,
      command,
      error
    })
    return {
      success: false,
      previousState: false,
      newState: false,
      confirmationSent: false,
      error: messages.engagementOptOutError
    }
  }
}

/**
 * Check if a message is an opt-out or opt-in command for RE-ENGAGEMENT
 *
 * AC-6.1.3: Generous pattern matching with includes() for natural language variations
 * Supports both pt-BR and English patterns regardless of user locale
 *
 * @param messageText - The incoming message text
 * @param locale - User's locale for command matching
 * @returns The command type or null if not a preference command
 */
export function parseOptOutCommand(
  messageText: string,
  locale: 'pt-BR' | 'en'
): 'opt_out' | 'opt_in' | null {
  const lowerText = messageText.toLowerCase().trim()

  // Opt-out patterns (pt-BR and English)
  // AC-6.1.1: "parar lembretes", "stop reminders"
  // AC-6.1.3: Variations like "cancelar notificações", "opt out", "unsubscribe"
  const optOutPatterns = [
    'parar lembretes',
    'parar reengajamento',
    'cancelar notificações',
    'cancelar notificacoes',
    'desativar lembretes',
    'opt out',
    'unsubscribe',
    'sair',
    'stop reminders',
    'disable notifications',
    'turn off reminders',
    'cancel notifications'
  ]

  // Opt-in patterns (pt-BR and English)
  // AC-6.1.2: "ativar lembretes", "start reminders"
  // AC-6.1.3: Variations like "quero notificações", "opt in", "subscribe"
  const optInPatterns = [
    'ativar lembretes',
    'ativar reengajamento',
    'quero notificações',
    'quero notificacoes',
    'enable notifications',
    'opt in',
    'subscribe',
    'entrar',
    'voltar lembretes',
    'start reminders',
    'turn on reminders',
    'resume notifications'
  ]

  // Check opt-out patterns first (more common)
  if (optOutPatterns.some(pattern => lowerText.includes(pattern))) {
    logger.debug('Opt-out intent detected', { messageText })
    return 'opt_out'
  }

  // Check opt-in patterns
  if (optInPatterns.some(pattern => lowerText.includes(pattern))) {
    logger.debug('Opt-in intent detected', { messageText })
    return 'opt_in'
  }

  // No match - not an opt-out/opt-in command
  return null
}

/**
 * Get user's current opt-out preference for RE-ENGAGEMENT
 *
 * @param userId - The user's ID
 * @returns True if user has opted out of re-engagement
 *
 * // TODO: This function returns false by default which may cause opted-out users
 * // to receive messages. Ensure calling code handles this appropriately until
 * // full implementation is complete. Track: Epic 6, Story 6.4
 */
export async function isOptedOut(userId: string): Promise<boolean> {
  const supabase = getSupabaseClient()

  try {
    const { data: profile, error } = await supabase
      .from('user_profiles')
      .select('reengagement_opt_out')
      .eq('user_id', userId)
      .maybeSingle()

    if (error) {
      logger.error('Error fetching opt-out status', { userId, error: error.message })
      // Default to false (not opted out) on error - safer to potentially send message
      // than to block all messages on database error
      return false
    }

    return profile?.reengagement_opt_out ?? false
  } catch (error) {
    logger.error('Unexpected error in isOptedOut', { userId }, error as Error)
    return false
  }
}
