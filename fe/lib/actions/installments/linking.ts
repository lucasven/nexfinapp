"use server"

import { getSupabaseServerClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { trackServerEvent } from "@/lib/analytics/server-tracker"
import { AnalyticsEvent, AnalyticsProperty } from "@/lib/analytics/events"

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
