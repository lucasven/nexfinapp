/**
 * AI Pattern Generator Tests - Type Conversion Recognition
 * Story 8.2: AI Intent Support for Type Conversion
 */

import { parseWithAI, getUserContext } from '../../../services/ai/ai-pattern-generator'
import { mockSupabaseClient, resetSupabaseMocks } from '../../../__mocks__/supabase'
import OpenAI from 'openai'

// Mock dependencies
jest.mock('openai', () => {
  // Return a constructor that returns an object with the mocked create function
  const mockCreate = jest.fn()
  const MockOpenAI = jest.fn(() => ({
    chat: {
      completions: {
        create: mockCreate
      }
    }
  }))
  // Attach mockCreate to the constructor so we can access it in tests
  ;(MockOpenAI as any).mockCreate = mockCreate
  return MockOpenAI
})

jest.mock('../../../services/database/supabase-client', () => ({
  getSupabaseClient: () => mockSupabaseClient
}))

jest.mock('../../../services/ai/ai-usage-tracker', () => ({
  checkDailyLimit: jest.fn().mockResolvedValue({ allowed: true, remaining: 100 }),
  recordLLMUsage: jest.fn().mockResolvedValue(undefined)
}))

// Get reference to the mocked create function
const mockCreate = (OpenAI as any).mockCreate

describe('AI Pattern Generator - Type Conversion Recognition', () => {
  const mockUserContext = {
    userId: 'user-123',
    recentCategories: ['comida', 'transporte', 'saúde'],
    recentPaymentMethods: ['cartão', 'PIX', 'dinheiro'],
    userPreferences: [],
    categoryTypeMap: new Map()
  }

  beforeEach(() => {
    resetSupabaseMocks()
    jest.clearAllMocks()
  })

  describe('AC-8.2.1: Portuguese type conversion phrases', () => {
    it('should recognize "era receita" as income type change', async () => {
      // Mock OpenAI response
      mockCreate.mockResolvedValue({
        choices: [{
          message: {
            tool_calls: [{
              function: {
                name: 'edit_transaction',
                arguments: JSON.stringify({
                  transaction_id: 'EXP-123',
                  type: 'income'
                })
              }
            }]
          }
        }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
      } as any)

      const result = await parseWithAI('EXP-123 era receita', mockUserContext)

      expect(result.action).toBe('edit_transaction')
      expect(result.entities.transactionId).toBe('EXP-123')
      expect(result.entities.type).toBe('income')
      expect(result.confidence).toBe(0.95)
    })

    it('should recognize "deveria ser despesa" as expense type change', async () => {
      mockCreate.mockResolvedValue({
        choices: [{
          message: {
            tool_calls: [{
              function: {
                name: 'edit_transaction',
                arguments: JSON.stringify({
                  transaction_id: '456',
                  type: 'expense'
                })
              }
            }]
          }
        }],
        usage: { prompt_tokens: 12, completion_tokens: 6, total_tokens: 18 }
      } as any)

      const result = await parseWithAI('transação 456 deveria ser despesa', mockUserContext)

      expect(result.action).toBe('edit_transaction')
      expect(result.entities.transactionId).toBe('456')
      expect(result.entities.type).toBe('expense')
    })

    it('should recognize "mudar para receita" as income type change', async () => {
      mockCreate.mockResolvedValue({
        choices: [{
          message: {
            tool_calls: [{
              function: {
                name: 'edit_transaction',
                arguments: JSON.stringify({
                  transaction_id: 'EXP-789',
                  type: 'income'
                })
              }
            }]
          }
        }],
        usage: { prompt_tokens: 11, completion_tokens: 5, total_tokens: 16 }
      } as any)

      const result = await parseWithAI('mudar EXP-789 para receita', mockUserContext)

      expect(result.action).toBe('edit_transaction')
      expect(result.entities.transactionId).toBe('EXP-789')
      expect(result.entities.type).toBe('income')
    })

    it('should recognize "corrigir para despesa" as expense type change', async () => {
      mockCreate.mockResolvedValue({
        choices: [{
          message: {
            tool_calls: [{
              function: {
                name: 'edit_transaction',
                arguments: JSON.stringify({
                  transaction_id: 'ABC-456',
                  type: 'expense'
                })
              }
            }]
          }
        }],
        usage: { prompt_tokens: 13, completion_tokens: 6, total_tokens: 19 }
      } as any)

      const result = await parseWithAI('corrigir ABC-456 para despesa', mockUserContext)

      expect(result.action).toBe('edit_transaction')
      expect(result.entities.transactionId).toBe('ABC-456')
      expect(result.entities.type).toBe('expense')
    })
  })

  describe('AC-8.2.2: English type conversion phrases', () => {
    it('should recognize "should be income" as income type change', async () => {
      mockCreate.mockResolvedValue({
        choices: [{
          message: {
            tool_calls: [{
              function: {
                name: 'edit_transaction',
                arguments: JSON.stringify({
                  transaction_id: '789',
                  type: 'income'
                })
              }
            }]
          }
        }],
        usage: { prompt_tokens: 12, completion_tokens: 5, total_tokens: 17 }
      } as any)

      const result = await parseWithAI('transaction 789 should be income', mockUserContext)

      expect(result.action).toBe('edit_transaction')
      expect(result.entities.transactionId).toBe('789')
      expect(result.entities.type).toBe('income')
    })

    it('should recognize "was expense" as expense type change', async () => {
      mockCreate.mockResolvedValue({
        choices: [{
          message: {
            tool_calls: [{
              function: {
                name: 'edit_transaction',
                arguments: JSON.stringify({
                  transaction_id: 'EXP-456',
                  type: 'expense'
                })
              }
            }]
          }
        }],
        usage: { prompt_tokens: 11, completion_tokens: 6, total_tokens: 17 }
      } as any)

      const result = await parseWithAI('EXP-456 was expense', mockUserContext)

      expect(result.action).toBe('edit_transaction')
      expect(result.entities.transactionId).toBe('EXP-456')
      expect(result.entities.type).toBe('expense')
    })

    it('should recognize "change to income" as income type change', async () => {
      mockCreate.mockResolvedValue({
        choices: [{
          message: {
            tool_calls: [{
              function: {
                name: 'edit_transaction',
                arguments: JSON.stringify({
                  transaction_id: 'ABC-123',
                  type: 'income'
                })
              }
            }]
          }
        }],
        usage: { prompt_tokens: 12, completion_tokens: 5, total_tokens: 17 }
      } as any)

      const result = await parseWithAI('change ABC-123 to income', mockUserContext)

      expect(result.action).toBe('edit_transaction')
      expect(result.entities.transactionId).toBe('ABC-123')
      expect(result.entities.type).toBe('income')
    })

    it('should recognize "correct to expense" as expense type change', async () => {
      mockCreate.mockResolvedValue({
        choices: [{
          message: {
            tool_calls: [{
              function: {
                name: 'edit_transaction',
                arguments: JSON.stringify({
                  transaction_id: 'XYZ-789',
                  type: 'expense'
                })
              }
            }]
          }
        }],
        usage: { prompt_tokens: 13, completion_tokens: 6, total_tokens: 19 }
      } as any)

      const result = await parseWithAI('correct XYZ-789 to expense', mockUserContext)

      expect(result.action).toBe('edit_transaction')
      expect(result.entities.transactionId).toBe('XYZ-789')
      expect(result.entities.type).toBe('expense')
    })
  })

  describe('AC-8.2.3: Combined type and amount changes', () => {
    it('should parse Portuguese "era receita de 500" with both type and amount', async () => {
      mockCreate.mockResolvedValue({
        choices: [{
          message: {
            tool_calls: [{
              function: {
                name: 'edit_transaction',
                arguments: JSON.stringify({
                  transaction_id: 'EXP-123',
                  type: 'income',
                  amount: 500
                })
              }
            }]
          }
        }],
        usage: { prompt_tokens: 15, completion_tokens: 8, total_tokens: 23 }
      } as any)

      const result = await parseWithAI('EXP-123 era receita de 500', mockUserContext)

      expect(result.action).toBe('edit_transaction')
      expect(result.entities.transactionId).toBe('EXP-123')
      expect(result.entities.type).toBe('income')
      expect(result.entities.amount).toBe(500)
    })

    it('should parse English "should be income of 750" with both type and amount', async () => {
      mockCreate.mockResolvedValue({
        choices: [{
          message: {
            tool_calls: [{
              function: {
                name: 'edit_transaction',
                arguments: JSON.stringify({
                  transaction_id: 'EXP-999',
                  type: 'income',
                  amount: 750
                })
              }
            }]
          }
        }],
        usage: { prompt_tokens: 16, completion_tokens: 8, total_tokens: 24 }
      } as any)

      const result = await parseWithAI('EXP-999 should be income of 750', mockUserContext)

      expect(result.action).toBe('edit_transaction')
      expect(result.entities.transactionId).toBe('EXP-999')
      expect(result.entities.type).toBe('income')
      expect(result.entities.amount).toBe(750)
    })

    it('should parse combined type, amount, and category changes', async () => {
      mockCreate.mockResolvedValue({
        choices: [{
          message: {
            tool_calls: [{
              function: {
                name: 'edit_transaction',
                arguments: JSON.stringify({
                  transaction_id: 'ABC-555',
                  type: 'expense',
                  amount: 100,
                  category: 'comida'
                })
              }
            }]
          }
        }],
        usage: { prompt_tokens: 18, completion_tokens: 10, total_tokens: 28 }
      } as any)

      const result = await parseWithAI('ABC-555 deveria ser despesa de 100 em comida', mockUserContext)

      expect(result.action).toBe('edit_transaction')
      expect(result.entities.transactionId).toBe('ABC-555')
      expect(result.entities.type).toBe('expense')
      expect(result.entities.amount).toBe(100)
      expect(result.entities.category).toBe('comida')
    })
  })

  describe('AC-8.2.3: Type field validation', () => {
    it('should only accept "income" or "expense" as valid type values', async () => {
      mockCreate.mockResolvedValue({
        choices: [{
          message: {
            tool_calls: [{
              function: {
                name: 'edit_transaction',
                arguments: JSON.stringify({
                  transaction_id: 'EXP-123',
                  type: 'income'
                })
              }
            }]
          }
        }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
      } as any)

      const result = await parseWithAI('EXP-123 era receita', mockUserContext)

      expect(result.entities.type).toMatch(/^(income|expense)$/)
    })

    it('should map type field to entities.type correctly', async () => {
      mockCreate.mockResolvedValue({
        choices: [{
          message: {
            tool_calls: [{
              function: {
                name: 'edit_transaction',
                arguments: JSON.stringify({
                  transaction_id: 'TEST-001',
                  type: 'expense'
                })
              }
            }]
          }
        }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
      } as any)

      const result = await parseWithAI('TEST-001 era despesa', mockUserContext)

      // Verify that the type field is correctly mapped in convertFunctionCallToIntent
      expect(result.entities).toHaveProperty('type')
      expect(result.entities.type).toBe('expense')
    })
  })

  describe('Edge cases and error handling', () => {
    it('should handle missing transaction ID gracefully', async () => {
      mockCreate.mockResolvedValue({
        choices: [{
          message: {
            tool_calls: [{
              function: {
                name: 'edit_transaction',
                arguments: JSON.stringify({
                  type: 'income'
                  // missing transaction_id
                })
              }
            }]
          }
        }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
      } as any)

      const result = await parseWithAI('mudar para receita', mockUserContext)

      expect(result.action).toBe('edit_transaction')
      expect(result.entities.type).toBe('income')
      // transactionId will be undefined, which is handled by the handler
    })

    it('should handle AI not recognizing the intent', async () => {
      mockCreate.mockResolvedValue({
        choices: [{
          message: {
            content: 'I did not understand that',
            tool_calls: undefined
          }
        }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
      } as any)

      const result = await parseWithAI('some random text', mockUserContext)

      expect(result.action).toBe('unknown')
      expect(result.confidence).toBe(0.3)
    })

    it('should handle type field being undefined', async () => {
      mockCreate.mockResolvedValue({
        choices: [{
          message: {
            tool_calls: [{
              function: {
                name: 'edit_transaction',
                arguments: JSON.stringify({
                  transaction_id: 'EXP-123',
                  amount: 100
                  // type is not provided
                })
              }
            }]
          }
        }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
      } as any)

      const result = await parseWithAI('EXP-123 alterar para 100', mockUserContext)

      expect(result.action).toBe('edit_transaction')
      expect(result.entities.transactionId).toBe('EXP-123')
      expect(result.entities.amount).toBe(100)
      expect(result.entities.type).toBeUndefined()
    })
  })

  describe('Integration with user context', () => {
    it('should use user context for parsing', async () => {
      const customContext = {
        ...mockUserContext,
        recentCategories: ['custom-category-1', 'custom-category-2']
      }

      mockCreate.mockResolvedValue({
        choices: [{
          message: {
            tool_calls: [{
              function: {
                name: 'edit_transaction',
                arguments: JSON.stringify({
                  transaction_id: 'EXP-123',
                  type: 'income'
                })
              }
            }]
          }
        }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
      } as any)

      const result = await parseWithAI('EXP-123 era receita', customContext)

      expect(result.action).toBe('edit_transaction')
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              role: 'system',
              content: expect.stringContaining('custom-category-1')
            })
          ])
        })
      )
    })
  })

  describe('Quoted message context', () => {
    it('should handle type conversion with quoted message context', async () => {
      mockCreate.mockResolvedValue({
        choices: [{
          message: {
            tool_calls: [{
              function: {
                name: 'edit_transaction',
                arguments: JSON.stringify({
                  transaction_id: 'EXP-123',
                  type: 'income'
                })
              }
            }]
          }
        }],
        usage: { prompt_tokens: 15, completion_tokens: 5, total_tokens: 20 }
      } as any)

      const quotedMessage = 'Você gastou R$ 50 em comida [transaction_id: EXP-123]'
      const result = await parseWithAI('era receita', mockUserContext, quotedMessage)

      expect(result.action).toBe('edit_transaction')
      expect(result.entities.transactionId).toBe('EXP-123')
      expect(result.entities.type).toBe('income')

      // Verify quoted message was included in the API call
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              role: 'user',
              content: expect.stringContaining(quotedMessage)
            })
          ])
        })
      )
    })
  })
})
