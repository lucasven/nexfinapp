/**
 * Weekly Review Job
 *
 * Scheduled job that runs once weekly (Monday 9 AM UTC) to:
 * - Detect active users (7 days with transactions OR bot activity)
 * - Send celebratory messages acknowledging their financial tracking
 *
 * Epic: 5 - Scheduled Jobs & Weekly Reviews
 * Story: 5.3 - Weekly Review Job & Message
 *
 * AC-5.3.1: Active users receive weekly_review message to preferred destination
 * AC-5.3.2: Users with no activity receive NO message
 * AC-5.3.3: Idempotency via {userId}:weekly_review:{YYYY-Www} key
 */

import { logger } from '../monitoring/logger.js'
import { getActiveUsersLastWeek } from './activity-detector.js'
import { queueMessage, processMessageQueue } from './message-sender.js'
import { getISOWeek, getISOWeekYear } from 'date-fns'
import { getPostHog } from '../../analytics/posthog-client.js'

export interface JobResult {
  processed: number
  succeeded: number
  failed: number
  skipped: number
  errors: Array<{ userId: string; error: string }>
  durationMs: number
}

/**
 * Run the weekly review job
 *
 * This job is idempotent - running multiple times per week
 * will not send duplicate messages due to ISO week-based idempotency keys.
 *
 * @returns Job execution results
 */
export async function runWeeklyReviewJob(): Promise<JobResult> {
  const startTime = Date.now()
  const result: JobResult = {
    processed: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    errors: [],
    durationMs: 0,
  }

  logger.info('Weekly review job started', {
    started_at: new Date().toISOString(),
  })

  try {
    // Step 1: Get active users from last week (AC-5.3.1, AC-5.3.2)
    // AC-6.4.2: getActiveUsersLastWeek() excludes opted-out users via SQL function
    const activeUsers = await getActiveUsersLastWeek()

    // AC-6.5.3: Log opt-out metrics for scheduler analytics
    // Story 6.5: Enhanced analytics logging for opt-out metrics
    logger.info('Active users detected for weekly review', {
      job: 'weekly-review-job',
      total_eligible_users: activeUsers.length,
      note: 'Opted-out users excluded by get_active_users_last_week SQL function',
    })

    // Step 2: Process each active user
    for (const user of activeUsers) {
      result.processed++

      try {
        // Generate idempotency key using ISO week (AC-5.3.3)
        const now = new Date()
        const weekYear = getISOWeekYear(now)
        const weekNumber = getISOWeek(now)
        const idempotencyKey = `${user.userId}:weekly_review:${weekYear}-W${weekNumber.toString().padStart(2, '0')}`

        // Queue weekly review message
        const queued = await queueMessage({
          userId: user.userId,
          messageType: 'weekly_review',
          messageKey: 'engagementWeeklyReviewCelebration',
          messageParams: {
            count: user.transactionCount,
          },
          destination: user.preferredDestination,
          destinationJid: user.destinationJid,
          scheduledFor: now,
          idempotencyKey,
        })

        if (queued) {
          result.succeeded++

          // Fire PostHog analytics event
          const posthog = getPostHog()
          if (posthog) {
            posthog.capture({
              distinctId: user.userId,
              event: 'engagement_weekly_review_sent',
              properties: {
                transaction_count: user.transactionCount,
                destination: user.preferredDestination,
                locale: user.locale,
              },
            })
          }

          logger.debug('Queued weekly review for user', {
            userId: user.userId,
            transactionCount: user.transactionCount,
            destination: user.preferredDestination,
          })
        } else {
          // queueMessage returns false on error (but doesn't throw)
          result.failed++
          result.errors.push({
            userId: user.userId,
            error: 'Failed to queue message (returned false)',
          })
        }
      } catch (error) {
        // Catch any unexpected errors (queueMessage shouldn't throw, but defensive coding)
        result.failed++
        result.errors.push({
          userId: user.userId,
          error: error instanceof Error ? error.message : String(error),
        })
        logger.error(
          'Exception queueing weekly review',
          {
            userId: user.userId,
            error: error instanceof Error ? error.message : String(error),
          }
        )
      }
    }

    // Step 3: Process queued messages (Story 5.4)
    try {
      const queueResult = await processMessageQueue()
      logger.info('Queue processing completed', {
        processed: queueResult.processed,
        succeeded: queueResult.succeeded,
        failed: queueResult.failed,
        errors_count: queueResult.errors.length
      })
    } catch (error) {
      // Log but don't fail entire job
      logger.error('Queue processing failed', {}, error as Error)
    }

  } catch (error) {
    logger.error('Weekly review job failed', {}, error as Error)
    throw error
  } finally {
    result.durationMs = Date.now() - startTime

    // AC-6.5.3: Log opt-out metrics for scheduler analytics
    // Story 6.5: Enhanced analytics logging for opt-out metrics
    logger.info('Weekly review job completed', {
      job: 'weekly-review-job',
      total_eligible_users: result.processed,
      messages_queued: result.succeeded,
      duration_ms: result.durationMs,
      processed: result.processed,
      succeeded: result.succeeded,
      failed: result.failed,
      skipped: result.skipped,
      note: 'Opt-out filtering applied at SQL level (get_active_users_last_week)',
    })
  }

  return result
}
