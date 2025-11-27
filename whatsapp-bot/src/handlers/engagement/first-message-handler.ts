/**
 * First Message Handler
 *
 * Handles first-time user messages to trigger the conversational welcome flow.
 * Responds contextually based on whether the message is parseable as an expense.
 *
 * Epic: 2 - Conversation-First Welcome
 * Story: 2.2 - Conversational First Response
 */

import { logger } from '../../services/monitoring/logger.js'
import { parseIntent } from '../../nlp/intent-parser.js'
import type { ActivityCheckResult, MessageContext } from '../../services/engagement/activity-tracker.js'

// =============================================================================
// Interfaces for Story 2.2
// =============================================================================

/**
 * Response data from first message handling
 */
export interface FirstMessageResponse {
  message: string              // Localized response message
  isExpense: boolean           // True if message was parsed as expense
  shouldProcessExpense: boolean // True if expense should be processed by normal flow
  includesGuidance: boolean    // True if response includes guidance example (AC-2.3.1)
  expenseProcessed: boolean    // True if expense was processed (AC-2.3.2)
  expenseData?: {              // Present if isExpense is true
    amount: number
    category: string
    description?: string
  }
}

/**
 * Context for first message handling (extends MessageContext)
 */
export interface FirstMessageHandlerContext {
  userId: string
  pushName?: string
  messageText: string
  locale: 'pt-BR' | 'en'
  activityResult: ActivityCheckResult
}

// =============================================================================
// Legacy interfaces (kept for backward compatibility)
// =============================================================================

export interface FirstMessageContext {
  userId: string
  whatsappJid: string
  destination: 'individual' | 'group'
  messageText: string
  isFirstMessage: boolean
}

export interface FirstMessageResult {
  isFirstMessage: boolean
  welcomeMessageSent: boolean
  preferredDestinationSet: boolean
  error?: string
}

// =============================================================================
// Story 2.2: Conversational First Response
// =============================================================================

/**
 * Handle first message from a new user
 *
 * AC-2.2.1: If message is parseable as expense, acknowledge contextually with name
 * AC-2.2.2: If unparseable, respond warmly and guide toward expense example
 * AC-2.2.3: Integrates with checkAndRecordActivity() result
 * AC-2.2.4: Uses localized strings
 *
 * @param context - First message handler context
 * @param messages - Localization messages object
 * @returns Response with message and expense data
 */
export async function handleFirstMessage(
  context: FirstMessageHandlerContext,
  messages: {
    engagementFirstMessage: (contextualResponse: string | null) => string
    engagementFirstExpenseSuccess: string
    engagementGuideToFirstExpense: string
    engagementFirstExpenseCelebration?: (amount: string, category: string) => string
  }
): Promise<FirstMessageResponse> {
  const { userId, pushName, messageText, activityResult } = context

  logger.info('Handling first message', {
    userId,
    isFirstMessage: activityResult.isFirstMessage,
    hasName: !!pushName,
    messageLength: messageText.length,
  })

  // If not first message, this shouldn't have been called
  if (!activityResult.isFirstMessage) {
    logger.warn('handleFirstMessage called for non-first message', { userId })
    return {
      message: '',
      isExpense: false,
      shouldProcessExpense: false,
      includesGuidance: false,
      expenseProcessed: false,
    }
  }

  // Try to parse the message as an expense
  const parsedIntent = parseIntent(messageText)
  const isExpense = parsedIntent.action === 'add_expense' && parsedIntent.confidence >= 0.5

  logger.debug('First message intent parsed', {
    userId,
    action: parsedIntent.action,
    confidence: parsedIntent.confidence,
    isExpense,
  })

  // Format name for greeting (with leading space if present)
  const nameGreeting = pushName ? ` ${pushName}` : ''

  if (isExpense) {
    // AC-2.3.2: Parseable expense - acknowledge with celebration, NO redundant guidance
    // The expense will be processed by the normal flow, we add celebration context
    const amount = parsedIntent.entities?.amount as number
    const category = (parsedIntent.entities?.category as string) || 'despesa'

    // Use celebration message with interpolation if available, fallback to success message
    const contextualResponse = messages.engagementFirstExpenseCelebration
      ? messages.engagementFirstExpenseCelebration(
          `R$ ${amount.toFixed(2).replace('.', ',')}`,
          category
        )
      : messages.engagementFirstExpenseSuccess

    // Build welcome message with expense acknowledgment (NO guidance per AC-2.3.2)
    const welcomeMessage = buildWelcomeWithName(
      messages.engagementFirstMessage(contextualResponse),
      nameGreeting
    )

    logger.info('First message is expense - sending celebration (no guidance)', {
      userId,
      amount,
      category,
    })

    return {
      message: welcomeMessage,
      isExpense: true,
      shouldProcessExpense: true,
      includesGuidance: false, // AC-2.3.2: NO redundant guidance for expense
      expenseProcessed: false, // Will be true after transaction handler processes it
      expenseData: {
        amount,
        category,
        description: parsedIntent.entities?.description as string | undefined,
      },
    }
  }

  // AC-2.3.1: Unparseable content - warm welcome WITH guidance example
  const contextualResponse = messages.engagementGuideToFirstExpense
  const welcomeMessage = buildWelcomeWithName(
    messages.engagementFirstMessage(contextualResponse),
    nameGreeting
  )

  logger.info('First message unparseable - sending warm welcome with guide example', {
    userId,
  })

  return {
    message: welcomeMessage,
    isExpense: false,
    shouldProcessExpense: false,
    includesGuidance: true, // AC-2.3.1: Includes natural language expense example
    expenseProcessed: false,
  }
}

/**
 * Build welcome message with user's name injected
 *
 * Replaces the generic "Oi!" or "Hi!" with personalized greeting
 */
function buildWelcomeWithName(baseMessage: string, nameGreeting: string): string {
  // The localization already has "Oi!" or "Hi!" at the start
  // We want to add the name after the greeting
  // e.g., "Oi!" -> "Oi Lucas!" or "Hi!" -> "Hi Lucas!"

  if (!nameGreeting.trim()) {
    return baseMessage
  }

  // Replace common greeting patterns with personalized versions
  // pt-BR: "Oi!" -> "Oi Lucas!"
  // en: "Hi!" -> "Hi Lucas!"
  const patterns = [
    { pattern: /^Oi!/i, replacement: `Oi${nameGreeting}!` },
    { pattern: /^Hi!/i, replacement: `Hi${nameGreeting}!` },
    { pattern: /^Hello!/i, replacement: `Hello${nameGreeting}!` },
    { pattern: /^Hey!/i, replacement: `Hey${nameGreeting}!` },
  ]

  for (const { pattern, replacement } of patterns) {
    if (pattern.test(baseMessage)) {
      return baseMessage.replace(pattern, replacement)
    }
  }

  return baseMessage
}

/**
 * Check if this is a first message that should trigger welcome flow
 *
 * @param activityResult - Result from checkAndRecordActivity
 * @returns True if welcome flow should be triggered
 */
export function shouldTriggerWelcomeFlow(activityResult: ActivityCheckResult): boolean {
  return activityResult.isFirstMessage
}

// =============================================================================
// Legacy functions (stubs - kept for backward compatibility)
// =============================================================================

/**
 * @deprecated Use handleFirstMessage with FirstMessageHandlerContext instead
 */
export async function handleFirstMessageLegacy(
  context: FirstMessageContext
): Promise<FirstMessageResult> {
  logger.info('First message handler called (legacy stub)', {
    userId: context.userId,
    destination: context.destination,
  })

  return {
    isFirstMessage: false,
    welcomeMessageSent: false,
    preferredDestinationSet: false,
    error: 'Use handleFirstMessage with FirstMessageHandlerContext instead',
  }
}

/**
 * Check if user has completed their first successful action (magic moment)
 *
 * @param userId - The user's ID
 * @returns True if user has experienced magic moment
 *
 * TODO: Implement in Epic 2 (Story 2.5)
 */
export async function hasMagicMoment(userId: string): Promise<boolean> {
  logger.debug('Checking magic moment (stub)', { userId })

  // Stub implementation - will be completed in Story 2.5
  return false
}
