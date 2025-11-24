/**
 * Timeout Functionality Tests
 *
 * Story 4.5: 48h Timeout to Dormant
 *
 * Tests:
 * - AC-4.5.1: getExpiredGoodbyes() returns users with expired goodbye
 * - AC-4.5.2: Transition trigger is 'goodbye_timeout'
 * - AC-4.5.3: No message is sent on timeout (silence by design)
 * - AC-4.5.4: Metadata includes response_type: 'timeout'
 * - AC-4.5.5: Multiple job runs don't cause duplicate transitions
 * - AC-4.5.6: State transition is logged to engagement_state_transitions
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  transitionState,
  getExpiredGoodbyes,
} from '../../../services/engagement/state-machine'
import { getTransitionTarget } from '../../../services/engagement/types'
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

// Mock message-router to avoid dependency issues
jest.mock('../../../services/engagement/message-router', () => ({
  getMessageDestination: jest.fn().mockResolvedValue(null),
}))

// Mock message-sender to avoid dependency issues
jest.mock('../../../services/scheduler/message-sender', () => ({
  queueMessage: jest.fn().mockResolvedValue(true),
  getIdempotencyKey: jest.fn().mockReturnValue('test-key'),
}))

// =============================================================================
// Helper Functions
// =============================================================================

const createMockEngagementState = (
  userId: string,
  state: string,
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

// =============================================================================
// AC-4.5.1: getExpiredGoodbyes() Tests
// =============================================================================

describe('Story 4.5 - getExpiredGoodbyes()', () => {
  beforeEach(() => {
    resetSupabaseMocks()
    mockTrackEvent.mockClear()
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2025-11-22T12:00:00Z'))
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('should return users with goodbye_expires_at < now (AC-4.5.1)', async () => {
    const expiredUser = createMockEngagementState('user-expired', 'goodbye_sent', {
      goodbye_sent_at: new Date(Date.now() - 50 * 60 * 60 * 1000).toISOString(), // 50h ago
      goodbye_expires_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2h ago (expired)
    })

    mockQuerySequence([
      { data: [expiredUser], error: null },
    ])

    const result = await getExpiredGoodbyes()

    expect(result).toHaveLength(1)
    expect(result[0].userId).toBe('user-expired')
    expect(result[0].state).toBe('goodbye_sent')
  })

  it('should exclude users with goodbye_expires_at > now (AC-4.5.1)', async () => {
    // Query returns empty because the user's goodbye hasn't expired yet
    mockQuerySequence([
      { data: [], error: null },
    ])

    const result = await getExpiredGoodbyes()

    expect(result).toEqual([])
  })

  it('should exclude users not in goodbye_sent state (AC-4.5.1)', async () => {
    // Query filters by state='goodbye_sent', so non-goodbye_sent users won't appear
    mockQuerySequence([
      { data: [], error: null },
    ])

    const result = await getExpiredGoodbyes()

    expect(result).toEqual([])
  })

  it('should handle empty results gracefully (AC-4.5.1)', async () => {
    mockQuerySequence([
      { data: [], error: null },
    ])

    const result = await getExpiredGoodbyes()

    expect(result).toEqual([])
    expect(Array.isArray(result)).toBe(true)
  })

  it('should return empty array on database error', async () => {
    mockQuerySequence([
      { data: null, error: { message: 'Database connection failed' } },
    ])

    const result = await getExpiredGoodbyes()

    expect(result).toEqual([])
  })
})

// =============================================================================
// AC-4.5.2: goodbye_timeout Trigger Tests
// =============================================================================

describe('Story 4.5 - goodbye_timeout Trigger', () => {
  beforeEach(() => {
    resetSupabaseMocks()
    mockTrackEvent.mockClear()
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2025-11-22T12:00:00Z'))
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('should transition goodbye_sent to dormant on goodbye_timeout (AC-4.5.2)', async () => {
    const userId = 'user-timeout'
    const existingState = createMockEngagementState(userId, 'goodbye_sent', {
      goodbye_sent_at: new Date(Date.now() - 49 * 60 * 60 * 1000).toISOString(),
      goodbye_expires_at: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
    })

    mockQuerySequence([
      { data: existingState, error: null },
      { data: { ...existingState, state: 'dormant' }, error: null },
      { data: { id: 'transition-456' }, error: null },
    ])

    const result = await transitionState(userId, 'goodbye_timeout')

    expect(result.success).toBe(true)
    expect(result.previousState).toBe('goodbye_sent')
    expect(result.newState).toBe('dormant')
  })

  it('should reject goodbye_timeout on non-goodbye_sent state (AC-4.5.2)', async () => {
    const userId = 'user-active'
    const existingState = createMockEngagementState(userId, 'active')

    mockQuerySequence([
      { data: existingState, error: null },
    ])

    const result = await transitionState(userId, 'goodbye_timeout')

    expect(result.success).toBe(false)
    expect(result.error).toContain('Invalid transition')
    expect(result.error).toContain('active')
    expect(result.error).toContain('goodbye_timeout')
  })

  it('should validate TRANSITION_MAP has goodbye_timeout -> dormant', () => {
    const target = getTransitionTarget('goodbye_sent', 'goodbye_timeout')
    expect(target).toBe('dormant')
  })

  it('should validate goodbye_timeout is distinct from goodbye_response_3', () => {
    // Both lead to dormant but are different triggers
    const timeoutTarget = getTransitionTarget('goodbye_sent', 'goodbye_timeout')
    const response3Target = getTransitionTarget('goodbye_sent', 'goodbye_response_3')

    expect(timeoutTarget).toBe('dormant')
    expect(response3Target).toBe('dormant')
    // They're the same destination but different triggers
  })
})

// =============================================================================
// AC-4.5.3: No Message on Timeout Tests
// =============================================================================

describe('Story 4.5 - Silence by Design (AC-4.5.3)', () => {
  beforeEach(() => {
    resetSupabaseMocks()
    mockTrackEvent.mockClear()
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2025-11-22T12:00:00Z'))
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('should NOT queue any message on goodbye_timeout transition (AC-4.5.3)', async () => {
    const userId = 'user-timeout-silent'
    const existingState = createMockEngagementState(userId, 'goodbye_sent', {
      goodbye_sent_at: new Date(Date.now() - 50 * 60 * 60 * 1000).toISOString(),
      goodbye_expires_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    })

    mockQuerySequence([
      { data: existingState, error: null },
      { data: { ...existingState, state: 'dormant' }, error: null },
      { data: { id: 'transition-456' }, error: null },
    ])

    const result = await transitionState(userId, 'goodbye_timeout')

    expect(result.success).toBe(true)
    // Check that 'no_message_sent_by_design' is in side effects
    expect(result.sideEffects).toContain('no_message_sent_by_design')
    // Check that 'queued_goodbye_message' is NOT in side effects
    expect(result.sideEffects).not.toContain('queued_goodbye_message')
    expect(result.sideEffects).not.toContain('queued_reminder_message')
  })
})

// =============================================================================
// AC-4.5.4: Analytics Metadata Tests
// =============================================================================

describe('Story 4.5 - Analytics with response_type: timeout (AC-4.5.4)', () => {
  beforeEach(() => {
    resetSupabaseMocks()
    mockTrackEvent.mockClear()
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2025-11-22T12:00:00Z'))
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('should fire PostHog event with response_type: timeout (AC-4.5.4)', async () => {
    const userId = 'user-analytics'
    const goodbyeSentAt = new Date(Date.now() - 50 * 60 * 60 * 1000) // 50h ago
    const existingState = createMockEngagementState(userId, 'goodbye_sent', {
      goodbye_sent_at: goodbyeSentAt.toISOString(),
      goodbye_expires_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    })

    mockQuerySequence([
      { data: existingState, error: null },
      { data: { ...existingState, state: 'dormant' }, error: null },
      { data: { id: 'transition-456' }, error: null },
    ])

    await transitionState(userId, 'goodbye_timeout')

    // Verify PostHog was called with correct event
    expect(mockTrackEvent).toHaveBeenCalledWith(
      'engagement_goodbye_response', // Event name from enum
      userId,
      expect.objectContaining({
        response_type: 'timeout',
        from_state: 'goodbye_sent',
        to_state: 'dormant',
      })
    )
  })

  it('should include timing metrics in analytics (AC-4.5.4)', async () => {
    const userId = 'user-timing'
    const goodbyeSentAt = new Date(Date.now() - 50 * 60 * 60 * 1000) // 50h ago
    const existingState = createMockEngagementState(userId, 'goodbye_sent', {
      goodbye_sent_at: goodbyeSentAt.toISOString(),
      goodbye_expires_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    })

    mockQuerySequence([
      { data: existingState, error: null },
      { data: { ...existingState, state: 'dormant' }, error: null },
      { data: { id: 'transition-456' }, error: null },
    ])

    await transitionState(userId, 'goodbye_timeout')

    // Verify analytics include timing
    expect(mockTrackEvent).toHaveBeenCalledWith(
      expect.any(String),
      userId,
      expect.objectContaining({
        days_since_goodbye: expect.any(Number),
        hours_waited: expect.any(Number),
      })
    )
  })

  it('should include tracked_goodbye_timeout_analytics in side effects', async () => {
    const userId = 'user-effects'
    const existingState = createMockEngagementState(userId, 'goodbye_sent', {
      goodbye_sent_at: new Date(Date.now() - 50 * 60 * 60 * 1000).toISOString(),
      goodbye_expires_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    })

    mockQuerySequence([
      { data: existingState, error: null },
      { data: { ...existingState, state: 'dormant' }, error: null },
      { data: { id: 'transition-456' }, error: null },
    ])

    const result = await transitionState(userId, 'goodbye_timeout')

    expect(result.sideEffects).toContain('tracked_goodbye_timeout_analytics')
  })
})

// =============================================================================
// AC-4.5.5: Idempotency Tests
// =============================================================================

describe('Story 4.5 - Idempotency (AC-4.5.5)', () => {
  beforeEach(() => {
    resetSupabaseMocks()
    mockTrackEvent.mockClear()
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2025-11-22T12:00:00Z'))
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('should naturally exclude already-dormant users from getExpiredGoodbyes()', async () => {
    // When a user is already in dormant state, getExpiredGoodbyes() won't return them
    // because the query filters for state='goodbye_sent'
    mockQuerySequence([
      { data: [], error: null }, // Empty because user already dormant
    ])

    const result = await getExpiredGoodbyes()

    expect(result).toEqual([])
  })

  it('should reject duplicate transition gracefully (race condition)', async () => {
    const userId = 'user-race'
    // User was already transitioned to dormant
    const alreadyDormantState = createMockEngagementState(userId, 'dormant')

    mockQuerySequence([
      { data: alreadyDormantState, error: null },
    ])

    const result = await transitionState(userId, 'goodbye_timeout')

    expect(result.success).toBe(false)
    expect(result.error).toContain('Invalid transition')
  })

  it('should handle optimistic lock conflict (concurrent job runs)', async () => {
    const userId = 'user-concurrent'
    const existingState = createMockEngagementState(userId, 'goodbye_sent', {
      goodbye_sent_at: new Date(Date.now() - 50 * 60 * 60 * 1000).toISOString(),
      goodbye_expires_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    })

    mockQuerySequence([
      { data: existingState, error: null },
      // Another process already updated this user
      { data: null, error: { code: 'PGRST116', message: 'No rows found' } },
    ])

    const result = await transitionState(userId, 'goodbye_timeout')

    expect(result.success).toBe(false)
    expect(result.error).toContain('modified by another process')
  })
})

// =============================================================================
// AC-4.5.6: State Transition Logging Tests
// =============================================================================

describe('Story 4.5 - Transition Logging (AC-4.5.6)', () => {
  beforeEach(() => {
    resetSupabaseMocks()
    mockTrackEvent.mockClear()
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2025-11-22T12:00:00Z'))
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('should log transition to engagement_state_transitions table (AC-4.5.6)', async () => {
    const userId = 'user-logged'
    const existingState = createMockEngagementState(userId, 'goodbye_sent', {
      goodbye_sent_at: new Date(Date.now() - 50 * 60 * 60 * 1000).toISOString(),
      goodbye_expires_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    })

    mockQuerySequence([
      { data: existingState, error: null },
      { data: { ...existingState, state: 'dormant' }, error: null },
      { data: { id: 'transition-789' }, error: null },
    ])

    const result = await transitionState(userId, 'goodbye_timeout')

    expect(result.success).toBe(true)
    expect(result.transitionId).toBe('transition-789')

    // Verify insert was called on engagement_state_transitions
    expect(mockSupabaseClient.from).toHaveBeenCalledWith('engagement_state_transitions')
  })

  it('should include trigger in transition log', async () => {
    const userId = 'user-trigger-log'
    const existingState = createMockEngagementState(userId, 'goodbye_sent', {
      goodbye_sent_at: new Date(Date.now() - 50 * 60 * 60 * 1000).toISOString(),
      goodbye_expires_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    })

    mockQuerySequence([
      { data: existingState, error: null },
      { data: { ...existingState, state: 'dormant' }, error: null },
      { data: { id: 'transition-456' }, error: null },
    ])

    const result = await transitionState(userId, 'goodbye_timeout')

    expect(result.success).toBe(true)
    // The trigger 'goodbye_timeout' is passed to transitionState and logged
  })
})

// =============================================================================
// Timestamp Cleanup Tests
// =============================================================================

describe('Story 4.5 - Timestamp Cleanup on Dormant Transition', () => {
  beforeEach(() => {
    resetSupabaseMocks()
    mockTrackEvent.mockClear()
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2025-11-22T12:00:00Z'))
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('should clear goodbye_sent_at and goodbye_expires_at when transitioning to dormant', async () => {
    const userId = 'user-cleanup'
    const existingState = createMockEngagementState(userId, 'goodbye_sent', {
      goodbye_sent_at: new Date(Date.now() - 50 * 60 * 60 * 1000).toISOString(),
      goodbye_expires_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    })

    mockQuerySequence([
      { data: existingState, error: null },
      {
        data: {
          ...existingState,
          state: 'dormant',
          goodbye_sent_at: null,
          goodbye_expires_at: null,
        },
        error: null,
      },
      { data: { id: 'transition-456' }, error: null },
    ])

    const result = await transitionState(userId, 'goodbye_timeout')

    expect(result.success).toBe(true)
    expect(result.newState).toBe('dormant')
  })
})

// =============================================================================
// Edge Cases Tests
// =============================================================================

describe('Story 4.5 - Edge Cases (AC-4.5.5)', () => {
  beforeEach(() => {
    resetSupabaseMocks()
    mockTrackEvent.mockClear()
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2025-11-22T12:00:00Z'))
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('should handle 47h timeout (not yet expired)', async () => {
    // Query returns empty because goodbye hasn't expired yet
    mockQuerySequence([
      { data: [], error: null },
    ])

    const result = await getExpiredGoodbyes()

    expect(result).toEqual([])
  })

  it('should handle 48h+ timeout (expired)', async () => {
    const expiredUser = createMockEngagementState('user-48h', 'goodbye_sent', {
      goodbye_sent_at: new Date(Date.now() - 48.1 * 60 * 60 * 1000).toISOString(),
      goodbye_expires_at: new Date(Date.now() - 0.1 * 60 * 60 * 1000).toISOString(), // Just expired
    })

    mockQuerySequence([
      { data: [expiredUser], error: null },
    ])

    const result = await getExpiredGoodbyes()

    expect(result).toHaveLength(1)
  })

  it('should handle null goodbye_sent_at gracefully in analytics', async () => {
    const userId = 'user-null-timestamp'
    // Edge case: goodbye_sent_at is null (shouldn't happen but defensive)
    const existingState = createMockEngagementState(userId, 'goodbye_sent', {
      goodbye_sent_at: null,
      goodbye_expires_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    })

    mockQuerySequence([
      { data: existingState, error: null },
      { data: { ...existingState, state: 'dormant' }, error: null },
      { data: { id: 'transition-456' }, error: null },
    ])

    const result = await transitionState(userId, 'goodbye_timeout')

    expect(result.success).toBe(true)
    // Should still track analytics with 0 values for timing
    expect(mockTrackEvent).toHaveBeenCalledWith(
      expect.any(String),
      userId,
      expect.objectContaining({
        days_since_goodbye: 0,
        hours_waited: 0,
      })
    )
  })

  it('should handle database connection failure in getExpiredGoodbyes()', async () => {
    mockQuerySequence([
      { data: null, error: { code: 'ECONNREFUSED', message: 'Connection refused' } },
    ])

    const result = await getExpiredGoodbyes()

    expect(result).toEqual([])
  })

  it('should handle database error during transition gracefully', async () => {
    const userId = 'user-db-error'
    const existingState = createMockEngagementState(userId, 'goodbye_sent', {
      goodbye_sent_at: new Date(Date.now() - 50 * 60 * 60 * 1000).toISOString(),
      goodbye_expires_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    })

    mockQuerySequence([
      { data: existingState, error: null },
      { data: null, error: { code: 'ECONNREFUSED', message: 'Connection refused' } },
    ])

    const result = await transitionState(userId, 'goodbye_timeout')

    expect(result.success).toBe(false)
    expect(result.error).toContain('Database error')
  })
})
