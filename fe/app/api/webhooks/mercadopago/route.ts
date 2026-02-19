import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { mpPayment, mpPreApproval } from "@/lib/mercadopago"

// Use service key — webhooks run outside user session
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { type, data } = body

  console.log('[MP Webhook]', type, data)

  try {
    if (type === 'payment') {
      await handlePayment(data.id)
    } else if (type === 'subscription_preapproval') {
      await handleSubscription(data.id)
    }
  } catch (err) {
    console.error('[MP Webhook] Error:', err)
    return NextResponse.json({ error: 'processing_error' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}

async function handlePayment(paymentId: string) {
  const payment = await mpPayment.get({ id: paymentId })
  if (payment.status !== 'approved') return

  const userId = payment.external_reference
  const tier = (payment.metadata as Record<string, string> | undefined)?.tier
  const amount = payment.transaction_amount ?? 0

  if (!userId || !tier) {
    console.error('[MP Webhook] Missing userId or tier in payment metadata', { userId, tier })
    return
  }

  // Check lifetime purchase limit
  const { count } = await supabase
    .from('lifetime_purchases')
    .select('*', { count: 'exact', head: true })

  if ((count ?? 0) >= 50) {
    console.error('[MP Webhook] Lifetime purchases exhausted — refund required for payment:', paymentId)
    return
  }

  await supabase.from('lifetime_purchases').insert({
    user_id: userId,
    tier,
    purchase_number: (count ?? 0) + 1,
    amount_paid: amount,
  })

  await supabase.from('subscriptions').insert({
    user_id: userId,
    tier,
    type: 'lifetime',
    status: 'active',
    started_at: new Date().toISOString(),
  })

  console.log('[MP Webhook] Lifetime purchase recorded for user:', userId, 'tier:', tier)
}

async function handleSubscription(subscriptionId: string) {
  const sub = await mpPreApproval.get({ id: subscriptionId })
  const userId = sub.external_reference
  // reason format: "whatsapp_monthly", "couples_monthly", "openfinance_monthly"
  const tier = sub.reason?.split('_')[0]

  if (!userId || !tier) {
    console.error('[MP Webhook] Missing userId or tier in subscription', { userId, tier })
    return
  }

  const status =
    sub.status === 'authorized' ? 'active'
    : sub.status === 'cancelled' ? 'cancelled'
    : 'past_due'

  await supabase
    .from('subscriptions')
    .upsert(
      {
        user_id: userId,
        tier,
        type: 'monthly',
        status,
        mercado_pago_subscription_id: subscriptionId,
        started_at: sub.date_created,
        expires_at: sub.next_payment_date,
      },
      { onConflict: 'mercado_pago_subscription_id' }
    )

  console.log('[MP Webhook] Subscription updated:', subscriptionId, status)
}
