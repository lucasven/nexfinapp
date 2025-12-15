/**
 * Unit tests for Auto-Payment Transaction Creator
 * Story 4.3: Auto-Create Payment Transaction
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals'
import {
  createAutoPaymentTransaction,
  formatAutoPaymentDescription,
  type TransactionCreationParams,
} from '../../../services/scheduler/transaction-creator.js'

// Mock dependencies
jest.mock('../../../services/database/supabase-client.js')
jest.mock('../../../services/monitoring/logger.js')
jest.mock('../../../analytics/posthog-client.js')

const mockSupabaseClient = {
  from: jest.fn(),
}

const mockLogger = {
  debug: jest.fn(),
  info: jest.fn(),
  error: jest.fn(),
}

const mockPostHog = {
  capture: jest.fn(),
}

beforeEach(async () => {
  jest.clearAllMocks()

  // Setup default mock implementations
  const { getSupabaseClient } = await import('../../../services/database/supabase-client.js')
  const { logger } = await import('../../../services/monitoring/logger.js')
  const { getPostHog } = await import('../../../analytics/posthog-client.js')

  ;(getSupabaseClient as jest.MockedFunction<typeof getSupabaseClient>).mockReturnValue(mockSupabaseClient as any)
  ;(logger as any).debug = mockLogger.debug
  ;(logger as any).info = mockLogger.info
  ;(logger as any).error = mockLogger.error
})

describe('formatAutoPaymentDescription', () => {
  it('should format description correctly for pt-BR locale', () => {
    const cardName = 'Nubank'
    const statementPeriodEnd = new Date('2025-01-05')
    const locale = 'pt-BR' as const

    const description = formatAutoPaymentDescription(cardName, statementPeriodEnd, locale)

    expect(description).toContain('Pagamento Cartão')
    expect(description).toContain('Nubank')
    expect(description).toContain('Fatura')
    expect(description).toContain('jan')
    expect(description).toContain('2025')
  })

  it('should format description correctly for English locale', () => {
    const cardName = 'Nubank'
    const statementPeriodEnd = new Date('2025-01-05')
    const locale = 'en' as const

    const description = formatAutoPaymentDescription(cardName, statementPeriodEnd, locale)

    expect(description).toContain('Payment')
    expect(description).toContain('Nubank')
    expect(description).toContain('Statement')
    expect(description).toContain('Jan')
    expect(description).toContain('2025')
  })

  it('should handle different card names', () => {
    const statementPeriodEnd = new Date('2025-01-05')
    const locale = 'pt-BR' as const

    const description1 = formatAutoPaymentDescription('C6', statementPeriodEnd, locale)
    expect(description1).toContain('C6')

    const description2 = formatAutoPaymentDescription('Cartão de Crédito', statementPeriodEnd, locale)
    expect(description2).toContain('Cartão de Crédito')
  })
})

describe('createAutoPaymentTransaction', () => {
  const baseParams: TransactionCreationParams = {
    userId: 'user-123',
    paymentMethodId: 'card-456',
    paymentMethodName: 'Nubank',
    statementTotal: 1450.00,
    paymentDueDate: new Date('2025-01-15'),
    statementPeriodStart: new Date('2024-12-06'),
    statementPeriodEnd: new Date('2025-01-05'),
    userLocale: 'pt-BR',
  }

  it('should skip creation if transaction already exists (idempotency)', async () => {
    // Mock existing transaction
    mockSupabaseClient.from.mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                limit: jest.fn().mockReturnValue({
                  maybeSingle: jest.fn().mockResolvedValue({
                    data: { id: 'existing-transaction-123' },
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        }),
      }),
    })

    const result = await createAutoPaymentTransaction(baseParams)

    expect(result.success).toBe(false)
    expect(result.errorType).toBe('already_exists')
    expect(result.error).toBe('already_exists')
  })

  it('should return error if system category not found', async () => {
    // Mock no existing transaction
    mockSupabaseClient.from
      .mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  limit: jest.fn().mockReturnValue({
                    maybeSingle: jest.fn().mockResolvedValue({
                      data: null,
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          }),
        }),
      })
      // Mock system category not found
      .mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              limit: jest.fn().mockReturnValue({
                maybeSingle: jest.fn().mockResolvedValue({
                  data: null,
                  error: null,
                }),
              }),
            }),
          }),
        }),
      })

    const result = await createAutoPaymentTransaction(baseParams)

    expect(result.success).toBe(false)
    expect(result.errorType).toBe('category_not_found')
    expect(result.error).toContain('Story 4.5')
  })

  it('should create transaction successfully with default bank account', async () => {
    const transactionId = 'transaction-789'
    const categoryId = 'category-payment'
    const bankAccountId = 'bank-account-123'

    // Mock no existing transaction
    mockSupabaseClient.from
      .mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  limit: jest.fn().mockReturnValue({
                    maybeSingle: jest.fn().mockResolvedValue({
                      data: null,
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          }),
        }),
      })
      // Mock system category found
      .mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              limit: jest.fn().mockReturnValue({
                maybeSingle: jest.fn().mockResolvedValue({
                  data: { id: categoryId },
                  error: null,
                }),
              }),
            }),
          }),
        }),
      })
      // Mock default bank account found
      .mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                limit: jest.fn().mockReturnValue({
                  maybeSingle: jest.fn().mockResolvedValue({
                    data: { id: bankAccountId },
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        }),
      })
      // Mock transaction insert
      .mockReturnValueOnce({
        insert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: { id: transactionId },
              error: null,
            }),
          }),
        }),
      })

    const result = await createAutoPaymentTransaction(baseParams)

    expect(result.success).toBe(true)
    expect(result.transactionId).toBe(transactionId)
    expect(result.error).toBeUndefined()
  })

  it('should create transaction with NULL payment method if no default bank account', async () => {
    const transactionId = 'transaction-789'
    const categoryId = 'category-payment'

    // Mock no existing transaction
    mockSupabaseClient.from
      .mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  limit: jest.fn().mockReturnValue({
                    maybeSingle: jest.fn().mockResolvedValue({
                      data: null,
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          }),
        }),
      })
      // Mock system category found
      .mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              limit: jest.fn().mockReturnValue({
                maybeSingle: jest.fn().mockResolvedValue({
                  data: { id: categoryId },
                  error: null,
                }),
              }),
            }),
          }),
        }),
      })
      // Mock NO default bank account
      .mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                limit: jest.fn().mockReturnValue({
                  maybeSingle: jest.fn().mockResolvedValue({
                    data: null,
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        }),
      })
      // Mock transaction insert
      .mockReturnValueOnce({
        insert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: { id: transactionId },
              error: null,
            }),
          }),
        }),
      })

    const result = await createAutoPaymentTransaction(baseParams)

    expect(result.success).toBe(true)
    expect(result.transactionId).toBe(transactionId)
  })

  it('should handle database insert errors', async () => {
    const categoryId = 'category-payment'
    const bankAccountId = 'bank-account-123'

    // Mock no existing transaction
    mockSupabaseClient.from
      .mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  limit: jest.fn().mockReturnValue({
                    maybeSingle: jest.fn().mockResolvedValue({
                      data: null,
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          }),
        }),
      })
      // Mock system category found
      .mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              limit: jest.fn().mockReturnValue({
                maybeSingle: jest.fn().mockResolvedValue({
                  data: { id: categoryId },
                  error: null,
                }),
              }),
            }),
          }),
        }),
      })
      // Mock default bank account found
      .mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                limit: jest.fn().mockReturnValue({
                  maybeSingle: jest.fn().mockResolvedValue({
                    data: { id: bankAccountId },
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        }),
      })
      // Mock transaction insert ERROR
      .mockReturnValueOnce({
        insert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: null,
              error: { message: 'Database constraint violation' },
            }),
          }),
        }),
      })

    const result = await createAutoPaymentTransaction(baseParams)

    expect(result.success).toBe(false)
    expect(result.errorType).toBe('database_error')
    expect(result.error).toContain('constraint violation')
  })

  it('should include correct metadata in transaction', async () => {
    const transactionId = 'transaction-789'
    const categoryId = 'category-payment'
    const bankAccountId = 'bank-account-123'

    let insertedData: any = null

    // Mock chain
    mockSupabaseClient.from
      .mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  limit: jest.fn().mockReturnValue({
                    maybeSingle: jest.fn().mockResolvedValue({
                      data: null,
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          }),
        }),
      })
      .mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              limit: jest.fn().mockReturnValue({
                maybeSingle: jest.fn().mockResolvedValue({
                  data: { id: categoryId },
                  error: null,
                }),
              }),
            }),
          }),
        }),
      })
      .mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                limit: jest.fn().mockReturnValue({
                  maybeSingle: jest.fn().mockResolvedValue({
                    data: { id: bankAccountId },
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        }),
      })
      .mockReturnValueOnce({
        insert: jest.fn().mockImplementation((data) => {
          insertedData = data
          return {
            select: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: { id: transactionId },
                error: null,
              }),
            }),
          }
        }),
      })

    await createAutoPaymentTransaction(baseParams)

    expect(insertedData).toBeTruthy()
    expect(insertedData.metadata).toBeTruthy()
    expect(insertedData.metadata.auto_generated).toBe(true)
    expect(insertedData.metadata.source).toBe('payment_reminder')
    expect(insertedData.metadata.credit_card_id).toBe(baseParams.paymentMethodId)
    expect(insertedData.metadata.statement_total).toBe(baseParams.statementTotal)
  })
})
