/**
 * Message Sender Service
 *
 * Manages the engagement message queue with idempotency,
 * retry logic, and delivery tracking.
 *
 * Epic: 1 - Foundation & Message Infrastructure
 * Story: 1.3 - Engagement Service Directory Structure (types)
 * Story: 1.6 - Message Queue Service Foundation (implementation)
 * Story: 4.6 - Message Routing Service (destination routing)
 */

import { logger } from '../monitoring/logger.js'
import { getSupabaseClient } from '../database/supabase-client.js'
import type { MessageType, QueuedMessage } from '../engagement/types.js'
import { MAX_MESSAGE_RETRIES } from '../engagement/constants.js'
import { getMessageDestination, type RouteResult } from '../engagement/message-router.js'
import { getSocket } from '../../index.js'
import { messages as ptBRMessages } from '../../localization/pt-br.js'
import { messages as enMessages } from '../../localization/en.js'

export interface QueueMessageParams {
  userId: string
  messageType: MessageType
  messageKey: string
  messageParams?: Record<string, unknown>
  destination: 'individual' | 'group'
  destinationJid: string
  scheduledFor?: Date
  idempotencyKey?: string
}

export interface ProcessResult {
  processed: number
  succeeded: number
  failed: number
  errors: Array<{ messageId: string; error: string }>
}

/**
 * Generate an idempotency key for a message
 *
 * Format: {userId}:{eventType}:{YYYY-MM-DD}
 * This ensures only one message of each type per user per day
 *
 * @param userId - The user's ID
 * @param eventType - The type of event (e.g., 'goodbye', 'weekly_review')
 * @param date - The date for the key (defaults to today)
 * @returns The idempotency key
 */
export function getIdempotencyKey(
  userId: string,
  eventType: string,
  date: Date = new Date()
): string {
  const dateStr = date.toISOString().split('T')[0] // YYYY-MM-DD
  return `${userId}:${eventType}:${dateStr}`
}

/**
 * Queue a proactive message for delivery
 *
 * If a message with the same idempotency key already exists,
 * this operation is silently ignored (upsert behavior).
 *
 * @param params - Message configuration
 * @returns True if message was queued (or already exists)
 */
export async function queueMessage(
  params: QueueMessageParams
): Promise<boolean> {
  const supabase = getSupabaseClient()

  // Use custom idempotency key if provided, otherwise generate default
  const idempotencyKey = params.idempotencyKey || getIdempotencyKey(
    params.userId,
    params.messageType,
    params.scheduledFor || new Date()
  )

  logger.info('Queueing engagement message', {
    userId: params.userId,
    messageType: params.messageType,
    messageKey: params.messageKey,
    idempotencyKey,
  })

  try {
    // Insert with ON CONFLICT DO NOTHING for idempotency
    const { error } = await supabase
      .from('engagement_message_queue')
      .upsert(
        {
          user_id: params.userId,
          message_type: params.messageType,
          message_key: params.messageKey,
          message_params: params.messageParams || {},
          destination: params.destination,
          destination_jid: params.destinationJid,
          scheduled_for: (params.scheduledFor || new Date()).toISOString(),
          status: 'pending',
          retry_count: 0,
          idempotency_key: idempotencyKey,
        },
        {
          onConflict: 'idempotency_key',
          ignoreDuplicates: true,
        }
      )

    if (error) {
      logger.error('Failed to queue message', {
        error: error.message,
        userId: params.userId,
        messageType: params.messageType,
      })
      return false
    }

    logger.info('Message queued successfully', {
      userId: params.userId,
      messageType: params.messageType,
      idempotencyKey,
    })

    return true
  } catch (error) {
    logger.error('Unexpected error queueing message', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: params.userId,
      messageType: params.messageType,
    })
    return false
  }
}

/**
 * Get the correct destination JID for a message at send time
 *
 * AC-4.6.1, AC-4.6.2: Routes to correct destination based on user preference
 * AC-4.6.7: Falls back to individual if group preference but no group JID
 *
 * Story 4.6: Destination is resolved at SEND TIME (not queue time)
 * so that user's latest preference is always used
 *
 * @param userId - The user's ID
 * @param fallbackJid - JID to use if routing fails
 * @returns The destination JID to send to
 */
export async function resolveDestinationJid(
  userId: string,
  fallbackJid: string
): Promise<{ jid: string; destination: 'individual' | 'group'; fallbackUsed: boolean }> {
  try {
    const routeResult = await getMessageDestination(userId)

    if (!routeResult) {
      logger.warn('No route found for user, using fallback', { userId, fallbackJid })
      return {
        jid: fallbackJid,
        destination: 'individual',
        fallbackUsed: true,
      }
    }

    if (routeResult.fallbackUsed) {
      logger.info('Route fallback used', {
        userId,
        destination: routeResult.destination,
      })
    }

    return {
      jid: routeResult.destinationJid,
      destination: routeResult.destination,
      fallbackUsed: routeResult.fallbackUsed,
    }
  } catch (error) {
    logger.error('Error resolving destination JID', { userId }, error as Error)
    return {
      jid: fallbackJid,
      destination: 'individual',
      fallbackUsed: true,
    }
  }
}

/**
 * Helper function to sleep for a specified duration
 * @param ms - Milliseconds to sleep
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Resolve a localization key to actual message text
 *
 * AC-5.4.1: Supports nested keys and function calls with params
 *
 * @param messageKey - Nested localization key (e.g., 'engagementGoodbyeSelfSelect')
 * @param messageParams - Optional parameters for localization functions
 * @param locale - User's locale (pt-BR or en)
 * @returns Localized message text
 */
function resolveMessageText(
  messageKey: string,
  messageParams: Record<string, unknown> | null,
  locale: string
): string {
  const localization = locale === 'pt-BR' ? ptBRMessages : enMessages

  try {
    // Navigate through nested keys (e.g., 'engagement.goodbye.self_select')
    // For our current localization structure, keys are flat (e.g., 'engagementGoodbyeSelfSelect')
    const keys = messageKey.split('.')
    let value: any = localization

    for (const key of keys) {
      value = value[key]
      if (value === undefined) {
        logger.warn('Localization key not found', { messageKey, locale })
        return `[Missing translation: ${messageKey}]`
      }
    }

    // If value is a function, call it with params
    if (typeof value === 'function') {
      return value(messageParams || {})
    }

    // Return string value
    return value
  } catch (error) {
    logger.error('Error resolving message text', {
      messageKey,
      locale,
      error: error instanceof Error ? error.message : 'Unknown error'
    })
    return `[Translation error: ${messageKey}]`
  }
}

/**
 * Mark a message as sent in the database
 *
 * AC-5.4.1: Updates status='sent' and sets sent_at timestamp
 *
 * @param messageId - The message ID
 * @param sentAt - When the message was sent
 */
async function markMessageSent(messageId: string, sentAt: Date): Promise<void> {
  const supabase = getSupabaseClient()

  const { error } = await supabase
    .from('engagement_message_queue')
    .update({
      status: 'sent',
      sent_at: sentAt.toISOString()
    })
    .eq('id', messageId)

  if (error) {
    logger.error('Failed to mark message as sent', { messageId, error: error.message })
    // Don't throw - log and continue for eventual consistency
  } else {
    logger.debug('Message marked as sent', { messageId })
  }
}

/**
 * Increment retry count for a message
 *
 * AC-5.4.2: Keeps status='pending', increments retry_count
 *
 * @param messageId - The message ID
 * @param retryCount - New retry count
 */
async function markMessageRetry(messageId: string, retryCount: number): Promise<void> {
  const supabase = getSupabaseClient()

  const { error } = await supabase
    .from('engagement_message_queue')
    .update({
      retry_count: retryCount
    })
    .eq('id', messageId)

  if (error) {
    logger.error('Failed to mark message for retry', { messageId, error: error.message })
    // Don't throw - log and continue for eventual consistency
  } else {
    logger.debug('Message marked for retry', { messageId, retryCount })
  }
}

/**
 * Mark a message as failed in the database
 *
 * AC-5.4.3: Sets status='failed', error_message, and retry_count
 *
 * @param messageId - The message ID
 * @param errorMessage - The error that caused failure
 * @param retryCount - Final retry count
 */
async function markMessageFailed(
  messageId: string,
  errorMessage: string,
  retryCount: number
): Promise<void> {
  const supabase = getSupabaseClient()

  const { error } = await supabase
    .from('engagement_message_queue')
    .update({
      status: 'failed',
      retry_count: retryCount,
      error_message: errorMessage
    })
    .eq('id', messageId)

  if (error) {
    logger.error('Failed to mark message as failed', { messageId, error: error.message })
    // Don't throw - log and continue for eventual consistency
  } else {
    logger.debug('Message marked as failed', { messageId, retryCount })
  }
}

/**
 * Process pending messages in the queue
 *
 * AC-5.4.1: Query pending messages, send via Baileys, mark as sent
 * AC-5.4.2: On failure with retry_count < 3, increment and keep pending
 * AC-5.4.3: On failure with retry_count >= 3, mark as failed
 * AC-5.4.4: Rate limit with 500ms delay between sends
 *
 * Epic 5, Story 5.4: Message Queue Processor
 *
 * AC-6.4.4: Race Condition Behavior (Story 6.4 - Acceptable)
 * If a user opts out AFTER a message is queued but BEFORE this processor runs,
 * the queued message will still be sent. This is acceptable (eventual consistency):
 * - The scheduler filters opted-out users BEFORE queuing new messages
 * - This ensures future messages are blocked
 * - User receives ONE message after opt-out (not a pattern of ignored preferences)
 * - Alternative (queue cancellation) adds complexity for minimal benefit
 *
 * @returns Processing results with counts and errors
 */
export async function processMessageQueue(): Promise<ProcessResult> {
  const startTime = Date.now()
  const result: ProcessResult = {
    processed: 0,
    succeeded: 0,
    failed: 0,
    errors: [],
  }

  logger.info('Message queue processing started')

  try {
    // Check Baileys socket connection (AC-5.4.1)
    const sock = getSocket()
    if (!sock || !sock.user) {
      logger.warn('Baileys socket not connected, skipping queue processing')
      return result
    }

    const supabase = getSupabaseClient()

    // Query pending messages (AC-5.4.1)
    // Ordered by scheduled_for ASC (FIFO), limited to 100 for performance
    const { data: messages, error: queryError } = await supabase
      .from('engagement_message_queue')
      .select(`
        id,
        user_id,
        message_type,
        message_key,
        message_params,
        destination,
        destination_jid,
        retry_count,
        user_profiles!inner(locale)
      `)
      .eq('status', 'pending')
      .lte('scheduled_for', new Date().toISOString())
      .order('scheduled_for', { ascending: true })
      .limit(100)

    if (queryError) {
      logger.error('Failed to query message queue', { error: queryError.message })
      throw queryError
    }

    if (!messages || messages.length === 0) {
      logger.info('No pending messages to process')
      return result
    }

    logger.info('Messages to process', { count: messages.length })

    // Process each message (AC-5.4.1, AC-5.4.2, AC-5.4.3, AC-5.4.4)
    for (const message of messages) {
      result.processed++

      try {
        // Get user locale from joined user_profiles
        const userLocale = (message.user_profiles as any)?.locale || 'pt-BR'

        // Resolve destination JID at send time (Story 4.6)
        const { jid: resolvedJid, destination: resolvedDest, fallbackUsed } =
          await resolveDestinationJid(message.user_id, message.destination_jid)

        // Resolve localized message text (AC-5.4.1)
        const messageText = resolveMessageText(
          message.message_key,
          message.message_params as Record<string, unknown> | null,
          userLocale
        )

        // Send via Baileys (AC-5.4.1)
        await sock.sendMessage(resolvedJid, { text: messageText })

        // Mark as sent (AC-5.4.1)
        await markMessageSent(message.id, new Date())
        result.succeeded++

        logger.info('Message sent successfully', {
          message_id: message.id,
          user_id: message.user_id,
          message_type: message.message_type,
          destination: resolvedDest,
          fallback_used: fallbackUsed
        })
      } catch (error) {
        // Handle send failure with retry logic (AC-5.4.2, AC-5.4.3)
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        const newRetryCount = message.retry_count + 1

        if (newRetryCount < MAX_MESSAGE_RETRIES) {
          // Retry available (AC-5.4.2)
          await markMessageRetry(message.id, newRetryCount)

          logger.warn('Message send failed, will retry', {
            message_id: message.id,
            user_id: message.user_id,
            retry_count: newRetryCount,
            error: errorMessage
          })
        } else {
          // Max retries exceeded (AC-5.4.3)
          await markMessageFailed(message.id, errorMessage, newRetryCount)
          result.failed++

          logger.error('Message send failed after max retries', {
            message_id: message.id,
            user_id: message.user_id,
            retry_count: newRetryCount,
            error: errorMessage
          })

          result.errors.push({
            messageId: message.id,
            error: errorMessage
          })
        }
      }

      // Rate limiting: 500ms delay between sends (AC-5.4.4)
      await sleep(500)
    }
  } catch (error) {
    logger.error('Message queue processing failed', {
      error: error instanceof Error ? error.message : 'Unknown error'
    })
    throw error
  } finally {
    const durationMs = Date.now() - startTime
    logger.info('Message queue processing completed', {
      duration_ms: durationMs,
      processed: result.processed,
      succeeded: result.succeeded,
      failed: result.failed,
      errors_count: result.errors.length
    })
  }

  return result
}

/**
 * Cancel a pending message
 *
 * @param messageId - The message ID to cancel
 * @returns True if cancelled successfully
 *
 * TODO: Implement in Epic 5 (Story 5.4)
 */
export async function cancelMessage(messageId: string): Promise<boolean> {
  logger.debug('Cancelling message (stub)', { messageId })

  // Stub implementation - will be completed in Epic 5
  return false
}

/**
 * Get pending messages for a user
 *
 * @param userId - The user's ID
 * @returns List of pending messages
 *
 * TODO: Implement in Epic 5 (Story 5.4)
 */
export async function getPendingMessages(
  userId: string
): Promise<QueuedMessage[]> {
  logger.debug('Getting pending messages (stub)', { userId })

  // Stub implementation - will be completed in Epic 5
  return []
}

// Export constants for external use
export { MAX_MESSAGE_RETRIES }
