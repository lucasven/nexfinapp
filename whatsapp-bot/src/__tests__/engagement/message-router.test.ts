/**
 * Message Router Tests
 *
 * Story 2.4: Preferred Destination Auto-Detection
 *
 * Tests:
 * - AC-2.4.1: Individual chat sets preferred_destination = 'individual'
 * - AC-2.4.2: Group chat sets preferred_destination = 'group' with JID
 * - AC-2.4.3: Existing preference not auto-changed
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  setPreferredDestination,
  autoDetectDestination,
  getMessageDestination,
} from '../../services/engagement/message-router'
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

describe('Message Router - Story 2.4', () => {
  beforeEach(() => {
    resetSupabaseMocks()
  })

  describe('setPreferredDestination', () => {
    it('should set individual destination (AC-2.4.1)', async () => {
      mockQuerySuccess(null) // Update succeeds

      const result = await setPreferredDestination(
        'user-123',
        'individual',
        '5511999999999@s.whatsapp.net'
      )

      expect(result).toBe(true)
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('user_profiles')
    })

    it('should set group destination with JID (AC-2.4.2)', async () => {
      mockQuerySuccess(null) // Update succeeds

      const result = await setPreferredDestination(
        'user-123',
        'group',
        '120363123456789@g.us'
      )

      expect(result).toBe(true)
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('user_profiles')
    })

    it('should return false on database error', async () => {
      mockSupabaseClient.from.mockReturnValue({
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        then: jest.fn((resolve) =>
          resolve({ data: null, error: new Error('DB Error') })
        ),
      })

      const result = await setPreferredDestination(
        'user-123',
        'individual',
        '5511999999999@s.whatsapp.net'
      )

      expect(result).toBe(false)
    })
  })

  describe('autoDetectDestination', () => {
    it('should auto-detect individual destination for first message (AC-2.4.1)', async () => {
      // Mock: no existing preference, then update succeeds
      mockQuerySequence([
        { data: { preferred_destination: null }, error: null }, // Select shows no preference
        { data: null, error: null }, // Update succeeds
      ])

      const result = await autoDetectDestination(
        'user-123',
        'individual',
        '5511999999999@s.whatsapp.net'
      )

      expect(result).toBe(true)
    })

    it('should auto-detect group destination with JID (AC-2.4.2)', async () => {
      mockQuerySequence([
        { data: { preferred_destination: null }, error: null },
        { data: null, error: null },
      ])

      const result = await autoDetectDestination(
        'user-123',
        'group',
        '120363123456789@g.us'
      )

      expect(result).toBe(true)
    })

    it('should NOT change existing preference (AC-2.4.3)', async () => {
      // Mock: user already has preferred_destination set
      mockQuerySuccess({ preferred_destination: 'individual' })

      const result = await autoDetectDestination(
        'user-123',
        'group', // New message from group
        '120363123456789@g.us'
      )

      // Should return false - preference NOT auto-changed
      expect(result).toBe(false)
      // Should only have called once (select), not twice (select + update)
      expect(mockSupabaseClient.from).toHaveBeenCalledTimes(1)
    })

    it('should return false on database error', async () => {
      mockSupabaseClient.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockReturnThis(),
        then: jest.fn((resolve) =>
          resolve({ data: null, error: new Error('DB Error') })
        ),
      })

      const result = await autoDetectDestination(
        'user-123',
        'individual',
        '5511999999999@s.whatsapp.net'
      )

      expect(result).toBe(false)
    })
  })

  describe('getMessageDestination', () => {
    it('should return individual destination', async () => {
      mockQuerySuccess({
        preferred_destination: 'individual',
        preferred_group_jid: null,
        whatsapp_jid: '5511999999999@s.whatsapp.net',
      })

      const result = await getMessageDestination('user-123')

      expect(result).toEqual({
        destination: 'individual',
        destinationJid: '5511999999999@s.whatsapp.net',
        fallbackUsed: false,
      })
    })

    it('should return group destination with group JID', async () => {
      mockQuerySuccess({
        preferred_destination: 'group',
        preferred_group_jid: '120363123456789@g.us',
        whatsapp_jid: '5511999999999@s.whatsapp.net',
      })

      const result = await getMessageDestination('user-123')

      expect(result).toEqual({
        destination: 'group',
        destinationJid: '120363123456789@g.us',
        fallbackUsed: false,
      })
    })

    it('should return null if user not found', async () => {
      mockQuerySuccess(null)

      const result = await getMessageDestination('user-123')

      expect(result).toBeNull()
    })
  })
})
