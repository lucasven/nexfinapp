import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { mpPayment, mpPreApproval } from "@/lib/mercadopago"
import crypto from "crypto"

// Use service key — webhooks run outside user session
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

const VALID_TIERS = ['whatsapp', 'couples', 'openfinance'] as const

// Issue #1: Webhook signature validation
function verifyWebhookSignature(req: NextRequest, rawBody: string): boolean {
  const secret = process.env.MERCADO_PAGO_WEBHOOK_SECRET
  if (!secret) {
    console.error('[MP Webhook] MERCADO_PAGO_WEBHOOK_SECRET not configured')
    return false
  }

  const xSignature = req.headers.get('x-signature')
  const xRequestId = req.headers.get('x-request-id')

  if (!xSignature || !xRequestId) {
    return false
  }

  // Parse signature parts: ts=...,v1=...
  const parts: Record<string, string> = {}
  xSignature.split(',').forEach(part => {
    const [key, value] = part.split('=')
    if (key && value) parts[key.trim()] = value.trim()
  })

  const ts = parts['ts']
  const v1 = parts['v1']
  if (!ts || !v1) return false

  // Build manifest according to MP docs
  const dataId = new URL(req.url).searchParams.get('data.id') ?? ''
  const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`

  const hmac = crypto.createHmac('sha256', secret)
  const expectedHash = hmac.update(manifest).digest('hex')

  return v1 === expectedHash
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text()

  // Issue #1: Validate signature
  if (!verifyWebhookSignature(req, rawBody)) {
    console.error('[MP Webhook] Invalid or missing signature')
    return NextResponse.json({ error: 'invalid_signature' }, { status: 403 })
  }

  const body = JSON.parse(rawBody)
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

    // Issue #11: Distinguish retriable vs non-retriable errors
    if (err instanceof TypeError || (err instanceof Error && err.message.includes('Invalid tier'))) {
      return NextResponse.json({ error: 'invalid_data' }, { status: 400 })
    }

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

  // Issue #7: Validate tier before insert
  if (!VALID_TIERS.includes(tier as typeof VALID_TIERS[number])) {
    console.error('[MP Webhook] Invalid tier in payment metadata:', tier, 'paymentId:', paymentId)
    throw new Error(`Invalid tier: ${tier}`)
  }

  // Issue #2: Idempotency — check if payment already processed
  const { data: existing } = await supabase
    .from('lifetime_purchases')
    .select('id')
    .eq('mercado_pago_payment_id', paymentId)
    .maybeSingle()

  if (existing) {
    console.log('[MP Webhook] Payment already processed:', paymentId)
    return
  }

  // Issue #3: purchase_number uses DB sequence (auto-incremented)
  // No manual count needed — column has DEFAULT nextval('lifetime_purchase_number_seq')

  // Check lifetime purchase limit using MAX(purchase_number)
  const { data: maxData } = await supabase
    .from('lifetime_purchases')
    .select('purchase_number')
    .order('purchase_number', { ascending: false })
    .limit(1)
    .maybeSingle()

  const currentMax = maxData?.purchase_number ?? 0
  if (currentMax >= 50) {
    console.error('[MP Webhook] Lifetime purchases exhausted — refund required for payment:', paymentId)
    return
  }

  await supabase.from('lifetime_purchases').insert({
    user_id: userId,
    tier,
    mercado_pago_payment_id: paymentId,
    amount_paid: amount,
    // purchase_number auto-incremented via sequence
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

  // Issue #7: Validate tier
  if (!VALID_TIERS.includes(tier as typeof VALID_TIERS[number])) {
    console.error('[MP Webhook] Invalid tier in subscription reason:', sub.reason)
    throw new Error(`Invalid tier: ${tier}`)
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
