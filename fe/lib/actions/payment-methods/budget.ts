"use server"

import { getSupabaseServerClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { trackServerEvent } from "@/lib/analytics/server-tracker"
import { AnalyticsEvent, AnalyticsProperty } from "@/lib/analytics/events"

/**
 * Set monthly budget for a payment method
 *
 * Story: 3.2 - Set User-Defined Monthly Budget
 * Acceptance Criteria: AC2.2, AC2.3, AC2.4, AC2.5, AC2.6
 */
export async function setMonthlyBudget(
  paymentMethodId: string,
  budget: number | null
): Promise<{ success: boolean; error?: string }> {
  const supabase = await getSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: "Not authenticated" }
  }

  try {
    if (budget !== null && budget < 0) {
      return {
        success: false,
        error: "Budget cannot be negative"
      }
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(paymentMethodId)) {
      return { success: false, error: "Invalid payment method ID" }
    }

    const { data: paymentMethod, error: fetchError } = await supabase
      .from('payment_methods')
      .select('monthly_budget, credit_mode, type, statement_closing_day')
      .eq('id', paymentMethodId)
      .eq('user_id', user.id)
      .single()

    if (fetchError || !paymentMethod) {
      return { success: false, error: "Payment method not found" }
    }

    if (paymentMethod.credit_mode !== true || paymentMethod.type !== 'credit') {
      return {
        success: false,
        error: "Monthly budget is only available for Credit Mode credit cards"
      }
    }

    if (paymentMethod.statement_closing_day === null) {
      return {
        success: false,
        error: "Please set statement closing date first"
      }
    }

    const previousBudget = paymentMethod.monthly_budget

    const { error: updateError } = await supabase
      .from('payment_methods')
      .update({ monthly_budget: budget })
      .eq('id', paymentMethodId)
      .eq('user_id', user.id)
      .eq('credit_mode', true)

    if (updateError) {
      console.error('[setMonthlyBudget] Database error:', updateError)
      return { success: false, error: updateError.message }
    }

    if (budget === null) {
      await trackServerEvent(
        user.id,
        AnalyticsEvent.MONTHLY_BUDGET_REMOVED,
        {
          [AnalyticsProperty.PAYMENT_METHOD_ID]: paymentMethodId,
          previousBudget: previousBudget ?? null,
        }
      )
    } else {
      await trackServerEvent(
        user.id,
        AnalyticsEvent.MONTHLY_BUDGET_SET,
        {
          [AnalyticsProperty.PAYMENT_METHOD_ID]: paymentMethodId,
          budgetAmount: budget,
          previousBudget: previousBudget ?? null,
        }
      )
    }

    revalidatePath('/settings')
    revalidatePath('/[locale]/settings')
    revalidatePath('/transactions')
    revalidatePath('/[locale]/transactions')

    return { success: true }
  } catch (error) {
    console.error('[setMonthlyBudget] Unexpected error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}
