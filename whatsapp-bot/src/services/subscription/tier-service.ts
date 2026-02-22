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
