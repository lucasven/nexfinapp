/**
 * Statement Summary Handler
 *
 * Story 3.5: Pre-Statement Summary with Category Breakdown
 *
 * Handles "resumo da fatura" / "statement summary" WhatsApp requests
 * Shows current statement summary with category breakdown
 */

import { createClient } from '@supabase/supabase-js'
import { getUserSession } from '../../auth/session-manager.js'
import { getUserLocale } from '../../localization/i18n.js'
import { messages as ptBR } from '../../localization/pt-br.js'
import { messages as en } from '../../localization/en.js'
import { getStatementSummaryData } from '../../services/statement/statement-summary-service.js'
import { buildStatementSummaryMessage } from '../../services/statement/statement-summary-message-builder.js'
import { trackEvent } from '../../analytics/index.js'
import { WhatsAppAnalyticsEvent } from '../../analytics/events.js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

// Conversation state for multi-card selection
interface PendingStatementSummaryContext {
  type: 'pending_statement_summary'
  creditCards: Array<{ id: string; name: string }>
  locale: string
  createdAt: string
}

const pendingStatementSummaryState = new Map<string, PendingStatementSummaryContext>()
const STATE_TTL_MS = 5 * 60 * 1000 // 5 minutes

/**
 * Handle statement summary request
 * AC5.1: Statement Summary Request (WhatsApp)
 *
 * @param whatsappNumber - User's WhatsApp number
 * @param messageText - Optional message text for card selection
 * @returns WhatsApp message response
 */
export async function handleStatementSummaryRequest(
  whatsappNumber: string,
  messageText?: string
): Promise<string> {
  try {
    // 1. Check authentication
    const session = await getUserSession(whatsappNumber)
    if (!session) {
      return ptBR.notAuthenticated
    }

    const locale = await getUserLocale(session.userId)
    const messages = locale === 'pt-br' ? ptBR : en

    // 2. Check for pending card selection state
    const pendingContext = pendingStatementSummaryState.get(whatsappNumber)
    if (pendingContext && messageText) {
      return await handleCardSelection(whatsappNumber, session.userId, messageText, pendingContext, messages)
    }

    // 3. Get user's Credit Mode payment methods
    const { data: paymentMethods, error: pmError } = await supabase
      .from('payment_methods')
      .select('id, name, credit_mode, statement_closing_day')
      .eq('user_id', session.userId)
      .eq('credit_mode', true)
      .order('name', { ascending: true })

    if (pmError) {
      console.error('Error fetching payment methods:', pmError)
      return messages.statementSummary?.error || 'Error loading statement summary.'
    }

    // 4. Edge case: No credit cards
    if (!paymentMethods || paymentMethods.length === 0) {
      return messages.statementSummary?.noCards || 'No credit cards found.'
    }

    // 5. Edge case: Card without closing date
    const cardsWithoutClosingDate = paymentMethods.filter(pm => !pm.statement_closing_day)
    if (cardsWithoutClosingDate.length > 0) {
      return messages.statementSummary?.noClosingDate || 'Credit card has no closing date configured.'
    }

    // 6. Single card: Show summary immediately
    if (paymentMethods.length === 1) {
      return await fetchAndFormatSummary(
        session.userId,
        paymentMethods[0].id,
        locale,
        messages
      )
    }

    // 7. Multiple cards: Ask for selection
    const cardList = paymentMethods
      .map((pm, idx) => `${idx + 1}. ${pm.name}`)
      .join('\n')

    // Store pending state
    const context: PendingStatementSummaryContext = {
      type: 'pending_statement_summary',
      creditCards: paymentMethods.map(pm => ({ id: pm.id, name: pm.name })),
      locale,
      createdAt: new Date().toISOString()
    }
    pendingStatementSummaryState.set(whatsappNumber, context)

    // Auto-cleanup after TTL
    setTimeout(() => {
      pendingStatementSummaryState.delete(whatsappNumber)
    }, STATE_TTL_MS)

    return messages.statementSummary?.cardSelection(paymentMethods.length, cardList) || 'Select a card.'

  } catch (error: any) {
    console.error('Error handling statement summary request:', error)
    return ptBR.statementSummary?.error || 'Error loading statement summary.'
  }
}

/**
 * Handle card selection from user
 */
async function handleCardSelection(
  whatsappNumber: string,
  userId: string,
  messageText: string,
  context: PendingStatementSummaryContext,
  messages: any
): Promise<string> {
  // Parse selection (number or name)
  const selectedCard = parseCardSelection(messageText, context.creditCards)

  if (!selectedCard) {
    // Invalid selection
    const cardList = context.creditCards
      .map((card, idx) => `${idx + 1}. ${card.name}`)
      .join('\n')
    return messages.statementSummary.cardSelection(context.creditCards.length, cardList)
  }

  // Clear pending state
  pendingStatementSummaryState.delete(whatsappNumber)

  // Fetch and return summary
  return await fetchAndFormatSummary(
    userId,
    selectedCard.id,
    context.locale,
    messages
  )
}

/**
 * Parse card selection from user message
 */
function parseCardSelection(
  messageText: string,
  creditCards: Array<{ id: string; name: string }>
): { id: string; name: string } | null {
  const text = messageText.trim().toLowerCase()

  // Try parsing as number (1, 2, 3...)
  const numberMatch = text.match(/^(\d+)/)
  if (numberMatch) {
    const index = parseInt(numberMatch[1]) - 1
    if (index >= 0 && index < creditCards.length) {
      return creditCards[index]
    }
  }

  // Try matching by name (case-insensitive partial match)
  const matchedCard = creditCards.find(card =>
    card.name.toLowerCase().includes(text) || text.includes(card.name.toLowerCase())
  )

  return matchedCard || null
}

/**
 * Fetch statement summary and format message
 * AC5.2: Statement Summary Content (WhatsApp)
 */
async function fetchAndFormatSummary(
  userId: string,
  paymentMethodId: string,
  locale: string,
  messages: any
): Promise<string> {
  try {
    // Fetch summary data
    const summary = await getStatementSummaryData(userId, paymentMethodId)

    // Track analytics event (AC5.8)
    trackEvent(
      WhatsAppAnalyticsEvent.STATEMENT_SUMMARY_VIEWED,
      userId,
      {
        userId,
        paymentMethodId,
        paymentMethodName: summary.paymentMethodName,
        source: 'whatsapp',
        periodStart: summary.periodStart.toISOString(),
        periodEnd: summary.periodEnd.toISOString(),
        totalSpent: summary.totalSpent,
        budgetAmount: summary.monthlyBudget,
        budgetPercentage: summary.budgetPercentage,
        categoryCount: summary.categoryBreakdown.length,
        hasInstallments: summary.categoryBreakdown.some(cat => cat.includesInstallments),
        timestamp: new Date().toISOString()
      }
    )

    // Build and return message
    return buildStatementSummaryMessage(summary, locale)

  } catch (error: any) {
    console.error('Error fetching statement summary:', error)

    // Handle specific errors
    if (error.message.includes('not in Credit Mode')) {
      return messages.statementSummary.noCards
    }
    if (error.message.includes('closing date not set')) {
      return messages.statementSummary.noClosingDate
    }

    return messages.statementSummary.error
  }
}

/**
 * Clear pending state (for cleanup or cancellation)
 */
export function clearPendingStatementSummaryState(whatsappNumber: string): void {
  pendingStatementSummaryState.delete(whatsappNumber)
}

/**
 * Check if user has pending statement summary selection
 */
export function hasPendingStatementSummarySelection(whatsappNumber: string): boolean {
  return pendingStatementSummaryState.has(whatsappNumber)
}
