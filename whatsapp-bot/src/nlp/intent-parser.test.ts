import { parseIntent } from './intent-parser'
import { generateTestMessages, expectIntentToMatch, mockDate } from '../__tests__/utils/test-helpers'

describe('Intent Parser', () => {
  beforeEach(() => {
    // Reset any mocks if needed
  })

  describe('Login Intent', () => {
    it('should parse login with email and password', () => {
      const result = parseIntent('login: test@example.com senha123')
      
      expectIntentToMatch(result, {
        action: 'login',
        confidence: 0.95,
        entities: {
          description: 'test@example.com|senha123'
        }
      })
    })

    it('should parse login without colon', () => {
      const result = parseIntent('login test@example.com senha123')
      
      expectIntentToMatch(result, {
        action: 'login',
        confidence: 0.95,
        entities: {
          description: 'test@example.com|senha123'
        }
      })
    })

    it('should parse login in Portuguese', () => {
      const result = parseIntent('entrar: user@test.com minhaSenha')
      
      expectIntentToMatch(result, {
        action: 'login',
        confidence: 0.95,
        entities: {
          description: 'user@test.com|minhaSenha'
        }
      })
    })

    it('should handle malformed login', () => {
      const result = parseIntent('fazer login')
      
      expectIntentToMatch(result, {
        action: 'login',
        confidence: 0.5,
        entities: {}
      })
    })
  })

  describe('Logout Intent', () => {
    it('should detect logout in Portuguese', () => {
      const result = parseIntent('sair')
      
      expectIntentToMatch(result, {
        action: 'logout',
        confidence: 0.9,
        entities: {}
      })
    })

    it('should detect logout in English', () => {
      const result = parseIntent('logout')
      
      expectIntentToMatch(result, {
        action: 'logout',
        confidence: 0.9,
        entities: {}
      })
    })

    it('should detect other logout variations', () => {
      const variations = ['desconectar', 'deslogar']
      
      variations.forEach(variation => {
        const result = parseIntent(variation)
        expectIntentToMatch(result, {
          action: 'logout',
          confidence: 0.9,
          entities: {}
        })
      })
    })
  })

  describe('Help Intent', () => {
    it('should detect help requests', () => {
      const helpMessages = ['ajuda', 'help', 'comandos', 'o que você faz', 'como usar']
      
      helpMessages.forEach(message => {
        const result = parseIntent(message)
        expectIntentToMatch(result, {
          action: 'help',
          confidence: 1,
          entities: {}
        })
      })
    })
  })

  describe('Expense Intent', () => {
    it('should parse expense with amount and category', () => {
      const result = parseIntent('gastei 50 reais em comida')
      
      expectIntentToMatch(result, {
        action: 'add_expense',
        confidence: 0.85,
        entities: {
          amount: 50,
          category: 'comida',
          type: 'expense'
        }
      })
    })

    it('should parse expense with R$ format', () => {
      const result = parseIntent('paguei R$ 30 no transporte')
      
      expectIntentToMatch(result, {
        action: 'add_expense',
        confidence: 0.85,
        entities: {
          amount: 30,
          category: 'transporte',
          type: 'expense'
        }
      })
    })

    it('should parse expense with decimal amount', () => {
      const result = parseIntent('comprei algo por 25,50')
      
      expectIntentToMatch(result, {
        action: 'add_expense',
        confidence: 0.85,
        entities: {
          amount: 25.50,
          type: 'expense'
        }
      })
    })

    it('should parse expense with date', () => {
      const mockDateValue = mockDate('2024-01-15T10:00:00Z')
      
      const result = parseIntent('gastei 50 reais ontem em comida', mockDateValue)
      
      expectIntentToMatch(result, {
        action: 'add_expense',
        confidence: 0.85,
        entities: {
          amount: 50,
          category: 'comida',
          date: '2024-01-14',
          type: 'expense'
        }
      })
    })

    it('should parse expense with specific date', () => {
      const mockDateValue = mockDate('2024-01-15T10:00:00Z')
      const result = parseIntent('despesa de 100 reais em mercado dia 15/01', mockDateValue)
      
      expectIntentToMatch(result, {
        action: 'add_expense',
        confidence: 0.85,
        entities: {
          amount: 100,
          category: 'mercado',
          date: '2025-01-15',
          type: 'expense'
        }
      })
    })

    it('should handle expense without amount', () => {
      const result = parseIntent('gastei em comida')
      
      expectIntentToMatch(result, {
        action: 'add_expense',
        confidence: 0.5,
        entities: {
          category: 'comida',
          type: 'expense'
        }
      })
    })
  })

  describe('Income Intent', () => {
    it('should parse income with amount', () => {
      const result = parseIntent('recebi 1000 reais de salário')
      
      expectIntentToMatch(result, {
        action: 'add_income',
        confidence: 0.85,
        entities: {
          amount: 1000,
          category: 'salário',
          type: 'income'
        }
      })
    })

    it('should parse income with different verbs', () => {
      const incomeMessages = [
        'ganhei 500 de freelance',
        'receita de 500 reais de freelance',
        'entrou 500 no pix de freelance'
      ]
      
      incomeMessages.forEach(message => {
        const result = parseIntent(message)
        expectIntentToMatch(result, {
          action: 'add_income',
          confidence: 0.85,
          entities: {
            amount: 500,
            category: 'freelance',
            type: 'income'
          }
        })
        expectIntentToMatch(result, {
          action: 'add_income',
          confidence: 0.85,
          entities: {
            amount: 500,
            category: 'freelance',
            type: 'income'
          }
        })
      })
    })
  })

  describe('Budget Intent', () => {
    it('should parse budget setting', () => {
      const result = parseIntent('orçamento de 500 para comida')
      
      expectIntentToMatch(result, {
        action: 'set_budget',
        confidence: 0.85,
        entities: {
          amount: 500,
          category: 'comida'
        }
      })
    })

    it('should parse budget with month/year', () => {
      const result = parseIntent('limite de 200 em transporte 01/2024')
      
      expectIntentToMatch(result, {
        action: 'set_budget',
        confidence: 0.85,
        entities: {
          amount: 200,
          category: 'transporte',
          month: 1,
          year: 2024
        }
      })
    })

    it('should parse budget viewing', () => {
      const result = parseIntent('mostrar orçamento')
      
      expectIntentToMatch(result, {
        action: 'show_budget',
        confidence: 0.9,
        entities: {}
      })
    })
  })

  describe('Recurring Intent', () => {
    it('should parse recurring expense', () => {
      const result = parseIntent('despesa recorrente de 1200 no dia 5')
      
      expectIntentToMatch(result, {
        action: 'add_recurring',
        confidence: 0.85,
        entities: {
          amount: 1200,
          dayOfMonth: 5,
          type: 'expense'
        }
      })
    })

    it('should parse recurring income', () => {
      const result = parseIntent('receita recorrente de 5000 dia 1')
      
      expectIntentToMatch(result, {
        action: 'add_recurring',
        confidence: 0.85,
        entities: {
          amount: 5000,
          dayOfMonth: 1,
          type: 'income'
        }
      })
    })

    it('should parse recurring viewing', () => {
      const result = parseIntent('mostrar recorrentes')
      
      expectIntentToMatch(result, {
        action: 'show_recurring',
        confidence: 0.9,
        entities: {}
      })
    })

    it('should parse recurring deletion', () => {
      const result = parseIntent('deletar recorrente')
      
      expectIntentToMatch(result, {
        action: 'delete_recurring',
        confidence: 0.8,
        entities: {}
      })
    })
  })

  describe('Report Intent', () => {
    it('should parse report request', () => {
      const result = parseIntent('relatório do mês')
      
      expectIntentToMatch(result, {
        action: 'show_report',
        confidence: 0.9,
        entities: {}
      })
    })

    it('should parse report with specific month', () => {
      const result = parseIntent('resumo de janeiro 2024')
      
      expectIntentToMatch(result, {
        action: 'show_report',
        confidence: 0.9,
        entities: {
          month: 1,
          year: 2024
        }
      })
    })

    it('should parse report for current month', () => {
      const mockDateValue = mockDate('2024-01-15T10:00:00Z')
      
      const result = parseIntent('balanço deste mês', mockDateValue)
      
      expectIntentToMatch(result, {
        action: 'show_report',
        confidence: 0.9,
        entities: {
          month: 1,
          year: 2024
        }
      })
    })
  })

  describe('Category Intent', () => {
    it('should parse category listing', () => {
      const result = parseIntent('listar categorias')
      
      expectIntentToMatch(result, {
        action: 'list_categories',
        confidence: 0.9,
        entities: {}
      })
    })

    it('should parse category addition', () => {
      const result = parseIntent('adicionar categoria casa')
      
      expectIntentToMatch(result, {
        action: 'add_category',
        confidence: 0.8,
        entities: {
          category: 'casa'
        }
      })
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty message', () => {
      const result = parseIntent('')
      
      expectIntentToMatch(result, {
        action: 'unknown',
        confidence: 0,
        entities: {}
      })
    })

    it('should handle unknown message', () => {
      const result = parseIntent('random text that makes no sense')
      
      expectIntentToMatch(result, {
        action: 'unknown',
        confidence: 0,
        entities: {}
      })
    })

    it('should handle mixed case', () => {
      const result = parseIntent('GASTEI 50 REAIS EM COMIDA')
      
      expectIntentToMatch(result, {
        action: 'add_expense',
        confidence: 0.85,
        entities: {
          amount: 50,
          category: 'comida',
          type: 'expense'
        }
      })
    })

    it('should handle messages with special characters', () => {
      const result = parseIntent('gastei R$ 25,50 em farmácia!')
      
      expectIntentToMatch(result, {
        action: 'add_expense',
        confidence: 0.85,
        entities: {
          amount: 25.50,
          category: 'farmácia',
          type: 'expense'
        }
      })
    })
  })

  describe('Amount Extraction', () => {
    it('should extract various amount formats', () => {
      const testCases = [
        { input: 'R$ 50,00', expected: 50 },
        { input: '50 reais', expected: 50 },
        { input: '25,50', expected: 25.50 },
        { input: 'R$ 100.00', expected: 100 },
        { input: '1000', expected: 1000 }
      ]
      
      testCases.forEach(({ input, expected }) => {
        const result = parseIntent(`gastei ${input} em comida`)
        expectIntentToMatch(result, {
          action: 'add_expense',
          confidence: 0.85,
          entities: {
            amount: expected,
            category: 'comida',
            type: 'expense'
          }
        })
      })
    })
  })

  describe('Category Extraction', () => {
    it('should extract common categories', () => {
      const testCases = [
        { input: 'comida', expected: 'comida' },
        { input: 'transporte', expected: 'transporte' },
        { input: 'salário', expected: 'salário' },
        { input: 'saúde', expected: 'saúde' },
        { input: 'lazer', expected: 'lazer' }
      ]
      
      testCases.forEach(({ input, expected }) => {
        const result = parseIntent(`gastei 50 reais em ${input}`)
        expectIntentToMatch(result, {
          action: 'add_expense',
          confidence: 0.85,
          entities: {
            amount: 50,
            category: expected,
            type: 'expense'
          }
        })
      })
    })
  })
})
