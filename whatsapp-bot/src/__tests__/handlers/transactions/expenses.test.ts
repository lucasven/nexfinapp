// Jest globals are available
import { handleAddExpense, handleShowExpenses } from '../../../handlers/transactions/expenses'
import { createMockParsedIntent, createMockUserSession } from '../../utils/test-helpers'
import { mockSupabaseClient, resetSupabaseMocks, mockQuerySuccess, mockQueryError, mockQuerySequence } from '../../../__mocks__/supabase'

// Mock dependencies
jest.mock('../../../services/database/supabase-client', () => ({
  getSupabaseClient: () => mockSupabaseClient
}))

jest.mock('../../../auth/session-manager', () => ({
  getUserSession: jest.fn()
}))

jest.mock('../../../services/detection/duplicate-detector', () => ({
  checkForDuplicate: jest.fn()
}))

jest.mock('../../../handlers/transactions/duplicate-confirmation', () => ({
  storePendingTransaction: jest.fn()
}))

jest.mock('../../../services/category-matcher', () => ({
  findCategoryWithFallback: jest.fn()
}))

// Mock payment method and credit card modules
jest.mock('../../../utils/payment-method-helper', () => ({
  findOrCreatePaymentMethod: jest.fn().mockResolvedValue(null),
  detectPaymentMethodType: jest.fn().mockReturnValue('card')
}))

jest.mock('../../../utils/credit-mode-detection', () => ({
  needsCreditModeSelection: jest.fn().mockResolvedValue(false)
}))

jest.mock('../../../services/conversation/pending-transaction-state', () => ({
  storePendingTransactionContext: jest.fn()
}))

jest.mock('../../../handlers/credit-card/mode-selection', () => ({
  sendModeSelectionPrompt: jest.fn()
}))

jest.mock('../../../localization/i18n', () => ({
  getUserLocale: jest.fn().mockResolvedValue('pt-br')
}))

jest.mock('../../../localization/pt-br', () => ({
  messages: {
    notAuthenticated: 'Usuário não autenticado',
    invalidAmount: 'Valor inválido',
    expenseError: 'Erro ao adicionar despesa',
    genericError: 'Erro genérico',
    noTransactions: 'Nenhuma transação encontrada',
    duplicateBlocked: (reason: string) => `Duplicata bloqueada: ${reason}`,
    duplicateWarning: (reason: string, confidence: number) => `Aviso de duplicata: ${reason} (${confidence}%)`,
    expenseAdded: (amount: number, category: string, date: string) => 
      `Despesa adicionada: R$ ${amount} em ${category} em ${date}`,
    incomeAdded: (amount: number, category: string, date: string) => 
      `Receita adicionada: R$ ${amount} em ${category} em ${date}`
  },
  formatDate: (date: Date) => date.toLocaleDateString('pt-BR')
}))

import { getUserSession } from '../../../auth/session-manager'
import { checkForDuplicate } from '../../../services/detection/duplicate-detector'
import { storePendingTransaction } from '../../../handlers/transactions/duplicate-confirmation'
import { findCategoryWithFallback } from '../../../services/category-matcher'

describe('Expenses Handler', () => {
  beforeEach(() => {
    resetSupabaseMocks()
    jest.clearAllMocks()
  })

  describe('handleAddExpense', () => {
    it('should return not authenticated message when no session', async () => {
      jest.mocked(getUserSession).mockResolvedValue(null)

      const intent = createMockParsedIntent({
        action: 'add_expense',
        entities: { amount: 50, category: 'comida' }
      })

      const result = await handleAddExpense('+5511999999999', intent)

      expect(result).toBe('Usuário não autenticado')
    })

    it('should return invalid amount message when amount is missing', async () => {
      const session = createMockUserSession()
      jest.mocked(getUserSession).mockResolvedValue(session)

      const intent = createMockParsedIntent({
        action: 'add_expense',
        entities: { category: 'comida' } // No amount
      })

      const result = await handleAddExpense('+5511999999999', intent)

      expect(result).toBe('Valor inválido')
    })

    it('should successfully add expense with category', async () => {
      const session = createMockUserSession()
      jest.mocked(getUserSession).mockResolvedValue(session)
      jest.mocked(checkForDuplicate).mockResolvedValue({ isDuplicate: false, confidence: 0 })
      jest.mocked(findCategoryWithFallback).mockResolvedValue({
        id: 'cat-123',
        name: 'comida',
        confidence: 1.0,
        matchType: 'exact'
      })

      // Mock transaction insertion
      mockQuerySequence([
        {
          data: {
            id: 'tx-123',
            amount: 50,
            category: { name: 'comida' },
            date: '2024-01-01'
          },
          error: null
        }
      ])

      const intent = createMockParsedIntent({
        action: 'add_expense',
        entities: {
          amount: 50,
          category: 'comida',
          description: 'Almoço',
          paymentMethod: 'cartão'
        }
      })

      const result = await handleAddExpense('+5511999999999', intent)

      expect(result).toContain('Despesa adicionada: R$ 50 em comida')
      expect(result).toContain('💳 Método: cartão')
      expect(result).toContain('🆔 ID: ABC123')
    })

    it('should successfully add income', async () => {
      const session = createMockUserSession()
      jest.mocked(getUserSession).mockResolvedValue(session)
      jest.mocked(checkForDuplicate).mockResolvedValue({ isDuplicate: false, confidence: 0 })
      jest.mocked(findCategoryWithFallback).mockResolvedValue({
        id: 'cat-123',
        name: 'salário',
        confidence: 1.0,
        matchType: 'exact'
      })

      // Mock transaction insertion
      mockQuerySequence([
        {
          data: {
            id: 'tx-123',
            amount: 1000,
            category: { name: 'salário' },
            date: '2024-01-01'
          },
          error: null
        }
      ])

      const intent = createMockParsedIntent({
        action: 'add_income',
        entities: {
          amount: 1000,
          category: 'salário',
          type: 'income'
        }
      })

      const result = await handleAddExpense('+5511999999999', intent)

      expect(result).toContain('Receita adicionada: R$ 1000 em salário')
    })

    it('should use default category when category not found', async () => {
      const session = createMockUserSession()
      jest.mocked(getUserSession).mockResolvedValue(session)
      jest.mocked(checkForDuplicate).mockResolvedValue({ isDuplicate: false, confidence: 0 })
      jest.mocked(findCategoryWithFallback).mockResolvedValue({
        id: 'default-cat',
        name: 'Other Expense',
        confidence: 0.5,
        matchType: 'fallback'
      })

      // Mock transaction insertion
      mockQuerySequence([
        {
          data: {
            id: 'tx-123',
            amount: 50,
            category: { name: 'Other Expense' },
            date: '2024-01-01'
          },
          error: null
        }
      ])

      const intent = createMockParsedIntent({
        action: 'add_expense',
        entities: {
          amount: 50,
          category: 'unknown-category'
        }
      })

      const result = await handleAddExpense('+5511999999999', intent)

      expect(result).toContain('Despesa adicionada: R$ 50 em Other Expense')
    })

    it('should block high confidence duplicates', async () => {
      const session = createMockUserSession()
      jest.mocked(getUserSession).mockResolvedValue(session)
      jest.mocked(findCategoryWithFallback).mockResolvedValue({
        id: 'cat-123',
        name: 'comida',
        confidence: 1.0,
        matchType: 'exact'
      })
      jest.mocked(checkForDuplicate).mockResolvedValue({
        isDuplicate: true,
        confidence: 0.96,
        reason: 'Transação muito similar encontrada'
      })

      const intent = createMockParsedIntent({
        action: 'add_expense',
        entities: { amount: 50, category: 'comida' }
      })

      const result = await handleAddExpense('+5511999999999', intent)

      expect(result).toBe('Duplicata bloqueada: Transação muito similar encontrada')
    })

    it('should warn about medium confidence duplicates', async () => {
      const session = createMockUserSession()
      jest.mocked(getUserSession).mockResolvedValue(session)
      jest.mocked(findCategoryWithFallback).mockResolvedValue({
        id: 'cat-123',
        name: 'comida',
        confidence: 1.0,
        matchType: 'exact'
      })
      jest.mocked(checkForDuplicate).mockResolvedValue({
        isDuplicate: true,
        confidence: 0.8,
        reason: 'Possível duplicata'
      })
      jest.mocked(storePendingTransaction).mockReturnValue('ABC123')

      const intent = createMockParsedIntent({
        action: 'add_expense',
        entities: { amount: 50, category: 'comida' }
      })

      const result = await handleAddExpense('+5511999999999', intent)

      expect(result).toBe('Aviso de duplicata: Possível duplicata (80%)\n🆔 Duplicate ID: ABC123')
      expect(storePendingTransaction).toHaveBeenCalledWith(
        '+5511999999999',
        session.userId,
        expect.objectContaining({
          amount: 50,
          category: 'comida',
          type: 'expense'
        })
      )
    })

    it('should handle database errors gracefully', async () => {
      const session = createMockUserSession()
      jest.mocked(getUserSession).mockResolvedValue(session)
      jest.mocked(checkForDuplicate).mockResolvedValue({ isDuplicate: false, confidence: 0 })
      jest.mocked(findCategoryWithFallback).mockResolvedValue({
        id: 'cat-123',
        name: 'comida',
        confidence: 1.0,
        matchType: 'exact'
      })

      // Mock transaction ID generation error
      mockSupabaseClient.rpc.mockResolvedValue({
        data: null,
        error: new Error('Database error')
      })

      const intent = createMockParsedIntent({
        action: 'add_expense',
        entities: { amount: 50, category: 'comida' }
      })

      const result = await handleAddExpense('+5511999999999', intent)

      expect(result).toBe('Erro ao adicionar despesa')
    })

    it('should handle transaction insertion errors', async () => {
      const session = createMockUserSession()
      jest.mocked(getUserSession).mockResolvedValue(session)
      jest.mocked(checkForDuplicate).mockResolvedValue({ isDuplicate: false, confidence: 0 })
      jest.mocked(findCategoryWithFallback).mockResolvedValue({
        id: 'cat-123',
        name: 'comida',
        confidence: 1.0,
        matchType: 'exact'
      })

      // Mock transaction insertion error
      mockQuerySequence([
        { data: null, error: new Error('Insert error') }
      ])

      const intent = createMockParsedIntent({
        action: 'add_expense',
        entities: { amount: 50, category: 'comida' }
      })

      const result = await handleAddExpense('+5511999999999', intent)

      expect(result).toBe('Erro ao adicionar despesa')
    })
  })

  describe('handleShowExpenses', () => {
    it('should return not authenticated message when no session', async () => {
      jest.mocked(getUserSession).mockResolvedValue(null)

      const result = await handleShowExpenses('+5511999999999')

      expect(result).toBe('Usuário não autenticado')
    })

    it('should return no transactions message when no transactions found', async () => {
      const session = createMockUserSession()
      jest.mocked(getUserSession).mockResolvedValue(session)

      mockQuerySuccess([])

      const result = await handleShowExpenses('+5511999999999')

      expect(result).toBe('Nenhuma transação encontrada')
    })

    it('should return formatted transactions list', async () => {
      const session = createMockUserSession()
      jest.mocked(getUserSession).mockResolvedValue(session)

      const mockTransactions = [
        {
          id: 'tx-1',
          amount: 50,
          type: 'expense',
          date: '2024-01-01',
          description: 'Almoço',
          payment_method: 'cartão',
          category: { name: 'comida', icon: '🍽️' }
        },
        {
          id: 'tx-2',
          amount: 1000,
          type: 'income',
          date: '2024-01-01',
          description: null,
          payment_method: null,
          category: { name: 'salário', icon: '💰' }
        }
      ]

      mockQuerySuccess(mockTransactions)

      const result = await handleShowExpenses('+5511999999999')

      expect(result).toContain('📋 *Últimas transações (este mês):*')
      expect(result).toContain('🍽️ -R$ 50')
      expect(result).toContain('comida -')
      expect(result).toContain('"Almoço"')
      expect(result).toContain('💳 cartão')
      expect(result).toContain('💰 +R$ 1000')
      expect(result).toContain('salário -')
      expect(result).toContain('💰 Receitas: R$ 1000.00')
      expect(result).toContain('💸 Despesas: R$ 50.00')
      expect(result).toContain('📊 Saldo: R$ 950.00')
    })

    it('should handle database errors gracefully', async () => {
      const session = createMockUserSession()
      jest.mocked(getUserSession).mockResolvedValue(session)

      mockQueryError(new Error('Database error'))

      const result = await handleShowExpenses('+5511999999999')

      expect(result).toBe('Erro genérico')
    })

    it('should handle transactions without categories', async () => {
      const session = createMockUserSession()
      jest.mocked(getUserSession).mockResolvedValue(session)

      const mockTransactions = [
        {
          id: 'tx-1',
          amount: 50,
          type: 'expense',
          date: '2024-01-01',
          description: null,
          payment_method: null,
          category: null
        }
      ]

      mockQuerySuccess(mockTransactions)

      const result = await handleShowExpenses('+5511999999999')

      expect(result).toContain('💸 -R$ 50')
      expect(result).toContain('Sem categoria -')
    })
  })

  // Story 1.6: Simple Mode Backward Compatibility Tests
  describe('Simple Mode Transaction Flow', () => {
    it('should create transaction without installment prompts when credit_mode=false', async () => {
      const session = createMockUserSession()
      jest.mocked(getUserSession).mockResolvedValue(session)
      jest.mocked(checkForDuplicate).mockResolvedValue({ isDuplicate: false, confidence: 0 })
      jest.mocked(findCategoryWithFallback).mockResolvedValue({
        id: 'cat-123',
        name: 'comida',
        confidence: 1.0,
        matchType: 'exact'
      })

      // Mock payment method helper to return Simple Mode credit card
      const { findOrCreatePaymentMethod } = await import('../../../utils/payment-method-helper')
      jest.mocked(findOrCreatePaymentMethod).mockResolvedValue({
        id: 'pm-123',
        name: 'Nubank',
        type: 'credit',
        credit_mode: false, // Simple Mode
        user_id: session.userId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })

      // Mock credit mode detection to return false (mode already set)
      const { needsCreditModeSelection } = await import('../../../utils/credit-mode-detection')
      jest.mocked(needsCreditModeSelection).mockResolvedValue(false)

      // Mock transaction insertion
      mockQuerySequence([
        {
          data: {
            id: 'tx-123',
            amount: 150,
            category: { name: 'comida' },
            date: '2024-01-01'
          },
          error: null
        }
      ])

      const intent = createMockParsedIntent({
        action: 'add_expense',
        entities: {
          amount: 150,
          category: 'comida',
          paymentMethod: 'Nubank'
        }
      })

      const result = await handleAddExpense('+5511999999999', intent)

      // Should complete successfully without installment prompts
      expect(result).toContain('Despesa adicionada: R$ 150 em comida')
      expect(result).toContain('💳 Método: Nubank')
      expect(result).not.toContain('parcela') // No installment mentions
      expect(result).not.toContain('installment')

      // Verify needsCreditModeSelection was called
      expect(needsCreditModeSelection).toHaveBeenCalledWith('pm-123')
    })

    it('should handle Simple Mode credit card same as debit card', async () => {
      const session = createMockUserSession()
      jest.mocked(getUserSession).mockResolvedValue(session)
      jest.mocked(checkForDuplicate).mockResolvedValue({ isDuplicate: false, confidence: 0 })
      jest.mocked(findCategoryWithFallback).mockResolvedValue({
        id: 'cat-123',
        name: 'transporte',
        confidence: 1.0,
        matchType: 'exact'
      })

      // Mock Simple Mode credit card
      const { findOrCreatePaymentMethod } = await import('../../../utils/payment-method-helper')
      jest.mocked(findOrCreatePaymentMethod).mockResolvedValue({
        id: 'pm-simple',
        name: 'Cartão Simples',
        type: 'credit',
        credit_mode: false,
        user_id: session.userId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })

      const { needsCreditModeSelection } = await import('../../../utils/credit-mode-detection')
      jest.mocked(needsCreditModeSelection).mockResolvedValue(false)

      mockQuerySequence([
        {
          data: {
            id: 'tx-simple',
            amount: 50,
            category: { name: 'transporte' },
            date: '2024-01-01'
          },
          error: null
        }
      ])

      const intent = createMockParsedIntent({
        action: 'add_expense',
        entities: {
          amount: 50,
          category: 'transporte',
          paymentMethod: 'Cartão Simples'
        }
      })

      const result = await handleAddExpense('+5511999999999', intent)

      // Response should be identical to debit card transaction
      expect(result).toContain('Despesa adicionada: R$ 50 em transporte')
      expect(result).toContain('💳 Método: Cartão Simples')
      // No special credit features
      expect(result).not.toContain('fatura')
      expect(result).not.toContain('statement')
    })
  })
})
