/**
 * Idempotency Test Helpers
 *
 * Utilities for testing scheduler idempotency and database operations.
 * These helpers verify that schedulers never send duplicate messages (NFR7).
 *
 * @module idempotency-helpers
 */

import type { UserEngagementState } from '../../services/engagement/types.js'
import { getTestSupabaseClient, createTestUser } from './test-database.js'

/**
 * Result of running scheduler twice
 */
interface SchedulerRunResult {
  messagesBefore: number
  messagesAfterFirst: number
  messagesAfterSecond: number
}

/**
 * Run a scheduler function twice with the same clock state
 *
 * This helper is critical for verifying scheduler idempotency. The scheduler
 * should only queue messages on the first run; the second run with identical
 * time state should not create duplicate messages.
 *
 * @param schedulerFn - Async scheduler function to test
 * @returns Object with message counts before, after first run, and after second run
 *
 * @example
 * ```typescript
 * import { runSchedulerTwice, assertNoNewMessages } from '@/__tests__/utils/idempotency-helpers'
 * import { setupMockTime, advanceTime } from '@/__tests__/utils/time-helpers'
 *
 * it('scheduler is idempotent - no duplicate messages', async () => {
 *   const user = createMockEngagementState({ lastActivityAt: new Date('2025-01-01') })
 *   await seedEngagementState(user)
 *
 *   setupMockTime(new Date('2025-01-15')) // 14 days later
 *
 *   const { messagesBefore, messagesAfterFirst, messagesAfterSecond } =
 *     await runSchedulerTwice(runDailyEngagementJob)
 *
 *   expect(messagesAfterFirst - messagesBefore).toBe(1) // First run adds 1 message
 *   assertNoNewMessages(messagesAfterFirst, messagesAfterSecond) // Second run adds 0
 * })
 * ```
 */
export async function runSchedulerTwice(
  schedulerFn: () => Promise<void>
): Promise<SchedulerRunResult> {
  const messagesBefore = await getMessageQueueCount()

  // First run - should queue messages as needed
  await schedulerFn()
  const messagesAfterFirst = await getMessageQueueCount()

  // Second run - same clock state, should be idempotent (no new messages)
  await schedulerFn()
  const messagesAfterSecond = await getMessageQueueCount()

  return { messagesBefore, messagesAfterFirst, messagesAfterSecond }
}

/**
 * Assert that no new messages were added
 *
 * Use this after runSchedulerTwice to verify idempotency.
 *
 * @param countBefore - Message count before operation
 * @param countAfter - Message count after operation
 *
 * @example
 * ```typescript
 * const { messagesAfterFirst, messagesAfterSecond } = await runSchedulerTwice(scheduler)
 * assertNoNewMessages(messagesAfterFirst, messagesAfterSecond)
 * ```
 */
export function assertNoNewMessages(countBefore: number, countAfter: number): void {
  expect(countAfter).toBe(countBefore)
}

/**
 * Get the current count of messages in the engagement_message_queue table
 *
 * This queries the test database to get the total count of queued messages.
 * Useful for verifying that schedulers queued the correct number of messages.
 *
 * @returns Promise resolving to the message count
 *
 * @example
 * ```typescript
 * const beforeCount = await getMessageQueueCount()
 * await runScheduler()
 * const afterCount = await getMessageQueueCount()
 * expect(afterCount - beforeCount).toBe(1) // Scheduler queued 1 message
 * ```
 */
export async function getMessageQueueCount(): Promise<number> {
  const client = getTestSupabaseClient()

  const { count, error } = await client
    .from('engagement_message_queue')
    .select('*', { count: 'exact', head: true })

  if (error) {
    throw new Error(`Failed to get message queue count: ${error.message}`)
  }

  return count ?? 0
}

/**
 * Seed an engagement state into the test database
 *
 * Use this in beforeEach() or test setup to create initial state for tests.
 *
 * @param state - UserEngagementState to insert
 * @returns Promise resolving to the inserted state
 *
 * @example
 * ```typescript
 * import { createMockEngagementState } from '../engagement/fixtures/engagement-fixtures'
 *
 * it('transitions state on inactivity', async () => {
 *   const state = createMockEngagementState({
 *     lastActivityAt: new Date('2025-01-01'),
 *   })
 *   await seedEngagementState(state)
 *
 *   advanceTime(14)
 *   await runDailyJob()
 *
 *   const updatedState = await getEngagementState(state.userId)
 *   expect(updatedState?.state).toBe('goodbye_sent')
 * })
 * ```
 */
export async function seedEngagementState(
  state: UserEngagementState
): Promise<UserEngagementState> {
  const client = getTestSupabaseClient()

  // Create test user in auth.users first (required for FK constraint)
  await createTestUser(state.userId)

  // Create user_profiles entry (required for message routing)
  // Note: user_id is unique, so use it for upsert matching
  const { error: profileError } = await client
    .from('user_profiles')
    .upsert(
      {
        user_id: state.userId,
        preferred_destination: 'individual',
        locale: 'pt-br',
      },
      {
        onConflict: 'user_id',
      }
    )

  if (profileError) {
    throw new Error(`Failed to create user_profiles: ${profileError.message}`)
  }

  // Create authorized_whatsapp_numbers entry with whatsapp_jid (required for message routing)
  // This is critical for tests - getMessageDestination() queries this table
  const { error: whatsappError } = await client
    .from('authorized_whatsapp_numbers')
    .upsert({
      user_id: state.userId,
      whatsapp_number: state.userId, // Use userId as phone number for tests
      whatsapp_jid: `${state.userId}@s.whatsapp.net`,
      name: 'Test User',
      is_primary: true,
    })

  if (whatsappError) {
    throw new Error(`Failed to create authorized_whatsapp_numbers: ${whatsappError.message}`)
  }

  // Convert camelCase TypeScript interface to snake_case database columns
  const dbRecord = {
    id: state.id,
    user_id: state.userId,
    state: state.state,
    last_activity_at: state.lastActivityAt,
    goodbye_sent_at: state.goodbyeSentAt,
    goodbye_expires_at: state.goodbyeExpiresAt,
    remind_at: state.remindAt,
    created_at: state.createdAt,
    updated_at: state.updatedAt,
  }

  const { data, error } = await client
    .from('user_engagement_states')
    .insert(dbRecord)
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to seed engagement state: ${error.message}`)
  }

  // Convert snake_case response back to camelCase
  return {
    id: data.id,
    userId: data.user_id,
    state: data.state,
    lastActivityAt: new Date(data.last_activity_at),
    goodbyeSentAt: data.goodbye_sent_at ? new Date(data.goodbye_sent_at) : null,
    goodbyeExpiresAt: data.goodbye_expires_at ? new Date(data.goodbye_expires_at) : null,
    remindAt: data.remind_at ? new Date(data.remind_at) : null,
    createdAt: new Date(data.created_at),
    updatedAt: new Date(data.updated_at),
  } as UserEngagementState
}

/**
 * Clean up engagement states and related data for test users
 *
 * Use this in afterEach() to clean up test data and prevent test pollution.
 * Deletes in correct order to respect foreign key constraints.
 *
 * @param userIds - Array of user IDs to clean up
 * @returns Promise that resolves when cleanup is complete
 *
 * @example
 * ```typescript
 * let testUserIds: string[] = []
 *
 * beforeEach(() => {
 *   testUserIds = []
 * })
 *
 * afterEach(async () => {
 *   await cleanupEngagementStates(testUserIds)
 * })
 *
 * it('test something', async () => {
 *   const state = createMockEngagementState()
 *   testUserIds.push(state.userId)
 *   await seedEngagementState(state)
 *   // ... test logic
 * })
 * ```
 */
export async function cleanupEngagementStates(userIds: string[]): Promise<void> {
  if (userIds.length === 0) return

  const client = getTestSupabaseClient()

  // Clean up in order to respect foreign key constraints
  await client.from('engagement_state_transitions').delete().in('user_id', userIds)
  await client.from('engagement_message_queue').delete().in('user_id', userIds)
  await client.from('user_engagement_states').delete().in('user_id', userIds)
  await client.from('authorized_whatsapp_numbers').delete().in('user_id', userIds)
  await client.from('user_profiles').delete().in('user_id', userIds)
}

/**
 * Get the engagement state for a specific user
 *
 * Use this for assertions to verify state transitions occurred correctly.
 *
 * @param userId - User ID to look up
 * @returns Promise resolving to the engagement state, or null if not found
 *
 * @example
 * ```typescript
 * it('transitions to goodbye_sent after 14 days', async () => {
 *   const userId = 'test-user-123'
 *   await seedEngagementState(createMockEngagementState({ userId }))
 *
 *   advanceTime(14)
 *   await runDailyJob()
 *
 *   const state = await getEngagementState(userId)
 *   expect(state?.state).toBe('goodbye_sent')
 *   expect(state?.goodbyeSentAt).toBeDefined()
 * })
 * ```
 */
export async function getEngagementState(userId: string): Promise<UserEngagementState | null> {
  const client = getTestSupabaseClient()

  const { data, error } = await client
    .from('user_engagement_states')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  // maybeSingle() returns null if not found, which is fine
  if (error) {
    throw new Error(`Failed to get engagement state: ${error.message}`)
  }

  if (!data) {
    return null
  }

  // Convert snake_case database columns to camelCase TypeScript interface
  return {
    id: data.id,
    userId: data.user_id,
    state: data.state,
    lastActivityAt: new Date(data.last_activity_at),
    goodbyeSentAt: data.goodbye_sent_at ? new Date(data.goodbye_sent_at) : null,
    goodbyeExpiresAt: data.goodbye_expires_at ? new Date(data.goodbye_expires_at) : null,
    remindAt: data.remind_at ? new Date(data.remind_at) : null,
    createdAt: new Date(data.created_at),
    updatedAt: new Date(data.updated_at),
  } as UserEngagementState
}

/**
 * Get all messages in the queue for a specific user
 *
 * Useful for verifying that specific messages were queued for a user.
 *
 * @param userId - User ID to filter by
 * @returns Promise resolving to array of queued messages
 *
 * @example
 * ```typescript
 * it('queues goodbye message for inactive user', async () => {
 *   const userId = 'test-user-123'
 *   await seedEngagementState(createMockEngagementState({ userId }))
 *
 *   advanceTime(14)
 *   await runDailyJob()
 *
 *   const messages = await getMessagesForUser(userId)
 *   expect(messages).toHaveLength(1)
 *   expect(messages[0].messageType).toBe('goodbye')
 * })
 * ```
 */
export async function getMessagesForUser(userId: string): Promise<any[]> {
  const client = getTestSupabaseClient()

  const { data, error } = await client
    .from('engagement_message_queue')
    .select('*')
    .eq('user_id', userId)

  if (error) {
    throw new Error(`Failed to get messages for user: ${error.message}`)
  }

  return data ?? []
}

/**
 * Simulate a crash by running a scheduler and throwing an error after processing N users
 *
 * This helper is used to test crash recovery scenarios. It allows you to partially
 * execute a scheduler job, then simulate a crash, and verify that recovery logic
 * skips already-processed users on the next run.
 *
 * @param schedulerFn - Async scheduler function to run
 * @param userIds - Array of user IDs the scheduler will process
 * @param crashAfterIndex - Index after which to throw error (0-based). E.g., crashAfterIndex=1 means process users[0] and users[1], then crash before users[2]
 * @returns Promise that rejects with a simulated crash error
 *
 * @example
 * ```typescript
 * // Test crash recovery
 * const userIds = ['user1', 'user2', 'user3']
 * await seedEngagementState(createMockEngagementState({ userId: userIds[0] }))
 * await seedEngagementState(createMockEngagementState({ userId: userIds[1] }))
 * await seedEngagementState(createMockEngagementState({ userId: userIds[2] }))
 *
 * // Crash after processing first 2 users
 * await expect(
 *   simulateCrash(() => runDailyEngagementJob(), userIds, 1)
 * ).rejects.toThrow('Simulated crash')
 *
 * // Verify users 1-2 got messages, user 3 did not
 * expect(await getMessagesForUser(userIds[0])).toHaveLength(1)
 * expect(await getMessagesForUser(userIds[1])).toHaveLength(1)
 * expect(await getMessagesForUser(userIds[2])).toHaveLength(0)
 *
 * // Restart job - should skip users 1-2, process user 3
 * await runDailyEngagementJob()
 * expect(await getMessagesForUser(userIds[2])).toHaveLength(1)
 * ```
 */
export async function simulateCrash(
  schedulerFn: () => Promise<void>,
  userIds: string[],
  crashAfterIndex: number
): Promise<void> {
  // Note: This is a simplified implementation.
  // In real scenarios, the crash would be injected into the scheduler function itself.
  // For testing, we'll rely on test-specific logic to throw errors at the right time.
  // This function serves as a placeholder and documentation.
  throw new Error(
    `simulateCrash is a conceptual helper. Tests should inject crash logic directly into scheduler mocks.`
  )
}

/**
 * Run two async functions concurrently using Promise.all
 *
 * This helper simulates concurrent scheduler execution, which can happen when:
 * - Railway cron accidentally spawns two instances
 * - Multiple processes run the same job
 * - Race conditions in distributed systems
 *
 * Used to verify that database constraints and optimistic locking prevent
 * duplicate operations when multiple instances run simultaneously.
 *
 * @param fn1 - First async function to run
 * @param fn2 - Second async function to run
 * @returns Promise resolving to tuple of [result1, result2]
 *
 * @example
 * ```typescript
 * // Test concurrent schedulers don't create duplicates
 * const userId = 'test-user-123'
 * await seedEngagementState(createMockEngagementState({
 *   userId,
 *   lastActivityAt: new Date('2025-01-01')
 * }))
 *
 * setupMockTime(new Date('2025-01-15')) // 14 days later
 *
 * // Run two instances concurrently
 * const [result1, result2] = await runConcurrently(
 *   () => runDailyEngagementJob(),
 *   () => runDailyEngagementJob()
 * )
 *
 * // Verify only one message was queued (idempotency)
 * const messages = await getMessagesForUser(userId)
 * expect(messages).toHaveLength(1)
 * ```
 */
export async function runConcurrently<T1, T2>(
  fn1: () => Promise<T1>,
  fn2: () => Promise<T2>
): Promise<[T1, T2]> {
  return Promise.all([fn1(), fn2()])
}
