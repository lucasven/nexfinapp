/**
 * Transaction Management Handler Tests
 * Story 8.1: Support Transaction Type Change in Edit Handler
 */

import { handleEditTransaction } from '../../../handlers/transactions/transactions'
import { createMockParsedIntent, createMockUserSession, createMockTransaction } from '../../utils/test-helpers'
import { mockSupabaseClient, resetSupabaseMocks, mockQuerySequence } from '../../../__mocks__/supabase'

// Mock dependencies
jest.mock('../../../services/database/supabase-client', () => ({
  getSupabaseClient: () => mockSupabaseClient
}))

jest.mock('../../../auth/session-manager', () => ({
  getUserSession: jest.fn()
}))

jest.mock('../../../handlers/core/undo', () => ({
  storeUndoState: jest.fn()
}))

jest.mock('../../../analytics/index', () => ({
  trackEvent: jest.fn()
}))

jest.mock('../../../services/category-matcher', () => ({
  findCategoryWithFallback: jest.fn()
}))

jest.mock('../../../localization/pt-br', () => ({
  messages: {
    loginPrompt: 'Faça login para continuar',
    correctionTransactionNotFound: (id: string) => `Transação ${id} não encontrada`,
    correctionNoChanges: 'Nenhuma alteração detectada',
    genericError: 'Erro ao processar solicitação',
    transactionEdited: (id: string, fields: string) => `Transação ${id} editada: ${fields}`,
    transactionTypeChanged: (oldType: 'income' | 'expense', newType: 'income' | 'expense') => {
      const oldLabel = oldType === 'expense' ? 'despesa' : 'receita'
      const newLabel = newType === 'expense' ? 'despesa' : 'receita'
      return `tipo (${oldLabel} → ${newLabel})`
    },
    categoryChanged: (oldCategory: string, newCategory: string) =>
      `categoria (${oldCategory} → ${newCategory})`
  }
}))

import { getUserSession } from '../../../auth/session-manager'
import { storeUndoState } from '../../../handlers/core/undo'
import { trackEvent } from '../../../analytics/index'
import { WhatsAppAnalyticsEvent } from '../../../analytics/events'
import { findCategoryWithFallback } from '../../../services/category-matcher'

describe('handleEditTransaction - Type Change Support', () => {
  beforeEach(() => {
    resetSupabaseMocks()
    jest.clearAllMocks()
  })

  describe('TC-8.1.1: Edit transaction type from expense to income', () => {
    it('should update type from expense to income and fire analytics event', async () => {
      const session = createMockUserSession()
      const existingTransaction = createMockTransaction({
        id: 'tx-123',
        user_readable_id: 'EXP-123',
        type: 'expense',
        amount: 50.00,
        user_id: session.userId
      })

      jest.mocked(getUserSession).mockResolvedValue(session)

      // Mock query sequence: fetch transaction, then update
      mockQuerySequence([
        { data: existingTransaction, error: null }, // fetch
        { data: { id: 'tx-123' }, error: null } // update
      ])

      const intent = createMockParsedIntent({
        action: 'edit_transaction',
        entities: {
          transactionId: 'EXP-123',
          type: 'income'
        }
      })

      const result = await handleEditTransaction('+5511999999999', intent)

      // AC-8.1.1: Verify type updated to income
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('transactions')
      const updateCall = mockSupabaseClient.from.mock.results[1]?.value
      expect(updateCall.update).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'income' })
      )

      // AC-8.1.3: Verify undo state stored
      expect(storeUndoState).toHaveBeenCalledWith(
        '+5511999999999',
        'edit_transaction',
        existingTransaction
      )

      // AC-8.1.4: Verify changedFields includes type change
      expect(result).toContain('tipo (despesa → receita)')

      // AC-8.1.5: Verify analytics event fired
      expect(trackEvent).toHaveBeenCalledWith(
        WhatsAppAnalyticsEvent.TRANSACTION_TYPE_CHANGED,
        session.userId,
        expect.objectContaining({
          transaction_id: 'EXP-123',
          old_type: 'expense',
          new_type: 'income'
        })
      )
    })
  })

  describe('TC-8.1.2: Edit transaction type from income to expense', () => {
    it('should update type from income to expense', async () => {
      const session = createMockUserSession()
      const existingTransaction = createMockTransaction({
        id: 'tx-456',
        user_readable_id: 'INC-456',
        type: 'income',
        amount: 1000.00,
        user_id: session.userId
      })

      jest.mocked(getUserSession).mockResolvedValue(session)

      mockQuerySequence([
        { data: existingTransaction, error: null }, // fetch
        { data: { id: 'tx-456' }, error: null } // update
      ])

      const intent = createMockParsedIntent({
        action: 'edit_transaction',
        entities: {
          transactionId: 'INC-456',
          type: 'expense'
        }
      })

      const result = await handleEditTransaction('+5511999999999', intent)

      // AC-8.1.2: Verify type updated to expense
      const updateCall = mockSupabaseClient.from.mock.results[1]?.value
      expect(updateCall.update).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'expense' })
      )

      // AC-8.1.3: Verify undo state stored
      expect(storeUndoState).toHaveBeenCalled()

      // AC-8.1.4: Verify changedFields includes type change
      expect(result).toContain('tipo (receita → despesa)')

      // AC-8.1.5: Verify analytics event fired
      expect(trackEvent).toHaveBeenCalledWith(
        WhatsAppAnalyticsEvent.TRANSACTION_TYPE_CHANGED,
        session.userId,
        expect.objectContaining({
          old_type: 'income',
          new_type: 'expense'
        })
      )
    })
  })

  describe('TC-8.1.3: Edit transaction with type but no actual change', () => {
    it('should return no changes message when type is same', async () => {
      const session = createMockUserSession()
      const existingTransaction = createMockTransaction({
        id: 'tx-789',
        user_readable_id: 'EXP-789',
        type: 'expense',
        amount: 75.00,
        user_id: session.userId
      })

      jest.mocked(getUserSession).mockResolvedValue(session)

      mockQuerySequence([
        { data: existingTransaction, error: null } // fetch only, no update
      ])

      const intent = createMockParsedIntent({
        action: 'edit_transaction',
        entities: {
          transactionId: 'EXP-789',
          type: 'expense' // same as current
        }
      })

      const result = await handleEditTransaction('+5511999999999', intent)

      // AC-8.1.4: Should return no changes message
      expect(result).toBe('Nenhuma alteração detectada')

      // Should not call update
      expect(mockSupabaseClient.from).toHaveBeenCalledTimes(1) // only fetch

      // Should not fire analytics event
      expect(trackEvent).not.toHaveBeenCalled()
    })
  })

  describe('TC-8.1.4: Edit transaction with type and other fields', () => {
    it('should update both type and amount, showing both in changedFields', async () => {
      const session = createMockUserSession()
      const existingTransaction = createMockTransaction({
        id: 'tx-abc',
        user_readable_id: 'EXP-ABC',
        type: 'expense',
        amount: 50.00,
        user_id: session.userId
      })

      jest.mocked(getUserSession).mockResolvedValue(session)

      mockQuerySequence([
        { data: existingTransaction, error: null }, // fetch
        { data: { id: 'tx-abc' }, error: null } // update
      ])

      const intent = createMockParsedIntent({
        action: 'edit_transaction',
        entities: {
          transactionId: 'EXP-ABC',
          type: 'income',
          amount: 75.00
        }
      })

      const result = await handleEditTransaction('+5511999999999', intent)

      // AC-8.1.4: Both fields should be in updates
      const updateCall = mockSupabaseClient.from.mock.results[1]?.value
      expect(updateCall.update).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'income',
          amount: 75.00
        })
      )

      // Both changes should be in result message
      expect(result).toContain('valor (R$ 75.00)')
      expect(result).toContain('tipo (despesa → receita)')

      // Analytics event should still fire for type change
      expect(trackEvent).toHaveBeenCalledWith(
        WhatsAppAnalyticsEvent.TRANSACTION_TYPE_CHANGED,
        session.userId,
        expect.anything()
      )
    })
  })

  describe('TC-8.1.5: Analytics event fired on type change', () => {
    it('should fire analytics event with correct properties', async () => {
      const session = createMockUserSession({ userId: 'user-xyz' })
      const existingTransaction = createMockTransaction({
        id: 'tx-analytics',
        user_readable_id: 'EXP-A1',
        type: 'expense',
        user_id: session.userId
      })

      jest.mocked(getUserSession).mockResolvedValue(session)

      mockQuerySequence([
        { data: existingTransaction, error: null },
        { data: { id: 'tx-analytics' }, error: null }
      ])

      const intent = createMockParsedIntent({
        action: 'edit_transaction',
        entities: {
          transactionId: 'EXP-A1',
          type: 'income'
        }
      })

      await handleEditTransaction('+5511999999999', intent)

      // AC-8.1.5: Verify exact analytics event structure
      expect(trackEvent).toHaveBeenCalledTimes(1)
      expect(trackEvent).toHaveBeenCalledWith(
        WhatsAppAnalyticsEvent.TRANSACTION_TYPE_CHANGED,
        'user-xyz',
        {
          transaction_id: 'EXP-A1',
          old_type: 'expense',
          new_type: 'income'
        }
      )
    })
  })

  describe('Edge Cases', () => {
    it('should handle invalid type value by attempting update', async () => {
      const session = createMockUserSession()
      const existingTransaction = createMockTransaction({
        type: 'expense',
        user_id: session.userId
      })

      jest.mocked(getUserSession).mockResolvedValue(session)

      mockQuerySequence([
        { data: existingTransaction, error: null }, // fetch
        { data: null, error: { message: 'Invalid type value', code: '23514' } } // update fails with check constraint
      ])

      const intent = createMockParsedIntent({
        action: 'edit_transaction',
        entities: {
          transactionId: 'EXP-123',
          type: 'invalid_type' as any
        }
      })

      const result = await handleEditTransaction('+5511999999999', intent)

      // Should return generic error when database rejects invalid type
      expect(result).toBe('Erro ao processar solicitação')
      expect(trackEvent).not.toHaveBeenCalled()
    })

    it('should return error when user not authenticated', async () => {
      jest.mocked(getUserSession).mockResolvedValue(null)

      const intent = createMockParsedIntent({
        action: 'edit_transaction',
        entities: {
          transactionId: 'EXP-123',
          type: 'income'
        }
      })

      const result = await handleEditTransaction('+5511999999999', intent)

      expect(result).toBe('Faça login para continuar')
      expect(storeUndoState).not.toHaveBeenCalled()
      expect(trackEvent).not.toHaveBeenCalled()
    })

    it('should return error when transaction not found', async () => {
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

      expect(result).toContain('não encontrada')
      expect(trackEvent).not.toHaveBeenCalled()
    })

    it('should return error when database update fails', async () => {
      const session = createMockUserSession()
      const existingTransaction = createMockTransaction({
        type: 'expense'
      })

      jest.mocked(getUserSession).mockResolvedValue(session)

      mockQuerySequence([
        { data: existingTransaction, error: null }, // fetch succeeds
        { data: null, error: { message: 'Update failed' } } // update fails
      ])

      const intent = createMockParsedIntent({
        action: 'edit_transaction',
        entities: {
          transactionId: 'EXP-123',
          type: 'income'
        }
      })

      const result = await handleEditTransaction('+5511999999999', intent)

      expect(result).toBe('Erro ao processar solicitação')
      // Analytics should not fire if update failed
      expect(trackEvent).not.toHaveBeenCalled()
    })

    it('should not fire analytics event when type not changed', async () => {
      const session = createMockUserSession()
      const existingTransaction = createMockTransaction({
        type: 'expense',
        amount: 50.00
      })

      jest.mocked(getUserSession).mockResolvedValue(session)

      mockQuerySequence([
        { data: existingTransaction, error: null },
        { data: { id: 'tx-123' }, error: null }
      ])

      const intent = createMockParsedIntent({
        action: 'edit_transaction',
        entities: {
          transactionId: 'EXP-123',
          amount: 75.00 // only amount changed, not type
        }
      })

      await handleEditTransaction('+5511999999999', intent)

      // Should update successfully but not fire type change event
      expect(trackEvent).not.toHaveBeenCalled()
    })
  })
})

describe('handleEditTransaction - Category Mismatch Handling (Story 8.3)', () => {
  beforeEach(() => {
    resetSupabaseMocks()
    jest.clearAllMocks()
  })

  describe('TC-8.3.1: Expense category to income type change', () => {
    it('should replace expense category with income category when type changes to income', async () => {
      const session = createMockUserSession()
      const existingTransaction = createMockTransaction({
        id: 'tx-123',
        user_readable_id: 'EXP-123',
        type: 'expense',
        amount: 50.00,
        category_id: 'cat-expense-1',
        user_id: session.userId
      })

      // Add category info to transaction (from JOIN)
      const transactionWithCategory = {
        ...existingTransaction,
        categories: {
          id: 'cat-expense-1',
          name: 'Alimentação',
          type: 'expense'
        }
      }

      const replacementCategory = {
        id: 'cat-income-1',
        name: 'Outras Receitas',
        confidence: 0.5,
        matchType: 'fallback' as const
      }

      jest.mocked(getUserSession).mockResolvedValue(session)
      jest.mocked(findCategoryWithFallback).mockResolvedValue(replacementCategory)

      mockQuerySequence([
        { data: transactionWithCategory, error: null }, // fetch with category
        { data: { id: 'tx-123' }, error: null } // update
      ])

      const intent = createMockParsedIntent({
        action: 'edit_transaction',
        entities: {
          transactionId: 'EXP-123',
          type: 'income'
        }
      })

      const result = await handleEditTransaction('+5511999999999', intent)

      // AC-8.3.1: Verify category replacement was called
      expect(findCategoryWithFallback).toHaveBeenCalledWith(undefined, {
        userId: session.userId,
        type: 'income',
        includeCustom: true
      })

      // AC-8.3.1: Verify both type and category_id updated
      const updateCall = mockSupabaseClient.from.mock.results[1]?.value
      expect(updateCall.update).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'income',
          category_id: 'cat-income-1'
        })
      )

      // AC-8.3.1: Verify user notification includes both changes
      expect(result).toContain('tipo (despesa → receita)')
      expect(result).toContain('categoria (Alimentação → Outras Receitas)')

      // Verify analytics includes category change
      expect(trackEvent).toHaveBeenCalledWith(
        WhatsAppAnalyticsEvent.TRANSACTION_TYPE_CHANGED,
        session.userId,
        expect.objectContaining({
          old_category_id: 'cat-expense-1',
          new_category_id: 'cat-income-1'
        })
      )
    })
  })

  describe('TC-8.3.2: Income category to expense type change', () => {
    it('should replace income category with expense category when type changes to expense', async () => {
      const session = createMockUserSession()
      const existingTransaction = createMockTransaction({
        id: 'tx-456',
        user_readable_id: 'INC-456',
        type: 'income',
        amount: 1000.00,
        category_id: 'cat-income-salary',
        user_id: session.userId
      })

      const transactionWithCategory = {
        ...existingTransaction,
        categories: {
          id: 'cat-income-salary',
          name: 'Salário',
          type: 'income'
        }
      }

      const replacementCategory = {
        id: 'cat-expense-default',
        name: 'Outros Gastos',
        confidence: 0.5,
        matchType: 'fallback' as const
      }

      jest.mocked(getUserSession).mockResolvedValue(session)
      jest.mocked(findCategoryWithFallback).mockResolvedValue(replacementCategory)

      mockQuerySequence([
        { data: transactionWithCategory, error: null },
        { data: { id: 'tx-456' }, error: null }
      ])

      const intent = createMockParsedIntent({
        action: 'edit_transaction',
        entities: {
          transactionId: 'INC-456',
          type: 'expense'
        }
      })

      const result = await handleEditTransaction('+5511999999999', intent)

      // AC-8.3.2: Verify category replacement for expense type
      expect(findCategoryWithFallback).toHaveBeenCalledWith(undefined, {
        userId: session.userId,
        type: 'expense',
        includeCustom: true
      })

      // AC-8.3.2: Verify updates
      const updateCall = mockSupabaseClient.from.mock.results[1]?.value
      expect(updateCall.update).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'expense',
          category_id: 'cat-expense-default'
        })
      )

      // AC-8.3.2: Verify notification
      expect(result).toContain('tipo (receita → despesa)')
      expect(result).toContain('categoria (Salário → Outros Gastos)')
    })
  })

  describe('TC-8.3.3: Prefer custom categories over defaults', () => {
    it('should use user custom category when available', async () => {
      const session = createMockUserSession()
      const existingTransaction = createMockTransaction({
        type: 'expense',
        category_id: 'cat-expense-1',
        user_id: session.userId
      })

      const transactionWithCategory = {
        ...existingTransaction,
        categories: {
          id: 'cat-expense-1',
          name: 'Compras',
          type: 'expense'
        }
      }

      // Mock returns first custom category (not default)
      const customCategory = {
        id: 'cat-income-freelance',
        name: 'Freelance',
        confidence: 0.8,
        matchType: 'exact' as const
      }

      jest.mocked(getUserSession).mockResolvedValue(session)
      jest.mocked(findCategoryWithFallback).mockResolvedValue(customCategory)

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

      // AC-8.3.3: Verify custom category used (not "Outras Receitas")
      expect(result).toContain('categoria (Compras → Freelance)')

      const updateCall = mockSupabaseClient.from.mock.results[1]?.value
      expect(updateCall.update).toHaveBeenCalledWith(
        expect.objectContaining({
          category_id: 'cat-income-freelance'
        })
      )
    })
  })

  describe('TC-8.3.4: Fallback to default categories', () => {
    it('should fallback to "Outras Receitas" when no custom income categories exist', async () => {
      const session = createMockUserSession()
      const existingTransaction = createMockTransaction({
        type: 'expense',
        category_id: 'cat-expense-1',
        user_id: session.userId
      })

      const transactionWithCategory = {
        ...existingTransaction,
        categories: {
          id: 'cat-expense-1',
          name: 'Transporte',
          type: 'expense'
        }
      }

      const defaultCategory = {
        id: 'cat-default-income',
        name: 'Outras Receitas',
        confidence: 0.5,
        matchType: 'fallback' as const
      }

      jest.mocked(getUserSession).mockResolvedValue(session)
      jest.mocked(findCategoryWithFallback).mockResolvedValue(defaultCategory)

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

      // AC-8.3.4: Verify "Outras Receitas" used as fallback
      expect(result).toContain('categoria (Transporte → Outras Receitas)')
    })

    it('should fallback to "Outros Gastos" when no custom expense categories exist', async () => {
      const session = createMockUserSession()
      const existingTransaction = createMockTransaction({
        type: 'income',
        category_id: 'cat-income-1',
        user_id: session.userId
      })

      const transactionWithCategory = {
        ...existingTransaction,
        categories: {
          id: 'cat-income-1',
          name: 'Investimentos',
          type: 'income'
        }
      }

      const defaultCategory = {
        id: 'cat-default-expense',
        name: 'Outros Gastos',
        confidence: 0.5,
        matchType: 'fallback' as const
      }

      jest.mocked(getUserSession).mockResolvedValue(session)
      jest.mocked(findCategoryWithFallback).mockResolvedValue(defaultCategory)

      mockQuerySequence([
        { data: transactionWithCategory, error: null },
        { data: { id: 'tx-456' }, error: null }
      ])

      const intent = createMockParsedIntent({
        action: 'edit_transaction',
        entities: {
          transactionId: 'INC-456',
          type: 'expense'
        }
      })

      const result = await handleEditTransaction('+5511999999999', intent)

      // AC-8.3.4: Verify "Outros Gastos" used as fallback
      expect(result).toContain('categoria (Investimentos → Outros Gastos)')
    })
  })

  describe('Edge Cases - Category Mismatch', () => {
    it('should NOT replace category when type changes but category already matches new type', async () => {
      const session = createMockUserSession()
      const existingTransaction = createMockTransaction({
        type: 'expense',
        category_id: 'cat-income-1',
        user_id: session.userId
      })

      // Transaction has expense type but income category - unusual but possible
      // When changing to income, category already matches so no replacement needed
      const transactionWithCategory = {
        ...existingTransaction,
        categories: {
          id: 'cat-income-1',
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

      await handleEditTransaction('+5511999999999', intent)

      // Category replacement should NOT be called since category already matches
      expect(findCategoryWithFallback).not.toHaveBeenCalled()

      // Only type should be updated
      const updateCall = mockSupabaseClient.from.mock.results[1]?.value
      expect(updateCall.update).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'income'
        })
      )
      expect(updateCall.update).toHaveBeenCalledWith(
        expect.not.objectContaining({
          category_id: expect.anything()
        })
      )
    })

    it('should handle transaction without category gracefully', async () => {
      const session = createMockUserSession()
      const existingTransaction = createMockTransaction({
        type: 'expense',
        category_id: null,
        user_id: session.userId
      })

      // Transaction has no category
      const transactionWithoutCategory = {
        ...existingTransaction,
        categories: null
      }

      jest.mocked(getUserSession).mockResolvedValue(session)

      mockQuerySequence([
        { data: transactionWithoutCategory, error: null },
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

      // Should not crash, category replacement should not be called
      expect(findCategoryWithFallback).not.toHaveBeenCalled()
      expect(result).toContain('tipo (despesa → receita)')
    })

    it('should update both type and category in combined edit', async () => {
      const session = createMockUserSession()
      const existingTransaction = createMockTransaction({
        type: 'expense',
        amount: 50.00,
        category_id: 'cat-expense-1',
        user_id: session.userId
      })

      const transactionWithCategory = {
        ...existingTransaction,
        categories: {
          id: 'cat-expense-1',
          name: 'Alimentação',
          type: 'expense'
        }
      }

      const replacementCategory = {
        id: 'cat-income-1',
        name: 'Outras Receitas',
        confidence: 0.5,
        matchType: 'fallback' as const
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
          amount: 100.00
        }
      })

      const result = await handleEditTransaction('+5511999999999', intent)

      // Should update type, category_id, and amount
      const updateCall = mockSupabaseClient.from.mock.results[1]?.value
      expect(updateCall.update).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'income',
          category_id: 'cat-income-1',
          amount: 100.00
        })
      )

      // All changes should be in message
      expect(result).toContain('valor (R$ 100.00)')
      expect(result).toContain('tipo (despesa → receita)')
      expect(result).toContain('categoria (Alimentação → Outras Receitas)')
    })
  })
})
