/**
 * Test Fixtures for Engagement System
 *
 * Factory functions for creating mock engagement data for testing.
 * All factories provide sensible defaults with optional overrides.
 *
 * @module engagement-fixtures
 */

import { randomUUID } from 'crypto'
import type {
  UserEngagementState,
  EngagementState,
  QueuedMessage,
  MessageType,
  TierProgress,
} from '../../../services/engagement/types.js'

/**
 * Options for creating mock engagement state
 */
export interface MockEngagementStateOptions {
  id?: string
  userId?: string
  state?: EngagementState
  lastActivityAt?: Date
  goodbyeSentAt?: Date | null
  goodbyeExpiresAt?: Date | null
  remindAt?: Date | null
  createdAt?: Date
  updatedAt?: Date
}

/**
 * Options for creating mock message queue entries
 */
export interface MockMessageQueueOptions {
  id?: string
  userId?: string
  messageType?: MessageType
  messageKey?: string
  messageParams?: Record<string, unknown> | null
  destination?: 'individual' | 'group'
  destinationJid?: string
  scheduledFor?: Date
  sentAt?: Date | null
  status?: 'pending' | 'sent' | 'failed' | 'cancelled'
  retryCount?: number
  errorMessage?: string | null
  idempotencyKey?: string
  createdAt?: Date
}

/**
 * Create a mock user engagement state with sensible defaults
 *
 * Defaults:
 * - state: 'active'
 * - lastActivityAt: current time
 * - all other nullable fields: null
 * - generates unique UUID for id and userId if not provided
 *
 * @param options - Optional overrides for specific fields
 * @returns Mock UserEngagementState object
 *
 * @example
 * ```typescript
 * // Minimal - use all defaults
 * const state1 = createMockEngagementState()
 *
 * // Override specific fields
 * const state2 = createMockEngagementState({
 *   state: 'goodbye_sent',
 *   lastActivityAt: new Date('2025-01-01'),
 *   goodbyeSentAt: new Date('2025-01-15'),
 * })
 *
 * // Create related data with same userId
 * const userId = randomUUID()
 * const state3 = createMockEngagementState({ userId })
 * const message = createMockMessageQueue({ userId })
 * ```
 */
export function createMockEngagementState(
  options: MockEngagementStateOptions = {}
): UserEngagementState {
  const now = new Date()

  return {
    id: options.id ?? randomUUID(),
    userId: options.userId ?? randomUUID(),
    state: options.state ?? 'active',
    lastActivityAt: options.lastActivityAt ?? now,
    goodbyeSentAt: options.goodbyeSentAt ?? null,
    goodbyeExpiresAt: options.goodbyeExpiresAt ?? null,
    remindAt: options.remindAt ?? null,
    createdAt: options.createdAt ?? now,
    updatedAt: options.updatedAt ?? now,
  }
}

/**
 * Create a mock message queue entry with sensible defaults
 *
 * Defaults:
 * - messageType: 'goodbye'
 * - destination: 'individual'
 * - status: 'pending'
 * - retryCount: 0
 * - scheduledFor: current time
 * - generates unique UUID and idempotencyKey if not provided
 *
 * @param options - Optional overrides for specific fields
 * @returns Mock QueuedMessage object
 *
 * @example
 * ```typescript
 * // Create pending goodbye message
 * const message = createMockMessageQueue({
 *   userId: 'test-user-123',
 *   messageType: 'goodbye',
 * })
 *
 * // Create sent weekly review
 * const review = createMockMessageQueue({
 *   messageType: 'weekly_review',
 *   status: 'sent',
 *   sentAt: new Date(),
 * })
 * ```
 */
export function createMockMessageQueue(
  options: MockMessageQueueOptions = {}
): QueuedMessage {
  const now = new Date()

  return {
    id: options.id ?? randomUUID(),
    userId: options.userId ?? randomUUID(),
    messageType: options.messageType ?? 'goodbye',
    messageKey: options.messageKey ?? 'engagement.goodbye.message',
    messageParams: options.messageParams ?? null,
    destination: options.destination ?? 'individual',
    destinationJid: options.destinationJid ?? `${options.userId ?? randomUUID()}@s.whatsapp.net`,
    scheduledFor: options.scheduledFor ?? now,
    sentAt: options.sentAt ?? null,
    status: options.status ?? 'pending',
    retryCount: options.retryCount ?? 0,
    errorMessage: options.errorMessage ?? null,
    idempotencyKey:
      options.idempotencyKey ?? `test-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    createdAt: options.createdAt ?? now,
  }
}

/**
 * Create multiple mock message queue entries at once
 *
 * Useful for testing bulk message processing or queue operations.
 *
 * @param count - Number of messages to create
 * @param baseOptions - Base options applied to all messages (optional overrides per message)
 * @returns Array of mock QueuedMessage objects
 *
 * @example
 * ```typescript
 * // Create 5 pending messages for the same user
 * const messages = createBulkMockMessages(5, {
 *   userId: 'test-user-123',
 *   status: 'pending',
 * })
 * ```
 */
export function createBulkMockMessages(
  count: number,
  baseOptions: MockMessageQueueOptions = {}
): QueuedMessage[] {
  return Array.from({ length: count }, () => createMockMessageQueue(baseOptions))
}

/**
 * Create a mock tier progress object
 *
 * @param tier - Highest tier completed (1-3)
 * @param completedActions - Specific actions to mark as completed
 * @returns Mock TierProgress object
 *
 * @example
 * ```typescript
 * // User at Tier 1, completed add_expense
 * const progress = createMockTierProgress(1, ['add_expense'])
 *
 * // User at Tier 2, completed all Tier 1 + set_budget
 * const progress2 = createMockTierProgress(2, [
 *   'add_expense', 'edit_category', 'delete_expense', 'add_category',
 *   'set_budget'
 * ])
 * ```
 */
export function createMockTierProgress(
  tier: number = 1,
  completedActions: string[] = []
): TierProgress {
  const now = new Date().toISOString()

  // Helper to check if action is in completedActions
  const isCompleted = (action: string) => completedActions.includes(action)

  // Build tier 1
  const tier1 = {
    add_expense: isCompleted('add_expense'),
    edit_category: isCompleted('edit_category'),
    delete_expense: isCompleted('delete_expense'),
    add_category: isCompleted('add_category'),
    ...(tier >= 1 && { completed_at: now }),
  }

  // Build tier 2
  const tier2 = {
    set_budget: isCompleted('set_budget'),
    add_recurring: isCompleted('add_recurring'),
    list_categories: isCompleted('list_categories'),
    ...(tier >= 2 && { completed_at: now }),
  }

  // Build tier 3
  const tier3 = {
    edit_category: isCompleted('edit_category'),
    view_report: isCompleted('view_report'),
    ...(tier >= 3 && { completed_at: now }),
  }

  return {
    tier1,
    tier2,
    tier3,
    ...(completedActions.includes('add_expense') && { magic_moment_at: now }),
  }
}

/**
 * Create a mock user with all 3 tiers completed
 *
 * Useful for testing re-engagement scenarios with experienced users.
 *
 * @param userId - User ID (generates UUID if not provided)
 * @returns Mock TierProgress with all tiers completed
 *
 * @example
 * ```typescript
 * // Test that experienced users still get goodbye messages
 * const userId = randomUUID()
 * const tierProgress = createCompleteTierProgress(userId)
 * const state = createMockEngagementState({
 *   userId,
 *   lastActivityAt: new Date('2025-01-01'),
 * })
 *
 * advanceTime(14)
 * await runDailyJob()
 * // Verify goodbye sent even for completed users
 * ```
 */
export function createCompleteTierProgress(userId?: string): TierProgress {
  const now = new Date().toISOString()

  return {
    tier1: {
      add_expense: true,
      edit_category: true,
      delete_expense: true,
      add_category: true,
      completed_at: now,
    },
    tier2: {
      set_budget: true,
      add_recurring: true,
      list_categories: true,
      completed_at: now,
    },
    tier3: {
      edit_category: true,
      view_report: true,
      completed_at: now,
    },
    magic_moment_at: now,
  }
}
