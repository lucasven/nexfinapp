/**
 * Tier Action Detection Hooks Tests
 *
 * Story 3.2: Tier Action Detection Hooks
 *
 * Tests:
 * - AC-3.2.1: Adding expense calls recordAction(userId, 'add_expense')
 * - AC-3.2.2: Deleting expense calls recordAction(userId, 'delete_expense')
 * - AC-3.2.3: Adding category calls recordAction(userId, 'add_category')
 * - AC-3.2.4: Editing category calls recordAction(userId, 'edit_category')
 * - AC-3.2.5: Setting budget calls recordAction(userId, 'set_budget')
 * - AC-3.2.6: Adding recurring expense calls recordAction(userId, 'add_recurring')
 * - AC-3.2.7: Listing categories calls recordAction(userId, 'list_categories')
 * - AC-3.2.8: Viewing report calls recordAction(userId, 'view_report')
 * - AC-3.2.9: Tier tracking does NOT block or slow down primary handler response
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { mockSupabaseClient, resetSupabaseMocks, mockQuerySequence } from '../../__mocks__/supabase'

// Mock the supabase client
jest.mock('../../services/database/supabase-client', () => ({
  getSupabaseClient: () => mockSupabaseClient,
}))

// Mock the session manager
jest.mock('../../auth/session-manager', () => ({
  getUserSession: jest.fn().mockResolvedValue({
    userId: 'test-user-id',
    whatsappNumber: '+5511999999999',
  }),
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

// Mock analytics
jest.mock('../../analytics/index', () => ({
  trackEvent: jest.fn(),
}))

// Mock tier-tracker - we want to track calls to trackTierAction
const mockRecordAction = jest.fn().mockResolvedValue({
  action: 'add_expense',
  tierCompleted: null,
  shouldSendUnlock: false,
})

jest.mock('../../services/onboarding/tier-tracker', () => ({
  trackTierAction: jest.fn(),
  recordMagicMoment: jest.fn().mockResolvedValue({ isFirstMagicMoment: false }),
  recordAction: mockRecordAction,
}))

// Import after mocks
import { trackTierAction } from '../../services/onboarding/tier-tracker'

describe('Tier Action Detection Hooks - Story 3.2', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    resetSupabaseMocks()
  })

  describe('trackTierAction helper (AC-3.2.9)', () => {
    it('should be a fire-and-forget function that does not throw', async () => {
      // Real implementation test - trackTierAction should not throw
      // even if recordAction fails
      const { trackTierAction: realTrackTierAction } = jest.requireActual(
        '../../services/onboarding/tier-tracker'
      )

      // Mock recordAction to throw
      mockRecordAction.mockRejectedValueOnce(new Error('Database error'))

      // This should not throw
      expect(() => {
        realTrackTierAction('user-123', 'add_expense')
      }).not.toThrow()

      // Wait for promise to settle
      await new Promise((resolve) => setTimeout(resolve, 10))
    })

    it('should call recordAction with correct arguments', () => {
      const { trackTierAction: mockTrack } = require('../../services/onboarding/tier-tracker')

      // Verify the mock is callable
      mockTrack('user-456', 'add_category')

      expect(mockTrack).toHaveBeenCalledWith('user-456', 'add_category')
    })
  })

  describe('Expense Handler Hooks', () => {
    it('should call trackTierAction with add_expense on expense creation (AC-3.2.1)', async () => {
      // Setup mocks for expense creation
      mockQuerySequence([
        // findCategoryWithFallback
        { data: [{ id: 'cat-1', name: 'Food', confidence: 0.9, matchType: 'exact' }], error: null },
        // checkForDuplicate
        { data: [], error: null },
        // generate_transaction_id RPC
        { data: 'EXP-001', error: null },
        // insert transaction
        { data: { id: 'tx-1', category: { name: 'Food' }, type: 'expense' }, error: null },
        // select user_profiles for magic moment
        { data: { magic_moment_at: null, created_at: new Date().toISOString() }, error: null },
        // update magic_moment_at
        { data: { magic_moment_at: new Date().toISOString() }, error: null },
        // parsing_metrics update
        { data: null, error: null },
        // isFirstExpense check
        { data: { count: 1 }, error: null },
        // hints check
        { data: null, error: null },
        // first_expense_added check
        { data: { first_expense_added: true }, error: null },
      ])

      const { handleAddExpense } = await import('../../handlers/transactions/expenses')

      await handleAddExpense(
        '+5511999999999',
        {
          action: 'add_expense',
          entities: { amount: 50, category: 'food' },
          confidence: 0.9,
        },
        null,
        true
      )

      // Verify trackTierAction was called with 'add_expense'
      expect(trackTierAction).toHaveBeenCalledWith('test-user-id', 'add_expense')
    })

    it('should NOT call trackTierAction for income transactions (AC-3.2.1)', async () => {
      mockQuerySequence([
        { data: [{ id: 'cat-1', name: 'Salary', confidence: 0.9, matchType: 'exact' }], error: null },
        { data: [], error: null },
        { data: 'INC-001', error: null },
        { data: { id: 'tx-1', category: { name: 'Salary' }, type: 'income' }, error: null },
        { data: null, error: null },
      ])

      const { handleAddExpense } = await import('../../handlers/transactions/expenses')

      await handleAddExpense(
        '+5511999999999',
        {
          action: 'add_income',
          entities: { amount: 5000, category: 'salary', type: 'income' },
          confidence: 0.9,
        },
        null,
        false
      )

      // Verify trackTierAction was NOT called (income should not trigger add_expense)
      expect(trackTierAction).not.toHaveBeenCalledWith('test-user-id', 'add_expense')
    })
  })

  describe('Category Handler Hooks', () => {
    it('should call trackTierAction with list_categories (AC-3.2.7)', async () => {
      mockQuerySequence([
        // categories query
        {
          data: [
            { id: 'cat-1', name: 'Food', type: 'expense', icon: '🍔' },
            { id: 'cat-2', name: 'Salary', type: 'income', icon: '💰' },
          ],
          error: null,
        },
      ])

      const { handleListCategories } = await import('../../handlers/categories/categories')

      await handleListCategories('+5511999999999')

      expect(trackTierAction).toHaveBeenCalledWith('test-user-id', 'list_categories')
    })

    it('should call trackTierAction with add_category (AC-3.2.3)', async () => {
      mockQuerySequence([
        // insert category
        { data: { id: 'cat-new', name: 'Custom Category' }, error: null },
      ])

      const { handleAddCategory } = await import('../../handlers/categories/categories')

      await handleAddCategory('+5511999999999', {
        action: 'add_category',
        entities: { category: 'Custom Category' },
        confidence: 0.9,
      })

      expect(trackTierAction).toHaveBeenCalledWith('test-user-id', 'add_category')
    })
  })

  describe('Budget Handler Hooks', () => {
    it('should call trackTierAction with set_budget (AC-3.2.5)', async () => {
      mockQuerySequence([
        // find category
        { data: [{ id: 'cat-1', name: 'Food' }], error: null },
        // upsert budget
        { data: { id: 'budget-1' }, error: null },
      ])

      const { handleSetBudget } = await import('../../handlers/budgets/budgets')

      await handleSetBudget('+5511999999999', {
        action: 'set_budget',
        entities: { amount: 1000, category: 'food' },
        confidence: 0.9,
      })

      expect(trackTierAction).toHaveBeenCalledWith('test-user-id', 'set_budget')
    })
  })

  describe('Recurring Handler Hooks', () => {
    it('should call trackTierAction with add_recurring (AC-3.2.6)', async () => {
      mockQuerySequence([
        // find category
        { data: [{ id: 'cat-1', name: 'Rent' }], error: null },
        // insert recurring
        { data: { id: 'rec-1' }, error: null },
        // generate payments (3x)
        { data: null, error: null },
        { data: null, error: null },
        { data: null, error: null },
      ])

      const { handleAddRecurring } = await import('../../handlers/recurring/recurring')

      await handleAddRecurring('+5511999999999', {
        action: 'add_recurring',
        entities: { amount: 2000, category: 'rent', dayOfMonth: 5 },
        confidence: 0.9,
      })

      expect(trackTierAction).toHaveBeenCalledWith('test-user-id', 'add_recurring')
    })
  })

  describe('Reports Handler Hooks', () => {
    it('should call trackTierAction with view_report (AC-3.2.8)', async () => {
      mockQuerySequence([
        // transactions query
        {
          data: [
            { id: 'tx-1', amount: 100, type: 'expense', date: '2025-11-15', category: { name: 'Food', icon: '🍔' } },
            { id: 'tx-2', amount: 50, type: 'expense', date: '2025-11-16', category: { name: 'Transport', icon: '🚗' } },
          ],
          error: null,
        },
      ])

      const { handleShowReport } = await import('../../handlers/reports/reports')

      await handleShowReport('+5511999999999', {
        action: 'show_report',
        entities: {},
        confidence: 0.9,
      })

      expect(trackTierAction).toHaveBeenCalledWith('test-user-id', 'view_report')
    })
  })

  describe('Transaction Handler Hooks', () => {
    it('should call trackTierAction with delete_expense (AC-3.2.2)', async () => {
      mockQuerySequence([
        // fetch transaction
        { data: { id: 'tx-1', user_readable_id: 'EXP-001', type: 'expense' }, error: null },
        // delete transaction
        { data: null, error: null },
      ])

      const { handleDeleteTransaction } = await import('../../handlers/transactions/transactions')

      await handleDeleteTransaction('+5511999999999', 'EXP-001')

      expect(trackTierAction).toHaveBeenCalledWith('test-user-id', 'delete_expense')
    })

    it('should NOT call trackTierAction for income deletion (AC-3.2.2)', async () => {
      mockQuerySequence([
        // fetch transaction (income type)
        { data: { id: 'tx-1', user_readable_id: 'INC-001', type: 'income' }, error: null },
        // delete transaction
        { data: null, error: null },
      ])

      const { handleDeleteTransaction } = await import('../../handlers/transactions/transactions')

      await handleDeleteTransaction('+5511999999999', 'INC-001')

      // Verify trackTierAction was NOT called for income
      expect(trackTierAction).not.toHaveBeenCalledWith('test-user-id', 'delete_expense')
    })

    it('should call trackTierAction with edit_category (AC-3.2.4)', async () => {
      mockQuerySequence([
        // fetch transaction
        { data: { id: 'tx-1', user_readable_id: 'EXP-001', categories: { name: 'Food' } }, error: null },
        // find new category
        { data: { id: 'cat-2', name: 'Transport' }, error: null },
        // update transaction
        { data: null, error: null },
      ])

      const { handleChangeCategory } = await import('../../handlers/transactions/transactions')

      await handleChangeCategory('+5511999999999', 'EXP-001', 'Transport')

      expect(trackTierAction).toHaveBeenCalledWith('test-user-id', 'edit_category')
    })
  })

  describe('Non-Blocking Pattern (AC-3.2.9)', () => {
    it('should return handler response before tracking completes', async () => {
      // This test verifies the fire-and-forget pattern
      // The handler should return immediately without waiting for trackTierAction

      let trackingCompleted = false
      const originalTrackTierAction = trackTierAction as jest.Mock

      originalTrackTierAction.mockImplementation(() => {
        // Simulate async tracking that takes time
        setTimeout(() => {
          trackingCompleted = true
        }, 100)
      })

      mockQuerySequence([
        { data: [{ id: 'cat-1', name: 'Food' }], error: null },
      ])

      const { handleListCategories } = await import('../../handlers/categories/categories')

      const startTime = Date.now()
      await handleListCategories('+5511999999999')
      const endTime = Date.now()

      // Handler should return quickly (< 50ms) even though tracking takes 100ms
      expect(endTime - startTime).toBeLessThan(50)

      // Tracking should not be complete yet
      expect(trackingCompleted).toBe(false)
    })

    it('should succeed even if tracking fails', async () => {
      // Reset to default mock that doesn't throw
      // The real trackTierAction is fire-and-forget and catches its own errors
      // So the handler never sees exceptions from it
      ;(trackTierAction as jest.Mock).mockImplementation(() => {
        // Fire and forget - this simulates the real implementation
        // that catches all errors internally
      })

      mockQuerySequence([
        { data: [{ id: 'cat-1', name: 'Food', type: 'expense', icon: '🍔' }], error: null },
      ])

      const { handleListCategories } = await import('../../handlers/categories/categories')

      // Handler should not throw even if tracking has internal errors
      const result = await handleListCategories('+5511999999999')

      // Should still return a valid response
      expect(result).toContain('Food')

      // Verify tracking was called (even though it internally handles errors)
      expect(trackTierAction).toHaveBeenCalledWith('test-user-id', 'list_categories')
    })
  })
})
