"use server"

import { getSupabaseServerClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { trackServerEvent } from "@/lib/analytics/server-tracker"
import { AnalyticsEvent, AnalyticsProperty } from "@/lib/analytics/events"
import { getStatementPeriodForDate } from "@/lib/utils/statement-period"
import type {
  CreateInstallmentRequest,
  CreateInstallmentResponse,
  FutureCommitment,
  MonthCommitmentDetail,
  InstallmentPlanWithDetails,
  InstallmentPlanDetails,
  InstallmentPaymentWithTransaction,
  InstallmentCounts,
  PayoffConfirmationData,
  PayoffResultData,
  UpdateInstallmentRequest,
  UpdateInstallmentResponse,
  UpdateResultData,
  DeleteResultData,
  DeleteInstallmentResponse
} from "@/lib/types"

/**
 * Story 2.2: Create Installment Plan (Web Frontend)
 *
 * Creates an installment plan with N monthly payments atomically using PostgreSQL RPC function.
 * This function reuses the same backend logic as Story 2.1 (WhatsApp) for consistency.
 *
 * @param data - Installment creation request data
 * @returns Success/error response with plan ID
 */
export async function createInstallment(
  data: CreateInstallmentRequest
): Promise<CreateInstallmentResponse> {
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

    // Validate payment_method_id is a valid UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(data.payment_method_id)) {
      return {
        success: false,
        error: "Invalid payment method ID format"
      }
    }

    // Verify payment method exists and belongs to authenticated user
    const { data: paymentMethod, error: pmError } = await supabase
      .from("payment_methods")
      .select("id, name, type, credit_mode")
      .eq("id", data.payment_method_id)
      .eq("user_id", user.id)
      .single()

    if (pmError || !paymentMethod) {
      return {
        success: false,
        error: "Payment method not found or unauthorized"
      }
    }

    // Verify payment method is Credit Mode
    if (paymentMethod.type !== 'credit' || paymentMethod.credit_mode !== true) {
      return {
        success: false,
        error: "Payment method must be Credit Mode credit card"
      }
    }

    // Validate inputs
    if (data.total_amount <= 0) {
      return {
        success: false,
        error: "Amount must be greater than zero"
      }
    }

    if (data.total_installments < 1 || data.total_installments > 60) {
      return {
        success: false,
        error: "Installments must be between 1 and 60"
      }
    }

    // Call PostgreSQL RPC function to create installment plan atomically
    // This function creates 1 installment_plan + N installment_payments in a single transaction
    const { data: rpcData, error: rpcError } = await supabase.rpc('create_installment_plan_atomic', {
      p_user_id: user.id,
      p_payment_method_id: data.payment_method_id,
      p_description: data.description,
      p_total_amount: data.total_amount,
      p_total_installments: data.total_installments,
      p_merchant: data.merchant || null,
      p_category_id: data.category_id || null,
      p_first_payment_date: data.first_payment_date
    })

    if (rpcError) {
      console.error('RPC error creating installment plan:', rpcError)
      return {
        success: false,
        error: rpcError.message || "Failed to create installment plan"
      }
    }

    // RPC returns array with single object: { plan_id, success, error_message }
    const result = Array.isArray(rpcData) ? rpcData[0] : rpcData

    if (!result || !result.success) {
      return {
        success: false,
        error: result?.error_message || "Failed to create installment plan"
      }
    }

    const planId = result.plan_id
    const monthlyAmount = Math.round((data.total_amount / data.total_installments) * 100) / 100

    // Fetch all installment payments created by the RPC
    const { data: payments, error: paymentsError } = await supabase
      .from('installment_payments')
      .select('*')
      .eq('plan_id', planId)
      .order('installment_number', { ascending: true })

    if (paymentsError || !payments || payments.length === 0) {
      console.error('Error fetching installment payments:', paymentsError)
      return {
        success: false,
        error: "Failed to fetch installment payments"
      }
    }

    // Get payment method details for statement period calculation
    const { data: paymentMethodDetails, error: pmDetailsError } = await supabase
      .from("payment_methods")
      .select("statement_closing_day")
      .eq("id", data.payment_method_id)
      .single()

    if (pmDetailsError) {
      console.error('Error fetching payment method details:', pmDetailsError)
      return {
        success: false,
        error: "Failed to fetch payment method details"
      }
    }

    // Create transactions for each installment payment
    let transactionsCreated = 0
    let transactionsFailed = 0

    for (const payment of payments) {
      try {
        // Generate description with installment number
        const description = `${data.description} (${payment.installment_number}/${data.total_installments})`

        // Generate user-readable ID using the database function
        const { data: readableIdData, error: idError } = await supabase.rpc("generate_transaction_id")

        if (idError) {
          console.error(`Error generating transaction ID for installment ${payment.installment_number}:`, idError)
          transactionsFailed++

          await trackServerEvent(user.id, AnalyticsEvent.INSTALLMENT_TRANSACTION_CREATION_FAILED, {
            userId: user.id,
            planId: planId,
            installmentNumber: payment.installment_number,
            error: idError.message
          })
          continue
        }

        // Create transaction
        const { data: transaction, error: txError } = await supabase
          .from('transactions')
          .insert({
            user_id: user.id,
            amount: payment.amount,
            type: 'expense',
            category_id: data.category_id || null,
            description: description,
            date: payment.due_date,
            payment_method_id: data.payment_method_id,
            user_readable_id: readableIdData,
            metadata: {
              installment_source: true,
              installment_plan_id: planId,
              installment_number: payment.installment_number,
              total_installments: data.total_installments
            }
          })
          .select()
          .single()

        if (txError || !transaction) {
          console.error(`Error creating transaction for installment ${payment.installment_number}:`, txError)
          transactionsFailed++

          await trackServerEvent(user.id, AnalyticsEvent.INSTALLMENT_TRANSACTION_CREATION_FAILED, {
            userId: user.id,
            planId: planId,
            installmentNumber: payment.installment_number,
            error: txError?.message || 'Unknown error'
          })
          continue
        }

        // Determine if this payment is in current/past period
        let isPastOrCurrent = false
        if (paymentMethodDetails.statement_closing_day != null) {
          const paymentDate = new Date(payment.due_date)
          const periodInfo = getStatementPeriodForDate(
            paymentMethodDetails.statement_closing_day,
            paymentDate,
            new Date()
          )
          isPastOrCurrent = periodInfo.period === 'past' || periodInfo.period === 'current'
        }

        // Link transaction to payment and update status
        const { error: updateError } = await supabase
          .from('installment_payments')
          .update({
            transaction_id: transaction.id,
            status: isPastOrCurrent ? 'paid' : 'pending'
          })
          .eq('id', payment.id)

        if (updateError) {
          console.error(`Error linking transaction to payment ${payment.installment_number}:`, updateError)
          transactionsFailed++

          await trackServerEvent(user.id, AnalyticsEvent.INSTALLMENT_TRANSACTION_CREATION_FAILED, {
            userId: user.id,
            planId: planId,
            installmentNumber: payment.installment_number,
            error: updateError.message
          })
          continue
        }

        transactionsCreated++

        // Track analytics for each successful transaction creation
        await trackServerEvent(user.id, AnalyticsEvent.INSTALLMENT_TRANSACTION_CREATED, {
          userId: user.id,
          planId: planId,
          transactionId: transaction.id,
          installmentNumber: payment.installment_number,
          totalInstallments: data.total_installments,
          amount: payment.amount,
          status: isPastOrCurrent ? 'paid' : 'pending',
          channel: 'web'
        })

      } catch (error) {
        console.error(`Unexpected error creating transaction for installment ${payment.installment_number}:`, error)
        transactionsFailed++

        await trackServerEvent(user.id, AnalyticsEvent.INSTALLMENT_TRANSACTION_CREATION_FAILED, {
          userId: user.id,
          planId: planId,
          installmentNumber: payment.installment_number,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }

    // Track overall completion event
    await trackServerEvent(user.id, AnalyticsEvent.INSTALLMENT_ALL_TRANSACTIONS_CREATED, {
      userId: user.id,
      planId: planId,
      totalInstallments: data.total_installments,
      transactionsCreated: transactionsCreated,
      transactionsFailed: transactionsFailed,
      channel: 'web'
    })

    // Track success analytics event for installment plan creation
    await trackServerEvent(user.id, AnalyticsEvent.INSTALLMENT_CREATED, {
      userId: user.id,
      planId: planId,
      paymentMethodId: data.payment_method_id,
      totalAmount: data.total_amount,
      totalInstallments: data.total_installments,
      monthlyAmount: monthlyAmount,
      hasDescription: !!data.description,
      hasMerchant: !!data.merchant,
      hasCategory: !!data.category_id,
      channel: 'web',
      timestamp: new Date().toISOString()
    })

    // Revalidate paths to refresh data
    revalidatePath("/")
    revalidatePath("/[locale]/installments")
    revalidatePath("/[locale]")

    return {
      success: true,
      planId: planId
    }

  } catch (error) {
    console.error('Unexpected error creating installment:', error)

    // Track failure analytics event
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (user) {
        await trackServerEvent(user.id, AnalyticsEvent.INSTALLMENT_CREATION_FAILED, {
          userId: user.id,
          error: error instanceof Error ? error.message : 'Unknown error',
          totalAmount: data.total_amount || null,
          totalInstallments: data.total_installments || null,
          channel: 'web'
        })
      }
    } catch (trackError) {
      console.error('Failed to track error event:', trackError)
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : "Unexpected error creating installment"
    }
  }
}

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
 * Story 2.4: Get Installment Details
 *
 * Fetches complete installment plan with all payments for details modal.
 *
 * @param planId - Installment plan ID
 * @returns Complete plan details with payment schedule
 */
export async function getInstallmentDetails(
  planId: string
): Promise<{ success: boolean; data?: InstallmentPlanDetails; error?: string }> {
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

    // Query installment plan
    const { data: planData, error: planError } = await supabase
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
      `)
      .eq('id', planId)
      .eq('user_id', user.id)
      .single()

    if (planError || !planData) {
      console.error('Error fetching installment plan:', planError)
      return {
        success: false,
        error: planError?.message || "Installment plan not found"
      }
    }

    // Query all payments for this plan
    const { data: paymentsData, error: paymentsError } = await supabase
      .from('installment_payments')
      .select(`
        *,
        transaction:transactions (
          id,
          date
        )
      `)
      .eq('plan_id', planId)
      .order('installment_number', { ascending: true })

    if (paymentsError) {
      console.error('Error fetching payments:', paymentsError)
      return {
        success: false,
        error: paymentsError.message || "Failed to fetch payments"
      }
    }

    // Transform payments to include transaction data
    const payments: InstallmentPaymentWithTransaction[] = (paymentsData || []).map((payment: any) => ({
      ...payment,
      transaction_id: payment.transaction?.id || null,
      transaction_date: payment.transaction?.date || null
    }))

    // Calculate totals
    const totalPaid = payments
      .filter(p => p.status === 'paid')
      .reduce((sum, p) => sum + p.amount, 0)

    const totalRemaining = payments
      .filter(p => p.status === 'pending')
      .reduce((sum, p) => sum + p.amount, 0)

    const paymentsPaidCount = payments.filter(p => p.status === 'paid').length
    const paymentsPendingCount = payments.filter(p => p.status === 'pending').length

    // Calculate payments_paid for the plan
    const paymentInfo = payments.filter(p => p.status === 'paid').length
    const monthlyAmount = planData.total_amount / planData.total_installments
    const remainingAmount = planData.total_amount - (paymentInfo * monthlyAmount)
    const nextPaymentDate = payments.find(p => p.status === 'pending')?.due_date || null

    const plan: InstallmentPlanWithDetails = {
      ...planData,
      payment_method_name: planData.payment_method?.name || 'Unknown',
      payment_method_type: planData.payment_method?.type || 'credit',
      category_name: planData.category?.name || null,
      category_emoji: planData.category?.emoji || null,
      payments_paid: paymentInfo,
      next_payment_date: nextPaymentDate,
      remaining_amount: Math.round(remainingAmount * 100) / 100
    }

    // Track analytics event
    await trackServerEvent(user.id, AnalyticsEvent.INSTALLMENT_DETAILS_VIEWED, {
      userId: user.id,
      planId: planId,
      status: planData.status,
      total_installments: planData.total_installments,
      payments_paid: paymentsPaidCount,
      timestamp: new Date().toISOString()
    })

    return {
      success: true,
      data: {
        plan,
        payments,
        total_paid: Math.round(totalPaid * 100) / 100,
        total_remaining: Math.round(totalRemaining * 100) / 100,
        payments_paid_count: paymentsPaidCount,
        payments_pending_count: paymentsPendingCount
      }
    }

  } catch (error) {
    console.error('Unexpected error fetching installment details:', error)
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

/**
 * Story 2.5: Get Payoff Confirmation Data
 *
 * Fetches installment plan details and calculates totals for payoff confirmation dialog.
 *
 * @param planId - Installment plan ID
 * @returns Confirmation data with paid/pending amounts
 */
export async function getPayoffConfirmationData(
  planId: string
): Promise<{ success: boolean; data?: PayoffConfirmationData; error?: string }> {
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

    const queryStartTime = performance.now()

    // Query plan with payment method and payments
    const { data: planData, error: planError } = await supabase
      .from('installment_plans')
      .select(`
        id,
        description,
        total_amount,
        total_installments,
        status,
        payment_method:payment_methods!inner (
          name
        )
      `)
      .eq('id', planId)
      .eq('user_id', user.id)
      .single()

    if (planError || !planData) {
      console.error('Error fetching plan for payoff confirmation:', planError)
      return {
        success: false,
        error: planError?.message || "Installment plan not found"
      }
    }

    // Verify plan is active
    if (planData.status !== 'active') {
      return {
        success: false,
        error: planData.status === 'paid_off'
          ? "Installment plan already paid off"
          : "Installment plan is cancelled"
      }
    }

    // Query payments to calculate totals
    const { data: paymentsData, error: paymentsError } = await supabase
      .from('installment_payments')
      .select('status, amount, transaction_id')
      .eq('plan_id', planId)

    if (paymentsError) {
      console.error('Error fetching payments for payoff confirmation:', paymentsError)
      return {
        success: false,
        error: paymentsError.message || "Failed to fetch payment details"
      }
    }

    // Calculate paid and pending totals
    let payments_paid = 0
    let amount_paid = 0
    let payments_pending = 0
    let amount_remaining = 0
    let pending_transactions_count = 0

    for (const payment of paymentsData || []) {
      if (payment.status === 'paid') {
        payments_paid++
        amount_paid += payment.amount
      } else if (payment.status === 'pending') {
        payments_pending++
        amount_remaining += payment.amount
        // Count pending payments with linked transactions (these will be deleted on payoff)
        if (payment.transaction_id) {
          pending_transactions_count++
        }
      }
    }

    const queryExecutionTime = performance.now() - queryStartTime

    // Log query performance
    console.log(`[getPayoffConfirmationData] Query execution time: ${queryExecutionTime.toFixed(2)}ms for plan ${planId}`)

    // Alert if query exceeds 100ms target
    if (queryExecutionTime > 100) {
      console.warn(`[PERFORMANCE ALERT] getPayoffConfirmationData exceeded 100ms target: ${queryExecutionTime.toFixed(2)}ms for plan ${planId}`)
    }

    // Extract payment method name (Supabase returns array for foreign key joins)
    const paymentMethodName = Array.isArray(planData.payment_method) && planData.payment_method.length > 0
      ? planData.payment_method[0].name
      : 'Unknown'

    const confirmationData: PayoffConfirmationData = {
      plan_id: planData.id,
      description: planData.description,
      payment_method_name: paymentMethodName,
      total_amount: planData.total_amount,
      total_installments: planData.total_installments,
      payments_paid,
      amount_paid: Math.round(amount_paid * 100) / 100,
      payments_pending,
      amount_remaining: Math.round(amount_remaining * 100) / 100,
      pending_transactions_count
    }

    return {
      success: true,
      data: confirmationData
    }

  } catch (error) {
    console.error('Unexpected error fetching payoff confirmation data:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unexpected error"
    }
  }
}

/**
 * Story 2.5: Pay Off Installment Early (Phase 2 Enhancement)
 *
 * Marks an active installment plan as paid off and cancels all pending payments.
 * Optionally creates a payoff transaction to record the payment.
 * Uses the delete_installment_plan_atomic RPC function with 'paid_off' type.
 *
 * @param planId - Installment plan ID
 * @param options - Optional payoff transaction parameters
 * @returns Success/error response with payoff details
 */
export async function payOffInstallment(
  planId: string,
  options?: {
    createPayoffTransaction?: boolean
    payoffAmount?: number
    payoffPaymentMethodId?: string
    payoffDate?: string
  }
): Promise<{ success: boolean; error?: string; paidOffData?: PayoffResultData }> {
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

    // Validate plan ID is a valid UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(planId)) {
      return {
        success: false,
        error: "Invalid plan ID format"
      }
    }

    // Get payoff data before executing (for analytics)
    const { data: confirmData } = await getPayoffConfirmationData(planId)

    if (!confirmData) {
      return {
        success: false,
        error: "Failed to fetch plan details"
      }
    }

    const executionStartTime = performance.now()

    // Call PostgreSQL RPC function to pay off installment plan atomically
    // This function updates plan status to 'paid_off' and cancels pending payments
    const { data: rpcData, error: rpcError } = await supabase.rpc('delete_installment_plan_atomic', {
      p_user_id: user.id,
      p_plan_id: planId,
      p_delete_type: 'paid_off'
    })

    const executionTime = performance.now() - executionStartTime

    if (rpcError) {
      console.error('RPC error paying off installment plan:', rpcError)

      // Track failure analytics event
      await trackServerEvent(user.id, AnalyticsEvent.INSTALLMENT_PAYOFF_FAILED, {
        userId: user.id,
        planId: planId,
        error: rpcError.message,
        channel: 'web',
        timestamp: new Date().toISOString()
      })

      return {
        success: false,
        error: rpcError.message || "Failed to pay off installment plan"
      }
    }

    // RPC returns array with single object: { success, error_message }
    const result = Array.isArray(rpcData) ? rpcData[0] : rpcData

    if (!result || !result.success) {
      const errorMsg = result?.error_message || "Failed to pay off installment plan"

      // Track failure analytics event
      await trackServerEvent(user.id, AnalyticsEvent.INSTALLMENT_PAYOFF_FAILED, {
        userId: user.id,
        planId: planId,
        error: errorMsg,
        channel: 'web',
        timestamp: new Date().toISOString()
      })

      return {
        success: false,
        error: errorMsg
      }
    }

    // Log execution performance
    console.log(`[payOffInstallment] Execution time: ${executionTime.toFixed(2)}ms for plan ${planId}`)

    // Alert if execution exceeds 200ms target
    if (executionTime > 200) {
      console.warn(`[PERFORMANCE ALERT] payOffInstallment exceeded 200ms target: ${executionTime.toFixed(2)}ms for plan ${planId}`)
    }

    const paidOffData: PayoffResultData = {
      plan_id: planId,
      payments_cancelled: confirmData.payments_pending,
      amount_removed: confirmData.amount_remaining
    }

    // Phase 2: Create payoff transaction if requested
    let payoffTransactionId: string | undefined
    if (options?.createPayoffTransaction && options.payoffAmount && options.payoffPaymentMethodId && options.payoffDate) {
      try {
        // Generate readable transaction ID
        const { data: readableIdData, error: readableIdError } = await supabase.rpc('generate_transaction_id')

        if (readableIdError) {
          console.error('Error generating readable ID for payoff transaction:', readableIdError)
          throw new Error('Failed to generate transaction ID')
        }

        // Create payoff transaction
        const { data: transaction, error: txError } = await supabase
          .from('transactions')
          .insert({
            user_id: user.id,
            amount: options.payoffAmount,
            type: 'expense',
            description: `Quitação: ${confirmData.description}`,
            date: options.payoffDate,
            payment_method_id: options.payoffPaymentMethodId,
            user_readable_id: readableIdData,
            metadata: {
              payoff_transaction: true,
              installment_plan_id: planId,
              original_description: confirmData.description,
              payments_paid_off: confirmData.payments_pending,
              amount_paid_off: confirmData.amount_remaining
            }
          })
          .select('id')
          .single()

        if (txError) {
          console.error('Error creating payoff transaction:', txError)
          // Don't fail the entire payoff if transaction creation fails
          // The payoff itself was successful, just log the error
        } else if (transaction) {
          payoffTransactionId = transaction.id
          console.log(`[payOffInstallment] Created payoff transaction ${transaction.id}`)
        }
      } catch (txError) {
        console.error('Unexpected error creating payoff transaction:', txError)
        // Continue - payoff itself was successful
      }
    }

    // Track success analytics event
    await trackServerEvent(user.id, AnalyticsEvent.INSTALLMENT_PAID_OFF_EARLY, {
      userId: user.id,
      planId: planId,
      total_amount: confirmData.total_amount,
      total_installments: confirmData.total_installments,
      payments_paid: confirmData.payments_paid,
      payments_pending: confirmData.payments_pending,
      remaining_amount: confirmData.amount_remaining,
      transactions_deleted: confirmData.pending_transactions_count,
      payoff_transaction_created: !!payoffTransactionId,
      payoff_amount: options?.payoffAmount,
      payoff_payment_method: options?.payoffPaymentMethodId,
      executionTime: Math.round(executionTime),
      channel: 'web',
      timestamp: new Date().toISOString()
    })

    // Revalidate paths to refresh data
    revalidatePath("/")
    revalidatePath("/[locale]/installments")

    return {
      success: true,
      paidOffData
    }

  } catch (error) {
    console.error('Unexpected error paying off installment:', error)

    // Track failure analytics event
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (user) {
        await trackServerEvent(user.id, AnalyticsEvent.INSTALLMENT_PAYOFF_FAILED, {
          userId: user.id,
          planId: planId,
          error: error instanceof Error ? error.message : 'Unknown error',
          channel: 'web',
          timestamp: new Date().toISOString()
        })
      }
    } catch (trackError) {
      console.error('Failed to track error event:', trackError)
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : "Unexpected error paying off installment"
    }
  }
}

/**
 * Story 2.6: Update Installment Plan
 *
 * Edits an active installment plan's details (description, amount, installments, merchant, category).
 * Automatically recalculates pending payments when amount or installment count changes.
 * Preserves paid payment history (only pending payments are updated).
 *
 * @param planId - Installment plan ID
 * @param updates - Fields to update
 * @returns Success/error response with update details
 */
export async function updateInstallment(
  planId: string,
  updates: UpdateInstallmentRequest
): Promise<UpdateInstallmentResponse> {
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

    // Validate plan ID is a valid UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(planId)) {
      return {
        success: false,
        error: "Invalid plan ID format"
      }
    }

    const executionStartTime = performance.now()

    // Fetch current plan details
    const { data: planData, error: planError } = await supabase
      .from('installment_plans')
      .select('*')
      .eq('id', planId)
      .eq('user_id', user.id)
      .single()

    if (planError || !planData) {
      return {
        success: false,
        error: "Installment plan not found or unauthorized"
      }
    }

    // Verify plan is active (only active plans can be edited)
    if (planData.status !== 'active') {
      return {
        success: false,
        error: planData.status === 'paid_off'
          ? "Cannot edit paid off installment"
          : "Cannot edit cancelled installment"
      }
    }

    // Validate inputs
    if (updates.description !== undefined && updates.description.trim() === '') {
      return {
        success: false,
        error: "Description cannot be empty"
      }
    }

    if (updates.total_amount !== undefined && updates.total_amount <= 0) {
      return {
        success: false,
        error: "Amount must be greater than zero"
      }
    }

    if (updates.total_installments !== undefined) {
      if (updates.total_installments < 1 || updates.total_installments > 60) {
        return {
          success: false,
          error: "Installments must be between 1 and 60"
        }
      }
    }

    // Get payment counts to validate installment reduction
    const { data: paymentsData, error: paymentsError } = await supabase
      .from('installment_payments')
      .select('status, amount')
      .eq('plan_id', planId)

    if (paymentsError) {
      return {
        success: false,
        error: "Failed to fetch payment details"
      }
    }

    const paidCount = paymentsData?.filter(p => p.status === 'paid').length || 0
    const paidAmount = paymentsData
      ?.filter(p => p.status === 'paid')
      .reduce((sum, p) => sum + p.amount, 0) || 0

    // Validate installment count not below paid count
    if (updates.total_installments !== undefined && updates.total_installments < paidCount) {
      return {
        success: false,
        error: `Cannot reduce installments below ${paidCount} (already paid)`
      }
    }

    // Track fields changed
    const fieldsChanged: string[] = []
    const oldValues: any = {}
    const newValues: any = {}

    if (updates.description !== undefined && updates.description !== planData.description) {
      fieldsChanged.push('description')
      oldValues.description = planData.description
      newValues.description = updates.description
    }

    if (updates.total_amount !== undefined && updates.total_amount !== planData.total_amount) {
      fieldsChanged.push('total_amount')
      oldValues.total_amount = planData.total_amount
      newValues.total_amount = updates.total_amount
    }

    if (updates.total_installments !== undefined && updates.total_installments !== planData.total_installments) {
      fieldsChanged.push('total_installments')
      oldValues.total_installments = planData.total_installments
      newValues.total_installments = updates.total_installments
    }

    if (updates.merchant !== undefined && updates.merchant !== planData.merchant) {
      fieldsChanged.push('merchant')
      oldValues.merchant = planData.merchant
      newValues.merchant = updates.merchant
    }

    if (updates.category_id !== undefined && updates.category_id !== planData.category_id) {
      fieldsChanged.push('category_id')
      oldValues.category_id = planData.category_id
      newValues.category_id = updates.category_id
    }

    if (fieldsChanged.length === 0) {
      return {
        success: false,
        error: "No changes detected"
      }
    }

    // Prepare update object for installment_plans
    const planUpdates: any = {
      updated_at: new Date().toISOString()
    }

    if (updates.description !== undefined) {
      planUpdates.description = updates.description
    }
    if (updates.total_amount !== undefined) {
      planUpdates.total_amount = updates.total_amount
    }
    if (updates.total_installments !== undefined) {
      planUpdates.total_installments = updates.total_installments
    }
    if (updates.merchant !== undefined) {
      planUpdates.merchant = updates.merchant
    }
    if (updates.category_id !== undefined) {
      planUpdates.category_id = updates.category_id
    }

    // Update the plan
    const { error: updateError } = await supabase
      .from('installment_plans')
      .update(planUpdates)
      .eq('id', planId)
      .eq('user_id', user.id)

    if (updateError) {
      console.error('Error updating installment plan:', updateError)
      return {
        success: false,
        error: updateError.message || "Failed to update installment plan"
      }
    }

    let paymentsAdded = 0
    let paymentsRemoved = 0
    let paymentsRecalculated = 0

    // Handle installment count change (add/remove payments)
    if (updates.total_installments !== undefined && updates.total_installments !== planData.total_installments) {
      const result = await adjustPaymentCount(
        supabase,
        planId,
        planData.total_installments,
        updates.total_installments,
        paidCount
      )

      if (!result.success) {
        return {
          success: false,
          error: result.error
        }
      }

      paymentsAdded = result.paymentsAdded || 0
      paymentsRemoved = result.paymentsRemoved || 0
    }

    // Handle amount or installment count change (recalculate pending payments)
    const needsRecalculation =
      (updates.total_amount !== undefined && updates.total_amount !== planData.total_amount) ||
      (updates.total_installments !== undefined && updates.total_installments !== planData.total_installments)

    if (needsRecalculation) {
      const finalTotalAmount = updates.total_amount !== undefined ? updates.total_amount : planData.total_amount
      const finalTotalInstallments = updates.total_installments !== undefined ? updates.total_installments : planData.total_installments

      const result = await recalculatePendingPayments(
        supabase,
        planId,
        finalTotalAmount,
        finalTotalInstallments,
        paidCount,
        paidAmount
      )

      if (!result.success) {
        return {
          success: false,
          error: result.error
        }
      }

      paymentsRecalculated = result.paymentsRecalculated || 0
    }

    const executionTime = performance.now() - executionStartTime

    // Log execution performance
    console.log(`[updateInstallment] Execution time: ${executionTime.toFixed(2)}ms for plan ${planId}`)

    // Alert if execution exceeds 300ms target
    if (executionTime > 300) {
      console.warn(`[PERFORMANCE ALERT] updateInstallment exceeded 300ms target: ${executionTime.toFixed(2)}ms for plan ${planId}`)
    }

    const updateData: UpdateResultData = {
      plan_id: planId,
      fields_changed: fieldsChanged,
      old_amount: oldValues.total_amount,
      new_amount: newValues.total_amount,
      old_installments: oldValues.total_installments,
      new_installments: newValues.total_installments,
      payments_added: paymentsAdded > 0 ? paymentsAdded : undefined,
      payments_removed: paymentsRemoved > 0 ? paymentsRemoved : undefined,
      payments_recalculated: paymentsRecalculated > 0 ? paymentsRecalculated : undefined
    }

    // Track success analytics event
    await trackServerEvent(user.id, AnalyticsEvent.INSTALLMENT_EDITED, {
      userId: user.id,
      planId: planId,
      fieldsChanged: fieldsChanged,
      oldAmount: oldValues.total_amount,
      newAmount: newValues.total_amount,
      oldInstallments: oldValues.total_installments,
      newInstallments: newValues.total_installments,
      paymentsAdded,
      paymentsRemoved,
      paymentsRecalculated,
      executionTime: Math.round(executionTime),
      channel: 'web',
      timestamp: new Date().toISOString()
    })

    // Revalidate paths to refresh data
    revalidatePath("/")
    revalidatePath("/[locale]/installments")

    return {
      success: true,
      updateData
    }

  } catch (error) {
    console.error('Unexpected error updating installment:', error)

    // Track failure analytics event
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (user) {
        await trackServerEvent(user.id, AnalyticsEvent.INSTALLMENT_EDIT_FAILED, {
          userId: user.id,
          planId: planId,
          errorType: error instanceof Error ? error.name : 'UnknownError',
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString()
        })
      }
    } catch (trackError) {
      console.error('Failed to track error event:', trackError)
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : "Unexpected error updating installment"
    }
  }
}

/**
 * Helper: Adjust Payment Count
 *
 * Adds or removes pending payments when installment count changes.
 * - Increase: Creates new pending payments with calculated due dates
 * - Decrease: Deletes excess pending payments
 *
 * @param supabase - Supabase client
 * @param planId - Installment plan ID
 * @param oldTotal - Current total installments
 * @param newTotal - New total installments
 * @param paidCount - Number of already paid payments
 * @returns Result with count of payments added/removed
 */
async function adjustPaymentCount(
  supabase: any,
  planId: string,
  oldTotal: number,
  newTotal: number,
  paidCount: number
): Promise<{ success: boolean; error?: string; paymentsAdded?: number; paymentsRemoved?: number }> {
  try {
    if (newTotal > oldTotal) {
      // Add new pending payments
      const paymentsToAdd = newTotal - oldTotal

      // Get the last payment's due date to calculate new due dates
      const { data: lastPayment, error: lastPaymentError } = await supabase
        .from('installment_payments')
        .select('due_date')
        .eq('plan_id', planId)
        .order('installment_number', { ascending: false })
        .limit(1)
        .single()

      if (lastPaymentError || !lastPayment) {
        return {
          success: false,
          error: "Failed to fetch last payment for date calculation"
        }
      }

      const lastDueDate = new Date(lastPayment.due_date)

      // Create new payments
      const newPayments = []
      for (let i = 1; i <= paymentsToAdd; i++) {
        const newDueDate = new Date(lastDueDate)
        newDueDate.setMonth(newDueDate.getMonth() + i)

        newPayments.push({
          plan_id: planId,
          installment_number: oldTotal + i,
          amount: 0, // Will be recalculated by recalculatePendingPayments
          due_date: newDueDate.toISOString().split('T')[0],
          status: 'pending',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
      }

      const { error: insertError } = await supabase
        .from('installment_payments')
        .insert(newPayments)

      if (insertError) {
        console.error('Error inserting new payments:', insertError)
        return {
          success: false,
          error: "Failed to add new payments"
        }
      }

      return {
        success: true,
        paymentsAdded: paymentsToAdd
      }

    } else if (newTotal < oldTotal) {
      // Remove excess pending payments
      const { error: deleteError } = await supabase
        .from('installment_payments')
        .delete()
        .eq('plan_id', planId)
        .eq('status', 'pending')
        .gt('installment_number', newTotal)

      if (deleteError) {
        console.error('Error deleting excess payments:', deleteError)
        return {
          success: false,
          error: "Failed to remove excess payments"
        }
      }

      const paymentsRemoved = oldTotal - newTotal

      return {
        success: true,
        paymentsRemoved
      }
    }

    return { success: true }

  } catch (error) {
    console.error('Error adjusting payment count:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to adjust payment count"
    }
  }
}

/**
 * Helper: Recalculate Pending Payments
 *
 * Recalculates monthly payment amounts for all pending payments.
 * Formula: (totalAmount - paidAmount) / pendingCount
 * Last payment absorbs rounding difference.
 *
 * @param supabase - Supabase client
 * @param planId - Installment plan ID
 * @param totalAmount - New total amount
 * @param totalInstallments - New total installments
 * @param paidCount - Number of already paid payments
 * @param paidAmount - Total amount already paid
 * @returns Result with count of payments recalculated
 */
async function recalculatePendingPayments(
  supabase: any,
  planId: string,
  totalAmount: number,
  totalInstallments: number,
  paidCount: number,
  paidAmount: number
): Promise<{ success: boolean; error?: string; paymentsRecalculated?: number }> {
  try {
    const pendingCount = totalInstallments - paidCount
    const remainingAmount = totalAmount - paidAmount

    if (pendingCount <= 0) {
      // All payments are paid, nothing to recalculate
      return { success: true, paymentsRecalculated: 0 }
    }

    // Calculate new monthly payment (round to 2 decimal places)
    const monthlyPayment = Math.floor((remainingAmount / pendingCount) * 100) / 100

    // Calculate rounding difference for last payment
    const expectedTotal = monthlyPayment * pendingCount
    const roundingDifference = Math.round((remainingAmount - expectedTotal) * 100) / 100

    // Get all pending payments
    const { data: pendingPayments, error: fetchError } = await supabase
      .from('installment_payments')
      .select('id, installment_number')
      .eq('plan_id', planId)
      .eq('status', 'pending')
      .order('installment_number', { ascending: true })

    if (fetchError) {
      console.error('Error fetching pending payments:', fetchError)
      return {
        success: false,
        error: "Failed to fetch pending payments"
      }
    }

    if (!pendingPayments || pendingPayments.length === 0) {
      return { success: true, paymentsRecalculated: 0 }
    }

    // Update all pending payments except the last one
    const paymentIdsExceptLast = pendingPayments.slice(0, -1).map((p: any) => p.id)

    if (paymentIdsExceptLast.length > 0) {
      const { error: updateError } = await supabase
        .from('installment_payments')
        .update({
          amount: monthlyPayment,
          updated_at: new Date().toISOString()
        })
        .in('id', paymentIdsExceptLast)

      if (updateError) {
        console.error('Error updating pending payments:', updateError)
        return {
          success: false,
          error: "Failed to update pending payments"
        }
      }
    }

    // Update the last payment with rounding adjustment
    const lastPayment = pendingPayments[pendingPayments.length - 1]
    const lastPaymentAmount = monthlyPayment + roundingDifference

    const { error: updateLastError } = await supabase
      .from('installment_payments')
      .update({
        amount: lastPaymentAmount,
        updated_at: new Date().toISOString()
      })
      .eq('id', lastPayment.id)

    if (updateLastError) {
      console.error('Error updating last pending payment:', updateLastError)
      return {
        success: false,
        error: "Failed to update last pending payment"
      }
    }

    return {
      success: true,
      paymentsRecalculated: pendingPayments.length
    }

  } catch (error) {
    console.error('Error recalculating pending payments:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to recalculate payments"
    }
  }
}

/**
 * Story 2.7: Delete Installment Plan
 *
 * Permanently deletes an installment plan and all associated payments.
 * Preserves paid transactions by orphaning them (sets installment_payment_id to NULL).
 * Atomically removes plan and pending payments via CASCADE DELETE.
 *
 * @param planId - Installment plan ID
 * @returns Success/error response with deletion details
 */
export async function deleteInstallment(
  planId: string
): Promise<DeleteInstallmentResponse> {
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

    // Validate plan ID is a valid UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(planId)) {
      return {
        success: false,
        error: "Invalid plan ID format"
      }
    }

    const executionStartTime = performance.now()

    // Execute atomic deletion
    const result = await executeAtomicDeletion(supabase, planId, user.id)

    const executionTime = performance.now() - executionStartTime

    if (!result.success) {
      // Track failure analytics event
      await trackServerEvent(user.id, AnalyticsEvent.INSTALLMENT_DELETE_FAILED, {
        userId: user.id,
        planId: planId,
        errorType: result.error || 'Unknown',
        errorMessage: result.error || 'Unknown error',
        timestamp: new Date().toISOString()
      })

      return {
        success: false,
        error: result.error
      }
    }

    // Log execution performance
    console.log(`[deleteInstallment] Execution time: ${executionTime.toFixed(2)}ms for plan ${planId}`)

    // Alert if execution exceeds 200ms target
    if (executionTime > 200) {
      console.warn(`[PERFORMANCE ALERT] deleteInstallment exceeded 200ms target: ${executionTime.toFixed(2)}ms for plan ${planId}`)
    }

    // Track success analytics event
    await trackServerEvent(user.id, AnalyticsEvent.INSTALLMENT_DELETED, {
      userId: user.id,
      planId: planId,
      description: result.deletedData!.description,
      paidCount: result.deletedData!.paidCount,
      pendingCount: result.deletedData!.pendingCount,
      paidAmount: result.deletedData!.paidAmount,
      pendingAmount: result.deletedData!.pendingAmount,
      channel: 'web',
      timestamp: new Date().toISOString()
    })

    // Revalidate paths to refresh data
    revalidatePath("/")
    revalidatePath("/[locale]/installments")

    return {
      success: true,
      deletedData: result.deletedData
    }

  } catch (error) {
    console.error('Unexpected error deleting installment:', error)

    // Track failure analytics event
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (user) {
        await trackServerEvent(user.id, AnalyticsEvent.INSTALLMENT_DELETE_FAILED, {
          userId: user.id,
          planId: planId,
          errorType: error instanceof Error ? error.name : 'UnknownError',
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString()
        })
      }
    } catch (trackError) {
      console.error('Failed to track error event:', trackError)
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : "Unexpected error deleting installment"
    }
  }
}

/**
 * Helper: Execute Atomic Deletion
 *
 * Performs atomic deletion of installment plan with paid transaction preservation.
 * Steps:
 * 1. Verify ownership (RLS + explicit check)
 * 2. Count payments for response (paid/pending)
 * 3. Orphan paid transactions (set installment_payment_id = NULL)
 * 4. Delete plan (CASCADE deletes all payments)
 *
 * @param supabase - Supabase client
 * @param planId - Installment plan ID
 * @param userId - User ID
 * @returns Result with deletion details
 */
async function executeAtomicDeletion(
  supabase: any,
  planId: string,
  userId: string
): Promise<{ success: boolean; error?: string; deletedData?: DeleteResultData }> {
  try {
    // Step 1: Verify ownership (RLS + explicit check)
    const { data: planData, error: planError } = await supabase
      .from('installment_plans')
      .select('id, user_id, description')
      .eq('id', planId)
      .eq('user_id', userId)
      .single()

    if (planError || !planData) {
      console.error('Plan not found or unauthorized:', planError)
      return {
        success: false,
        error: planData === null ? "Parcelamento não encontrado" : "Você não tem permissão para deletar este parcelamento"
      }
    }

    // Step 2: Count payments for response
    const { data: paymentsData, error: paymentsError } = await supabase
      .from('installment_payments')
      .select('status, amount')
      .eq('plan_id', planId)

    if (paymentsError) {
      console.error('Error fetching payments for deletion:', paymentsError)
      return {
        success: false,
        error: "Erro ao deletar parcelamento. Tente novamente."
      }
    }

    // Calculate paid and pending totals
    let paidCount = 0
    let paidAmount = 0
    let pendingCount = 0
    let pendingAmount = 0

    for (const payment of paymentsData || []) {
      if (payment.status === 'paid') {
        paidCount++
        paidAmount += payment.amount
      } else if (payment.status === 'pending') {
        pendingCount++
        pendingAmount += payment.amount
      }
    }

    // Step 3: Orphan paid transactions (preserve history)
    // First, fetch all paid payment IDs for this plan
    const { data: paidPayments, error: paidPaymentsError } = await supabase
      .from('installment_payments')
      .select('id, transaction_id')
      .eq('plan_id', planId)
      .eq('status', 'paid')
      .not('transaction_id', 'is', null)

    if (paidPaymentsError) {
      console.error('Error fetching paid payment IDs:', paidPaymentsError)
      return {
        success: false,
        error: "Erro ao deletar parcelamento. Tente novamente."
      }
    }

    // If there are paid payments with transactions, orphan them
    if (paidPayments && paidPayments.length > 0) {
      const transactionIds = paidPayments
        .map((p: any) => p.transaction_id)
        .filter((id: any) => id !== null) as string[]

      if (transactionIds.length > 0) {
        const { error: orphanError } = await supabase
          .from('transactions')
          .update({
            installment_payment_id: null,
            updated_at: new Date().toISOString()
          })
          .in('id', transactionIds)

        if (orphanError) {
          console.error('Error orphaning paid transactions:', orphanError)
          return {
            success: false,
            error: "Erro ao deletar parcelamento. Tente novamente."
          }
        }
      }
    }

    // Step 4: Delete plan (CASCADE deletes all payments)
    const { error: deleteError } = await supabase
      .from('installment_plans')
      .delete()
      .eq('id', planId)
      .eq('user_id', userId)

    if (deleteError) {
      console.error('Error deleting installment plan:', deleteError)
      return {
        success: false,
        error: "Erro ao deletar parcelamento. Tente novamente."
      }
    }

    // Return success with deletion details
    const deletedData: DeleteResultData = {
      planId: planId,
      description: planData.description,
      paidCount,
      pendingCount,
      paidAmount: Math.round(paidAmount * 100) / 100,
      pendingAmount: Math.round(pendingAmount * 100) / 100
    }

    return {
      success: true,
      deletedData
    }

  } catch (error) {
    console.error('Error in atomic deletion:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro ao deletar parcelamento. Tente novamente."
    }
  }
}

/**
 * Helper: Find and link pending installment payment to transaction
 *
 * Automatically links a transaction to a pending installment payment if:
 * - Payment method matches
 * - Due date matches transaction date (±3 days tolerance)
 * - Amount matches (±1% tolerance)
 * - Status is 'pending'
 *
 * @param transactionId - Transaction ID to link
 * @param paymentMethodId - Payment method ID
 * @param transactionDate - Transaction date (YYYY-MM-DD)
 * @param amount - Transaction amount
 * @returns Success boolean and payment ID if linked
 */
export async function linkTransactionToInstallmentPayment(
  transactionId: string,
  paymentMethodId: string,
  transactionDate: string,
  amount: number
): Promise<{ success: boolean; paymentId?: string; error?: string }> {
  const supabase = await getSupabaseServerClient()

  try {
    // Get authenticated user
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { success: false, error: "Not authenticated" }
    }

    // Find pending installment payment matching criteria
    // Date tolerance: ±3 days
    // Amount tolerance: ±1%
    const dateLower = new Date(transactionDate)
    dateLower.setDate(dateLower.getDate() - 3)
    const dateUpper = new Date(transactionDate)
    dateUpper.setDate(dateUpper.getDate() + 3)

    const amountLower = amount * 0.99
    const amountUpper = amount * 1.01

    const { data: payments, error: queryError } = await supabase
      .from('installment_payments')
      .select(`
        id,
        plan_id,
        amount,
        due_date,
        installment_plans!inner (
          user_id,
          payment_method_id
        )
      `)
      .eq('installment_plans.user_id', user.id)
      .eq('installment_plans.payment_method_id', paymentMethodId)
      .eq('status', 'pending')
      .gte('due_date', dateLower.toISOString().split('T')[0])
      .lte('due_date', dateUpper.toISOString().split('T')[0])
      .gte('amount', amountLower)
      .lte('amount', amountUpper)
      .order('due_date', { ascending: true })
      .limit(1)

    if (queryError) {
      console.error('Error querying installment payments:', queryError)
      return { success: false, error: queryError.message }
    }

    // No matching payment found - this is OK, not all transactions are installments
    if (!payments || payments.length === 0) {
      return { success: true }
    }

    const payment = payments[0]

    // Link transaction to payment and mark as paid
    const { error: updateError } = await supabase
      .from('installment_payments')
      .update({
        transaction_id: transactionId,
        status: 'paid',
        updated_at: new Date().toISOString()
      })
      .eq('id', payment.id)

    if (updateError) {
      console.error('Error linking transaction to payment:', updateError)
      return { success: false, error: updateError.message }
    }

    console.log('Transaction linked to installment payment:', {
      transactionId,
      paymentId: payment.id,
      planId: payment.plan_id,
      amount: payment.amount,
      dueDate: payment.due_date
    })

    return { success: true, paymentId: payment.id }

  } catch (error) {
    console.error('Unexpected error linking transaction:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unexpected error"
    }
  }
}

/**
 * Mark Installment Payment as Paid (Manual)
 *
 * Allows user to manually mark an installment payment as paid without linking to a transaction.
 * Use case: User paid the installment but didn't track it as a separate transaction,
 * or the automatic linking didn't find a match.
 *
 * @param paymentId - Installment payment ID to mark as paid
 * @returns Success boolean
 */
export async function markInstallmentPaymentAsPaid(
  paymentId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await getSupabaseServerClient()

  try {
    // Get authenticated user
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { success: false, error: "Not authenticated" }
    }

    // Verify payment belongs to user and get current status
    const { data: payment, error: fetchError } = await supabase
      .from('installment_payments')
      .select(`
        id,
        status,
        installment_plans!inner (
          user_id
        )
      `)
      .eq('id', paymentId)
      .single()

    if (fetchError || !payment) {
      return { success: false, error: "Payment not found" }
    }

    // @ts-expect-error - Type issue with nested select
    if (payment.installment_plans.user_id !== user.id) {
      return { success: false, error: "Unauthorized" }
    }

    // Don't allow marking already paid payments
    if (payment.status === 'paid') {
      return { success: false, error: "Payment already marked as paid" }
    }

    // Don't allow marking cancelled payments
    if (payment.status === 'cancelled') {
      return { success: false, error: "Cannot mark cancelled payment as paid" }
    }

    // Mark as paid (without linking to transaction)
    const { error: updateError } = await supabase
      .from('installment_payments')
      .update({
        status: 'paid',
        updated_at: new Date().toISOString()
      })
      .eq('id', paymentId)

    if (updateError) {
      console.error('Error marking payment as paid:', updateError)
      return { success: false, error: updateError.message }
    }

    console.log('Installment payment manually marked as paid:', { paymentId })

    // Track analytics event
    await trackServerEvent(user.id, AnalyticsEvent.INSTALLMENT_PAYMENT_MARKED_PAID, {
      [AnalyticsProperty.USER_ID]: user.id,
      payment_id: paymentId,
      method: 'manual',
      timestamp: new Date().toISOString()
    })

    revalidatePath("/installments")
    return { success: true }

  } catch (error) {
    console.error('Unexpected error marking payment as paid:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unexpected error"
    }
  }
}
