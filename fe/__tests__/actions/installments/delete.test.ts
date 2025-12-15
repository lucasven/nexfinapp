/**
 * Tests for deleteInstallment Server Action
 * Epic 2 Story 2.7: Delete Installment Plan
 *
 * Tests AC7.2 (Deletion Execution): Atomic deletion with paid transaction preservation
 */

import { describe, it, expect, beforeEach, jest, afterEach } from '@jest/globals'
import { deleteInstallment } from '@/lib/actions/installments'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { trackServerEvent } from '@/lib/analytics/server-tracker'

// Mock dependencies
jest.mock('@/lib/supabase/server')
jest.mock('@/lib/analytics/server-tracker')
jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
}))

const mockGetSupabaseServerClient = getSupabaseServerClient as jest.MockedFunction<typeof getSupabaseServerClient>
const mockTrackServerEvent = trackServerEvent as jest.MockedFunction<typeof trackServerEvent>

describe('deleteInstallment Server Action', () => {
  let mockSupabase: any

  beforeEach(() => {
    jest.clearAllMocks()

    // Create comprehensive mock Supabase client
    mockSupabase = {
      auth: {
        getUser: jest.fn(),
      },
      from: jest.fn(),
    }

    mockGetSupabaseServerClient.mockResolvedValue(mockSupabase as any)
    mockTrackServerEvent.mockResolvedValue(undefined)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  /**
   * AC7.2: Deletion Execution - Delete with mixed paid and pending payments
   */
  describe('AC7.2: Deletion Execution', () => {
    it('should successfully delete plan and orphan paid transactions', async () => {
      const userId = 'user-123'
      const planId = '00000000-0000-0000-0000-000000000001'

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: userId } },
      })

      // Track method calls
      const mockSelect = jest.fn()
      const mockEq = jest.fn()
      const mockSingle = jest.fn()
      const mockNot = jest.fn()
      const mockUpdate = jest.fn()
      const mockIn = jest.fn()
      const mockDelete = jest.fn()

      // Mock installment_plans fetch (ownership verification)
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'installment_plans') {
          return {
            select: mockSelect.mockReturnThis(),
            eq: mockEq.mockReturnThis(),
            single: mockSingle.mockResolvedValue({
              data: {
                id: planId,
                user_id: userId,
                description: 'Test Installment',
                total_amount: 1200,
              },
              error: null,
            }),
            delete: mockDelete.mockReturnThis(),
          }
        }
        if (table === 'installment_payments') {
          return {
            select: mockSelect.mockReturnThis(),
            eq: mockEq.mockReturnThis(),
            not: mockNot.mockReturnThis(),
            single: mockSingle.mockResolvedValue({
              data: [
                { transaction_id: 'txn-1' },
                { transaction_id: 'txn-2' },
                { transaction_id: 'txn-3' },
              ],
              error: null,
            }),
          }
        }
        if (table === 'transactions') {
          return {
            update: mockUpdate.mockReturnThis(),
            in: mockIn.mockResolvedValue({
              data: null,
              error: null,
            }),
          }
        }
        return {}
      })

      const result = await deleteInstallment(planId)

      expect(result.success).toBe(true)
      expect(result.deletedData).toBeDefined()
      expect(mockDelete).toHaveBeenCalled()
      expect(mockUpdate).toHaveBeenCalled() // Orphaning transactions
      expect(mockTrackServerEvent).toHaveBeenCalledWith(
        userId,
        expect.stringContaining('INSTALLMENT_DELETED'),
        expect.any(Object)
      )
    })

    it('should reject deletion for non-existent plan', async () => {
      const userId = 'user-123'
      const planId = '00000000-0000-0000-0000-999999999999'

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: userId } },
      })

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'installment_plans') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: null,
              error: { message: 'Plan not found' },
            }),
          }
        }
        return {}
      })

      const result = await deleteInstallment(planId)

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
      expect(mockTrackServerEvent).toHaveBeenCalledWith(
        userId,
        expect.stringContaining('INSTALLMENT_DELETE_FAILED'),
        expect.any(Object)
      )
    })

    it('should reject cross-user deletion attempt', async () => {
      const userId = 'user-123'
      const otherUserId = 'user-456'
      const planId = '00000000-0000-0000-0000-000000000001'

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: userId } },
      })

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'installment_plans') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: {
                id: planId,
                user_id: otherUserId, // Different user
              },
              error: null,
            }),
          }
        }
        return {}
      })

      const result = await deleteInstallment(planId)

      expect(result.success).toBe(false)
      expect(result.error).toContain('permissão')
    })
  })

  /**
   * Edge Cases
   */
  describe('Edge Cases', () => {
    it('should handle deletion with no paid transactions', async () => {
      const userId = 'user-123'
      const planId = '00000000-0000-0000-0000-000000000001'

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: userId } },
      })

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'installment_plans') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: {
                id: planId,
                user_id: userId,
              },
              error: null,
            }),
            delete: jest.fn().mockReturnThis().mockResolvedValue({
              data: null,
              error: null,
            }),
          }
        }
        if (table === 'installment_payments') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            not: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: [], // No paid transactions
              error: null,
            }),
          }
        }
        return {}
      })

      const result = await deleteInstallment(planId)

      expect(result.success).toBe(true)
    })
  })
})
