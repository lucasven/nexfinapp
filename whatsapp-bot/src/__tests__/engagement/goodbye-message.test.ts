/**
 * Goodbye Message Tests
 *
 * Story 4.3: Self-Select Goodbye Message
 * - AC-4.3.1: Transition to goodbye_sent state queues goodbye message via message queue service
 * - AC-4.3.2: On transition, goodbye_sent_at=now() and goodbye_expires_at=now()+48h are set
 * - AC-4.3.3: Message is routed to user's preferred destination (individual or group)
 * - AC-4.3.4: Message includes all 3 options in user's locale (pt-BR or en)
 * - AC-4.3.5: Duplicate goodbye is prevented via idempotency key pattern
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { transitionState } from '../../services/engagement/state-machine'
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

// Mock the message sender
const mockQueueMessage = jest.fn()
const mockGetIdempotencyKey = jest.fn()
jest.mock('../../services/scheduler/message-sender', () => ({
  queueMessage: (params: any) => mockQueueMessage(params),
  getIdempotencyKey: (userId: string, eventType: string, date?: Date) =>
    mockGetIdempotencyKey(userId, eventType, date),
}))

// Mock the message router
const mockGetMessageDestination = jest.fn()
jest.mock('../../services/engagement/message-router', () => ({
  getMessageDestination: (userId: string) => mockGetMessageDestination(userId),
}))

describe('Goodbye Message - Story 4.3', () => {
  const userId = 'test-user-123'
  const now = new Date('2025-11-22T12:00:00.000Z')

  beforeEach(() => {
    resetSupabaseMocks()
    mockQueueMessage.mockReset()
    mockGetIdempotencyKey.mockReset()
    mockGetMessageDestination.mockReset()
    jest.useFakeTimers()
    jest.setSystemTime(now)

    // Default mocks
    mockGetIdempotencyKey.mockReturnValue(`${userId}:goodbye_sent:2025-11-22`)
    mockQueueMessage.mockResolvedValue(true)
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  describe('AC-4.3.1: Queue goodbye message on transition', () => {
    it('should queue goodbye message when transitioning active → goodbye_sent', async () => {
      // Mock: user in active state
      mockQuerySequence([
        {
          data: {
            id: 'state-123',
            user_id: userId,
            state: 'active',
            last_activity_at: '2025-11-01T00:00:00.000Z',
            updated_at: '2025-11-01T00:00:00.000Z',
          },
          error: null,
        },
        { data: { id: 'state-123', state: 'goodbye_sent' }, error: null }, // Update succeeds
        { data: { id: 'transition-123' }, error: null }, // Transition log
        { data: { preferred_language: 'pt-br' }, error: null }, // User profile
      ])

      mockGetMessageDestination.mockResolvedValue({
        destination: 'individual',
        destinationJid: '5511999999999@s.whatsapp.net',
      })

      const result = await transitionState(userId, 'inactivity_14d')

      expect(result.success).toBe(true)
      expect(result.newState).toBe('goodbye_sent')
      expect(mockQueueMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          messageType: 'goodbye',
          messageKey: 'engagement.goodbye_self_select',
        })
      )
      expect(result.sideEffects).toContain('queued_goodbye_message')
    })

    it('should include side effect "queued_goodbye_message" in result', async () => {
      mockQuerySequence([
        {
          data: {
            id: 'state-123',
            user_id: userId,
            state: 'active',
            last_activity_at: '2025-11-01T00:00:00.000Z',
            updated_at: '2025-11-01T00:00:00.000Z',
          },
          error: null,
        },
        { data: { id: 'state-123', state: 'goodbye_sent' }, error: null },
        { data: { id: 'transition-123' }, error: null },
        { data: { preferred_language: 'en' }, error: null },
      ])

      mockGetMessageDestination.mockResolvedValue({
        destination: 'individual',
        destinationJid: '5511999999999@s.whatsapp.net',
      })

      const result = await transitionState(userId, 'inactivity_14d')

      expect(result.sideEffects).toContain('goodbye_timer_started')
      expect(result.sideEffects).toContain('queued_goodbye_message')
    })
  })

  describe('AC-4.3.2: Timestamp validation', () => {
    it('should set goodbye_sent_at and goodbye_expires_at correctly (48h diff)', async () => {
      let capturedUpdateData: any = null

      // Capture the update data by checking what's passed to update()
      mockSupabaseClient.from.mockImplementation((table: string) => {
        const chainMock: any = {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          lt: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockReturnThis(),
          single: jest.fn().mockReturnThis(),
          insert: jest.fn().mockReturnThis(),
          update: jest.fn((data: any) => {
            capturedUpdateData = data
            return chainMock
          }),
          upsert: jest.fn().mockReturnThis(),
          then: jest.fn((resolve) => {
            // Return different data based on table
            if (table === 'user_engagement_states') {
              if (capturedUpdateData) {
                // This is the update call
                return resolve({
                  data: { id: 'state-123', state: 'goodbye_sent' },
                  error: null,
                })
              }
              // This is the select call
              return resolve({
                data: {
                  id: 'state-123',
                  user_id: userId,
                  state: 'active',
                  last_activity_at: '2025-11-01T00:00:00.000Z',
                  updated_at: '2025-11-01T00:00:00.000Z',
                },
                error: null,
              })
            }
            if (table === 'engagement_state_transitions') {
              return resolve({ data: { id: 'transition-123' }, error: null })
            }
            if (table === 'user_profiles') {
              return resolve({ data: { preferred_language: 'pt-br' }, error: null })
            }
            return resolve({ data: null, error: null })
          }),
        }
        return chainMock
      })

      mockGetMessageDestination.mockResolvedValue({
        destination: 'individual',
        destinationJid: '5511999999999@s.whatsapp.net',
      })

      await transitionState(userId, 'inactivity_14d')

      // Verify timestamps were set
      expect(capturedUpdateData).not.toBeNull()
      expect(capturedUpdateData.goodbye_sent_at).toBe('2025-11-22T12:00:00.000Z')
      expect(capturedUpdateData.goodbye_expires_at).toBe('2025-11-24T12:00:00.000Z') // 48h later
    })

    it('should calculate 48h expiry accurately', async () => {
      const expectedExpiresAt = new Date(now.getTime() + 48 * 60 * 60 * 1000)

      let capturedUpdateData: any = null

      mockSupabaseClient.from.mockImplementation((table: string) => {
        const chainMock: any = {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          lt: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockReturnThis(),
          single: jest.fn().mockReturnThis(),
          insert: jest.fn().mockReturnThis(),
          update: jest.fn((data: any) => {
            capturedUpdateData = data
            return chainMock
          }),
          upsert: jest.fn().mockReturnThis(),
          then: jest.fn((resolve) => {
            if (table === 'user_engagement_states') {
              if (capturedUpdateData) {
                return resolve({ data: { id: 'state-123' }, error: null })
              }
              return resolve({
                data: {
                  id: 'state-123',
                  user_id: userId,
                  state: 'active',
                  last_activity_at: '2025-11-01T00:00:00.000Z',
                  updated_at: '2025-11-01T00:00:00.000Z',
                },
                error: null,
              })
            }
            if (table === 'engagement_state_transitions') {
              return resolve({ data: { id: 'transition-123' }, error: null })
            }
            if (table === 'user_profiles') {
              return resolve({ data: { preferred_language: 'pt-br' }, error: null })
            }
            return resolve({ data: null, error: null })
          }),
        }
        return chainMock
      })

      mockGetMessageDestination.mockResolvedValue({
        destination: 'individual',
        destinationJid: '5511999999999@s.whatsapp.net',
      })

      await transitionState(userId, 'inactivity_14d')

      expect(capturedUpdateData.goodbye_expires_at).toBe(expectedExpiresAt.toISOString())
    })
  })

  describe('AC-4.3.3: Message routing', () => {
    it('should route message to individual destination', async () => {
      mockQuerySequence([
        {
          data: {
            id: 'state-123',
            user_id: userId,
            state: 'active',
            last_activity_at: '2025-11-01T00:00:00.000Z',
            updated_at: '2025-11-01T00:00:00.000Z',
          },
          error: null,
        },
        { data: { id: 'state-123', state: 'goodbye_sent' }, error: null },
        { data: { id: 'transition-123' }, error: null },
        { data: { preferred_language: 'pt-br' }, error: null },
      ])

      mockGetMessageDestination.mockResolvedValue({
        destination: 'individual',
        destinationJid: '5511999999999@s.whatsapp.net',
      })

      await transitionState(userId, 'inactivity_14d')

      expect(mockQueueMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          destination: 'individual',
          destinationJid: '5511999999999@s.whatsapp.net',
        })
      )
    })

    it('should route message to group destination with correct JID', async () => {
      mockQuerySequence([
        {
          data: {
            id: 'state-123',
            user_id: userId,
            state: 'active',
            last_activity_at: '2025-11-01T00:00:00.000Z',
            updated_at: '2025-11-01T00:00:00.000Z',
          },
          error: null,
        },
        { data: { id: 'state-123', state: 'goodbye_sent' }, error: null },
        { data: { id: 'transition-123' }, error: null },
        { data: { preferred_language: 'en' }, error: null },
      ])

      mockGetMessageDestination.mockResolvedValue({
        destination: 'group',
        destinationJid: '120363123456789@g.us',
      })

      await transitionState(userId, 'inactivity_14d')

      expect(mockQueueMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          destination: 'group',
          destinationJid: '120363123456789@g.us',
        })
      )
    })

    it('should not queue message if destination not found', async () => {
      mockQuerySequence([
        {
          data: {
            id: 'state-123',
            user_id: userId,
            state: 'active',
            last_activity_at: '2025-11-01T00:00:00.000Z',
            updated_at: '2025-11-01T00:00:00.000Z',
          },
          error: null,
        },
        { data: { id: 'state-123', state: 'goodbye_sent' }, error: null },
        { data: { id: 'transition-123' }, error: null },
      ])

      mockGetMessageDestination.mockResolvedValue(null)

      const result = await transitionState(userId, 'inactivity_14d')

      expect(result.success).toBe(true) // State transition still succeeds
      expect(mockQueueMessage).not.toHaveBeenCalled()
      expect(result.sideEffects).not.toContain('queued_goodbye_message')
    })
  })

  describe('AC-4.3.4: Localization', () => {
    it('should use correct localization key (engagement.goodbye_self_select)', async () => {
      mockQuerySequence([
        {
          data: {
            id: 'state-123',
            user_id: userId,
            state: 'active',
            last_activity_at: '2025-11-01T00:00:00.000Z',
            updated_at: '2025-11-01T00:00:00.000Z',
          },
          error: null,
        },
        { data: { id: 'state-123', state: 'goodbye_sent' }, error: null },
        { data: { id: 'transition-123' }, error: null },
        { data: { preferred_language: 'pt-br' }, error: null },
      ])

      mockGetMessageDestination.mockResolvedValue({
        destination: 'individual',
        destinationJid: '5511999999999@s.whatsapp.net',
      })

      await transitionState(userId, 'inactivity_14d')

      expect(mockQueueMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          messageKey: 'engagement.goodbye_self_select',
        })
      )
    })

    it('should pass pt-BR locale for Portuguese user', async () => {
      mockQuerySequence([
        {
          data: {
            id: 'state-123',
            user_id: userId,
            state: 'active',
            last_activity_at: '2025-11-01T00:00:00.000Z',
            updated_at: '2025-11-01T00:00:00.000Z',
          },
          error: null,
        },
        { data: { id: 'state-123', state: 'goodbye_sent' }, error: null },
        { data: { id: 'transition-123' }, error: null },
        { data: { preferred_language: 'pt-br' }, error: null },
      ])

      mockGetMessageDestination.mockResolvedValue({
        destination: 'individual',
        destinationJid: '5511999999999@s.whatsapp.net',
      })

      await transitionState(userId, 'inactivity_14d')

      expect(mockQueueMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          messageParams: { locale: 'pt-br' },
        })
      )
    })

    it('should pass en locale for English user', async () => {
      mockQuerySequence([
        {
          data: {
            id: 'state-123',
            user_id: userId,
            state: 'active',
            last_activity_at: '2025-11-01T00:00:00.000Z',
            updated_at: '2025-11-01T00:00:00.000Z',
          },
          error: null,
        },
        { data: { id: 'state-123', state: 'goodbye_sent' }, error: null },
        { data: { id: 'transition-123' }, error: null },
        { data: { preferred_language: 'en' }, error: null },
      ])

      mockGetMessageDestination.mockResolvedValue({
        destination: 'individual',
        destinationJid: '5511999999999@s.whatsapp.net',
      })

      await transitionState(userId, 'inactivity_14d')

      expect(mockQueueMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          messageParams: { locale: 'en' },
        })
      )
    })

    it('should default to pt-br locale if preference not set', async () => {
      mockQuerySequence([
        {
          data: {
            id: 'state-123',
            user_id: userId,
            state: 'active',
            last_activity_at: '2025-11-01T00:00:00.000Z',
            updated_at: '2025-11-01T00:00:00.000Z',
          },
          error: null,
        },
        { data: { id: 'state-123', state: 'goodbye_sent' }, error: null },
        { data: { id: 'transition-123' }, error: null },
        { data: { preferred_language: null }, error: null },
      ])

      mockGetMessageDestination.mockResolvedValue({
        destination: 'individual',
        destinationJid: '5511999999999@s.whatsapp.net',
      })

      await transitionState(userId, 'inactivity_14d')

      expect(mockQueueMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          messageParams: { locale: 'pt-br' },
        })
      )
    })
  })

  describe('AC-4.3.5: Idempotency', () => {
    it('should use idempotency key with format {userId}:goodbye_sent:{date}', async () => {
      mockQuerySequence([
        {
          data: {
            id: 'state-123',
            user_id: userId,
            state: 'active',
            last_activity_at: '2025-11-01T00:00:00.000Z',
            updated_at: '2025-11-01T00:00:00.000Z',
          },
          error: null,
        },
        { data: { id: 'state-123', state: 'goodbye_sent' }, error: null },
        { data: { id: 'transition-123' }, error: null },
        { data: { preferred_language: 'pt-br' }, error: null },
      ])

      mockGetMessageDestination.mockResolvedValue({
        destination: 'individual',
        destinationJid: '5511999999999@s.whatsapp.net',
      })

      await transitionState(userId, 'inactivity_14d')

      // getIdempotencyKey is called with optional third parameter (date)
      expect(mockGetIdempotencyKey).toHaveBeenCalledWith(userId, 'goodbye_sent', undefined)
    })

    it('should not add queued_goodbye_message side effect if queueMessage returns false (duplicate)', async () => {
      mockQuerySequence([
        {
          data: {
            id: 'state-123',
            user_id: userId,
            state: 'active',
            last_activity_at: '2025-11-01T00:00:00.000Z',
            updated_at: '2025-11-01T00:00:00.000Z',
          },
          error: null,
        },
        { data: { id: 'state-123', state: 'goodbye_sent' }, error: null },
        { data: { id: 'transition-123' }, error: null },
        { data: { preferred_language: 'pt-br' }, error: null },
      ])

      mockGetMessageDestination.mockResolvedValue({
        destination: 'individual',
        destinationJid: '5511999999999@s.whatsapp.net',
      })

      // Simulate duplicate detection - queueMessage returns false
      mockQueueMessage.mockResolvedValue(false)

      const result = await transitionState(userId, 'inactivity_14d')

      expect(result.success).toBe(true) // State transition still succeeds
      expect(result.sideEffects).not.toContain('queued_goodbye_message')
    })
  })

  describe('Edge cases', () => {
    it('should not queue goodbye message for non-active → goodbye_sent transitions', async () => {
      // This shouldn't happen per state machine rules, but test defensive behavior
      mockQuerySequence([
        {
          data: {
            id: 'state-123',
            user_id: userId,
            state: 'dormant', // Not active
            last_activity_at: '2025-11-01T00:00:00.000Z',
            updated_at: '2025-11-01T00:00:00.000Z',
          },
          error: null,
        },
      ])

      // inactivity_14d from dormant is invalid - should fail validation
      const result = await transitionState(userId, 'inactivity_14d')

      expect(result.success).toBe(false)
      expect(mockQueueMessage).not.toHaveBeenCalled()
    })

    it('should handle message router error gracefully', async () => {
      mockQuerySequence([
        {
          data: {
            id: 'state-123',
            user_id: userId,
            state: 'active',
            last_activity_at: '2025-11-01T00:00:00.000Z',
            updated_at: '2025-11-01T00:00:00.000Z',
          },
          error: null,
        },
        { data: { id: 'state-123', state: 'goodbye_sent' }, error: null },
        { data: { id: 'transition-123' }, error: null },
      ])

      mockGetMessageDestination.mockRejectedValue(new Error('Router error'))

      const result = await transitionState(userId, 'inactivity_14d')

      // State transition should still succeed even if message queuing fails
      expect(result.success).toBe(true)
      expect(result.newState).toBe('goodbye_sent')
    })
  })
})
