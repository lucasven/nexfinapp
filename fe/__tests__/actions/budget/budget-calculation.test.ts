/**
 * Unit Tests: Budget Calculation with Installments
 *
 * Story 2.8: Installment Impact on Budget Tracking
 *
 * Tests the budget server action including:
 * - Regular transactions in period
 * - Installment payments in period
 * - Period filtering (inclusive boundaries)
 * - Multiple installments
 * - Empty budget
 * - Error handling
 *
 * Note: These tests mock the Supabase RPC function.
 * Integration tests verify actual database queries.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals'
import { getBudgetForPeriod } from '@/lib/actions/budget'

// Mock Supabase client
const mockSupabaseClient = {
  auth: {
    getUser: jest.fn(),
  },
  from: jest.fn(() => mockSupabaseClient),
  select: jest.fn(() => mockSupabaseClient),
  eq: jest.fn(() => mockSupabaseClient),
  single: jest.fn(),
  rpc: jest.fn(),
}

// Mock the server client
jest.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: jest.fn(() => Promise.resolve(mockSupabaseClient)),
}))

// Mock analytics tracker
jest.mock('@/lib/analytics/server-tracker', () => ({
  trackServerEvent: jest.fn(() => Promise.resolve()),
}))

describe('getBudgetForPeriod', () => {
  const mockUserId = 'user-123'
  const mockPaymentMethodId = 'pm-456'
  const periodStart = new Date('2024-12-06')
  const periodEnd = new Date('2025-01-05')

  beforeEach(() => {
    jest.clearAllMocks()

    // Default mock: authenticated user
    mockSupabaseClient.auth.getUser.mockResolvedValue({
      data: { user: { id: mockUserId } },
    })

    // Default mock: payment method exists
    mockSupabaseClient.single.mockResolvedValue({
      data: { id: mockPaymentMethodId },
      error: null,
    })
  })

  describe('Authentication', () => {
    it('should return error if user not authenticated', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: null },
      })

      const result = await getBudgetForPeriod(
        mockPaymentMethodId,
        periodStart,
        periodEnd
      )

      expect(result.success).toBe(false)
      expect(result.error).toBe('Not authenticated')
    })
  })

  describe('Payment method validation', () => {
    it('should return error if payment method not found', async () => {
      mockSupabaseClient.single.mockResolvedValue({
        data: null,
        error: { message: 'Not found' },
      })

      const result = await getBudgetForPeriod(
        mockPaymentMethodId,
        periodStart,
        periodEnd
      )

      expect(result.success).toBe(false)
      expect(result.error).toBe('Payment method not found or unauthorized')
    })
  })

  describe('Budget calculation with regular transactions only', () => {
    it('should calculate total spent from regular transactions', async () => {
      const mockData = [
        {
          date: '2024-12-10',
          description: 'iFood delivery',
          amount: 80,
          category_id: 'cat-1',
          category_name: 'Alimentação',
          category_emoji: '🍕',
          is_installment: false,
          installment_number: null,
          total_installments: null,
          plan_description: null,
        },
        {
          date: '2024-12-15',
          description: 'Mercado',
          amount: 200,
          category_id: 'cat-1',
          category_name: 'Alimentação',
          category_emoji: '🍕',
          is_installment: false,
          installment_number: null,
          total_installments: null,
          plan_description: null,
        },
      ]

      mockSupabaseClient.rpc.mockResolvedValue({
        data: mockData,
        error: null,
      })

      const result = await getBudgetForPeriod(
        mockPaymentMethodId,
        periodStart,
        periodEnd
      )

      expect(result.success).toBe(true)
      expect(result.data?.totalSpent).toBe(280)
      expect(result.data?.regularTransactions).toBe(2)
      expect(result.data?.installmentPayments).toBe(0)
    })
  })

  describe('Budget calculation with installment payments only', () => {
    it('should calculate total spent from installment payments', async () => {
      const mockData = [
        {
          date: '2024-12-10',
          description: 'Celular Samsung',
          amount: 100,
          category_id: 'cat-2',
          category_name: 'Eletrônicos',
          category_emoji: '📱',
          is_installment: true,
          installment_number: 1,
          total_installments: 12,
          plan_description: 'Celular Samsung',
        },
      ]

      mockSupabaseClient.rpc.mockResolvedValue({
        data: mockData,
        error: null,
      })

      const result = await getBudgetForPeriod(
        mockPaymentMethodId,
        periodStart,
        periodEnd
      )

      expect(result.success).toBe(true)
      expect(result.data?.totalSpent).toBe(100)
      expect(result.data?.regularTransactions).toBe(0)
      expect(result.data?.installmentPayments).toBe(1)
    })
  })

  describe('Budget calculation with mixed transactions', () => {
    it('should calculate total spent from both regular and installment', async () => {
      const mockData = [
        {
          date: '2024-12-10',
          description: 'iFood delivery',
          amount: 80,
          category_id: 'cat-1',
          category_name: 'Alimentação',
          category_emoji: '🍕',
          is_installment: false,
          installment_number: null,
          total_installments: null,
          plan_description: null,
        },
        {
          date: '2024-12-10',
          description: 'Celular Samsung',
          amount: 100,
          category_id: 'cat-2',
          category_name: 'Eletrônicos',
          category_emoji: '📱',
          is_installment: true,
          installment_number: 1,
          total_installments: 12,
          plan_description: 'Celular Samsung',
        },
        {
          date: '2024-12-15',
          description: 'Notebook Dell',
          amount: 200,
          category_id: 'cat-2',
          category_name: 'Eletrônicos',
          category_emoji: '📱',
          is_installment: true,
          installment_number: 3,
          total_installments: 8,
          plan_description: 'Notebook Dell',
        },
      ]

      mockSupabaseClient.rpc.mockResolvedValue({
        data: mockData,
        error: null,
      })

      const result = await getBudgetForPeriod(
        mockPaymentMethodId,
        periodStart,
        periodEnd
      )

      expect(result.success).toBe(true)
      expect(result.data?.totalSpent).toBe(380)
      expect(result.data?.regularTransactions).toBe(1)
      expect(result.data?.installmentPayments).toBe(2)
    })
  })

  describe('Category grouping', () => {
    it('should group transactions by category', async () => {
      const mockData = [
        {
          date: '2024-12-10',
          description: 'iFood delivery',
          amount: 80,
          category_id: 'cat-1',
          category_name: 'Alimentação',
          category_emoji: '🍕',
          is_installment: false,
          installment_number: null,
          total_installments: null,
          plan_description: null,
        },
        {
          date: '2024-12-15',
          description: 'Mercado',
          amount: 120,
          category_id: 'cat-1',
          category_name: 'Alimentação',
          category_emoji: '🍕',
          is_installment: false,
          installment_number: null,
          total_installments: null,
          plan_description: null,
        },
        {
          date: '2024-12-10',
          description: 'Celular Samsung',
          amount: 100,
          category_id: 'cat-2',
          category_name: 'Eletrônicos',
          category_emoji: '📱',
          is_installment: true,
          installment_number: 1,
          total_installments: 12,
          plan_description: 'Celular Samsung',
        },
      ]

      mockSupabaseClient.rpc.mockResolvedValue({
        data: mockData,
        error: null,
      })

      const result = await getBudgetForPeriod(
        mockPaymentMethodId,
        periodStart,
        periodEnd
      )

      expect(result.success).toBe(true)
      expect(result.data?.categories).toHaveLength(2)

      // Categories sorted by total (descending)
      const alimentacao = result.data?.categories.find(
        (c) => c.categoryName === 'Alimentação'
      )
      expect(alimentacao?.categoryTotal).toBe(200)
      expect(alimentacao?.regularCount).toBe(2)
      expect(alimentacao?.installmentCount).toBe(0)

      const eletronicos = result.data?.categories.find(
        (c) => c.categoryName === 'Eletrônicos'
      )
      expect(eletronicos?.categoryTotal).toBe(100)
      expect(eletronicos?.regularCount).toBe(0)
      expect(eletronicos?.installmentCount).toBe(1)
    })

    it('should handle uncategorized transactions', async () => {
      const mockData = [
        {
          date: '2024-12-10',
          description: 'Misc purchase',
          amount: 50,
          category_id: null,
          category_name: null,
          category_emoji: null,
          is_installment: false,
          installment_number: null,
          total_installments: null,
          plan_description: null,
        },
      ]

      mockSupabaseClient.rpc.mockResolvedValue({
        data: mockData,
        error: null,
      })

      const result = await getBudgetForPeriod(
        mockPaymentMethodId,
        periodStart,
        periodEnd
      )

      expect(result.success).toBe(true)
      expect(result.data?.categories).toHaveLength(1)
      expect(result.data?.categories[0].categoryName).toBe('Sem Categoria')
    })
  })

  describe('Empty budget', () => {
    it('should handle empty budget (no transactions)', async () => {
      mockSupabaseClient.rpc.mockResolvedValue({
        data: [],
        error: null,
      })

      const result = await getBudgetForPeriod(
        mockPaymentMethodId,
        periodStart,
        periodEnd
      )

      expect(result.success).toBe(true)
      expect(result.data?.totalSpent).toBe(0)
      expect(result.data?.regularTransactions).toBe(0)
      expect(result.data?.installmentPayments).toBe(0)
      expect(result.data?.categories).toHaveLength(0)
    })
  })

  describe('Installment context', () => {
    it('should include installment info for installment payments', async () => {
      const mockData = [
        {
          date: '2024-12-10',
          description: 'Celular Samsung',
          amount: 100,
          category_id: 'cat-2',
          category_name: 'Eletrônicos',
          category_emoji: '📱',
          is_installment: true,
          installment_number: 3,
          total_installments: 12,
          plan_description: 'Celular Samsung Galaxy S24',
        },
      ]

      mockSupabaseClient.rpc.mockResolvedValue({
        data: mockData,
        error: null,
      })

      const result = await getBudgetForPeriod(
        mockPaymentMethodId,
        periodStart,
        periodEnd
      )

      expect(result.success).toBe(true)

      const transaction = result.data?.transactionDetails[0]
      expect(transaction?.isInstallment).toBe(true)
      expect(transaction?.installmentInfo).toEqual({
        paymentNumber: 3,
        totalInstallments: 12,
        planDescription: 'Celular Samsung Galaxy S24',
      })
    })

    it('should not include installment info for regular transactions', async () => {
      const mockData = [
        {
          date: '2024-12-10',
          description: 'iFood delivery',
          amount: 80,
          category_id: 'cat-1',
          category_name: 'Alimentação',
          category_emoji: '🍕',
          is_installment: false,
          installment_number: null,
          total_installments: null,
          plan_description: null,
        },
      ]

      mockSupabaseClient.rpc.mockResolvedValue({
        data: mockData,
        error: null,
      })

      const result = await getBudgetForPeriod(
        mockPaymentMethodId,
        periodStart,
        periodEnd
      )

      expect(result.success).toBe(true)

      const transaction = result.data?.transactionDetails[0]
      expect(transaction?.isInstallment).toBe(false)
      expect(transaction?.installmentInfo).toBeUndefined()
    })
  })

  describe('Error handling', () => {
    it('should return error on database query failure', async () => {
      mockSupabaseClient.rpc.mockResolvedValue({
        data: null,
        error: { message: 'Database error' },
      })

      const result = await getBudgetForPeriod(
        mockPaymentMethodId,
        periodStart,
        periodEnd
      )

      expect(result.success).toBe(false)
      expect(result.error).toBe('Database error')
    })

    it('should handle exceptions gracefully', async () => {
      mockSupabaseClient.rpc.mockRejectedValue(new Error('Connection failed'))

      const result = await getBudgetForPeriod(
        mockPaymentMethodId,
        periodStart,
        periodEnd
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain('Connection failed')
    })
  })

  describe('Performance tracking', () => {
    it('should track execution time', async () => {
      mockSupabaseClient.rpc.mockResolvedValue({
        data: [],
        error: null,
      })

      const result = await getBudgetForPeriod(
        mockPaymentMethodId,
        periodStart,
        periodEnd
      )

      expect(result.success).toBe(true)
      expect(result.data?.executionTime).toBeGreaterThanOrEqual(0)
    })
  })
})
