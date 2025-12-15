/**
 * Unit tests for Auto-Payment Transactions Job
 * Story 4.3: Auto-Create Payment Transaction
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals'
import { processAutoPaymentTransactions } from '../../../services/scheduler/auto-payment-transactions-job.js'

// Mock dependencies
jest.mock('../../../services/database/supabase-client.js')
jest.mock('../../../services/monitoring/logger.js')
jest.mock('../../../analytics/posthog-client.js')
jest.mock('../../../services/reminders/statement-total-calculator.js')
jest.mock('../../../services/scheduler/transaction-creator.js')
jest.mock('../../../utils/statement-period-helpers.js')

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

describe('processAutoPaymentTransactions', () => {
  it('should return early if no statements closed yesterday', async () => {
    // Mock empty eligibility query result
    mockSupabaseClient.from.mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            not: jest.fn().mockResolvedValue({
              data: [],
              error: null,
            }),
          }),
        }),
      }),
    })

    const result = await processAutoPaymentTransactions()

    expect(result.statementsClosed).toBe(0)
    expect(result.transactionsCreated).toBe(0)
    expect(result.transactionsSkipped).toBe(0)
    expect(result.transactionsFailed).toBe(0)
  })

  it('should query statements that closed yesterday', async () => {
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const expectedClosingDay = yesterday.getDate()

    let capturedClosingDay: number | null = null

    mockSupabaseClient.from.mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockImplementation((field: string, value: any) => {
          if (field === 'statement_closing_day') {
            capturedClosingDay = value
          }
          return {
            eq: jest.fn().mockReturnValue({
              not: jest.fn().mockResolvedValue({
                data: [],
                error: null,
              }),
            }),
          }
        }),
      }),
    })

    await processAutoPaymentTransactions()

    expect(capturedClosingDay).toBe(expectedClosingDay)
  })

  it('should process eligible statements and create transactions', async () => {
    const { calculateStatementTotal } = await import('../../../services/reminders/statement-total-calculator.js')
    const { createAutoPaymentTransaction } = await import('../../../services/scheduler/transaction-creator.js')
    const { getStatementPeriod } = await import('../../../utils/statement-period-helpers.js')

    // Mock eligible statements
    const mockStatements = [
      {
        id: 'card-1',
        user_id: 'user-1',
        name: 'Nubank',
        statement_closing_day: 5,
        payment_due_day: 10,
        users: { locale: 'pt-BR' },
      },
      {
        id: 'card-2',
        user_id: 'user-2',
        name: 'C6',
        statement_closing_day: 5,
        payment_due_day: 15,
        users: { locale: 'en' },
      },
    ]

    mockSupabaseClient.from.mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            not: jest.fn().mockResolvedValue({
              data: mockStatements,
              error: null,
            }),
          }),
        }),
      }),
    })

    // Mock statement period calculation
    (getStatementPeriod as jest.MockedFunction<typeof getStatementPeriod>).mockReturnValue({
      start: new Date('2024-12-06'),
      end: new Date('2025-01-05'),
    })

    // Mock statement total calculation
    (calculateStatementTotal as jest.MockedFunction<typeof calculateStatementTotal>).mockResolvedValue(1450.00)

    // Mock successful transaction creation
    (createAutoPaymentTransaction as jest.MockedFunction<typeof createAutoPaymentTransaction>).mockResolvedValue({
      success: true,
      transactionId: 'transaction-123',
    })

    const result = await processAutoPaymentTransactions()

    expect(result.statementsClosed).toBe(2)
    expect(result.transactionsCreated).toBe(2)
    expect(result.transactionsSkipped).toBe(0)
    expect(result.transactionsFailed).toBe(0)
    expect(result.successRate).toBe(100)
  })

  it('should handle idempotency (transaction already exists)', async () => {
    const { calculateStatementTotal } = await import('../../../services/reminders/statement-total-calculator.js')
    const { createAutoPaymentTransaction } = await import('../../../services/scheduler/transaction-creator.js')
    const { getStatementPeriod } = await import('../../../utils/statement-period-helpers.js')

    // Mock one eligible statement
    const mockStatements = [
      {
        id: 'card-1',
        user_id: 'user-1',
        name: 'Nubank',
        statement_closing_day: 5,
        payment_due_day: 10,
        users: { locale: 'pt-BR' },
      },
    ]

    mockSupabaseClient.from.mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            not: jest.fn().mockResolvedValue({
              data: mockStatements,
              error: null,
            }),
          }),
        }),
      }),
    })

    (getStatementPeriod as jest.MockedFunction<typeof getStatementPeriod>).mockReturnValue({
      start: new Date('2024-12-06'),
      end: new Date('2025-01-05'),
    })

    (calculateStatementTotal as jest.MockedFunction<typeof calculateStatementTotal>).mockResolvedValue(1450.00)

    // Mock transaction already exists (idempotency)
    (createAutoPaymentTransaction as jest.MockedFunction<typeof createAutoPaymentTransaction>).mockResolvedValue({
      success: false,
      error: 'already_exists',
      errorType: 'already_exists',
    })

    const result = await processAutoPaymentTransactions()

    expect(result.statementsClosed).toBe(1)
    expect(result.transactionsCreated).toBe(0)
    expect(result.transactionsSkipped).toBe(1)
    expect(result.transactionsFailed).toBe(0)
  })

  it('should handle transaction creation failures', async () => {
    const { calculateStatementTotal } = await import('../../../services/reminders/statement-total-calculator.js')
    const { createAutoPaymentTransaction } = await import('../../../services/scheduler/transaction-creator.js')
    const { getStatementPeriod } = await import('../../../utils/statement-period-helpers.js')

    // Mock one eligible statement
    const mockStatements = [
      {
        id: 'card-1',
        user_id: 'user-1',
        name: 'Nubank',
        statement_closing_day: 5,
        payment_due_day: 10,
        users: { locale: 'pt-BR' },
      },
    ]

    mockSupabaseClient.from.mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            not: jest.fn().mockResolvedValue({
              data: mockStatements,
              error: null,
            }),
          }),
        }),
      }),
    })

    (getStatementPeriod as jest.MockedFunction<typeof getStatementPeriod>).mockReturnValue({
      start: new Date('2024-12-06'),
      end: new Date('2025-01-05'),
    })

    (calculateStatementTotal as jest.MockedFunction<typeof calculateStatementTotal>).mockResolvedValue(1450.00)

    // Mock transaction creation failure
    (createAutoPaymentTransaction as jest.MockedFunction<typeof createAutoPaymentTransaction>).mockResolvedValue({
      success: false,
      error: 'Database constraint violation',
      errorType: 'database_error',
    })

    const result = await processAutoPaymentTransactions()

    expect(result.statementsClosed).toBe(1)
    expect(result.transactionsCreated).toBe(0)
    expect(result.transactionsSkipped).toBe(0)
    expect(result.transactionsFailed).toBe(1)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].errorType).toBe('database_error')
  })

  it('should handle mixed results (success, skip, failure)', async () => {
    const { calculateStatementTotal } = await import('../../../services/reminders/statement-total-calculator.js')
    const { createAutoPaymentTransaction } = await import('../../../services/scheduler/transaction-creator.js')
    const { getStatementPeriod } = await import('../../../utils/statement-period-helpers.js')

    // Mock three eligible statements
    const mockStatements = [
      {
        id: 'card-1',
        user_id: 'user-1',
        name: 'Nubank',
        statement_closing_day: 5,
        payment_due_day: 10,
        users: { locale: 'pt-BR' },
      },
      {
        id: 'card-2',
        user_id: 'user-2',
        name: 'C6',
        statement_closing_day: 5,
        payment_due_day: 15,
        users: { locale: 'en' },
      },
      {
        id: 'card-3',
        user_id: 'user-3',
        name: 'Inter',
        statement_closing_day: 5,
        payment_due_day: 20,
        users: { locale: 'pt-BR' },
      },
    ]

    mockSupabaseClient.from.mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            not: jest.fn().mockResolvedValue({
              data: mockStatements,
              error: null,
            }),
          }),
        }),
      }),
    })

    (getStatementPeriod as jest.MockedFunction<typeof getStatementPeriod>).mockReturnValue({
      start: new Date('2024-12-06'),
      end: new Date('2025-01-05'),
    })

    (calculateStatementTotal as jest.MockedFunction<typeof calculateStatementTotal>).mockResolvedValue(1450.00)

    // Mock different results for each statement
    (createAutoPaymentTransaction)
      .mockResolvedValueOnce({
        success: true,
        transactionId: 'transaction-1',
      })
      .mockResolvedValueOnce({
        success: false,
        error: 'already_exists',
        errorType: 'already_exists',
      })
      .mockResolvedValueOnce({
        success: false,
        error: 'Database error',
        errorType: 'database_error',
      })

    const result = await processAutoPaymentTransactions()

    expect(result.statementsClosed).toBe(3)
    expect(result.transactionsCreated).toBe(1)
    expect(result.transactionsSkipped).toBe(1)
    expect(result.transactionsFailed).toBe(1)
    expect(result.successRate).toBeCloseTo(33.33, 1)
    expect(result.errors).toHaveLength(1)
  })

  it('should complete within performance target', async () => {
    const { calculateStatementTotal } = await import('../../../services/reminders/statement-total-calculator.js')
    const { createAutoPaymentTransaction } = await import('../../../services/scheduler/transaction-creator.js')
    const { getStatementPeriod } = await import('../../../utils/statement-period-helpers.js')

    // Mock 10 eligible statements
    const mockStatements = Array.from({ length: 10 }, (_, i) => ({
      id: `card-${i}`,
      user_id: `user-${i}`,
      name: `Card ${i}`,
      statement_closing_day: 5,
      payment_due_day: 10,
      users: { locale: 'pt-BR' },
    }))

    mockSupabaseClient.from.mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            not: jest.fn().mockResolvedValue({
              data: mockStatements,
              error: null,
            }),
          }),
        }),
      }),
    })

    (getStatementPeriod as jest.MockedFunction<typeof getStatementPeriod>).mockReturnValue({
      start: new Date('2024-12-06'),
      end: new Date('2025-01-05'),
    })

    (calculateStatementTotal as jest.MockedFunction<typeof calculateStatementTotal>).mockResolvedValue(1450.00)

    (createAutoPaymentTransaction as jest.MockedFunction<typeof createAutoPaymentTransaction>).mockResolvedValue({
      success: true,
      transactionId: 'transaction-123',
    })

    const result = await processAutoPaymentTransactions()

    // Performance target: < 30 seconds for 100 statements
    // For 10 statements, should be much faster (< 3 seconds)
    expect(result.durationMs).toBeLessThan(3000)
    expect(result.transactionsCreated).toBe(10)
  })

  it('should track PostHog job completion event', async () => {
    // Mock empty result
    mockSupabaseClient.from.mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            not: jest.fn().mockResolvedValue({
              data: [],
              error: null,
            }),
          }),
        }),
      }),
    })

    await processAutoPaymentTransactions()

    expect(mockPostHog.capture).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'auto_payment_job_completed',
      })
    )
  })
})
