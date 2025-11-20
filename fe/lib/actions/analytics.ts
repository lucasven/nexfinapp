"use server"

import { getSupabaseServerClient } from "@/lib/supabase/server"
import { getEnhancedUserProperties, updateUserPropertiesInAnalytics } from "@/lib/analytics/user-properties"

/**
 * Get enhanced user properties for analytics (callable from client)
 */
export async function getUserAnalyticsProperties() {
  const supabase = await getSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  return await getEnhancedUserProperties(user.id)
}

/**
 * Update user properties in PostHog analytics
 * Can be called after significant user actions (first transaction, connecting WhatsApp, etc.)
 */
export async function refreshUserAnalyticsProperties() {
  const supabase = await getSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return

  await updateUserPropertiesInAnalytics(user.id)
}
