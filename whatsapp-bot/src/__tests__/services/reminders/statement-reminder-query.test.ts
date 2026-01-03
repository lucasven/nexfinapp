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
import { getSupabaseClient } from '../../../services/database/supabase-client.js'

// Mock Supabase client
jest.mock('../../../services/database/supabase-client.js', () => ({
  getSupabaseClient: jest.fn()
}))

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
  let mockSupabase: any
  let mockQueryBuilder: any

  beforeEach(() => {
    // Create a chainable query builder mock
    // The chain is: from().select().eq().not().eq()
    // The last .eq() should return a promise with { data, error }
    mockQueryBuilder = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      not: jest.fn().mockReturnThis(),
      or: jest.fn().mockReturnThis()
    }

    mockSupabase = {
      from: jest.fn().mockReturnValue(mockQueryBuilder)
    }

    ;(getSupabaseClient as any).mockReturnValue(mockSupabase)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('getEligibleUsersForStatementReminders', () => {
    it('should return eligible users with closing day in 3 days', async () => {
      // Mock current date to be 3 days before closing
      const mockDate = new Date('2025-01-02T10:00:00Z')
      jest.useFakeTimers()
      jest.setSystemTime(mockDate)

      const mockData = [
        {
          id: 'pm-1',
          name: 'Nubank Roxinho',
          statement_closing_day: 5, // Jan 5 (3 days from Jan 2)
          monthly_budget: 2000,
          credit_mode: true,
          user_id: 'user-1',
          users: {
            id: 'user-1',
            whatsapp_jid: 'jid123',
            whatsapp_lid: null,
            whatsapp_number: '5511999999999'
          },
          user_profiles: {
            locale: 'pt-BR',
            statement_reminders_enabled: true
          }
        }
      ]

      // Set up the query chain: select().eq().not().eq()
      // The last .eq() is the one that returns the promise
      mockQueryBuilder.eq
        .mockReturnValueOnce(mockQueryBuilder) // First .eq('credit_mode', true)
        .mockResolvedValueOnce({ data: mockData, error: null }) // Second .eq('statement_closing_day', targetDay)

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

      jest.useRealTimers()
    })

    it('should filter out users with closing day not in 3 days', async () => {
      const mockDate = new Date('2025-01-02T10:00:00Z')
      jest.useFakeTimers()
      jest.setSystemTime(mockDate)

      const mockData = [
        {
          id: 'pm-1',
          name: 'Card 1',
          statement_closing_day: 15, // Jan 15 (not 3 days from Jan 2)
          monthly_budget: 2000,
          credit_mode: true,
          user_id: 'user-1',
          users: {
            id: 'user-1',
            whatsapp_jid: 'jid123',
            whatsapp_lid: null,
            whatsapp_number: '5511999999999'
          },
          user_profiles: {
            locale: 'pt-BR',
            statement_reminders_enabled: true
          }
        }
      ]

      // Query will filter by closing_day = 5 (3 days from today), so this won't be returned
      mockQueryBuilder.eq
        .mockReturnValueOnce(mockQueryBuilder) // First .eq('credit_mode', true)
        .mockResolvedValueOnce({ data: [], error: null }) // Second .eq('statement_closing_day', targetDay)

      const result = await getEligibleUsersForStatementReminders()

      expect(result).toHaveLength(0)

      jest.useRealTimers()
    })

    it('should handle month boundary correctly (Dec 29 → Jan 1)', async () => {
      const mockDate = new Date('2024-12-29T10:00:00Z')
      jest.useFakeTimers()
      jest.setSystemTime(mockDate)

      const mockData = [
        {
          id: 'pm-1',
          name: 'Card 1',
          statement_closing_day: 1, // Jan 1 (3 days from Dec 29)
          monthly_budget: 2000,
          credit_mode: true,
          user_id: 'user-1',
          users: {
            id: 'user-1',
            whatsapp_jid: 'jid123',
            whatsapp_lid: null,
            whatsapp_number: '5511999999999'
          },
          user_profiles: {
            locale: 'pt-BR',
            statement_reminders_enabled: true
          }
        }
      ]

      mockQueryBuilder.eq
        .mockReturnValueOnce(mockQueryBuilder) // First .eq('credit_mode', true)
        .mockResolvedValueOnce({ data: mockData, error: null }) // Second .eq('statement_closing_day', targetDay)

      const result = await getEligibleUsersForStatementReminders()

      expect(result).toHaveLength(1)
      expect(result[0].statement_closing_day).toBe(1)

      jest.useRealTimers()
    })

    it('should filter out users without WhatsApp identifier', async () => {
      const mockData = [
        {
          id: 'pm-1',
          name: 'Card 1',
          statement_closing_day: 5,
          monthly_budget: 2000,
          credit_mode: true,
          user_id: 'user-1',
          users: {
            id: 'user-1',
            whatsapp_jid: null,
            whatsapp_lid: null,
            whatsapp_number: null // No WhatsApp identifier
          },
          user_profiles: {
            locale: 'pt-BR',
            statement_reminders_enabled: true
          }
        }
      ]

      mockQueryBuilder.eq
        .mockReturnValueOnce(mockQueryBuilder) // First .eq('credit_mode', true)
        .mockResolvedValueOnce({ data: mockData, error: null }) // Second .eq('statement_closing_day', targetDay)

      const result = await getEligibleUsersForStatementReminders()

      expect(result).toHaveLength(0)
    })

    it('should filter out users who opted out of reminders', async () => {
      const mockData = [
        {
          id: 'pm-1',
          name: 'Card 1',
          statement_closing_day: 5,
          monthly_budget: 2000,
          credit_mode: true,
          user_id: 'user-1',
          users: {
            id: 'user-1',
            whatsapp_jid: 'jid123',
            whatsapp_lid: null,
            whatsapp_number: '5511999999999'
          },
          user_profiles: {
            locale: 'pt-BR',
            statement_reminders_enabled: false // Opted out
          }
        }
      ]

      mockQueryBuilder.eq
        .mockReturnValueOnce(mockQueryBuilder) // First .eq('credit_mode', true)
        .mockResolvedValueOnce({ data: mockData, error: null }) // Second .eq('statement_closing_day', targetDay)

      const result = await getEligibleUsersForStatementReminders()

      expect(result).toHaveLength(0)
    })

    it('should return empty array when no eligible users', async () => {
      mockQueryBuilder.eq
        .mockReturnValueOnce(mockQueryBuilder) // First .eq('credit_mode', true)
        .mockResolvedValueOnce({ data: [], error: null }) // Second .eq('statement_closing_day', targetDay)

      const result = await getEligibleUsersForStatementReminders()

      expect(result).toEqual([])
    })

    it('should throw error on database error', async () => {
      const mockError = new Error('Database connection failed')
      mockQueryBuilder.eq
        .mockReturnValueOnce(mockQueryBuilder) // First .eq('credit_mode', true)
        .mockResolvedValueOnce({ data: null, error: mockError }) // Second .eq('statement_closing_day', targetDay)

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
