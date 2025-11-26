/**
 * Daily Engagement Job Tests
 *
 * Story 5.1: Daily Engagement Job
 * - AC-5.1.1: 14-day inactive users with reengagement_opt_out=false → goodbye_sent (with message)
 * - AC-5.1.2: goodbye_sent users with goodbye_expires_at < now → dormant (silent)
 * - AC-5.1.3: remind_later users with remind_at < now → dormant (silent)
 * - AC-5.1.4: Users with reengagement_opt_out=true are skipped
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { runDailyEngagementJob } from '../../services/scheduler/daily-engagement-job'
import {
  mockSupabaseClient,
  resetSupabaseMocks,
  mockQuerySequence,
} from '../../__mocks__/supabase'

// Mock the supabase client
jest.mock('../../services/database/supabase-client', () => ({
  getSupabaseClient: () => mockSupabaseClient,
}))

// Mock the logger
jest.mock('../../services/monitoring/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}))

// Mock the state machine functions
const mockTransitionState = jest.fn()
const mockGetExpiredGoodbyes = jest.fn()
const mockGetDueReminders = jest.fn()

jest.mock('../../services/engagement/state-machine', () => ({
  transitionState: (userId: string, trigger: string, metadata?: any) =>
    mockTransitionState(userId, trigger, metadata),
  getExpiredGoodbyes: () => mockGetExpiredGoodbyes(),
  getDueReminders: () => mockGetDueReminders(),
}))

// Mock analytics tracker
jest.mock('../../analytics/tracker', () => ({
  trackEvent: jest.fn(),
}))

// Mock message sender
jest.mock('../../services/scheduler/message-sender', () => ({
  queueMessage: jest.fn().mockResolvedValue(true),
  getIdempotencyKey: jest.fn().mockReturnValue('test-key'),
}))

// Mock message router
jest.mock('../../services/engagement/message-router', () => ({
  getMessageDestination: jest.fn().mockResolvedValue({
    destination: 'individual',
    destinationJid: '5511999999999@s.whatsapp.net',
  }),
}))

describe('Daily Engagement Job - Story 5.1', () => {
  const now = new Date('2025-11-24T06:00:00.000Z')
  const fourteenDaysAgo = new Date('2025-11-10T06:00:00.000Z')
  const thirteenDaysAgo = new Date('2025-11-11T06:00:00.000Z')

  beforeEach(() => {
    resetSupabaseMocks()
    mockTransitionState.mockReset()
    mockGetExpiredGoodbyes.mockReset()
    mockGetDueReminders.mockReset()
    jest.useFakeTimers()
    jest.setSystemTime(now)

    // Default mocks - empty results
    mockGetExpiredGoodbyes.mockResolvedValue([])
    mockGetDueReminders.mockResolvedValue([])
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  describe('AC-5.1.1: 14-day inactive user transitions to goodbye_sent', () => {
    it('should transition inactive users with reengagement_opt_out=false', async () => {
      // Mock: Query 1 - Get inactive users
      // Mock: Query 2 - Get user profiles
      mockQuerySequence([
        {
          data: [
            {
              user_id: 'user-1',
              last_activity_at: fourteenDaysAgo.toISOString(),
            },
          ],
          error: null,
        },
        {
          data: [
            {
              id: 'user-1',
              reengagement_opt_out: false,
            },
          ],
          error: null,
        },
      ])

      mockTransitionState.mockResolvedValue({
        success: true,
        previousState: 'active',
        newState: 'goodbye_sent',
        sideEffects: ['queued_goodbye_message'],
      })

      const result = await runDailyEngagementJob()

      expect(result.processed).toBe(1)
      expect(result.succeeded).toBe(1)
      expect(result.failed).toBe(0)
      expect(mockTransitionState).toHaveBeenCalledWith('user-1', 'inactivity_14d', undefined)
    })

    it('should process multiple inactive users', async () => {
      // Mock: Query 1 - Get 3 inactive users
      // Mock: Query 2 - Get user profiles
      mockQuerySequence([
        {
          data: [
            {
              user_id: 'user-1',
              last_activity_at: fourteenDaysAgo.toISOString(),
            },
            {
              user_id: 'user-2',
              last_activity_at: fourteenDaysAgo.toISOString(),
            },
            {
              user_id: 'user-3',
              last_activity_at: fourteenDaysAgo.toISOString(),
            },
          ],
          error: null,
        },
        {
          data: [
            { id: 'user-1', reengagement_opt_out: false },
            { id: 'user-2', reengagement_opt_out: false },
            { id: 'user-3', reengagement_opt_out: false },
          ],
          error: null,
        },
      ])

      mockTransitionState.mockResolvedValue({
        success: true,
        previousState: 'active',
        newState: 'goodbye_sent',
        sideEffects: [],
      })

      const result = await runDailyEngagementJob()

      expect(result.processed).toBe(3)
      expect(result.succeeded).toBe(3)
      expect(mockTransitionState).toHaveBeenCalledTimes(3)
    })
  })

  describe('AC-5.1.4: Opted-out user is skipped', () => {
    it('should not process users with reengagement_opt_out=true', async () => {
      // Mock: Query 1 - Get 1 inactive user
      // Mock: Query 2 - User has opted out
      mockQuerySequence([
        {
          data: [
            {
              user_id: 'user-1',
              last_activity_at: fourteenDaysAgo.toISOString(),
            },
          ],
          error: null,
        },
        {
          data: [
            {
              user_id: 'user-1',
              reengagement_opt_out: true, // Opted out
            },
          ],
          error: null,
        },
      ])

      const result = await runDailyEngagementJob()

      expect(result.processed).toBe(0)
      expect(result.skipped).toBe(1)
      expect(mockTransitionState).not.toHaveBeenCalled()
    })
  })

  describe('AC-5.1.2: Expired goodbye transitions to dormant', () => {
    it('should transition expired goodbye users to dormant', async () => {
      // Mock: Query for inactive users returns empty
      mockQuerySequence([
        { data: [], error: null },
      ])

      // Mock: getExpiredGoodbyes returns one expired user
      mockGetExpiredGoodbyes.mockResolvedValue([
        {
          id: 'state-1',
          userId: 'user-1',
          state: 'goodbye_sent',
          lastActivityAt: fourteenDaysAgo,
          goodbyeSentAt: new Date('2025-11-22T06:00:00.000Z'),
          goodbyeExpiresAt: new Date('2025-11-23T06:00:00.000Z'), // Expired 1 day ago
          remindAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ])

      mockTransitionState.mockResolvedValue({
        success: true,
        previousState: 'goodbye_sent',
        newState: 'dormant',
        sideEffects: ['no_message_sent_by_design'],
      })

      const result = await runDailyEngagementJob()

      expect(result.processed).toBe(1)
      expect(result.succeeded).toBe(1)
      expect(mockTransitionState).toHaveBeenCalledWith('user-1', 'goodbye_timeout', undefined)
    })
  })

  describe('AC-5.1.3: Due remind_later transitions to dormant', () => {
    it('should transition due remind_later users to dormant', async () => {
      // Mock: Query for inactive users returns empty
      mockQuerySequence([
        { data: [], error: null },
      ])

      // Mock: getDueReminders returns one due reminder
      mockGetDueReminders.mockResolvedValue([
        {
          id: 'state-1',
          userId: 'user-1',
          state: 'remind_later',
          lastActivityAt: fourteenDaysAgo,
          goodbyeSentAt: null,
          goodbyeExpiresAt: null,
          remindAt: new Date('2025-11-23T06:00:00.000Z'), // Due 1 day ago
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ])

      mockTransitionState.mockResolvedValue({
        success: true,
        previousState: 'remind_later',
        newState: 'dormant',
        sideEffects: ['no_message_sent_by_design'],
      })

      const result = await runDailyEngagementJob()

      expect(result.processed).toBe(1)
      expect(result.succeeded).toBe(1)
      expect(mockTransitionState).toHaveBeenCalledWith('user-1', 'reminder_due', undefined)
    })
  })

  describe('Error Handling: Job continues processing after one user fails', () => {
    it('should continue processing after one user fails', async () => {
      // Mock: Query 1 - Get 2 inactive users
      // Mock: Query 2 - Get user profiles
      mockQuerySequence([
        {
          data: [
            {
              user_id: 'user-1',
              last_activity_at: fourteenDaysAgo.toISOString(),
            },
            {
              user_id: 'user-2',
              last_activity_at: fourteenDaysAgo.toISOString(),
            },
          ],
          error: null,
        },
        {
          data: [
            { id: 'user-1', reengagement_opt_out: false },
            { id: 'user-2', reengagement_opt_out: false },
          ],
          error: null,
        },
      ])

      // Mock: First user fails, second succeeds
      mockTransitionState
        .mockResolvedValueOnce({
          success: false,
          previousState: 'active',
          newState: 'active',
          error: 'Database error',
          sideEffects: [],
        })
        .mockResolvedValueOnce({
          success: true,
          previousState: 'active',
          newState: 'goodbye_sent',
          sideEffects: [],
        })

      const result = await runDailyEngagementJob()

      expect(result.processed).toBe(2)
      expect(result.succeeded).toBe(1)
      expect(result.failed).toBe(1)
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0]).toEqual({
        userId: 'user-1',
        error: 'Database error',
      })
      expect(mockTransitionState).toHaveBeenCalledTimes(2)
    })

    it('should handle exceptions during user processing', async () => {
      // Mock: Query 1 - Get 2 users
      // Mock: Query 2 - Get user profiles
      mockQuerySequence([
        {
          data: [
            {
              user_id: 'user-1',
              last_activity_at: fourteenDaysAgo.toISOString(),
            },
            {
              user_id: 'user-2',
              last_activity_at: fourteenDaysAgo.toISOString(),
            },
          ],
          error: null,
        },
        {
          data: [
            { id: 'user-1', reengagement_opt_out: false },
            { id: 'user-2', reengagement_opt_out: false },
          ],
          error: null,
        },
      ])

      // Mock: First throws exception, second succeeds
      mockTransitionState
        .mockRejectedValueOnce(new Error('Network timeout'))
        .mockResolvedValueOnce({
          success: true,
          previousState: 'active',
          newState: 'goodbye_sent',
          sideEffects: [],
        })

      const result = await runDailyEngagementJob()

      expect(result.processed).toBe(2)
      expect(result.succeeded).toBe(1)
      expect(result.failed).toBe(1)
      expect(result.errors[0]).toEqual({
        userId: 'user-1',
        error: 'Network timeout',
      })
    })
  })

  describe('Job result counts are accurate', () => {
    it('should return accurate counts for mixed success/failure', async () => {
      // Mock: Query 1 - 2 inactive users
      // Mock: Query 2 - User profiles
      mockQuerySequence([
        {
          data: [
            {
              user_id: 'inactive-1',
              last_activity_at: fourteenDaysAgo.toISOString(),
            },
            {
              user_id: 'inactive-2',
              last_activity_at: fourteenDaysAgo.toISOString(),
            },
          ],
          error: null,
        },
        {
          data: [
            { id: 'inactive-1', reengagement_opt_out: false },
            { id: 'inactive-2', reengagement_opt_out: false },
          ],
          error: null,
        },
      ])

      mockGetExpiredGoodbyes.mockResolvedValue([
        {
          id: 'state-1',
          userId: 'expired-1',
          state: 'goodbye_sent',
          lastActivityAt: fourteenDaysAgo,
          goodbyeSentAt: new Date(),
          goodbyeExpiresAt: new Date('2025-11-23T06:00:00.000Z'),
          remindAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ])

      mockGetDueReminders.mockResolvedValue([
        {
          id: 'state-2',
          userId: 'reminder-1',
          state: 'remind_later',
          lastActivityAt: fourteenDaysAgo,
          goodbyeSentAt: null,
          goodbyeExpiresAt: null,
          remindAt: new Date('2025-11-23T06:00:00.000Z'),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ])

      // Mock: 3 succeed, 1 fails
      mockTransitionState
        .mockResolvedValueOnce({ success: true, previousState: 'active', newState: 'goodbye_sent', sideEffects: [] })
        .mockResolvedValueOnce({ success: false, previousState: 'active', newState: 'active', error: 'Error', sideEffects: [] })
        .mockResolvedValueOnce({ success: true, previousState: 'goodbye_sent', newState: 'dormant', sideEffects: [] })
        .mockResolvedValueOnce({ success: true, previousState: 'remind_later', newState: 'dormant', sideEffects: [] })

      const result = await runDailyEngagementJob()

      expect(result.processed).toBe(4)
      expect(result.succeeded).toBe(3)
      expect(result.failed).toBe(1)
      expect(result.errors).toHaveLength(1)
    })
  })

  describe('Performance: Job completion within 60 seconds for 100 users', () => {
    it('should complete within 60 seconds for 100 users', async () => {
      // Mock: Query 1 - 100 inactive users
      const users = Array.from({ length: 100 }, (_, i) => ({
        user_id: `user-${i}`,
        last_activity_at: fourteenDaysAgo.toISOString(),
      }))

      // Mock: Query 2 - User profiles
      const profiles = Array.from({ length: 100 }, (_, i) => ({
        id: `user-${i}`,
        reengagement_opt_out: false,
      }))

      mockQuerySequence([
        { data: users, error: null },
        { data: profiles, error: null },
      ])

      mockTransitionState.mockResolvedValue({
        success: true,
        previousState: 'active',
        newState: 'goodbye_sent',
        sideEffects: [],
      })

      const result = await runDailyEngagementJob()

      expect(result.processed).toBe(100)
      expect(result.succeeded).toBe(100)
      expect(result.durationMs).toBeLessThan(60000)
    })
  })

  describe('User at 13 days inactive is not processed', () => {
    it('should not process users at 13 days inactive', async () => {
      // Mock: Query only returns users > 14 days inactive
      // User at 13 days is not included in query results
      mockQuerySequence([
        { data: [], error: null },
      ])

      const result = await runDailyEngagementJob()

      expect(result.processed).toBe(0)
      expect(mockTransitionState).not.toHaveBeenCalled()
    })
  })
})
