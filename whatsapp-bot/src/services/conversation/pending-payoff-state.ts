/**
 * Pending Payoff State Management (WhatsApp)
 *
 * Stores payoff conversation context when user is selecting which installment to pay off.
 * This allows multi-step payoff confirmation flow:
 * 1. List active installments
 * 2. User selects by number or description
 * 3. Show confirmation
 * 4. User confirms (sim/não)
 * 5. Execute payoff or cancel
 *
 * Story: 2-5-mark-installment-as-paid-off-early
 * Acceptance Criteria: AC5.4 WhatsApp Support
 */

export interface InstallmentOption {
  plan_id: string
  description: string
  emoji: string
  payment_method_name: string
  total_amount: number
  total_installments: number
  payments_paid: number
  amount_paid: number
  payments_pending: number
  amount_remaining: number
}

export interface PendingPayoffContext {
  type: 'pending_payoff'
  step: 'list' | 'select' | 'confirm' | 'execute'
  installments: InstallmentOption[]
  selectedPlanId?: string
  locale: 'pt-br' | 'en'
  createdAt: string // ISO8601 timestamp
}

// In-memory storage for pending payoff conversations
// Key format: whatsappNumber
// In production, this could be moved to Redis for persistence across restarts
const pendingPayoffState = new Map<string, PendingPayoffContext>()

// TTL for pending payoff conversations (5 minutes)
const PENDING_PAYOFF_TTL_MS = 5 * 60 * 1000

/**
 * Store payoff conversation context
 *
 * @param whatsappNumber - User's WhatsApp number
 * @param context - Payoff conversation details to store
 */
export function storePendingPayoffContext(
  whatsappNumber: string,
  context: Omit<PendingPayoffContext, 'type' | 'createdAt'>
): void {
  const fullContext: PendingPayoffContext = {
    ...context,
    type: 'pending_payoff',
    createdAt: new Date().toISOString()
  }

  pendingPayoffState.set(whatsappNumber, fullContext)

  // Auto-cleanup after TTL
  setTimeout(() => {
    pendingPayoffState.delete(whatsappNumber)
  }, PENDING_PAYOFF_TTL_MS)

  console.log(
    `[PendingPayoffState] Stored pending payoff for ${whatsappNumber}:`,
    { step: context.step, installmentCount: context.installments.length, selectedPlanId: context.selectedPlanId }
  )
}

/**
 * Get pending payoff context for a user
 *
 * @param whatsappNumber - User's WhatsApp number
 * @returns Payoff context or null if none exists
 */
export function getPendingPayoffContext(
  whatsappNumber: string
): PendingPayoffContext | null {
  const context = pendingPayoffState.get(whatsappNumber)

  if (context) {
    console.log(
      `[PendingPayoffState] Retrieved pending payoff for ${whatsappNumber}:`,
      { step: context.step, selectedPlanId: context.selectedPlanId }
    )
  }

  return context || null
}

/**
 * Clear pending payoff context for a user
 *
 * @param whatsappNumber - User's WhatsApp number
 */
export function clearPendingPayoffContext(whatsappNumber: string): void {
  const existed = pendingPayoffState.delete(whatsappNumber)

  if (existed) {
    console.log(`[PendingPayoffState] Cleared pending payoff for ${whatsappNumber}`)
  }
}

/**
 * Check if user has pending payoff conversation
 *
 * @param whatsappNumber - User's WhatsApp number
 * @returns True if pending payoff exists
 */
export function hasPendingPayoff(whatsappNumber: string): boolean {
  return pendingPayoffState.has(whatsappNumber)
}
