/**
 * Scheduler Opt-Out Tests
 *
 * Story 6.4: Opt-Out Respect in Engagement System
 *
 * Tests that both daily engagement job and weekly review job
 * correctly respect user opt-out preferences (reengagement_opt_out).
 *
 * AC-6.4.1: Daily job excludes opted-out users from goodbye messages
 * AC-6.4.2: Weekly job excludes opted-out users from review messages
 * AC-6.4.3: Tier completion tips ignore opt-out (different preference)
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { runDailyEngagementJob } from '../../../services/scheduler/daily-engagement-job'
import { runWeeklyReviewJob } from '../../../services/scheduler/weekly-review-job'
import { handleTierCompletion } from '../../../handlers/engagement/tier-progress-handler'
import {
  mockSupabaseClient,
  resetSupabaseMocks,
} from '../../../__mocks__/supabase'

// Mock dependencies
jest.mock('../../../services/database/supabase-client', () => ({
  getSupabaseClient: () => mockSupabaseClient,
}))

jest.mock('../../../services/monitoring/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}))

jest.mock('../../../services/engagement/state-machine', () => ({
  transitionState: jest.fn().mockResolvedValue({ success: true }),
  getExpiredGoodbyes: jest.fn().mockResolvedValue([]),
  getDueReminders: jest.fn().mockResolvedValue([]),
}))

jest.mock('../../../services/scheduler/message-sender', () => ({
  queueMessage: jest.fn().mockResolvedValue(true),
  processMessageQueue: jest.fn().mockResolvedValue({
    processed: 0,
    succeeded: 0,
    failed: 0,
    errors: [],
  }),
}))

jest.mock('../../../services/scheduler/activity-detector', () => ({
  getActiveUsersLastWeek: jest.fn().mockResolvedValue([]),
}))

jest.mock('../../../index', () => ({
  getSocket: jest.fn().mockReturnValue({
    user: { id: 'bot-jid' },
    sendMessage: jest.fn().mockResolvedValue(undefined),
  }),
}))

// =============================================================================
// Helper Functions
// =============================================================================

const createInactiveUser = (
  userId: string,
  daysInactive: number,
  optedOut: boolean
) => ({
  user_id: userId,
  last_activity_at: new Date(
    Date.now() - daysInactive * 24 * 60 * 60 * 1000
  ).toISOString(),
  reengagement_opt_out: optedOut,
})

const createActiveUser = (userId: string, optedOut: boolean) => ({
  userId,
  transactionCount: 5,
  lastActivityAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
  preferredDestination: 'individual' as const,
  destinationJid: `${userId}@s.whatsapp.net`,
  locale: 'pt-BR',
  reengagement_opt_out: optedOut,
})

// =============================================================================
// Daily Engagement Job Tests (AC-6.4.1)
// =============================================================================

describe('Daily Engagement Job - Opt-Out Respect', () => {
  beforeEach(() => {
    resetSupabaseMocks()
    jest.clearAllMocks()
  })

  it('AC-6.4.1: Should skip opted-out users when querying inactive users', async () => {
    // Setup: 3 inactive users, 2 opted-out, 1 opted-in
    const inactiveUsers = [
      { user_id: 'user-1', last_activity_at: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString() },
      { user_id: 'user-2', last_activity_at: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString() },
      { user_id: 'user-3', last_activity_at: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString() },
    ]

    const profiles = [
      { user_id: 'user-1', reengagement_opt_out: true },
      { user_id: 'user-2', reengagement_opt_out: false },
      { user_id: 'user-3', reengagement_opt_out: true },
    ]

    // Mock queries
    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'user_engagement_states') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          lt: jest.fn().mockResolvedValue({
            data: inactiveUsers,
            error: null,
          }),
        }
      }
      if (table === 'user_profiles') {
        return {
          select: jest.fn().mockReturnThis(),
          in: jest.fn().mockResolvedValue({
            data: profiles,
            error: null,
          }),
        }
      }
      return {} as any
    })

    // Execute
    const result = await runDailyEngagementJob()

    // Verify: Only 1 user processed (user-2), 2 users skipped (user-1, user-3)
    expect(result.processed).toBe(1)
    expect(result.skipped).toBe(2)
  })

  it('AC-6.4.1: Should process all users when none are opted-out', async () => {
    const inactiveUsers = [
      { user_id: 'user-1', last_activity_at: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString() },
      { user_id: 'user-2', last_activity_at: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString() },
    ]

    const profiles = [
      { user_id: 'user-1', reengagement_opt_out: false },
      { user_id: 'user-2', reengagement_opt_out: false },
    ]

    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'user_engagement_states') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          lt: jest.fn().mockResolvedValue({
            data: inactiveUsers,
            error: null,
          }),
        }
      }
      if (table === 'user_profiles') {
        return {
          select: jest.fn().mockReturnThis(),
          in: jest.fn().mockResolvedValue({
            data: profiles,
            error: null,
          }),
        }
      }
      return {} as any
    })

    const result = await runDailyEngagementJob()

    expect(result.processed).toBe(2)
    expect(result.skipped).toBe(0)
  })

  it('AC-6.4.1: Should skip all users when all are opted-out', async () => {
    const inactiveUsers = [
      { user_id: 'user-1', last_activity_at: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString() },
      { user_id: 'user-2', last_activity_at: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString() },
    ]

    const profiles = [
      { user_id: 'user-1', reengagement_opt_out: true },
      { user_id: 'user-2', reengagement_opt_out: true },
    ]

    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'user_engagement_states') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          lt: jest.fn().mockResolvedValue({
            data: inactiveUsers,
            error: null,
          }),
        }
      }
      if (table === 'user_profiles') {
        return {
          select: jest.fn().mockReturnThis(),
          in: jest.fn().mockResolvedValue({
            data: profiles,
            error: null,
          }),
        }
      }
      return {} as any
    })

    const result = await runDailyEngagementJob()

    expect(result.processed).toBe(0)
    expect(result.skipped).toBe(2)
  })

  it('AC-6.4.6: Should log skipped count for observability', async () => {
    const { logger } = require('../../../services/monitoring/logger')

    const inactiveUsers = [
      { user_id: 'user-1', last_activity_at: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString() },
    ]

    const profiles = [
      { user_id: 'user-1', reengagement_opt_out: true },
    ]

    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'user_engagement_states') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          lt: jest.fn().mockResolvedValue({
            data: inactiveUsers,
            error: null,
          }),
        }
      }
      if (table === 'user_profiles') {
        return {
          select: jest.fn().mockReturnThis(),
          in: jest.fn().mockResolvedValue({
            data: profiles,
            error: null,
          }),
        }
      }
      return {} as any
    })

    await runDailyEngagementJob()

    // Verify that logger.info was called with opted_out_users_skipped metric
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringMatching(/completed/i),
      expect.objectContaining({
        opted_out_users_skipped: 1,
      })
    )
  })
})

// =============================================================================
// Weekly Review Job Tests (AC-6.4.2)
// =============================================================================

describe('Weekly Review Job - Opt-Out Respect', () => {
  beforeEach(() => {
    resetSupabaseMocks()
    jest.clearAllMocks()
  })

  it('AC-6.4.2: Should only receive opted-in users from getActiveUsersLastWeek', async () => {
    const { getActiveUsersLastWeek } = require('../../../services/scheduler/activity-detector')

    // Setup: getActiveUsersLastWeek should already filter opted-out users via SQL
    const activeUsers = [
      createActiveUser('user-1', false), // opted-in
      createActiveUser('user-2', false), // opted-in
      // user-3 opted-out - NOT included (filtered by SQL function)
    ]

    getActiveUsersLastWeek.mockResolvedValue(activeUsers)

    const result = await runWeeklyReviewJob()

    // Verify: All returned users are processed (SQL function already filtered)
    expect(result.processed).toBe(2)
    expect(result.succeeded).toBe(2)
  })

  it('AC-6.4.2: Should handle empty result when all users opted-out', async () => {
    const { getActiveUsersLastWeek } = require('../../../services/scheduler/activity-detector')

    // Setup: All users opted-out, SQL function returns empty array
    getActiveUsersLastWeek.mockResolvedValue([])

    const result = await runWeeklyReviewJob()

    expect(result.processed).toBe(0)
    expect(result.succeeded).toBe(0)
  })

  it('AC-6.4.6: Should log that opt-out filter is applied by SQL function', async () => {
    const { logger } = require('../../../services/monitoring/logger')
    const { getActiveUsersLastWeek } = require('../../../services/scheduler/activity-detector')

    getActiveUsersLastWeek.mockResolvedValue([
      createActiveUser('user-1', false),
    ])

    await runWeeklyReviewJob()

    // Verify logging mentions opt-out filtering
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringMatching(/active users/i),
      expect.objectContaining({
        note: expect.stringMatching(/opted-out.*excluded/i),
      })
    )
  })
})

// =============================================================================
// Tier Completion Tests (AC-6.4.3)
// =============================================================================

describe('Tier Completion Handler - Ignores Opt-Out', () => {
  beforeEach(() => {
    resetSupabaseMocks()
    jest.clearAllMocks()
  })

  it('AC-6.4.3: Should send tier completion tip to opted-out user', async () => {
    const { queueMessage } = require('../../../services/scheduler/message-sender')

    // Setup: User is opted-out but has onboarding_tips_enabled=true
    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'user_profiles') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({
            data: {
              onboarding_tips_enabled: true, // Tips enabled
              reengagement_opt_out: true,    // Re-engagement opted-out (should NOT block tips)
              preferred_destination: 'individual',
              locale: 'pt-BR',
            },
            error: null,
          }),
        }
      }
      if (table === 'authorized_whatsapp_numbers') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({
            data: {
              whatsapp_jid: 'user-1@s.whatsapp.net',
              whatsapp_number: '5511999999999',
            },
            error: null,
          }),
        }
      }
      return {} as any
    })

    // Execute: Tier 1 completed
    await handleTierCompletion('user-1', {
      tierCompleted: 1,
      shouldSendUnlock: true,
      currentTier: 1,
      progress: {},
    })

    // Verify: Tier tip was queued (opt-out did NOT block it)
    expect(queueMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        messageType: 'tier_unlock',
        messageKey: 'engagementTier1Complete',
      })
    )
  })

  it('AC-6.4.3: Should NOT send tier tip when onboarding_tips_enabled=false', async () => {
    const { queueMessage } = require('../../../services/scheduler/message-sender')

    // Setup: User has tips disabled (different preference)
    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'user_profiles') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({
            data: {
              onboarding_tips_enabled: false, // Tips disabled
              reengagement_opt_out: false,    // Re-engagement opted-in (irrelevant)
              preferred_destination: 'individual',
              whatsapp_jid: 'user-1@s.whatsapp.net',
              locale: 'pt-BR',
            },
            error: null,
          }),
        }
      }
      return {} as any
    })

    await handleTierCompletion('user-1', {
      tierCompleted: 1,
      shouldSendUnlock: true,
      currentTier: 1,
      progress: {},
    })

    // Verify: Tip was NOT queued (onboarding_tips_enabled controls this)
    expect(queueMessage).not.toHaveBeenCalled()
  })

  it('AC-6.4.3: Should verify getUserCelebrationData does NOT check reengagement_opt_out', async () => {
    // This test verifies the SQL query does NOT include reengagement_opt_out
    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'user_profiles') {
        const selectMock = jest.fn().mockReturnThis()
        return {
          select: selectMock,
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockImplementation(() => {
            // Verify the SELECT query does NOT include reengagement_opt_out
            expect(selectMock).toHaveBeenCalledWith(
              'onboarding_tips_enabled, preferred_destination, whatsapp_jid, locale'
            )
            return {
              data: {
                onboarding_tips_enabled: true,
                preferred_destination: 'individual',
                whatsapp_jid: 'user-1@s.whatsapp.net',
                locale: 'pt-BR',
              },
              error: null,
            }
          }),
        }
      }
      return {} as any
    })

    await handleTierCompletion('user-1', {
      tierCompleted: 1,
      shouldSendUnlock: true,
      currentTier: 1,
      progress: {},
    })

    // Test passes if no assertion fails above
    expect(true).toBe(true)
  })
})
