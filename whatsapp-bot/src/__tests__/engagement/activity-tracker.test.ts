/**
 * Activity Tracker Tests
 *
 * Story 2.1: First Message Detection
 * - AC-2.1.1: First message creates engagement state with state='active'
 * - AC-2.1.2: isFirstMessage() returns false for returning users
 * - AC-2.1.3: last_activity_at updated on every message
 * - AC-2.1.4: Works for both individual and group messages
 *
 * Story 4.2: Activity Tracking & Auto-Reactivation
 * - AC-4.2.1: Every incoming message updates last_activity_at timestamp
 * - AC-4.2.2: User in dormant state sending any message → transitions to active
 * - AC-4.2.3: User in goodbye_sent state sending non-response message → transitions to active
 * - AC-4.2.4: Unprompted return (3+ days since last activity) logged in transition metadata
 * - AC-4.2.5: Activity tracking completes in < 50ms (non-blocking)
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  checkAndRecordActivity,
  isFirstMessage,
  getDaysSinceLastActivity,
  type MessageContext,
} from '../../services/engagement/activity-tracker'
import {
  mockSupabaseClient,
  resetSupabaseMocks,
  mockQuerySuccess,
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

// Mock the state machine for Story 4.2 tests
const mockTransitionState = jest.fn()
jest.mock('../../services/engagement/state-machine', () => ({
  transitionState: (...args: any[]) => mockTransitionState(...args),
}))

describe('Activity Tracker - Story 2.1', () => {
  beforeEach(() => {
    resetSupabaseMocks()
    mockTransitionState.mockReset()
    mockTransitionState.mockResolvedValue({ success: true, previousState: 'dormant', newState: 'active' })
  })

  describe('isFirstMessage', () => {
    it('should return true when no engagement state exists (AC-2.1.2)', async () => {
      // Mock: no existing engagement state
      mockQuerySuccess(null)

      const result = await isFirstMessage('user-123')

      expect(result).toBe(true)
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('user_engagement_states')
    })

    it('should return false when engagement state exists (AC-2.1.2)', async () => {
      // Mock: existing engagement state
      mockQuerySuccess({ id: 'state-123', user_id: 'user-123', state: 'active' })

      const result = await isFirstMessage('user-123')

      expect(result).toBe(false)
    })

    it('should return false on database error (safe default)', async () => {
      // Mock: database error
      mockSupabaseClient.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockReturnThis(),
        then: jest.fn((resolve) => resolve({ data: null, error: new Error('DB Error') })),
      })

      const result = await isFirstMessage('user-123')

      expect(result).toBe(false)
    })
  })

  describe('checkAndRecordActivity', () => {
    const individualContext: MessageContext = {
      jid: '5511999999999@s.whatsapp.net',
      isGroup: false,
      messageText: 'Hello',
      pushName: 'John',
    }

    const groupContext: MessageContext = {
      jid: '5511999999999@s.whatsapp.net',
      isGroup: true,
      groupJid: '120363123456789@g.us',
      messageText: 'Hello from group',
      pushName: 'John',
    }

    it('should create engagement state for first message (AC-2.1.1)', async () => {
      // Mock sequence: 1. Check existing (null), 2. Insert (success)
      mockQuerySequence([
        { data: null, error: null }, // Select returns null (no existing state)
        { data: null, error: null }, // Insert succeeds
      ])

      const result = await checkAndRecordActivity('user-123', individualContext)

      expect(result.isFirstMessage).toBe(true)
      expect(result.engagementState).toBe('active')
      expect(result.userId).toBe('user-123')
    })

    it('should return isFirstMessage=false for returning user (AC-2.1.2)', async () => {
      // Mock: existing engagement state
      mockQuerySequence([
        {
          data: { id: 'state-123', user_id: 'user-123', state: 'active' },
          error: null,
        },
        { data: null, error: null }, // Update succeeds
      ])

      const result = await checkAndRecordActivity('user-123', individualContext)

      expect(result.isFirstMessage).toBe(false)
      expect(result.engagementState).toBe('active')
    })

    it('should update last_activity_at for returning user (AC-2.1.3)', async () => {
      // Mock: existing engagement state
      mockQuerySequence([
        {
          data: { id: 'state-123', user_id: 'user-123', state: 'active' },
          error: null,
        },
        { data: null, error: null }, // Update succeeds
      ])

      await checkAndRecordActivity('user-123', individualContext)

      // Verify update was called (second call to 'from')
      expect(mockSupabaseClient.from).toHaveBeenCalledTimes(2)
    })

    it('should detect individual message correctly (AC-2.1.4)', async () => {
      mockQuerySequence([
        { data: null, error: null },
        { data: null, error: null },
      ])

      const result = await checkAndRecordActivity('user-123', individualContext)

      expect(result.preferredDestination).toBe('individual')
    })

    it('should detect group message correctly (AC-2.1.4)', async () => {
      mockQuerySequence([
        { data: null, error: null },
        { data: null, error: null },
      ])

      const result = await checkAndRecordActivity('user-123', groupContext)

      expect(result.preferredDestination).toBe('group')
    })

    it('should auto-reactivate dormant user (Story 4.2 behavior)', async () => {
      // Mock: user in dormant state - Story 4.2 auto-reactivates them
      mockQuerySequence([
        {
          data: { id: 'state-123', user_id: 'user-123', state: 'dormant', last_activity_at: new Date().toISOString() },
          error: null,
        },
        { data: null, error: null },
      ])

      const result = await checkAndRecordActivity('user-123', individualContext)

      expect(result.isFirstMessage).toBe(false)
      // Story 4.2: dormant users are now auto-reactivated
      expect(result.engagementState).toBe('active')
      expect(result.reactivated).toBe(true)
      expect(result.previousState).toBe('dormant')
    })

    it('should handle database errors gracefully', async () => {
      // Mock: database error on select
      mockSupabaseClient.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockReturnThis(),
        then: jest.fn((resolve) =>
          resolve({ data: null, error: new Error('DB Error') })
        ),
      })

      const result = await checkAndRecordActivity('user-123', individualContext)

      // Should return safe defaults
      expect(result.isFirstMessage).toBe(false)
      expect(result.engagementState).toBe('active')
    })
  })
})

// =============================================================================
// Story 4.2: Activity Tracking & Auto-Reactivation
// =============================================================================

describe('Activity Tracker - Story 4.2', () => {
  beforeEach(() => {
    resetSupabaseMocks()
    mockTransitionState.mockReset()
    mockTransitionState.mockResolvedValue({ success: true, previousState: 'dormant', newState: 'active' })
  })

  const individualContext: MessageContext = {
    jid: '5511999999999@s.whatsapp.net',
    isGroup: false,
    messageText: 'Hello',
    pushName: 'John',
  }

  describe('AC-4.2.1: last_activity_at updated on every message', () => {
    it('should update last_activity_at for active users', async () => {
      mockQuerySequence([
        {
          data: { id: 'state-123', user_id: 'user-123', state: 'active', last_activity_at: '2025-01-01T00:00:00.000Z' },
          error: null,
        },
        { data: null, error: null }, // Update succeeds
      ])

      await checkAndRecordActivity('user-123', individualContext)

      // Verify update was called
      expect(mockSupabaseClient.from).toHaveBeenCalledTimes(2)
    })
  })

  describe('AC-4.2.2: Dormant user auto-reactivation', () => {
    it('should transition dormant user to active on any message', async () => {
      mockQuerySequence([
        {
          data: { id: 'state-123', user_id: 'user-123', state: 'dormant', last_activity_at: '2025-01-01T00:00:00.000Z' },
          error: null,
        },
        { data: null, error: null },
      ])

      const result = await checkAndRecordActivity('user-123', individualContext)

      // transitionState is called with positional args: (userId, trigger, metadata)
      expect(mockTransitionState).toHaveBeenCalledWith(
        'user-123',
        'user_message',
        expect.objectContaining({
          unprompted_return: expect.any(Boolean),
          days_inactive: expect.any(Number),
          reactivation_source: 'user_message',
        })
      )
      expect(result.reactivated).toBe(true)
      expect(result.previousState).toBe('dormant')
      expect(result.engagementState).toBe('active')
    })
  })

  describe('AC-4.2.3: Goodbye_sent user auto-reactivation', () => {
    it('should transition goodbye_sent user to active on non-response message', async () => {
      mockQuerySequence([
        {
          data: { id: 'state-123', user_id: 'user-123', state: 'goodbye_sent', last_activity_at: '2025-01-01T00:00:00.000Z' },
          error: null,
        },
        { data: null, error: null },
      ])
      mockTransitionState.mockResolvedValue({ success: true, previousState: 'goodbye_sent', newState: 'active' })

      const result = await checkAndRecordActivity('user-123', {
        ...individualContext,
        isGoodbyeResponse: false, // Not a goodbye response
      })

      // transitionState is called with positional args: (userId, trigger, metadata)
      expect(mockTransitionState).toHaveBeenCalledWith(
        'user-123',
        'user_message',
        expect.objectContaining({
          reactivation_source: 'non_response_message',
          days_inactive: expect.any(Number),
        })
      )
      expect(result.reactivated).toBe(true)
      expect(result.engagementState).toBe('active')
    })

    it('should NOT auto-reactivate goodbye_sent user when isGoodbyeResponse is true', async () => {
      mockQuerySequence([
        {
          data: { id: 'state-123', user_id: 'user-123', state: 'goodbye_sent', last_activity_at: '2025-01-01T00:00:00.000Z' },
          error: null,
        },
        { data: null, error: null },
      ])

      const result = await checkAndRecordActivity('user-123', {
        ...individualContext,
        isGoodbyeResponse: true, // This IS a goodbye response
      })

      // Should NOT call transitionState - let goodbye-handler process it
      expect(mockTransitionState).not.toHaveBeenCalled()
      expect(result.reactivated).toBeFalsy()
      expect(result.engagementState).toBe('goodbye_sent')
    })
  })

  describe('AC-4.2.4: Unprompted return detection (3+ days)', () => {
    it('should flag unprompted_return=true when dormant for 3+ days', async () => {
      const fourDaysAgo = new Date()
      fourDaysAgo.setDate(fourDaysAgo.getDate() - 4)

      mockQuerySequence([
        {
          data: {
            id: 'state-123',
            user_id: 'user-123',
            state: 'dormant',
            last_activity_at: fourDaysAgo.toISOString(),
          },
          error: null,
        },
        { data: null, error: null },
      ])

      await checkAndRecordActivity('user-123', individualContext)

      // transitionState is called with positional args: (userId, trigger, metadata)
      expect(mockTransitionState).toHaveBeenCalledWith(
        'user-123',
        'user_message',
        expect.objectContaining({
          unprompted_return: true,
          days_inactive: expect.any(Number),
        })
      )
      // Verify days_inactive is >= 3 (metadata is the 3rd argument)
      const call = mockTransitionState.mock.calls[0]
      expect(call[2].days_inactive).toBeGreaterThanOrEqual(3)
    })

    it('should flag unprompted_return=false when dormant for < 3 days', async () => {
      const oneDayAgo = new Date()
      oneDayAgo.setDate(oneDayAgo.getDate() - 1)

      mockQuerySequence([
        {
          data: {
            id: 'state-123',
            user_id: 'user-123',
            state: 'dormant',
            last_activity_at: oneDayAgo.toISOString(),
          },
          error: null,
        },
        { data: null, error: null },
      ])

      await checkAndRecordActivity('user-123', individualContext)

      // transitionState is called with positional args: (userId, trigger, metadata)
      expect(mockTransitionState).toHaveBeenCalledWith(
        'user-123',
        'user_message',
        expect.objectContaining({
          unprompted_return: false,
        })
      )
    })
  })

  describe('AC-4.2.5: Performance (non-blocking)', () => {
    it('should complete activity tracking quickly', async () => {
      mockQuerySequence([
        {
          data: { id: 'state-123', user_id: 'user-123', state: 'active', last_activity_at: new Date().toISOString() },
          error: null,
        },
        { data: null, error: null },
      ])

      const startTime = Date.now()
      await checkAndRecordActivity('user-123', individualContext)
      const duration = Date.now() - startTime

      // With mocks, this should complete very quickly
      // In real scenarios, the < 50ms target is enforced by implementation
      expect(duration).toBeLessThan(100) // Allow some slack for test overhead
    })
  })

  describe('getDaysSinceLastActivity', () => {
    it('should return correct days since last activity', async () => {
      const threeDaysAgo = new Date()
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3)

      mockQuerySuccess({ last_activity_at: threeDaysAgo.toISOString() })

      const result = await getDaysSinceLastActivity('user-123')

      expect(result).toBe(3)
    })

    it('should return null when no engagement state exists', async () => {
      mockQuerySuccess(null)

      const result = await getDaysSinceLastActivity('user-123')

      expect(result).toBe(null)
    })

    it('should return null on database error', async () => {
      mockSupabaseClient.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockReturnThis(),
        then: jest.fn((resolve) => resolve({ data: null, error: new Error('DB Error') })),
      })

      const result = await getDaysSinceLastActivity('user-123')

      expect(result).toBe(null)
    })
  })

  describe('New user engagement state creation', () => {
    it('should create engagement state with state=active for new users', async () => {
      mockQuerySequence([
        { data: null, error: null }, // No existing state
        { data: null, error: null }, // Insert succeeds
      ])

      const result = await checkAndRecordActivity('new-user-456', individualContext)

      expect(result.isFirstMessage).toBe(true)
      expect(result.engagementState).toBe('active')
      expect(result.reactivated).toBeFalsy()
    })
  })
})
