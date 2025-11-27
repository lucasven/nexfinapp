/**
 * Goodbye Handler
 *
 * Processes user responses to goodbye/self-select messages.
 * Handles the 3 response options:
 * 1. "I'm confused" → transition to help_flow, reset tiers, then to active
 * 2. "Just busy" → transition to remind_later, schedule reminder 14d
 * 3. "All good" → transition to dormant
 *
 * Non-matching responses transition back to active and continue normal processing.
 *
 * Epic: 4 - Engagement State Machine
 * Story: 4.4 - Goodbye Response Processing
 *
 * AC-4.4.1: Response "1" (confused) triggers transition to help_flow, sends help message, restarts Tier 1 hints, then transitions to active
 * AC-4.4.2: Response "2" (busy) triggers transition to remind_later, sets remind_at = now() + 14 days, sends confirmation message
 * AC-4.4.3: Response "3" (all good) triggers transition to dormant, sends confirmation message
 * AC-4.4.4: Non-matching responses (other text) trigger transition to active and process the message normally through existing handlers
 * AC-4.4.5: Responses match via simple regex including number emoji variants (1, 1️⃣, "confuso", "confused", etc.)
 * AC-4.4.6: All response confirmations are localized (pt-BR and en) and follow tone guidelines
 */

import { logger } from '../../services/monitoring/logger.js'
import { getSupabaseClient } from '../../services/database/supabase-client.js'
import { transitionState, getEngagementState } from '../../services/engagement/state-machine.js'
import { queueMessage } from '../../services/scheduler/message-sender.js'
import { getMessageDestination } from '../../services/engagement/message-router.js'
import { trackEvent } from '../../analytics/index.js'
import type { MessageType } from '../../services/engagement/types.js'

// =============================================================================
// Types
// =============================================================================

/**
 * Type of goodbye response detected
 * - confused: User needs help, restart onboarding
 * - busy: User is busy, remind later
 * - all_good: User is done, go dormant
 */
export type GoodbyeResponseType = 'confused' | 'busy' | 'all_good'

export interface GoodbyeResponse {
  userId: string
  responseOption: 1 | 2 | 3
  messageContext?: Record<string, unknown>
}

export interface GoodbyeResult {
  success: boolean
  newState?: string
  message?: string
  error?: string
  shouldProcessNormally?: boolean
}

export interface ProcessGoodbyeContext {
  userId: string
  locale: 'pt-BR' | 'en'
  engagementStateId?: string
  goodbyeSentAt?: Date
}

// =============================================================================
// Response Pattern Matching (AC-4.4.5)
// =============================================================================

/**
 * Regex patterns for detecting goodbye responses
 * Matches: number, emoji, Portuguese keyword, English keyword
 */
const RESPONSE_PATTERNS: Record<GoodbyeResponseType, RegExp> = {
  confused: /^(1|1️⃣|confuso|confused)$/i,
  busy: /^(2|2️⃣|ocupado|busy)$/i,
  all_good: /^(3|3️⃣|tudo\s*certo|all\s*good)$/i,
}

/**
 * Check if a message is a goodbye response (AC-4.4.5)
 *
 * @param messageText - The incoming message text
 * @returns The response type or null if not a goodbye response
 *
 * Pattern matching is:
 * - Case-insensitive
 * - Whitespace-trimmed
 * - Matches numbers (1, 2, 3), emoji variants (1️⃣, 2️⃣, 3️⃣), and keywords
 */
export function isGoodbyeResponse(messageText: string): GoodbyeResponseType | null {
  const trimmed = messageText.trim()

  for (const [type, pattern] of Object.entries(RESPONSE_PATTERNS)) {
    if (pattern.test(trimmed)) {
      logger.debug('Goodbye response pattern matched', {
        messageText: trimmed,
        responseType: type,
      })
      return type as GoodbyeResponseType
    }
  }

  return null
}

/**
 * Legacy function - maps to new isGoodbyeResponse
 * Kept for backward compatibility with existing index.ts exports
 */
export function parseGoodbyeResponse(messageText: string): 1 | 2 | 3 | null {
  const responseType = isGoodbyeResponse(messageText)

  if (!responseType) {
    return null
  }

  const typeToNumber: Record<GoodbyeResponseType, 1 | 2 | 3> = {
    confused: 1,
    busy: 2,
    all_good: 3,
  }

  return typeToNumber[responseType]
}

// =============================================================================
// Main Handler Functions
// =============================================================================

/**
 * Process a goodbye response from a user (AC-4.4.1 through AC-4.4.4)
 *
 * @param userId - The user's ID
 * @param responseType - The detected response type
 * @param locale - User's locale for localized messages
 * @returns Result with confirmation message or error
 */
export async function processGoodbyeResponse(
  userId: string,
  responseType: GoodbyeResponseType,
  locale: 'pt-BR' | 'en' = 'pt-BR'
): Promise<GoodbyeResult> {
  logger.info('Processing goodbye response', {
    userId,
    responseType,
    locale,
  })

  try {
    // Verify user is in goodbye_sent state
    const currentState = await getEngagementState(userId)
    if (currentState !== 'goodbye_sent') {
      logger.warn('User not in goodbye_sent state, processing as normal message', {
        userId,
        currentState,
        responseType,
      })
      return {
        success: true,
        shouldProcessNormally: true,
        newState: currentState,
      }
    }

    // Calculate days since goodbye was sent for analytics
    const daysSinceGoodbye = await calculateDaysSinceGoodbye(userId)

    // Track analytics event
    trackEvent(
      'engagement_goodbye_response',
      userId,
      {
        response_type: responseType,
        days_since_goodbye: daysSinceGoodbye,
      }
    )

    // Process based on response type
    switch (responseType) {
      case 'confused':
        return handleConfusedResponse(userId, locale, daysSinceGoodbye)
      case 'busy':
        return handleBusyResponse(userId, locale, daysSinceGoodbye)
      case 'all_good':
        return handleAllGoodResponse(userId, locale, daysSinceGoodbye)
      default:
        logger.error('Unknown response type', { userId, responseType })
        return {
          success: false,
          error: `Unknown response type: ${responseType}`,
        }
    }
  } catch (error) {
    logger.error('Error processing goodbye response', { userId, responseType }, error as Error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Legacy handler function - maps to new processGoodbyeResponse
 * Kept for backward compatibility
 */
export async function handleGoodbyeResponse(
  response: GoodbyeResponse
): Promise<GoodbyeResult> {
  const responseTypeMap: Record<1 | 2 | 3, GoodbyeResponseType> = {
    1: 'confused',
    2: 'busy',
    3: 'all_good',
  }

  const responseType = responseTypeMap[response.responseOption]
  // Default to pt-BR for legacy calls
  return processGoodbyeResponse(response.userId, responseType, 'pt-BR')
}

// =============================================================================
// Response-Specific Handlers
// =============================================================================

/**
 * Handle "confused" response (Option 1) - AC-4.4.1
 *
 * 1. Transition to help_flow state
 * 2. Reset onboarding progress (tier, progress, re-enable tips)
 * 3. Queue help restart message
 * 4. Immediately transition to active state
 */
async function handleConfusedResponse(
  userId: string,
  locale: 'pt-BR' | 'en',
  daysSinceGoodbye: number
): Promise<GoodbyeResult> {
  logger.info('Handling confused response (Option 1)', { userId })

  try {
    // Step 1: Transition to help_flow
    const helpFlowResult = await transitionState(userId, 'goodbye_response_1', {
      response_type: 'confused',
      days_since_goodbye: daysSinceGoodbye,
    })

    if (!helpFlowResult.success) {
      logger.error('Failed to transition to help_flow', {
        userId,
        error: helpFlowResult.error,
      })
      return {
        success: false,
        error: helpFlowResult.error || 'Failed to transition to help_flow',
      }
    }

    // Step 2: Reset onboarding progress
    await resetOnboardingProgress(userId)

    // Step 3: Queue help restart message
    await queueHelpRestartMessage(userId, locale)

    // Step 4: Immediately transition to active (help_flow is transient)
    const activeResult = await transitionState(userId, 'user_message', {
      from_help_flow: true,
    })

    if (!activeResult.success) {
      logger.warn('Failed to transition from help_flow to active', {
        userId,
        error: activeResult.error,
      })
      // Continue anyway - user got the help message
    }

    // Return localized confirmation message
    const message = locale === 'en'
      ? "No problem! Let me help you get started again. I'll send you some tips over the next few days. How about logging an expense? E.g., 'spent 50 on lunch'"
      : "Sem problemas! Vou te ajudar a começar de novo. Vou te mandar algumas dicas nos próximos dias. Que tal começar registrando uma despesa? Ex: 'gastei 50 no almoço'"

    logger.info('Confused response handled successfully', { userId })

    return {
      success: true,
      newState: 'active',
      message,
    }
  } catch (error) {
    logger.error('Error handling confused response', { userId }, error as Error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Handle "busy" response (Option 2) - AC-4.4.2
 *
 * 1. Transition to remind_later state (sets remind_at = now + 14 days)
 */
async function handleBusyResponse(
  userId: string,
  locale: 'pt-BR' | 'en',
  daysSinceGoodbye: number
): Promise<GoodbyeResult> {
  logger.info('Handling busy response (Option 2)', { userId })

  try {
    // Transition to remind_later (state machine handles remind_at timestamp)
    const result = await transitionState(userId, 'goodbye_response_2', {
      response_type: 'busy',
      days_since_goodbye: daysSinceGoodbye,
    })

    if (!result.success) {
      logger.error('Failed to transition to remind_later', {
        userId,
        error: result.error,
      })
      return {
        success: false,
        error: result.error || 'Failed to transition to remind_later',
      }
    }

    // Return localized confirmation message
    const message = locale === 'en'
      ? "Got it! See you in 2 weeks. I'll be here if you need anything in the meantime."
      : 'Entendido! Te vejo daqui a 2 semanas. Enquanto isso, fico aqui se precisar de algo.'

    logger.info('Busy response handled successfully', { userId })

    return {
      success: true,
      newState: 'remind_later',
      message,
    }
  } catch (error) {
    logger.error('Error handling busy response', { userId }, error as Error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Handle "all good" response (Option 3) - AC-4.4.3
 *
 * 1. Transition to dormant state
 */
async function handleAllGoodResponse(
  userId: string,
  locale: 'pt-BR' | 'en',
  daysSinceGoodbye: number
): Promise<GoodbyeResult> {
  logger.info('Handling all good response (Option 3)', { userId })

  try {
    // Transition to dormant
    const result = await transitionState(userId, 'goodbye_response_3', {
      response_type: 'all_good',
      days_since_goodbye: daysSinceGoodbye,
    })

    if (!result.success) {
      logger.error('Failed to transition to dormant', {
        userId,
        error: result.error,
      })
      return {
        success: false,
        error: result.error || 'Failed to transition to dormant',
      }
    }

    // Return localized confirmation message
    const message = locale === 'en'
      ? 'All good! The door is always open. Just send a message whenever you want to come back.'
      : 'Tudo certo! A porta está sempre aberta. Manda uma mensagem quando quiser voltar.'

    logger.info('All good response handled successfully', { userId })

    return {
      success: true,
      newState: 'dormant',
      message,
    }
  } catch (error) {
    logger.error('Error handling all good response', { userId }, error as Error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Reset onboarding progress for confused users
 *
 * - Sets onboarding_tier to 0
 * - Clears tier progress
 * - Re-enables onboarding tips
 */
async function resetOnboardingProgress(userId: string): Promise<void> {
  const supabase = getSupabaseClient()

  logger.info('Resetting onboarding progress', { userId })

  try {
    const { error } = await supabase
      .from('user_profiles')
      .update({
        onboarding_tier: 0,
        onboarding_tier_progress: {},
        onboarding_tips_enabled: true,
      })
      .eq('id', userId)

    if (error) {
      logger.error('Failed to reset onboarding progress', { userId }, error)
      throw error
    }

    logger.info('Onboarding progress reset successfully', { userId })
  } catch (error) {
    logger.error('Error resetting onboarding progress', { userId }, error as Error)
    throw error
  }
}

/**
 * Queue help restart message for confused users
 */
async function queueHelpRestartMessage(userId: string, locale: 'pt-BR' | 'en'): Promise<void> {
  try {
    const destination = await getMessageDestination(userId)

    if (!destination) {
      logger.warn('Cannot queue help restart message: no destination found', { userId })
      return
    }

    await queueMessage({
      userId,
      messageType: 'help_restart' as MessageType,
      messageKey: 'engagement.help_restart',
      messageParams: { locale },
      destination: destination.destination,
      destinationJid: destination.destinationJid,
    })

    logger.info('Help restart message queued', { userId, locale })
  } catch (error) {
    logger.error('Error queueing help restart message', { userId }, error as Error)
    // Don't throw - message queueing is best-effort
  }
}

/**
 * Calculate days since goodbye message was sent
 */
async function calculateDaysSinceGoodbye(userId: string): Promise<number> {
  const supabase = getSupabaseClient()

  try {
    const { data, error } = await supabase
      .from('user_engagement_states')
      .select('goodbye_sent_at')
      .eq('user_id', userId)
      .single()

    if (error || !data?.goodbye_sent_at) {
      return 0
    }

    const goodbyeSentAt = new Date(data.goodbye_sent_at)
    const now = new Date()
    const diffMs = now.getTime() - goodbyeSentAt.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    return diffDays
  } catch (error) {
    logger.error('Error calculating days since goodbye', { userId }, error as Error)
    return 0
  }
}

/**
 * Check if user is in goodbye_sent state and handle response appropriately
 *
 * This is the main entry point for the text handler integration.
 * Returns the confirmation message if it was a goodbye response,
 * or null if the message should be processed normally.
 *
 * @param userId - The user's ID
 * @param messageText - The incoming message text
 * @param locale - User's locale
 * @returns Confirmation message or null
 */
export async function checkAndHandleGoodbyeResponse(
  userId: string,
  messageText: string,
  locale: 'pt-BR' | 'en' = 'pt-BR'
): Promise<string | null> {
  // First check if user is in goodbye_sent state
  const currentState = await getEngagementState(userId)

  if (currentState !== 'goodbye_sent') {
    // Not in goodbye_sent state, let normal processing continue
    return null
  }

  logger.info('User in goodbye_sent state, checking for goodbye response', {
    userId,
    messageText: messageText.substring(0, 50),
  })

  // Check if this is a goodbye response
  const responseType = isGoodbyeResponse(messageText)

  if (!responseType) {
    // Not a goodbye response - transition to active and let normal processing continue
    logger.info('Non-goodbye response from user in goodbye_sent state, transitioning to active', {
      userId,
    })

    await transitionState(userId, 'user_message', {
      from_goodbye_sent: true,
      non_response_text: true,
    })

    // Return null to indicate normal processing should continue
    return null
  }

  // Process the goodbye response
  const result = await processGoodbyeResponse(userId, responseType, locale)

  if (!result.success) {
    logger.error('Failed to process goodbye response', {
      userId,
      responseType,
      error: result.error,
    })
    // Return a generic error message
    return locale === 'en'
      ? 'Sorry, something went wrong. Please try again.'
      : 'Desculpa, algo deu errado. Tente novamente.'
  }

  return result.message || null
}
