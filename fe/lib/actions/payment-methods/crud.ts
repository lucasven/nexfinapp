"use server"

import { getSupabaseServerClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { trackServerEvent } from "@/lib/analytics/server-tracker"
import { AnalyticsEvent } from "@/lib/analytics/events"
import type { PaymentMethodType } from '@/lib/constants/payment-methods'

/**
 * Get all payment methods for the authenticated user
 */
export async function getPaymentMethods() {
  const supabase = await getSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) throw new Error("Not authenticated")

  const { data, error } = await supabase
    .from('payment_methods')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data || []
}

/**
 * Find or create a payment method by name
 *
 * Mirrors the WhatsApp bot's findOrCreatePaymentMethod function.
 */
export async function findOrCreatePaymentMethod(
  name: string,
  type: PaymentMethodType = 'other'
): Promise<{ success: boolean; paymentMethod?: { id: string; name: string }; error?: string }> {
  const supabase = await getSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: 'Not authenticated' }
  }

  try {
    const { data: existing, error: findError } = await supabase
      .from('payment_methods')
      .select('id, name')
      .eq('user_id', user.id)
      .eq('name', name)
      .maybeSingle()

    if (findError) {
      console.error('[findOrCreatePaymentMethod] Error finding:', findError)
      return { success: false, error: findError.message }
    }

    if (existing) {
      return { success: true, paymentMethod: { id: existing.id, name: existing.name } }
    }

    const { data: created, error: createError } = await supabase
      .from('payment_methods')
      .insert({
        user_id: user.id,
        name: name,
        type: type,
        credit_mode: type === 'credit' ? null : undefined
      })
      .select('id, name')
      .single()

    if (createError) {
      console.error('[findOrCreatePaymentMethod] Error creating:', createError)
      return { success: false, error: createError.message }
    }

    await trackServerEvent(
      user.id,
      AnalyticsEvent.PAYMENT_METHOD_CREATED,
      {
        paymentMethodName: name,
        paymentMethodType: type,
        source: 'web_transaction_dialog',
      }
    )

    revalidatePath('/')
    revalidatePath('/[locale]')

    return { success: true, paymentMethod: { id: created.id, name: created.name } }
  } catch (error) {
    console.error('[findOrCreatePaymentMethod] Unexpected error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Update Payment Method
 */
export async function updatePaymentMethod(
  paymentMethodId: string,
  data: { name: string; type: PaymentMethodType }
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await getSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    const { error: updateError } = await supabase
      .from('payment_methods')
      .update({
        name: data.name.trim(),
        type: data.type,
      })
      .eq('id', paymentMethodId)
      .eq('user_id', user.id)

    if (updateError) {
      console.error('[updatePaymentMethod] Error updating:', updateError)
      return { success: false, error: updateError.message }
    }

    revalidatePath('/')
    revalidatePath('/[locale]')
    revalidatePath('/[locale]/credit-cards')

    return { success: true }
  } catch (error) {
    console.error('[updatePaymentMethod] Unexpected error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Delete Payment Method
 */
export async function deletePaymentMethod(paymentMethodId: string) {
  try {
    const supabase = await getSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    const { error: deleteError } = await supabase
      .from('payment_methods')
      .delete()
      .eq('id', paymentMethodId)
      .eq('user_id', user.id)

    if (deleteError) {
      console.error('[deletePaymentMethod] Error deleting:', deleteError)
      return { success: false, error: deleteError.message }
    }

    revalidatePath('/')
    revalidatePath('/[locale]')
    revalidatePath('/[locale]/credit-cards')

    return { success: true }
  } catch (error) {
    console.error('[deletePaymentMethod] Unexpected error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}
