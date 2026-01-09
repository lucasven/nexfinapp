/**
 * Tests for Statement Reminder Eligibility Query
 *
 * AC4.1: Reminder Timing and Eligibility
 * - Closing day 5, today 2 → Eligible
 * - Closing day 15, today 2 → Not eligible
 * - Month boundary (Dec 29 → Jan 1) → Eligible
 * - Opted out → Not eligible
 */

import { getEligibleUsersForStatementReminders, getUserJid } from '../../../services/reminders/statement-reminder-query.js'
import { mockQuerySequence, resetSupabaseMocks } from '../../../__mocks__/supabase.js'

// Mock Supabase client using centralized mock
jest.mock('../../../services/database/supabase-client.js', () => require('../../../__mocks__/supabase.js'))

// Mock logger
jest.mock('../../../services/monitoring/logger.js', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn()
  }
}))

describe('Statement Reminder Query', () => {
  beforeEach(() => {
    resetSupabaseMocks()
  })

  afterEach(() => {
    jest.clearAllMocks()
    jest.useRealTimers()
  })

  describe('getEligibleUsersForStatementReminders', () => {
    it('should return eligible users with closing day in 3 days', async () => {
      // Mock current date to be 3 days before closing
      const mockDate = new Date('2025-01-02T10:00:00Z')
      jest.useFakeTimers()
      jest.setSystemTime(mockDate)

      // Mock the 3 sequential queries:
      // 1. payment_methods query
      // 2. authorized_whatsapp_numbers query (uses .in())
      // 3. user_profiles query (uses .in())
      mockQuerySequence([
        {
          data: [{
            id: 'pm-1',
            name: 'Nubank Roxinho',
            statement_closing_day: 5,
            monthly_budget: 2000,
            credit_mode: true,
            user_id: 'user-1'
          }],
          error: null
        },
        {
          data: [{
            user_id: 'user-1',
            whatsapp_jid: 'jid123',
            whatsapp_lid: null,
            whatsapp_number: '5511999999999',
            is_primary: true
          }],
          error: null
        },
        {
          data: [{
            user_id: 'user-1',
            locale: 'pt-BR',
            statement_reminders_enabled: true
          }],
          error: null
        }
      ])

      const result = await getEligibleUsersForStatementReminders()

      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({
        user_id: 'user-1',
        payment_method_id: 'pm-1',
        payment_method_name: 'Nubank Roxinho',
        statement_closing_day: 5,
        monthly_budget: 2000,
        locale: 'pt-BR'
      })
    })

    it('should filter out users with closing day not in 3 days', async () => {
      const mockDate = new Date('2025-01-02T10:00:00Z')
      jest.useFakeTimers()
      jest.setSystemTime(mockDate)

      // Query will filter by closing_day = 5 (3 days from today)
      // Return empty since no cards have closing_day = 5
      mockQuerySequence([
        { data: [], error: null } // No payment methods match
      ])

      const result = await getEligibleUsersForStatementReminders()

      expect(result).toHaveLength(0)
    })

    it('should handle month boundary correctly (Dec 29 → Jan 1)', async () => {
      const mockDate = new Date('2024-12-29T10:00:00Z')
      jest.useFakeTimers()
      jest.setSystemTime(mockDate)

      // Dec 29 + 3 days = Jan 1
      mockQuerySequence([
        {
          data: [{
            id: 'pm-1',
            name: 'Card 1',
            statement_closing_day: 1,
            monthly_budget: 2000,
            credit_mode: true,
            user_id: 'user-1'
          }],
          error: null
        },
        {
          data: [{
            user_id: 'user-1',
            whatsapp_jid: 'jid123',
            whatsapp_lid: null,
            whatsapp_number: '5511999999999',
            is_primary: true
          }],
          error: null
        },
        {
          data: [{
            user_id: 'user-1',
            locale: 'pt-BR',
            statement_reminders_enabled: true
          }],
          error: null
        }
      ])

      const result = await getEligibleUsersForStatementReminders()

      expect(result).toHaveLength(1)
      expect(result[0].statement_closing_day).toBe(1)
    })

    it('should filter out users without WhatsApp identifier', async () => {
      jest.useFakeTimers()
      jest.setSystemTime(new Date('2025-01-02T10:00:00Z'))

      mockQuerySequence([
        {
          data: [{
            id: 'pm-1',
            name: 'Card 1',
            statement_closing_day: 5,
            monthly_budget: 2000,
            credit_mode: true,
            user_id: 'user-1'
          }],
          error: null
        },
        {
          data: [{
            user_id: 'user-1',
            whatsapp_jid: null,
            whatsapp_lid: null,
            whatsapp_number: null, // No WhatsApp identifier
            is_primary: true
          }],
          error: null
        },
        {
          data: [{
            user_id: 'user-1',
            locale: 'pt-BR',
            statement_reminders_enabled: true
          }],
          error: null
        }
      ])

      const result = await getEligibleUsersForStatementReminders()

      expect(result).toHaveLength(0)
    })

    it('should filter out users who opted out of reminders', async () => {
      jest.useFakeTimers()
      jest.setSystemTime(new Date('2025-01-02T10:00:00Z'))

      mockQuerySequence([
        {
          data: [{
            id: 'pm-1',
            name: 'Card 1',
            statement_closing_day: 5,
            monthly_budget: 2000,
            credit_mode: true,
            user_id: 'user-1'
          }],
          error: null
        },
        {
          data: [{
            user_id: 'user-1',
            whatsapp_jid: 'jid123',
            whatsapp_lid: null,
            whatsapp_number: '5511999999999',
            is_primary: true
          }],
          error: null
        },
        {
          data: [{
            user_id: 'user-1',
            locale: 'pt-BR',
            statement_reminders_enabled: false // Opted out
          }],
          error: null
        }
      ])

      const result = await getEligibleUsersForStatementReminders()

      expect(result).toHaveLength(0)
    })

    it('should return empty array when no eligible users', async () => {
      mockQuerySequence([
        { data: [], error: null } // No payment methods match
      ])

      const result = await getEligibleUsersForStatementReminders()

      expect(result).toEqual([])
    })

    it('should throw error on database error', async () => {
      const mockError = new Error('Database connection failed')
      mockQuerySequence([
        { data: null, error: mockError }
      ])

      await expect(getEligibleUsersForStatementReminders()).rejects.toThrow('Database connection failed')
    })
  })

  describe('getUserJid', () => {
    it('should prefer whatsapp_jid over lid and phone', () => {
      const user = {
        whatsapp_jid: 'jid123',
        whatsapp_lid: 'lid456',
        whatsapp_number: '5511999999999'
      }

      const result = getUserJid(user)

      expect(result).toBe('jid123')
    })

    it('should use whatsapp_lid if jid is null', () => {
      const user = {
        whatsapp_jid: null,
        whatsapp_lid: 'lid456',
        whatsapp_number: '5511999999999'
      }

      const result = getUserJid(user)

      expect(result).toBe('lid456')
    })

    it('should format phone number to JID if jid and lid are null', () => {
      const user = {
        whatsapp_jid: null,
        whatsapp_lid: null,
        whatsapp_number: '5511999999999'
      }

      const result = getUserJid(user)

      expect(result).toBe('5511999999999@s.whatsapp.net')
    })

    it('should return null if all identifiers are null', () => {
      const user = {
        whatsapp_jid: null,
        whatsapp_lid: null,
        whatsapp_number: null
      }

      const result = getUserJid(user)

      expect(result).toBeNull()
    })
  })
})
