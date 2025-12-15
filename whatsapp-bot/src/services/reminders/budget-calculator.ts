/**
 * Budget Calculator for Statement Reminders
 *
 * Uses the same database functions as the web dashboard to ensure consistency.
 * Single source of truth for budget calculations.
 */

import { getSupabaseClient } from '../database/supabase-client.js'
import { logger } from '../monitoring/logger.js'

export interface BudgetData {
  totalSpent: number
  budget: number | null
  remaining: number
  percentage: number
  periodStart: Date
  periodEnd: Date
  nextClosing: Date
}

/**
 * Get budget data for a reminder
 *
 * Uses the following PostgreSQL functions:
 * - calculate_statement_period(closing_day, today) → period dates
 * - calculate_statement_budget_spent(payment_method_id, user_id, start, end) → total spent
 *
 * This ensures consistency with the web dashboard (Story 3.3)
 */
export async function getBudgetDataForReminder(
  paymentMethodId: string,
  userId: string,
  closingDay: number,
  budget: number | null
): Promise<BudgetData> {
  const supabase = getSupabaseClient()

  try {
    logger.debug('Calculating budget data for reminder', {
      paymentMethodId,
      userId,
      closingDay,
    })

    // Step 1: Calculate statement period using database function
    const today = new Date().toISOString().split('T')[0] // YYYY-MM-DD format

    const { data: periodData, error: periodError } = await supabase.rpc(
      'calculate_statement_period',
      {
        p_closing_day: closingDay,
        p_reference_date: today,
      }
    )

    if (periodError) {
      logger.error('Error calculating statement period', {}, periodError)
      throw periodError
    }

    if (!periodData || periodData.length === 0) {
      throw new Error('No period data returned from calculate_statement_period')
    }

    const period = Array.isArray(periodData) ? periodData[0] : periodData
    const periodStart = new Date(period.period_start)
    const periodEnd = new Date(period.period_end)
    const nextClosing = new Date(period.next_closing)

    logger.debug('Statement period calculated', {
      periodStart: periodStart.toISOString().split('T')[0],
      periodEnd: periodEnd.toISOString().split('T')[0],
      nextClosing: nextClosing.toISOString().split('T')[0],
    })

    // Step 2: Calculate total spent using database function
    const { data: spentData, error: spentError } = await supabase.rpc(
      'calculate_statement_budget_spent',
      {
        p_payment_method_id: paymentMethodId,
        p_user_id: userId,
        p_start_date: period.period_start,
        p_end_date: period.period_end,
      }
    )

    if (spentError) {
      logger.error('Error calculating budget spent', {}, spentError)
      throw spentError
    }

    const totalSpent = typeof spentData === 'number' ? spentData : 0

    logger.debug('Budget spent calculated', {
      totalSpent,
      budget,
    })

    // Step 3: Calculate remaining and percentage
    let remaining = 0
    let percentage = 0

    if (budget && budget > 0) {
      remaining = budget - totalSpent
      percentage = Math.round((totalSpent / budget) * 100)
    }

    return {
      totalSpent,
      budget,
      remaining,
      percentage,
      periodStart,
      periodEnd,
      nextClosing,
    }
  } catch (error) {
    logger.error(
      'Failed to calculate budget data for reminder',
      { paymentMethodId, userId },
      error as Error
    )
    throw error
  }
}

/**
 * Determine budget status based on percentage
 *
 * - on-track: 0-79%
 * - near-limit: 80-99%
 * - exceeded: 100%+
 */
export function getBudgetStatus(percentage: number): 'on-track' | 'near-limit' | 'exceeded' {
  if (percentage >= 100) return 'exceeded'
  if (percentage >= 80) return 'near-limit'
  return 'on-track'
}
