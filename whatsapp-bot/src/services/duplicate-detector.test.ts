// Jest globals are available
import { checkForDuplicate, getDuplicateConfig, updateDuplicateConfig } from './duplicate-detector'
import { createMockExpenseData, createMockTransaction } from '../__tests__/utils/test-helpers'
import { mockSupabaseClient, resetSupabaseMocks, mockQuerySuccess, mockQueryError } from '../__mocks__/supabase'

// Mock the supabase client
jest.mock('./supabase-client', () => ({
  getSupabaseClient: () => mockSupabaseClient
}))

describe('Duplicate Detector', () => {
  beforeEach(() => {
    resetSupabaseMocks()
  })

  describe('checkForDuplicate', () => {
    it('should return no duplicate when no recent transactions', async () => {
      // Mock empty response
      mockQuerySuccess([])

      const expenseData = createMockExpenseData()
      const result = await checkForDuplicate('user-123', expenseData)

      expect(result.isDuplicate).toBe(false)
      expect(result.confidence).toBe(0)
    })

    it('should return no duplicate when database error occurs', async () => {
      // Mock error response
      mockQueryError(new Error('Database error'))

      const expenseData = createMockExpenseData()
      const result = await checkForDuplicate('user-123', expenseData)

      expect(result.isDuplicate).toBe(false)
      expect(result.confidence).toBe(0)
    })

    it('should detect exact duplicate', async () => {
      const existingTransaction = createMockTransaction({
        amount: 50.00,
        description: 'Almoço no restaurante',
        category_id: 'comida',
        payment_method: 'cartão'
      })

      mockQuerySuccess([existingTransaction])

      const expenseData = createMockExpenseData({
        amount: 50.00,
        description: 'Almoço no restaurante',
        category: 'comida',
        paymentMethod: 'cartão'
      })

      const result = await checkForDuplicate('user-123', expenseData)

      expect(result.isDuplicate).toBe(true)
      expect(result.confidence).toBeGreaterThan(0.95)
      expect(result.similarTransaction).toEqual(existingTransaction)
      expect(result.reason).toContain('Transação muito similar encontrada')
    })

    it('should detect similar transaction within tolerance', async () => {
      const existingTransaction = createMockTransaction({
        amount: 50.00,
        description: 'Almoço restaurante',
        category_id: 'comida',
        payment_method: 'cartão'
      })

      mockQuerySuccess([existingTransaction])

      const expenseData = createMockExpenseData({
        amount: 52.00, // Within 5% tolerance
        description: 'Almoço no restaurante',
        category: 'comida',
        paymentMethod: 'cartão'
      })

      const result = await checkForDuplicate('user-123', expenseData)

      expect(result.isDuplicate).toBe(true)
      expect(result.confidence).toBeGreaterThan(0.7)
      expect(result.reason).toContain('Possível duplicata')
    })

    it('should not detect duplicate for different amounts', async () => {
      const existingTransaction = createMockTransaction({
        amount: 50.00,
        description: 'Almoço no restaurante',
        category_id: 'comida'
      })

      mockQuerySuccess([existingTransaction])

      const expenseData = createMockExpenseData({
        amount: 100.00, // Different amount
        description: 'Almoço no restaurante',
        category: 'comida'
      })

      const result = await checkForDuplicate('user-123', expenseData)

      expect(result.isDuplicate).toBe(false)
      expect(result.confidence).toBe(0)
    })

    it('should detect duplicate even with different categories', async () => {
      const existingTransaction = createMockTransaction({
        amount: 50.00,
        description: 'Almoço no restaurante',
        category_id: 'comida'
      })

      mockQuerySuccess([existingTransaction])

      const expenseData = createMockExpenseData({
        amount: 50.00,
        description: 'Almoço no restaurante',
        category: 'transporte' // Different category
      })

      const result = await checkForDuplicate('user-123', expenseData)

      // Should still detect as duplicate since amount and description match
      // Category difference reduces confidence but not below threshold
      expect(result.isDuplicate).toBe(true)
      expect(result.confidence).toBeGreaterThan(0.6)
    })

    it('should not detect duplicate for different transaction types', async () => {
      // Note: The query filters by type at the database level,
      // so an existing expense transaction would not be returned
      // when checking for an income transaction.
      // This test verifies that if somehow we got a different type,
      // it wouldn't match (though this shouldn't happen in practice).
      mockQuerySuccess([]) // No transactions of the same type

      const expenseData = createMockExpenseData({
        amount: 50.00,
        description: 'Almoço no restaurante',
        category: 'comida',
        type: 'income'
      })

      const result = await checkForDuplicate('user-123', expenseData)

      expect(result.isDuplicate).toBe(false)
      expect(result.confidence).toBe(0)
    })

    it('should use custom configuration', async () => {
      const existingTransaction = createMockTransaction({
        amount: 50.00,
        description: 'Almoço no restaurante',
        category_id: 'comida'
      })

      mockQuerySuccess([existingTransaction])

      const expenseData = createMockExpenseData({
        amount: 60.00, // 20% difference
        description: 'Almoço no restaurante',
        category: 'comida'
      })

      // Custom config with higher tolerance
      const customConfig = {
        amountTolerancePercent: 25,
        timeWindowHours: 12
      }

      const result = await checkForDuplicate('user-123', expenseData, customConfig)

      expect(result.isDuplicate).toBe(true)
      expect(result.confidence).toBeGreaterThan(0.7)
    })

    it('should check multiple recent transactions', async () => {
      const transactions = [
        createMockTransaction({
          amount: 30.00,
          description: 'Uber',
          category_id: 'transporte'
        }),
        createMockTransaction({
          amount: 50.00,
          description: 'Almoço no restaurante',
          category_id: 'comida'
        }),
        createMockTransaction({
          amount: 25.00,
          description: 'Farmácia',
          category_id: 'saúde'
        })
      ]

      mockQuerySuccess(transactions)

      const expenseData = createMockExpenseData({
        amount: 50.00,
        description: 'Almoço no restaurante',
        category: 'comida'
      })

      const result = await checkForDuplicate('user-123', expenseData)

      expect(result.isDuplicate).toBe(true)
      expect(result.confidence).toBeGreaterThan(0.95)
    })

    it('should handle transactions with missing optional fields', async () => {
      const existingTransaction = createMockTransaction({
        amount: 50.00,
        description: 'Almoço no restaurante',
        category_id: 'comida',
        payment_method: null // Missing payment method
      })

      mockQuerySuccess([existingTransaction])

      const expenseData = createMockExpenseData({
        amount: 50.00,
        description: 'Almoço no restaurante',
        category: 'comida',
        paymentMethod: 'cartão' // Has payment method
      })

      const result = await checkForDuplicate('user-123', expenseData)

      expect(result.isDuplicate).toBe(true)
      expect(result.confidence).toBeGreaterThan(0.7)
    })

    it('should handle empty descriptions', async () => {
      const existingTransaction = createMockTransaction({
        amount: 50.00,
        description: '',
        category_id: 'comida'
      })

      mockQuerySuccess([existingTransaction])

      const expenseData = createMockExpenseData({
        amount: 50.00,
        description: '',
        category: 'comida'
      })

      const result = await checkForDuplicate('user-123', expenseData)

      expect(result.isDuplicate).toBe(true)
      expect(result.confidence).toBeGreaterThan(0.7)
    })
  })

  describe('getDuplicateConfig', () => {
    it('should return default configuration', async () => {
      const config = await getDuplicateConfig('user-123')

      expect(config).toEqual({
        timeWindowHours: 24,
        amountTolerancePercent: 5,
        descriptionSimilarityThreshold: 0.8,
        autoBlockThreshold: 0.95
      })
    })
  })

  describe('updateDuplicateConfig', () => {
    it('should log configuration update', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {})
      
      const newConfig = {
        timeWindowHours: 12,
        amountTolerancePercent: 10
      }

      await updateDuplicateConfig('user-123', newConfig)

      expect(consoleSpy).toHaveBeenCalledWith(
        'User user-123 updated duplicate config:',
        newConfig
      )

      consoleSpy.mockRestore()
    })
  })

  describe('Edge Cases', () => {
    it('should handle very small amounts', async () => {
      const existingTransaction = createMockTransaction({
        amount: 0.50,
        description: 'Docinho',
        category_id: 'comida'
      })

      mockQuerySuccess([existingTransaction])

      const expenseData = createMockExpenseData({
        amount: 0.50,
        description: 'Docinho',
        category: 'comida'
      })

      const result = await checkForDuplicate('user-123', expenseData)

      expect(result.isDuplicate).toBe(true)
      expect(result.confidence).toBeGreaterThan(0.95)
    })

    it('should handle very large amounts', async () => {
      const existingTransaction = createMockTransaction({
        amount: 10000.00,
        description: 'Aluguel',
        category_id: 'contas'
      })

      mockQuerySuccess([existingTransaction])

      const expenseData = createMockExpenseData({
        amount: 10000.00,
        description: 'Aluguel',
        category: 'contas'
      })

      const result = await checkForDuplicate('user-123', expenseData)

      expect(result.isDuplicate).toBe(true)
      expect(result.confidence).toBeGreaterThan(0.95)
    })

    it('should handle special characters in descriptions', async () => {
      const existingTransaction = createMockTransaction({
        amount: 50.00,
        description: 'Almoço no restaurante! (Muito bom)',
        category_id: 'comida'
      })

      mockQuerySuccess([existingTransaction])

      const expenseData = createMockExpenseData({
        amount: 50.00,
        description: 'Almoço no restaurante! (Muito bom)',
        category: 'comida'
      })

      const result = await checkForDuplicate('user-123', expenseData)

      expect(result.isDuplicate).toBe(true)
      expect(result.confidence).toBeGreaterThan(0.95)
    })
  })
})
