/**
 * Auto-Payment Transactions Job
 *
 * Story 4.3: Auto-Create Payment Transaction
 *
 * Daily cron job that creates auto-payment transactions for credit card
 * statements that closed YESTERDAY. Runs at 1 AM Brazil time (4 AM UTC) daily.
 *
 * Schedule: 0 4 * * * (1 AM Brazil time = 4 AM UTC)
 * Performance Target: < 30 seconds for 100 statements (derived from NFR6)
 * Success Rate Target: 100% (NFR12)
 */

import { logger } from '../monitoring/logger.js'
import { getPostHog } from '../../analytics/posthog-client.js'
import { WhatsAppAnalyticsEvent } from '../../analytics/events.js'
import { getSupabaseClient } from '../database/supabase-client.js'
import { calculateStatementTotal } from '../reminders/statement-total-calculator.js'
import {
  createAutoPaymentTransaction,
  type TransactionCreationParams,
  type TransactionCreationResult,
} from './transaction-creator.js'
import { getStatementPeriod } from '../../utils/statement-period-helpers.js'
import { addDays } from 'date-fns'

export interface EligibleStatement {
  payment_method_id: string
  user_id: string
  payment_method_name: string
  statement_closing_day: number
  payment_due_day: number
  days_before_closing: number | null
  user_locale: 'pt-BR' | 'en'
}

export interface AutoPaymentJobResult {
  statementsClosed: number
  transactionsCreated: number
  transactionsSkipped: number
  transactionsFailed: number
  totalAmount: number
  durationMs: number
  successRate: number
  errors: Array<{
    userId: string
    paymentMethodId: string
    error: string
    errorType: string
  }>
}

/**
 * Query statements that closed YESTERDAY
 *
 * Eligibility:
 * - credit_mode = true
 * - statement_closing_day = EXTRACT(DAY FROM CURRENT_DATE - 1)
 * - payment_due_day IS NOT NULL
 *
 * Example: If today is Jan 6, find all cards with statement_closing_day = 5
 *
 * @returns List of eligible statements
 */
async function getEligibleStatements(): Promise<EligibleStatement[]> {
  const supabase = getSupabaseClient()

  // Calculate yesterday's day of month
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const closingDay = yesterday.getDate()

  logger.debug('Querying eligible statements', { closingDay })

  // Query for eligible payment methods
  // With new model, we calculate which cards closed yesterday dynamically
  const { data: paymentMethods, error: pmError } = await supabase
    .from('payment_methods')
    .select(`
      id,
      user_id,
      name,
      statement_closing_day,
      payment_due_day,
      days_before_closing
    `)
    .eq('credit_mode', true)
    .not('payment_due_day', 'is', null)

  if (pmError) {
    logger.error('Error querying eligible statements', {}, pmError)
    throw new Error('Failed to query eligible statements')
  }

  if (!paymentMethods || paymentMethods.length === 0) {
    return []
  }

  // Filter cards that closed yesterday
  const filteredMethods = paymentMethods.filter(pm => {
    if (pm.days_before_closing !== null && pm.payment_due_day !== null) {
      // New model: calculate closing date
      const paymentDate = new Date(yesterday.getFullYear(), yesterday.getMonth(), pm.payment_due_day)
      const closingDate = new Date(paymentDate)
      closingDate.setDate(closingDate.getDate() - pm.days_before_closing)
      return closingDate.getDate() === closingDay
    } else if (pm.statement_closing_day !== null) {
      // Old model
      return pm.statement_closing_day === closingDay
    }
    return false
  })

  if (filteredMethods.length === 0) {
    return []
  }

  // Get unique user IDs
  const userIds = [...new Set(filteredMethods.map(pm => pm.user_id))]

  // Query user_profiles for locale
  const { data: profiles, error: profileError } = await supabase
    .from('user_profiles')
    .select('user_id, locale')
    .in('user_id', userIds)

  if (profileError) {
    logger.error('Error querying user profiles', {}, profileError)
    throw new Error('Failed to query user profiles')
  }

  // Build locale lookup map
  const localeMap = new Map<string, string>()
  for (const profile of profiles || []) {
    localeMap.set(profile.user_id, profile.locale || 'pt-BR')
  }

  // Transform data to expected format
  return filteredMethods.map((pm) => ({
    payment_method_id: pm.id,
    user_id: pm.user_id,
    payment_method_name: pm.name || 'Cartão de Crédito',
    statement_closing_day: pm.statement_closing_day ?? closingDay,
    payment_due_day: pm.payment_due_day!,
    days_before_closing: pm.days_before_closing,
    user_locale: (localeMap.get(pm.user_id) || 'pt-BR') as 'pt-BR' | 'en',
  }))
}

/**
 * Process auto-payment creation for a single statement
 *
 * Steps:
 * 1. Calculate statement period (closing_day, closing_date)
 * 2. Calculate statement total (transactions + installments)
 * 3. Calculate payment due date (closing_date + payment_due_day)
 * 4. Create auto-payment transaction
 * 5. Track success/failure
 *
 * @param statement Eligible statement to process
 * @returns Transaction creation result
 */
async function processStatement(statement: EligibleStatement): Promise<TransactionCreationResult> {
  const startTime = performance.now()

  try {
    logger.debug('Processing statement', {
      userId: statement.user_id,
      paymentMethodId: statement.payment_method_id,
      closingDay: statement.statement_closing_day,
    })

    // Step 1: Calculate statement period
    // Statement closed YESTERDAY, so use yesterday as reference
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)

    const period = getStatementPeriod(yesterday, statement.statement_closing_day)

    logger.debug('Statement period calculated', {
      userId: statement.user_id,
      periodStart: period.periodStart.toISOString(),
      periodEnd: period.periodEnd.toISOString(),
    })

    // Step 2: Calculate statement total
    const statementTotal = await calculateStatementTotal(
      statement.user_id,
      statement.payment_method_id,
      period.periodStart,
      period.periodEnd
    )

    logger.debug('Statement total calculated', {
      userId: statement.user_id,
      total: statementTotal,
    })

    // Step 3: Calculate payment due date
    // closing_date + payment_due_day
    const closingDate = period.periodEnd
    const paymentDueDate = addDays(closingDate, statement.payment_due_day)

    logger.debug('Payment due date calculated', {
      userId: statement.user_id,
      dueDate: paymentDueDate.toISOString(),
    })

    // Step 4: Create auto-payment transaction
    const params: TransactionCreationParams = {
      userId: statement.user_id,
      paymentMethodId: statement.payment_method_id,
      paymentMethodName: statement.payment_method_name,
      statementTotal,
      paymentDueDate,
      statementPeriodStart: period.periodStart,
      statementPeriodEnd: period.periodEnd,
      userLocale: statement.user_locale,
    }

    const result = await createAutoPaymentTransaction(params)

    const executionTime = performance.now() - startTime

    if (result.success) {
      logger.info('Auto-payment transaction created', {
        userId: statement.user_id,
        paymentMethodId: statement.payment_method_id,
        transactionId: result.transactionId,
        amount: statementTotal,
        dueDate: paymentDueDate.toISOString(),
        executionTime: `${executionTime.toFixed(2)}ms`,
      })
    } else if (result.errorType === 'already_exists') {
      logger.info('Auto-payment transaction already exists (skipped)', {
        userId: statement.user_id,
        paymentMethodId: statement.payment_method_id,
        executionTime: `${executionTime.toFixed(2)}ms`,
      })
    } else {
      logger.error('Failed to create auto-payment transaction', {
        userId: statement.user_id,
        paymentMethodId: statement.payment_method_id,
        error: result.error,
        errorType: result.errorType,
        executionTime: `${executionTime.toFixed(2)}ms`,
      })

      // Track failure event
      const posthog = getPostHog()
      if (posthog) {
        posthog.capture({
          distinctId: statement.user_id,
          event: WhatsAppAnalyticsEvent.AUTO_PAYMENT_CREATION_FAILED,
          properties: {
            userId: statement.user_id,
            paymentMethodId: statement.payment_method_id,
            errorType: result.errorType,
            errorMessage: result.error,
            statementPeriodEnd: period.periodEnd.toISOString(),
            timestamp: new Date().toISOString(),
          },
        })
      }
    }

    return result
  } catch (error) {
    const executionTime = performance.now() - startTime

    logger.error(
      'Failed to process statement',
      {
        userId: statement.user_id,
        paymentMethodId: statement.payment_method_id,
        executionTime: `${executionTime.toFixed(2)}ms`,
      },
      error as Error
    )

    // Track failure event
    const posthog = getPostHog()
    if (posthog) {
      posthog.capture({
        distinctId: statement.user_id,
        event: WhatsAppAnalyticsEvent.AUTO_PAYMENT_CREATION_FAILED,
        properties: {
          userId: statement.user_id,
          paymentMethodId: statement.payment_method_id,
          errorType: 'unknown',
          errorMessage: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString(),
        },
      })
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      errorType: 'unknown',
    }
  }
}

/**
 * Process statements in batches (parallel within batch, sequential across batches)
 *
 * @param statements Eligible statements to process
 * @returns Array of transaction creation results
 */
async function processBatch(statements: EligibleStatement[]): Promise<TransactionCreationResult[]> {
  const promises = statements.map((statement) => processStatement(statement))
  return Promise.all(promises)
}

/**
 * Run the auto-payment transactions job
 *
 * Flow:
 * 1. Query eligible statements (closed yesterday)
 * 2. Process statements in batches of 10 concurrent
 * 3. Track creation status for each statement
 * 4. Report job metrics (statements closed, created, skipped, failed, success rate, duration)
 * 5. Alert if success rate < 100% or duration > 30s
 */
export async function processAutoPaymentTransactions(): Promise<AutoPaymentJobResult> {
  const startTime = Date.now()
  const result: AutoPaymentJobResult = {
    statementsClosed: 0,
    transactionsCreated: 0,
    transactionsSkipped: 0,
    transactionsFailed: 0,
    totalAmount: 0,
    durationMs: 0,
    successRate: 0,
    errors: [],
  }

  logger.info('Auto-payment transactions job started', {
    timestamp: new Date().toISOString(),
  })

  try {
    // 1. Query eligible statements (closed yesterday)
    const eligibleStatements = await getEligibleStatements()

    if (eligibleStatements.length === 0) {
      logger.info('No statements closed yesterday')
      result.durationMs = Date.now() - startTime
      return result
    }

    result.statementsClosed = eligibleStatements.length

    logger.info('Found statements closed yesterday', {
      count: eligibleStatements.length,
    })

    // 2. Process statements in batches of 10 concurrent
    const BATCH_SIZE = 10
    const batches: typeof eligibleStatements[] = []

    for (let i = 0; i < eligibleStatements.length; i += BATCH_SIZE) {
      batches.push(eligibleStatements.slice(i, i + BATCH_SIZE))
    }

    logger.debug('Processing statements in batches', {
      totalBatches: batches.length,
      batchSize: BATCH_SIZE,
    })

    // Process each batch sequentially, statements within batch in parallel
    for (const [batchIndex, batch] of batches.entries()) {
      logger.debug('Processing batch', {
        batchIndex: batchIndex + 1,
        batchSize: batch.length,
      })

      const batchResults = await processBatch(batch)

      // 3. Track creation status
      for (const [index, transactionResult] of batchResults.entries()) {
        const statement = batch[index]

        if (transactionResult.success) {
          result.transactionsCreated++
        } else if (transactionResult.errorType === 'already_exists') {
          result.transactionsSkipped++
        } else {
          result.transactionsFailed++
          result.errors.push({
            userId: statement.user_id,
            paymentMethodId: statement.payment_method_id,
            error: transactionResult.error || 'Unknown error',
            errorType: transactionResult.errorType || 'unknown',
          })
        }
      }
    }

    // Calculate success rate
    const totalProcessed = result.transactionsCreated + result.transactionsSkipped + result.transactionsFailed
    result.successRate = totalProcessed > 0
      ? (result.transactionsCreated / result.statementsClosed) * 100
      : 0

    result.durationMs = Date.now() - startTime

    // 4. Report job metrics
    logger.info('Auto-payment transactions job completed', {
      statementsClosed: result.statementsClosed,
      transactionsCreated: result.transactionsCreated,
      transactionsSkipped: result.transactionsSkipped,
      transactionsFailed: result.transactionsFailed,
      successRate: `${result.successRate.toFixed(2)}%`,
      durationMs: result.durationMs,
    })

    // Track job completion event
    const posthog = getPostHog()
    if (posthog) {
      posthog.capture({
        distinctId: 'system',
        event: WhatsAppAnalyticsEvent.AUTO_PAYMENT_JOB_COMPLETED,
        properties: {
          statementsClosed: result.statementsClosed,
          transactionsCreated: result.transactionsCreated,
          transactionsSkipped: result.transactionsSkipped,
          transactionsFailed: result.transactionsFailed,
          totalAmount: result.totalAmount,
          durationMs: result.durationMs,
          successRate: result.successRate,
          timestamp: new Date().toISOString(),
        },
      })
    }

    // 5. Alert if success rate < 100% or duration > 30s
    if (result.successRate < 100) {
      logger.warn('Auto-payment job success rate below 100%', {
        successRate: `${result.successRate.toFixed(2)}%`,
        failures: result.transactionsFailed,
      })
    }

    if (result.durationMs > 30000) {
      logger.warn('Auto-payment job execution time exceeded 30 seconds', {
        durationMs: result.durationMs,
        statementsClosed: result.statementsClosed,
      })
    }

    return result
  } catch (error) {
    result.durationMs = Date.now() - startTime

    logger.error(
      'Auto-payment transactions job failed',
      {
        durationMs: result.durationMs,
      },
      error as Error
    )

    return result
  }
}
