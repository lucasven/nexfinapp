/**
 * Tests for Transaction Corrections Handler
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals'

jest.mock('../../../auth/session-manager.js')
jest.mock('../../../services/database/supabase-client.js')
jest.mock('../../../services/detection/correction-detector.js')
jest.mock('../../../services/monitoring/logger.js')

import { getUserSession } from '../../../auth/session-manager.js'
import { getSupabaseClient } from '../../../services/database/supabase-client.js'

const mockGetUserSession = getUserSession as jest.MockedFunction<typeof getUserSession>
const mockGetSupabaseClient = getSupabaseClient as jest.MockedFunction<typeof getSupabaseClient>

describe('Transaction Corrections Handler', () => {
  let mockSupabaseClient: any

  beforeEach(() => {
    jest.clearAllMocks()
    
    mockSupabaseClient = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      single: jest.fn(),
      then: jest.fn()
    }
    
    mockGetSupabaseClient.mockReturnValue(mockSupabaseClient)
  })

  describe('Authentication', () => {
    it('should return error when user is not authenticated', async () => {
      const { handleTransactionCorrection } = await import('../../../handlers/transactions/transaction-corrections.js')
      
      mockGetUserSession.mockResolvedValue(null)
      
      const result = await handleTransactionCorrection('+5511999999999', {
        transactionId: 'ABC123',
        action: 'delete'
      })
      
      expect(result).toContain('login')
    })
  })

  describe('Transaction ID validation', () => {
    it('should return error when transaction ID is missing', async () => {
      const { handleTransactionCorrection } = await import('../../../handlers/transactions/transaction-corrections.js')
      
      mockGetUserSession.mockResolvedValue({
        userId: 'user-123',
        whatsappNumber: '+5511999999999'
      })
      
      const result = await handleTransactionCorrection('+5511999999999', {
        transactionId: undefined,
        action: 'delete'
      } as any)
      
      expect(result).toContain('ID')
    })
  })

  describe('handleTransactionCorrection export', () => {
    it('should export handleTransactionCorrection function', async () => {
      const { handleTransactionCorrection } = await import('../../../handlers/transactions/transaction-corrections.js')
      
      expect(typeof handleTransactionCorrection).toBe('function')
    })
  })
})