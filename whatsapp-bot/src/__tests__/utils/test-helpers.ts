import { ParsedIntent, ExpenseData, UserSession } from '../../types'

/**
 * Test helper functions for creating mock data and assertions
 */

export const createMockUserSession = (overrides: Partial<UserSession> = {}): UserSession => ({
  id: 'session-123',
  whatsappNumber: '+5511999999999',
  userId: 'user-123',
  sessionToken: 'token-123',
  isActive: true,
  lastActivity: new Date('2024-01-01T10:00:00Z'),
  expiresAt: new Date('2024-01-02T10:00:00Z'),
  ...overrides
})

export const createMockExpenseData = (overrides: Partial<ExpenseData> = {}): ExpenseData => ({
  amount: 50.00,
  category: 'comida',
  description: 'Almoço no restaurante',
  date: '2024-01-01',
  type: 'expense',
  paymentMethod: 'cartão',
  ...overrides
})

export const createMockParsedIntent = (overrides: Partial<ParsedIntent> = {}): ParsedIntent => ({
  action: 'add_expense',
  confidence: 0.9,
  entities: {
    amount: 50.00,
    category: 'comida',
    description: 'Almoço no restaurante'
  },
  ...overrides
})

export const createMockTransaction = (overrides: any = {}) => ({
  id: 'tx-123',
  user_id: 'user-123',
  amount: 50.00,
  description: 'Almoço no restaurante',
  category_id: 'comida',
  type: 'expense',
  payment_method: 'cartão',
  created_at: '2024-01-01T10:00:00Z',
  ...overrides
})

/**
 * Assertion helpers
 */
export const expectIntentToMatch = (actual: ParsedIntent, expected: Partial<ParsedIntent>) => {
  expect(actual.action).toBe(expected.action)
  expect(actual.confidence).toBeCloseTo(expected.confidence || 0, 2)
  
  if (expected.entities) {
    Object.entries(expected.entities).forEach(([key, value]) => {
      expect(actual.entities[key as keyof typeof actual.entities]).toEqual(value)
    })
  }
}

export const expectExpenseDataToMatch = (actual: ExpenseData, expected: Partial<ExpenseData>) => {
  expect(actual.amount).toBe(expected.amount)
  expect(actual.type).toBe(expected.type)
  
  if (expected.category) expect(actual.category).toBe(expected.category)
  if (expected.description) expect(actual.description).toBe(expected.description)
  if (expected.date) expect(actual.date).toBe(expected.date)
  if (expected.paymentMethod) expect(actual.paymentMethod).toBe(expected.paymentMethod)
}

/**
 * Test data generators
 */
export const generateTestMessages = () => ({
  expense: [
    'gastei 50 reais em comida',
    'paguei R$ 30 no transporte',
    'comprei algo por 25,50',
    'despesa de 100 reais em mercado'
  ],
  income: [
    'recebi 1000 reais de salário',
    'ganhei 500 de freelance',
    'receita de 200 reais',
    'entrou 1500 no pix'
  ],
  budget: [
    'orçamento de 500 para comida',
    'limite de 200 em transporte',
    'definir orçamento de 1000 para lazer'
  ],
  recurring: [
    'despesa recorrente de 1200 no dia 5',
    'mensal de 80 reais dia 15',
    'todo mês 500 reais dia 1'
  ],
  report: [
    'relatório do mês',
    'resumo de janeiro',
    'balanço de dezembro 2023'
  ],
  categories: [
    'listar categorias',
    'adicionar categoria casa',
    'criar categoria investimentos'
  ],
  commands: [
    '/add 50 comida',
    '/budget transporte 200',
    '/recurring aluguel 1200 dia 5',
    '/report este mês',
    '/list categories'
  ]
})

/**
 * Mock date for consistent testing
 */
export const mockDate = (dateString: string) => {
  return new Date(dateString)
}
