/**
 * Activity Detection Service
 *
 * Epic: 5 (Scheduled Jobs & Weekly Reviews)
 * Story: 5.2 (Weekly Activity Detection)
 *
 * Purpose: Detect users with activity in the past 7 days for weekly review messages.
 * Activity is defined as either:
 * - Transactions created in the last 7 days, OR
 * - Bot interactions (last_activity_at) within 7 days
 *
 * Excludes dormant users and users who opted out of re-engagement messages.
 * Used by Story 5.3 (Weekly Review Job) to determine celebratory message recipients.
 */

import { getSupabaseClient } from '../database/supabase-client.js'
import { logger } from '../monitoring/logger.js'

/**
 * Active user with activity in the last 7 days
 * Contains all information needed to queue weekly review messages
 */
export interface ActiveUser {
  userId: string
  transactionCount: number
  lastActivityAt: Date
  preferredDestination: 'individual' | 'group'
  destinationJid: string
  locale: string
}

/**
 * Get users with activity in the last 7 days.
 *
 * Activity is defined as:
 * - Transactions created in the last 7 days, OR
 * - Bot interactions (last_activity_at) in the last 7 days
 *
 * Excludes:
 * - Dormant users (state = 'dormant')
 * - Opted-out users (reengagement_opt_out = true)
 *
 * @returns Array of active users with transaction counts and destination info
 *
 * AC-5.2.1: Returns users with transactions OR last_activity_at within 7 days
 * AC-5.2.2: Excludes dormant users
 * AC-5.2.3: Excludes opted-out users
 */
export async function getActiveUsersLastWeek(): Promise<ActiveUser[]> {
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

  logger.info('Detecting active users for weekly review', {
    since_date: sevenDaysAgo.toISOString(),
    lookback_days: 7
  })

  const startTime = Date.now()

  try {
    const supabase = getSupabaseClient()

    // Single aggregated query with LEFT JOIN for performance
    const { data, error } = await supabase.rpc('get_active_users_last_week', {
      since_date: sevenDaysAgo.toISOString()
    })

    if (error) {
      logger.error('Failed to get active users', {
        since_date: sevenDaysAgo.toISOString(),
        error: error.message
      })
      throw error
    }

    const activeUsers: ActiveUser[] = (data || [])
      .map((row: any) => {
        try {
          return {
            userId: row.user_id,
            transactionCount: row.transaction_count,
            lastActivityAt: new Date(row.last_activity_at),
            preferredDestination: row.preferred_destination,
            destinationJid: row.destination_jid,
            locale: row.locale
          }
        } catch (mappingError) {
          logger.warn('Skipping malformed row in activity detection', {
            row,
            error: mappingError instanceof Error ? mappingError.message : String(mappingError)
          })
          return null
        }
      })
      .filter((user: ActiveUser | null): user is ActiveUser => user !== null)

    const duration = Date.now() - startTime

    logger.info('Active users detected', {
      count: activeUsers.length,
      since: sevenDaysAgo.toISOString(),
      duration_ms: duration
    })

    return activeUsers
  } catch (error) {
    const duration = Date.now() - startTime
    logger.error('Activity detection failed', {
      since_date: sevenDaysAgo.toISOString(),
      duration_ms: duration,
      error: error instanceof Error ? error.message : String(error)
    })
    throw error
  }
}

/**
 * Get activity count for a specific user over a time period.
 *
 * Used for analytics, debugging, and testing. Counts both transactions and bot interactions.
 *
 * @param userId - User ID to check
 * @param days - Number of days to look back
 * @returns Total activity count (transactions + bot interactions)
 */
export async function getUserActivityCount(
  userId: string,
  days: number
): Promise<number> {
  const sinceDate = new Date()
  sinceDate.setDate(sinceDate.getDate() - days)

  try {
    const supabase = getSupabaseClient()

    // Count transactions
    const { count: transactionCount, error: txError } = await supabase
      .from('transactions')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gt('created_at', sinceDate.toISOString())

    if (txError) throw txError

    // Check bot activity
    const { data: engagementData, error: engError } = await supabase
      .from('user_engagement_states')
      .select('last_activity_at')
      .eq('user_id', userId)
      .single()

    if (engError && engError.code !== 'PGRST116') {
      // PGRST116 is "not found" error, which is acceptable
      throw engError
    }

    const botActivityCount = engagementData?.last_activity_at &&
      new Date(engagementData.last_activity_at) > sinceDate
      ? 1
      : 0

    const totalCount = (transactionCount || 0) + botActivityCount

    logger.debug('User activity count', {
      userId,
      days,
      transactionCount: transactionCount || 0,
      botActivityCount,
      totalCount
    })

    return totalCount
  } catch (error) {
    logger.error('Failed to get user activity count', {
      userId,
      days,
      error: error instanceof Error ? error.message : String(error)
    })
    throw error
  }
}
