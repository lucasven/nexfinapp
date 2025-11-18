#!/usr/bin/env tsx

/**
 * Data Retention Cleanup Script
 * Called by Railway cron job daily at 2 AM UTC
 *
 * Purpose: Prevent unbounded database growth from analytics data
 */

import { config } from 'dotenv'
import { runDataRetentionCleanup, getRetentionStats } from '../services/maintenance/data-retention.js'
import { logger } from '../services/monitoring/logger.js'

// Load environment variables
config()

/**
 * Sleep helper for retry delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Retry wrapper with exponential backoff
 * @param fn Function to retry
 * @param maxRetries Maximum number of retry attempts
 * @param initialDelayMs Initial delay before first retry
 */
async function runWithRetry<T>(
  fn: () => Promise<T>,
  operation: string,
  maxRetries: number = 3,
  initialDelayMs: number = 1000
): Promise<T> {
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        const delayMs = initialDelayMs * Math.pow(2, attempt - 1)
        logger.info(`Retrying ${operation}`, {
          attempt,
          maxRetries,
          delayMs,
        })
        await sleep(delayMs)
      }

      return await fn()
    } catch (error) {
      lastError = error as Error
      logger.warn(`${operation} failed (attempt ${attempt + 1}/${maxRetries + 1})`, {
        error: (error as Error).message,
      })

      if (attempt === maxRetries) {
        logger.error(`${operation} failed after all retries`, {}, lastError)
        throw lastError
      }
    }
  }

  // This should never be reached due to throw above, but TypeScript needs it
  throw lastError || new Error('Unexpected retry failure')
}

async function main() {
  logger.info('========================================')
  logger.info('Starting scheduled data retention cleanup')
  logger.info('========================================')

  try {
    // Get stats before cleanup (with retry)
    logger.info('Fetching retention stats before cleanup...')
    const statsBefore = await runWithRetry(
      () => getRetentionStats(),
      'getRetentionStats (before)',
      3,
      1000
    )

    logger.info('Database state before cleanup:', {
      tables: statsBefore.map(s => ({
        table: s.tableName,
        totalRecords: s.totalRecords,
        deletableRecords: s.deletableRecords,
        tableSize: s.tableSize,
      })),
    })

    // Run cleanup (with retry)
    logger.info('Running data retention cleanup...')
    const results = await runWithRetry(
      () => runDataRetentionCleanup(),
      'runDataRetentionCleanup',
      3,
      2000  // Longer initial delay for cleanup operation
    )

    // Log results
    const totalDeleted = results
      .filter(r => r.operation === 'deleted')
      .reduce((sum, r) => sum + r.recordsAffected, 0)

    const totalArchived = results
      .filter(r => r.operation === 'archived')
      .reduce((sum, r) => sum + r.recordsAffected, 0)

    logger.info('Cleanup results:', {
      totalDeleted,
      totalArchived,
      details: results,
    })

    // Get stats after cleanup (with retry)
    logger.info('Fetching retention stats after cleanup...')
    const statsAfter = await runWithRetry(
      () => getRetentionStats(),
      'getRetentionStats (after)',
      3,
      1000
    )

    logger.info('Database state after cleanup:', {
      tables: statsAfter.map(s => ({
        table: s.tableName,
        totalRecords: s.totalRecords,
        deletableRecords: s.deletableRecords,
        tableSize: s.tableSize,
      })),
    })

    // Summary
    const summary = statsAfter.map(after => {
      const before = statsBefore.find(b => b.tableName === after.tableName)
      return {
        table: after.tableName,
        recordsRemoved: (before?.totalRecords || 0) - after.totalRecords,
        recordsBefore: before?.totalRecords || 0,
        recordsAfter: after.totalRecords,
        sizeBefore: before?.tableSize || 'unknown',
        sizeAfter: after.tableSize,
      }
    })

    logger.info('========================================')
    logger.info('Cleanup summary:', { summary })
    logger.info('Data retention cleanup completed successfully')
    logger.info('========================================')

    // Exit successfully
    process.exit(0)
  } catch (error) {
    logger.error('========================================')
    logger.error('Data retention cleanup FAILED', {}, error as Error)
    logger.error('========================================')

    // Exit with error code
    process.exit(1)
  }
}

// Run the script
main()
