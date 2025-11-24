/**
 * Daily Engagement Job Tests
 *
 * Story 4.5: 48h Timeout to Dormant
 *
 * Tests for the daily engagement job timeout processing:
 * - AC-4.5.5: Daily job re-run doesn't cause duplicate transitions
 * - Processing multiple expired users
 * - Per-user error handling
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { runDailyEngagementJob, JobResult } from '../../../services/scheduler/daily-engagement-job'
import * as stateMachine from '../../../services/engagement/state-machine'

// Mock the state machine functions
jest.mock('../../../services/engagement/state-machine', () => ({
  getExpiredGoodbyes: jest.fn(),
  transitionState: jest.fn(),
}))

// Mock the logger
jest.mock('../../../services/monitoring/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}))

const mockGetExpiredGoodbyes = stateMachine.getExpiredGoodbyes as jest.Mock
const mockTransitionState = stateMachine.transitionState as jest.Mock

// =============================================================================
// Helper Functions
// =============================================================================

const createMockUserState = (userId: string) => ({
  id: `state-${userId}`,
  userId,
  state: 'goodbye_sent' as const,
  lastActivityAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
  goodbyeSentAt: new Date(Date.now() - 50 * 60 * 60 * 1000),
  goodbyeExpiresAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
  remindAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
})

// =============================================================================
// Daily Engagement Job Tests
// =============================================================================

describe('Daily Engagement Job - Timeout Processing', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2025-11-22T12:00:00Z'))
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('should process multiple expired users successfully', async () => {
    const user1 = createMockUserState('user-1')
    const user2 = createMockUserState('user-2')
    const user3 = createMockUserState('user-3')

    mockGetExpiredGoodbyes.mockResolvedValue([user1, user2, user3])
    mockTransitionState.mockResolvedValue({
      success: true,
      previousState: 'goodbye_sent',
      newState: 'dormant',
      sideEffects: ['transitioned_goodbye_sent_to_dormant'],
    })

    const result = await runDailyEngagementJob()

    expect(result.success).toBe(true)
    expect(result.timeoutsProcessed).toBe(3)
    expect(result.usersProcessed).toBe(3)
    expect(result.errors).toHaveLength(0)
    expect(mockTransitionState).toHaveBeenCalledTimes(3)
  })

  it('should call transitionState with goodbye_timeout trigger', async () => {
    const user = createMockUserState('user-test')
    mockGetExpiredGoodbyes.mockResolvedValue([user])
    mockTransitionState.mockResolvedValue({
      success: true,
      previousState: 'goodbye_sent',
      newState: 'dormant',
      sideEffects: [],
    })

    await runDailyEngagementJob()

    expect(mockTransitionState).toHaveBeenCalledWith(
      'user-test',
      'goodbye_timeout',
      expect.objectContaining({
        response_type: 'timeout',
        job_triggered: true,
      })
    )
  })

  it('should handle empty expired goodbyes list', async () => {
    mockGetExpiredGoodbyes.mockResolvedValue([])

    const result = await runDailyEngagementJob()

    expect(result.success).toBe(true)
    expect(result.timeoutsProcessed).toBe(0)
    expect(result.usersProcessed).toBe(0)
    expect(mockTransitionState).not.toHaveBeenCalled()
  })

  it('should continue processing after single user failure (AC-4.5.5)', async () => {
    const user1 = createMockUserState('user-1')
    const user2 = createMockUserState('user-2')
    const user3 = createMockUserState('user-3')

    mockGetExpiredGoodbyes.mockResolvedValue([user1, user2, user3])

    // First user succeeds
    mockTransitionState.mockResolvedValueOnce({
      success: true,
      previousState: 'goodbye_sent',
      newState: 'dormant',
      sideEffects: [],
    })
    // Second user fails
    mockTransitionState.mockResolvedValueOnce({
      success: false,
      previousState: 'goodbye_sent',
      newState: 'goodbye_sent',
      error: 'Database error',
      sideEffects: [],
    })
    // Third user succeeds
    mockTransitionState.mockResolvedValueOnce({
      success: true,
      previousState: 'goodbye_sent',
      newState: 'dormant',
      sideEffects: [],
    })

    const result = await runDailyEngagementJob()

    expect(result.success).toBe(false) // Has errors
    expect(result.timeoutsProcessed).toBe(2) // Only 2 succeeded
    expect(result.errors).toHaveLength(1)
    expect(mockTransitionState).toHaveBeenCalledTimes(3) // All were attempted
  })

  it('should handle exception thrown during transition (per-user try/catch)', async () => {
    const user1 = createMockUserState('user-1')
    const user2 = createMockUserState('user-2')

    mockGetExpiredGoodbyes.mockResolvedValue([user1, user2])

    // First user throws exception
    mockTransitionState.mockRejectedValueOnce(new Error('Connection timeout'))
    // Second user succeeds
    mockTransitionState.mockResolvedValueOnce({
      success: true,
      previousState: 'goodbye_sent',
      newState: 'dormant',
      sideEffects: [],
    })

    const result = await runDailyEngagementJob()

    expect(result.success).toBe(false)
    expect(result.timeoutsProcessed).toBe(1)
    expect(result.errors).toContain('User user-1: Connection timeout')
    expect(mockTransitionState).toHaveBeenCalledTimes(2)
  })

  it('should skip already-transitioned users gracefully (idempotent)', async () => {
    const user = createMockUserState('user-already-dormant')
    mockGetExpiredGoodbyes.mockResolvedValue([user])

    // User already transitioned (race condition)
    mockTransitionState.mockResolvedValue({
      success: false,
      previousState: 'dormant',
      newState: 'dormant',
      error: 'Invalid transition: dormant + goodbye_timeout is not a valid transition',
      sideEffects: [],
    })

    const result = await runDailyEngagementJob()

    // Should not record this as an error - it's idempotent behavior
    expect(result.errors).toHaveLength(0)
    expect(result.timeoutsProcessed).toBe(0)
  })

  it('should report job duration', async () => {
    mockGetExpiredGoodbyes.mockResolvedValue([])

    const result = await runDailyEngagementJob()

    expect(result.durationMs).toBeGreaterThanOrEqual(0)
  })

  it('should handle getExpiredGoodbyes error gracefully', async () => {
    mockGetExpiredGoodbyes.mockRejectedValue(new Error('Database connection failed'))

    const result = await runDailyEngagementJob()

    expect(result.success).toBe(false)
    expect(result.errors).toContain('Job error: Database connection failed')
    expect(result.timeoutsProcessed).toBe(0)
  })
})

// =============================================================================
// Re-run Idempotency Tests (AC-4.5.5)
// =============================================================================

describe('Daily Engagement Job - Re-run Idempotency (AC-4.5.5)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should not cause duplicate transitions on re-run', async () => {
    // First run
    const user = createMockUserState('user-1')
    mockGetExpiredGoodbyes.mockResolvedValue([user])
    mockTransitionState.mockResolvedValue({
      success: true,
      previousState: 'goodbye_sent',
      newState: 'dormant',
      sideEffects: [],
    })

    const firstRun = await runDailyEngagementJob()
    expect(firstRun.timeoutsProcessed).toBe(1)

    // Second run - user is now dormant, won't appear in query
    mockGetExpiredGoodbyes.mockResolvedValue([])

    const secondRun = await runDailyEngagementJob()
    expect(secondRun.timeoutsProcessed).toBe(0)
    expect(secondRun.success).toBe(true)
  })
})
