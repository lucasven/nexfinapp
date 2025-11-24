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
 * @param context - Information about the opt-out request
 * @returns Result indicating success and new preference state
 *
 * TODO: Implement in Epic 6 (Story 6.1)
 * - Update user_profiles.reengagement_opt_out
 * - Send confirmation message
 * - Track in analytics
 */
export async function handleOptOutCommand(
  context: OptOutContext
): Promise<OptOutResult> {
  logger.info('Opt-out handler called (stub)', {
    userId: context.userId,
    command: context.command,
  })

  // Stub implementation - will be completed in Epic 6
  return {
    success: false,
    previousState: false,
    newState: false,
    confirmationSent: false,
    error: 'Not implemented - see Epic 6, Story 6.1',
  }
}

/**
 * Check if a message is an opt-out or opt-in command for RE-ENGAGEMENT
 *
 * @param messageText - The incoming message text
 * @param locale - User's locale for command matching
 * @returns The command type or null if not a preference command
 *
 * TODO: Implement in Epic 6 (Story 6.1)
 */
export function parseOptOutCommand(
  messageText: string,
  locale: 'pt-BR' | 'en'
): 'opt_out' | 'opt_in' | null {
  logger.debug('Parsing opt-out command (stub)', { messageText, locale })

  // Stub implementation - will be completed in Epic 6
  return null
}

/**
 * Get user's current opt-out preference for RE-ENGAGEMENT
 *
 * @param userId - The user's ID
 * @returns True if user has opted out of re-engagement
 *
 * TODO: Implement in Epic 6 (Story 6.4)
 */
export async function isOptedOut(userId: string): Promise<boolean> {
  logger.debug('Checking opt-out status (stub)', { userId })

  // Stub implementation - will be completed in Epic 6
  return false
}
