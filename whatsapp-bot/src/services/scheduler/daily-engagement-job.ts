/**
 * Daily Engagement Job
 *
 * Scheduled job that runs once daily to:
 * - Detect inactive users (14+ days) and transition to goodbye_sent
 * - Process goodbye timeouts (48h) and transition to dormant
 * - Handle remind-later expirations and transition to dormant
 *
 * Epic: 5 - Scheduled Jobs & Weekly Reviews
 * Story: 5.1 - Daily Engagement Job
 *
 * AC-5.1.1: 14-day inactive users with reengagement_opt_out=false → goodbye_sent (with message)
 * AC-5.1.2: goodbye_sent users with goodbye_expires_at < now → dormant (silent)
 * AC-5.1.3: remind_later users with remind_at < now → dormant (silent)
 * AC-5.1.4: Users with reengagement_opt_out=true are skipped
 */

import { logger } from '../monitoring/logger.js'
import { getSupabaseClient } from '../database/supabase-client.js'
import { processMessageQueue } from './message-sender.js'
import {
  transitionState,
  getExpiredGoodbyes,
  getDueReminders,
} from '../engagement/state-machine.js'
import { INACTIVITY_THRESHOLD_DAYS } from '../engagement/constants.js'

export interface JobResult {
  processed: number
  succeeded: number
  failed: number
  skipped: number
  errors: Array<{ userId: string; error: string }>
  durationMs: number
}

/**
 * Run the daily engagement job
 *
 * This job is idempotent - running multiple times per day
 * will not send duplicate messages or cause duplicate transitions.
 *
 * @returns Job execution results
 */
export async function runDailyEngagementJob(): Promise<JobResult> {
  const startTime = Date.now()
  const result: JobResult = {
    processed: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    errors: [],
    durationMs: 0,
  }

  logger.info('Daily engagement job started', {
    started_at: new Date().toISOString(),
  })

  try {
    // Step 1: Process 14-day inactive users (AC-5.1.1, AC-5.1.4)
    await processInactiveUsers(result)

    // Step 2: Process expired goodbye timeouts (AC-5.1.2)
    await processGoodbyeTimeouts(result)

    // Step 3: Process due remind_later states (AC-5.1.3)
    await processRemindLaterDue(result)

    // Step 4: Process queued messages (Story 5.4)
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
    logger.error('Daily engagement job failed', {}, error as Error)
    throw error
  } finally {
    result.durationMs = Date.now() - startTime
    logger.info('Daily engagement job completed', {
      duration_ms: result.durationMs,
      processed: result.processed,
      succeeded: result.succeeded,
      failed: result.failed,
      skipped: result.skipped,
    })
  }

  return result
}

/**
 * Process inactive users (14+ days without activity)
 *
 * AC-5.1.1: Transition active users with last_activity_at > 14 days ago to goodbye_sent
 * AC-5.1.4: Skip users with reengagement_opt_out = true
 *
 * @param result - Job result object to update
 */
async function processInactiveUsers(result: JobResult): Promise<void> {
  const supabase = getSupabaseClient()
  const inactivityDate = new Date()
  inactivityDate.setDate(inactivityDate.getDate() - INACTIVITY_THRESHOLD_DAYS)

  // Step 1: Get inactive users
  const { data: inactiveUsers, error: usersError } = await supabase
    .from('user_engagement_states')
    .select('user_id, last_activity_at')
    .eq('state', 'active')
    .lt('last_activity_at', inactivityDate.toISOString())

  if (usersError) {
    logger.error('Failed to query inactive users', {}, usersError)
    throw usersError
  }

  if (!inactiveUsers || inactiveUsers.length === 0) {
    logger.info('No inactive users found')
    return
  }

  // Step 2: Get opt-out status for these users (AC-5.1.4)
  const userIds = inactiveUsers.map((u) => u.user_id)
  const { data: profiles, error: profilesError } = await supabase
    .from('user_profiles')
    .select('user_id, reengagement_opt_out')
    .in('user_id', userIds)

  if (profilesError) {
    logger.error('Failed to query user profiles', {}, profilesError)
    throw profilesError
  }

  // Build a map of opt-out status
  const optOutMap = new Map<string, boolean>()
  for (const profile of profiles || []) {
    optOutMap.set(profile.user_id, profile.reengagement_opt_out || false)
  }

  logger.info('Found inactive users to process', {
    total: inactiveUsers.length,
    withOptOutInfo: optOutMap.size,
  })

  // Step 3: Process each inactive user, respecting opt-out preference
  for (const user of inactiveUsers) {
    // AC-5.1.4 & AC-6.4.1: Skip opted-out users
    // Story 6.4: Scheduler respects reengagement_opt_out preference
    const isOptedOut = optOutMap.get(user.user_id)
    if (isOptedOut === true) {
      result.skipped++
      logger.debug('Skipped opted-out user', { userId: user.user_id })
      continue
    }

    result.processed++
    try {
      const transitionResult = await transitionState(user.user_id, 'inactivity_14d')

      if (transitionResult.success) {
        result.succeeded++
        logger.debug('Processed inactive user', { userId: user.user_id })
      } else {
        result.failed++
        result.errors.push({
          userId: user.user_id,
          error: transitionResult.error || 'Unknown error',
        })
        logger.error('Failed to transition inactive user', {
          userId: user.user_id,
          error: transitionResult.error,
        })
      }
    } catch (error) {
      result.failed++
      const errorMessage = error instanceof Error ? error.message : String(error)
      result.errors.push({
        userId: user.user_id,
        error: errorMessage,
      })
      logger.error('Exception processing inactive user', { userId: user.user_id }, error as Error)
    }
  }

  // AC-6.4.6 & AC-6.5.3: Log observability metrics for skipped opted-out users
  // Story 6.5: Enhanced analytics logging for opt-out metrics
  const optOutFilterRate = inactiveUsers.length > 0
    ? (result.skipped / inactiveUsers.length) * 100
    : 0

  logger.info('Inactive users processing completed', {
    job: 'daily-engagement-job',
    total_eligible_users: inactiveUsers.length,
    opted_out_users_skipped: result.skipped,
    messages_queued: result.succeeded,
    opt_out_filter_rate: parseFloat(optOutFilterRate.toFixed(2)),
    processed: result.processed,
    succeeded: result.succeeded,
    failed: result.failed,
  })
}

/**
 * Process expired goodbye messages (48h timeout)
 *
 * AC-5.1.2: Transition goodbye_sent users with goodbye_expires_at < now to dormant
 * No message is sent (silence by design)
 *
 * @param result - Job result object to update
 */
async function processGoodbyeTimeouts(result: JobResult): Promise<void> {
  const expiredGoodbyes = await getExpiredGoodbyes()
  logger.info('Found expired goodbyes to process', { count: expiredGoodbyes.length })

  for (const user of expiredGoodbyes) {
    result.processed++
    try {
      const transitionResult = await transitionState(user.userId, 'goodbye_timeout')

      if (transitionResult.success) {
        result.succeeded++
        logger.debug('Processed goodbye timeout', { userId: user.userId })
      } else {
        result.failed++
        result.errors.push({
          userId: user.userId,
          error: transitionResult.error || 'Unknown error',
        })
        logger.error('Failed to process goodbye timeout', {
          userId: user.userId,
          error: transitionResult.error,
        })
      }
    } catch (error) {
      result.failed++
      const errorMessage = error instanceof Error ? error.message : String(error)
      result.errors.push({
        userId: user.userId,
        error: errorMessage,
      })
      logger.error('Exception processing goodbye timeout', { userId: user.userId }, error as Error)
    }
  }
}

/**
 * Process due remind_later states
 *
 * AC-5.1.3: Transition remind_later users with remind_at < now to dormant
 * No message is sent (silence by design)
 *
 * @param result - Job result object to update
 */
async function processRemindLaterDue(result: JobResult): Promise<void> {
  const dueReminders = await getDueReminders()
  logger.info('Found due reminders to process', { count: dueReminders.length })

  for (const user of dueReminders) {
    result.processed++
    try {
      const transitionResult = await transitionState(user.userId, 'reminder_due')

      if (transitionResult.success) {
        result.succeeded++
        logger.debug('Processed remind_later due', { userId: user.userId })
      } else {
        result.failed++
        result.errors.push({
          userId: user.userId,
          error: transitionResult.error || 'Unknown error',
        })
        logger.error('Failed to process remind_later due', {
          userId: user.userId,
          error: transitionResult.error,
        })
      }
    } catch (error) {
      result.failed++
      const errorMessage = error instanceof Error ? error.message : String(error)
      result.errors.push({
        userId: user.userId,
        error: errorMessage,
      })
      logger.error('Exception processing remind_later due', { userId: user.userId }, error as Error)
    }
  }
}
