// Jest globals are available
import { handleSetBudget, handleShowBudgets } from '../../../handlers/budgets/budgets'
import { createMockParsedIntent, createMockUserSession } from '../../utils/test-helpers'
import { mockSupabaseClient, resetSupabaseMocks, mockQuerySuccess, mockQueryError, mockQuerySequence } from '../../../__mocks__/supabase'

// Mock dependencies
jest.mock('../../../services/database/supabase-client', () => ({
  getSupabaseClient: () => mockSupabaseClient
}))

jest.mock('../../../auth/session-manager', () => ({
  getUserSession: jest.fn()
}))

jest.mock('../../../localization/pt-br', () => ({
  messages: {
    notAuthenticated: 'Usuário não autenticado',
    budgetError: 'Erro ao definir orçamento',
    missingCategory: 'Categoria não encontrada',
    genericError: 'Erro genérico',
    noBudgets: 'Nenhum orçamento encontrado',
    budgetSet: (category: string, amount: number, period: string) => 
      `Orçamento definido: ${category} - R$ ${amount} para ${period}`
  },
  getMonthName: (month: number) => {
    const months = [
      'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
      'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ]
    return months[month - 1] || 'Mês inválido'
  }
}))

import { getUserSession } from '../../../auth/session-manager'

describe('Budgets Handler', () => {
  beforeEach(() => {
    resetSupabaseMocks()
    jest.clearAllMocks()
  })

  describe('handleSetBudget', () => {
    it('should return not authenticated message when no session', async () => {
      jest.mocked(getUserSession).mockResolvedValue(null)

      const intent = createMockParsedIntent({
        action: 'set_budget',
        entities: { amount: 500, category: 'comida' }
      })

      const result = await handleSetBudget('+5511999999999', intent)

      expect(result).toBe('Usuário não autenticado')
    })

    it('should return budget error when amount is missing', async () => {
      const session = createMockUserSession()
      jest.mocked(getUserSession).mockResolvedValue(session)

      const intent = createMockParsedIntent({
        action: 'set_budget',
        entities: { category: 'comida' } // No amount
      })

      const result = await handleSetBudget('+5511999999999', intent)

      expect(result).toBe('Erro ao definir orçamento')
    })

    it('should return budget error when category is missing', async () => {
      const session = createMockUserSession()
      jest.mocked(getUserSession).mockResolvedValue(session)

      const intent = createMockParsedIntent({
        action: 'set_budget',
        entities: { amount: 500 } // No category
      })

      const result = await handleSetBudget('+5511999999999', intent)

      expect(result).toBe('Erro ao definir orçamento')
    })

    it('should return missing category message when category not found', async () => {
      const session = createMockUserSession()
      jest.mocked(getUserSession).mockResolvedValue(session)

      // Mock empty category lookup
      mockQuerySuccess([])

      const intent = createMockParsedIntent({
        action: 'set_budget',
        entities: { amount: 500, category: 'unknown-category' }
      })

      const result = await handleSetBudget('+5511999999999', intent)

      expect(result).toBe('Categoria não encontrada')
    })

    it('should successfully set budget for current month', async () => {
      const session = createMockUserSession()
      jest.mocked(getUserSession).mockResolvedValue(session)

      // Mock the current date to be January 2024
      const originalDate = global.Date
      global.Date = class extends Date {
        constructor(...args: any[]) {
          if (args.length === 0) {
            super('2024-01-15T10:00:00Z')
          } else {
            super(args[0], args[1], args[2], args[3], args[4], args[5], args[6])
          }
        }
        
        static now() {
          return new Date('2024-01-15T10:00:00Z').getTime()
        }
      } as any

      // Use mockQuerySequence for multiple from() calls
      mockQuerySequence([
        { data: [{ id: 'cat-123', name: 'comida' }], error: null }, // First call: category lookup
        { 
          data: {
            id: 'budget-123',
            amount: 500,
            month: 1,
            year: 2024
          },
          error: null 
        } // Second call: budget upsert
      ])

      const intent = createMockParsedIntent({
        action: 'set_budget',
        entities: { amount: 500, category: 'comida' }
      })

      const result = await handleSetBudget('+5511999999999', intent)

      // Restore original Date
      global.Date = originalDate

      expect(result).toBe('Orçamento definido: comida - R$ 500 para Janeiro/2024')
    })

    it('should successfully set budget for specific month/year', async () => {
      const session = createMockUserSession()
      jest.mocked(getUserSession).mockResolvedValue(session)

      // Create a simple mock that returns the expected data
      // Use mockQuerySequence for multiple from() calls
      mockQuerySequence([
        { data: [{ id: 'cat-123', name: 'transporte' }], error: null }, // First call: category lookup
        { 
          data: {
            id: 'budget-123',
            amount: 200,
            month: 3,
            year: 2024
          },
          error: null 
        } // Second call: budget upsert
      ])

      const intent = createMockParsedIntent({
        action: 'set_budget',
        entities: { 
          amount: 200, 
          category: 'transporte',
          month: 3,
          year: 2024
        }
      })

      const result = await handleSetBudget('+5511999999999', intent)

      expect(result).toBe('Orçamento definido: transporte - R$ 200 para Março/2024')
    })

    it('should handle database errors gracefully', async () => {
      const session = createMockUserSession()
      jest.mocked(getUserSession).mockResolvedValue(session)

      // The handler now makes 3 queries:
      // 1. Category lookup
      // 2. Check for existing budget (returns null/not found)
      // 3. Insert new budget (error)
      mockQuerySequence([
        { data: [{ id: 'cat-123', name: 'comida' }], error: null }, // Category lookup
        { data: null, error: null }, // Check existing budget (not found)
        { data: null, error: new Error('Database error') } // Budget insert error
      ])

      const intent = createMockParsedIntent({
        action: 'set_budget',
        entities: { amount: 500, category: 'comida' }
      })

      const result = await handleSetBudget('+5511999999999', intent)

      expect(result).toBe('Erro ao definir orçamento')
    })
  })

  describe('handleShowBudgets', () => {
    it('should return not authenticated message when no session', async () => {
      jest.mocked(getUserSession).mockResolvedValue(null)

      const result = await handleShowBudgets('+5511999999999')

      expect(result).toBe('Usuário não autenticado')
    })

    it('should return no budgets message when no budgets found', async () => {
      const session = createMockUserSession()
      jest.mocked(getUserSession).mockResolvedValue(session)

      mockQuerySuccess([])

      const result = await handleShowBudgets('+5511999999999')

      expect(result).toBe('Nenhum orçamento encontrado')
    })

    it('should return formatted budgets with spending information', async () => {
      const session = createMockUserSession()
      jest.mocked(getUserSession).mockResolvedValue(session)

      // Handler now uses dual budget system with is_default field
      // Default budgets (is_default: true) or monthly budgets matching current month
      const now = new Date()
      const currentMonth = now.getMonth() + 1
      const currentYear = now.getFullYear()

      const mockBudgets = [
        {
          id: 'budget-1',
          amount: 500,
          category_id: 'cat-1',
          is_default: true, // Required for filtering
          month: null,
          year: null,
          category: { name: 'comida', icon: '🍽️' }
        },
        {
          id: 'budget-2',
          amount: 200,
          category_id: 'cat-2',
          is_default: true, // Required for filtering
          month: null,
          year: null,
          category: { name: 'transporte', icon: '🚗' }
        }
      ]

      // Use the new clean mock approach
      mockQuerySequence([
        { data: mockBudgets, error: null }, // budgets query
        { data: [{ amount: 300 }], error: null }, // transactions for budget 1
        { data: [{ amount: 180 }], error: null } // transactions for budget 2
      ])

      const result = await handleShowBudgets('+5511999999999')

      expect(result).toContain('📊 *Orçamentos -')
      expect(result).toContain('🍽️ *comida*')
      expect(result).toContain('Orçamento: R$ 500.00')
      expect(result).toContain('Gasto: R$ 300.00 (60%)')
      expect(result).toContain('Restante: R$ 200.00')
      expect(result).toContain('✅ No caminho certo')
      expect(result).toContain('🚗 *transporte*')
      expect(result).toContain('Orçamento: R$ 200.00')
      expect(result).toContain('Gasto: R$ 180.00 (90%)')
      expect(result).toContain('Restante: R$ 20.00')
      expect(result).toContain('⚡ Atenção: perto do limite!')
    })

    it('should show budget exceeded warning', async () => {
      const session = createMockUserSession()
      jest.mocked(getUserSession).mockResolvedValue(session)

      const mockBudgets = [
        {
          id: 'budget-1',
          amount: 500,
          category_id: 'cat-1',
          is_default: true, // Required for filtering
          month: null,
          year: null,
          category: { name: 'comida', icon: '🍽️' }
        }
      ]

      // Use mockQuerySequence for multiple from() calls
      mockQuerySequence([
        { data: mockBudgets, error: null }, // budgets query
        { data: [{ amount: 600 }], error: null } // transactions query (120% of budget)
      ])

      const result = await handleShowBudgets('+5511999999999')

      expect(result).toContain('Gasto: R$ 600.00 (120%)')
      expect(result).toContain('Restante: R$ -100.00')
      expect(result).toContain('⚠️ Orçamento excedido!')
    })

    it('should show very well message for low spending', async () => {
      const session = createMockUserSession()
      jest.mocked(getUserSession).mockResolvedValue(session)

      const mockBudgets = [
        {
          id: 'budget-1',
          amount: 500,
          category_id: 'cat-1',
          is_default: true, // Required for filtering
          month: null,
          year: null,
          category: { name: 'comida', icon: '🍽️' }
        }
      ]

      // Use mockQuerySequence for multiple from() calls
      mockQuerySequence([
        { data: mockBudgets, error: null }, // budgets query
        { data: [{ amount: 100 }], error: null } // transactions query (20% of budget)
      ])

      const result = await handleShowBudgets('+5511999999999')

      expect(result).toContain('Gasto: R$ 100.00 (20%)')
      expect(result).toContain('Restante: R$ 400.00')
      expect(result).toContain('💪 Muito bem!')
    })

    it('should handle budgets without categories', async () => {
      const session = createMockUserSession()
      jest.mocked(getUserSession).mockResolvedValue(session)

      const mockBudgets = [
        {
          id: 'budget-1',
          amount: 500,
          category_id: 'cat-1',
          is_default: true, // Required for filtering
          month: null,
          year: null,
          category: null
        }
      ]

      // Use mockQuerySequence for multiple from() calls
      mockQuerySequence([
        { data: mockBudgets, error: null }, // budgets query
        { data: [], error: null } // transactions query (no transactions)
      ])

      const result = await handleShowBudgets('+5511999999999')

      expect(result).toContain('📁 *Sem categoria*')
      expect(result).toContain('Gasto: R$ 0.00 (0%)')
    })

    it('should handle database errors gracefully', async () => {
      const session = createMockUserSession()
      jest.mocked(getUserSession).mockResolvedValue(session)

      // Mock budgets fetch error
      mockQueryError(new Error('Database error'))

      const result = await handleShowBudgets('+5511999999999')

      expect(result).toBe('Erro genérico')
    })

    it('should handle transaction fetch errors gracefully', async () => {
      const session = createMockUserSession()
      jest.mocked(getUserSession).mockResolvedValue(session)

      const mockBudgets = [
        {
          id: 'budget-1',
          amount: 500,
          category_id: 'cat-1',
          is_default: true, // Required for filtering
          month: null,
          year: null,
          category: { name: 'comida', icon: '🍽️' }
        }
      ]

      // Use mockQuerySequence for multiple from() calls
      mockQuerySequence([
        { data: mockBudgets, error: null }, // budgets query
        { data: null, error: new Error('Transaction fetch error') } // transactions query error
      ])

      const result = await handleShowBudgets('+5511999999999')

      expect(result).toContain('🍽️ *comida*')
      expect(result).toContain('Gasto: R$ 0.00 (0%)') // Should default to 0 on error
    })
  })
})
