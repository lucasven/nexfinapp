"use server"

import { getSupabaseServerClient } from "@/lib/supabase/server"
import type { InstallmentPlanWithDetails, InstallmentCounts } from "@/lib/types"

/**
 * Story 2.4: Get Installment Plans
 *
 * Fetches paginated installments with calculated fields for list view.
 * Supports filtering by status (active, paid_off, cancelled).
 *
 * @param userId - User ID
 * @param status - Installment status to filter by
 * @param page - Page number (1-indexed)
 * @param pageSize - Number of items per page (default 20)
 * @returns Paginated installments and total count
 */
export async function getInstallmentPlans(
  userId: string,
  status: 'active' | 'paid_off' | 'cancelled',
  page: number = 1,
  pageSize: number = 20
): Promise<{ success: boolean; installments?: InstallmentPlanWithDetails[]; total?: number; error?: string }> {
  const supabase = await getSupabaseServerClient()

  try {
    const queryStartTime = performance.now()

    // Calculate offset for pagination
    const offset = (page - 1) * pageSize

    // Query installment_plans with JOINs and calculated fields
    const { data, error, count } = await supabase
      .from('installment_plans')
      .select(`
        *,
        payment_method:payment_methods!inner (
          name,
          type
        ),
        category:categories (
          name,
          icon
        )
      `, { count: 'exact' })
      .eq('user_id', userId)
      .eq('status', status)
      .order(
        status === 'active' ? 'created_at' : 'updated_at',
        { ascending: status === 'active' }
      )
      .range(offset, offset + pageSize - 1)

    const queryExecutionTime = performance.now() - queryStartTime

    if (error) {
      console.error('Error fetching installment plans:', error)
      return {
        success: false,
        error: error.message || "Failed to fetch installment plans"
      }
    }

    if (!data || data.length === 0) {
      return {
        success: true,
        installments: [],
        total: count || 0
      }
    }

    // For each plan, calculate payments_paid and next_payment_date
    const planIds = data.map(plan => plan.id)

    const { data: paymentsData, error: paymentsError } = await supabase
      .from('installment_payments')
      .select('plan_id, status, due_date')
      .in('plan_id', planIds)

    if (paymentsError) {
      console.error('Error fetching payment details:', paymentsError)
      return {
        success: false,
        error: paymentsError.message || "Failed to fetch payment details"
      }
    }

    // Aggregate payment data by plan_id
    const paymentsByPlan = new Map<string, { paid: number; nextDueDate: string | null }>()

    for (const payment of paymentsData || []) {
      const current = paymentsByPlan.get(payment.plan_id) || { paid: 0, nextDueDate: null }

      if (payment.status === 'paid') {
        current.paid++
      } else if (payment.status === 'pending') {
        if (!current.nextDueDate || payment.due_date < current.nextDueDate) {
          current.nextDueDate = payment.due_date
        }
      }

      paymentsByPlan.set(payment.plan_id, current)
    }

    // Build InstallmentPlanWithDetails objects
    const installments: InstallmentPlanWithDetails[] = data.map((plan: any) => {
      const paymentInfo = paymentsByPlan.get(plan.id) || { paid: 0, nextDueDate: null }
      const monthlyAmount = plan.total_amount / plan.total_installments
      const remainingAmount = plan.total_amount - (paymentInfo.paid * monthlyAmount)

      return {
        ...plan,
        payment_method_name: plan.payment_method?.name || 'Unknown',
        payment_method_type: plan.payment_method?.type || 'credit',
        category_name: plan.category?.name || null,
        category_emoji: plan.category?.emoji || null,
        payments_paid: paymentInfo.paid,
        next_payment_date: paymentInfo.nextDueDate,
        remaining_amount: Math.round(remainingAmount * 100) / 100
      }
    })

    // Sort active installments by next_payment_date
    if (status === 'active') {
      installments.sort((a, b) => {
        if (!a.next_payment_date) return 1
        if (!b.next_payment_date) return -1
        return a.next_payment_date.localeCompare(b.next_payment_date)
      })
    }

    // Log query performance
    console.log(`[getInstallmentPlans] Query execution time: ${queryExecutionTime.toFixed(2)}ms for user ${userId}, status ${status}, page ${page}`)

    // Alert if query exceeds NFR-P4 target (1000ms)
    if (queryExecutionTime > 1000) {
      console.warn(`[PERFORMANCE ALERT] getInstallmentPlans exceeded 1s target: ${queryExecutionTime.toFixed(2)}ms for user ${userId}`)
    }

    return {
      success: true,
      installments,
      total: count || 0
    }

  } catch (error) {
    console.error('Unexpected error fetching installment plans:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unexpected error"
    }
  }
}

/**
 * Story 2.4: Get Installment Counts
 *
 * Returns count of installments for each status (active, paid_off, cancelled).
 * Used for tab badge counts.
 *
 * @param userId - User ID
 * @returns Counts for each status
 */
export async function getInstallmentCounts(
  userId: string
): Promise<{ success: boolean; data?: InstallmentCounts; error?: string }> {
  const supabase = await getSupabaseServerClient()

  try {
    const { data, error } = await supabase
      .from('installment_plans')
      .select('status')
      .eq('user_id', userId)

    if (error) {
      console.error('Error fetching installment counts:', error)
      return {
        success: false,
        error: error.message || "Failed to fetch installment counts"
      }
    }

    // Count by status
    const counts: InstallmentCounts = {
      active: 0,
      paid_off: 0
    }

    for (const plan of data || []) {
      if (plan.status === 'active') counts.active++
      else if (plan.status === 'paid_off') counts.paid_off++
    }

    return {
      success: true,
      data: counts
    }

  } catch (error) {
    console.error('Unexpected error fetching installment counts:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unexpected error"
    }
  }
}
