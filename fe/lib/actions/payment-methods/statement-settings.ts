"use server"

import { getSupabaseServerClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { trackServerEvent } from "@/lib/analytics/server-tracker"
import { AnalyticsEvent, AnalyticsProperty } from "@/lib/analytics/events"
import type { CalculateStatementPeriodParams } from "@/lib/supabase/rpc-types"

/**
 * Get statement period preview for a given closing day
 *
 * Story: 3.1 - Set Statement Closing Date
 * Acceptance Criteria: AC1.2
 */
export async function getStatementPeriodPreview(
  closingDay: number,
  referenceDate?: Date
): Promise<{
  periodStart: Date
  periodEnd: Date
  nextClosing: Date
  daysUntilClosing: number
} | null> {
  const supabase = await getSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    console.error('[getStatementPeriodPreview] User not authenticated')
    return null
  }

  try {
    if (closingDay < 1 || closingDay > 31) {
      console.error('[getStatementPeriodPreview] Invalid closing day:', closingDay)
      return null
    }

    const params: CalculateStatementPeriodParams = {
      p_closing_day: closingDay,
      p_reference_date: referenceDate?.toISOString().split('T')[0]
    }

    const { data: rpcResult, error: rpcError } = await supabase.rpc(
      'calculate_statement_period',
      params
    )

    if (rpcError) {
      console.error('[getStatementPeriodPreview] RPC error:', rpcError)
      return null
    }

    const result = Array.isArray(rpcResult) ? rpcResult[0] : rpcResult

    if (!result) {
      console.error('[getStatementPeriodPreview] No result from RPC')
      return null
    }

    const nextClosingDate = new Date(result.next_closing)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const daysUntilClosing = Math.ceil(
      (nextClosingDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    )

    return {
      periodStart: new Date(result.period_start + 'T12:00:00'),
      periodEnd: new Date(result.period_end + 'T12:00:00'),
      nextClosing: nextClosingDate,
      daysUntilClosing
    }
  } catch (error) {
    console.error('[getStatementPeriodPreview] Unexpected error:', error)
    return null
  }
}

/**
 * Update statement closing day for a payment method
 *
 * Story: 3.1 - Set Statement Closing Date
 * Acceptance Criteria: AC1.3, AC1.4, AC1.5
 */
export async function updateStatementSettings(
  paymentMethodId: string,
  closingDay: number
): Promise<{ success: boolean; nextClosingDate?: string; error?: string }> {
  const supabase = await getSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: "Not authenticated" }
  }

  try {
    if (closingDay < 1 || closingDay > 31) {
      return {
        success: false,
        error: "Closing day must be between 1 and 31"
      }
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(paymentMethodId)) {
      return { success: false, error: "Invalid payment method ID" }
    }

    const { data: paymentMethod, error: fetchError } = await supabase
      .from('payment_methods')
      .select('statement_closing_day, credit_mode, type')
      .eq('id', paymentMethodId)
      .eq('user_id', user.id)
      .single()

    if (fetchError || !paymentMethod) {
      return { success: false, error: "Payment method not found" }
    }

    if (paymentMethod.credit_mode !== true || paymentMethod.type !== 'credit') {
      return {
        success: false,
        error: "Statement settings are only available for Credit Mode credit cards"
      }
    }

    const previousClosingDay = paymentMethod.statement_closing_day

    const { error: updateError } = await supabase
      .from('payment_methods')
      .update({ statement_closing_day: closingDay })
      .eq('id', paymentMethodId)
      .eq('user_id', user.id)
      .eq('credit_mode', true)

    if (updateError) {
      console.error('[updateStatementSettings] Database error:', updateError)
      return { success: false, error: updateError.message }
    }

    const { data: rpcResult, error: rpcError } = await supabase.rpc(
      'calculate_statement_period',
      {
        p_closing_day: closingDay
      } as CalculateStatementPeriodParams
    )

    if (rpcError) {
      console.error('[updateStatementSettings] RPC error:', rpcError)
    }

    const result = Array.isArray(rpcResult) ? rpcResult[0] : rpcResult
    const nextClosingDate = result?.next_closing || null

    await trackServerEvent(
      user.id,
      AnalyticsEvent.STATEMENT_CLOSING_DAY_SET,
      {
        [AnalyticsProperty.PAYMENT_METHOD_ID]: paymentMethodId,
        closingDay,
        previousClosingDay: previousClosingDay ?? null,
      }
    )

    revalidatePath('/settings')
    revalidatePath('/[locale]/settings')
    revalidatePath('/transactions')
    revalidatePath('/[locale]/transactions')

    return {
      success: true,
      nextClosingDate: nextClosingDate || undefined
    }
  } catch (error) {
    console.error('[updateStatementSettings] Unexpected error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}
