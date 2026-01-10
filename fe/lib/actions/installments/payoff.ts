"use server"

import { getSupabaseServerClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { trackServerEvent } from "@/lib/analytics/server-tracker"
import { AnalyticsEvent } from "@/lib/analytics/events"
import type { PayoffConfirmationData, PayoffResultData } from "@/lib/types"

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
