"use server"

import { getSupabaseServerClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { trackServerEvent } from "@/lib/analytics/server-tracker"
import { AnalyticsEvent, AnalyticsProperty } from "@/lib/analytics/events"

/**
 * Update credit card settings
 *
 * Updates multiple credit card settings in a single operation:
 * - Card name
 * - Statement closing day
 * - Payment due day
 * - Monthly budget
 *
 * Note: Credit mode should be updated separately using switchCreditMode()
 *
 * @param data - Settings to update (only non-undefined fields will be updated)
 * @returns Promise with success status or error
 */
export async function updateCreditCardSettings(data: {
  paymentMethodId: string
  name?: string
  statementClosingDay?: number
  paymentDueDay?: number
  daysBeforeClosing?: number
  monthlyBudget?: number
}): Promise<{ success: boolean; error?: string }> {
  const supabase = await getSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: 'Not authenticated' }
  }

  try {
    // Validate payment method ID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(data.paymentMethodId)) {
      return { success: false, error: 'Invalid payment method ID' }
    }

    // Validate inputs
    if (data.name !== undefined) {
      const trimmedName = data.name.trim()
      if (!trimmedName) {
        return { success: false, error: 'Card name cannot be empty' }
      }
    }

    if (data.statementClosingDay !== undefined) {
      if (data.statementClosingDay < 1 || data.statementClosingDay > 31) {
        return { success: false, error: 'Statement closing day must be between 1 and 31' }
      }
    }

    if (data.paymentDueDay !== undefined) {
      if (data.paymentDueDay < 1 || data.paymentDueDay > 31) {
        return { success: false, error: 'Payment due day must be between 1 and 31' }
      }
    }

    if (data.monthlyBudget !== undefined) {
      if (data.monthlyBudget < 0) {
        return { success: false, error: 'Monthly budget cannot be negative' }
      }
    }

    // Get current payment method to verify ownership and prerequisites
    const { data: paymentMethod, error: fetchError } = await supabase
      .from('payment_methods')
      .select('id, name, type, credit_mode, statement_closing_day, payment_due_day, days_before_closing, monthly_budget')
      .eq('id', data.paymentMethodId)
      .eq('user_id', user.id)
      .single()

    if (fetchError || !paymentMethod) {
      console.error('[updateCreditCardSettings] Payment method not found:', fetchError)
      return { success: false, error: 'Payment method not found' }
    }

    // Build update object with only fields that were provided
    const updateData: Record<string, any> = {}

    if (data.name !== undefined) {
      updateData.name = data.name.trim()
    }

    if (data.statementClosingDay !== undefined) {
      // Verify Credit Mode for statement settings
      if (!paymentMethod.credit_mode) {
        return { success: false, error: 'Statement settings only available for Credit Mode cards' }
      }
      updateData.statement_closing_day = data.statementClosingDay
    }

    if (data.paymentDueDay !== undefined) {
      if (!paymentMethod.credit_mode) {
        return { success: false, error: 'Payment due date only available for Credit Mode cards' }
      }
      updateData.payment_due_day = data.paymentDueDay
    }

    if (data.daysBeforeClosing !== undefined) {
      if (!paymentMethod.credit_mode) {
        return { success: false, error: 'Days before closing only available for Credit Mode cards' }
      }
      updateData.days_before_closing = data.daysBeforeClosing
    }

    if (data.monthlyBudget !== undefined) {
      // Verify Credit Mode for budget
      if (!paymentMethod.credit_mode) {
        return { success: false, error: 'Monthly budget only available for Credit Mode cards' }
      }
      updateData.monthly_budget = data.monthlyBudget
    }

    // If nothing to update, return success
    if (Object.keys(updateData).length === 0) {
      return { success: true }
    }

    // Update payment method
    const { error: updateError } = await supabase
      .from('payment_methods')
      .update(updateData)
      .eq('id', data.paymentMethodId)
      .eq('user_id', user.id)

    if (updateError) {
      console.error('[updateCreditCardSettings] Database error:', updateError)
      return { success: false, error: updateError.message }
    }

    // Track analytics events for each updated field
    if (data.name !== undefined && data.name !== paymentMethod.name) {
      await trackServerEvent(user.id, AnalyticsEvent.CREDIT_CARD_UPDATED, {
        [AnalyticsProperty.PAYMENT_METHOD_ID]: data.paymentMethodId,
        field: 'name',
        previousValue: paymentMethod.name,
        newValue: data.name,
      })
    }

    if (data.statementClosingDay !== undefined && data.statementClosingDay !== paymentMethod.statement_closing_day) {
      await trackServerEvent(user.id, AnalyticsEvent.STATEMENT_CLOSING_DAY_SET, {
        [AnalyticsProperty.PAYMENT_METHOD_ID]: data.paymentMethodId,
        closingDay: data.statementClosingDay,
        previousClosingDay: paymentMethod.statement_closing_day ?? null,
      })
    }

    if (data.paymentDueDay !== undefined && data.paymentDueDay !== paymentMethod.payment_due_day) {
      await trackServerEvent(user.id, AnalyticsEvent.PAYMENT_DUE_DATE_SET, {
        [AnalyticsProperty.PAYMENT_METHOD_ID]: data.paymentMethodId,
        payment_due_day: data.paymentDueDay,
        previous_payment_due_day: paymentMethod.payment_due_day ?? null,
      })
    }

    if (data.monthlyBudget !== undefined && data.monthlyBudget !== paymentMethod.monthly_budget) {
      if (data.monthlyBudget === 0 && paymentMethod.monthly_budget !== null) {
        await trackServerEvent(user.id, AnalyticsEvent.MONTHLY_BUDGET_REMOVED, {
          [AnalyticsProperty.PAYMENT_METHOD_ID]: data.paymentMethodId,
          previousBudget: paymentMethod.monthly_budget,
        })
      } else {
        await trackServerEvent(user.id, AnalyticsEvent.MONTHLY_BUDGET_SET, {
          [AnalyticsProperty.PAYMENT_METHOD_ID]: data.paymentMethodId,
          budgetAmount: data.monthlyBudget,
          previousBudget: paymentMethod.monthly_budget ?? null,
        })
      }
    }

    // Revalidate paths
    revalidatePath('/')
    revalidatePath('/[locale]')
    revalidatePath('/[locale]/credit-cards')
    revalidatePath('/[locale]/settings')
    revalidatePath('/settings')

    return { success: true }
  } catch (error) {
    console.error('[updateCreditCardSettings] Unexpected error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}
