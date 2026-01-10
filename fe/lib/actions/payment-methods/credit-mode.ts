"use server"

import { getSupabaseServerClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { trackServerEvent } from "@/lib/analytics/server-tracker"
import { AnalyticsEvent, AnalyticsProperty } from "@/lib/analytics/events"
import type { SwitchCreditModeParams } from "@/lib/supabase/rpc-types"

/**
 * Result type for switchCreditMode operation
 */
export interface SwitchResult {
  success: boolean
  requiresConfirmation?: boolean
  activeInstallments?: number
  error?: string
}

/**
 * Set credit mode for a payment method (first-time selection)
 *
 * Story: 1-4-credit-mode-selection-web-frontend
 * Acceptance Criteria: AC4.6, AC4.7
 */
export async function setCreditMode(
  paymentMethodId: string,
  creditMode: boolean
): Promise<{ success: boolean; error?: string }> {
  const supabase = await getSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: "Not authenticated" }
  }

  try {
    const { error: updateError } = await supabase
      .from('payment_methods')
      .update({ credit_mode: creditMode })
      .eq('id', paymentMethodId)
      .eq('user_id', user.id)
      .is('credit_mode', null)

    if (updateError) {
      console.error('[setCreditMode] Database error:', updateError)
      return { success: false, error: updateError.message }
    }

    await trackServerEvent(
      user.id,
      AnalyticsEvent.CREDIT_MODE_SELECTED,
      {
        [AnalyticsProperty.PAYMENT_METHOD_ID]: paymentMethodId,
        [AnalyticsProperty.MODE]: creditMode ? 'credit' : 'simple',
        [AnalyticsProperty.CHANNEL]: 'web',
      }
    )

    revalidatePath('/transactions')
    revalidatePath('/[locale]/transactions')

    return { success: true }
  } catch (error) {
    console.error('[setCreditMode] Unexpected error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Switch credit mode with data implications warning
 *
 * Story: 1-5-mode-switching-with-data-implications-warning
 * Acceptance Criteria: AC5.13, AC5.15
 */
export async function switchCreditMode(
  paymentMethodId: string,
  newMode: boolean,
  options?: { cleanupInstallments?: boolean }
): Promise<SwitchResult> {
  const supabase = await getSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: "Not authenticated" }
  }

  try {
    const { data: paymentMethod, error: fetchError } = await supabase
      .from('payment_methods')
      .select('credit_mode, type')
      .eq('id', paymentMethodId)
      .eq('user_id', user.id)
      .single()

    if (fetchError || !paymentMethod) {
      return { success: false, error: "Payment method not found" }
    }

    const previousMode = paymentMethod.credit_mode

    let activeInstallmentsCount = 0
    if (newMode === false && previousMode === true) {
      const { data: installments, error: installmentsError } = await supabase
        .from('installment_plans')
        .select('id')
        .eq('payment_method_id', paymentMethodId)
        .eq('user_id', user.id)
        .eq('status', 'active')

      if (installmentsError) {
        console.error('[switchCreditMode] Error checking installments:', installmentsError)
        return { success: false, error: installmentsError.message }
      }

      activeInstallmentsCount = installments?.length || 0

      if (activeInstallmentsCount > 0 && options?.cleanupInstallments === undefined) {
        return {
          success: false,
          requiresConfirmation: true,
          activeInstallments: activeInstallmentsCount
        }
      }
    }

    const { data: rpcResult, error: rpcError } = await supabase.rpc(
      'switch_credit_mode_atomic',
      {
        p_user_id: user.id,
        p_payment_method_id: paymentMethodId,
        p_new_mode: newMode,
        p_cleanup_installments: options?.cleanupInstallments || false
      } as SwitchCreditModeParams
    )

    if (rpcError) {
      console.error('[switchCreditMode] RPC error:', rpcError)
      return { success: false, error: rpcError.message }
    }

    const result = Array.isArray(rpcResult) ? rpcResult[0] : rpcResult
    if (!result || !result.success) {
      return {
        success: false,
        error: result?.error_message || 'Unknown error from database function'
      }
    }

    await trackServerEvent(
      user.id,
      AnalyticsEvent.CREDIT_MODE_SWITCHED,
      {
        [AnalyticsProperty.PAYMENT_METHOD_ID]: paymentMethodId,
        previousMode: previousMode === true ? 'credit' : previousMode === false ? 'simple' : 'unknown',
        newMode: newMode ? 'credit' : 'simple',
        hadActiveInstallments: activeInstallmentsCount > 0,
        installmentsCleanedUp: options?.cleanupInstallments === true,
        [AnalyticsProperty.CHANNEL]: 'web',
      }
    )

    revalidatePath('/settings')
    revalidatePath('/[locale]/settings')
    revalidatePath('/settings/account')
    revalidatePath('/[locale]/settings/account')
    revalidatePath('/profile')
    revalidatePath('/[locale]/profile')
    revalidatePath('/transactions')
    revalidatePath('/[locale]/transactions')

    return {
      success: true,
      activeInstallments: activeInstallmentsCount > 0 ? activeInstallmentsCount : undefined
    }
  } catch (error) {
    console.error('[switchCreditMode] Unexpected error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}
