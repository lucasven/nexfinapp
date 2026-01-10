"use server"

import { getSupabaseServerClient } from "@/lib/supabase/server"
import { trackServerEvent } from "@/lib/analytics/server-tracker"
import { AnalyticsEvent } from "@/lib/analytics/events"
import type { FutureCommitment, MonthCommitmentDetail } from "@/lib/types"

/**
 * Story 2.3: Get Future Commitments
 *
 * Returns aggregated installment obligations by month for the next N months.
 * Shows users what they'll owe each month across all active installment plans.
 *
 * @param monthsAhead - Number of months to look ahead (default 12)
 * @returns Array of monthly commitment totals
 */
export async function getFutureCommitments(
  monthsAhead: number = 12
): Promise<{ success: boolean; data?: FutureCommitment[]; error?: string }> {
  const supabase = await getSupabaseServerClient()

  try {
    // Get authenticated user
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return {
        success: false,
        error: "Not authenticated"
      }
    }

    // Query installment_payments with JOIN to installment_plans
    // Filter: status = 'pending', due_date > CURRENT_DATE
    // Aggregate: SUM(amount), COUNT(*) by month
    // Order by commitment_month ASC
    // Limit to monthsAhead
    const queryStartTime = performance.now()

    const { data, error } = await supabase
      .from('installment_payments')
      .select(`
        due_date,
        amount,
        status,
        plan:installment_plans!inner (
          user_id,
          status
        )
      `)
      .eq('plan.user_id', user.id)
      .eq('plan.status', 'active')
      .eq('status', 'pending')
      .gt('due_date', new Date().toISOString().split('T')[0])
      .order('due_date', { ascending: true })

    const queryExecutionTime = performance.now() - queryStartTime

    if (error) {
      console.error('Error fetching future commitments:', error)
      return {
        success: false,
        error: error.message || "Failed to fetch future commitments"
      }
    }

    if (!data || data.length === 0) {
      return {
        success: true,
        data: []
      }
    }

    // Aggregate by month in application code
    const monthlyTotals = new Map<string, { total_due: number; payment_count: number }>()

    for (const payment of data) {
      // Extract YYYY-MM from due_date
      const month = payment.due_date.substring(0, 7) // "2025-01-15" -> "2025-01"

      const current = monthlyTotals.get(month) || { total_due: 0, payment_count: 0 }
      monthlyTotals.set(month, {
        total_due: current.total_due + payment.amount,
        payment_count: current.payment_count + 1
      })
    }

    // Convert map to array and limit to monthsAhead
    const commitments: FutureCommitment[] = Array.from(monthlyTotals.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(0, monthsAhead)
      .map(([month, values]) => ({
        month,
        total_due: values.total_due,
        payment_count: values.payment_count
      }))

    // Log query performance
    console.log(`[getFutureCommitments] Query execution time: ${queryExecutionTime.toFixed(2)}ms for user ${user.id}`)

    // Alert if query exceeds NFR-P2 target (200ms)
    if (queryExecutionTime > 200) {
      console.warn(`[PERFORMANCE ALERT] getFutureCommitments exceeded 200ms target: ${queryExecutionTime.toFixed(2)}ms for user ${user.id}`)
    }

    // Track analytics event
    const totalCommitment = commitments.reduce((sum, c) => sum + c.total_due, 0)
    const totalPayments = commitments.reduce((sum, c) => sum + c.payment_count, 0)

    await trackServerEvent(user.id, AnalyticsEvent.FUTURE_COMMITMENTS_VIEWED, {
      userId: user.id,
      monthCount: commitments.length,
      totalCommitment,
      paymentCount: totalPayments,
      queryExecutionTime: Math.round(queryExecutionTime),
      channel: 'web',
      timestamp: new Date().toISOString()
    })

    return {
      success: true,
      data: commitments
    }

  } catch (error) {
    console.error('Unexpected error fetching future commitments:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unexpected error"
    }
  }
}

/**
 * Story 2.3: Get Future Commitments by Month
 *
 * Returns individual installment payment details for a specific month.
 * Used when user expands a month to see the breakdown.
 *
 * @param month - Month in YYYY-MM format (e.g., "2025-01")
 * @returns Array of individual payment details for the month
 */
export async function getFutureCommitmentsByMonth(
  month: string
): Promise<{ success: boolean; data?: MonthCommitmentDetail[]; error?: string }> {
  const supabase = await getSupabaseServerClient()

  try {
    // Get authenticated user
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return {
        success: false,
        error: "Not authenticated"
      }
    }

    // Validate month format (YYYY-MM)
    const monthRegex = /^\d{4}-\d{2}$/
    if (!monthRegex.test(month)) {
      return {
        success: false,
        error: "Invalid month format. Expected YYYY-MM"
      }
    }

    // Query individual payments for the specified month
    const { data, error } = await supabase
      .from('installment_payments')
      .select(`
        installment_number,
        amount,
        due_date,
        plan:installment_plans!inner (
          id,
          user_id,
          description,
          total_installments,
          category_id,
          status
        )
      `)
      .eq('plan.user_id', user.id)
      .eq('plan.status', 'active')
      .eq('status', 'pending')
      .gte('due_date', `${month}-01`)
      .lt('due_date', getNextMonth(month))

    if (error) {
      console.error('Error fetching month commitment details:', error)
      return {
        success: false,
        error: error.message || "Failed to fetch month details"
      }
    }

    if (!data || data.length === 0) {
      return {
        success: true,
        data: []
      }
    }

    // Transform to MonthCommitmentDetail format and sort by due_date
    const details: MonthCommitmentDetail[] = data
      .map((item: any) => ({
        plan_id: item.plan.id,
        description: item.plan.description,
        installment_number: item.installment_number,
        total_installments: item.plan.total_installments,
        amount: item.amount,
        category_id: item.plan.category_id,
        due_date: item.due_date
      }))
      .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())

    // Track analytics event
    await trackServerEvent(user.id, AnalyticsEvent.FUTURE_COMMITMENTS_MONTH_EXPANDED, {
      userId: user.id,
      month,
      paymentCount: details.length,
      timestamp: new Date().toISOString()
    })

    return {
      success: true,
      data: details
    }

  } catch (error) {
    console.error('Unexpected error fetching month details:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unexpected error"
    }
  }
}

/**
 * Helper function to get the first day of the next month
 * @param month - Month in YYYY-MM format
 * @returns Next month in YYYY-MM-01 format
 */
function getNextMonth(month: string): string {
  const [year, monthNum] = month.split('-').map(Number)
  const date = new Date(year, monthNum, 1) // monthNum is 0-indexed in JS Date, but our input is 1-indexed
  return date.toISOString().split('T')[0]
}
