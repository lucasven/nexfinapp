/**
 * Generic Conversation State Manager
 *
 * Provides generic conversation state management for multi-step flows.
 * This is used for flows that don't fit the specific pending-*-state patterns.
 *
 * Key: whatsappNumber
 * TTL: 5 minutes
 */

// In-memory storage for conversation states
// In production, this could be moved to Redis for persistence across restarts
const conversationState = new Map<string, any>()

// TTL for conversation states (5 minutes)
const CONVERSATION_STATE_TTL_MS = 5 * 60 * 1000

/**
 * Store conversation state
 *
 * @param userId - User's ID (or WhatsApp number for backward compatibility)
 * @param stateKey - State key (optional, for multiple state types)
 * @param state - State data to store
 */
export function setConversationState(
  userId: string,
  stateKey: string | any,
  state?: any
): void {
  // Support both (userId, state) and (userId, stateKey, state) signatures
  const actualState = state !== undefined ? state : stateKey
  const key = state !== undefined ? `${userId}:${stateKey}` : userId

  const fullState = {
    ...actualState,
    createdAt: new Date().toISOString()
  }

  conversationState.set(key, fullState)

  // Auto-cleanup after TTL
  setTimeout(() => {
    conversationState.delete(key)
  }, CONVERSATION_STATE_TTL_MS)
}

/**
 * Retrieve conversation state
 *
 * @param userId - User's ID (or WhatsApp number for backward compatibility)
 * @param stateKey - State key (optional, for multiple state types)
 * @returns State data or null if not found or expired
 */
export function getConversationState<T = any>(
  userId: string,
  stateKey?: string
): T | null {
  const key = stateKey !== undefined ? `${userId}:${stateKey}` : userId
  const state = conversationState.get(key)

  if (!state) {
    return null
  }

  // Check if expired
  const createdAt = new Date(state.createdAt).getTime()
  const now = Date.now()

  if (now - createdAt > CONVERSATION_STATE_TTL_MS) {
    conversationState.delete(key)
    return null
  }

  return state as T
}

/**
 * Clear conversation state
 *
 * @param userId - User's ID (or WhatsApp number for backward compatibility)
 * @param stateKey - State key (optional, for multiple state types)
 */
export function clearConversationState(userId: string, stateKey?: string): void {
  const key = stateKey !== undefined ? `${userId}:${stateKey}` : userId
  conversationState.delete(key)
}

/**
 * Check if user has active conversation state
 *
 * @param whatsappNumber - User's WhatsApp number
 * @returns True if state exists and not expired
 */
export function hasConversationState(whatsappNumber: string): boolean {
  return getConversationState(whatsappNumber) !== null
}
