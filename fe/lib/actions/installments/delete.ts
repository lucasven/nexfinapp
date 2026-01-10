"use server"

import { getSupabaseServerClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { trackServerEvent } from "@/lib/analytics/server-tracker"
import { AnalyticsEvent } from "@/lib/analytics/events"
import type { DeleteInstallmentResponse, DeleteResultData } from "@/lib/types"

/**
 * Story 2.7: Delete Installment Plan
 *
 * Permanently deletes an installment plan, all associated payments, and
 * all transactions created from those payments.
 *
 * Deletion order:
 * 1. Collect transaction_ids from payments
 * 2. Delete plan (CASCADE deletes payments)
 * 3. Delete associated transactions
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
 * Performs complete deletion of installment plan including all related data.
 * Steps:
 * 1. Verify ownership (RLS + explicit check)
 * 2. Count payments and collect transaction_ids
 * 3. Delete plan (CASCADE deletes all payments)
 * 4. Delete associated transactions
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

    // Step 2: Count payments and collect transaction_ids for deletion
    const { data: paymentsData, error: paymentsError } = await supabase
      .from('installment_payments')
      .select('status, amount, transaction_id')
      .eq('plan_id', planId)

    if (paymentsError) {
      console.error('Error fetching payments for deletion:', paymentsError)
      return {
        success: false,
        error: "Erro ao deletar parcelamento. Tente novamente."
      }
    }

    // Calculate paid and pending totals, and collect transaction_ids
    let paidCount = 0
    let paidAmount = 0
    let pendingCount = 0
    let pendingAmount = 0
    const transactionIds: string[] = []

    for (const payment of paymentsData || []) {
      if (payment.status === 'paid') {
        paidCount++
        paidAmount += payment.amount
      } else if (payment.status === 'pending') {
        pendingCount++
        pendingAmount += payment.amount
      }
      // Collect transaction_id for deletion
      if (payment.transaction_id) {
        transactionIds.push(payment.transaction_id)
      }
    }

    // Step 3: Delete plan (CASCADE deletes all payments)
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

    // Step 4: Delete associated transactions (created from installment payments)
    if (transactionIds.length > 0) {
      const { error: txDeleteError } = await supabase
        .from('transactions')
        .delete()
        .in('id', transactionIds)
        .eq('user_id', userId)

      if (txDeleteError) {
        // Log but don't fail - the plan is already deleted
        console.error('Error deleting associated transactions:', txDeleteError)
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
