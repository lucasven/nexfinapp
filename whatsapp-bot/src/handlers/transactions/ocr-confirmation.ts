/**
 * OCR Confirmation Handler
 * Manages user confirmation flow for OCR-extracted transactions
 */

import { getUserSession } from '../../auth/session-manager.js'
import { messages } from '../../localization/pt-br.js'
import { logger } from '../../services/monitoring/logger.js'
import { handleAddExpense } from './expenses.js'
import { trackEvent } from '../../analytics/index.js'
import { WhatsAppAnalyticsEvent, WhatsAppAnalyticsProperty } from '../../analytics/events.js'

// In-memory storage for pending OCR transactions
// TODO: Consider moving to Redis or database for production scalability
interface PendingOcrTransaction {
  amount: number
  category?: string  // Optional - may be undefined from AI parsing
  description?: string  // Optional - may be undefined from AI parsing
  type: 'expense' | 'income'
  date?: string
  paymentMethod?: string
}

interface PendingOcrState {
  userId: string
  whatsappNumber: string
  transactions: PendingOcrTransaction[]
  parsingMetricId?: string | null
  timestamp: number
}

// Map of whatsappNumber -> pending state
const pendingOcrTransactions = new Map<string, PendingOcrState>()

// Timeout duration: 5 minutes
const OCR_TIMEOUT_MS = 5 * 60 * 1000

/**
 * Store pending OCR transactions for user confirmation
 */
export function storePendingOcrTransactions(
  whatsappNumber: string,
  userId: string,
  transactions: PendingOcrTransaction[],
  parsingMetricId?: string | null
): void {
  logger.info('Storing pending OCR transactions', {
    whatsappNumber,
    userId,
    count: transactions.length,
    parsingMetricId,
  })

  pendingOcrTransactions.set(whatsappNumber, {
    userId,
    whatsappNumber,
    transactions,
    parsingMetricId,
    timestamp: Date.now(),
  })

  // Set timeout to auto-clear after 5 minutes
  setTimeout(() => {
    if (pendingOcrTransactions.has(whatsappNumber)) {
      logger.info('Clearing expired OCR transactions', { whatsappNumber })
      pendingOcrTransactions.delete(whatsappNumber)
    }
  }, OCR_TIMEOUT_MS)
}

/**
 * Get pending OCR transactions for a user
 */
export function getPendingOcrTransactions(whatsappNumber: string): PendingOcrState | null {
  const state = pendingOcrTransactions.get(whatsappNumber)

  if (!state) {
    return null
  }

  // Check if expired
  if (Date.now() - state.timestamp > OCR_TIMEOUT_MS) {
    logger.info('Pending OCR transactions expired', { whatsappNumber })
    pendingOcrTransactions.delete(whatsappNumber)
    return null
  }

  return state
}

/**
 * Clear pending OCR transactions
 */
export function clearPendingOcrTransactions(whatsappNumber: string): void {
  logger.info('Clearing pending OCR transactions', { whatsappNumber })
  pendingOcrTransactions.delete(whatsappNumber)
}

/**
 * Handle OCR confirmation (user said "yes/sim")
 */
export async function handleOcrConfirmation(
  whatsappNumber: string
): Promise<string | string[]> {
  logger.info('Handling OCR confirmation', { whatsappNumber })

  const pendingState = getPendingOcrTransactions(whatsappNumber)

  if (!pendingState) {
    logger.warn('No pending OCR transactions found', { whatsappNumber })
    return messages.ocrNoPending
  }

  const { transactions, parsingMetricId } = pendingState

  logger.info('Confirming OCR transactions', {
    whatsappNumber,
    count: transactions.length,
    parsingMetricId,
  })

  // Process all transactions
  const messageList: string[] = []
  let successCount = 0

  for (let i = 0; i < transactions.length; i++) {
    const transaction = transactions[i]

    try {
      const action = transaction.type === 'income' ? 'add_income' as const : 'add_expense' as const
      const intent = {
        action,
        confidence: 0.95,
        entities: transaction,
      }

      const result = await handleAddExpense(whatsappNumber, intent, parsingMetricId)
      messageList.push(`${i + 1}/${transactions.length} - ${result}`)
      successCount++
    } catch (error) {
      logger.error('Error processing confirmed OCR transaction', {
        whatsappNumber,
        index: i,
        description: transaction.description,
      }, error as Error)
      messageList.push(`${i + 1}/${transactions.length} - ❌ Erro: ${transaction.description}`)
    }
  }

  // Clear pending transactions
  clearPendingOcrTransactions(whatsappNumber)

  // Track OCR confirmation accepted
  trackEvent(
    WhatsAppAnalyticsEvent.OCR_CONFIRMATION_ACCEPTED,
    pendingState.userId,
    {
      [WhatsAppAnalyticsProperty.EXTRACTION_COUNT]: transactions.length,
      success_count: successCount,
    }
  )

  // Add summary message at the end
  messageList.push(messages.ocrAllAdded(transactions.length, successCount))

  logger.info('OCR confirmation completed', {
    whatsappNumber,
    total: transactions.length,
    successful: successCount,
  })

  return messageList
}

/**
 * Handle OCR cancellation (user said "no/não")
 */
export async function handleOcrCancel(whatsappNumber: string): Promise<string> {
  logger.info('Handling OCR cancellation', { whatsappNumber })

  const pendingState = getPendingOcrTransactions(whatsappNumber)

  if (!pendingState) {
    logger.warn('No pending OCR transactions to cancel', { whatsappNumber })
    return messages.ocrNoPending
  }

  // Track OCR confirmation rejected
  trackEvent(
    WhatsAppAnalyticsEvent.OCR_CONFIRMATION_REJECTED,
    pendingState.userId,
    {
      [WhatsAppAnalyticsProperty.EXTRACTION_COUNT]: pendingState.transactions.length,
      rejection_reason: 'user_cancelled',
    }
  )

  clearPendingOcrTransactions(whatsappNumber)

  logger.info('OCR transactions cancelled', {
    whatsappNumber,
    count: pendingState.transactions.length,
  })

  return messages.ocrCancelled
}

/**
 * Handle OCR edit request (user said "editar N")
 */
export async function handleOcrEdit(
  whatsappNumber: string,
  transactionIndex: number
): Promise<string> {
  logger.info('Handling OCR edit request', {
    whatsappNumber,
    transactionIndex,
  })

  const pendingState = getPendingOcrTransactions(whatsappNumber)

  if (!pendingState) {
    logger.warn('No pending OCR transactions to edit', { whatsappNumber })
    return messages.ocrNoPending
  }

  // Validate transaction index
  if (transactionIndex < 1 || transactionIndex > pendingState.transactions.length) {
    logger.warn('Invalid transaction index', {
      whatsappNumber,
      index: transactionIndex,
      max: pendingState.transactions.length,
    })
    return messages.ocrInvalidTransactionNumber(pendingState.transactions.length)
  }

  const transaction = pendingState.transactions[transactionIndex - 1]

  logger.info('Showing edit prompt', {
    whatsappNumber,
    transactionIndex,
    transaction: {
      amount: transaction.amount,
      category: transaction.category,
      description: transaction.description,
    },
  })

  return messages.ocrEditPrompt(transactionIndex, transaction)
}

/**
 * Apply edit to a pending OCR transaction
 */
export async function applyOcrEdit(
  whatsappNumber: string,
  transactionIndex: number,
  field: 'category' | 'amount' | 'description',
  value: string | number
): Promise<string> {
  logger.info('Applying OCR edit', {
    whatsappNumber,
    transactionIndex,
    field,
    value,
  })

  const pendingState = getPendingOcrTransactions(whatsappNumber)

  if (!pendingState) {
    logger.warn('No pending OCR transactions to edit', { whatsappNumber })
    return messages.ocrNoPending
  }

  // Validate transaction index
  if (transactionIndex < 1 || transactionIndex > pendingState.transactions.length) {
    logger.warn('Invalid transaction index for edit', {
      whatsappNumber,
      index: transactionIndex,
      max: pendingState.transactions.length,
    })
    return messages.ocrInvalidTransactionNumber(pendingState.transactions.length)
  }

  const transaction = pendingState.transactions[transactionIndex - 1]

  // Apply the edit
  switch (field) {
    case 'category':
      transaction.category = value as string
      break
    case 'amount':
      transaction.amount = value as number
      break
    case 'description':
      transaction.description = value as string
      break
  }

  // Update the state
  pendingState.transactions[transactionIndex - 1] = transaction

  logger.info('OCR edit applied successfully', {
    whatsappNumber,
    transactionIndex,
    field,
    newValue: value,
  })

  return messages.ocrEditSuccess(transactionIndex)
}

/**
 * Check if user has pending OCR transactions
 */
export function hasPendingOcrTransactions(whatsappNumber: string): boolean {
  return getPendingOcrTransactions(whatsappNumber) !== null
}
