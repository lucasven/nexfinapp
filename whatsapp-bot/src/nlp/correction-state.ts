/**
 * Simple in-memory state manager for handling user corrections
 * In production, this should be stored in a database or Redis
 */

interface CorrectionState {
  userId: string
  originalMessage: string
  aiResult: any
  timestamp: number
  transactionId?: string  // Transaction ID if a transaction was created
}

const correctionStates = new Map<string, CorrectionState>()

/**
 * Store a correction state for a user
 */
export function storeCorrectionState(
  whatsappNumber: string,
  originalMessage: string,
  aiResult: any,
  transactionId?: string
): void {
  const state: CorrectionState = {
    userId: whatsappNumber, // Using whatsapp number as user ID for simplicity
    originalMessage,
    aiResult,
    timestamp: Date.now(),
    transactionId
  }
  
  correctionStates.set(whatsappNumber, state)
  
  // Clean up old states (older than 5 minutes)
  setTimeout(() => {
    correctionStates.delete(whatsappNumber)
  }, 5 * 60 * 1000)
}

/**
 * Get and clear correction state for a user
 */
export function getAndClearCorrectionState(whatsappNumber: string): CorrectionState | null {
  const state = correctionStates.get(whatsappNumber)
  if (state) {
    correctionStates.delete(whatsappNumber)
    return state
  }
  return null
}

/**
 * Check if user has a pending correction state
 */
export function hasCorrectionState(whatsappNumber: string): boolean {
  return correctionStates.has(whatsappNumber)
}

/**
 * Clear correction state for a user
 */
export function clearCorrectionState(whatsappNumber: string): void {
  correctionStates.delete(whatsappNumber)
}

/**
 * Update transaction ID in existing correction state
 */
export function updateCorrectionStateTransactionId(
  whatsappNumber: string,
  transactionId: string
): void {
  const state = correctionStates.get(whatsappNumber)
  if (state) {
    state.transactionId = transactionId
    correctionStates.set(whatsappNumber, state)
  }
}
