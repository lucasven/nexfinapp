/**
 * Tests for OCR Confirmation Handler
 */

import { describe, it, expect, beforeEach, beforeAll, afterAll, jest, afterEach } from '@jest/globals'

jest.mock('../../../auth/session-manager.js')
jest.mock('../../../services/monitoring/logger.js')
jest.mock('../../../analytics/index.js')
jest.mock('../../../handlers/transactions/expenses.js')

import { 
  storePendingOcrTransactions,
  getPendingOcrTransactions,
  clearPendingOcrTransactions,
  hasPendingOcrTransactions,
  handleOcrCancel
} from '../../../handlers/transactions/ocr-confirmation.js'

import { handleAddExpense } from '../../../handlers/transactions/expenses.js'

const mockHandleAddExpense = handleAddExpense as jest.MockedFunction<typeof handleAddExpense>

describe('OCR Confirmation Handler', () => {
  const TEST_PHONE = '+5511999999999'
  const TEST_USER_ID = 'user-123'

  beforeAll(() => {
    jest.useFakeTimers()
  })

  afterAll(() => {
    jest.useRealTimers()
  })

  beforeEach(() => {
    jest.clearAllMocks()
    clearPendingOcrTransactions(TEST_PHONE)
    clearPendingOcrTransactions('+5511888888888')
  })

  afterEach(() => {
    clearPendingOcrTransactions(TEST_PHONE)
    clearPendingOcrTransactions('+5511888888888')
  })

  describe('storePendingOcrTransactions', () => {
    it('should store pending OCR transactions', () => {
      storePendingOcrTransactions(
        TEST_PHONE,
        TEST_USER_ID,
        [{ amount: 100, type: 'expense' }]
      )
      
      const result = getPendingOcrTransactions(TEST_PHONE)
      expect(result).not.toBeNull()
      expect(result?.transactions).toHaveLength(1)
      expect(result?.transactions[0].amount).toBe(100)
    })

    it('should store multiple transactions', () => {
      storePendingOcrTransactions(
        TEST_PHONE,
        TEST_USER_ID,
        [
          { amount: 100, type: 'expense' },
          { amount: 200, type: 'expense' },
          { amount: 50, type: 'income' }
        ]
      )
      
      const result = getPendingOcrTransactions(TEST_PHONE)
      expect(result?.transactions).toHaveLength(3)
    })

    it('should store user info with transactions', () => {
      storePendingOcrTransactions(
        TEST_PHONE,
        TEST_USER_ID,
        [{ amount: 100, type: 'expense' }]
      )
      
      const result = getPendingOcrTransactions(TEST_PHONE)
      expect(result?.userId).toBe(TEST_USER_ID)
      expect(result?.whatsappNumber).toBe(TEST_PHONE)
    })

    it('should store optional parsing metric ID', () => {
      storePendingOcrTransactions(
        TEST_PHONE,
        TEST_USER_ID,
        [{ amount: 100, type: 'expense' }],
        'metric-123'
      )
      
      const result = getPendingOcrTransactions(TEST_PHONE)
      expect(result?.parsingMetricId).toBe('metric-123')
    })
  })

  describe('getPendingOcrTransactions', () => {
    it('should return null when no pending transactions', () => {
      const result = getPendingOcrTransactions(TEST_PHONE)
      expect(result).toBeNull()
    })

    it('should return stored transactions', () => {
      storePendingOcrTransactions(
        TEST_PHONE,
        TEST_USER_ID,
        [{ amount: 100, type: 'expense' }]
      )
      
      const result = getPendingOcrTransactions(TEST_PHONE)
      expect(result?.transactions[0].amount).toBe(100)
    })

    it('should return null for different phone number', () => {
      storePendingOcrTransactions(
        TEST_PHONE,
        TEST_USER_ID,
        [{ amount: 100, type: 'expense' }]
      )
      
      const result = getPendingOcrTransactions('+5511888888888')
      expect(result).toBeNull()
    })
  })

  describe('clearPendingOcrTransactions', () => {
    it('should clear pending transactions', () => {
      storePendingOcrTransactions(
        TEST_PHONE,
        TEST_USER_ID,
        [{ amount: 100, type: 'expense' }]
      )
      
      clearPendingOcrTransactions(TEST_PHONE)
      
      const result = getPendingOcrTransactions(TEST_PHONE)
      expect(result).toBeNull()
    })

    it('should not affect other users', () => {
      storePendingOcrTransactions(
        TEST_PHONE,
        TEST_USER_ID,
        [{ amount: 100, type: 'expense' }]
      )
      
      clearPendingOcrTransactions('+5511888888888')
      
      const result = getPendingOcrTransactions(TEST_PHONE)
      expect(result).not.toBeNull()
    })
  })

  describe('hasPendingOcrTransactions', () => {
    it('should return false when no pending transactions', () => {
      const result = hasPendingOcrTransactions(TEST_PHONE)
      expect(result).toBe(false)
    })

    it('should return true when there are pending transactions', () => {
      storePendingOcrTransactions(
        TEST_PHONE,
        TEST_USER_ID,
        [{ amount: 100, type: 'expense' }]
      )
      
      const result = hasPendingOcrTransactions(TEST_PHONE)
      expect(result).toBe(true)
    })
  })

  describe('handleOcrCancel', () => {
    it('should return cancel message when there are no pending transactions', async () => {
      const result = await handleOcrCancel(TEST_PHONE)
      // The actual message when there's nothing to cancel
      expect(result).toBeDefined()
      expect(typeof result).toBe('string')
    })

    it('should clear pending transactions on cancel when they exist', async () => {
      storePendingOcrTransactions(
        TEST_PHONE,
        TEST_USER_ID,
        [{ amount: 100, type: 'expense' }]
      )
      
      await handleOcrCancel(TEST_PHONE)
      
      const result = getPendingOcrTransactions(TEST_PHONE)
      expect(result).toBeNull()
    })
  })
})