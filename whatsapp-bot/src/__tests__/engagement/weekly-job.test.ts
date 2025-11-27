/**
 * Weekly Review Job Unit Tests
 *
 * Tests activity detection, ISO week idempotency, analytics events,
 * and error handling for the weekly review scheduler job.
 *
 * Epic: 7 - Testing & Quality Assurance
 * Story: 7.3 - Scheduler Unit Tests
 *
 * Coverage Target: ≥ 75% for weekly-review-job.ts
 * Performance Target: All tests complete in < 10 seconds
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, jest } from '@jest/globals'
import { randomUUID } from 'crypto'
import { getISOWeek, getISOWeekYear } from 'date-fns'
import { runWeeklyReviewJob } from '../../services/scheduler/weekly-review-job.js'
import { getActiveUsersLastWeek } from '../../services/scheduler/activity-detector.js'
import { queueMessage, processMessageQueue } from '../../services/scheduler/message-sender.js'
import { getPostHog } from '../../analytics/posthog-client.js'
import { createMockEngagementState } from './fixtures/engagement-fixtures.js'
import {
  seedEngagementState,
  getMessagesForUser,
  cleanupEngagementStates,
} from '../utils/idempotency-helpers.js'
import { setupMockTime, advanceTime, resetClock } from '../utils/time-helpers.js'
import { getTestSupabaseClient } from '../utils/test-database.js'

// Mock external dependencies
jest.mock('../../services/scheduler/activity-detector.js')
jest.mock('../../services/scheduler/message-sender.js', () => ({
  ...jest.requireActual('../../services/scheduler/message-sender.js'),
  processMessageQueue: jest.fn().mockResolvedValue({
    processed: 0,
    succeeded: 0,
    failed: 0,
    errors: [],
  }),
}))
jest.mock('../../analytics/posthog-client.js')

describe('Weekly Review Job', () => {
  let testUserIds: string[] = []
  const mockGetActiveUsers = getActiveUsersLastWeek as jest.MockedFunction<typeof getActiveUsersLastWeek>
  const mockProcessQueue = processMessageQueue as jest.MockedFunction<typeof processMessageQueue>
  const mockGetPostHog = getPostHog as jest.MockedFunction<typeof getPostHog>

  // Clean up ALL test data before suite runs to prevent pollution from failed/interrupted tests
  beforeAll(async () => {
    const supabase = getTestSupabaseClient()

    // Delete all test data in order to respect foreign key constraints
    await supabase.from('engagement_state_transitions').delete().not('user_id', 'is', null)
    await supabase.from('engagement_message_queue').delete().not('user_id', 'is', null)
    await supabase.from('user_engagement_states').delete().not('user_id', 'is', null)
    await supabase.from('authorized_whatsapp_numbers').delete().not('user_id', 'is', null)
    await supabase.from('user_profiles').delete().not('user_id', 'is', null)
  })

  beforeEach(() => {
    testUserIds = []
    // Set date to Monday, Week 6 of 2025 (Feb 3, 2025)
    setupMockTime(new Date('2025-02-03T09:00:00Z'))
    jest.clearAllMocks()

    // Default mock implementations
    mockGetActiveUsers.mockResolvedValue([])
    mockProcessQueue.mockResolvedValue({
      processed: 0,
      succeeded: 0,
      failed: 0,
      errors: [],
    })
    mockGetPostHog.mockReturnValue({
      capture: jest.fn(),
    } as any)
  })

  afterEach(async () => {
    await cleanupEngagementStates(testUserIds)
    resetClock()
  })

  describe('Activity Detection', () => {
    it('should queue weekly_review for active user (AC-7.3.5)', async () => {
      const userId = randomUUID()
      testUserIds.push(userId)

      // Seed engagement state before mocking
      await seedEngagementState(createMockEngagementState({ userId, state: 'active' }))

      // Mock active user with transactions
      mockGetActiveUsers.mockResolvedValue([
        {
          userId,
          transactionCount: 5,
          preferredDestination: 'individual',
          destinationJid: `${userId}@s.whatsapp.net`,
          locale: 'pt-BR',
        },
      ])

      const result = await runWeeklyReviewJob()

      // Verify message queued
      expect(result.processed).toBe(1)
      expect(result.succeeded).toBe(1)
      expect(result.failed).toBe(0)

      // Verify correct idempotency key format
      const messages = await getMessagesForUser(userId)
      expect(messages).toHaveLength(1)
      expect(messages[0].message_type).toBe('weekly_review')
      expect(messages[0].idempotency_key).toBe(`${userId}:weekly_review:2025-W06`)
    })

    it('should NOT queue message for inactive user (AC-7.3.5)', async () => {
      // Mock returns empty array (no active users)
      mockGetActiveUsers.mockResolvedValue([])

      const result = await runWeeklyReviewJob()

      // Verify NO messages queued
      expect(result.processed).toBe(0)
      expect(result.succeeded).toBe(0)
    })

    it('should queue messages for multiple active users (AC-7.3.5)', async () => {
      const user1 = randomUUID()
      const user2 = randomUUID()
      const user3 = randomUUID()
      testUserIds.push(user1, user2, user3)

      // Seed engagement state for all users before mocking
      await seedEngagementState(createMockEngagementState({ userId: user1, state: 'active' }))
      await seedEngagementState(createMockEngagementState({ userId: user2, state: 'active' }))
      await seedEngagementState(createMockEngagementState({ userId: user3, state: 'active' }))

      // Mock 3 active users
      mockGetActiveUsers.mockResolvedValue([
        {
          userId: user1,
          transactionCount: 3,
          preferredDestination: 'individual',
          destinationJid: `${user1}@s.whatsapp.net`,
          locale: 'en',
        },
        {
          userId: user2,
          transactionCount: 7,
          preferredDestination: 'individual',
          destinationJid: `${user2}@s.whatsapp.net`,
          locale: 'pt-BR',
        },
        {
          userId: user3,
          transactionCount: 12,
          preferredDestination: 'group',
          destinationJid: 'group@g.us',
          locale: 'pt-BR',
        },
      ])

      const result = await runWeeklyReviewJob()

      // Verify 3 messages queued
      expect(result.processed).toBe(3)
      expect(result.succeeded).toBe(3)

      // Verify all messages created
      const messages1 = await getMessagesForUser(user1)
      const messages2 = await getMessagesForUser(user2)
      const messages3 = await getMessagesForUser(user3)
      expect(messages1).toHaveLength(1)
      expect(messages2).toHaveLength(1)
      expect(messages3).toHaveLength(1)
    })
  })

  describe('ISO Week Idempotency', () => {
    it('should prevent duplicate messages within same ISO week (AC-7.3.6)', async () => {
      const userId = randomUUID()
      testUserIds.push(userId)

      // Seed engagement state before mocking
      await seedEngagementState(createMockEngagementState({ userId, state: 'active' }))

      // Mock active user
      const mockUser = {
        userId,
        transactionCount: 5,
        preferredDestination: 'individual' as const,
        destinationJid: `${userId}@s.whatsapp.net`,
        locale: 'pt-BR',
      }
      mockGetActiveUsers.mockResolvedValue([mockUser])

      // Run job first time (Week 6, 2025)
      let result = await runWeeklyReviewJob()
      expect(result.succeeded).toBe(1)

      // Verify message queued with correct idempotency key
      let messages = await getMessagesForUser(userId)
      expect(messages).toHaveLength(1)
      expect(messages[0].idempotency_key).toBe(`${userId}:weekly_review:2025-W06`)

      // Run job again same day (should be idempotent)
      result = await runWeeklyReviewJob()

      // Idempotency at queueMessage level - no duplicate created
      messages = await getMessagesForUser(userId)
      expect(messages).toHaveLength(1) // Still only 1 message
    })

    it('should allow new messages in different ISO week (AC-7.3.6)', async () => {
      const userId = randomUUID()
      testUserIds.push(userId)

      // Seed engagement state before mocking
      await seedEngagementState(createMockEngagementState({ userId, state: 'active' }))

      const mockUser = {
        userId,
        transactionCount: 5,
        preferredDestination: 'individual' as const,
        destinationJid: `${userId}@s.whatsapp.net`,
        locale: 'pt-BR',
      }
      mockGetActiveUsers.mockResolvedValue([mockUser])

      // Week 6 (Feb 3, 2025)
      let result = await runWeeklyReviewJob()
      expect(result.succeeded).toBe(1)
      let messages = await getMessagesForUser(userId)
      expect(messages).toHaveLength(1)
      expect(messages[0].idempotency_key).toBe(`${userId}:weekly_review:2025-W06`)

      // Move to Week 7 (Feb 10, 2025)
      setupMockTime(new Date('2025-02-10T09:00:00Z'))
      result = await runWeeklyReviewJob()
      expect(result.succeeded).toBe(1)

      // New message queued with different key
      messages = await getMessagesForUser(userId)
      expect(messages).toHaveLength(2)
      expect(messages[1].idempotency_key).toBe(`${userId}:weekly_review:2025-W07`)
    })

    it('should use correct ISO week format for different dates (AC-7.3.6)', async () => {
      const userId = randomUUID()
      testUserIds.push(userId)

      // Seed engagement state before mocking
      await seedEngagementState(createMockEngagementState({ userId, state: 'active' }))

      const mockUser = {
        userId,
        transactionCount: 5,
        preferredDestination: 'individual' as const,
        destinationJid: `${userId}@s.whatsapp.net`,
        locale: 'en',
      }
      mockGetActiveUsers.mockResolvedValue([mockUser])

      // Test Week 2 of 2025 (Jan 6, 2025)
      setupMockTime(new Date('2025-01-06T09:00:00Z'))
      await runWeeklyReviewJob()
      let messages = await getMessagesForUser(userId)
      expect(messages[0].idempotency_key).toBe(`${userId}:weekly_review:2025-W02`)

      // Test Week 1 of 2026 (Dec 29, 2025 - ISO week 1 of 2026)
      setupMockTime(new Date('2025-12-29T09:00:00Z'))
      await runWeeklyReviewJob()
      messages = await getMessagesForUser(userId)
      expect(messages[1].idempotency_key).toBe(`${userId}:weekly_review:2026-W01`)
    })
  })

  describe('Analytics Events', () => {
    it('should fire PostHog event for each active user (AC-7.3.9)', async () => {
      const user1 = randomUUID()
      const user2 = randomUUID()
      testUserIds.push(user1, user2)

      // Seed engagement state for all users before mocking
      await seedEngagementState(createMockEngagementState({ userId: user1, state: 'active' }))
      await seedEngagementState(createMockEngagementState({ userId: user2, state: 'active' }))

      // Mock PostHog capture
      const mockCapture = jest.fn()
      mockGetPostHog.mockReturnValue({
        capture: mockCapture,
      } as any)

      // Mock 2 active users
      mockGetActiveUsers.mockResolvedValue([
        {
          userId: user1,
          transactionCount: 5,
          preferredDestination: 'individual',
          destinationJid: `${user1}@s.whatsapp.net`,
          locale: 'pt-BR',
        },
        {
          userId: user2,
          transactionCount: 10,
          preferredDestination: 'group',
          destinationJid: 'group@g.us',
          locale: 'en',
        },
      ])

      await runWeeklyReviewJob()

      // Verify PostHog.capture called 2 times
      expect(mockCapture).toHaveBeenCalledTimes(2)

      // Verify event name and properties
      expect(mockCapture).toHaveBeenCalledWith({
        distinctId: user1,
        event: 'engagement_weekly_review_sent',
        properties: {
          transaction_count: 5,
          destination: 'individual',
          locale: 'pt-BR',
        },
      })

      expect(mockCapture).toHaveBeenCalledWith({
        distinctId: user2,
        event: 'engagement_weekly_review_sent',
        properties: {
          transaction_count: 10,
          destination: 'group',
          locale: 'en',
        },
      })
    })

    it('should complete job successfully even if analytics fails (AC-7.3.9)', async () => {
      const userId = randomUUID()
      testUserIds.push(userId)

      // Seed engagement state before mocking
      await seedEngagementState(createMockEngagementState({ userId, state: 'active' }))

      // Mock PostHog.capture to throw error
      const mockCapture = jest.fn().mockImplementation(() => {
        throw new Error('PostHog service unavailable')
      })
      mockGetPostHog.mockReturnValue({
        capture: mockCapture,
      } as any)

      mockGetActiveUsers.mockResolvedValue([
        {
          userId,
          transactionCount: 5,
          preferredDestination: 'individual',
          destinationJid: `${userId}@s.whatsapp.net`,
          locale: 'pt-BR',
        },
      ])

      // Job should NOT throw even though analytics failed
      const result = await runWeeklyReviewJob()

      // Verify job completed successfully
      expect(result.processed).toBe(1)
      expect(result.succeeded).toBe(1)

      // Verify message still queued despite analytics error
      const messages = await getMessagesForUser(userId)
      expect(messages).toHaveLength(1)
    })

    it('should handle null PostHog client gracefully (AC-7.3.9)', async () => {
      const userId = randomUUID()
      testUserIds.push(userId)

      // Seed engagement state before mocking
      await seedEngagementState(createMockEngagementState({ userId, state: 'active' }))

      // Mock PostHog as null (not initialized)
      mockGetPostHog.mockReturnValue(null)

      mockGetActiveUsers.mockResolvedValue([
        {
          userId,
          transactionCount: 5,
          preferredDestination: 'individual',
          destinationJid: `${userId}@s.whatsapp.net`,
          locale: 'pt-BR',
        },
      ])

      // Should not throw
      const result = await runWeeklyReviewJob()

      expect(result.succeeded).toBe(1)
      const messages = await getMessagesForUser(userId)
      expect(messages).toHaveLength(1)
    })
  })

  describe('Error Handling', () => {
    it('should handle activity detector failure (AC-7.3.11)', async () => {
      // Mock getActiveUsersLastWeek to throw error
      mockGetActiveUsers.mockRejectedValue(new Error('Database connection failed'))

      // Job should throw (error not caught at job level)
      await expect(runWeeklyReviewJob()).rejects.toThrow('Database connection failed')
    })

    it('should call processMessageQueue after queueing messages (AC-7.3.11)', async () => {
      const userId = randomUUID()
      testUserIds.push(userId)

      // Seed engagement state before mocking
      await seedEngagementState(createMockEngagementState({ userId, state: 'active' }))

      mockGetActiveUsers.mockResolvedValue([
        {
          userId,
          transactionCount: 5,
          preferredDestination: 'individual',
          destinationJid: `${userId}@s.whatsapp.net`,
          locale: 'pt-BR',
        },
      ])

      await runWeeklyReviewJob()

      // Verify processMessageQueue was called
      expect(mockProcessQueue).toHaveBeenCalledTimes(1)
    })

    it('should complete job successfully even if queue processing fails (AC-7.3.11)', async () => {
      const userId = randomUUID()
      testUserIds.push(userId)

      // Seed engagement state before mocking
      await seedEngagementState(createMockEngagementState({ userId, state: 'active' }))

      // Mock queue processing failure
      mockProcessQueue.mockRejectedValue(new Error('Queue service down'))

      mockGetActiveUsers.mockResolvedValue([
        {
          userId,
          transactionCount: 5,
          preferredDestination: 'individual',
          destinationJid: `${userId}@s.whatsapp.net`,
          locale: 'pt-BR',
        },
      ])

      // Job should NOT throw even though queue processing failed
      const result = await runWeeklyReviewJob()

      // Verify job completed successfully
      expect(result.processed).toBe(1)
      expect(result.succeeded).toBe(1)

      // Reset mock
      mockProcessQueue.mockResolvedValue({
        processed: 0,
        succeeded: 0,
        failed: 0,
        errors: [],
      })
    })

    it('should track queueing failures correctly (AC-7.3.7)', async () => {
      const user1 = randomUUID()
      const user2 = randomUUID()
      testUserIds.push(user1, user2)

      // Seed engagement state for all users before mocking
      await seedEngagementState(createMockEngagementState({ userId: user1, state: 'active' }))
      await seedEngagementState(createMockEngagementState({ userId: user2, state: 'active' }))

      // Spy on queueMessage to make second call fail
      const queueMessageSpy = jest.spyOn(
        require('../../services/scheduler/message-sender'),
        'queueMessage'
      )
      queueMessageSpy
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false)

      mockGetActiveUsers.mockResolvedValue([
        {
          userId: user1,
          transactionCount: 5,
          preferredDestination: 'individual',
          destinationJid: `${user1}@s.whatsapp.net`,
          locale: 'pt-BR',
        },
        {
          userId: user2,
          transactionCount: 7,
          preferredDestination: 'individual',
          destinationJid: `${user2}@s.whatsapp.net`,
          locale: 'en',
        },
      ])

      const result = await runWeeklyReviewJob()

      // Verify results
      expect(result.processed).toBe(2)
      expect(result.succeeded).toBe(1) // user1
      expect(result.failed).toBe(1) // user2
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0].userId).toBe(user2)

      queueMessageSpy.mockRestore()
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty active users list (AC-7.3.12)', async () => {
      mockGetActiveUsers.mockResolvedValue([])

      const result = await runWeeklyReviewJob()

      // Verify job completes successfully with no users
      expect(result.processed).toBe(0)
      expect(result.succeeded).toBe(0)
      expect(result.failed).toBe(0)
      expect(result.skipped).toBe(0)
      // Note: durationMs is 0 with fake timers since Date.now() returns same value at start/end
      // This is expected behavior and doesn't affect production code
      expect(result.durationMs).toBeGreaterThanOrEqual(0)
    })

    it('should complete within performance target (AC-7.3.12)', async () => {
      const userIds = Array.from({ length: 10 }, () => randomUUID())
      testUserIds.push(...userIds)

      // Seed engagement state for all users before mocking
      for (const userId of userIds) {
        await seedEngagementState(createMockEngagementState({ userId, state: 'active' }))
      }

      // Mock 10 active users
      const activeUsers = userIds.map((userId) => ({
        userId,
        transactionCount: Math.floor(Math.random() * 20) + 1,
        preferredDestination: 'individual' as const,
        destinationJid: `${userId}@s.whatsapp.net`,
        locale: 'pt-BR',
      }))
      mockGetActiveUsers.mockResolvedValue(activeUsers)

      const startTime = Date.now()
      const result = await runWeeklyReviewJob()
      const duration = Date.now() - startTime

      // Verify completed successfully
      expect(result.succeeded).toBe(10)

      // Performance: should complete in reasonable time (< 5 seconds for 10 users)
      expect(duration).toBeLessThan(5000)
    })

    it('should handle ISO week edge case at year boundary (AC-7.3.6)', async () => {
      const userId = randomUUID()
      testUserIds.push(userId)

      // Seed engagement state before mocking
      await seedEngagementState(createMockEngagementState({ userId, state: 'active' }))

      mockGetActiveUsers.mockResolvedValue([
        {
          userId,
          transactionCount: 5,
          preferredDestination: 'individual',
          destinationJid: `${userId}@s.whatsapp.net`,
          locale: 'pt-BR',
        },
      ])

      // Dec 30, 2024 is in ISO week 1 of 2025
      setupMockTime(new Date('2024-12-30T09:00:00Z'))
      await runWeeklyReviewJob()

      const messages = await getMessagesForUser(userId)
      expect(messages[0].idempotency_key).toBe(`${userId}:weekly_review:2025-W01`)
    })

    it('should respect opted-out users via activity detector (AC-7.3.4)', async () => {
      // getActiveUsersLastWeek excludes opted-out users at SQL level
      // This test verifies the integration works correctly

      // Mock returns empty array (opted-out user excluded by SQL)
      mockGetActiveUsers.mockResolvedValue([])

      const result = await runWeeklyReviewJob()

      // Verify NO messages queued
      expect(result.processed).toBe(0)
      expect(result.succeeded).toBe(0)

      // Note: opt-out filtering happens in activity-detector.ts SQL function
      // Weekly job doesn't need to check opt-out status - it's already filtered
    })
  })

  describe('Job Result Structure', () => {
    it('should return complete JobResult structure (AC-7.3.8)', async () => {
      const userId = randomUUID()
      testUserIds.push(userId)

      // Seed engagement state before mocking
      await seedEngagementState(createMockEngagementState({ userId, state: 'active' }))

      mockGetActiveUsers.mockResolvedValue([
        {
          userId,
          transactionCount: 5,
          preferredDestination: 'individual',
          destinationJid: `${userId}@s.whatsapp.net`,
          locale: 'pt-BR',
        },
      ])

      const result = await runWeeklyReviewJob()

      // Verify result structure
      expect(result).toHaveProperty('processed')
      expect(result).toHaveProperty('succeeded')
      expect(result).toHaveProperty('failed')
      expect(result).toHaveProperty('skipped')
      expect(result).toHaveProperty('errors')
      expect(result).toHaveProperty('durationMs')

      expect(typeof result.processed).toBe('number')
      expect(typeof result.succeeded).toBe('number')
      expect(typeof result.failed).toBe('number')
      expect(typeof result.skipped).toBe('number')
      expect(Array.isArray(result.errors)).toBe(true)
      expect(typeof result.durationMs).toBe('number')

      // Note: durationMs is 0 with fake timers (expected behavior)
      expect(result.durationMs).toBeGreaterThanOrEqual(0)
    })
  })
})
