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

export interface QueueMessageParams {
  userId: string
  messageType: MessageType
  messageKey: string
  messageParams?: Record<string, unknown>
  destination: 'individual' | 'group'
  destinationJid: string
  scheduledFor?: Date
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

  // Generate idempotency key to prevent duplicate messages
  const idempotencyKey = getIdempotencyKey(
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
 * Process pending messages in the queue
 *
 * This is called by the scheduler job to send pending messages.
 *
 * @returns Processing results
 *
 * TODO: Implement in Epic 5 (Story 5.4)
 * - Query pending messages where scheduled_for <= now
 * - For each message:
 *   1. Call resolveDestinationJid() to get current preferred destination (Story 4.6)
 *   2. Attempt delivery via Baileys to resolved JID
 *   3. Update status to 'sent' or increment retry_count
 * - After MAX_MESSAGE_RETRIES, mark as 'failed'
 */
export async function processMessageQueue(): Promise<ProcessResult> {
  logger.info('Processing message queue (stub)')

  // Stub implementation - will be completed in Epic 5
  // When implemented, use resolveDestinationJid() per Story 4.6:
  //
  // for (const message of pendingMessages) {
  //   const { jid, destination, fallbackUsed } = await resolveDestinationJid(
  //     message.user_id,
  //     message.destination_jid // fallback to originally queued JID
  //   )
  //   // Send via Baileys to resolved JID
  //   // Log if fallback was used
  // }

  return {
    processed: 0,
    succeeded: 0,
    failed: 0,
    errors: [],
  }
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
