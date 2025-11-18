"use server"

import { getSupabaseServerClient, getSupabaseAdminClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { trackServerEvent } from "@/lib/analytics/server-tracker"
import { AnalyticsEvent } from "@/lib/analytics/events"

/**
 * Check if the current user is an admin
 * Uses user_profiles.is_admin column instead of hardcoded email
 */
export async function checkIsAdmin(): Promise<boolean> {
  const supabase = await getSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return false

  // Query database for admin status
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("is_admin")
    .eq("user_id", user.id)
    .maybeSingle()

  return profile?.is_admin === true
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
 * Approve a beta signup and send invitation email
 */
export async function approveBetaSignup(email: string) {
  await verifyAdmin()
  const supabase = await getSupabaseServerClient()
  const adminClient = getSupabaseAdminClient() // Use admin client for auth.admin methods

  // Update status first
  const { error: updateError } = await supabase
    .from("beta_signups")
    .update({
      status: "approved",
      approved_at: new Date().toISOString(),
    })
    .eq("email", email)

  if (updateError) throw updateError

  // Send invitation email using Supabase Admin API (requires service role)
  const { error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
    email,
    {
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/signup`,
      data: {
        // Pass additional user metadata
        invited_by: "admin",
        invitation_date: new Date().toISOString(),
      }
    }
  )

  if (inviteError) {
    // Log error but don't fail the approval
    console.error("Failed to send invitation email:", inviteError)
    
    // Track invitation error in database
    await supabase
      .from("beta_signups")
      .update({ 
        invitation_sent: false,
        invitation_error: inviteError.message 
      })
      .eq("email", email)
    
    // Track failed invitation event
    await trackServerEvent(email, AnalyticsEvent.ADMIN_BETA_INVITATION_FAILED, {
      error: inviteError.message,
    })
  } else {
    // Track successful invitation
    await supabase
      .from("beta_signups")
      .update({ 
        invitation_sent: true,
        invitation_sent_at: new Date().toISOString(),
        invitation_error: null // Clear any previous errors
      })
      .eq("email", email)
    
    // Track invitation sent event
    await trackServerEvent(email, AnalyticsEvent.ADMIN_BETA_INVITATION_SENT, {
      email,
    })
  }

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
 * Resend beta invitation email
 */
export async function resendBetaInvitation(email: string) {
  await verifyAdmin()
  const supabase = await getSupabaseServerClient()
  const adminClient = getSupabaseAdminClient() // Use admin client for auth.admin methods

  // Send invitation email using Supabase Admin API (requires service role)
  const { error } = await adminClient.auth.admin.inviteUserByEmail(
    email,
    {
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/signup`,
      data: {
        invited_by: "admin",
        invitation_date: new Date().toISOString(),
        resent: true,
      }
    }
  )

  if (error) {
    console.error("Failed to resend invitation email:", error)
    
    // Track error
    await supabase
      .from("beta_signups")
      .update({ 
        invitation_sent: false,
        invitation_error: error.message 
      })
      .eq("email", email)
    
    // Track failed resend event
    await trackServerEvent(email, AnalyticsEvent.ADMIN_BETA_INVITATION_FAILED, {
      error: error.message,
      is_resend: true,
    })
    
    throw error
  }

  // Update invitation tracking
  await supabase
    .from("beta_signups")
    .update({ 
      invitation_sent: true,
      invitation_sent_at: new Date().toISOString(),
      invitation_error: null
    })
    .eq("email", email)
  
  // Track resend event
  await trackServerEvent(email, AnalyticsEvent.ADMIN_BETA_INVITATION_RESENT, {
    email,
  })

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

// ============================================
// Category Analytics Server Actions
// ============================================

/**
 * Get category matching statistics overview
 */
export async function getCategoryMatchingStats() {
  await verifyAdmin()
  const supabase = await getSupabaseServerClient()

  // Total corrections count
  const { count: totalCorrections } = await supabase
    .from("category_corrections")
    .select("*", { count: "exact", head: true })

  // Total transactions with categories
  const { count: totalTransactions } = await supabase
    .from("transactions")
    .select("*", { count: "exact", head: true })
    .not("category_id", "is", null)

  // Calculate correction rate
  const correctionRate = totalTransactions && totalTransactions > 0
    ? ((totalCorrections || 0) / totalTransactions) * 100
    : 0

  // Get merchant coverage (transactions with merchant mappings)
  const { data: merchantMappings } = await supabase
    .from("merchant_category_mapping")
    .select("merchant_name")

  const merchantNames = new Set(merchantMappings?.map(m => m.merchant_name.toLowerCase()) || [])

  const { data: transactions } = await supabase
    .from("transactions")
    .select("description")

  let merchantCoverageCount = 0
  transactions?.forEach((t: any) => {
    const desc = t.description?.toLowerCase() || ""
    for (const merchant of merchantNames) {
      if (desc.includes(merchant)) {
        merchantCoverageCount++
        break
      }
    }
  })

  const merchantCoverage = transactions && transactions.length > 0
    ? (merchantCoverageCount / transactions.length) * 100
    : 0

  // Get total synonyms
  const { count: totalSynonyms } = await supabase
    .from("category_synonyms")
    .select("*", { count: "exact", head: true })

  return {
    totalCorrections: totalCorrections || 0,
    totalTransactions: totalTransactions || 0,
    correctionRate: Number(correctionRate.toFixed(2)),
    merchantCoverage: Number(merchantCoverage.toFixed(2)),
    totalSynonyms: totalSynonyms || 0,
    totalMerchantMappings: merchantMappings?.length || 0,
  }
}

/**
 * Get corrections by category for analysis
 */
export async function getCorrectionsByCategory() {
  await verifyAdmin()
  const supabase = await getSupabaseServerClient()

  const { data: corrections, error } = await supabase
    .from("category_corrections")
    .select(`
      id,
      original_category_id,
      corrected_category_id,
      created_at
    `)
    .order("created_at", { ascending: false })

  if (error) throw error

  // Get all unique category IDs
  const categoryIds = new Set<string>()
  corrections?.forEach((c: any) => {
    if (c.original_category_id) categoryIds.add(c.original_category_id)
    if (c.corrected_category_id) categoryIds.add(c.corrected_category_id)
  })

  // Fetch category names
  const { data: categories } = await supabase
    .from("categories")
    .select("id, name")
    .in("id", Array.from(categoryIds))

  const categoryMap = new Map(categories?.map(c => [c.id, c.name]) || [])

  // Count corrections per original category
  const correctionCounts = new Map<string, number>()
  corrections?.forEach((c: any) => {
    const categoryName = categoryMap.get(c.original_category_id) || "Unknown"
    correctionCounts.set(categoryName, (correctionCounts.get(categoryName) || 0) + 1)
  })

  // Convert to array and sort by count
  const result = Array.from(correctionCounts.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10) // Top 10

  return result
}

/**
 * Get correction flows (FROM category -> TO category patterns)
 */
export async function getCorrectionFlows() {
  await verifyAdmin()
  const supabase = await getSupabaseServerClient()

  const { data: corrections, error } = await supabase
    .from("category_corrections")
    .select(`
      id,
      original_category_id,
      corrected_category_id
    `)
    .not("original_category_id", "is", null)

  if (error) throw error

  // Get all unique category IDs
  const categoryIds = new Set<string>()
  corrections?.forEach((c: any) => {
    if (c.original_category_id) categoryIds.add(c.original_category_id)
    if (c.corrected_category_id) categoryIds.add(c.corrected_category_id)
  })

  // Fetch category names
  const { data: categories } = await supabase
    .from("categories")
    .select("id, name")
    .in("id", Array.from(categoryIds))

  const categoryMap = new Map(categories?.map(c => [c.id, c.name]) || [])

  // Count flows
  const flowCounts = new Map<string, number>()
  corrections?.forEach((c: any) => {
    const from = categoryMap.get(c.original_category_id) || "Unknown"
    const to = categoryMap.get(c.corrected_category_id) || "Unknown"
    const flowKey = `${from}→${to}`
    flowCounts.set(flowKey, (flowCounts.get(flowKey) || 0) + 1)
  })

  // Convert to array and sort by count
  const result = Array.from(flowCounts.entries())
    .map(([flow, count]) => {
      const [from, to] = flow.split("→")
      return { from, to, count }
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 20) // Top 20 flows

  return result
}

/**
 * Get low-confidence category matches that need review
 * Note: This requires match_confidence column to be added to transactions
 * For now, we'll use category_corrections as a proxy for problematic matches
 */
export async function getLowConfidenceMatches(
  limit: number = 50,
  offset: number = 0
) {
  await verifyAdmin()
  const supabase = await getSupabaseServerClient()

  // Get recent corrections to identify problematic patterns
  const { data: corrections } = await supabase
    .from("category_corrections")
    .select("description, original_category_id, corrected_category_id")
    .not("original_category_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(100)

  // Extract problematic descriptions
  const problematicDescriptions = new Set(
    corrections?.map(c => c.description?.toLowerCase().trim()).filter(Boolean) || []
  )

  // Find similar transactions that might need review
  const { data: transactions, error } = await supabase
    .from("transactions")
    .select(`
      id,
      description,
      amount,
      category_id,
      categories!inner(id, name),
      created_at,
      user_id
    `)
    .order("created_at", { ascending: false })
    .limit(limit)
    .range(offset, offset + limit - 1)

  if (error) throw error

  // Mark transactions that match problematic patterns
  const result = transactions?.map((t: any) => ({
    id: t.id,
    description: t.description,
    amount: Number(t.amount),
    category: t.categories?.name || "Unknown",
    categoryId: t.category_id,
    userId: t.user_id,
    createdAt: t.created_at,
    needsReview: problematicDescriptions.has(t.description?.toLowerCase().trim()),
    confidence: 0.75, // Placeholder - will be real data once match_confidence column is added
  })) || []

  return result
}

/**
 * Approve a category match (updates user preferences)
 */
export async function approveCategoryMatch(
  transactionId: string,
  categoryId: string,
  description: string,
  userId: string
) {
  await verifyAdmin()
  const supabase = await getSupabaseServerClient()

  // Insert or update user category preference
  const { error } = await supabase
    .from("user_category_preferences")
    .upsert({
      user_id: userId,
      description_pattern: description.toLowerCase().trim(),
      category_id: categoryId,
      frequency: 1,
      last_used_at: new Date().toISOString(),
    }, {
      onConflict: "user_id,description_pattern",
    })

  if (error) throw error

  // Log admin action
  await supabase
    .from("admin_actions")
    .insert({
      admin_user_id: (await supabase.auth.getUser()).data.user?.id,
      action_type: "approve_match",
      target_table: "transactions",
      target_id: transactionId,
      details: {
        categoryId,
        description,
        userId,
      },
    })

  revalidatePath("/admin/category-analytics")
}

/**
 * Reject a category match and create a correction
 */
export async function rejectCategoryMatch(
  transactionId: string,
  newCategoryId: string,
  userId: string
) {
  await verifyAdmin()
  const supabase = await getSupabaseServerClient()

  // Get transaction details
  const { data: transaction } = await supabase
    .from("transactions")
    .select("category_id, description, amount")
    .eq("id", transactionId)
    .single()

  if (!transaction) throw new Error("Transaction not found")

  // Update transaction category
  const { error: updateError } = await supabase
    .from("transactions")
    .update({ category_id: newCategoryId })
    .eq("id", transactionId)

  if (updateError) throw updateError

  // Create correction record (trigger will handle this, but we can also do it manually)
  await supabase
    .from("category_corrections")
    .insert({
      user_id: userId,
      transaction_id: transactionId,
      original_category_id: transaction.category_id,
      corrected_category_id: newCategoryId,
      description: transaction.description,
      amount: transaction.amount,
      correction_source: "admin_review",
    })

  // Log admin action
  await supabase
    .from("admin_actions")
    .insert({
      admin_user_id: (await supabase.auth.getUser()).data.user?.id,
      action_type: "reject_match",
      target_table: "transactions",
      target_id: transactionId,
      details: {
        oldCategoryId: transaction.category_id,
        newCategoryId,
        userId,
      },
    })

  revalidatePath("/admin/category-analytics")
}

/**
 * Get all merchant category mappings
 */
export async function getMerchantMappings() {
  await verifyAdmin()
  const supabase = await getSupabaseServerClient()

  const { data: mappings, error } = await supabase
    .from("merchant_category_mapping")
    .select(`
      id,
      merchant_name,
      category_id,
      categories!inner(id, name),
      confidence,
      usage_count,
      is_global,
      user_id,
      created_at
    `)
    .order("usage_count", { ascending: false })

  if (error) throw error

  return mappings?.map((m: any) => ({
    id: m.id,
    merchantName: m.merchant_name,
    categoryId: m.category_id,
    categoryName: m.categories?.name || "Unknown",
    confidence: Number(m.confidence),
    usageCount: m.usage_count,
    isGlobal: m.is_global,
    userId: m.user_id,
    createdAt: m.created_at,
  })) || []
}

/**
 * Create a new merchant category mapping
 */
export async function createMerchantMapping(
  merchantName: string,
  categoryId: string,
  isGlobal: boolean = false,
  confidence: number = 0.90
) {
  await verifyAdmin()
  const supabase = await getSupabaseServerClient()

  const { error } = await supabase
    .from("merchant_category_mapping")
    .insert({
      merchant_name: merchantName.toUpperCase(),
      category_id: categoryId,
      is_global: isGlobal,
      confidence,
      usage_count: 0,
    })

  if (error) throw error

  // Log admin action
  await supabase
    .from("admin_actions")
    .insert({
      admin_user_id: (await supabase.auth.getUser()).data.user?.id,
      action_type: "add_merchant",
      target_table: "merchant_category_mapping",
      details: {
        merchantName,
        categoryId,
        isGlobal,
      },
    })

  revalidatePath("/admin/category-analytics")
}

/**
 * Update an existing merchant category mapping
 */
export async function updateMerchantMapping(
  id: string,
  updates: {
    categoryId?: string
    confidence?: number
    isGlobal?: boolean
  }
) {
  await verifyAdmin()
  const supabase = await getSupabaseServerClient()

  const updateData: any = {}
  if (updates.categoryId) updateData.category_id = updates.categoryId
  if (updates.confidence !== undefined) updateData.confidence = updates.confidence
  if (updates.isGlobal !== undefined) updateData.is_global = updates.isGlobal

  const { error } = await supabase
    .from("merchant_category_mapping")
    .update(updateData)
    .eq("id", id)

  if (error) throw error

  // Log admin action
  await supabase
    .from("admin_actions")
    .insert({
      admin_user_id: (await supabase.auth.getUser()).data.user?.id,
      action_type: "update_merchant",
      target_table: "merchant_category_mapping",
      target_id: id,
      details: updates,
    })

  revalidatePath("/admin/category-analytics")
}

/**
 * Delete a merchant category mapping
 */
export async function deleteMerchantMapping(id: string) {
  await verifyAdmin()
  const supabase = await getSupabaseServerClient()

  const { error } = await supabase
    .from("merchant_category_mapping")
    .delete()
    .eq("id", id)

  if (error) throw error

  // Log admin action
  await supabase
    .from("admin_actions")
    .insert({
      admin_user_id: (await supabase.auth.getUser()).data.user?.id,
      action_type: "delete_merchant",
      target_table: "merchant_category_mapping",
      target_id: id,
    })

  revalidatePath("/admin/category-analytics")
}

/**
 * Get all category synonyms
 */
export async function getCategorySynonyms(categoryId?: string) {
  await verifyAdmin()
  const supabase = await getSupabaseServerClient()

  let query = supabase
    .from("category_synonyms")
    .select(`
      id,
      category_id,
      categories!inner(id, name),
      synonym,
      language,
      is_merchant,
      confidence,
      created_at
    `)
    .order("category_id")
    .order("synonym")

  if (categoryId) {
    query = query.eq("category_id", categoryId)
  }

  const { data: synonyms, error } = await query

  if (error) throw error

  return synonyms?.map((s: any) => ({
    id: s.id,
    categoryId: s.category_id,
    categoryName: s.categories?.name || "Unknown",
    synonym: s.synonym,
    language: s.language,
    isMerchant: s.is_merchant,
    confidence: Number(s.confidence),
    createdAt: s.created_at,
  })) || []
}

/**
 * Create a new category synonym
 */
export async function createCategorySynonym(
  categoryId: string,
  synonym: string,
  language: string = "pt-BR",
  isMerchant: boolean = false,
  confidence: number = 0.80
) {
  await verifyAdmin()
  const supabase = await getSupabaseServerClient()

  const { error } = await supabase
    .from("category_synonyms")
    .insert({
      category_id: categoryId,
      synonym: synonym.toLowerCase(),
      language,
      is_merchant: isMerchant,
      confidence,
    })

  if (error) throw error

  // Log admin action
  await supabase
    .from("admin_actions")
    .insert({
      admin_user_id: (await supabase.auth.getUser()).data.user?.id,
      action_type: "add_synonym",
      target_table: "category_synonyms",
      details: {
        categoryId,
        synonym,
        language,
      },
    })

  revalidatePath("/admin/category-analytics")
}

/**
 * Delete a category synonym
 */
export async function deleteCategorySynonym(id: string) {
  await verifyAdmin()
  const supabase = await getSupabaseServerClient()

  const { error } = await supabase
    .from("category_synonyms")
    .delete()
    .eq("id", id)

  if (error) throw error

  // Log admin action
  await supabase
    .from("admin_actions")
    .insert({
      admin_user_id: (await supabase.auth.getUser()).data.user?.id,
      action_type: "delete_synonym",
      target_table: "category_synonyms",
      target_id: id,
    })

  revalidatePath("/admin/category-analytics")
}

/**
 * Get correction rate trend over time (last 30 days)
 */
export async function getCorrectionRateTrend() {
  await verifyAdmin()
  const supabase = await getSupabaseServerClient()

  // Get daily correction counts for last 30 days
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const { data: corrections } = await supabase
    .from("category_corrections")
    .select("created_at")
    .gte("created_at", thirtyDaysAgo.toISOString())

  const { data: transactions } = await supabase
    .from("transactions")
    .select("created_at")
    .gte("created_at", thirtyDaysAgo.toISOString())
    .not("category_id", "is", null)

  // Group by date
  const dateMap = new Map<string, { corrections: number; transactions: number }>()

  // Initialize all dates in range
  for (let i = 0; i < 30; i++) {
    const date = new Date()
    date.setDate(date.getDate() - (29 - i))
    const dateStr = date.toISOString().split("T")[0]
    dateMap.set(dateStr, { corrections: 0, transactions: 0 })
  }

  // Count corrections per day
  corrections?.forEach((c: any) => {
    const dateStr = c.created_at.split("T")[0]
    const entry = dateMap.get(dateStr)
    if (entry) entry.corrections++
  })

  // Count transactions per day
  transactions?.forEach((t: any) => {
    const dateStr = t.created_at.split("T")[0]
    const entry = dateMap.get(dateStr)
    if (entry) entry.transactions++
  })

  // Convert to array with correction rate
  return Array.from(dateMap.entries()).map(([date, counts]) => ({
    date,
    corrections: counts.corrections,
    transactions: counts.transactions,
    correctionRate: counts.transactions > 0
      ? Number(((counts.corrections / counts.transactions) * 100).toFixed(2))
      : 0,
  }))
}

/**
 * Get match type distribution (for pie chart)
 */
export async function getMatchTypeDistribution() {
  await verifyAdmin()
  const supabase = await getSupabaseServerClient()

  const { data: transactions } = await supabase
    .from("transactions")
    .select("match_type")
    .not("match_type", "is", null)

  // Count by match type
  const typeCounts = new Map<string, number>()
  transactions?.forEach((t: any) => {
    const type = t.match_type || "unknown"
    typeCounts.set(type, (typeCounts.get(type) || 0) + 1)
  })

  // Convert to array with percentages
  const total = transactions?.length || 0
  return Array.from(typeCounts.entries()).map(([type, count]) => ({
    type,
    count,
    percentage: total > 0 ? Number(((count / total) * 100).toFixed(1)) : 0,
  }))
}

// ============================================
// OCR & NLP Parsing Analytics Server Actions
// ============================================

/**
 * Get OCR matching statistics overview
 */
export async function getOCRMatchingStats() {
  await verifyAdmin()
  const supabase = await getSupabaseServerClient()

  // Total OCR messages processed
  const { count: totalOCRMessages } = await supabase
    .from("parsing_metrics")
    .select("*", { count: "exact", head: true })
    .eq("message_type", "image")

  // Successful OCR extractions
  const { count: successfulOCR } = await supabase
    .from("parsing_metrics")
    .select("*", { count: "exact", head: true })
    .eq("message_type", "image")
    .eq("success", true)

  // Average OCR confidence
  const { data: ocrConfidenceData } = await supabase
    .from("parsing_metrics")
    .select("confidence")
    .eq("message_type", "image")
    .not("confidence", "is", null)

  const avgOCRConfidence = ocrConfidenceData && ocrConfidenceData.length > 0
    ? ocrConfidenceData.reduce((sum, row) => sum + Number(row.confidence || 0), 0) / ocrConfidenceData.length
    : 0

  // Average processing time for OCR
  const { data: ocrTimingData } = await supabase
    .from("parsing_metrics")
    .select("parse_duration_ms")
    .eq("message_type", "image")
    .not("parse_duration_ms", "is", null)

  const avgOCRProcessingTime = ocrTimingData && ocrTimingData.length > 0
    ? ocrTimingData.reduce((sum, row) => sum + Number(row.parse_duration_ms || 0), 0) / ocrTimingData.length
    : 0

  // OCR success rate
  const ocrSuccessRate = totalOCRMessages && totalOCRMessages > 0
    ? ((successfulOCR || 0) / totalOCRMessages) * 100
    : 0

  return {
    totalOCRMessages: totalOCRMessages || 0,
    successfulOCR: successfulOCR || 0,
    ocrSuccessRate: Number(ocrSuccessRate.toFixed(2)),
    avgOCRConfidence: Number((avgOCRConfidence * 100).toFixed(2)), // Convert to percentage
    avgOCRProcessingTime: Number(avgOCRProcessingTime.toFixed(0)), // In ms
  }
}

/**
 * Get NLP strategy performance breakdown
 */
export async function getNLPStrategyPerformance() {
  await verifyAdmin()
  const supabase = await getSupabaseServerClient()

  const { data: metrics } = await supabase
    .from("parsing_metrics")
    .select("strategy_used, success, confidence, parse_duration_ms")
    .not("strategy_used", "is", null)

  // Group by strategy
  const strategyStats = new Map<string, {
    total: number
    successful: number
    totalConfidence: number
    totalDuration: number
  }>()

  metrics?.forEach((m: any) => {
    const strategy = m.strategy_used
    const stats = strategyStats.get(strategy) || {
      total: 0,
      successful: 0,
      totalConfidence: 0,
      totalDuration: 0,
    }

    stats.total++
    if (m.success) stats.successful++
    stats.totalConfidence += Number(m.confidence || 0)
    stats.totalDuration += Number(m.parse_duration_ms || 0)

    strategyStats.set(strategy, stats)
  })

  // Convert to array with calculated metrics
  return Array.from(strategyStats.entries()).map(([strategy, stats]) => ({
    strategy,
    total: stats.total,
    successful: stats.successful,
    successRate: Number(((stats.successful / stats.total) * 100).toFixed(2)),
    avgConfidence: Number(((stats.totalConfidence / stats.total) * 100).toFixed(2)),
    avgDuration: Number((stats.totalDuration / stats.total).toFixed(0)),
  })).sort((a, b) => b.total - a.total) // Sort by usage
}

/**
 * Get cache hit rate statistics
 */
export async function getCacheHitRateStats() {
  await verifyAdmin()
  const supabase = await getSupabaseServerClient()

  // Get aggregate cache statistics
  const { data: aiUsageData } = await supabase
    .from("user_ai_usage")
    .select("llm_calls_count, cache_hits_count, total_cost_usd")

  const totalLLMCalls = aiUsageData?.reduce(
    (sum, row) => sum + Number(row.llm_calls_count || 0),
    0
  ) || 0

  const totalCacheHits = aiUsageData?.reduce(
    (sum, row) => sum + Number(row.cache_hits_count || 0),
    0
  ) || 0

  const totalCost = aiUsageData?.reduce(
    (sum, row) => sum + Number(row.total_cost_usd || 0),
    0
  ) || 0

  const totalCallsWithCache = totalLLMCalls + totalCacheHits
  const cacheHitRate = totalCallsWithCache > 0
    ? (totalCacheHits / totalCallsWithCache) * 100
    : 0

  // Estimate cost savings (assuming $0.01 per LLM call saved)
  const estimatedSavings = totalCacheHits * 0.01

  // Get most cached message patterns
  const { data: cachedMessages } = await supabase
    .from("message_embeddings")
    .select("message_text, usage_count")
    .order("usage_count", { ascending: false })
    .limit(10)

  return {
    totalLLMCalls,
    totalCacheHits,
    cacheHitRate: Number(cacheHitRate.toFixed(2)),
    totalCost: Number(totalCost.toFixed(4)),
    estimatedSavings: Number(estimatedSavings.toFixed(4)),
    topCachedPatterns: cachedMessages?.map((m: any) => ({
      message: m.message_text,
      hitCount: m.usage_count,
    })) || [],
  }
}

/**
 * Get merchant recognition statistics
 */
export async function getMerchantRecognitionStats() {
  await verifyAdmin()
  const supabase = await getSupabaseServerClient()

  // Top merchants by recognition count
  const { data: topMerchants } = await supabase
    .from("merchant_category_mapping")
    .select(`
      merchant_name,
      usage_count,
      category_id,
      categories!inner(name)
    `)
    .order("usage_count", { ascending: false })
    .limit(20)

  // Total unique merchants
  const { count: totalMerchants } = await supabase
    .from("merchant_category_mapping")
    .select("*", { count: "exact", head: true })

  // Total merchant-matched transactions
  const totalUsage = topMerchants?.reduce(
    (sum, m: any) => sum + Number(m.usage_count || 0),
    0
  ) || 0

  return {
    totalMerchants: totalMerchants || 0,
    totalMerchantMatches: totalUsage,
    topMerchants: topMerchants?.map((m: any) => ({
      merchantName: m.merchant_name,
      usageCount: m.usage_count,
      categoryName: m.categories?.name || "Unknown",
    })) || [],
  }
}

/**
 * Get pattern learning quality statistics
 */
export async function getPatternLearningQuality() {
  await verifyAdmin()
  const supabase = await getSupabaseServerClient()

  const { data: patterns } = await supabase
    .from("learned_patterns")
    .select("pattern_type, confidence_score, usage_count, success_count, failure_count, last_used_at")
    .order("usage_count", { ascending: false })

  // Calculate accuracy for each pattern
  const patternsWithAccuracy = patterns?.map((p: any) => ({
    patternType: p.pattern_type,
    usageCount: p.usage_count,
    successCount: p.success_count,
    failureCount: p.failure_count,
    accuracy: p.usage_count > 0
      ? Number(((p.success_count / p.usage_count) * 100).toFixed(2))
      : 0,
    confidence: Number((p.confidence_score * 100).toFixed(2)),
    lastUsed: p.last_used_at,
  })) || []

  // Group by pattern type
  const typeStats = new Map<string, {
    count: number
    totalUsage: number
    totalSuccess: number
    avgConfidence: number
  }>()

  patterns?.forEach((p: any) => {
    const type = p.pattern_type
    const stats = typeStats.get(type) || {
      count: 0,
      totalUsage: 0,
      totalSuccess: 0,
      avgConfidence: 0,
    }

    stats.count++
    stats.totalUsage += p.usage_count
    stats.totalSuccess += p.success_count
    stats.avgConfidence += p.confidence_score

    typeStats.set(type, stats)
  })

  const typeBreakdown = Array.from(typeStats.entries()).map(([type, stats]) => ({
    patternType: type,
    patternCount: stats.count,
    totalUsage: stats.totalUsage,
    accuracy: stats.totalUsage > 0
      ? Number(((stats.totalSuccess / stats.totalUsage) * 100).toFixed(2))
      : 0,
    avgConfidence: Number(((stats.avgConfidence / stats.count) * 100).toFixed(2)),
  }))

  return {
    patterns: patternsWithAccuracy.slice(0, 20), // Top 20 patterns
    typeBreakdown,
    totalPatterns: patterns?.length || 0,
  }
}

/**
 * Get OCR processing trend over last 30 days
 */
export async function getOCRProcessingTrend() {
  await verifyAdmin()
  const supabase = await getSupabaseServerClient()

  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const { data: ocrMetrics } = await supabase
    .from("parsing_metrics")
    .select("created_at, success, confidence")
    .eq("message_type", "image")
    .gte("created_at", thirtyDaysAgo.toISOString())

  // Group by date
  const dateMap = new Map<string, {
    total: number
    successful: number
    totalConfidence: number
  }>()

  // Initialize all dates in range
  for (let i = 0; i < 30; i++) {
    const date = new Date()
    date.setDate(date.getDate() - (29 - i))
    const dateStr = date.toISOString().split("T")[0]
    dateMap.set(dateStr, { total: 0, successful: 0, totalConfidence: 0 })
  }

  // Count OCR attempts per day
  ocrMetrics?.forEach((m: any) => {
    const dateStr = m.created_at.split("T")[0]
    const entry = dateMap.get(dateStr)
    if (entry) {
      entry.total++
      if (m.success) entry.successful++
      entry.totalConfidence += Number(m.confidence || 0)
    }
  })

  // Convert to array with rates
  return Array.from(dateMap.entries()).map(([date, counts]) => ({
    date,
    total: counts.total,
    successful: counts.successful,
    successRate: counts.total > 0
      ? Number(((counts.successful / counts.total) * 100).toFixed(2))
      : 0,
    avgConfidence: counts.total > 0
      ? Number(((counts.totalConfidence / counts.total) * 100).toFixed(2))
      : 0,
  }))
}

/**
 * Get strategy distribution for pie chart
 */
export async function getStrategyDistribution() {
  await verifyAdmin()
  const supabase = await getSupabaseServerClient()

  const { data: metrics } = await supabase
    .from("parsing_metrics")
    .select("strategy_used")
    .not("strategy_used", "is", null)

  // Count by strategy
  const strategyCounts = new Map<string, number>()
  metrics?.forEach((m: any) => {
    const strategy = m.strategy_used || "unknown"
    strategyCounts.set(strategy, (strategyCounts.get(strategy) || 0) + 1)
  })

  // Convert to array with percentages
  const total = metrics?.length || 0
  return Array.from(strategyCounts.entries()).map(([strategy, count]) => ({
    strategy,
    count,
    percentage: total > 0 ? Number(((count / total) * 100).toFixed(1)) : 0,
  }))
}

/**
 * Get recent OCR errors for debugging
 */
export async function getRecentOCRErrors(limit: number = 20) {
  await verifyAdmin()
  const supabase = await getSupabaseServerClient()

  const { data: errors } = await supabase
    .from("parsing_metrics")
    .select("created_at, error_message, parse_duration_ms, user_id")
    .eq("message_type", "image")
    .eq("success", false)
    .not("error_message", "is", null)
    .order("created_at", { ascending: false })
    .limit(limit)

  return errors?.map((e: any) => ({
    createdAt: e.created_at,
    errorMessage: e.error_message,
    processingTime: e.parse_duration_ms,
    userId: e.user_id,
  })) || []
}

// ============================================
// Intent Classification & Command Tracking
// ============================================

/**
 * Get intent distribution - which commands are being used
 */
export async function getIntentDistribution() {
  await verifyAdmin()
  const supabase = await getSupabaseServerClient()

  const { data: intents } = await supabase
    .from("parsing_metrics")
    .select("intent_action, success")
    .not("intent_action", "is", null)

  // Count by intent
  const intentCounts = new Map<string, { total: number; successful: number; failed: number }>()

  intents?.forEach((i: any) => {
    const intent = i.intent_action || "unknown"
    const stats = intentCounts.get(intent) || { total: 0, successful: 0, failed: 0 }

    stats.total++
    if (i.success) stats.successful++
    else stats.failed++

    intentCounts.set(intent, stats)
  })

  // Convert to array with percentages
  const total = intents?.length || 0
  return Array.from(intentCounts.entries())
    .map(([intent, stats]) => ({
      intent,
      total: stats.total,
      successful: stats.successful,
      failed: stats.failed,
      successRate: Number(((stats.successful / stats.total) * 100).toFixed(2)),
      percentage: total > 0 ? Number(((stats.total / total) * 100).toFixed(1)) : 0,
    }))
    .sort((a, b) => b.total - a.total)
}

/**
 * Get entity extraction patterns - what entities are being extracted
 */
export async function getEntityExtractionPatterns() {
  await verifyAdmin()
  const supabase = await getSupabaseServerClient()

  const { data: metrics } = await supabase
    .from("parsing_metrics")
    .select("intent_action, intent_entities, success")
    .not("intent_entities", "is", null)
    .limit(1000) // Last 1000 with entities

  // Count entity types per intent
  const entityStats = new Map<string, Map<string, number>>()

  metrics?.forEach((m: any) => {
    const intent = m.intent_action || "unknown"
    if (!entityStats.has(intent)) {
      entityStats.set(intent, new Map())
    }

    const entities = m.intent_entities as Record<string, any>
    Object.keys(entities || {}).forEach(entityKey => {
      const intentEntityMap = entityStats.get(intent)!
      intentEntityMap.set(entityKey, (intentEntityMap.get(entityKey) || 0) + 1)
    })
  })

  // Convert to array
  const result: any[] = []
  entityStats.forEach((entityMap, intent) => {
    entityMap.forEach((count, entityType) => {
      result.push({
        intent,
        entityType,
        count,
        percentage: metrics ? Number(((count / metrics.length) * 100).toFixed(1)) : 0,
      })
    })
  })

  return result.sort((a, b) => b.count - a.count)
}

/**
 * Get command coverage - which commands exist but aren't being used
 */
export async function getCommandCoverage() {
  await verifyAdmin()
  const supabase = await getSupabaseServerClient()

  // All possible intents (from types.ts)
  const allIntents = [
    'add_expense', 'add_income', 'show_expenses', 'edit_transaction', 'delete_transaction',
    'change_category', 'show_transaction_details', 'set_budget', 'show_budget', 'delete_budget',
    'add_recurring', 'show_recurring', 'delete_recurring', 'edit_recurring', 'make_expense_recurring',
    'show_report', 'search_transactions', 'quick_stats', 'analyze_spending',
    'list_categories', 'add_category', 'remove_category',
    'login', 'logout', 'help', 'show_help', 'undo_last', 'unknown'
  ]

  const { data: usedIntents } = await supabase
    .from("parsing_metrics")
    .select("intent_action")
    .not("intent_action", "is", null)

  // Count usage
  const usageCounts = new Map<string, number>()
  usedIntents?.forEach((i: any) => {
    const intent = i.intent_action
    usageCounts.set(intent, (usageCounts.get(intent) || 0) + 1)
  })

  // Map to all intents
  return allIntents.map(intent => ({
    intent,
    usageCount: usageCounts.get(intent) || 0,
    isUsed: usageCounts.has(intent),
  })).sort((a, b) => b.usageCount - a.usageCount)
}

/**
 * Get misclassified intents that need review
 */
export async function getMisclassifiedIntents(limit: number = 50) {
  await verifyAdmin()
  const supabase = await getSupabaseServerClient()

  const { data: misclassifications } = await supabase
    .from("intent_misclassifications")
    .select(`
      id,
      original_intent,
      corrected_intent,
      original_message,
      correction_method,
      time_to_correction_seconds,
      severity,
      created_at,
      resolved
    `)
    .order("created_at", { ascending: false })
    .limit(limit)

  return misclassifications || []
}

/**
 * Get cache effectiveness for intent parsing
 */
export async function getIntentCacheEffectiveness() {
  await verifyAdmin()
  const supabase = await getSupabaseServerClient()

  const { data: metrics } = await supabase
    .from("parsing_metrics")
    .select("cache_hit, cache_similarity, success, intent_action")

  const cacheHits = metrics?.filter(m => m.cache_hit === true) || []
  const totalMessages = metrics?.length || 0

  // Stats by intent
  const intentCacheStats = new Map<string, { cacheHits: number; total: number }>()

  metrics?.forEach((m: any) => {
    const intent = m.intent_action || "unknown"
    const stats = intentCacheStats.get(intent) || { cacheHits: 0, total: 0 }

    stats.total++
    if (m.cache_hit) stats.cacheHits++

    intentCacheStats.set(intent, stats)
  })

  // Average similarity for cache hits
  const avgSimilarity = cacheHits.length > 0
    ? cacheHits.reduce((sum, m) => sum + (m.cache_similarity || 0), 0) / cacheHits.length
    : 0

  return {
    totalCacheHits: cacheHits.length,
    totalMessages,
    cacheHitRate: totalMessages > 0 ? Number(((cacheHits.length / totalMessages) * 100).toFixed(2)) : 0,
    avgSimilarity: Number((avgSimilarity * 100).toFixed(2)),
    byIntent: Array.from(intentCacheStats.entries()).map(([intent, stats]) => ({
      intent,
      cacheHits: stats.cacheHits,
      total: stats.total,
      cacheHitRate: stats.total > 0 ? Number(((stats.cacheHits / stats.total) * 100).toFixed(2)) : 0,
    })).sort((a, b) => b.total - a.total),
  }
}

/**
 * Get retry/rephrase patterns - messages that failed then succeeded
 */
export async function getRetryPatterns() {
  await verifyAdmin()
  const supabase = await getSupabaseServerClient()

  // Get failed messages and subsequent successful ones from same user within 2 minutes
  const { data: failedMetrics } = await supabase
    .from("parsing_metrics")
    .select("user_id, whatsapp_number, message_text, intent_action, created_at")
    .eq("success", false)
    .order("created_at", { ascending: false })
    .limit(100)

  if (!failedMetrics || failedMetrics.length === 0) {
    return []
  }

  // For each failed message, look for successful message from same user within 2 minutes
  const retryPatterns: any[] = []

  for (const failed of failedMetrics) {
    const twoMinutesLater = new Date(failed.created_at)
    twoMinutesLater.setMinutes(twoMinutesLater.getMinutes() + 2)

    const { data: successfulMetrics } = await supabase
      .from("parsing_metrics")
      .select("message_text, intent_action, created_at")
      .eq("user_id", failed.user_id)
      .eq("success", true)
      .gte("created_at", failed.created_at)
      .lte("created_at", twoMinutesLater.toISOString())
      .order("created_at", { ascending: true })
      .limit(1)

    if (successfulMetrics && successfulMetrics.length > 0) {
      const successful = successfulMetrics[0]
      const timeDiff = new Date(successful.created_at).getTime() - new Date(failed.created_at).getTime()

      retryPatterns.push({
        failedMessage: failed.message_text,
        failedIntent: failed.intent_action,
        successfulMessage: successful.message_text,
        successfulIntent: successful.intent_action,
        retryTimeSeconds: Math.round(timeDiff / 1000),
        userId: failed.user_id,
      })
    }
  }

  return retryPatterns.slice(0, 20) // Return top 20
}

