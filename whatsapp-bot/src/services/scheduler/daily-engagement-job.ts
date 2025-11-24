/**
 * Daily Engagement Job
 *
 * Scheduled job that runs once daily to:
 * - Detect inactive users (14+ days)
 * - Send goodbye messages
 * - Process goodbye timeouts (48h)
 * - Handle remind-later expirations
 *
 * Epic: 1 - Foundation & Message Infrastructure
 * Story: 1.3 - Engagement Service Directory Structure
 * Story: 4.5 - 48h Timeout to Dormant (timeout processing)
 * Implementation: Epic 5 - Scheduled Jobs & Weekly Reviews
 */

import { logger } from '../monitoring/logger.js'
import {
  getExpiredGoodbyes,
  transitionState,
} from '../engagement/state-machine.js'

export interface JobResult {
  success: boolean
  usersProcessed: number
  goodbyesSent: number
  timeoutsProcessed: number
  remindersProcessed: number
  errors: string[]
  durationMs: number
}

/**
 * Run the daily engagement job
 *
 * This job is idempotent - running multiple times per day
 * will not send duplicate messages or cause duplicate transitions.
 *
 * AC-4.5.5: Multiple daily job runs don't cause duplicate transitions
 * - Users already in 'dormant' state won't appear in getExpiredGoodbyes()
 * - Each user can only transition once per query
 *
 * @returns Job execution results
 */
export async function runDailyEngagementJob(): Promise<JobResult> {
  const startTime = Date.now()
  const errors: string[] = []
  let usersProcessed = 0
  let goodbyesSent = 0
  let timeoutsProcessed = 0
  let remindersProcessed = 0

  logger.info('Daily engagement job started')

  try {
    // Step 1: Check 14-day inactivity (TODO: Epic 5, Story 5.1)
    // This will queue goodbye messages for inactive users
    // goodbyesSent = await processInactiveUsers()

    // Step 2: Process expired goodbye timeouts (Story 4.5)
    // AC-4.5.1: Query users where state='goodbye_sent' AND goodbye_expires_at < now
    const expiredGoodbyes = await getExpiredGoodbyes()
    logger.info('Found expired goodbyes to process', { count: expiredGoodbyes.length })

    // AC-4.5.2, AC-4.5.5: Process each expired goodbye with per-user error handling
    for (const user of expiredGoodbyes) {
      try {
        // AC-4.5.2: Trigger is 'goodbye_timeout' (distinct from 'goodbye_response_3')
        const result = await transitionState(user.userId, 'goodbye_timeout', {
          response_type: 'timeout',
          job_triggered: true,
        })

        if (result.success) {
          timeoutsProcessed++
          usersProcessed++
          logger.debug('Goodbye timeout processed', {
            userId: user.userId,
            sideEffects: result.sideEffects,
          })
        } else {
          // AC-4.5.5: Defensive check - skip if user already transitioned (race condition)
          if (result.error?.includes('Invalid transition')) {
            logger.warn('User already transitioned (idempotent skip)', {
              userId: user.userId,
              error: result.error,
            })
          } else {
            errors.push(`User ${user.userId}: ${result.error}`)
            logger.error('Failed to process goodbye timeout', {
              userId: user.userId,
              error: result.error,
            })
          }
        }
      } catch (error) {
        // AC-4.5.5: Per-user try/catch prevents single failure from blocking batch
        const errorMessage = error instanceof Error ? error.message : String(error)
        errors.push(`User ${user.userId}: ${errorMessage}`)
        logger.error('Exception processing goodbye timeout', { userId: user.userId }, error as Error)
      }
    }

    // Step 3: Check due reminders (TODO: Epic 5)
    // This will transition remind_later users to dormant
    // remindersProcessed = await processDueReminders()

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    errors.push(`Job error: ${errorMessage}`)
    logger.error('Daily engagement job failed', {}, error as Error)
  }

  const result: JobResult = {
    success: errors.length === 0,
    usersProcessed,
    goodbyesSent,
    timeoutsProcessed,
    remindersProcessed,
    errors,
    durationMs: Date.now() - startTime,
  }

  logger.info('Daily engagement job completed', result)

  return result
}

/**
 * Check if the daily job has already run today
 *
 * @returns True if job has run today
 *
 * TODO: Implement in Epic 5 (Story 5.6)
 */
export async function hasRunToday(): Promise<boolean> {
  logger.debug('Checking if daily job has run (stub)')

  // Stub implementation - will be completed in Epic 5
  return false
}
