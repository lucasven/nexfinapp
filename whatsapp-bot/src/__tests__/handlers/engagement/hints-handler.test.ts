/**
 * Hints Handler Tests
 *
 * Story 2.6: Contextual Hints After Actions
 *
 * Tests:
 * - AC-2.6.1: First expense includes category creation hint
 * - AC-2.6.2: 3+ expenses in same category includes budget hint
 * - AC-2.6.3: Tier 2+ users get NO basic hints
 * - AC-2.6.4: Opted-out users get NO hints
 * - AC-2.6.5: Hints are appended (tested via integration)
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { getContextualHint, isFirstExpense } from '../../../handlers/engagement/hints-handler'
import {
  mockSupabaseClient,
  resetSupabaseMocks,
  mockQuerySequence,
  mockQuerySuccess,
} from '../../../__mocks__/supabase'

// Mock the supabase client
jest.mock('../../../services/database/supabase-client', () => ({
  getSupabaseClient: () => mockSupabaseClient,
}))

// Mock the logger
jest.mock('../../../services/monitoring/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}))

// Mock messages
const mockMessages = {
  engagementHintFirstExpenseCategory: '💡 Want to create custom categories?',
  engagementHintBudgetSuggestion: (count: number, category: string) =>
    `💡 You have ${count} expenses in ${category}. Want to set a budget?`,
}

describe('Hints Handler - Story 2.6', () => {
  beforeEach(() => {
    resetSupabaseMocks()
  })

  describe('getContextualHint', () => {
    it('should return first expense category hint for new user (AC-2.6.1)', async () => {
      const userId = 'user-new'

      // Mock: user profile with tier 0 and tips enabled
      mockQuerySequence([
        {
          data: { onboarding_tier: 0, tips_opt_out: false, magic_moment_at: null },
          error: null,
        },
      ])

      const result = await getContextualHint(
        userId,
        {
          action: 'add_expense',
          isFirstExpense: true,
        },
        mockMessages
      )

      expect(result).toContain('💡 Want to create custom categories?')
    })

    it('should return budget suggestion hint for 3+ expenses in same category (AC-2.6.2)', async () => {
      const userId = 'user-regular'
      const categoryId = 'cat-food'

      // Mock sequence:
      // 1. User profile fetch - tier 0, tips enabled
      // 2. Category expense count - 3+ expenses
      mockQuerySequence([
        {
          data: { onboarding_tier: 0, tips_opt_out: false, magic_moment_at: new Date().toISOString() },
          error: null,
        },
        {
          data: null,
          error: null,
          count: 4, // 4 expenses in this category
        },
      ])

      // Need to mock count query differently
      mockSupabaseClient.from.mockImplementation(() => {
        const callIndex = mockSupabaseClient.from.mock.calls.length
        if (callIndex === 1) {
          // First call - user_profiles
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockReturnThis(),
            then: jest.fn((resolve) =>
              resolve({
                data: { onboarding_tier: 0, tips_opt_out: false, magic_moment_at: new Date().toISOString() },
                error: null,
              })
            ),
          }
        } else {
          // Second call - transactions count
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            gte: jest.fn().mockReturnThis(),
            then: jest.fn((resolve) =>
              resolve({
                count: 4,
                error: null,
              })
            ),
          }
        }
      })

      const result = await getContextualHint(
        userId,
        {
          action: 'add_expense',
          categoryId: categoryId,
          categoryName: 'Food',
          isFirstExpense: false,
        },
        mockMessages
      )

      expect(result).toContain('💡 You have 4 expenses in Food')
    })

    it('should return null for Tier 2+ users (AC-2.6.3)', async () => {
      const userId = 'user-advanced'

      // Mock: user profile with tier 2
      mockQuerySuccess({ onboarding_tier: 2, tips_opt_out: false, magic_moment_at: new Date().toISOString() })

      const result = await getContextualHint(
        userId,
        {
          action: 'add_expense',
          isFirstExpense: true,
        },
        mockMessages
      )

      expect(result).toBeNull()
    })

    it('should return null for opted-out users (AC-2.6.4)', async () => {
      const userId = 'user-opted-out'

      // Mock: user profile with tips_opt_out = true
      mockQuerySuccess({ onboarding_tier: 0, tips_opt_out: true, magic_moment_at: null })

      const result = await getContextualHint(
        userId,
        {
          action: 'add_expense',
          isFirstExpense: true,
        },
        mockMessages
      )

      expect(result).toBeNull()
    })

    it('should return null for non-expense actions', async () => {
      const userId = 'user-other'

      // Mock: user profile
      mockQuerySuccess({ onboarding_tier: 0, tips_opt_out: false, magic_moment_at: null })

      const result = await getContextualHint(
        userId,
        {
          action: 'add_income', // Not an expense
          isFirstExpense: false,
        },
        mockMessages
      )

      expect(result).toBeNull()
    })

    it('should return null when category count is less than 3', async () => {
      const userId = 'user-few'

      // Tier 0 user, not first expense, but only 2 expenses in category
      mockSupabaseClient.from.mockImplementation(() => {
        const callIndex = mockSupabaseClient.from.mock.calls.length
        if (callIndex === 1) {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockReturnThis(),
            then: jest.fn((resolve) =>
              resolve({
                data: { onboarding_tier: 0, tips_opt_out: false, magic_moment_at: new Date().toISOString() },
                error: null,
              })
            ),
          }
        } else {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            gte: jest.fn().mockReturnThis(),
            then: jest.fn((resolve) =>
              resolve({
                count: 2, // Only 2 expenses
                error: null,
              })
            ),
          }
        }
      })

      const result = await getContextualHint(
        userId,
        {
          action: 'add_expense',
          categoryId: 'cat-test',
          categoryName: 'Test',
          isFirstExpense: false,
        },
        mockMessages
      )

      expect(result).toBeNull()
    })

    it('should handle database errors gracefully', async () => {
      const userId = 'user-error'

      // Mock: database error
      mockSupabaseClient.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockReturnThis(),
        then: jest.fn((resolve) =>
          resolve({
            data: null,
            error: { message: 'Database error', code: 'PGRST000' },
          })
        ),
      })

      const result = await getContextualHint(
        userId,
        {
          action: 'add_expense',
          isFirstExpense: true,
        },
        mockMessages
      )

      // Should return null (fail silently)
      expect(result).toBeNull()
    })
  })

  describe('isFirstExpense', () => {
    it('should return true when count is 1', async () => {
      const userId = 'user-first'

      mockSupabaseClient.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        then: jest.fn((resolve) =>
          resolve({
            count: 1,
            error: null,
          })
        ),
      })

      const result = await isFirstExpense(userId)

      expect(result).toBe(true)
    })

    it('should return false when count is greater than 1', async () => {
      const userId = 'user-many'

      mockSupabaseClient.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        then: jest.fn((resolve) =>
          resolve({
            count: 5,
            error: null,
          })
        ),
      })

      const result = await isFirstExpense(userId)

      expect(result).toBe(false)
    })

    it('should return false on database error', async () => {
      const userId = 'user-error'

      mockSupabaseClient.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        then: jest.fn((resolve) =>
          resolve({
            count: null,
            error: { message: 'DB error' },
          })
        ),
      })

      const result = await isFirstExpense(userId)

      expect(result).toBe(false)
    })
  })
})
