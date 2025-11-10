"use server"

import { getSupabaseServerClient, getSupabaseAdminClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

const ADMIN_EMAIL = "lucas.venturella@hotmail.com"

/**
 * Check if the current user is an admin
 */
export async function checkIsAdmin(): Promise<boolean> {
  const supabase = await getSupabaseServerClient()
  
  const {
    data: { user },
  } = await supabase.auth.getUser()
  
  if (!user) return false
  
  return user.email === ADMIN_EMAIL
}

/**
 * Verify admin access and throw if not authorized
 */
async function verifyAdmin() {
  const isAdmin = await checkIsAdmin()
  if (!isAdmin) {
    throw new Error("Unauthorized: Admin access required")
  }
}

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

/**
 * Get all beta signups
 */
export async function getAllBetaSignups() {
  await verifyAdmin()
  const supabase = await getSupabaseServerClient()

  const { data, error } = await supabase
    .from("beta_signups")
    .select("*")
    .order("created_at", { ascending: false })

  if (error) throw error

  return data || []
}

/**
 * Approve a beta signup
 */
export async function approveBetaSignup(email: string) {
  await verifyAdmin()
  const supabase = await getSupabaseServerClient()

  const { error } = await supabase
    .from("beta_signups")
    .update({
      status: "approved",
      approved_at: new Date().toISOString(),
    })
    .eq("email", email)

  if (error) throw error

  revalidatePath("/admin/beta-signups")
}

/**
 * Reject a beta signup
 */
export async function rejectBetaSignup(email: string) {
  await verifyAdmin()
  const supabase = await getSupabaseServerClient()

  const { error } = await supabase
    .from("beta_signups")
    .update({
      status: "rejected",
    })
    .eq("email", email)

  if (error) throw error

  revalidatePath("/admin/beta-signups")
}

/**
 * Get all users with their profiles and stats
 */
export async function getAllUsers() {
  await verifyAdmin()
  const supabase = await getSupabaseServerClient()
  const adminClient = getSupabaseAdminClient()

  // Get ALL auth users first (this is the source of truth)
  const { data: { users }, error: usersError } = await adminClient.auth.admin.listUsers()
  if (usersError) throw usersError

  // Get all user profiles
  const { data: profiles, error: profilesError } = await supabase
    .from("user_profiles")
    .select("*")

  if (profilesError) throw profilesError

  // Create maps for quick lookup
  const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || [])

  // Get transaction counts per user
  const { data: transactionCounts } = await supabase
    .from("transactions")
    .select("user_id")

  const transactionCountMap = new Map<string, number>()
  transactionCounts?.forEach((t: any) => {
    transactionCountMap.set(t.user_id, (transactionCountMap.get(t.user_id) || 0) + 1)
  })

  // Get AI usage per user
  const { data: aiUsage } = await supabase
    .from("user_ai_usage")
    .select("user_id, total_cost_usd, daily_limit_usd")

  const aiUsageMap = new Map<string, any>()
  aiUsage?.forEach((u: any) => {
    aiUsageMap.set(u.user_id, {
      totalCost: Number(u.total_cost_usd || 0),
      dailyLimit: Number(u.daily_limit_usd || 0),
    })
  })

  // Get WhatsApp numbers count per user
  const { data: whatsappNumbers } = await supabase
    .from("authorized_whatsapp_numbers")
    .select("user_id")

  const whatsappCountMap = new Map<string, number>()
  whatsappNumbers?.forEach((w: any) => {
    whatsappCountMap.set(w.user_id, (whatsappCountMap.get(w.user_id) || 0) + 1)
  })

  // Map over AUTH USERS (not profiles) so all users show up
  return users.map((user: any) => {
    const profile = profileMap.get(user.id)
    return {
      userId: user.id,
      email: user.email || "Unknown",
      displayName: profile?.display_name || user.user_metadata?.display_name || null,
      whatsappNumbersCount: whatsappCountMap.get(user.id) || 0,
      totalTransactions: transactionCountMap.get(user.id) || 0,
      aiTotalCost: aiUsageMap.get(user.id)?.totalCost || 0,
      aiDailyLimit: aiUsageMap.get(user.id)?.dailyLimit || 1.0,
      joinedDate: user.created_at || profile?.created_at,
    }
  })
}

/**
 * Get detailed information about a specific user
 */
export async function getUserDetails(userId: string) {
  await verifyAdmin()
  const supabase = await getSupabaseServerClient()
  const adminClient = getSupabaseAdminClient()

  // Get auth user data first (this is required)
  const { data: { user }, error: userError } = await adminClient.auth.admin.getUserById(userId)
  if (userError) throw userError

  // Get user profile (may not exist for new users)
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle()

  // Get authorized WhatsApp numbers
  const { data: whatsappNumbers } = await supabase
    .from("authorized_whatsapp_numbers")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })

  // Get authorized groups
  const { data: authorizedGroups } = await supabase
    .from("authorized_groups")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })

  // Get transaction summary
  const { data: transactions } = await supabase
    .from("transactions")
    .select("amount, type")
    .eq("user_id", userId)

  const transactionSummary = {
    count: transactions?.length || 0,
    totalIncome: transactions?.filter((t: any) => t.type === "income").reduce((sum: number, t: any) => sum + Number(t.amount), 0) || 0,
    totalExpenses: transactions?.filter((t: any) => t.type === "expense").reduce((sum: number, t: any) => sum + Number(t.amount), 0) || 0,
  }

  // Get AI usage details (may not exist for users who haven't used AI features)
  const { data: aiUsage } = await supabase
    .from("user_ai_usage")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle()

  // Get recent parsing activity
  const { data: recentActivity } = await supabase
    .from("parsing_metrics")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(10)

  return {
    profile: {
      userId: userId,
      email: user?.email || "Unknown",
      displayName: profile?.display_name || user?.user_metadata?.display_name || null,
      createdAt: user?.created_at || profile?.created_at,
      locale: profile?.locale,
    },
    whatsappNumbers: whatsappNumbers || [],
    authorizedGroups: authorizedGroups || [],
    transactionSummary,
    aiUsage: aiUsage ? {
      totalCost: Number(aiUsage.total_cost_usd || 0),
      dailyCost: Number(aiUsage.daily_cost_usd || 0),
      dailyLimit: Number(aiUsage.daily_limit_usd || 0),
      isLimitEnabled: aiUsage.is_limit_enabled,
      isAdminOverride: aiUsage.is_admin_override,
      llmCallsCount: aiUsage.llm_calls_count || 0,
      llmCallsToday: aiUsage.llm_calls_today || 0,
      embeddingCallsCount: aiUsage.embedding_calls_count || 0,
      embeddingCallsToday: aiUsage.embedding_calls_today || 0,
      cacheHitsCount: aiUsage.cache_hits_count || 0,
      cacheHitsToday: aiUsage.cache_hits_today || 0,
      totalInputTokens: aiUsage.total_input_tokens || 0,
      totalOutputTokens: aiUsage.total_output_tokens || 0,
    } : null,
    recentActivity: recentActivity || [],
  }
}

