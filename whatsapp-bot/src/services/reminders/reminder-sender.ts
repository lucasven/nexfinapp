/**
 * Reminder Sender with Retry Logic
 *
 * Sends WhatsApp reminders with exponential backoff retry for transient errors.
 * Targets 99.5% delivery success rate (NFR8).
 */

import type { WASocket } from '@whiskeysockets/baileys'
import { logger } from '../monitoring/logger.js'
import { isTransientError, getErrorCategory } from './error-classifier.js'
import { getUserJid, type EligibleUser } from './statement-reminder-query.js'

export interface SendResult {
  success: boolean
  attempts: number
  error?: string
  errorCategory?: string
}

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Send a reminder with exponential backoff retry
 *
 * Retry strategy:
 * - Attempt 1: Send immediately
 * - Attempt 2: Wait 1 second (if transient error)
 * - Attempt 3: Wait 5 seconds (if transient error)
 * - Max 3 attempts total
 *
 * Returns:
 * - success: true if message sent successfully
 * - attempts: number of attempts made
 * - error: error message (if failed)
 * - errorCategory: classified error type (for analytics)
 */
export async function sendReminderWithRetry(
  sock: WASocket,
  user: EligibleUser,
  message: string,
  maxRetries = 3
): Promise<SendResult> {
  const jid = getUserJid(user)

  if (!jid) {
    logger.warn('User has no valid WhatsApp identifier', {
      userId: user.user_id,
    })
    return {
      success: false,
      attempts: 0,
      error: 'No valid WhatsApp identifier',
      errorCategory: 'invalid_number',
    }
  }

  let lastError: Error | unknown = null
  let lastErrorCategory = 'unknown'

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      logger.debug('Sending statement reminder', {
        userId: user.user_id,
        jid,
        attempt,
        maxRetries,
      })

      // Send message via Baileys
      await sock.sendMessage(jid, { text: message })

      logger.info('Statement reminder sent successfully', {
        userId: user.user_id,
        paymentMethodId: user.payment_method_id,
        attempts: attempt,
      })

      return {
        success: true,
        attempts: attempt,
      }
    } catch (error) {
      lastError = error
      lastErrorCategory = getErrorCategory(error)

      logger.warn('Failed to send statement reminder', {
        userId: user.user_id,
        paymentMethodId: user.payment_method_id,
        attempt,
        maxRetries,
        errorCategory: lastErrorCategory,
        error: error instanceof Error ? error.message : String(error),
      })

      // Check if error is transient and we have retries left
      const shouldRetry = isTransientError(error) && attempt < maxRetries

      if (shouldRetry) {
        // Calculate backoff: 1s, 5s, 15s
        const backoffMs = Math.pow(5, attempt - 1) * 1000

        logger.debug('Retrying statement reminder after backoff', {
          userId: user.user_id,
          attempt,
          backoffMs,
        })

        await sleep(backoffMs)
        continue
      }

      // Permanent error or no retries left
      logger.error('Statement reminder failed permanently', {
        userId: user.user_id,
        paymentMethodId: user.payment_method_id,
        attempts: attempt,
        errorCategory: lastErrorCategory,
      })

      return {
        success: false,
        attempts: attempt,
        error: error instanceof Error ? error.message : String(error),
        errorCategory: lastErrorCategory,
      }
    }
  }

  // Should never reach here, but TypeScript needs it
  return {
    success: false,
    attempts: maxRetries,
    error: lastError instanceof Error ? lastError.message : String(lastError),
    errorCategory: lastErrorCategory,
  }
}
