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
