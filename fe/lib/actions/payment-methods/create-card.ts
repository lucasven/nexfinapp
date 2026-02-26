"use server"

import { getSupabaseServerClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { trackServerEvent } from "@/lib/analytics/server-tracker"
import { AnalyticsEvent } from "@/lib/analytics/events"

/**
 * Create a new credit card with all settings
 *
 * Creates a credit card payment method with name, mode, and optional
 * statement settings (closing day, payment due day) in a single operation.
 *
 * @param data.name - Name of the credit card
 * @param data.creditMode - true = Credit Mode, false = Simple Mode
 * @param data.statementClosingDay - Day of month statement closes (1-31), only for Credit Mode
 * @param data.paymentDueDay - Day of month when payment is due (1-31), only for Credit Mode
 * @returns Promise with success status and created card ID
 */
export async function createCreditCard(data: {
  name: string
  creditMode: boolean
  statementClosingDay?: number
  paymentDueDay?: number
  daysBeforeClosing?: number
}): Promise<{ success: boolean; paymentMethodId?: string; error?: string }> {
  const supabase = await getSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: 'Not authenticated' }
  }

  // Validate inputs
  const trimmedName = data.name?.trim()
  if (!trimmedName) {
    return { success: false, error: 'Card name is required' }
  }

  // Validate statement closing day if provided
  if (data.statementClosingDay !== undefined) {
    if (data.statementClosingDay < 1 || data.statementClosingDay > 31) {
      return { success: false, error: 'Statement closing day must be between 1 and 31' }
    }
  }

  // Validate payment due day if provided
  if (data.paymentDueDay !== undefined) {
    if (data.paymentDueDay < 1 || data.paymentDueDay > 31) {
      return { success: false, error: 'Payment due day must be between 1 and 31' }
    }
  }

  try {
    // Check for duplicate name
    const { data: existing, error: findError } = await supabase
      .from('payment_methods')
      .select('id')
      .eq('user_id', user.id)
      .ilike('name', trimmedName)
      .maybeSingle()

    if (findError) {
      console.error('[createCreditCard] Error checking duplicate:', findError)
      return { success: false, error: findError.message }
    }

    if (existing) {
      return { success: false, error: 'A card with this name already exists' }
    }

    // Build the insert data
    const insertData: Record<string, any> = {
      user_id: user.id,
      name: trimmedName,
      type: 'credit',
      credit_mode: data.creditMode,
    }

    // Only add statement settings if Credit Mode
    if (data.creditMode) {
      if (data.paymentDueDay) {
        insertData.payment_due_day = data.paymentDueDay
      }
      if (data.daysBeforeClosing !== undefined) {
        insertData.days_before_closing = data.daysBeforeClosing
      }
      // Calculate and cache statement_closing_day for backward compat
      if (data.statementClosingDay) {
        insertData.statement_closing_day = data.statementClosingDay
      }
    }

    // Create the payment method
    const { data: created, error: createError } = await supabase
      .from('payment_methods')
      .insert(insertData)
      .select('id')
      .single()

    if (createError) {
      console.error('[createCreditCard] Error creating:', createError)
      // Check for unique constraint violation
      if (createError.code === '23505') {
        return { success: false, error: 'A card with this name already exists' }
      }
      return { success: false, error: createError.message }
    }

    // Track analytics event
    await trackServerEvent(
      user.id,
      AnalyticsEvent.CREDIT_CARD_CREATED,
      {
        cardName: trimmedName,
        creditMode: data.creditMode,
        hasClosingDay: !!data.statementClosingDay,
        hasDueDay: !!data.paymentDueDay,
        source: 'settings_dialog',
      }
    )

    // Revalidate paths
    revalidatePath('/')
    revalidatePath('/[locale]')
    revalidatePath('/[locale]/profile')

    return { success: true, paymentMethodId: created.id }
  } catch (error) {
    console.error('[createCreditCard] Unexpected error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}
