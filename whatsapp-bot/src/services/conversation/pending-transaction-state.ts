/**
 * Pending Transaction State Management (WhatsApp)
 *
 * Stores transaction context when credit mode selection is needed.
 * This allows the user to choose their credit mode before completing the transaction.
 *
 * Story: 1-2-first-credit-card-transaction-detection
 * Acceptance Criteria: AC2.3 - Transaction Pending State (WhatsApp)
 */

export interface PendingTransactionContext {
  type: 'pending_transaction'
  paymentMethodId: string
  amount: number
  categoryId?: string
  description?: string
  date: string // ISO8601
  locale: 'pt-BR' | 'en'
  transactionType: 'expense' | 'income'
  createdAt: string // ISO8601 timestamp
}

// In-memory storage for pending transactions during credit mode selection
// Key format: whatsappNumber
// In production, this could be moved to Redis for persistence across restarts
const pendingTransactionState = new Map<string, PendingTransactionContext>()

// TTL for pending transactions (10 minutes)
const PENDING_TRANSACTION_TTL_MS = 10 * 60 * 1000

/**
 * Store transaction context while waiting for credit mode selection
 *
 * @param whatsappNumber - User's WhatsApp number
 * @param context - Transaction details to store
 */
export function storePendingTransactionContext(
  whatsappNumber: string,
  context: Omit<PendingTransactionContext, 'type' | 'createdAt'>
): void {
  const fullContext: PendingTransactionContext = {
    ...context,
    type: 'pending_transaction',
    createdAt: new Date().toISOString()
  }

  pendingTransactionState.set(whatsappNumber, fullContext)

  // Auto-cleanup after TTL
  setTimeout(() => {
    pendingTransactionState.delete(whatsappNumber)
  }, PENDING_TRANSACTION_TTL_MS)

  console.log(
    `[PendingTransactionState] Stored pending transaction for ${whatsappNumber}:`,
    { paymentMethodId: context.paymentMethodId, amount: context.amount }
  )
}

/**
 * Get pending transaction context for a user
 *
 * @param whatsappNumber - User's WhatsApp number
 * @returns Transaction context or null if none exists
 */
export function getPendingTransactionContext(
  whatsappNumber: string
): PendingTransactionContext | null {
  const context = pendingTransactionState.get(whatsappNumber)

  if (context) {
    console.log(
      `[PendingTransactionState] Retrieved pending transaction for ${whatsappNumber}:`,
      { paymentMethodId: context.paymentMethodId, amount: context.amount }
    )
  }

  return context || null
}

/**
 * Get and remove pending transaction context (consume)
 *
 * @param whatsappNumber - User's WhatsApp number
 * @returns Transaction context or null if none exists
 */
export function getAndClearPendingTransactionContext(
  whatsappNumber: string
): PendingTransactionContext | null {
  const context = pendingTransactionState.get(whatsappNumber)

  if (context) {
    pendingTransactionState.delete(whatsappNumber)
    console.log(
      `[PendingTransactionState] Cleared pending transaction for ${whatsappNumber}:`,
      { paymentMethodId: context.paymentMethodId, amount: context.amount }
    )
  }

  return context || null
}

/**
 * Clear pending transaction context (user cancelled or mode selection complete)
 *
 * @param whatsappNumber - User's WhatsApp number
 */
export function clearPendingTransactionContext(whatsappNumber: string): void {
  const existed = pendingTransactionState.delete(whatsappNumber)

  if (existed) {
    console.log(`[PendingTransactionState] Cleared pending transaction for ${whatsappNumber}`)
  }
}

/**
 * Check if user has a pending transaction waiting for mode selection
 *
 * @param whatsappNumber - User's WhatsApp number
 * @returns True if pending transaction exists
 */
export function hasPendingTransactionContext(whatsappNumber: string): boolean {
  return pendingTransactionState.has(whatsappNumber)
}

/**
 * Get all pending transactions (for debugging/monitoring)
 *
 * @returns Map of all pending transactions
 */
export function getAllPendingTransactions(): Map<string, PendingTransactionContext> {
  return new Map(pendingTransactionState)
}

/**
 * Clear all pending transactions (for testing)
 */
export function clearAllPendingTransactions(): void {
  pendingTransactionState.clear()
  console.log('[PendingTransactionState] Cleared all pending transactions')
}
