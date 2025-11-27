#!/usr/bin/env tsx
/**
 * Weekly Engagement Job Cron Entry Point
 *
 * Runs weekly (Monday 9 AM UTC) to:
 * - Detect active users (7 days with transactions OR bot activity)
 * - Send celebratory messages acknowledging their financial tracking
 *
 * Epic: 5 - Scheduled Jobs & Weekly Reviews
 * Story: 5.3 - Weekly Review Job & Message
 *
 * Schedule: 0 9 * * 1 (09:00 every Monday)
 */

import { runWeeklyReviewJob } from '../services/scheduler/weekly-review-job.js'
import { logger } from '../services/monitoring/logger.js'

async function main() {
  try {
    logger.info('Starting weekly review job cron')

    const result = await runWeeklyReviewJob()

    logger.info('Weekly review job completed successfully', {
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
    logger.error('Weekly review job failed', {}, error as Error)
    process.exit(1)
  }
}

main()
