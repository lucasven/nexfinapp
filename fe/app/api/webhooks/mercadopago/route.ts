import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

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
  // TODO: Implement in Task 7 with Mercado Pago SDK
  console.log('[MP Webhook] Payment received:', paymentId)
}

async function handleSubscription(subscriptionId: string) {
  // TODO: Implement in Task 7 with Mercado Pago SDK
  console.log('[MP Webhook] Subscription event:', subscriptionId)
}
