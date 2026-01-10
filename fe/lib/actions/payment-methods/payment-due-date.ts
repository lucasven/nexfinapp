"use server"

import { getSupabaseServerClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { trackServerEvent } from "@/lib/analytics/server-tracker"
import { AnalyticsEvent, AnalyticsProperty } from "@/lib/analytics/events"

/**
 * Set payment due date for a Credit Mode credit card
 *
 * Story: 4-1-set-payment-due-date
 * Acceptance Criteria: AC4.1.4, AC4.1.5
 */
export async function setPaymentDueDate(
  paymentMethodId: string,
  paymentDueDay: number
): Promise<{ success: boolean; nextDueDate?: Date; error?: string }> {
  const supabase = await getSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: 'Not authenticated' }
  }

  try {
    if (paymentDueDay < 1 || paymentDueDay > 60) {
      return {
        success: false,
        error: 'Payment due day must be between 1 and 60 days after closing',
      }
    }

    const { data: paymentMethod, error: fetchError } = await supabase
      .from('payment_methods')
      .select('id, name, type, credit_mode, statement_closing_day')
      .eq('id', paymentMethodId)
      .eq('user_id', user.id)
      .single()

    if (fetchError || !paymentMethod) {
      console.error('[setPaymentDueDate] Payment method not found:', fetchError)
      return { success: false, error: 'Payment method not found' }
    }

    if (!paymentMethod.credit_mode) {
      return {
        success: false,
        error: 'Payment due date only available for Credit Mode cards',
      }
    }

    if (paymentMethod.statement_closing_day == null) {
      return {
        success: false,
        error: 'Statement closing day must be set before setting payment due date',
      }
    }

    const { error: updateError } = await supabase
      .from('payment_methods')
      .update({ payment_due_day: paymentDueDay })
      .eq('id', paymentMethodId)
      .eq('user_id', user.id)

    if (updateError) {
      console.error('[setPaymentDueDate] Database error:', updateError)
      return { success: false, error: updateError.message }
    }

    const { calculatePaymentDueDate } = await import('@/lib/utils/payment-due-date')
    const dueInfo = calculatePaymentDueDate(
      paymentMethod.statement_closing_day,
      paymentDueDay
    )

    await trackServerEvent(user.id, AnalyticsEvent.PAYMENT_DUE_DATE_SET, {
      [AnalyticsProperty.PAYMENT_METHOD_ID]: paymentMethodId,
      payment_due_day: paymentDueDay,
      closing_day: paymentMethod.statement_closing_day,
      calculated_due_date: dueInfo.nextDueDate.toISOString(),
    })

    revalidatePath('/[locale]/settings')
    revalidatePath('/settings')

    return {
      success: true,
      nextDueDate: dueInfo.nextDueDate,
    }
  } catch (error) {
    console.error('[setPaymentDueDate] Unexpected error:', error)

    if (user) {
      await trackServerEvent(user.id, AnalyticsEvent.PAYMENT_DUE_DATE_ERROR, {
        [AnalyticsProperty.PAYMENT_METHOD_ID]: paymentMethodId,
        error_type: 'unexpected',
        error_message: error instanceof Error ? error.message : 'Unknown error',
      })
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Get payment due date preview
 *
 * Story: 4-1-set-payment-due-date
 * Acceptance Criteria: AC4.1.2
 */
export async function getPaymentDueDatePreview(
  paymentMethodId: string,
  paymentDueDay: number
): Promise<{
  nextDueDate: Date
  dueDay: number
  formattedDate: string
} | null> {
  const supabase = await getSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return null
  }

  try {
    if (paymentDueDay < 1 || paymentDueDay > 60) {
      return null
    }

    const { data: paymentMethod, error: fetchError } = await supabase
      .from('payment_methods')
      .select('statement_closing_day')
      .eq('id', paymentMethodId)
      .eq('user_id', user.id)
      .single()

    if (fetchError || !paymentMethod || paymentMethod.statement_closing_day == null) {
      return null
    }

    const { calculatePaymentDueDate, formatPaymentDueDate } = await import(
      '@/lib/utils/payment-due-date'
    )
    const dueInfo = calculatePaymentDueDate(
      paymentMethod.statement_closing_day,
      paymentDueDay
    )

    const formattedDate = formatPaymentDueDate(dueInfo.nextDueDate, 'pt-BR')

    return {
      nextDueDate: dueInfo.nextDueDate,
      dueDay: dueInfo.dueDay,
      formattedDate,
    }
  } catch (error) {
    console.error('[getPaymentDueDatePreview] Error:', error)
    return null
  }
}
