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

// Issue #5: Use get_user_tier RPC for correct tier (highest wins), then fetch matching subscription
export async function getMySubscription(): Promise<{
  tier: Tier
  subscription: Subscription | null
}> {
  const supabase = await getSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { tier: 'free', subscription: null }

  // 1. Get tier from RPC (highest tier wins, consistent with SQL logic)
  const { data: tierData } = await supabase.rpc('get_user_tier', { p_user_id: user.id })
  const tier = (tierData as Tier) ?? 'free'

  if (tier === 'free') return { tier, subscription: null }

  // 2. Get subscription matching that tier
  const { data } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', user.id)
    .eq('tier', tier)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()

  return { tier, subscription: data as Subscription | null }
}

// Issue #9: Use MAX(purchase_number) instead of COUNT to handle deletions
export async function getLifetimeSpotsRemaining(): Promise<number> {
  const supabase = await getSupabaseServerClient()

  const { data } = await supabase
    .from('lifetime_purchases')
    .select('purchase_number')
    .order('purchase_number', { ascending: false })
    .limit(1)
    .maybeSingle()

  const maxPurchaseNumber = data?.purchase_number ?? 0
  return Math.max(0, 50 - maxPurchaseNumber)
}
