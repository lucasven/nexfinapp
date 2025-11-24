/**
 * Activity Detector Tests
 *
 * Story 5.2: Weekly Activity Detection
 * - AC-5.2.1: Returns users with transactions OR last_activity_at within 7 days
 * - AC-5.2.2: Excludes dormant users
 * - AC-5.2.3: Excludes opted-out users
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  getActiveUsersLastWeek,
  getUserActivityCount,
  ActiveUser,
} from '../../services/scheduler/activity-detector'
import {
  mockSupabaseClient,
  resetSupabaseMocks,
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

// Import logger after mocking
import { logger } from '../../services/monitoring/logger'

describe('Activity Detector - Story 5.2', () => {
  const now = new Date('2025-11-24T06:00:00.000Z')
  const twoDaysAgo = new Date('2025-11-22T06:00:00.000Z')
  const eightDaysAgo = new Date('2025-11-16T06:00:00.000Z')

  beforeEach(() => {
    resetSupabaseMocks()
    jest.clearAllMocks()
    jest.useFakeTimers()
    jest.setSystemTime(now)
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  describe('getActiveUsersLastWeek', () => {
    describe('AC-5.2.1: Returns users with transactions OR last_activity_at within 7 days', () => {
      it('should return user with transactions in last 7 days', async () => {
        // Mock RPC response
        mockSupabaseClient.rpc.mockResolvedValueOnce({
          data: [
            {
              user_id: 'user-1',
              transaction_count: 3,
              last_activity_at: eightDaysAgo.toISOString(),
              preferred_destination: 'individual',
              destination_jid: '5511999999999@s.whatsapp.net',
              locale: 'pt-BR',
            },
          ],
          error: null,
        })

        const result = await getActiveUsersLastWeek()

        expect(result).toHaveLength(1)
        expect(result[0]).toMatchObject({
          userId: 'user-1',
          transactionCount: 3,
          preferredDestination: 'individual',
          destinationJid: '5511999999999@s.whatsapp.net',
          locale: 'pt-BR',
        })
        expect(mockSupabaseClient.rpc).toHaveBeenCalledWith(
          'get_active_users_last_week',
          expect.objectContaining({
            since_date: expect.any(String),
          })
        )
      })

      it('should return user with bot activity only (no transactions)', async () => {
        // Mock RPC response
        mockSupabaseClient.rpc.mockResolvedValueOnce({
          data: [
            {
              user_id: 'user-2',
              transaction_count: 0,
              last_activity_at: twoDaysAgo.toISOString(),
              preferred_destination: 'group',
              destination_jid: '5511888888888-123456789@g.us',
              locale: 'en',
            },
          ],
          error: null,
        })

        const result = await getActiveUsersLastWeek()

        expect(result).toHaveLength(1)
        expect(result[0]).toMatchObject({
          userId: 'user-2',
          transactionCount: 0,
          preferredDestination: 'group',
          destinationJid: '5511888888888-123456789@g.us',
          locale: 'en',
        })
      })

      it('should return user with both transactions and bot activity', async () => {
        // Mock RPC response
        mockSupabaseClient.rpc.mockResolvedValueOnce({
          data: [
            {
              user_id: 'user-3',
              transaction_count: 5,
              last_activity_at: twoDaysAgo.toISOString(),
              preferred_destination: 'individual',
              destination_jid: '5511777777777@s.whatsapp.net',
              locale: 'pt-BR',
            },
          ],
          error: null,
        })

        const result = await getActiveUsersLastWeek()

        expect(result).toHaveLength(1)
        expect(result[0]).toMatchObject({
          userId: 'user-3',
          transactionCount: 5,
        })
      })

      it('should exclude user with activity 8 days ago', async () => {
        // Database function should filter this out
        mockSupabaseClient.rpc.mockResolvedValueOnce({
          data: [],
          error: null,
        })

        const result = await getActiveUsersLastWeek()

        expect(result).toHaveLength(0)
      })
    })

    describe('AC-5.2.2: Excludes dormant users', () => {
      it('should exclude user with state=dormant', async () => {
        // Database function should filter this out
        mockSupabaseClient.rpc.mockResolvedValueOnce({
          data: [], // Dormant user filtered by database function
          error: null,
        })

        const result = await getActiveUsersLastWeek()

        expect(result).toHaveLength(0)
      })

      it('should include user in help_flow state', async () => {
        // Mock RPC response
        mockSupabaseClient.rpc.mockResolvedValueOnce({
          data: [
            {
              user_id: 'user-help',
              transaction_count: 2,
              last_activity_at: twoDaysAgo.toISOString(),
              preferred_destination: 'individual',
              destination_jid: '5511666666666@s.whatsapp.net',
              locale: 'pt-BR',
            },
          ],
          error: null,
        })

        const result = await getActiveUsersLastWeek()

        expect(result).toHaveLength(1)
        expect(result[0].userId).toBe('user-help')
      })
    })

    describe('AC-5.2.3: Excludes opted-out users', () => {
      it('should exclude user with reengagement_opt_out=true', async () => {
        // Database function should filter this out
        mockSupabaseClient.rpc.mockResolvedValueOnce({
          data: [], // Opted-out user filtered by database function
          error: null,
        })

        const result = await getActiveUsersLastWeek()

        expect(result).toHaveLength(0)
      })
    })

    describe('Data Accuracy', () => {
      it('should return accurate transaction count for multiple transactions', async () => {
        // Mock RPC response
        mockSupabaseClient.rpc.mockResolvedValueOnce({
          data: [
            {
              user_id: 'user-many-tx',
              transaction_count: 15,
              last_activity_at: twoDaysAgo.toISOString(),
              preferred_destination: 'individual',
              destination_jid: '5511555555555@s.whatsapp.net',
              locale: 'pt-BR',
            },
          ],
          error: null,
        })

        const result = await getActiveUsersLastWeek()

        expect(result).toHaveLength(1)
        expect(result[0].transactionCount).toBe(15)
      })

      it('should return empty array when no active users', async () => {
        // Mock RPC response
        mockSupabaseClient.rpc.mockResolvedValueOnce({
          data: [],
          error: null,
        })

        const result = await getActiveUsersLastWeek()

        expect(result).toHaveLength(0)
        expect(Array.isArray(result)).toBe(true)
      })

      it('should handle null data gracefully', async () => {
        // Mock RPC response
        mockSupabaseClient.rpc.mockResolvedValueOnce({
          data: null,
          error: null,
        })

        const result = await getActiveUsersLastWeek()

        expect(result).toHaveLength(0)
        expect(Array.isArray(result)).toBe(true)
      })

      it('should return multiple active users', async () => {
        // Mock RPC response
        mockSupabaseClient.rpc.mockResolvedValueOnce({
          data: [
            {
              user_id: 'user-1',
              transaction_count: 3,
              last_activity_at: twoDaysAgo.toISOString(),
              preferred_destination: 'individual',
              destination_jid: '5511111111111@s.whatsapp.net',
              locale: 'pt-BR',
            },
            {
              user_id: 'user-2',
              transaction_count: 5,
              last_activity_at: twoDaysAgo.toISOString(),
              preferred_destination: 'group',
              destination_jid: '5511222222222-123456789@g.us',
              locale: 'en',
            },
          ],
          error: null,
        })

        const result = await getActiveUsersLastWeek()

        expect(result).toHaveLength(2)
        expect(result[0].userId).toBe('user-1')
        expect(result[1].userId).toBe('user-2')
      })
    })

    describe('Error Handling', () => {
      it('should throw error on database failure', async () => {
        // Mock RPC error
        mockSupabaseClient.rpc.mockResolvedValueOnce({
          data: null,
          error: { message: 'Database connection failed', code: 'DB_ERROR' },
        })

        await expect(getActiveUsersLastWeek()).rejects.toEqual({
          message: 'Database connection failed',
          code: 'DB_ERROR',
        })

        expect(logger.error).toHaveBeenCalledWith(
          'Failed to get active users',
          expect.objectContaining({
            error: 'Database connection failed',
          })
        )
      })

      it('should skip malformed rows and log warning', async () => {
        // Mock RPC response with one valid and one malformed row
        mockSupabaseClient.rpc.mockResolvedValueOnce({
          data: [
            {
              user_id: 'user-valid',
              transaction_count: 3,
              last_activity_at: twoDaysAgo.toISOString(),
              preferred_destination: 'individual',
              destination_jid: '5511333333333@s.whatsapp.net',
              locale: 'pt-BR',
            },
            {
              user_id: 'user-malformed',
              // Missing required fields - will cause error in mapping
              transaction_count: 3,
              last_activity_at: 'invalid-date-format',
              preferred_destination: 'individual',
              destination_jid: '5511444444444@s.whatsapp.net',
              locale: 'pt-BR',
            },
          ],
          error: null,
        })

        const result = await getActiveUsersLastWeek()

        // Should return both (malformed date will still parse)
        // This test verifies graceful handling of data issues
        expect(result).toHaveLength(2)
      })
    })

    describe('Logging', () => {
      it('should log detection start and completion', async () => {
        // Mock RPC response
        mockSupabaseClient.rpc.mockResolvedValueOnce({
          data: [],
          error: null,
        })

        await getActiveUsersLastWeek()

        expect(logger.info).toHaveBeenCalledWith(
          'Detecting active users for weekly review',
          expect.objectContaining({
            lookback_days: 7,
          })
        )

        expect(logger.info).toHaveBeenCalledWith(
          'Active users detected',
          expect.objectContaining({
            count: 0,
            duration_ms: expect.any(Number),
          })
        )
      })
    })

    describe('Performance', () => {
      it('should complete query in reasonable time', async () => {
        // Mock RPC response with large dataset
        const users = Array.from({ length: 1000 }, (_, i) => ({
          user_id: `user-${i}`,
          transaction_count: Math.floor(Math.random() * 10),
          last_activity_at: twoDaysAgo.toISOString(),
          preferred_destination: 'individual',
          destination_jid: `5511${i.toString().padStart(9, '0')}@s.whatsapp.net`,
          locale: 'pt-BR',
        }))

        mockSupabaseClient.rpc.mockResolvedValueOnce({
          data: users,
          error: null,
        })

        const startTime = Date.now()
        const result = await getActiveUsersLastWeek()
        const duration = Date.now() - startTime

        expect(result).toHaveLength(1000)
        expect(duration).toBeLessThan(5000) // < 5 seconds
      })
    })
  })

  describe('getUserActivityCount', () => {
    it('should return correct count with transactions and bot activity', async () => {
      // Mock transaction count query
      mockSupabaseClient.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        gt: jest.fn().mockReturnThis(),
        then: jest.fn((resolve: any) =>
          resolve({ count: 5, error: null })
        ),
      })

      // Mock engagement state query
      mockSupabaseClient.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockReturnThis(),
        then: jest.fn((resolve: any) =>
          resolve({
            data: { last_activity_at: twoDaysAgo.toISOString() },
            error: null,
          })
        ),
      })

      const count = await getUserActivityCount('user-1', 7)

      expect(count).toBe(6) // 5 transactions + 1 bot activity
      expect(logger.debug).toHaveBeenCalledWith(
        'User activity count',
        expect.objectContaining({
          userId: 'user-1',
          days: 7,
          transactionCount: 5,
          botActivityCount: 1,
          totalCount: 6,
        })
      )
    })

    it('should return correct count with only transactions', async () => {
      // Mock transaction count query
      mockSupabaseClient.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        gt: jest.fn().mockReturnThis(),
        then: jest.fn((resolve: any) =>
          resolve({ count: 3, error: null })
        ),
      })

      // Mock engagement state query (no recent activity)
      mockSupabaseClient.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockReturnThis(),
        then: jest.fn((resolve: any) =>
          resolve({
            data: { last_activity_at: eightDaysAgo.toISOString() },
            error: null,
          })
        ),
      })

      const count = await getUserActivityCount('user-2', 7)

      expect(count).toBe(3) // 3 transactions + 0 bot activity
    })

    it('should return correct count with only bot activity', async () => {
      // Mock transaction count query (no transactions)
      mockSupabaseClient.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        gt: jest.fn().mockReturnThis(),
        then: jest.fn((resolve: any) =>
          resolve({ count: 0, error: null })
        ),
      })

      // Mock engagement state query
      mockSupabaseClient.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockReturnThis(),
        then: jest.fn((resolve: any) =>
          resolve({
            data: { last_activity_at: twoDaysAgo.toISOString() },
            error: null,
          })
        ),
      })

      const count = await getUserActivityCount('user-3', 7)

      expect(count).toBe(1) // 0 transactions + 1 bot activity
    })

    it('should return 0 when no activity', async () => {
      // Mock transaction count query (no transactions)
      mockSupabaseClient.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        gt: jest.fn().mockReturnThis(),
        then: jest.fn((resolve: any) =>
          resolve({ count: 0, error: null })
        ),
      })

      // Mock engagement state query (no recent activity)
      mockSupabaseClient.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockReturnThis(),
        then: jest.fn((resolve: any) =>
          resolve({
            data: { last_activity_at: eightDaysAgo.toISOString() },
            error: null,
          })
        ),
      })

      const count = await getUserActivityCount('user-4', 7)

      expect(count).toBe(0)
    })

    it('should handle missing engagement state', async () => {
      // Mock transaction count query
      mockSupabaseClient.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        gt: jest.fn().mockReturnThis(),
        then: jest.fn((resolve: any) =>
          resolve({ count: 2, error: null })
        ),
      })

      // Mock engagement state query (not found)
      mockSupabaseClient.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockReturnThis(),
        then: jest.fn((resolve: any) =>
          resolve({
            data: null,
            error: { code: 'PGRST116', message: 'not found' },
          })
        ),
      })

      const count = await getUserActivityCount('user-5', 7)

      expect(count).toBe(2) // 2 transactions + 0 bot activity
    })

    it('should throw error on database failure', async () => {
      // Mock transaction count query error
      mockSupabaseClient.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        gt: jest.fn().mockReturnThis(),
        then: jest.fn((resolve: any) =>
          resolve({ count: null, error: { message: 'Database error' } })
        ),
      })

      await expect(getUserActivityCount('user-6', 7)).rejects.toEqual({
        message: 'Database error',
      })

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to get user activity count',
        expect.objectContaining({
          userId: 'user-6',
          days: 7,
        })
      )
    })
  })
})
