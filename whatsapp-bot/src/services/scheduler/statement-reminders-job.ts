/**
 * Statement Reminders Job
 *
 * Runs daily at 9 AM Brazil time to send WhatsApp reminders for:
 * - Statement closing in 3 days
 *
 * Targets:
 * - 99.5% delivery success rate (NFR8)
 * - < 30 seconds execution time (NFR6)
 *
 * Schedule: 0 12 * * * (09:00 BRT = 12:00 UTC)
 */

import { logger } from '../monitoring/logger.js'
import { getSocket } from '../../index.js'
import { WhatsAppAnalyticsEvent } from '../../analytics/events.js'
import { getPostHog } from '../../analytics/posthog-client.js'
import { getEligibleUsersForStatementReminders } from '../reminders/statement-reminder-query.js'
import { getBudgetDataForReminder } from '../reminders/budget-calculator.js'
import { buildReminderMessage } from '../reminders/reminder-message-builder.js'
import { sendReminderWithRetry, type SendResult } from '../reminders/reminder-sender.js'
import type { EligibleUser } from '../reminders/statement-reminder-query.js'

export interface StatementRemindersJobResult {
  eligibleUsers: number
  successfulDeliveries: number
  failedDeliveries: number
  successRate: number
  durationMs: number
  errors: Array<{
    userId: string
    paymentMethodId: string
    error: string
    errorCategory: string
    attempts: number
  }>
}

/**
 * Process reminders for a batch of users (parallel)
 */
async function processBatch(users: EligibleUser[]): Promise<SendResult[]> {
  const sock = getSocket()

  if (!sock || !sock.user) {
    throw new Error('WhatsApp socket not connected')
  }

  // Process batch in parallel
  const promises = users.map(async (user) => {
    const startTime = Date.now()

    try {
      // Step 1: Calculate budget data
      const budgetData = await getBudgetDataForReminder(
        user.payment_method_id,
        user.user_id,
        user.statement_closing_day,
        user.monthly_budget
      )

      // Step 2: Build reminder message
      const message = buildReminderMessage({ user, budgetData })

      // Step 3: Send reminder with retry
      const result = await sendReminderWithRetry(sock, user, message)

      const executionTime = Date.now() - startTime

      // Step 4: Track PostHog event
      const posthog = getPostHog()
      if (posthog) {
        posthog.capture({
          distinctId: user.user_id,
          event: result.success
            ? WhatsAppAnalyticsEvent.STATEMENT_REMINDER_SENT
            : WhatsAppAnalyticsEvent.STATEMENT_REMINDER_FAILED,
          properties: {
            userId: user.user_id,
            paymentMethodId: user.payment_method_id,
            paymentMethodName: user.payment_method_name,
            closingDay: user.statement_closing_day,
            totalSpent: budgetData.totalSpent,
            budgetAmount: budgetData.budget,
            budgetPercentage: budgetData.percentage,
            success: result.success,
            attempts: result.attempts,
            errorMessage: result.error || null,
            errorCategory: result.errorCategory || null,
            executionTime,
            timestamp: new Date().toISOString(),
          },
        })
      }

      return result
    } catch (error) {
      const executionTime = Date.now() - startTime

      logger.error(
        'Error processing statement reminder for user',
        { userId: user.user_id, paymentMethodId: user.payment_method_id },
        error as Error
      )

      // Track failure event
      const posthog = getPostHog()
      if (posthog) {
        posthog.capture({
          distinctId: user.user_id,
          event: WhatsAppAnalyticsEvent.STATEMENT_REMINDER_FAILED,
          properties: {
            userId: user.user_id,
            paymentMethodId: user.payment_method_id,
            paymentMethodName: user.payment_method_name,
            success: false,
            attempts: 0,
            errorMessage: error instanceof Error ? error.message : String(error),
            errorCategory: 'unknown',
            executionTime,
            timestamp: new Date().toISOString(),
          },
        })
      }

      return {
        success: false,
        attempts: 0,
        error: error instanceof Error ? error.message : String(error),
        errorCategory: 'unknown',
      }
    }
  })

  return Promise.all(promises)
}

/**
 * Run the statement reminders job
 */
export async function runStatementRemindersJob(): Promise<StatementRemindersJobResult> {
  const startTime = Date.now()
  const result: StatementRemindersJobResult = {
    eligibleUsers: 0,
    successfulDeliveries: 0,
    failedDeliveries: 0,
    successRate: 0,
    durationMs: 0,
    errors: [],
  }

  logger.info('Statement reminders job started', {
    started_at: new Date().toISOString(),
  })

  try {
    // Check WhatsApp connection
    const sock = getSocket()
    if (!sock || !sock.user) {
      logger.warn('WhatsApp socket not connected, skipping statement reminders')
      result.durationMs = Date.now() - startTime
      return result
    }

    // Step 1: Query eligible users
    const eligibleUsers = await getEligibleUsersForStatementReminders()

    result.eligibleUsers = eligibleUsers.length

    if (eligibleUsers.length === 0) {
      logger.info('No eligible users for statement reminders today')
      result.durationMs = Date.now() - startTime
      return result
    }

    logger.info('Found eligible users for statement reminders', {
      count: eligibleUsers.length,
    })

    // Step 2: Process users in batches of 10 (parallel processing with concurrency limit)
    const batchSize = 10
    const batches: EligibleUser[][] = []

    for (let i = 0; i < eligibleUsers.length; i += batchSize) {
      batches.push(eligibleUsers.slice(i, i + batchSize))
    }

    logger.info('Processing users in batches', {
      totalUsers: eligibleUsers.length,
      batchCount: batches.length,
      batchSize,
    })

    // Process batches sequentially (but users within each batch in parallel)
    for (const [batchIndex, batch] of batches.entries()) {
      logger.debug('Processing batch', {
        batchIndex: batchIndex + 1,
        batchSize: batch.length,
      })

      const batchResults = await processBatch(batch)

      // Collect results
      for (let i = 0; i < batchResults.length; i++) {
        const sendResult = batchResults[i]
        const user = batch[i]

        if (sendResult.success) {
          result.successfulDeliveries++
        } else {
          result.failedDeliveries++
          result.errors.push({
            userId: user.user_id,
            paymentMethodId: user.payment_method_id,
            error: sendResult.error || 'Unknown error',
            errorCategory: sendResult.errorCategory || 'unknown',
            attempts: sendResult.attempts,
          })
        }
      }
    }

    // Calculate success rate
    result.successRate =
      result.eligibleUsers > 0
        ? Math.round((result.successfulDeliveries / result.eligibleUsers) * 100 * 100) / 100
        : 0

    // Alert if success rate below target (99%)
    if (result.successRate < 99 && result.eligibleUsers > 0) {
      logger.warn('Statement reminders success rate below target', {
        successRate: result.successRate,
        target: 99.5,
        successful: result.successfulDeliveries,
        failed: result.failedDeliveries,
      })
    }

    // Track job completion event
    const posthog = getPostHog()
    if (posthog) {
      posthog.capture({
        distinctId: 'system',
        event: WhatsAppAnalyticsEvent.STATEMENT_REMINDER_JOB_COMPLETED,
        properties: {
          eligibleUsers: result.eligibleUsers,
          successfulDeliveries: result.successfulDeliveries,
          failedDeliveries: result.failedDeliveries,
          successRate: result.successRate,
          executionTime: Date.now() - startTime,
          timestamp: new Date().toISOString(),
        },
      })
    }
  } catch (error) {
    logger.error('Statement reminders job failed', {}, error as Error)
    throw error
  } finally {
    result.durationMs = Date.now() - startTime

    logger.info('Statement reminders job completed', {
      duration_ms: result.durationMs,
      eligibleUsers: result.eligibleUsers,
      successfulDeliveries: result.successfulDeliveries,
      failedDeliveries: result.failedDeliveries,
      successRate: result.successRate,
      errors: result.errors.length,
    })

    // Alert if execution time exceeds target (30 seconds)
    if (result.durationMs > 30000) {
      logger.warn('Statement reminders job execution time exceeded target', {
        durationMs: result.durationMs,
        target: 30000,
      })
    }
  }

  return result
}
