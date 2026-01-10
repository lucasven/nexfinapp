"use server"

import { getSupabaseServerClient } from "@/lib/supabase/server"
import { trackServerEvent } from "@/lib/analytics/server-tracker"
import { AnalyticsEvent } from "@/lib/analytics/events"
import type { InstallmentPlanDetails, InstallmentPlanWithDetails, InstallmentPaymentWithTransaction } from "@/lib/types"

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
