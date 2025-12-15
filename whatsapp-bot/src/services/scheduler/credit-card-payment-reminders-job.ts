/**
 * Credit Card Payment Reminders Job
 *
 * Story 4.2: Payment Due Reminder - WhatsApp
 *
 * Runs daily to send WhatsApp reminders for credit card payments due in 2 days.
 * Separate from recurring payment reminders (payment-reminders-job.ts).
 *
 * Schedule: 0 12 * * * (12:00 UTC = 9 AM Brazil time)
 * Performance Target: < 30 seconds for all users (NFR6)
 * Success Rate Target: 99.5% delivery (NFR8)
 */

import { logger } from '../monitoring/logger.js'
import { getSocket } from '../../index.js'
import { WhatsAppAnalyticsEvent } from '../../analytics/events.js'
import { getPostHog } from '../../analytics/posthog-client.js'
import { getEligiblePaymentReminders, type EligiblePaymentReminder } from '../reminders/payment-reminder-query.js'
import { calculateStatementTotal } from '../reminders/statement-total-calculator.js'
import { buildPaymentReminderMessage } from '../reminders/reminder-message-builder.js'
import { sendReminderWithRetry, type SendResult } from '../reminders/reminder-sender.js'

export interface CreditCardPaymentRemindersJobResult {
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
async function processBatch(reminders: EligiblePaymentReminder[]): Promise<SendResult[]> {
  const sock = getSocket()

  if (!sock || !sock.user) {
    throw new Error('WhatsApp socket not connected')
  }

  // Process batch in parallel
  const promises = reminders.map(async (reminder) => {
    const startTime = Date.now()

    try {
      // Step 1: Calculate statement total
      const statementTotal = await calculateStatementTotal(
        reminder.user_id,
        reminder.payment_method_id,
        reminder.statement_period_start,
        reminder.statement_period_end
      )

      // Step 2: Build reminder message
      const message = buildPaymentReminderMessage(reminder, statementTotal)

      // Step 3: Send reminder with retry
      const result = await sendReminderWithRetry(
        sock,
        {
          user_id: reminder.user_id,
          payment_method_id: reminder.payment_method_id,
          payment_method_name: reminder.payment_method_name,
          whatsapp_jid: reminder.whatsapp_jid,
          whatsapp_lid: reminder.whatsapp_lid,
          whatsapp_number: reminder.whatsapp_number,
          locale: reminder.user_locale,
          statement_closing_day: reminder.statement_closing_day,
          monthly_budget: null,
        },
        message
      )

      const executionTime = Date.now() - startTime

      // Step 4: Track PostHog event
      const posthog = getPostHog()
      if (posthog) {
        posthog.capture({
          distinctId: reminder.user_id,
          event: result.success
            ? WhatsAppAnalyticsEvent.PAYMENT_REMINDER_SENT
            : WhatsAppAnalyticsEvent.PAYMENT_REMINDER_FAILED,
          properties: {
            userId: reminder.user_id,
            paymentMethodId: reminder.payment_method_id,
            cardName: reminder.payment_method_name,
            statementTotal,
            dueDate: reminder.due_date.toISOString(),
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
        'Failed to process payment reminder',
        {
          userId: reminder.user_id,
          paymentMethodId: reminder.payment_method_id,
          executionTime,
        },
        error as Error
      )

      // Return failed result
      return {
        success: false,
        attempts: 0,
        error: error instanceof Error ? error.message : String(error),
        errorCategory: 'processing_error',
      }
    }
  })

  return Promise.all(promises)
}

/**
 * Run the credit card payment reminders job
 *
 * Flow:
 * 1. Check WhatsApp connection
 * 2. Query eligible users (payments due in 2 days)
 * 3. Process reminders in batches of 10 concurrent
 * 4. Track delivery status for each reminder
 * 5. Report job metrics (eligible, sent, failed, success rate, duration)
 * 6. Alert if success rate < 99% or duration > 30s
 */
export async function runCreditCardPaymentRemindersJob(): Promise<CreditCardPaymentRemindersJobResult> {
  const startTime = Date.now()
  const result: CreditCardPaymentRemindersJobResult = {
    eligibleUsers: 0,
    successfulDeliveries: 0,
    failedDeliveries: 0,
    successRate: 0,
    errors: [],
    durationMs: 0,
  }

  logger.info('Credit card payment reminders job started', {
    timestamp: new Date().toISOString(),
  })

  try {
    // 1. Check WhatsApp connection
    const sock = getSocket()
    if (!sock || !sock.user) {
      logger.warn('WhatsApp socket not connected, skipping payment reminders')
      result.durationMs = Date.now() - startTime
      return result
    }

    // 2. Query eligible users (payments due in 2 days)
    const eligibleReminders = await getEligiblePaymentReminders()

    if (eligibleReminders.length === 0) {
      logger.info('No eligible users for payment reminders today')
      result.durationMs = Date.now() - startTime
      return result
    }

    result.eligibleUsers = eligibleReminders.length

    logger.info('Found eligible users for payment reminders', {
      count: eligibleReminders.length,
    })

    // 3. Process reminders in batches of 10 concurrent
    const BATCH_SIZE = 10
    const batches: typeof eligibleReminders[] = []

    for (let i = 0; i < eligibleReminders.length; i += BATCH_SIZE) {
      batches.push(eligibleReminders.slice(i, i + BATCH_SIZE))
    }

    logger.debug('Processing payment reminders in batches', {
      totalBatches: batches.length,
      batchSize: BATCH_SIZE,
    })

    // Process each batch sequentially, users within batch in parallel
    for (const [batchIndex, batch] of batches.entries()) {
      logger.debug('Processing batch', {
        batchIndex: batchIndex + 1,
        batchSize: batch.length,
      })

      const batchResults = await processBatch(batch)

      // 4. Track delivery status for each reminder
      for (let i = 0; i < batchResults.length; i++) {
        const sendResult = batchResults[i]
        const reminder = batch[i]

        if (sendResult.success) {
          result.successfulDeliveries++
        } else {
          result.failedDeliveries++
          result.errors.push({
            userId: reminder.user_id,
            paymentMethodId: reminder.payment_method_id,
            error: sendResult.error || 'Unknown error',
            errorCategory: sendResult.errorCategory || 'unknown',
            attempts: sendResult.attempts,
          })
        }
      }
    }

    // 5. Calculate success rate and duration
    result.successRate = result.eligibleUsers > 0
      ? Math.round((result.successfulDeliveries / result.eligibleUsers) * 100)
      : 0

    result.durationMs = Date.now() - startTime

    // Track job completion event
    const posthog = getPostHog()
    if (posthog) {
      posthog.capture({
        distinctId: 'system',
        event: WhatsAppAnalyticsEvent.PAYMENT_REMINDER_JOB_COMPLETED,
        properties: {
          eligibleUsers: result.eligibleUsers,
          sentCount: result.successfulDeliveries,
          failedCount: result.failedDeliveries,
          successRate: result.successRate,
          duration: result.durationMs,
          date: new Date().toISOString().split('T')[0],
          timestamp: new Date().toISOString(),
        },
      })
    }

    logger.info('Credit card payment reminders job completed', {
      durationMs: result.durationMs,
      eligible: result.eligibleUsers,
      sent: result.successfulDeliveries,
      failed: result.failedDeliveries,
      successRate: `${result.successRate}%`,
    })

    // 6. Alert if performance targets not met
    if (result.successRate < 99 && result.eligibleUsers > 0) {
      logger.warn('Payment reminder success rate below 99% target', {
        successRate: result.successRate,
        target: 99.5,
      })
    }

    if (result.durationMs > 30000) {
      logger.warn('Payment reminder job exceeded 30 second target', {
        durationMs: result.durationMs,
        target: 30000,
      })
    }

    return result
  } catch (error) {
    result.durationMs = Date.now() - startTime
    logger.error('Credit card payment reminders job failed', {
      durationMs: result.durationMs,
    }, error as Error)
    throw error
  }
}
