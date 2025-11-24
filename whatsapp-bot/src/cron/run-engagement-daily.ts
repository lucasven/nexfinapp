#!/usr/bin/env tsx
/**
 * Daily Engagement Job Cron Entry Point
 *
 * Runs daily at 6 AM UTC to:
 * - Process 14-day inactive users → goodbye_sent (with message)
 * - Process expired goodbye messages → dormant (silent)
 * - Process due remind_later states → dormant (silent)
 *
 * Epic: 5 - Scheduled Jobs & Weekly Reviews
 * Story: 5.1 - Daily Engagement Job
 *
 * Schedule: 0 6 * * * (06:00 every day)
 */

import { runDailyEngagementJob } from '../services/scheduler/daily-engagement-job.js'
import { logger } from '../services/monitoring/logger.js'

async function main() {
  try {
    logger.info('Starting daily engagement job cron')

    const result = await runDailyEngagementJob()

    logger.info('Daily engagement job completed successfully', {
      processed: result.processed,
      succeeded: result.succeeded,
      failed: result.failed,
      skipped: result.skipped,
      duration_ms: result.durationMs,
    })

    if (result.failed > 0) {
      logger.warn('Some users failed to process', {
        failed_count: result.failed,
        error_count: result.errors.length,
        errors: result.errors,
      })
    }

    // Exit with success even if some users failed
    // The job should not be considered failed if some users had issues
    process.exit(0)
  } catch (error) {
    logger.error('Daily engagement job failed', {}, error as Error)
    process.exit(1)
  }
}

main()
