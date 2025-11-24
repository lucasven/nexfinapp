/**
 * Destination Handler Integration Tests
 *
 * Story 4.6: Message Routing Service
 *
 * Integration tests for the complete destination switching flow,
 * including text handler integration and message queue interaction.
 *
 * Tests:
 * - Full destination switch flow through text handler
 * - Queue message routing at send time
 * - Fallback behavior in realistic scenarios
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  resolveDestinationJid,
} from '../../../services/scheduler/message-sender'
import { getMessageDestination } from '../../../services/engagement/message-router'
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

const createMockUserProfile = (
  userId: string,
  destination: 'individual' | 'group',
  overrides: Partial<any> = {}
) => ({
  id: userId,
  user_id: userId,
  whatsapp_jid: '5511999999999@s.whatsapp.net',
  preferred_destination: destination,
  preferred_group_jid: destination === 'group' ? '123456789@g.us' : null,
  ...overrides,
})

// =============================================================================
// resolveDestinationJid() Integration Tests
// =============================================================================

describe('Message Queue Integration - resolveDestinationJid()', () => {
  beforeEach(() => {
    resetSupabaseMocks()
  })

  describe('Individual Destination Routing', () => {
    it('should resolve to individual JID at send time', async () => {
      const userId = 'user-123'
      const fallbackJid = '5511888888888@s.whatsapp.net'
      const mockProfile = createMockUserProfile(userId, 'individual')

      mockQuerySequence([
        { data: mockProfile, error: null },
      ])

      const result = await resolveDestinationJid(userId, fallbackJid)

      expect(result.jid).toBe('5511999999999@s.whatsapp.net')
      expect(result.destination).toBe('individual')
      expect(result.fallbackUsed).toBe(false)
    })
  })

  describe('Group Destination Routing', () => {
    it('should resolve to group JID at send time', async () => {
      const userId = 'user-123'
      const fallbackJid = '5511999999999@s.whatsapp.net'
      const mockProfile = createMockUserProfile(userId, 'group', {
        preferred_group_jid: '120363456789@g.us',
      })

      mockQuerySequence([
        { data: mockProfile, error: null },
      ])

      const result = await resolveDestinationJid(userId, fallbackJid)

      expect(result.jid).toBe('120363456789@g.us')
      expect(result.destination).toBe('group')
      expect(result.fallbackUsed).toBe(false)
    })
  })

  describe('Fallback Scenarios', () => {
    it('should use fallback when group preference but no group JID', async () => {
      const userId = 'user-123'
      const fallbackJid = '5511999999999@s.whatsapp.net'
      const mockProfile = createMockUserProfile(userId, 'group', {
        preferred_group_jid: null,
      })

      mockQuerySequence([
        { data: mockProfile, error: null },
      ])

      const result = await resolveDestinationJid(userId, fallbackJid)

      // Falls back to individual JID from profile
      expect(result.jid).toBe('5511999999999@s.whatsapp.net')
      expect(result.destination).toBe('individual')
      expect(result.fallbackUsed).toBe(true)
    })

    it('should use fallback JID when user profile not found', async () => {
      const userId = 'nonexistent-user'
      const fallbackJid = '5511888888888@s.whatsapp.net'

      mockQuerySequence([
        { data: null, error: { code: 'PGRST116', message: 'No rows found' } },
      ])

      const result = await resolveDestinationJid(userId, fallbackJid)

      expect(result.jid).toBe(fallbackJid)
      expect(result.destination).toBe('individual')
      expect(result.fallbackUsed).toBe(true)
    })

    it('should use fallback JID on database error', async () => {
      const userId = 'user-123'
      const fallbackJid = '5511888888888@s.whatsapp.net'

      mockQuerySequence([
        { data: null, error: { code: 'CONNECTION_ERROR', message: 'Connection refused' } },
      ])

      const result = await resolveDestinationJid(userId, fallbackJid)

      expect(result.jid).toBe(fallbackJid)
      expect(result.destination).toBe('individual')
      expect(result.fallbackUsed).toBe(true)
    })
  })

  describe('Send-Time Resolution', () => {
    it('should resolve to latest preference when user changes preference between queue and send', async () => {
      // Scenario: Message queued when user had individual preference,
      // but user switched to group before send
      const userId = 'user-123'
      const originalQueuedJid = '5511999999999@s.whatsapp.net' // Original individual JID

      // At send time, user has group preference
      const mockProfile = createMockUserProfile(userId, 'group', {
        preferred_group_jid: '120363456789@g.us',
      })

      mockQuerySequence([
        { data: mockProfile, error: null },
      ])

      const result = await resolveDestinationJid(userId, originalQueuedJid)

      // Should use the NEW preference (group), not the originally queued JID
      expect(result.jid).toBe('120363456789@g.us')
      expect(result.destination).toBe('group')
      expect(result.fallbackUsed).toBe(false)
    })

    it('should handle concurrent destination changes gracefully', async () => {
      const userId = 'user-123'
      const fallbackJid = '5511999999999@s.whatsapp.net'

      // First call - individual
      mockQuerySequence([
        { data: createMockUserProfile(userId, 'individual'), error: null },
      ])
      const result1 = await resolveDestinationJid(userId, fallbackJid)

      resetSupabaseMocks()

      // Second call - group (user switched)
      mockQuerySequence([
        { data: createMockUserProfile(userId, 'group', { preferred_group_jid: '120363456789@g.us' }), error: null },
      ])
      const result2 = await resolveDestinationJid(userId, fallbackJid)

      expect(result1.destination).toBe('individual')
      expect(result2.destination).toBe('group')
    })
  })
})

// =============================================================================
// End-to-End Routing Tests
// =============================================================================

describe('Message Routing End-to-End Flow', () => {
  beforeEach(() => {
    resetSupabaseMocks()
  })

  describe('Destination Switching + Message Queue Integration', () => {
    it('should route messages to new destination immediately after switch', async () => {
      const userId = 'user-123'

      // Step 1: Initial state - individual destination
      mockQuerySequence([
        { data: createMockUserProfile(userId, 'individual'), error: null },
      ])

      let routeResult = await getMessageDestination(userId)
      expect(routeResult!.destination).toBe('individual')
      expect(routeResult!.destinationJid).toBe('5511999999999@s.whatsapp.net')

      resetSupabaseMocks()

      // Step 2: After switch to group - immediately routes to group
      mockQuerySequence([
        {
          data: createMockUserProfile(userId, 'group', {
            preferred_group_jid: '120363456789@g.us',
          }),
          error: null,
        },
      ])

      routeResult = await getMessageDestination(userId)
      expect(routeResult!.destination).toBe('group')
      expect(routeResult!.destinationJid).toBe('120363456789@g.us')
    })

    it('should handle rapid destination switching', async () => {
      const userId = 'user-123'

      // Rapid switch: individual -> group -> individual
      const destinations: Array<{ dest: 'individual' | 'group'; expectedJid: string }> = [
        { dest: 'individual', expectedJid: '5511999999999@s.whatsapp.net' },
        { dest: 'group', expectedJid: '120363456789@g.us' },
        { dest: 'individual', expectedJid: '5511999999999@s.whatsapp.net' },
      ]

      for (const { dest, expectedJid } of destinations) {
        resetSupabaseMocks()
        mockQuerySequence([
          {
            data: createMockUserProfile(userId, dest, {
              preferred_group_jid: dest === 'group' ? '120363456789@g.us' : null,
            }),
            error: null,
          },
        ])

        const routeResult = await getMessageDestination(userId)
        expect(routeResult!.destination).toBe(dest)
        expect(routeResult!.destinationJid).toBe(expectedJid)
      }
    })
  })

  describe('Fallback Chain', () => {
    it('should follow fallback chain: group_jid -> individual_jid -> fallback parameter', async () => {
      const userId = 'user-123'
      const fallbackJid = 'fallback@s.whatsapp.net'

      // Case 1: Group preference with group JID -> use group JID
      resetSupabaseMocks()
      mockQuerySequence([
        {
          data: createMockUserProfile(userId, 'group', {
            preferred_group_jid: '120363456789@g.us',
          }),
          error: null,
        },
      ])

      let result = await resolveDestinationJid(userId, fallbackJid)
      expect(result.jid).toBe('120363456789@g.us')
      expect(result.fallbackUsed).toBe(false)

      // Case 2: Group preference without group JID -> fallback to individual JID from profile
      resetSupabaseMocks()
      mockQuerySequence([
        {
          data: createMockUserProfile(userId, 'group', {
            preferred_group_jid: null,
          }),
          error: null,
        },
      ])

      result = await resolveDestinationJid(userId, fallbackJid)
      expect(result.jid).toBe('5511999999999@s.whatsapp.net')
      expect(result.fallbackUsed).toBe(true)

      // Case 3: No profile found -> fallback to parameter
      resetSupabaseMocks()
      mockQuerySequence([
        { data: null, error: { code: 'PGRST116', message: 'No rows found' } },
      ])

      result = await resolveDestinationJid(userId, fallbackJid)
      expect(result.jid).toBe(fallbackJid)
      expect(result.fallbackUsed).toBe(true)
    })
  })
})
