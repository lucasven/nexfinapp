/**
 * Scheduler Opt-Out Integration Tests
 *
 * Story 6.4: Opt-Out Respect in Engagement System
 *
 * End-to-end integration tests verifying that opted-out users
 * receive no re-engagement messages across the entire system.
 *
 * AC-6.4.1: Daily job respects opt-out over time
 * AC-6.4.2: Weekly job respects opt-out over time
 * AC-6.4.4: Race condition behavior (opt-out after queue, before send)
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { runDailyEngagementJob } from '../../services/scheduler/daily-engagement-job'
import { runWeeklyReviewJob } from '../../services/scheduler/weekly-review-job'
import { processMessageQueue } from '../../services/scheduler/message-sender'
import {
  mockSupabaseClient,
  resetSupabaseMocks,
} from '../../__mocks__/supabase'

// Mock dependencies
jest.mock('../../services/database/supabase-client', () => ({
  getSupabaseClient: () => mockSupabaseClient,
}))

jest.mock('../../services/monitoring/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}))

jest.mock('../../services/engagement/state-machine', () => ({
  transitionState: jest.fn().mockResolvedValue({ success: true }),
  getExpiredGoodbyes: jest.fn().mockResolvedValue([]),
  getDueReminders: jest.fn().mockResolvedValue([]),
}))

jest.mock('../../services/scheduler/activity-detector', () => ({
  getActiveUsersLastWeek: jest.fn().mockResolvedValue([]),
}))

jest.mock('../../index', () => ({
  getSocket: jest.fn().mockReturnValue({
    user: { id: 'bot-jid' },
    sendMessage: jest.fn().mockResolvedValue(undefined),
  }),
}))

// =============================================================================
// Integration Test: 30-Day No-Messages Verification
// =============================================================================

describe('Integration: Opted-Out User Receives No Messages Over 30 Days', () => {
  beforeEach(() => {
    resetSupabaseMocks()
    jest.clearAllMocks()
  })

  it('AC-6.4.1, AC-6.4.2: Should not queue any messages for opted-out inactive user', async () => {
    // Scenario: User has been opted-out and inactive for 30 days
    // Expected: No goodbye messages, no weekly reviews over entire period

    // Setup: Opted-out user, 30 days inactive
    const inactiveUsers = [
      {
        user_id: 'opted-out-user',
        last_activity_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      },
    ]

    const profiles = [
      {
        id: 'opted-out-user',
        reengagement_opt_out: true, // Opted out
      },
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
      if (table === 'engagement_message_queue') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          lte: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          limit: jest.fn().mockResolvedValue({
            data: [], // No messages queued
            error: null,
          }),
        }
      }
      return {} as any
    })

    // Simulate multiple scheduler runs over 30 days
    for (let day = 1; day <= 30; day++) {
      // Daily job runs every day
      const dailyResult = await runDailyEngagementJob()

      // Verify: User was skipped, not processed
      expect(dailyResult.skipped).toBeGreaterThan(0)
      expect(dailyResult.succeeded).toBe(0)

      // Weekly job runs once per week (days 7, 14, 21, 28)
      if (day % 7 === 0) {
        const weeklyResult = await runWeeklyReviewJob()
        // Verify: No users processed (SQL function filtered opted-out user)
        expect(weeklyResult.processed).toBe(0)
      }
    }

    // Verify: Message queue remains empty (no messages queued over 30 days)
    const queueResult = await processMessageQueue()
    expect(queueResult.processed).toBe(0)
  })
})

// =============================================================================
// Integration Test: Opt-In After Opt-Out
// =============================================================================

describe('Integration: User Opts Back In After Opt-Out', () => {
  beforeEach(() => {
    resetSupabaseMocks()
    jest.clearAllMocks()
  })

  it('AC-6.4.1: Should immediately become eligible after opting back in', async () => {
    // Scenario: User was opted-out, then opts back in
    // Expected: Next scheduler run includes them

    // Setup Phase 1: User is opted-out
    const inactiveUsers = [
      {
        user_id: 'user-1',
        last_activity_at: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
      },
    ]

    let userOptedOut = true

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
            data: [{ id: 'user-1', reengagement_opt_out: userOptedOut }],
            error: null,
          }),
        }
      }
      return {} as any
    })

    // Run 1: User is opted-out
    const result1 = await runDailyEngagementJob()
    expect(result1.skipped).toBe(1)
    expect(result1.processed).toBe(0)

    // User opts back in
    userOptedOut = false

    // Run 2: User is now opted-in
    const result2 = await runDailyEngagementJob()
    expect(result2.skipped).toBe(0)
    expect(result2.processed).toBe(1)
    expect(result2.succeeded).toBe(1)
  })
})

// =============================================================================
// Integration Test: Race Condition Scenario
// =============================================================================

describe('Integration: Race Condition - Opt-Out After Queue, Before Send', () => {
  beforeEach(() => {
    resetSupabaseMocks()
    jest.clearAllMocks()
  })

  it('AC-6.4.4: Should send queued message even after opt-out (acceptable)', async () => {
    const { getSocket } = require('../../index')
    const mockSocket = {
      user: { id: 'bot-jid' },
      sendMessage: jest.fn().mockResolvedValue(undefined),
    }
    getSocket.mockReturnValue(mockSocket)

    // Scenario:
    // 1. Scheduler runs, user is opted-in → message queued
    // 2. User opts out (between queue and send)
    // 3. Queue processor runs → message sends (acceptable)
    // 4. Next scheduler run → user skipped (future messages blocked)

    // Phase 1: User is opted-in, scheduler queues message
    const inactiveUsers = [
      {
        user_id: 'user-1',
        last_activity_at: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
      },
    ]

    const profilesOptedIn = [
      { id: 'user-1', reengagement_opt_out: false },
    ]

    // Mock for daily job (user opted-in)
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
            data: profilesOptedIn,
            error: null,
          }),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({
            data: { locale: 'pt-BR' },
            error: null,
          }),
        }
      }
      if (table === 'engagement_message_queue') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          lte: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          limit: jest.fn().mockResolvedValue({
            data: [
              {
                id: 'msg-1',
                user_id: 'user-1',
                message_type: 'goodbye',
                message_key: 'engagementGoodbyeSelfSelect',
                message_params: null,
                destination: 'individual',
                destination_jid: 'user-1@s.whatsapp.net',
                retry_count: 0,
                user_profiles: { locale: 'pt-BR' },
              },
            ],
            error: null,
          }),
          update: jest.fn().mockReturnThis(),
        }
      }
      return {} as any
    })

    // Run daily job (message queued)
    const dailyResult = await runDailyEngagementJob()
    expect(dailyResult.processed).toBe(1)

    // Phase 2: User opts out (preference change)
    // In real system, this would be a database UPDATE by opt-out handler

    // Clear previous calls (daily job includes queue processing)
    mockSocket.sendMessage.mockClear()

    // Phase 3: Queue processor runs (message still sends - acceptable)
    const queueResult = await processMessageQueue()
    expect(queueResult.succeeded).toBe(1)
    expect(mockSocket.sendMessage).toHaveBeenCalledTimes(1)

    // Phase 4: Next scheduler run (user now opted-out, skipped)
    const profilesOptedOut = [
      { id: 'user-1', reengagement_opt_out: true }, // Now opted-out
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
            data: profilesOptedOut,
            error: null,
          }),
        }
      }
      return {} as any
    })

    const dailyResult2 = await runDailyEngagementJob()
    expect(dailyResult2.skipped).toBe(1)
    expect(dailyResult2.processed).toBe(0)

    // Result: User received ONE message after opt-out (phase 3),
    // but future messages are blocked (phase 4). This is acceptable.
  })
})

// =============================================================================
// Integration Test: Mixed User Scenarios
// =============================================================================

describe('Integration: Mixed Opt-Out and Opt-In Users', () => {
  beforeEach(() => {
    resetSupabaseMocks()
    jest.clearAllMocks()
  })

  it('AC-6.4.1: Should correctly filter large set of mixed users', async () => {
    // Scenario: 10 users, 50% opted-out, 50% opted-in
    // Expected: Only opted-in users processed

    const inactiveUsers = Array.from({ length: 10 }, (_, i) => ({
      user_id: `user-${i}`,
      last_activity_at: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
    }))

    const profiles = Array.from({ length: 10 }, (_, i) => ({
      id: `user-${i}`,
      reengagement_opt_out: i % 2 === 0, // Even users opted-out
    }))

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

    // Verify: 5 users processed (odd-numbered, opted-in)
    //         5 users skipped (even-numbered, opted-out)
    expect(result.processed).toBe(5)
    expect(result.skipped).toBe(5)
    expect(result.succeeded).toBe(5)
  })
})
