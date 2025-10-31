/**
 * Mock data for testing - sample transactions, users, and other entities
 */

export const mockUsers = [
  {
    id: 'user-123',
    email: 'test@example.com',
    whatsapp_number: '+5511999999999',
    created_at: '2024-01-01T00:00:00Z'
  },
  {
    id: 'user-456',
    email: 'test2@example.com',
    whatsapp_number: '+5511888888888',
    created_at: '2024-01-02T00:00:00Z'
  }
]

export const mockTransactions = [
  {
    id: 'tx-001',
    user_id: 'user-123',
    amount: 50.00,
    description: 'Almoço no restaurante',
    category_id: 'comida',
    type: 'expense',
    payment_method: 'cartão',
    created_at: '2024-01-01T12:00:00Z'
  },
  {
    id: 'tx-002',
    user_id: 'user-123',
    amount: 30.00,
    description: 'Uber para o trabalho',
    category_id: 'transporte',
    type: 'expense',
    payment_method: 'pix',
    created_at: '2024-01-01T08:00:00Z'
  },
  {
    id: 'tx-003',
    user_id: 'user-123',
    amount: 1000.00,
    description: 'Salário',
    category_id: 'salário',
    type: 'income',
    payment_method: 'transferência',
    created_at: '2024-01-01T09:00:00Z'
  },
  {
    id: 'tx-004',
    user_id: 'user-123',
    amount: 25.50,
    description: 'Farmácia',
    category_id: 'saúde',
    type: 'expense',
    payment_method: 'dinheiro',
    created_at: '2024-01-02T14:00:00Z'
  }
]

export const mockCategories = [
  { id: 'comida', name: 'Comida', user_id: 'user-123' },
  { id: 'transporte', name: 'Transporte', user_id: 'user-123' },
  { id: 'salário', name: 'Salário', user_id: 'user-123' },
  { id: 'saúde', name: 'Saúde', user_id: 'user-123' },
  { id: 'lazer', name: 'Lazer', user_id: 'user-123' },
  { id: 'contas', name: 'Contas', user_id: 'user-123' }
]

export const mockBudgets = [
  {
    id: 'budget-001',
    user_id: 'user-123',
    category_id: 'comida',
    amount: 500.00,
    month: 1,
    year: 2024,
    created_at: '2024-01-01T00:00:00Z'
  },
  {
    id: 'budget-002',
    user_id: 'user-123',
    category_id: 'transporte',
    amount: 200.00,
    month: 1,
    year: 2024,
    created_at: '2024-01-01T00:00:00Z'
  }
]

export const mockRecurringTransactions = [
  {
    id: 'recurring-001',
    user_id: 'user-123',
    name: 'Aluguel',
    amount: 1200.00,
    category_id: 'contas',
    type: 'expense',
    day_of_month: 5,
    is_active: true,
    created_at: '2024-01-01T00:00:00Z'
  },
  {
    id: 'recurring-002',
    user_id: 'user-123',
    name: 'Salário',
    amount: 5000.00,
    category_id: 'salário',
    type: 'income',
    day_of_month: 1,
    is_active: true,
    created_at: '2024-01-01T00:00:00Z'
  }
]

export const mockSessions = [
  {
    id: 'session-001',
    whatsapp_number: '+5511999999999',
    user_id: 'user-123',
    session_token: 'token-123',
    is_active: true,
    last_activity: '2024-01-01T10:00:00Z',
    expires_at: '2024-01-02T10:00:00Z'
  }
]

// Sample OCR results for testing
export const mockOCRResults = [
  {
    text: 'R$ 50,00\nAlmoço no restaurante\n15/01/2024',
    confidence: 0.95,
    expenses: [
      {
        amount: 50.00,
        description: 'Almoço no restaurante',
        date: '2024-01-15',
        type: 'expense' as const
      }
    ]
  },
  {
    text: 'Comprovante de Pagamento\nValor: R$ 30,00\nDescrição: Uber\nData: 16/01/2024',
    confidence: 0.88,
    expenses: [
      {
        amount: 30.00,
        description: 'Uber',
        date: '2024-01-16',
        type: 'expense' as const
      }
    ]
  }
]

// Sample WhatsApp messages for testing
export const mockWhatsAppMessages = [
  {
    key: { id: 'msg-001' },
    message: {
      conversation: 'gastei 50 reais em comida'
    },
    messageTimestamp: 1704110400,
    pushName: 'Test User'
  },
  {
    key: { id: 'msg-002' },
    message: {
      conversation: '/add 30 transporte'
    },
    messageTimestamp: 1704111000,
    pushName: 'Test User'
  },
  {
    key: { id: 'msg-003' },
    message: {
      imageMessage: {
        url: 'https://example.com/receipt.jpg',
        mimetype: 'image/jpeg'
      }
    },
    messageTimestamp: 1704111600,
    pushName: 'Test User'
  }
]
