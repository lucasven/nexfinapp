# Pricing Tiers Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement a freemium pricing model with WhatsApp, Couples, and Open Finance paid tiers, gated by Mercado Pago subscriptions.

**Architecture:** Add a `subscriptions` table with a `get_user_tier()` helper function. Gate WhatsApp bot access (including group join) by tier at the authorization layer. Add subscription management UI in the frontend. Integrate Mercado Pago for monthly payments and one-time lifetime purchases (first 50 customers).

**Tech Stack:** PostgreSQL/Supabase (RLS + DB functions), Next.js 15 Server Actions, TypeScript, Mercado Pago SDK, Radix UI / Tailwind CSS

---

## Task 1: Database Migration — Subscriptions Tables

**Files:**
- Create: `fe/scripts/056_pricing_tiers.sql`

**Step 1: Write the migration**

```sql
-- fe/scripts/056_pricing_tiers.sql

-- Add subscriptions table
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tier TEXT NOT NULL CHECK (tier IN ('free', 'whatsapp', 'couples', 'openfinance')),
  type TEXT NOT NULL CHECK (type IN ('monthly', 'lifetime')),
  status TEXT NOT NULL CHECK (status IN ('active', 'cancelled', 'past_due', 'expired')),
  mercado_pago_subscription_id TEXT,
  started_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);

-- Add lifetime purchases table (tracks the first-50 limit)
CREATE TABLE IF NOT EXISTS lifetime_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tier TEXT NOT NULL CHECK (tier IN ('whatsapp', 'couples', 'openfinance')),
  purchase_number INT NOT NULL,
  amount_paid DECIMAL(10,2) NOT NULL,
  purchased_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(purchase_number)
);

-- RLS: users can only see their own subscriptions
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own subscriptions"
  ON subscriptions FOR SELECT
  USING (auth.uid() = user_id);

ALTER TABLE lifetime_purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own lifetime purchases"
  ON lifetime_purchases FOR SELECT
  USING (auth.uid() = user_id);

-- Helper function: returns user's active tier
CREATE OR REPLACE FUNCTION get_user_tier(p_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tier TEXT;
BEGIN
  SELECT tier INTO v_tier
  FROM subscriptions
  WHERE user_id = p_user_id
    AND status = 'active'
  ORDER BY
    CASE tier
      WHEN 'openfinance' THEN 4
      WHEN 'couples' THEN 3
      WHEN 'whatsapp' THEN 2
      WHEN 'free' THEN 1
    END DESC
  LIMIT 1;

  RETURN COALESCE(v_tier, 'free');
END;
$$;
```

**Step 2: Apply the migration**

```bash
psql $DATABASE_URL < fe/scripts/056_pricing_tiers.sql
```

Expected: commands complete with no errors.

**Step 3: Verify**

```bash
psql $DATABASE_URL -c "\d subscriptions"
psql $DATABASE_URL -c "SELECT get_user_tier('00000000-0000-0000-0000-000000000000')"
```

Expected: table described, function returns `'free'` for unknown user.

**Step 4: Commit**

```bash
git add fe/scripts/056_pricing_tiers.sql
git commit -m "feat: add subscriptions table and get_user_tier() function"
```

---

## Task 2: WhatsApp Bot — Tier Check in Authorization

Add `getUserTier()` helper and tier-based block to the bot's authorization layer.

**Files:**
- Create: `whatsapp-bot/src/services/subscription/tier-service.ts`
- Modify: `whatsapp-bot/src/middleware/authorization.ts`

**Step 1: Write failing test**

Create `whatsapp-bot/src/__tests__/services/subscription/tier-service.test.ts`:

```typescript
import { getUserTier } from '../../../services/subscription/tier-service.js'

// Mock supabase client
jest.mock('../../../services/database/supabase-client.js', () => ({
  getSupabaseClient: jest.fn(() => ({
    rpc: jest.fn()
  }))
}))

import { getSupabaseClient } from '../../../services/database/supabase-client.js'

describe('getUserTier', () => {
  it('returns free when no subscription exists', async () => {
    const mockRpc = jest.fn().mockResolvedValue({ data: 'free', error: null })
    ;(getSupabaseClient as jest.Mock).mockReturnValue({ rpc: mockRpc })

    const tier = await getUserTier('user-123')
    expect(tier).toBe('free')
  })

  it('returns whatsapp tier when user has active whatsapp subscription', async () => {
    const mockRpc = jest.fn().mockResolvedValue({ data: 'whatsapp', error: null })
    ;(getSupabaseClient as jest.Mock).mockReturnValue({ rpc: mockRpc })

    const tier = await getUserTier('user-456')
    expect(tier).toBe('whatsapp')
  })

  it('returns couples tier correctly', async () => {
    const mockRpc = jest.fn().mockResolvedValue({ data: 'couples', error: null })
    ;(getSupabaseClient as jest.Mock).mockReturnValue({ rpc: mockRpc })

    expect(await getUserTier('user-789')).toBe('couples')
  })

  it('returns free on database error', async () => {
    const mockRpc = jest.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } })
    ;(getSupabaseClient as jest.Mock).mockReturnValue({ rpc: mockRpc })

    expect(await getUserTier('user-err')).toBe('free')
  })
})

describe('tierAllowsWhatsApp', () => {
  it('blocks free tier', () => {
    const { tierAllowsWhatsApp } = require('../../../services/subscription/tier-service.js')
    expect(tierAllowsWhatsApp('free')).toBe(false)
  })

  it('allows whatsapp tier and above', () => {
    const { tierAllowsWhatsApp } = require('../../../services/subscription/tier-service.js')
    expect(tierAllowsWhatsApp('whatsapp')).toBe(true)
    expect(tierAllowsWhatsApp('couples')).toBe(true)
    expect(tierAllowsWhatsApp('openfinance')).toBe(true)
  })
})

describe('tierAllowsGroups', () => {
  it('blocks free and whatsapp tiers', () => {
    const { tierAllowsGroups } = require('../../../services/subscription/tier-service.js')
    expect(tierAllowsGroups('free')).toBe(false)
    expect(tierAllowsGroups('whatsapp')).toBe(false)
  })

  it('allows couples and openfinance tiers', () => {
    const { tierAllowsGroups } = require('../../../services/subscription/tier-service.js')
    expect(tierAllowsGroups('couples')).toBe(true)
    expect(tierAllowsGroups('openfinance')).toBe(true)
  })
})
```

**Step 2: Run test to verify it fails**

```bash
cd whatsapp-bot && npm test -- tier-service.test.ts
```

Expected: FAIL — module not found.

**Step 3: Implement `tier-service.ts`**

Create `whatsapp-bot/src/services/subscription/tier-service.ts`:

```typescript
import { getSupabaseClient } from '../database/supabase-client.js'

export type Tier = 'free' | 'whatsapp' | 'couples' | 'openfinance'

const TIER_ORDER: Record<Tier, number> = {
  free: 0,
  whatsapp: 1,
  couples: 2,
  openfinance: 3,
}

export async function getUserTier(userId: string): Promise<Tier> {
  try {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase.rpc('get_user_tier', { p_user_id: userId })
    if (error) {
      console.error('[TierService] Error fetching tier:', error)
      return 'free'
    }
    return (data as Tier) ?? 'free'
  } catch (err) {
    console.error('[TierService] Unexpected error:', err)
    return 'free'
  }
}

export function tierAllowsWhatsApp(tier: Tier): boolean {
  return TIER_ORDER[tier] >= TIER_ORDER['whatsapp']
}

export function tierAllowsGroups(tier: Tier): boolean {
  return TIER_ORDER[tier] >= TIER_ORDER['couples']
}
```

**Step 4: Run tests to verify they pass**

```bash
cd whatsapp-bot && npm test -- tier-service.test.ts
```

Expected: PASS (all tests green).

**Step 5: Add tier check to `checkAuthorizationWithIdentifiers`**

In `whatsapp-bot/src/middleware/authorization.ts`, modify the function to return the user's tier in the result, and add a tier check.

First, update `AuthorizationResult` interface (around line 23):

```typescript
export interface AuthorizationResult {
  authorized: boolean
  userId?: string
  tier?: Tier               // ADD THIS
  permissions?: {
    can_view: boolean
    can_add: boolean
    can_edit: boolean
    can_delete: boolean
    can_manage_budgets: boolean
    can_view_reports: boolean
  }
  error?: string
}
```

Add import at top of `authorization.ts`:

```typescript
import { getUserTier, tierAllowsWhatsApp, type Tier } from '../services/subscription/tier-service.js'
```

In `checkAuthorizationWithIdentifiers`, after `if (result) {` block sets `authorized: true` (around line 131), fetch and include the tier:

```typescript
// After finding the user, fetch their tier
const tier = await getUserTier(result.user_id)

if (!tierAllowsWhatsApp(tier)) {
  console.log('[Authorization] User on free tier, WhatsApp access blocked')
  return {
    authorized: false,
    userId: result.user_id,
    tier,
    error: 'whatsapp_tier_required',
  }
}

return {
  authorized: true,
  userId: result.user_id,
  tier,
  permissions: result.permissions as AuthorizationResult['permissions'],
}
```

**Step 6: Update message handler to send upgrade prompt**

In `whatsapp-bot/src/index.ts`, find where authorization failures are handled (search for `authorized: false`) and add a specific message for `whatsapp_tier_required`:

```typescript
if (!authResult.authorized) {
  if (authResult.error === 'whatsapp_tier_required') {
    await sock.sendMessage(from, {
      text: '🔒 O acesso ao bot pelo WhatsApp requer um plano pago.\n\n' +
            'Acesse o app para escolher seu plano: https://nexfinapp.com/pricing'
    })
    return
  }
  // ... existing unauthorized handling
}
```

**Step 7: Run full test suite**

```bash
cd whatsapp-bot && npm test
```

Expected: 795+ passing, 0 new failures.

**Step 8: Commit**

```bash
git add whatsapp-bot/src/services/subscription/tier-service.ts \
        whatsapp-bot/src/__tests__/services/subscription/tier-service.test.ts \
        whatsapp-bot/src/middleware/authorization.ts \
        whatsapp-bot/src/index.ts
git commit -m "feat: add tier service and WhatsApp access gating"
```

---

## Task 3: WhatsApp Bot — Gate Group Invite Join

The `handleGroupInvite` function in `whatsapp-bot/src/index.ts` (line 285) must check for `couples` tier before accepting any group invite.

**Files:**
- Modify: `whatsapp-bot/src/index.ts:285-380`

**Step 1: Write failing test**

Add to `whatsapp-bot/src/__tests__/services/subscription/tier-service.test.ts`:

(Already covered by `tierAllowsGroups` tests in Task 2 — no new test needed here.)

**Step 2: Modify `handleGroupInvite` in `index.ts`**

Around line 310, after `checkAuthorizationFromJid` returns, add tier check before accepting:

```typescript
if (authResult.authorized && authResult.userId) {
  // NEW: Check tier allows groups
  const tier = await getUserTier(authResult.userId)
  if (!tierAllowsGroups(tier)) {
    console.log('[GROUP INVITE] User tier does not allow groups:', tier)
    await sock.sendMessage(from, {
      text: '🔒 Grupos são exclusivos para o plano *Casais* ou superior.\n\n' +
            'Acesse o app para fazer upgrade: https://nexfinapp.com/pricing'
    })
    return
  }

  // ... existing join logic (sock.groupAcceptInvite, etc.)
}
```

Add import at top of index.ts:

```typescript
import { getUserTier, tierAllowsGroups } from './services/subscription/tier-service.js'
```

**Step 3: Run full test suite**

```bash
cd whatsapp-bot && npm test
```

Expected: no regressions.

**Step 4: Commit**

```bash
git add whatsapp-bot/src/index.ts
git commit -m "feat: gate group invite join behind couples tier"
```

Close the investigation beads issue:

```bash
bd close lv-expense-tracker-q8e --reason="Group join gated at handleGroupInvite in index.ts:310, requires couples tier"
```

---

## Task 4: Frontend — Subscription Server Actions

**Files:**
- Create: `fe/lib/actions/subscriptions.ts`

**Step 1: Implement the server action**

```typescript
"use server"

import { getSupabaseServerClient } from "@/lib/supabase/server"

export type Tier = 'free' | 'whatsapp' | 'couples' | 'openfinance'

export interface Subscription {
  id: string
  tier: Tier
  type: 'monthly' | 'lifetime'
  status: 'active' | 'cancelled' | 'past_due' | 'expired'
  mercado_pago_subscription_id: string | null
  started_at: string | null
  expires_at: string | null
  created_at: string
}

export async function getMySubscription(): Promise<{
  tier: Tier
  subscription: Subscription | null
}> {
  const supabase = await getSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { tier: 'free', subscription: null }

  const { data } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!data) return { tier: 'free', subscription: null }
  return { tier: data.tier as Tier, subscription: data as Subscription }
}

export async function getLifetimeSpotsRemaining(): Promise<number> {
  const supabase = await getSupabaseServerClient()
  const { count } = await supabase
    .from('lifetime_purchases')
    .select('*', { count: 'exact', head: true })
  return Math.max(0, 50 - (count ?? 0))
}
```

**Step 2: Commit**

```bash
git add fe/lib/actions/subscriptions.ts
git commit -m "feat: add subscription server actions"
```

---

## Task 5: Frontend — Pricing Page

**Files:**
- Create: `fe/app/[locale]/pricing/page.tsx`

**Step 1: Implement the pricing page**

```typescript
// fe/app/[locale]/pricing/page.tsx
import { getMySubscription, getLifetimeSpotsRemaining } from "@/lib/actions/subscriptions"
import { PricingClient } from "./pricing-client"

export default async function PricingPage() {
  const [{ tier, subscription }, spotsRemaining] = await Promise.all([
    getMySubscription(),
    getLifetimeSpotsRemaining(),
  ])

  return (
    <PricingClient
      currentTier={tier}
      subscription={subscription}
      lifetimeSpotsRemaining={spotsRemaining}
    />
  )
}
```

**Step 2: Create `fe/app/[locale]/pricing/pricing-client.tsx`**

```typescript
"use client"

import { type Tier, type Subscription } from "@/lib/actions/subscriptions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

const TIERS = [
  {
    id: 'free' as Tier,
    name: 'Gratuito',
    monthly: 0,
    lifetime: null,
    features: ['App web completo', 'Categorias e relatórios', 'Transações ilimitadas'],
  },
  {
    id: 'whatsapp' as Tier,
    name: 'WhatsApp',
    monthly: 9.90,
    lifetime: 79.90,
    features: ['Tudo do plano Gratuito', '1 número WhatsApp', 'Adicionar gastos pelo WhatsApp', 'OCR de recibos'],
  },
  {
    id: 'couples' as Tier,
    name: 'Casais',
    monthly: 19.90,
    lifetime: 159.90,
    features: ['Tudo do plano WhatsApp', 'Múltiplos números WhatsApp', 'Grupos do WhatsApp', 'Finanças compartilhadas'],
  },
  {
    id: 'openfinance' as Tier,
    name: 'Open Finance',
    monthly: 39.90,
    lifetime: 319.90,
    features: ['Tudo do plano Casais', 'Importação automática de extratos', 'Classificação automática por IA', 'Conexão com bancos via Openi'],
  },
]

interface Props {
  currentTier: Tier
  subscription: Subscription | null
  lifetimeSpotsRemaining: number
}

export function PricingClient({ currentTier, subscription, lifetimeSpotsRemaining }: Props) {
  return (
    <div className="container mx-auto py-12 px-4">
      <h1 className="text-3xl font-bold text-center mb-2">Planos</h1>
      <p className="text-center text-muted-foreground mb-10">
        Escolha o plano ideal para você
      </p>

      {lifetimeSpotsRemaining > 0 && (
        <div className="text-center mb-8 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          🎉 Oferta de lançamento: apenas <strong>{lifetimeSpotsRemaining} vagas</strong> para acesso vitalício!
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {TIERS.map((tier) => {
          const isCurrent = currentTier === tier.id
          return (
            <Card key={tier.id} className={isCurrent ? 'border-primary shadow-md' : ''}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>{tier.name}</CardTitle>
                  {isCurrent && <Badge>Atual</Badge>}
                </div>
                <div className="mt-2">
                  {tier.monthly === 0 ? (
                    <span className="text-2xl font-bold">Grátis</span>
                  ) : (
                    <>
                      <span className="text-2xl font-bold">
                        R${tier.monthly.toFixed(2).replace('.', ',')}
                      </span>
                      <span className="text-muted-foreground">/mês</span>
                    </>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 mb-6">
                  {tier.features.map((f) => (
                    <li key={f} className="text-sm flex items-start gap-2">
                      <span className="text-green-500 mt-0.5">✓</span>
                      {f}
                    </li>
                  ))}
                </ul>

                {tier.monthly > 0 && !isCurrent && (
                  <div className="space-y-2">
                    <Button className="w-full" size="sm">
                      Assinar por R${tier.monthly.toFixed(2).replace('.', ',')}/mês
                    </Button>
                    {tier.lifetime && lifetimeSpotsRemaining > 0 && (
                      <Button className="w-full" size="sm" variant="outline">
                        Vitalício por R${tier.lifetime.toFixed(2).replace('.', ',')}
                      </Button>
                    )}
                  </div>
                )}

                {isCurrent && tier.monthly > 0 && (
                  <Button className="w-full" size="sm" variant="ghost" disabled>
                    Plano atual
                  </Button>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
```

**Step 3: Add pricing link to navigation**

In `fe/app/[locale]/layout.tsx` or nav component, add a link to `/pricing`. (Locate the nav component in `fe/components/` and add the pricing page link.)

**Step 4: Commit**

```bash
git add fe/app/\[locale\]/pricing/
git commit -m "feat: add pricing page with tier comparison"
```

---

## Task 6: Frontend — Mercado Pago Webhook Handler

**Files:**
- Create: `fe/app/api/webhooks/mercadopago/route.ts`

**Step 1: Implement webhook handler**

```typescript
// fe/app/api/webhooks/mercadopago/route.ts
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
      // One-time payment (lifetime purchase)
      await handlePayment(data.id)
    } else if (type === 'subscription_preapproval') {
      // Recurring subscription
      await handleSubscription(data.id)
    }
  } catch (err) {
    console.error('[MP Webhook] Error:', err)
    return NextResponse.json({ error: 'processing_error' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}

async function handlePayment(paymentId: string) {
  // TODO: Fetch payment from Mercado Pago API, validate, create subscription
  // Implementation in next task (Task 7)
  console.log('[MP Webhook] Payment received:', paymentId)
}

async function handleSubscription(subscriptionId: string) {
  // TODO: Fetch subscription from Mercado Pago API, update DB
  // Implementation in next task (Task 7)
  console.log('[MP Webhook] Subscription event:', subscriptionId)
}
```

**Step 2: Commit placeholder**

```bash
git add fe/app/api/webhooks/mercadopago/route.ts
git commit -m "feat: add Mercado Pago webhook route (placeholder)"
```

---

## Task 7: Mercado Pago Integration — Payment Processing

**Files:**
- Modify: `fe/app/api/webhooks/mercadopago/route.ts`
- Create: `fe/lib/mercadopago.ts`

**Step 1: Add Mercado Pago SDK**

```bash
cd fe && npm install mercadopago
```

**Step 2: Create MP client helper**

```typescript
// fe/lib/mercadopago.ts
import { MercadoPagoConfig, Payment, PreApproval } from "mercadopago"

const mp = new MercadoPagoConfig({
  accessToken: process.env.MERCADO_PAGO_ACCESS_TOKEN!,
})

export const mpPayment = new Payment(mp)
export const mpPreApproval = new PreApproval(mp)
```

**Step 3: Add env variable**

Add to `.env.local` and Railway environment:
```
MERCADO_PAGO_ACCESS_TOKEN=your_access_token_here
```

**Step 4: Implement full webhook handlers**

```typescript
// Replace handlePayment and handleSubscription in route.ts:

async function handlePayment(paymentId: string) {
  const payment = await mpPayment.get({ id: paymentId })
  if (payment.status !== 'approved') return

  const userId = payment.external_reference  // set when creating payment
  const tier = payment.metadata?.tier as string
  const amount = payment.transaction_amount ?? 0

  if (!userId || !tier) {
    console.error('[MP Webhook] Missing userId or tier in payment metadata')
    return
  }

  // Get current lifetime purchase count
  const { count } = await supabase
    .from('lifetime_purchases')
    .select('*', { count: 'exact', head: true })

  if ((count ?? 0) >= 50) {
    console.error('[MP Webhook] Lifetime purchases exhausted')
    // TODO: refund payment
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

  console.log('[MP Webhook] Lifetime purchase recorded for user:', userId)
}

async function handleSubscription(subscriptionId: string) {
  const sub = await mpPreApproval.get({ id: subscriptionId })
  const userId = sub.external_reference
  const tier = sub.reason?.split('_')[0]  // e.g. "whatsapp_monthly"

  if (!userId || !tier) return

  const status = sub.status === 'authorized' ? 'active'
    : sub.status === 'cancelled' ? 'cancelled'
    : 'past_due'

  await supabase
    .from('subscriptions')
    .upsert({
      user_id: userId,
      tier,
      type: 'monthly',
      status,
      mercado_pago_subscription_id: subscriptionId,
      started_at: sub.date_created,
      expires_at: sub.next_payment_date,
    }, { onConflict: 'mercado_pago_subscription_id' })

  console.log('[MP Webhook] Subscription updated:', subscriptionId, status)
}
```

**Step 5: Commit**

```bash
git add fe/lib/mercadopago.ts fe/app/api/webhooks/mercadopago/route.ts fe/package.json fe/package-lock.json
git commit -m "feat: implement Mercado Pago webhook payment processing"
```

---

## Task 8: Frontend — Subscription Management in Profile

**Files:**
- Create: `fe/app/[locale]/profile/subscription/page.tsx`

**Step 1: Create subscription management page**

```typescript
// fe/app/[locale]/profile/subscription/page.tsx
import { getMySubscription } from "@/lib/actions/subscriptions"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import Link from "next/link"

const TIER_LABELS: Record<string, string> = {
  free: 'Gratuito',
  whatsapp: 'WhatsApp',
  couples: 'Casais',
  openfinance: 'Open Finance',
}

export default async function SubscriptionPage() {
  const { tier, subscription } = await getMySubscription()

  return (
    <div className="container max-w-lg mx-auto py-8 px-4">
      <h1 className="text-2xl font-bold mb-6">Minha Assinatura</h1>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Plano atual</CardTitle>
            <Badge variant={tier === 'free' ? 'secondary' : 'default'}>
              {TIER_LABELS[tier]}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {subscription ? (
            <div className="space-y-2 text-sm">
              <p>Tipo: {subscription.type === 'lifetime' ? 'Vitalício' : 'Mensal'}</p>
              {subscription.expires_at && (
                <p>Próxima cobrança: {new Date(subscription.expires_at).toLocaleDateString('pt-BR')}</p>
              )}
              {subscription.type === 'monthly' && (
                <Button variant="outline" size="sm" className="mt-4 text-red-600" disabled>
                  Cancelar assinatura
                </Button>
              )}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              Você está no plano gratuito.
            </p>
          )}

          <div className="mt-4">
            <Link href="/pricing">
              <Button size="sm">Ver todos os planos</Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
```

**Step 2: Add subscription link to profile page**

In `fe/app/[locale]/profile/page.tsx`, add a link to `/profile/subscription`.

**Step 3: Commit**

```bash
git add fe/app/\[locale\]/profile/subscription/
git commit -m "feat: add subscription management page in profile"
```

---

## Task 9: Beta User Migration

Grant existing active beta users a lifetime subscription at the Couples tier.

**Files:**
- Create: `fe/scripts/056b_beta_user_migration.sql`

**Step 1: Write migration**

```sql
-- fe/scripts/056b_beta_user_migration.sql
-- One-time: grant beta users lifetime Couples tier subscription
-- Run AFTER 056_pricing_tiers.sql
-- Adjust WHERE clause to match your actual beta user criteria

INSERT INTO subscriptions (user_id, tier, type, status, started_at)
SELECT
  id,
  'couples',
  'lifetime',
  'active',
  now()
FROM auth.users
WHERE created_at < '2026-02-01'  -- users created before launch
  AND id NOT IN (SELECT user_id FROM subscriptions)
ON CONFLICT DO NOTHING;
```

**Step 2: Review before running**

```bash
# Preview how many users would be migrated
psql $DATABASE_URL -c "
  SELECT count(*) FROM auth.users
  WHERE created_at < '2026-02-01'
    AND id NOT IN (SELECT user_id FROM subscriptions)
"
```

**Step 3: Run migration**

```bash
psql $DATABASE_URL < fe/scripts/056b_beta_user_migration.sql
```

**Step 4: Commit**

```bash
git add fe/scripts/056b_beta_user_migration.sql
git commit -m "feat: add beta user migration to lifetime couples tier"
```

---

## Summary

| Task | Description | Status |
|------|-------------|--------|
| 1 | DB migration — subscriptions tables + `get_user_tier()` | ⬜ |
| 2 | WhatsApp tier check in authorization middleware | ⬜ |
| 3 | Gate group invite join behind couples tier | ⬜ |
| 4 | Frontend subscription server actions | ⬜ |
| 5 | Pricing page UI | ⬜ |
| 6 | Mercado Pago webhook route (placeholder) | ⬜ |
| 7 | Full Mercado Pago payment processing | ⬜ |
| 8 | Subscription management in profile | ⬜ |
| 9 | Beta user migration script | ⬜ |

**Out of scope (follow-up):**
- Open Finance / Openi integration (separate epic)
- Cancellation flow via Mercado Pago API
- Email notifications for subscription events
- WhatsApp number limit enforcement for `whatsapp` tier (max 1)
