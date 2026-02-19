import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Resolves a payment_method TEXT name to a payment_method_id UUID.
 * Falls back to the user's first payment method if no match is found.
 *
 * Used by both fe/ and whatsapp-bot/ — keep in sync or import from shared/.
 */
export async function resolvePaymentMethodId(
  supabase: SupabaseClient,
  userId: string,
  paymentMethodName: string | null,
): Promise<string> {
  let paymentMethodId: string | null = null

  if (paymentMethodName) {
    const { data: paymentMethods } = await supabase
      .from('payment_methods')
      .select('id')
      .eq('user_id', userId)
      .ilike('name', paymentMethodName)
      .limit(1)

    paymentMethodId = paymentMethods?.[0]?.id || null
  }

  if (!paymentMethodId) {
    console.warn(
      `[payment-method] No match for "${paymentMethodName}", falling back to first payment method`,
    )

    const { data: fallbackMethod } = await supabase
      .from('payment_methods')
      .select('id')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .limit(1)

    if (!fallbackMethod?.[0]?.id) {
      throw new Error('No payment method available. Please create a payment method first.')
    }

    paymentMethodId = fallbackMethod[0].id
  }

  return paymentMethodId
}
