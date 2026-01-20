"use server"

import { getSupabaseServerClient, getSupabaseAdminClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { verifyAdmin } from "./auth"

/**
 * Get system overview statistics
 */
export async function getSystemOverview() {
  await verifyAdmin()
  const supabase = await getSupabaseServerClient()
  const adminClient = getSupabaseAdminClient()

  // Get total users count from auth (source of truth)
  const { data: { users }, error: usersError } = await adminClient.auth.admin.listUsers()
  if (usersError) throw usersError
  const totalUsers = users.length

  // Get active users in last 24 hours (from multiple sources)
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)

  // Users who used the bot
  const { data: parsingActivity } = await supabase
    .from("parsing_metrics")
    .select("user_id")
    .gte("created_at", yesterday.toISOString())

  // Users who created/modified transactions
  const { data: transactionActivity } = await supabase
    .from("transactions")
    .select("user_id")
    .gte("created_at", yesterday.toISOString())

  // Combine both for total active users
  const activeUserIds = new Set([
    ...(parsingActivity?.map(m => m.user_id) || []),
    ...(transactionActivity?.map(t => t.user_id) || [])
  ])
  const activeUsers = activeUserIds.size

  // Get total AI spend
  const { data: aiUsageData } = await supabase
    .from("user_ai_usage")
    .select("total_cost_usd, daily_cost_usd, llm_calls_count, cache_hits_count")

  const totalAISpend = aiUsageData?.reduce((sum, row) => sum + Number(row.total_cost_usd || 0), 0) || 0
  const todayAISpend = aiUsageData?.reduce((sum, row) => sum + Number(row.daily_cost_usd || 0), 0) || 0

  // Get pending beta signups
  const { count: pendingSignups } = await supabase
    .from("beta_signups")
    .select("*", { count: "exact", head: true })
    .eq("status", "pending")

  // Get total transactions
  const { count: totalTransactions } = await supabase
    .from("transactions")
    .select("*", { count: "exact", head: true })

  // Calculate weighted average cache hit rate (lifetime, excluding users with no calls)
  const totalLLMCalls = aiUsageData?.reduce(
    (sum, row) => sum + Number(row.llm_calls_count || 0),
    0
  ) || 0
  const totalCacheHits = aiUsageData?.reduce(
    (sum, row) => sum + Number(row.cache_hits_count || 0),
    0
  ) || 0
  const totalCallsWithCache = totalLLMCalls + totalCacheHits
  const avgCacheHitRate = totalCallsWithCache > 0 ? (totalCacheHits / totalCallsWithCache) * 100 : 0

  return {
    totalUsers,
    activeUsers,
    totalAISpend: totalAISpend.toFixed(6),
    todayAISpend: todayAISpend.toFixed(6),
    pendingSignups: pendingSignups || 0,
    totalTransactions: totalTransactions || 0,
    avgCacheHitRate: avgCacheHitRate.toFixed(2),
  }
}

/**
 * Get AI usage per user with email
 */
export async function getAIUsagePerUser() {
  await verifyAdmin()
  const supabase = await getSupabaseServerClient()
  const adminClient = getSupabaseAdminClient()

  // Fetch AI usage data
  const { data, error } = await supabase
    .from("user_ai_usage")
    .select("*")
    .order("total_cost_usd", { ascending: false })

  if (error) throw error

  // Fetch user data from auth.users via admin API
  const { data: { users }, error: usersError } = await adminClient.auth.admin.listUsers()

  if (usersError) throw usersError

  // Create a map of user_id to user data for quick lookup
  const userMap = new Map(users.map(u => [u.id, u]))

  return data?.map((usage: any) => {
    const user = userMap.get(usage.user_id)
    return {
      userId: usage.user_id,
      email: user?.email || "Unknown",
      displayName: user?.user_metadata?.display_name || user?.user_metadata?.full_name || null,
      dailyCost: Number(usage.daily_cost_usd || 0),
      totalCost: Number(usage.total_cost_usd || 0),
      dailyLimit: Number(usage.daily_limit_usd || 0),
      isLimitEnabled: usage.is_limit_enabled,
      isAdminOverride: usage.is_admin_override,
      llmCallsToday: usage.llm_calls_today || 0,
      embeddingCallsToday: usage.embedding_calls_today || 0,
      cacheHitsToday: usage.cache_hits_today || 0,
      totalInputTokens: usage.total_input_tokens || 0,
      totalOutputTokens: usage.total_output_tokens || 0,
      cacheHitRate:
        usage.llm_calls_today + usage.cache_hits_today > 0
          ? ((usage.cache_hits_today / (usage.llm_calls_today + usage.cache_hits_today)) * 100).toFixed(2)
          : "0.00",
      status:
        !usage.is_limit_enabled || usage.is_admin_override
          ? "unlimited"
          : usage.daily_cost_usd >= usage.daily_limit_usd
          ? "over_limit"
          : usage.daily_cost_usd >= usage.daily_limit_usd * 0.8
          ? "near_limit"
          : "ok",
    }
  }) || []
}

/**
 * Update user's daily AI spending limit
 */
export async function updateUserDailyLimit(userId: string, newLimit: number) {
  await verifyAdmin()
  const supabase = await getSupabaseServerClient()

  const { error } = await supabase
    .from("user_ai_usage")
    .update({ daily_limit_usd: newLimit })
    .eq("user_id", userId)

  if (error) throw error

  revalidatePath("/admin/ai-usage")
}

/**
 * Set admin override for a user (bypass daily limits)
 */
export async function setAdminOverride(userId: string, override: boolean) {
  await verifyAdmin()
  const supabase = await getSupabaseServerClient()

  const { error } = await supabase
    .from("user_ai_usage")
    .update({ is_admin_override: override })
    .eq("user_id", userId)

  if (error) throw error

  revalidatePath("/admin/ai-usage")
}
