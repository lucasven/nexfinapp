"use server"

import { getSupabaseServerClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { trackServerEvent } from "@/lib/analytics/server-tracker"
import { AnalyticsEvent } from "@/lib/analytics/events"
import type { UpdateInstallmentRequest, UpdateInstallmentResponse, UpdateResultData } from "@/lib/types"

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
