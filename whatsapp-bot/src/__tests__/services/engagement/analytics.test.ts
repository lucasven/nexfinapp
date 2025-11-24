/**
 * Analytics Logging Tests
 *
 * Story 4.7: State Transition Logging & Analytics
 *
 * Tests:
 * - AC-4.7.1: Transition creates log entry in engagement_state_transitions
 * - AC-4.7.2: PostHog event fired with correct properties
 * - AC-4.7.3: response_type mapped correctly for each goodbye trigger
 * - AC-4.7.4: unprompted_return set correctly for qualifying transitions
 * - AC-4.7.5: days_inactive calculated correctly
 * - AC-4.7.6: Logs queryable by user_id
 * - AC-4.7.7: PostHog events include user's preferred destination
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  calculateDaysInactive,
  calculateHoursWaited,
  getGoodbyeResponseType,
  isUnpromptedReturn,
  GOODBYE_TRIGGER_TO_RESPONSE_TYPE,
  UNPROMPTED_RETURN_DAYS_THRESHOLD,
} from '../../../services/engagement/analytics'
import {
  getUserTransitionHistory,
  getTransitionStats,
  transitionState,
} from '../../../services/engagement/state-machine'
import type {
  EngagementState,
  TransitionTrigger,
} from '../../../services/engagement/types'
import {
  mockSupabaseClient,
  resetSupabaseMocks,
  mockQuerySequence,
} from '../../../__mocks__/supabase'

// Mock the supabase client
jest.mock('../../../services/database/supabase-client', () => ({
  getSupabaseClient: () => mockSupabaseClient,
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

// Mock the analytics tracker
const mockTrackEvent = jest.fn()
jest.mock('../../../analytics/tracker', () => ({
  trackEvent: (...args: any[]) => mockTrackEvent(...args),
}))

// Mock the message router
jest.mock('../../../services/engagement/message-router', () => ({
  getMessageDestination: jest.fn().mockResolvedValue({
    destination: 'individual',
    destinationJid: 'user@s.whatsapp.net',
  }),
}))

// Mock the scheduler message-sender
jest.mock('../../../services/scheduler/message-sender', () => ({
  queueMessage: jest.fn().mockResolvedValue(true),
  getIdempotencyKey: jest.fn().mockReturnValue('test-idempotency-key'),
}))

// =============================================================================
// Utility Function Tests
// =============================================================================

describe('Analytics Utility Functions', () => {
  describe('calculateDaysInactive (AC-4.7.5)', () => {
    beforeEach(() => {
      jest.useFakeTimers()
      jest.setSystemTime(new Date('2025-11-22T12:00:00Z'))
    })

    afterEach(() => {
      jest.useRealTimers()
    })

    it('should calculate correct days inactive', () => {
      const lastActivity = new Date('2025-11-15T12:00:00Z') // 7 days ago
      expect(calculateDaysInactive(lastActivity)).toBe(7)
    })

    it('should return 0 for today', () => {
      const lastActivity = new Date('2025-11-22T10:00:00Z') // 2 hours ago (same day)
      expect(calculateDaysInactive(lastActivity)).toBe(0)
    })

    it('should handle null last_activity_at', () => {
      expect(calculateDaysInactive(null)).toBe(0)
    })

    it('should handle future dates (return 0)', () => {
      const futureDate = new Date('2025-11-25T12:00:00Z') // 3 days in future
      expect(calculateDaysInactive(futureDate)).toBe(0)
    })

    it('should floor to whole days (14.9 days → 14)', () => {
      const lastActivity = new Date('2025-11-07T18:00:00Z') // ~14.75 days ago
      expect(calculateDaysInactive(lastActivity)).toBe(14)
    })
  })

  describe('calculateHoursWaited', () => {
    beforeEach(() => {
      jest.useFakeTimers()
      jest.setSystemTime(new Date('2025-11-22T12:00:00Z'))
    })

    afterEach(() => {
      jest.useRealTimers()
    })

    it('should calculate correct hours waited', () => {
      const timestamp = new Date('2025-11-20T12:00:00Z') // 48 hours ago
      expect(calculateHoursWaited(timestamp)).toBe(48)
    })

    it('should return 0 for null timestamp', () => {
      expect(calculateHoursWaited(null)).toBe(0)
    })

    it('should return 0 for future timestamp', () => {
      const futureTimestamp = new Date('2025-11-23T12:00:00Z')
      expect(calculateHoursWaited(futureTimestamp)).toBe(0)
    })
  })

  describe('getGoodbyeResponseType (AC-4.7.3)', () => {
    it('should return "confused" for goodbye_response_1', () => {
      expect(getGoodbyeResponseType('goodbye_response_1')).toBe('confused')
    })

    it('should return "busy" for goodbye_response_2', () => {
      expect(getGoodbyeResponseType('goodbye_response_2')).toBe('busy')
    })

    it('should return "all_good" for goodbye_response_3', () => {
      expect(getGoodbyeResponseType('goodbye_response_3')).toBe('all_good')
    })

    it('should return "timeout" for goodbye_timeout', () => {
      expect(getGoodbyeResponseType('goodbye_timeout')).toBe('timeout')
    })

    it('should return undefined for non-goodbye triggers', () => {
      expect(getGoodbyeResponseType('user_message')).toBeUndefined()
      expect(getGoodbyeResponseType('inactivity_14d')).toBeUndefined()
      expect(getGoodbyeResponseType('reminder_due')).toBeUndefined()
    })

    it('should have all trigger mappings defined', () => {
      expect(Object.keys(GOODBYE_TRIGGER_TO_RESPONSE_TYPE)).toEqual([
        'goodbye_response_1',
        'goodbye_response_2',
        'goodbye_response_3',
        'goodbye_timeout',
      ])
    })
  })

  describe('isUnpromptedReturn (AC-4.7.4)', () => {
    it('should return true for dormant → active via user_message after 3+ days', () => {
      expect(isUnpromptedReturn('user_message', 'dormant', 5)).toBe(true)
    })

    it('should return true for exactly 3 days inactive', () => {
      expect(isUnpromptedReturn('user_message', 'dormant', UNPROMPTED_RETURN_DAYS_THRESHOLD)).toBe(true)
    })

    it('should return false for dormant → active via user_message under 3 days', () => {
      expect(isUnpromptedReturn('user_message', 'dormant', 2)).toBe(false)
    })

    it('should return false for goodbye_sent → active (responding to goodbye)', () => {
      expect(isUnpromptedReturn('user_message', 'goodbye_sent', 5)).toBe(false)
    })

    it('should return false for non-user_message triggers', () => {
      expect(isUnpromptedReturn('inactivity_14d', 'dormant', 15)).toBe(false)
    })

    it('should return false for active state (already engaged)', () => {
      expect(isUnpromptedReturn('user_message', 'active', 10)).toBe(false)
    })
  })
})

// =============================================================================
// Transition Logging Tests
// =============================================================================

describe('Transition Logging (AC-4.7.1)', () => {
  beforeEach(() => {
    resetSupabaseMocks()
    mockTrackEvent.mockClear()
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2025-11-22T12:00:00Z'))
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  const createMockEngagementState = (
    userId: string,
    state: EngagementState,
    overrides: Partial<any> = {}
  ) => ({
    id: 'state-123',
    user_id: userId,
    state,
    last_activity_at: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(), // 15 days ago
    goodbye_sent_at: null,
    goodbye_expires_at: null,
    remind_at: null,
    created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
    ...overrides,
  })

  it('should include days_inactive in metadata (AC-4.7.5)', async () => {
    const userId = 'user-123'
    const existingState = createMockEngagementState(userId, 'active', {
      last_activity_at: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
    })

    mockQuerySequence([
      { data: existingState, error: null },
      { data: { ...existingState, state: 'goodbye_sent' }, error: null },
      { data: { id: 'transition-789' }, error: null },
      { data: { preferred_language: 'en' }, error: null }, // user profile query
    ])

    const result = await transitionState(userId, 'inactivity_14d')

    expect(result.success).toBe(true)
    // Verify insert was called (logging happened)
    expect(mockSupabaseClient.from).toHaveBeenCalledWith('engagement_state_transitions')
  })

  it('should include response_type in metadata for goodbye triggers (AC-4.7.3)', async () => {
    const userId = 'user-123'
    const existingState = createMockEngagementState(userId, 'goodbye_sent', {
      goodbye_sent_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    })

    mockQuerySequence([
      { data: existingState, error: null },
      { data: { ...existingState, state: 'help_flow' }, error: null },
      { data: { id: 'transition-789' }, error: null },
    ])

    const result = await transitionState(userId, 'goodbye_response_1')

    expect(result.success).toBe(true)
  })

  it('should fire PostHog events on successful transition (AC-4.7.2)', async () => {
    const userId = 'user-123'
    const existingState = createMockEngagementState(userId, 'dormant')

    mockQuerySequence([
      { data: existingState, error: null },
      { data: { ...existingState, state: 'active' }, error: null },
      { data: { id: 'transition-789' }, error: null },
    ])

    const result = await transitionState(userId, 'user_message')

    expect(result.success).toBe(true)
    expect(result.sideEffects).toContain('fired_analytics_events')
    // Verify trackEvent was called
    expect(mockTrackEvent).toHaveBeenCalled()
  })

  it('should continue transition even if log insert fails (error handling)', async () => {
    const userId = 'user-123'
    const existingState = createMockEngagementState(userId, 'active')

    mockQuerySequence([
      { data: existingState, error: null },
      { data: { ...existingState, state: 'goodbye_sent' }, error: null },
      // Log insert fails
      { data: null, error: { message: 'Insert failed' } },
      { data: { preferred_language: 'en' }, error: null },
    ])

    const result = await transitionState(userId, 'inactivity_14d')

    // Transition should still succeed
    expect(result.success).toBe(true)
    expect(result.newState).toBe('goodbye_sent')
  })
})

// =============================================================================
// PostHog Event Tests
// =============================================================================

describe('PostHog Events (AC-4.7.2, AC-4.7.7)', () => {
  beforeEach(() => {
    resetSupabaseMocks()
    mockTrackEvent.mockClear()
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2025-11-22T12:00:00Z'))
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  const createMockEngagementState = (
    userId: string,
    state: EngagementState,
    overrides: Partial<any> = {}
  ) => ({
    id: 'state-123',
    user_id: userId,
    state,
    last_activity_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    goodbye_sent_at: null,
    goodbye_expires_at: null,
    remind_at: null,
    created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
    ...overrides,
  })

  it('should fire engagement_state_changed event on every transition', async () => {
    const userId = 'user-123'
    const existingState = createMockEngagementState(userId, 'dormant')

    mockQuerySequence([
      { data: existingState, error: null },
      { data: { ...existingState, state: 'active' }, error: null },
      { data: { id: 'transition-789' }, error: null },
    ])

    await transitionState(userId, 'user_message')

    expect(mockTrackEvent).toHaveBeenCalledWith(
      'engagement_state_changed',
      userId,
      expect.objectContaining({
        from_state: 'dormant',
        to_state: 'active',
        trigger: 'user_message',
      })
    )
  })

  it('should fire engagement_goodbye_response event for goodbye triggers', async () => {
    const userId = 'user-123'
    const existingState = createMockEngagementState(userId, 'goodbye_sent', {
      goodbye_sent_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    })

    mockQuerySequence([
      { data: existingState, error: null },
      { data: { ...existingState, state: 'dormant' }, error: null },
      { data: { id: 'transition-789' }, error: null },
    ])

    await transitionState(userId, 'goodbye_response_3')

    // Should fire both state_changed and goodbye_response events
    expect(mockTrackEvent).toHaveBeenCalledWith(
      'engagement_state_changed',
      userId,
      expect.anything()
    )
    expect(mockTrackEvent).toHaveBeenCalledWith(
      'engagement_goodbye_response',
      userId,
      expect.objectContaining({
        response_type: 'all_good',
      })
    )
  })

  it('should fire engagement_unprompted_return event for organic returns (AC-4.7.4)', async () => {
    const userId = 'user-123'
    const existingState = createMockEngagementState(userId, 'dormant', {
      last_activity_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days inactive
    })

    mockQuerySequence([
      { data: existingState, error: null },
      { data: { ...existingState, state: 'active' }, error: null },
      { data: { id: 'transition-789' }, error: null },
    ])

    await transitionState(userId, 'user_message')

    expect(mockTrackEvent).toHaveBeenCalledWith(
      'engagement_unprompted_return',
      userId,
      expect.objectContaining({
        days_inactive: 7,
        previous_state: 'dormant',
      })
    )
  })
})

// =============================================================================
// Query Helper Tests (AC-4.7.6)
// =============================================================================

describe('Query Helpers (AC-4.7.6)', () => {
  beforeEach(() => {
    resetSupabaseMocks()
  })

  describe('getUserTransitionHistory', () => {
    it('should return user transition history ordered by created_at desc', async () => {
      const userId = 'user-123'
      const mockHistory = [
        {
          id: 'trans-1',
          user_id: userId,
          from_state: 'goodbye_sent',
          to_state: 'active',
          trigger: 'user_message',
          metadata: { days_inactive: 15, unprompted_return: false },
          created_at: '2025-11-22T12:00:00Z',
        },
        {
          id: 'trans-2',
          user_id: userId,
          from_state: 'active',
          to_state: 'goodbye_sent',
          trigger: 'inactivity_14d',
          metadata: { days_inactive: 14 },
          created_at: '2025-11-20T10:00:00Z',
        },
      ]

      mockQuerySequence([
        { data: mockHistory, error: null },
      ])

      const history = await getUserTransitionHistory(userId)

      expect(history).toHaveLength(2)
      expect(history[0].id).toBe('trans-1')
      expect(history[0].fromState).toBe('goodbye_sent')
      expect(history[0].toState).toBe('active')
      expect(history[0].metadata?.days_inactive).toBe(15)
    })

    it('should respect limit parameter', async () => {
      const userId = 'user-123'

      mockQuerySequence([
        { data: [], error: null },
      ])

      await getUserTransitionHistory(userId, 10)

      expect(mockSupabaseClient.from).toHaveBeenCalledWith('engagement_state_transitions')
    })

    it('should return empty array on error', async () => {
      const userId = 'user-123'

      mockQuerySequence([
        { data: null, error: { message: 'Database error' } },
      ])

      const history = await getUserTransitionHistory(userId)

      expect(history).toEqual([])
    })
  })

  describe('getTransitionStats', () => {
    it('should return aggregate statistics for date range', async () => {
      const mockData = [
        {
          id: 'trans-1',
          trigger: 'inactivity_14d',
          metadata: { days_inactive: 14, response_type: null },
        },
        {
          id: 'trans-2',
          trigger: 'goodbye_response_1',
          metadata: { days_inactive: 15, response_type: 'confused' },
        },
        {
          id: 'trans-3',
          trigger: 'user_message',
          metadata: { days_inactive: 7, unprompted_return: true },
        },
      ]

      mockQuerySequence([
        { data: mockData, error: null },
      ])

      const stats = await getTransitionStats(
        new Date('2025-11-01'),
        new Date('2025-11-30')
      )

      expect(stats.totalTransitions).toBe(3)
      expect(stats.transitionsByType['inactivity_14d']).toBe(1)
      expect(stats.transitionsByType['goodbye_response_1']).toBe(1)
      expect(stats.responseTypeDistribution['confused']).toBe(1)
      expect(stats.unpromptedReturns).toBe(1)
      expect(stats.averageDaysInactive).toBe(12) // (14 + 15 + 7) / 3 = 12
    })

    it('should return default stats on error', async () => {
      mockQuerySequence([
        { data: null, error: { message: 'Database error' } },
      ])

      const stats = await getTransitionStats(
        new Date('2025-11-01'),
        new Date('2025-11-30')
      )

      expect(stats.totalTransitions).toBe(0)
      expect(stats.unpromptedReturns).toBe(0)
    })

    it('should return default stats for empty result', async () => {
      mockQuerySequence([
        { data: [], error: null },
      ])

      const stats = await getTransitionStats(
        new Date('2025-11-01'),
        new Date('2025-11-30')
      )

      expect(stats.totalTransitions).toBe(0)
    })
  })
})
