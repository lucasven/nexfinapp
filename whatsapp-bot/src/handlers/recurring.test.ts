// Jest globals are available
import { handleAddRecurring, handleShowRecurring, handleDeleteRecurring } from './recurring'
import { createMockParsedIntent, createMockUserSession } from '../__tests__/utils/test-helpers'
import { mockSupabaseClient, resetSupabaseMocks, mockQuerySuccess, mockQueryError, mockQuerySequence } from '../__mocks__/supabase'

// Mock dependencies
jest.mock('../services/supabase-client', () => ({
  getSupabaseClient: () => mockSupabaseClient
}))

jest.mock('../auth/session-manager', () => ({
  getUserSession: jest.fn()
}))

jest.mock('../localization/pt-br', () => ({
  messages: {
    notAuthenticated: 'Usuário não autenticado',
    recurringError: 'Erro ao adicionar despesa recorrente',
    genericError: 'Erro genérico',
    noRecurring: 'Nenhuma despesa recorrente encontrada',
    recurringAdded: (amount: number, category: string, day: number) => 
      `Despesa recorrente adicionada: R$ ${amount} em ${category} todo dia ${day}`
  }
}))

import { getUserSession } from '../auth/session-manager'

describe('Recurring Handler', () => {
  beforeEach(() => {
    resetSupabaseMocks()
    jest.clearAllMocks()
  })

  describe('handleAddRecurring', () => {
    it('should return not authenticated message when no session', async () => {
      jest.mocked(getUserSession).mockResolvedValue(null)

      const intent = createMockParsedIntent({
        action: 'add_recurring',
        entities: { amount: 1200, dayOfMonth: 5 }
      })

      const result = await handleAddRecurring('+5511999999999', intent)

      expect(result).toBe('Usuário não autenticado')
    })

    it('should return recurring error when amount is missing', async () => {
      const session = createMockUserSession()
      jest.mocked(getUserSession).mockResolvedValue(session)

      const intent = createMockParsedIntent({
        action: 'add_recurring',
        entities: { dayOfMonth: 5 } // No amount
      })

      const result = await handleAddRecurring('+5511999999999', intent)

      expect(result).toBe('Erro ao adicionar despesa recorrente')
    })

    it('should return recurring error when dayOfMonth is missing', async () => {
      const session = createMockUserSession()
      jest.mocked(getUserSession).mockResolvedValue(session)

      const intent = createMockParsedIntent({
        action: 'add_recurring',
        entities: { amount: 1200 } // No dayOfMonth
      })

      const result = await handleAddRecurring('+5511999999999', intent)

      expect(result).toBe('Erro ao adicionar despesa recorrente')
    })

    it('should successfully add recurring expense with category', async () => {
      const session = createMockUserSession()
      jest.mocked(getUserSession).mockResolvedValue(session)

      // Use mockQuerySequence for multiple from() calls
      mockQuerySequence([
        { data: [{ id: 'cat-123', name: 'aluguel' }], error: null }, // category lookup
        { 
          data: {
            id: 'recurring-123',
            amount: 1200,
            day_of_month: 5,
            type: 'expense'
          },
          error: null
        }, // recurring transaction insertion
        { data: null, error: null }, // recurring payments check
        { data: null, error: null } // recurring payments generation
      ])

      const intent = createMockParsedIntent({
        action: 'add_recurring',
        entities: { 
          amount: 1200, 
          category: 'aluguel',
          dayOfMonth: 5,
          type: 'expense',
          description: 'Aluguel do apartamento'
        }
      })

      const result = await handleAddRecurring('+5511999999999', intent)

      expect(result).toBe('Despesa recorrente adicionada: R$ 1200 em aluguel todo dia 5')
    })

    it('should successfully add recurring income', async () => {
      const session = createMockUserSession()
      jest.mocked(getUserSession).mockResolvedValue(session)

      // Use mockQuerySequence for multiple from() calls
      mockQuerySequence([
        { data: [{ id: 'cat-123', name: 'salário' }], error: null }, // category lookup
        { 
          data: {
            id: 'recurring-123',
            amount: 5000,
            day_of_month: 1,
            type: 'income'
          },
          error: null
        }, // recurring transaction insertion
        { data: null, error: null }, // recurring payments check
        { data: null, error: null } // recurring payments generation
      ])

      const intent = createMockParsedIntent({
        action: 'add_recurring',
        entities: { 
          amount: 5000, 
          category: 'salário',
          dayOfMonth: 1,
          type: 'income'
        }
      })

      const result = await handleAddRecurring('+5511999999999', intent)

      expect(result).toBe('Despesa recorrente adicionada: R$ 5000 em salário todo dia 1')
    })

    it('should handle missing category gracefully', async () => {
      const session = createMockUserSession()
      jest.mocked(getUserSession).mockResolvedValue(session)

      // Use mockQuerySequence for multiple from() calls
      mockQuerySequence([
        { data: [], error: null }, // empty category lookup
        { 
          data: {
            id: 'recurring-123',
            amount: 1200,
            day_of_month: 5,
            type: 'expense'
          },
          error: null
        }, // recurring transaction insertion
        { data: null, error: null }, // recurring payments check
        { data: null, error: null } // recurring payments generation
      ])

      const intent = createMockParsedIntent({
        action: 'add_recurring',
        entities: { 
          amount: 1200, 
          category: 'unknown-category',
          dayOfMonth: 5
        }
      })

      const result = await handleAddRecurring('+5511999999999', intent)

      expect(result).toBe('Despesa recorrente adicionada: R$ 1200 em Sem categoria todo dia 5')
    })

    it('should handle database errors gracefully', async () => {
      const session = createMockUserSession()
      jest.mocked(getUserSession).mockResolvedValue(session)

      // Use mockQuerySequence for multiple from() calls
      mockQuerySequence([
        { data: [{ id: 'cat-123', name: 'aluguel' }], error: null }, // category lookup
        { data: null, error: new Error('Database error') } // recurring transaction insertion error
      ])

      const intent = createMockParsedIntent({
        action: 'add_recurring',
        entities: { 
          amount: 1200, 
          category: 'aluguel',
          dayOfMonth: 5
        }
      })

      const result = await handleAddRecurring('+5511999999999', intent)

      expect(result).toBe('Erro ao adicionar despesa recorrente')
    })
  })

  describe('handleShowRecurring', () => {
    it('should return not authenticated message when no session', async () => {
      jest.mocked(getUserSession).mockResolvedValue(null)

      const result = await handleShowRecurring('+5511999999999')

      expect(result).toBe('Usuário não autenticado')
    })

    it('should return no recurring message when no recurring transactions found', async () => {
      const session = createMockUserSession()
      jest.mocked(getUserSession).mockResolvedValue(session)

      mockQuerySuccess([])

      const result = await handleShowRecurring('+5511999999999')

      expect(result).toBe('Nenhuma despesa recorrente encontrada')
    })

    it('should return formatted recurring transactions list', async () => {
      const session = createMockUserSession()
      jest.mocked(getUserSession).mockResolvedValue(session)

      const mockRecurring = [
        {
          id: 'recurring-1',
          amount: 1200,
          type: 'expense',
          day_of_month: 5,
          description: 'Aluguel do apartamento',
          category: { name: 'aluguel', icon: '🏠' }
        },
        {
          id: 'recurring-2',
          amount: 5000,
          type: 'income',
          day_of_month: 1,
          description: null,
          category: { name: 'salário', icon: '💰' }
        },
        {
          id: 'recurring-3',
          amount: 80,
          type: 'expense',
          day_of_month: 15,
          description: null,
          category: null
        }
      ]

      mockQuerySuccess(mockRecurring)

      const result = await handleShowRecurring('+5511999999999')

      expect(result).toContain('🔄 *Despesas Recorrentes*')
      expect(result).toContain('🏠 *aluguel*')
      expect(result).toContain('-R$ 1200.00')
      expect(result).toContain('Todo dia 5')
      expect(result).toContain('"Aluguel do apartamento"')
      expect(result).toContain('💰 *salário*')
      expect(result).toContain('+R$ 5000.00')
      expect(result).toContain('Todo dia 1')
      expect(result).toContain('💸 *Sem categoria*')
      expect(result).toContain('-R$ 80.00')
      expect(result).toContain('Todo dia 15')
      expect(result).toContain('💸 Total mensal: R$ 1280.00')
    })

    it('should handle database errors gracefully', async () => {
      const session = createMockUserSession()
      jest.mocked(getUserSession).mockResolvedValue(session)

      mockQueryError(new Error('Database error'))

      const result = await handleShowRecurring('+5511999999999')

      expect(result).toBe('Erro genérico')
    })

    it('should calculate monthly total correctly', async () => {
      const session = createMockUserSession()
      jest.mocked(getUserSession).mockResolvedValue(session)

      const mockRecurring = [
        {
          id: 'recurring-1',
          amount: 1200,
          type: 'expense',
          day_of_month: 5,
          category: { name: 'aluguel', icon: '🏠' }
        },
        {
          id: 'recurring-2',
          amount: 5000,
          type: 'income',
          day_of_month: 1,
          category: { name: 'salário', icon: '💰' }
        },
        {
          id: 'recurring-3',
          amount: 300,
          type: 'expense',
          day_of_month: 15,
          category: { name: 'academia', icon: '💪' }
        }
      ]

      mockQuerySuccess(mockRecurring)

      const result = await handleShowRecurring('+5511999999999')

      // Should only include expenses in monthly total (1200 + 300 = 1500)
      expect(result).toContain('💸 Total mensal: R$ 1500.00')
    })
  })

  describe('handleDeleteRecurring', () => {
    it('should return instructions message', async () => {
      const result = await handleDeleteRecurring('+5511999999999')

      expect(result).toBe('❌ Para deletar despesas recorrentes, use a aplicação web ou especifique qual deseja remover.')
    })
  })
})
