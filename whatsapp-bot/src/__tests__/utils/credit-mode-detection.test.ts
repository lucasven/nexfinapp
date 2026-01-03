import { needsCreditModeSelection } from '../../utils/credit-mode-detection'
import { mockSupabaseClient, resetSupabaseMocks, mockQuerySuccess } from '../../__mocks__/supabase'

// Mock dependencies
jest.mock('../../services/database/supabase-client', () => ({
  getSupabaseClient: () => mockSupabaseClient
}))

describe('needsCreditModeSelection', () => {
  beforeEach(() => {
    resetSupabaseMocks()
    jest.clearAllMocks()
  })

  describe('AC2.1: Detection Logic for Unset Mode', () => {
    it('returns true for credit card with NULL credit_mode', async () => {
      const paymentMethod = { type: 'credit', credit_mode: null }
      mockQuerySuccess(paymentMethod)

      const result = await needsCreditModeSelection('pm-123')

      expect(result).toBe(true)
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('payment_methods')
    })

    it('returns false for credit card with credit_mode set to true', async () => {
      const paymentMethod = { type: 'credit', credit_mode: true }
      mockQuerySuccess(paymentMethod)

      const result = await needsCreditModeSelection('pm-123')

      expect(result).toBe(false)
    })

    it('returns false for credit card with credit_mode set to false', async () => {
      const paymentMethod = { type: 'credit', credit_mode: false }
      mockQuerySuccess(paymentMethod)

      const result = await needsCreditModeSelection('pm-123')

      expect(result).toBe(false)
    })

    it('returns false for debit card', async () => {
      const paymentMethod = { type: 'debit', credit_mode: null }
      mockQuerySuccess(paymentMethod)

      const result = await needsCreditModeSelection('pm-123')

      expect(result).toBe(false)
    })

    it('returns false for cash payment method', async () => {
      const paymentMethod = { type: 'cash', credit_mode: null }
      mockQuerySuccess(paymentMethod)

      const result = await needsCreditModeSelection('pm-456')

      expect(result).toBe(false)
    })

    it('queries the correct payment method by id', async () => {
      const paymentMethod = { type: 'credit', credit_mode: null }
      mockQuerySuccess(paymentMethod)

      await needsCreditModeSelection('pm-specific-id-789')

      // Verify query builder chain
      const queryBuilder = mockSupabaseClient.from()
      expect(queryBuilder.select).toHaveBeenCalledWith('type, credit_mode')
      expect(queryBuilder.eq).toHaveBeenCalledWith('id', 'pm-specific-id-789')
      expect(queryBuilder.single).toHaveBeenCalled()
    })
  })

  describe('Edge Cases and Error Handling', () => {
    it('returns false when database query fails (graceful degradation)', async () => {
      mockSupabaseClient.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockReturnThis(),
        then: jest.fn((resolve: any) =>
          resolve({ data: null, error: { message: 'Database connection failed' } })
        )
      })

      const result = await needsCreditModeSelection('pm-error')

      expect(result).toBe(false)
    })

    it('returns false when payment method not found', async () => {
      mockSupabaseClient.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockReturnThis(),
        then: jest.fn((resolve: any) =>
          resolve({ data: null, error: null })
        )
      })

      const result = await needsCreditModeSelection('pm-nonexistent')

      expect(result).toBe(false)
    })

    it('handles unexpected errors gracefully', async () => {
      mockSupabaseClient.from.mockImplementation(() => {
        throw new Error('Unexpected network error')
      })

      const result = await needsCreditModeSelection('pm-crash')

      expect(result).toBe(false)
    })
  })

  describe('Performance Testing (AC2.1)', () => {
    it('executes query in < 100ms', async () => {
      const paymentMethod = { type: 'credit', credit_mode: null }
      mockQuerySuccess(paymentMethod)

      const start = performance.now()
      await needsCreditModeSelection('pm-performance')
      const duration = performance.now() - start

      // Mock operations should be very fast (< 100ms)
      expect(duration).toBeLessThan(100)
    })

    it('measures p95 latency over 100 iterations (< 100ms)', async () => {
      const paymentMethod = { type: 'credit', credit_mode: null }
      const iterations = 100
      const times: number[] = []

      for (let i = 0; i < iterations; i++) {
        mockQuerySuccess(paymentMethod)

        const start = performance.now()
        await needsCreditModeSelection(`pm-test-${i}`)
        const duration = performance.now() - start
        times.push(duration)
      }

      times.sort((a, b) => a - b)
      const p95 = times[Math.floor(iterations * 0.95)]

      console.log(`[Performance Test] P95 latency: ${p95.toFixed(2)}ms`)
      expect(p95).toBeLessThan(100)
    })
  })

  describe('Multi-Card Scenarios (AC2.5)', () => {
    it('returns correct value for different payment methods independently', async () => {
      // Card A - mode set to true
      mockQuerySuccess({ type: 'credit', credit_mode: true })
      const resultA = await needsCreditModeSelection('card-a')
      expect(resultA).toBe(false)

      // Card B - mode not set (NULL)
      mockQuerySuccess({ type: 'credit', credit_mode: null })
      const resultB = await needsCreditModeSelection('card-b')
      expect(resultB).toBe(true)

      // Card C - mode set to false (Simple Mode)
      mockQuerySuccess({ type: 'credit', credit_mode: false })
      const resultC = await needsCreditModeSelection('card-c')
      expect(resultC).toBe(false)
    })
  })

  describe('Backward Compatibility (AC2.6)', () => {
    it('detects pre-migration credit cards with NULL credit_mode', async () => {
      // Simulates existing credit card created before migration
      const preMigrationCard = { type: 'credit', credit_mode: null }
      mockQuerySuccess(preMigrationCard)

      const result = await needsCreditModeSelection('pre-migration-card-123')

      // Should trigger mode selection prompt
      expect(result).toBe(true)
    })
  })
})
