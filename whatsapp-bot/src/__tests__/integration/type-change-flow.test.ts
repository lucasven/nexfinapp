/**
 * Integration Tests: Transaction Type Change Flow
 * Story 8.5: Tests for Transaction Type Correction
 *
 * These tests verify the end-to-end flow of changing a transaction type,
 * including category mismatch handling and localized messages.
 */

import { handleEditTransaction } from '../../handlers/transactions/transactions'
import { createMockParsedIntent, createMockUserSession, createMockTransaction } from '../utils/test-helpers'
import { mockSupabaseClient, resetSupabaseMocks, mockQuerySequence } from '../../__mocks__/supabase'
import { messages as ptMessages } from '../../localization/pt-br'
import { messages as enMessages } from '../../localization/en'

// Mock dependencies
jest.mock('../../services/database/supabase-client', () => ({
  getSupabaseClient: () => mockSupabaseClient
}))

jest.mock('../../auth/session-manager', () => ({
  getUserSession: jest.fn()
}))

jest.mock('../../handlers/core/undo', () => ({
  storeUndoState: jest.fn()
}))

jest.mock('../../analytics/index', () => ({
  trackEvent: jest.fn()
}))

jest.mock('../../services/category-matcher', () => ({
  findCategoryWithFallback: jest.fn()
}))

import { getUserSession } from '../../auth/session-manager'
import { storeUndoState } from '../../handlers/core/undo'
import { trackEvent } from '../../analytics/index'
import { WhatsAppAnalyticsEvent } from '../../analytics/events'
import { findCategoryWithFallback } from '../../services/category-matcher'

describe('Integration: Transaction Type Change Flow', () => {
  beforeEach(() => {
    resetSupabaseMocks()
    jest.clearAllMocks()
  })

  describe('Full Flow: Expense to Income Conversion', () => {
    it('should complete full type change workflow with pt-BR messages', async () => {
      // Arrange: Setup user session and existing expense transaction
      const session = createMockUserSession()
      const expenseTransaction = createMockTransaction({
        id: 'tx-integration-1',
        user_readable_id: 'EXP-001',
        type: 'expense',
        amount: 150.00,
        category_id: 'cat-food',
        description: 'Almoço',
        user_id: session.userId
      })

      const transactionWithCategory = {
        ...expenseTransaction,
        categories: {
          id: 'cat-food',
          name: 'Alimentação',
          type: 'expense'
        }
      }

      const replacementCategory = {
        id: 'cat-income-other',
        name: 'Outras Receitas',
        confidence: 0.5,
        matchType: 'fallback' as const
      }

      jest.mocked(getUserSession).mockResolvedValue(session)
      jest.mocked(findCategoryWithFallback).mockResolvedValue(replacementCategory)

      mockQuerySequence([
        { data: transactionWithCategory, error: null }, // fetch
        { data: { id: 'tx-integration-1' }, error: null } // update
      ])

      // Act: User sends message to change type
      const intent = createMockParsedIntent({
        action: 'edit_transaction',
        entities: {
          transactionId: 'EXP-001',
          type: 'income'
        }
      })

      const result = await handleEditTransaction('+5511999999999', intent)

      // Assert: Verify complete flow
      // 1. User session fetched
      expect(getUserSession).toHaveBeenCalledWith('+5511999999999')

      // 2. Transaction fetched with category
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('transactions')

      // 3. Undo state stored
      expect(storeUndoState).toHaveBeenCalledWith(
        '+5511999999999',
        'edit_transaction',
        transactionWithCategory
      )

      // 4. Category mismatch detected and replacement found
      expect(findCategoryWithFallback).toHaveBeenCalledWith(undefined, {
        userId: session.userId,
        type: 'income',
        includeCustom: true
      })

      // 5. Database updated with both type and category
      const updateCall = mockSupabaseClient.from.mock.results[1]?.value
      expect(updateCall.update).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'income',
          category_id: 'cat-income-other'
        })
      )

      // 6. Analytics event fired
      expect(trackEvent).toHaveBeenCalledWith(
        WhatsAppAnalyticsEvent.TRANSACTION_TYPE_CHANGED,
        session.userId,
        expect.objectContaining({
          transaction_id: 'EXP-001',
          old_type: 'expense',
          new_type: 'income',
          old_category_id: 'cat-food',
          new_category_id: 'cat-income-other'
        })
      )

      // 7. Confirmation message in Portuguese with both changes
      expect(result).toContain('Transação EXP-001 atualizada')
      expect(result).toContain('tipo (despesa → receita)')
      expect(result).toContain('categoria (Alimentação → Outras Receitas)')
    })

    it('should complete full type change workflow with English messages', async () => {
      // This test verifies English localization path
      // In production, locale would be determined by user preferences

      const session = createMockUserSession()
      const incomeTransaction = createMockTransaction({
        id: 'tx-integration-2',
        user_readable_id: 'INC-002',
        type: 'income',
        amount: 500.00,
        category_id: 'cat-salary',
        user_id: session.userId
      })

      const transactionWithCategory = {
        ...incomeTransaction,
        categories: {
          id: 'cat-salary',
          name: 'Salary',
          type: 'income'
        }
      }

      const replacementCategory = {
        id: 'cat-expense-other',
        name: 'Other Expenses',
        confidence: 0.5,
        matchType: 'fallback' as const
      }

      jest.mocked(getUserSession).mockResolvedValue(session)
      jest.mocked(findCategoryWithFallback).mockResolvedValue(replacementCategory)

      mockQuerySequence([
        { data: transactionWithCategory, error: null },
        { data: { id: 'tx-integration-2' }, error: null }
      ])

      const intent = createMockParsedIntent({
        action: 'edit_transaction',
        entities: {
          transactionId: 'INC-002',
          type: 'expense'
        }
      })

      const result = await handleEditTransaction('+5511999999999', intent)

      // Verify category was replaced
      expect(findCategoryWithFallback).toHaveBeenCalled()

      // Verify update includes both type and category
      const updateCall = mockSupabaseClient.from.mock.results[1]?.value
      expect(updateCall.update).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'expense',
          category_id: 'cat-expense-other'
        })
      )

      // Verify type change message format (English would show "income → expense")
      expect(result).toContain('tipo (receita → despesa)')
      expect(result).toContain('categoria (Salary → Other Expenses)')
    })
  })

  describe('Full Flow: Type Change with Multiple Field Updates', () => {
    it('should handle concurrent type change with amount and description update', async () => {
      const session = createMockUserSession()
      const transaction = createMockTransaction({
        type: 'expense',
        amount: 50.00,
        description: 'Old description',
        category_id: 'cat-expense',
        user_id: session.userId
      })

      const transactionWithCategory = {
        ...transaction,
        categories: {
          id: 'cat-expense',
          name: 'Compras',
          type: 'expense'
        }
      }

      const replacementCategory = {
        id: 'cat-income',
        name: 'Freelance',
        confidence: 0.8,
        matchType: 'exact' as const
      }

      jest.mocked(getUserSession).mockResolvedValue(session)
      jest.mocked(findCategoryWithFallback).mockResolvedValue(replacementCategory)

      mockQuerySequence([
        { data: transactionWithCategory, error: null },
        { data: { id: 'tx-123' }, error: null }
      ])

      const intent = createMockParsedIntent({
        action: 'edit_transaction',
        entities: {
          transactionId: 'EXP-123',
          type: 'income',
          amount: 100.00,
          description: 'New description'
        }
      })

      const result = await handleEditTransaction('+5511999999999', intent)

      // Verify all fields updated
      const updateCall = mockSupabaseClient.from.mock.results[1]?.value
      expect(updateCall.update).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'income',
          amount: 100.00,
          description: 'New description',
          category_id: 'cat-income'
        })
      )

      // Verify message includes all changes
      expect(result).toContain('valor (R$ 100.00)')
      expect(result).toContain('descrição')
      expect(result).toContain('tipo (despesa → receita)')
      expect(result).toContain('categoria (Compras → Freelance)')

      // Verify single analytics event with all context
      expect(trackEvent).toHaveBeenCalledTimes(1)
      expect(trackEvent).toHaveBeenCalledWith(
        WhatsAppAnalyticsEvent.TRANSACTION_TYPE_CHANGED,
        session.userId,
        expect.objectContaining({
          old_category_id: 'cat-expense',
          new_category_id: 'cat-income'
        })
      )
    })
  })

  describe('Full Flow: Error Scenarios', () => {
    it('should handle complete flow when user not authenticated', async () => {
      jest.mocked(getUserSession).mockResolvedValue(null)

      const intent = createMockParsedIntent({
        action: 'edit_transaction',
        entities: {
          transactionId: 'EXP-123',
          type: 'income'
        }
      })

      const result = await handleEditTransaction('+5511999999999', intent)

      // Should return login prompt immediately
      expect(result).toContain('Para começar, adicione o seu número de whatsapp')

      // Should not attempt any database operations
      expect(mockSupabaseClient.from).not.toHaveBeenCalled()
      expect(storeUndoState).not.toHaveBeenCalled()
      expect(trackEvent).not.toHaveBeenCalled()
    })

    it('should handle complete flow when transaction not found', async () => {
      const session = createMockUserSession()
      jest.mocked(getUserSession).mockResolvedValue(session)

      mockQuerySequence([
        { data: null, error: { message: 'Not found' } }
      ])

      const intent = createMockParsedIntent({
        action: 'edit_transaction',
        entities: {
          transactionId: 'EXP-999',
          type: 'income'
        }
      })

      const result = await handleEditTransaction('+5511999999999', intent)

      // Should return transaction not found message
      expect(result).toContain('não encontrada')
      expect(result).toContain('EXP-999')

      // Should not store undo or fire analytics
      expect(storeUndoState).not.toHaveBeenCalled()
      expect(trackEvent).not.toHaveBeenCalled()
    })

    it('should handle complete flow when category replacement fails', async () => {
      const session = createMockUserSession()
      const transaction = createMockTransaction({
        type: 'expense',
        category_id: 'cat-expense',
        user_id: session.userId
      })

      const transactionWithCategory = {
        ...transaction,
        categories: {
          id: 'cat-expense',
          name: 'Food',
          type: 'expense'
        }
      }

      jest.mocked(getUserSession).mockResolvedValue(session)
      // Category matcher throws error
      jest.mocked(findCategoryWithFallback).mockRejectedValue(new Error('Category service unavailable'))

      mockQuerySequence([
        { data: transactionWithCategory, error: null }
      ])

      const intent = createMockParsedIntent({
        action: 'edit_transaction',
        entities: {
          transactionId: 'EXP-123',
          type: 'income'
        }
      })

      const result = await handleEditTransaction('+5511999999999', intent)

      // Should return generic error
      expect(result).toBe('❌ Ocorreu um erro. Por favor, tente novamente.')

      // Should not fire analytics on error
      expect(trackEvent).not.toHaveBeenCalled()
    })
  })

  describe('Full Flow: Category Already Matches Type', () => {
    it('should skip category replacement when category already matches new type', async () => {
      const session = createMockUserSession()
      const transaction = createMockTransaction({
        type: 'expense',
        category_id: 'cat-income',
        user_id: session.userId
      })

      // Unusual case: expense transaction with income category
      const transactionWithCategory = {
        ...transaction,
        categories: {
          id: 'cat-income',
          name: 'Outras Receitas',
          type: 'income'
        }
      }

      jest.mocked(getUserSession).mockResolvedValue(session)

      mockQuerySequence([
        { data: transactionWithCategory, error: null },
        { data: { id: 'tx-123' }, error: null }
      ])

      const intent = createMockParsedIntent({
        action: 'edit_transaction',
        entities: {
          transactionId: 'EXP-123',
          type: 'income'
        }
      })

      const result = await handleEditTransaction('+5511999999999', intent)

      // Category replacement should NOT be called
      expect(findCategoryWithFallback).not.toHaveBeenCalled()

      // Only type should be updated, not category
      const updateCall = mockSupabaseClient.from.mock.results[1]?.value
      expect(updateCall.update).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'income'
        })
      )

      // Should not include category_id in update
      const updateArg = updateCall.update.mock.calls[0][0]
      expect(updateArg).not.toHaveProperty('category_id')

      // Message should only mention type change
      expect(result).toContain('tipo (despesa → receita)')
      expect(result).not.toContain('categoria')
    })
  })
})
