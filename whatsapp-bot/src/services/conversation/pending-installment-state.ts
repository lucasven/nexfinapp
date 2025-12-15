/**
 * Pending Installment State Management (WhatsApp)
 *
 * Stores installment context when card selection is needed.
 * This allows the user to choose their credit card before completing the installment creation.
 *
 * Story: 2-1-add-installment-purchase-whatsapp
 * Acceptance Criteria: AC1.2 Scenario 3 - Multiple Credit Cards Selection
 */

export interface CreditCard {
  id: string
  name: string
}

export interface PendingInstallmentContext {
  type: 'pending_installment'
  amount: number
  installments: number
  description?: string
  merchant?: string
  firstPaymentDate?: string
  creditCards: CreditCard[]
  locale: 'pt-br' | 'en'
  createdAt: string // ISO8601 timestamp
}

// In-memory storage for pending installments during card selection
// Key format: whatsappNumber
// In production, this could be moved to Redis for persistence across restarts
const pendingInstallmentState = new Map<string, PendingInstallmentContext>()

// TTL for pending installments (5 minutes)
const PENDING_INSTALLMENT_TTL_MS = 5 * 60 * 1000

/**
 * Store installment context while waiting for card selection
 *
 * @param whatsappNumber - User's WhatsApp number
 * @param context - Installment details to store
 */
export function storePendingInstallmentContext(
  whatsappNumber: string,
  context: Omit<PendingInstallmentContext, 'type' | 'createdAt'>
): void {
  const fullContext: PendingInstallmentContext = {
    ...context,
    type: 'pending_installment',
    createdAt: new Date().toISOString()
  }

  pendingInstallmentState.set(whatsappNumber, fullContext)

  // Auto-cleanup after TTL
  setTimeout(() => {
    pendingInstallmentState.delete(whatsappNumber)
  }, PENDING_INSTALLMENT_TTL_MS)

  console.log(
    `[PendingInstallmentState] Stored pending installment for ${whatsappNumber}:`,
    { amount: context.amount, installments: context.installments, cardCount: context.creditCards.length }
  )
}

/**
 * Get pending installment context for a user
 *
 * @param whatsappNumber - User's WhatsApp number
 * @returns Installment context or null if none exists
 */
export function getPendingInstallmentContext(
  whatsappNumber: string
): PendingInstallmentContext | null {
  const context = pendingInstallmentState.get(whatsappNumber)

  if (context) {
    console.log(
      `[PendingInstallmentState] Retrieved pending installment for ${whatsappNumber}:`,
      { amount: context.amount, installments: context.installments }
    )
  }

  return context || null
}

/**
 * Get and remove pending installment context (consume)
 *
 * @param whatsappNumber - User's WhatsApp number
 * @returns Installment context or null if none exists
 */
export function getAndClearPendingInstallmentContext(
  whatsappNumber: string
): PendingInstallmentContext | null {
  const context = pendingInstallmentState.get(whatsappNumber)

  if (context) {
    pendingInstallmentState.delete(whatsappNumber)
    console.log(
      `[PendingInstallmentState] Cleared pending installment for ${whatsappNumber}:`,
      { amount: context.amount, installments: context.installments }
    )
  }

  return context || null
}

/**
 * Clear pending installment context (user cancelled or card selection complete)
 *
 * @param whatsappNumber - User's WhatsApp number
 */
export function clearPendingInstallmentContext(whatsappNumber: string): void {
  const existed = pendingInstallmentState.delete(whatsappNumber)

  if (existed) {
    console.log(`[PendingInstallmentState] Cleared pending installment for ${whatsappNumber}`)
  }
}

/**
 * Check if user has a pending installment waiting for card selection
 *
 * @param whatsappNumber - User's WhatsApp number
 * @returns True if pending installment exists
 */
export function hasPendingInstallmentContext(whatsappNumber: string): boolean {
  return pendingInstallmentState.has(whatsappNumber)
}

/**
 * Get all pending installments (for debugging/monitoring)
 *
 * @returns Map of all pending installments
 */
export function getAllPendingInstallments(): Map<string, PendingInstallmentContext> {
  return new Map(pendingInstallmentState)
}

/**
 * Clear all pending installments (for testing)
 */
export function clearAllPendingInstallments(): void {
  pendingInstallmentState.clear()
  console.log('[PendingInstallmentState] Cleared all pending installments')
}
