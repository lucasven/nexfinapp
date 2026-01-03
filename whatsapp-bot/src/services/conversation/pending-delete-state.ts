/**
 * Pending Delete State Management (WhatsApp)
 *
 * Stores delete conversation context when user is selecting which installment to delete.
 * This allows multi-step delete confirmation flow:
 * 1. List active installments
 * 2. User selects by number
 * 3. Show confirmation warning
 * 4. User confirms (confirmar/cancelar)
 * 5. Execute deletion or cancel
 *
 * Story: 2-7-delete-installment-plan
 * Acceptance Criteria: AC7.4 WhatsApp Support
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

export interface PendingDeleteContext {
  type: 'pending_delete'
  step: 'list' | 'select' | 'confirm' | 'execute'
  installments: InstallmentOption[]
  selectedPlanId?: string
  locale: 'pt-br' | 'en'
  createdAt: string // ISO8601 timestamp
}

// In-memory storage for pending delete conversations
// Key format: whatsappNumber
// In production, this could be moved to Redis for persistence across restarts
const pendingDeleteState = new Map<string, PendingDeleteContext>()

// TTL for pending delete conversations (5 minutes)
const PENDING_DELETE_TTL_MS = 5 * 60 * 1000

/**
 * Store delete conversation context
 *
 * @param whatsappNumber - User's WhatsApp number
 * @param context - Delete conversation details to store
 */
export function storePendingDeleteContext(
  whatsappNumber: string,
  context: Omit<PendingDeleteContext, 'type' | 'createdAt'>
): void {
  const fullContext: PendingDeleteContext = {
    ...context,
    type: 'pending_delete',
    createdAt: new Date().toISOString()
  }

  pendingDeleteState.set(whatsappNumber, fullContext)

  // Auto-cleanup after TTL
  setTimeout(() => {
    pendingDeleteState.delete(whatsappNumber)
  }, PENDING_DELETE_TTL_MS)

  console.log(
    `[PendingDeleteState] Stored pending delete for ${whatsappNumber}:`,
    { step: context.step, installmentCount: context.installments.length, selectedPlanId: context.selectedPlanId }
  )
}

/**
 * Get pending delete context for a user
 *
 * @param whatsappNumber - User's WhatsApp number
 * @returns Delete context or null if none exists
 */
export function getPendingDeleteContext(
  whatsappNumber: string
): PendingDeleteContext | null {
  const context = pendingDeleteState.get(whatsappNumber)

  if (context) {
    console.log(
      `[PendingDeleteState] Retrieved pending delete for ${whatsappNumber}:`,
      { step: context.step, selectedPlanId: context.selectedPlanId }
    )
  }

  return context || null
}

/**
 * Clear pending delete context for a user
 *
 * @param whatsappNumber - User's WhatsApp number
 */
export function clearPendingDeleteContext(whatsappNumber: string): void {
  const existed = pendingDeleteState.delete(whatsappNumber)

  if (existed) {
    console.log(`[PendingDeleteState] Cleared pending delete for ${whatsappNumber}`)
  }
}

/**
 * Check if user has pending delete conversation
 *
 * @param whatsappNumber - User's WhatsApp number
 * @returns True if pending delete exists
 */
export function hasPendingDelete(whatsappNumber: string): boolean {
  return pendingDeleteState.has(whatsappNumber)
}
