/**
 * Weekly Review Job
 *
 * Scheduled job that runs weekly (Sunday evening) to send
 * activity summaries to engaged users.
 *
 * Epic: 1 - Foundation & Message Infrastructure
 * Story: 1.3 - Engagement Service Directory Structure
 * Implementation: Epic 5 - Scheduled Jobs & Weekly Reviews
 */

import { logger } from '../monitoring/logger.js'

export interface WeeklyReviewResult {
  success: boolean
  usersProcessed: number
  reviewsSent: number
  usersSkipped: number
  errors: string[]
  durationMs: number
}

export interface UserWeeklySummary {
  userId: string
  totalTransactions: number
  totalAmount: number
  topCategories: Array<{ name: string; amount: number }>
  budgetStatus: Array<{ category: string; percent: number }>
  comparisonToLastWeek: number // percentage change
}

/**
 * Run the weekly review job
 *
 * This job sends personalized activity summaries to users
 * who have been active in the past week.
 *
 * @returns Job execution results
 *
 * TODO: Implement in Epic 5 (Story 5.3)
 * - Query users in 'active' state with transactions in past 7 days
 * - Skip users who have opted out (reengagement_opt_out = true)
 * - For each, generate weekly summary
 * - Queue weekly review message
 */
export async function runWeeklyReviewJob(): Promise<WeeklyReviewResult> {
  const startTime = Date.now()

  logger.info('Weekly review job started (stub)')

  // Stub implementation - will be completed in Epic 5
  const result: WeeklyReviewResult = {
    success: false,
    usersProcessed: 0,
    reviewsSent: 0,
    usersSkipped: 0,
    errors: ['Not implemented - see Epic 5, Story 5.3'],
    durationMs: Date.now() - startTime,
  }

  logger.info('Weekly review job completed (stub)', result)

  return result
}

/**
 * Generate weekly summary for a user
 *
 * @param userId - The user's ID
 * @returns Weekly summary data or null if not enough data
 *
 * TODO: Implement in Epic 5 (Story 5.3)
 */
export async function generateWeeklySummary(
  userId: string
): Promise<UserWeeklySummary | null> {
  logger.debug('Generating weekly summary (stub)', { userId })

  // Stub implementation - will be completed in Epic 5
  return null
}

/**
 * Check if the weekly job should run today
 * Only runs on Sundays
 *
 * @returns True if today is Sunday
 */
export function shouldRunToday(): boolean {
  const today = new Date()
  return today.getDay() === 0 // Sunday
}
