/**
 * Data Retention Service
 * Automated cleanup of old analytics data to prevent database growth
 */

import { getSupabaseClient } from '../database/supabase-client.js'
import { logger } from '../monitoring/logger.js'

export interface CleanupResult {
  tableName: string
  recordsAffected: number
  operation: string
  executionTimeMs: number
}

export interface RetentionStats {
  tableName: string
  totalRecords: number
  archivedRecords: number
  linkedRecords: number
  deletableRecords: number
  oldestRecord: string
  newestRecord: string
  tableSize: string
}

/**
 * Run the complete data retention cleanup process
 * Should be called periodically (daily or weekly)
 */
export async function runDataRetentionCleanup(): Promise<CleanupResult[]> {
  const supabase = getSupabaseClient()

  try {
    logger.info('Starting data retention cleanup')

    const { data, error } = await supabase
      .rpc('run_data_retention_cleanup')

    if (error) {
      logger.error('Data retention cleanup failed', { error: error.message })
      throw error
    }

    const results: CleanupResult[] = data.map((row: any) => ({
      tableName: row.table_name,
      recordsAffected: row.records_affected,
      operation: row.operation,
      executionTimeMs: row.execution_time_ms,
    }))

    // Log summary
    const totalDeleted = results
      .filter(r => r.operation === 'deleted')
      .reduce((sum, r) => sum + r.recordsAffected, 0)

    const totalArchived = results
      .filter(r => r.operation === 'archived')
      .reduce((sum, r) => sum + r.recordsAffected, 0)

    logger.info('Data retention cleanup completed', {
      totalDeleted,
      totalArchived,
      results,
    })

    return results
  } catch (error) {
    logger.error('Exception during data retention cleanup', {}, error as Error)
    throw error
  }
}

/**
 * Clean up old parsing metrics only
 * @param retentionDays How many days to keep (default: 90)
 * @param batchSize Max records to delete per run (default: 1000)
 */
export async function cleanupParsingMetrics(
  retentionDays: number = 90,
  batchSize: number = 1000
): Promise<{ deleted: number; archived: number; oldestDate: string }> {
  const supabase = getSupabaseClient()

  try {
    logger.info('Starting parsing metrics cleanup', { retentionDays, batchSize })

    const { data, error } = await supabase
      .rpc('cleanup_old_parsing_metrics', {
        retention_days: retentionDays,
        batch_size: batchSize,
      })
      .single()

    if (error) {
      logger.error('Parsing metrics cleanup failed', { error: error.message })
      throw error
    }

    const result = data as { deleted_count: number; archived_count: number; oldest_date: string }

    logger.info('Parsing metrics cleanup completed', {
      deleted: result.deleted_count,
      archived: result.archived_count,
      oldestDate: result.oldest_date,
    })

    return {
      deleted: result.deleted_count,
      archived: result.archived_count,
      oldestDate: result.oldest_date,
    }
  } catch (error) {
    logger.error('Exception during parsing metrics cleanup', {}, error as Error)
    throw error
  }
}

/**
 * Clean up old semantic cache embeddings
 * @param retentionDays How many days to keep (default: 180)
 * @param minUsageCount Minimum usage count to keep (default: 1)
 * @param batchSize Max records to delete per run (default: 500)
 */
export async function cleanupEmbeddings(
  retentionDays: number = 180,
  minUsageCount: number = 1,
  batchSize: number = 500
): Promise<number> {
  const supabase = getSupabaseClient()

  try {
    logger.info('Starting embeddings cleanup', { retentionDays, minUsageCount, batchSize })

    const { data, error } = await supabase
      .rpc('cleanup_old_embeddings', {
        retention_days: retentionDays,
        min_usage_count: minUsageCount,
        batch_size: batchSize,
      })

    if (error) {
      logger.error('Embeddings cleanup failed', { error: error.message })
      throw error
    }

    logger.info('Embeddings cleanup completed', { deleted: data })

    return data as number
  } catch (error) {
    logger.error('Exception during embeddings cleanup', {}, error as Error)
    throw error
  }
}

/**
 * Clean up old AI usage records
 * @param retentionDays How many days to keep (default: 365)
 * @param batchSize Max records to delete per run (default: 1000)
 */
export async function cleanupAiUsage(
  retentionDays: number = 365,
  batchSize: number = 1000
): Promise<number> {
  const supabase = getSupabaseClient()

  try {
    logger.info('Starting AI usage cleanup', { retentionDays, batchSize })

    const { data, error } = await supabase
      .rpc('cleanup_old_ai_usage', {
        retention_days: retentionDays,
        batch_size: batchSize,
      })

    if (error) {
      logger.error('AI usage cleanup failed', { error: error.message })
      throw error
    }

    logger.info('AI usage cleanup completed', { deleted: data })

    return data as number
  } catch (error) {
    logger.error('Exception during AI usage cleanup', {}, error as Error)
    throw error
  }
}

/**
 * Get current retention statistics
 * Useful for monitoring and admin dashboards
 */
export async function getRetentionStats(): Promise<RetentionStats[]> {
  const supabase = getSupabaseClient()

  try {
    const { data, error } = await supabase
      .from('data_retention_stats')
      .select('*')

    if (error) {
      logger.error('Failed to get retention stats', { error: error.message })
      throw error
    }

    return data.map((row: any) => ({
      tableName: row.table_name,
      totalRecords: row.total_records,
      archivedRecords: row.archived_records,
      linkedRecords: row.linked_records,
      deletableRecords: row.deletable_records,
      oldestRecord: row.oldest_record,
      newestRecord: row.newest_record,
      tableSize: row.table_size,
    }))
  } catch (error) {
    logger.error('Exception getting retention stats', {}, error as Error)
    throw error
  }
}

/**
 * Schedule daily cleanup (call this on bot startup)
 * Runs cleanup every day at 2 AM UTC
 */
export function scheduleDataRetentionCleanup(): void {
  const ONE_DAY_MS = 24 * 60 * 60 * 1000

  // Calculate ms until next 2 AM UTC
  const now = new Date()
  const next2AM = new Date()
  next2AM.setUTCHours(2, 0, 0, 0)

  if (next2AM <= now) {
    // If 2 AM already passed today, schedule for tomorrow
    next2AM.setTime(next2AM.getTime() + ONE_DAY_MS)
  }

  const msUntilNext2AM = next2AM.getTime() - now.getTime()

  logger.info('Scheduling data retention cleanup', {
    nextRun: next2AM.toISOString(),
    msUntilNextRun: msUntilNext2AM,
  })

  // Run first cleanup at 2 AM
  setTimeout(() => {
    runDataRetentionCleanup().catch(error => {
      logger.error('Scheduled cleanup failed', {}, error as Error)
    })

    // Then run daily
    setInterval(() => {
      runDataRetentionCleanup().catch(error => {
        logger.error('Scheduled cleanup failed', {}, error as Error)
      })
    }, ONE_DAY_MS)
  }, msUntilNext2AM)
}
