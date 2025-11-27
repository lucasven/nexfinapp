/**
 * Weekly Review Job Tests
 *
 * Story 5.3: Weekly Review Job & Message
 * - AC-5.3.1: Active users receive weekly_review message to preferred destination
 * - AC-5.3.2: Users with no activity receive NO message
 * - AC-5.3.3: Idempotency via {userId}:weekly_review:{YYYY-Www} key
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { runWeeklyReviewJob } from '../../services/scheduler/weekly-review-job'
import { getISOWeek, getISOWeekYear } from 'date-fns'

// Mock the activity detector
const mockGetActiveUsersLastWeek = jest.fn()
jest.mock('../../services/scheduler/activity-detector', () => ({
  getActiveUsersLastWeek: () => mockGetActiveUsersLastWeek(),
}))

// Mock the message sender
const mockQueueMessage = jest.fn()
jest.mock('../../services/scheduler/message-sender', () => ({
  queueMessage: (params: any) => mockQueueMessage(params),
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

// Mock PostHog
const mockPostHogCapture = jest.fn()
jest.mock('../../analytics/posthog-client', () => ({
  getPostHog: () => ({
    capture: mockPostHogCapture,
  }),
}))

describe('Weekly Review Job - Story 5.3', () => {
  const now = new Date('2025-11-24T09:00:00.000Z') // Monday 9 AM UTC
  const weekYear = getISOWeekYear(now)
  const weekNumber = getISOWeek(now)
  const weekNumberStr = weekNumber.toString().padStart(2, '0')
  const expectedIdempotencyKey = `user-1:weekly_review:${weekYear}-W${weekNumberStr}`

  beforeEach(() => {
    mockGetActiveUsersLastWeek.mockReset()
    mockQueueMessage.mockReset()
    mockPostHogCapture.mockReset()
    jest.useFakeTimers()
    jest.setSystemTime(now)

    // Default: queueMessage succeeds
    mockQueueMessage.mockResolvedValue(true)
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  describe('AC-5.3.1: Active user with transactions receives weekly review', () => {
    it('should queue weekly review message for active user', async () => {
      // Setup: 1 active user with 3 transactions
      mockGetActiveUsersLastWeek.mockResolvedValue([
        {
          userId: 'user-1',
          transactionCount: 3,
          lastActivityAt: new Date('2025-11-23T10:00:00.000Z'),
          preferredDestination: 'individual',
          destinationJid: '5511999999999@s.whatsapp.net',
          locale: 'pt-BR',
        },
      ])

      // Execute
      const result = await runWeeklyReviewJob()

      // Verify: queueMessage called with correct params
      expect(mockQueueMessage).toHaveBeenCalledTimes(1)
      expect(mockQueueMessage).toHaveBeenCalledWith({
        userId: 'user-1',
        messageType: 'weekly_review',
        messageKey: 'engagementWeeklyReviewCelebration',
        messageParams: {
          count: 3,
        },
        destination: 'individual',
        destinationJid: '5511999999999@s.whatsapp.net',
        scheduledFor: now,
        idempotencyKey: expectedIdempotencyKey,
      })

      // Verify: PostHog event fired
      expect(mockPostHogCapture).toHaveBeenCalledWith({
        distinctId: 'user-1',
        event: 'engagement_weekly_review_sent',
        properties: {
          transaction_count: 3,
          destination: 'individual',
          locale: 'pt-BR',
        },
      })

      // Verify: Job result
      expect(result.processed).toBe(1)
      expect(result.succeeded).toBe(1)
      expect(result.failed).toBe(0)
      expect(result.errors).toHaveLength(0)
    })
  })

  describe('AC-5.3.2: User with bot activity only (no transactions) receives weekly review', () => {
    it('should queue weekly review with count=0 for users with bot activity only', async () => {
      // Setup: 1 active user with 0 transactions (bot activity only)
      mockGetActiveUsersLastWeek.mockResolvedValue([
        {
          userId: 'user-2',
          transactionCount: 0,
          lastActivityAt: new Date('2025-11-23T10:00:00.000Z'),
          preferredDestination: 'group',
          destinationJid: '120363123456789@g.us',
          locale: 'en',
        },
      ])

      // Execute
      const result = await runWeeklyReviewJob()

      // Verify: queueMessage called with count=0
      expect(mockQueueMessage).toHaveBeenCalledTimes(1)
      expect(mockQueueMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          messageParams: {
            count: 0,
          },
        })
      )

      // Verify: Job succeeded
      expect(result.succeeded).toBe(1)
    })
  })

  describe('AC-5.3.2: User with no activity does NOT receive message', () => {
    it('should not call queueMessage when no active users', async () => {
      // Setup: No active users
      mockGetActiveUsersLastWeek.mockResolvedValue([])

      // Execute
      const result = await runWeeklyReviewJob()

      // Verify: queueMessage NOT called
      expect(mockQueueMessage).not.toHaveBeenCalled()

      // Verify: Job result
      expect(result.processed).toBe(0)
      expect(result.succeeded).toBe(0)
    })
  })

  describe('AC-5.3.3: ISO week format consistency (same key for Mon-Sun)', () => {
    it('should generate same idempotency key for all days within same week', () => {
      // Week 48 of 2025: Monday Nov 24 - Sunday Nov 30
      const monday = new Date('2025-11-24T09:00:00.000Z')
      const wednesday = new Date('2025-11-26T09:00:00.000Z')
      const sunday = new Date('2025-11-30T09:00:00.000Z')

      // Generate keys for different days
      const mondayWeekYear = getISOWeekYear(monday)
      const mondayWeekNumber = getISOWeek(monday)
      const mondayWeekNumberStr = mondayWeekNumber.toString().padStart(2, '0')
      const mondayKey = `user-1:weekly_review:${mondayWeekYear}-W${mondayWeekNumberStr}`

      const wednesdayWeekYear = getISOWeekYear(wednesday)
      const wednesdayWeekNumber = getISOWeek(wednesday)
      const wednesdayWeekNumberStr = wednesdayWeekNumber.toString().padStart(2, '0')
      const wednesdayKey = `user-1:weekly_review:${wednesdayWeekYear}-W${wednesdayWeekNumberStr}`

      const sundayWeekYear = getISOWeekYear(sunday)
      const sundayWeekNumber = getISOWeek(sunday)
      const sundayWeekNumberStr = sundayWeekNumber.toString().padStart(2, '0')
      const sundayKey = `user-1:weekly_review:${sundayWeekYear}-W${sundayWeekNumberStr}`

      // Verify: All keys are identical
      expect(mondayKey).toBe(wednesdayKey)
      expect(mondayKey).toBe(sundayKey)
      expect(mondayKey).toBe('user-1:weekly_review:2025-W48')
    })
  })

  describe('AC-5.3.3: Job continues processing after one user fails', () => {
    it('should process all users even if one fails', async () => {
      // Setup: 3 active users
      mockGetActiveUsersLastWeek.mockResolvedValue([
        {
          userId: 'user-1',
          transactionCount: 3,
          lastActivityAt: new Date('2025-11-23T10:00:00.000Z'),
          preferredDestination: 'individual',
          destinationJid: '5511999999999@s.whatsapp.net',
          locale: 'pt-BR',
        },
        {
          userId: 'user-2',
          transactionCount: 5,
          lastActivityAt: new Date('2025-11-23T11:00:00.000Z'),
          preferredDestination: 'individual',
          destinationJid: '5511888888888@s.whatsapp.net',
          locale: 'pt-BR',
        },
        {
          userId: 'user-3',
          transactionCount: 2,
          lastActivityAt: new Date('2025-11-23T12:00:00.000Z'),
          preferredDestination: 'individual',
          destinationJid: '5511777777777@s.whatsapp.net',
          locale: 'pt-BR',
        },
      ])

      // Mock: Second user fails (queueMessage returns false)
      mockQueueMessage
        .mockResolvedValueOnce(true) // user-1 succeeds
        .mockResolvedValueOnce(false) // user-2 fails
        .mockResolvedValueOnce(true) // user-3 succeeds

      // Execute
      const result = await runWeeklyReviewJob()

      // Verify: All 3 users processed
      expect(result.processed).toBe(3)
      expect(result.succeeded).toBe(2)
      expect(result.failed).toBe(1)
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0].userId).toBe('user-2')
    })
  })

  describe('Job result counts are accurate', () => {
    it('should track accurate counts for multiple users', async () => {
      // Setup: 5 active users
      const users = Array.from({ length: 5 }, (_, i) => ({
        userId: `user-${i + 1}`,
        transactionCount: i + 1,
        lastActivityAt: new Date('2025-11-23T10:00:00.000Z'),
        preferredDestination: 'individual' as const,
        destinationJid: `551199999999${i}@s.whatsapp.net`,
        locale: 'pt-BR',
      }))

      mockGetActiveUsersLastWeek.mockResolvedValue(users)

      // All succeed
      mockQueueMessage.mockResolvedValue(true)

      // Execute
      const result = await runWeeklyReviewJob()

      // Verify
      expect(result.processed).toBe(5)
      expect(result.succeeded).toBe(5)
      expect(result.failed).toBe(0)
      expect(result.skipped).toBe(0)
      expect(result.durationMs).toBeGreaterThanOrEqual(0)
    })
  })

  describe('Exception handling', () => {
    it('should catch exceptions from queueMessage and continue processing', async () => {
      // Setup: 2 users
      mockGetActiveUsersLastWeek.mockResolvedValue([
        {
          userId: 'user-1',
          transactionCount: 3,
          lastActivityAt: new Date('2025-11-23T10:00:00.000Z'),
          preferredDestination: 'individual',
          destinationJid: '5511999999999@s.whatsapp.net',
          locale: 'pt-BR',
        },
        {
          userId: 'user-2',
          transactionCount: 5,
          lastActivityAt: new Date('2025-11-23T11:00:00.000Z'),
          preferredDestination: 'individual',
          destinationJid: '5511888888888@s.whatsapp.net',
          locale: 'pt-BR',
        },
      ])

      // Mock: First user throws exception
      mockQueueMessage
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(true)

      // Execute
      const result = await runWeeklyReviewJob()

      // Verify: Job continues and processes second user
      expect(result.processed).toBe(2)
      expect(result.succeeded).toBe(1)
      expect(result.failed).toBe(1)
      expect(result.errors[0].error).toBe('Network error')
    })

    it('should throw if getActiveUsersLastWeek fails', async () => {
      // Setup: activity detector throws
      mockGetActiveUsersLastWeek.mockRejectedValue(new Error('Database error'))

      // Execute & Verify: Job throws
      await expect(runWeeklyReviewJob()).rejects.toThrow('Database error')
    })
  })

  describe('Routing to group destinations', () => {
    it('should queue message to group JID when preferredDestination is group', async () => {
      // Setup: Active user with group preference
      mockGetActiveUsersLastWeek.mockResolvedValue([
        {
          userId: 'user-1',
          transactionCount: 7,
          lastActivityAt: new Date('2025-11-23T10:00:00.000Z'),
          preferredDestination: 'group',
          destinationJid: '120363123456789@g.us',
          locale: 'pt-BR',
        },
      ])

      // Execute
      await runWeeklyReviewJob()

      // Verify: Correct destination
      expect(mockQueueMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          destination: 'group',
          destinationJid: '120363123456789@g.us',
        })
      )
    })
  })

  describe('Localization support', () => {
    it('should include locale in PostHog event', async () => {
      // Setup: User with English locale
      mockGetActiveUsersLastWeek.mockResolvedValue([
        {
          userId: 'user-1',
          transactionCount: 5,
          lastActivityAt: new Date('2025-11-23T10:00:00.000Z'),
          preferredDestination: 'individual',
          destinationJid: '5511999999999@s.whatsapp.net',
          locale: 'en',
        },
      ])

      // Execute
      await runWeeklyReviewJob()

      // Verify: Locale in analytics
      expect(mockPostHogCapture).toHaveBeenCalledWith(
        expect.objectContaining({
          properties: expect.objectContaining({
            locale: 'en',
          }),
        })
      )
    })
  })
})
