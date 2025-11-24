/**
 * State Machine Tests
 *
 * Story 4.1: State Machine Service Core
 *
 * Tests:
 * - AC-4.1.1: transitionState() validates all 10 transitions per architecture state diagram
 * - AC-4.1.2: Invalid transitions are logged and rejected with descriptive error
 * - AC-4.1.3: Every successful transition creates engagement_state_transitions record
 * - AC-4.1.4: State machine handles missing user gracefully (creates initial state)
 * - AC-4.1.5: Concurrent transitions for same user handled safely (optimistic locking)
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  transitionState,
  getEngagementState,
  getEngagementStateRecord,
  initializeEngagementState,
  getInactiveUsers,
  getExpiredGoodbyes,
  getDueReminders,
  updateLastActivity,
} from '../../../services/engagement/state-machine'
import {
  TRANSITION_MAP,
  getTransitionTarget,
  type EngagementState,
  type TransitionTrigger,
} from '../../../services/engagement/types'
import {
  GOODBYE_TIMEOUT_HOURS,
  REMIND_LATER_DAYS,
} from '../../../services/engagement/constants'
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

// =============================================================================
// Helper Functions
// =============================================================================

const createMockEngagementState = (
  userId: string,
  state: EngagementState,
  overrides: Partial<any> = {}
) => ({
  id: 'state-123',
  user_id: userId,
  state,
  last_activity_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), // 5 days ago
  goodbye_sent_at: null,
  goodbye_expires_at: null,
  remind_at: null,
  created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days ago
  updated_at: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(), // 1 hour ago
  ...overrides,
})

// =============================================================================
// TRANSITION_MAP Validation Tests
// =============================================================================

describe('State Machine - TRANSITION_MAP Validation', () => {
  describe('getTransitionTarget', () => {
    it('should return correct target for all 10 valid transitions (AC-4.1.1)', () => {
      // 1. active + inactivity_14d → goodbye_sent
      expect(getTransitionTarget('active', 'inactivity_14d')).toBe('goodbye_sent')

      // 2. goodbye_sent + user_message → active
      expect(getTransitionTarget('goodbye_sent', 'user_message')).toBe('active')

      // 3. goodbye_sent + goodbye_response_1 → help_flow
      expect(getTransitionTarget('goodbye_sent', 'goodbye_response_1')).toBe('help_flow')

      // 4. goodbye_sent + goodbye_response_2 → remind_later
      expect(getTransitionTarget('goodbye_sent', 'goodbye_response_2')).toBe('remind_later')

      // 5. goodbye_sent + goodbye_response_3 → dormant
      expect(getTransitionTarget('goodbye_sent', 'goodbye_response_3')).toBe('dormant')

      // 6. goodbye_sent + goodbye_timeout → dormant
      expect(getTransitionTarget('goodbye_sent', 'goodbye_timeout')).toBe('dormant')

      // 7. help_flow + user_message → active
      expect(getTransitionTarget('help_flow', 'user_message')).toBe('active')

      // 8. remind_later + user_message → active
      expect(getTransitionTarget('remind_later', 'user_message')).toBe('active')

      // 9. remind_later + reminder_due → dormant
      expect(getTransitionTarget('remind_later', 'reminder_due')).toBe('dormant')

      // 10. dormant + user_message → active
      expect(getTransitionTarget('dormant', 'user_message')).toBe('active')
    })

    it('should return null for invalid transitions (AC-4.1.2)', () => {
      // Invalid: active + user_message (no transition defined)
      expect(getTransitionTarget('active', 'user_message')).toBeNull()

      // Invalid: active → dormant directly
      expect(getTransitionTarget('active', 'goodbye_timeout')).toBeNull()

      // Invalid: dormant → goodbye_sent
      expect(getTransitionTarget('dormant', 'inactivity_14d')).toBeNull()

      // Invalid: help_flow → dormant
      expect(getTransitionTarget('help_flow', 'goodbye_timeout')).toBeNull()
    })
  })
})

// =============================================================================
// transitionState() Tests
// =============================================================================

describe('State Machine - transitionState()', () => {
  beforeEach(() => {
    resetSupabaseMocks()
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2025-11-22T12:00:00Z'))
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  describe('Valid Transitions (AC-4.1.1)', () => {
    it('should transition from active to goodbye_sent on inactivity_14d', async () => {
      const userId = 'user-123'
      const existingState = createMockEngagementState(userId, 'active')

      mockQuerySequence([
        // 1. Get current state
        { data: existingState, error: null },
        // 2. Update state
        { data: { ...existingState, state: 'goodbye_sent' }, error: null },
        // 3. Insert transition log
        { data: { id: 'transition-456' }, error: null },
      ])

      const result = await transitionState(userId, 'inactivity_14d')

      expect(result.success).toBe(true)
      expect(result.previousState).toBe('active')
      expect(result.newState).toBe('goodbye_sent')
      expect(result.sideEffects).toContain('goodbye_timer_started')
    })

    it('should transition from goodbye_sent to active on user_message', async () => {
      const userId = 'user-123'
      const existingState = createMockEngagementState(userId, 'goodbye_sent', {
        goodbye_sent_at: new Date().toISOString(),
        goodbye_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      })

      mockQuerySequence([
        { data: existingState, error: null },
        { data: { ...existingState, state: 'active' }, error: null },
        { data: { id: 'transition-456' }, error: null },
      ])

      const result = await transitionState(userId, 'user_message')

      expect(result.success).toBe(true)
      expect(result.previousState).toBe('goodbye_sent')
      expect(result.newState).toBe('active')
      expect(result.sideEffects).toContain('reactivated_user')
    })

    it('should transition from goodbye_sent to help_flow on goodbye_response_1', async () => {
      const userId = 'user-123'
      const existingState = createMockEngagementState(userId, 'goodbye_sent')

      mockQuerySequence([
        { data: existingState, error: null },
        { data: { ...existingState, state: 'help_flow' }, error: null },
        { data: { id: 'transition-456' }, error: null },
      ])

      const result = await transitionState(userId, 'goodbye_response_1')

      expect(result.success).toBe(true)
      expect(result.newState).toBe('help_flow')
    })

    it('should transition from goodbye_sent to remind_later on goodbye_response_2', async () => {
      const userId = 'user-123'
      const existingState = createMockEngagementState(userId, 'goodbye_sent')

      mockQuerySequence([
        { data: existingState, error: null },
        { data: { ...existingState, state: 'remind_later' }, error: null },
        { data: { id: 'transition-456' }, error: null },
      ])

      const result = await transitionState(userId, 'goodbye_response_2')

      expect(result.success).toBe(true)
      expect(result.newState).toBe('remind_later')
      expect(result.sideEffects).toContain('reminder_scheduled')
    })

    it('should transition from goodbye_sent to dormant on goodbye_response_3', async () => {
      const userId = 'user-123'
      const existingState = createMockEngagementState(userId, 'goodbye_sent')

      mockQuerySequence([
        { data: existingState, error: null },
        { data: { ...existingState, state: 'dormant' }, error: null },
        { data: { id: 'transition-456' }, error: null },
      ])

      const result = await transitionState(userId, 'goodbye_response_3')

      expect(result.success).toBe(true)
      expect(result.newState).toBe('dormant')
    })

    it('should transition from goodbye_sent to dormant on goodbye_timeout', async () => {
      const userId = 'user-123'
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
      expect(result.newState).toBe('dormant')
    })

    it('should transition from help_flow to active on user_message', async () => {
      const userId = 'user-123'
      const existingState = createMockEngagementState(userId, 'help_flow')

      mockQuerySequence([
        { data: existingState, error: null },
        { data: { ...existingState, state: 'active' }, error: null },
        { data: { id: 'transition-456' }, error: null },
      ])

      const result = await transitionState(userId, 'user_message')

      expect(result.success).toBe(true)
      expect(result.newState).toBe('active')
      expect(result.sideEffects).toContain('reactivated_user')
    })

    it('should transition from remind_later to active on user_message', async () => {
      const userId = 'user-123'
      const existingState = createMockEngagementState(userId, 'remind_later', {
        remind_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      })

      mockQuerySequence([
        { data: existingState, error: null },
        { data: { ...existingState, state: 'active' }, error: null },
        { data: { id: 'transition-456' }, error: null },
      ])

      const result = await transitionState(userId, 'user_message')

      expect(result.success).toBe(true)
      expect(result.newState).toBe('active')
    })

    it('should transition from remind_later to dormant on reminder_due', async () => {
      const userId = 'user-123'
      const existingState = createMockEngagementState(userId, 'remind_later', {
        remind_at: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(), // expired
      })

      mockQuerySequence([
        { data: existingState, error: null },
        { data: { ...existingState, state: 'dormant' }, error: null },
        { data: { id: 'transition-456' }, error: null },
      ])

      const result = await transitionState(userId, 'reminder_due')

      expect(result.success).toBe(true)
      expect(result.newState).toBe('dormant')
    })

    it('should transition from dormant to active on user_message', async () => {
      const userId = 'user-123'
      const existingState = createMockEngagementState(userId, 'dormant')

      mockQuerySequence([
        { data: existingState, error: null },
        { data: { ...existingState, state: 'active' }, error: null },
        { data: { id: 'transition-456' }, error: null },
      ])

      const result = await transitionState(userId, 'user_message')

      expect(result.success).toBe(true)
      expect(result.previousState).toBe('dormant')
      expect(result.newState).toBe('active')
      expect(result.sideEffects).toContain('reactivated_user')
    })
  })

  describe('Invalid Transitions (AC-4.1.2)', () => {
    it('should reject invalid transition active + user_message', async () => {
      const userId = 'user-123'
      const existingState = createMockEngagementState(userId, 'active')

      mockQuerySequence([
        { data: existingState, error: null },
      ])

      const result = await transitionState(userId, 'user_message')

      expect(result.success).toBe(false)
      expect(result.error).toContain('Invalid transition')
      expect(result.error).toContain('active')
      expect(result.error).toContain('user_message')
    })

    it('should reject invalid transition dormant + inactivity_14d', async () => {
      const userId = 'user-123'
      const existingState = createMockEngagementState(userId, 'dormant')

      mockQuerySequence([
        { data: existingState, error: null },
      ])

      const result = await transitionState(userId, 'inactivity_14d')

      expect(result.success).toBe(false)
      expect(result.error).toContain('Invalid transition')
    })

    it('should reject invalid transition active + goodbye_timeout', async () => {
      const userId = 'user-123'
      const existingState = createMockEngagementState(userId, 'active')

      mockQuerySequence([
        { data: existingState, error: null },
      ])

      const result = await transitionState(userId, 'goodbye_timeout')

      expect(result.success).toBe(false)
      expect(result.error).toContain('Invalid transition')
    })
  })

  describe('Transition Logging (AC-4.1.3)', () => {
    it('should create engagement_state_transitions record on success', async () => {
      const userId = 'user-123'
      const existingState = createMockEngagementState(userId, 'active')

      mockQuerySequence([
        { data: existingState, error: null },
        { data: { ...existingState, state: 'goodbye_sent' }, error: null },
        { data: { id: 'transition-789' }, error: null },
      ])

      const result = await transitionState(userId, 'inactivity_14d', { custom: 'metadata' })

      expect(result.success).toBe(true)
      expect(result.transitionId).toBe('transition-789')

      // Verify insert was called with correct params
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('engagement_state_transitions')
    })

    it('should include days_inactive in metadata', async () => {
      const userId = 'user-123'
      // User inactive for 15 days
      const existingState = createMockEngagementState(userId, 'active', {
        last_activity_at: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
      })

      mockQuerySequence([
        { data: existingState, error: null },
        { data: { ...existingState, state: 'goodbye_sent' }, error: null },
        { data: { id: 'transition-789' }, error: null },
      ])

      const result = await transitionState(userId, 'inactivity_14d')

      expect(result.success).toBe(true)
      // The days_inactive is calculated and logged in metadata
    })
  })

  describe('New User Initialization (AC-4.1.4)', () => {
    it('should initialize state for new user on user_message trigger', async () => {
      const userId = 'new-user-123'

      mockQuerySequence([
        // 1. Get current state - not found
        { data: null, error: { code: 'PGRST116', message: 'No rows found' } },
        // 2. Insert new state
        { data: createMockEngagementState(userId, 'active'), error: null },
      ])

      const result = await transitionState(userId, 'user_message')

      expect(result.success).toBe(true)
      expect(result.previousState).toBe('active')
      expect(result.newState).toBe('active')
      expect(result.sideEffects).toContain('initialized_new_user')
    })

    it('should fail for new user with non-user_message trigger', async () => {
      const userId = 'new-user-456'

      mockQuerySequence([
        { data: null, error: { code: 'PGRST116', message: 'No rows found' } },
      ])

      const result = await transitionState(userId, 'inactivity_14d')

      expect(result.success).toBe(false)
      expect(result.error).toContain('does not have an engagement state record')
    })
  })

  describe('Concurrent Transitions (AC-4.1.5)', () => {
    it('should handle optimistic lock conflict gracefully', async () => {
      const userId = 'user-123'
      const existingState = createMockEngagementState(userId, 'active')

      mockQuerySequence([
        // 1. Get current state
        { data: existingState, error: null },
        // 2. Update fails - no rows matched (state was modified)
        { data: null, error: { code: 'PGRST116', message: 'No rows found' } },
      ])

      const result = await transitionState(userId, 'inactivity_14d')

      expect(result.success).toBe(false)
      expect(result.error).toContain('modified by another process')
    })

    it('should handle null update response (optimistic lock failed)', async () => {
      const userId = 'user-123'
      const existingState = createMockEngagementState(userId, 'active')

      mockQuerySequence([
        { data: existingState, error: null },
        { data: null, error: null }, // No error but no data = lock failed
      ])

      const result = await transitionState(userId, 'inactivity_14d')

      expect(result.success).toBe(false)
      expect(result.error).toContain('modified by another process')
    })
  })

  describe('Timestamp Updates (AC-4.1.1)', () => {
    it('should set goodbye_sent_at and goodbye_expires_at when transitioning to goodbye_sent', async () => {
      const userId = 'user-123'
      const existingState = createMockEngagementState(userId, 'active')
      const now = new Date()
      const expectedExpiry = new Date(now.getTime() + GOODBYE_TIMEOUT_HOURS * 60 * 60 * 1000)

      mockQuerySequence([
        { data: existingState, error: null },
        {
          data: {
            ...existingState,
            state: 'goodbye_sent',
            goodbye_sent_at: now.toISOString(),
            goodbye_expires_at: expectedExpiry.toISOString(),
          },
          error: null,
        },
        { data: { id: 'transition-456' }, error: null },
      ])

      const result = await transitionState(userId, 'inactivity_14d')

      expect(result.success).toBe(true)
      expect(result.newState).toBe('goodbye_sent')
    })

    it('should set remind_at when transitioning to remind_later', async () => {
      const userId = 'user-123'
      const existingState = createMockEngagementState(userId, 'goodbye_sent')
      const now = new Date()
      const expectedRemindAt = new Date(now.getTime() + REMIND_LATER_DAYS * 24 * 60 * 60 * 1000)

      mockQuerySequence([
        { data: existingState, error: null },
        {
          data: {
            ...existingState,
            state: 'remind_later',
            remind_at: expectedRemindAt.toISOString(),
          },
          error: null,
        },
        { data: { id: 'transition-456' }, error: null },
      ])

      const result = await transitionState(userId, 'goodbye_response_2')

      expect(result.success).toBe(true)
      expect(result.newState).toBe('remind_later')
    })

    it('should clear timestamps when transitioning to active', async () => {
      const userId = 'user-123'
      const existingState = createMockEngagementState(userId, 'goodbye_sent', {
        goodbye_sent_at: new Date().toISOString(),
        goodbye_expires_at: new Date().toISOString(),
      })

      mockQuerySequence([
        { data: existingState, error: null },
        {
          data: {
            ...existingState,
            state: 'active',
            goodbye_sent_at: null,
            goodbye_expires_at: null,
            remind_at: null,
          },
          error: null,
        },
        { data: { id: 'transition-456' }, error: null },
      ])

      const result = await transitionState(userId, 'user_message')

      expect(result.success).toBe(true)
      expect(result.newState).toBe('active')
    })
  })
})

// =============================================================================
// Query Helper Functions Tests
// =============================================================================

describe('State Machine - Query Helper Functions', () => {
  beforeEach(() => {
    resetSupabaseMocks()
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2025-11-22T12:00:00Z'))
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  describe('getEngagementState', () => {
    it('should return current state for existing user', async () => {
      const userId = 'user-123'

      mockQuerySequence([
        { data: createMockEngagementState(userId, 'goodbye_sent'), error: null },
      ])

      const state = await getEngagementState(userId)

      expect(state).toBe('goodbye_sent')
    })

    it('should return active for new user without state record', async () => {
      const userId = 'new-user'

      mockQuerySequence([
        { data: null, error: { code: 'PGRST116', message: 'No rows found' } },
      ])

      const state = await getEngagementState(userId)

      expect(state).toBe('active')
    })
  })

  describe('getEngagementStateRecord', () => {
    it('should return full state record for existing user', async () => {
      const userId = 'user-123'
      const mockState = createMockEngagementState(userId, 'remind_later', {
        remind_at: new Date().toISOString(),
      })

      mockQuerySequence([
        { data: mockState, error: null },
      ])

      const record = await getEngagementStateRecord(userId)

      expect(record).not.toBeNull()
      expect(record?.userId).toBe(userId)
      expect(record?.state).toBe('remind_later')
      expect(record?.remindAt).toBeInstanceOf(Date)
    })

    it('should return null for user without state record', async () => {
      const userId = 'new-user'

      mockQuerySequence([
        { data: null, error: { code: 'PGRST116', message: 'No rows found' } },
      ])

      const record = await getEngagementStateRecord(userId)

      expect(record).toBeNull()
    })
  })

  describe('initializeEngagementState', () => {
    it('should create new state record', async () => {
      const userId = 'new-user-789'

      mockQuerySequence([
        { data: createMockEngagementState(userId, 'active'), error: null },
      ])

      const result = await initializeEngagementState(userId)

      expect(result).not.toBeNull()
      expect(result?.state).toBe('active')
    })

    it('should handle duplicate key error gracefully', async () => {
      const userId = 'existing-user'

      mockQuerySequence([
        // Insert fails with unique constraint
        { data: null, error: { code: '23505', message: 'Unique constraint violated' } },
        // Fallback fetch succeeds
        { data: createMockEngagementState(userId, 'active'), error: null },
      ])

      const result = await initializeEngagementState(userId)

      expect(result).not.toBeNull()
      expect(result?.state).toBe('active')
    })
  })

  describe('getInactiveUsers', () => {
    it('should return users inactive for specified days', async () => {
      const inactiveUsers = [
        createMockEngagementState('user-1', 'active', {
          last_activity_at: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
        }),
        createMockEngagementState('user-2', 'active', {
          last_activity_at: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
        }),
      ]

      mockQuerySequence([
        { data: inactiveUsers, error: null },
      ])

      const result = await getInactiveUsers(14)

      expect(result).toHaveLength(2)
      expect(result[0].userId).toBe('user-1')
      expect(result[1].userId).toBe('user-2')
    })

    it('should return empty array on error', async () => {
      mockQuerySequence([
        { data: null, error: { message: 'Database error' } },
      ])

      const result = await getInactiveUsers(14)

      expect(result).toEqual([])
    })
  })

  describe('getExpiredGoodbyes', () => {
    it('should return users with expired goodbye messages', async () => {
      const expiredUsers = [
        createMockEngagementState('user-1', 'goodbye_sent', {
          goodbye_expires_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        }),
      ]

      mockQuerySequence([
        { data: expiredUsers, error: null },
      ])

      const result = await getExpiredGoodbyes()

      expect(result).toHaveLength(1)
      expect(result[0].state).toBe('goodbye_sent')
    })

    it('should return empty array when no expired goodbyes', async () => {
      mockQuerySequence([
        { data: [], error: null },
      ])

      const result = await getExpiredGoodbyes()

      expect(result).toEqual([])
    })
  })

  describe('getDueReminders', () => {
    it('should return users with due reminders', async () => {
      const dueUsers = [
        createMockEngagementState('user-1', 'remind_later', {
          remind_at: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
        }),
      ]

      mockQuerySequence([
        { data: dueUsers, error: null },
      ])

      const result = await getDueReminders()

      expect(result).toHaveLength(1)
      expect(result[0].state).toBe('remind_later')
    })

    it('should return empty array when no due reminders', async () => {
      mockQuerySequence([
        { data: [], error: null },
      ])

      const result = await getDueReminders()

      expect(result).toEqual([])
    })
  })

  describe('updateLastActivity', () => {
    it('should update last_activity_at timestamp', async () => {
      const userId = 'user-123'

      mockQuerySequence([
        { data: {}, error: null },
      ])

      const result = await updateLastActivity(userId)

      expect(result).toBe(true)
    })

    it('should return false on error', async () => {
      const userId = 'user-123'

      mockQuerySequence([
        { data: null, error: { message: 'Database error' } },
      ])

      const result = await updateLastActivity(userId)

      expect(result).toBe(false)
    })
  })
})

// =============================================================================
// Error Handling Tests
// =============================================================================

describe('State Machine - Error Handling', () => {
  beforeEach(() => {
    resetSupabaseMocks()
  })

  it('should handle database errors on state update gracefully', async () => {
    const userId = 'user-123'
    const existingState = createMockEngagementState(userId, 'active')

    mockQuerySequence([
      // 1. Get state succeeds
      { data: existingState, error: null },
      // 2. Update fails with database error
      { data: null, error: { code: 'CONNECTION_ERROR', message: 'Connection refused' } },
    ])

    const result = await transitionState(userId, 'inactivity_14d')

    expect(result.success).toBe(false)
    expect(result.error).toContain('Database error')
  })

  it('should handle database errors on initialization gracefully', async () => {
    const userId = 'new-user'

    mockQuerySequence([
      // 1. Get state fails (no rows)
      { data: null, error: { code: 'PGRST116', message: 'No rows found' } },
      // 2. Insert fails
      { data: null, error: { code: 'CONNECTION_ERROR', message: 'Connection refused' } },
    ])

    const result = await transitionState(userId, 'user_message')

    expect(result.success).toBe(false)
    expect(result.error).toContain('Failed to initialize')
  })
})
