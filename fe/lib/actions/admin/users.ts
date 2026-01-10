"use server"

import { getSupabaseServerClient, getSupabaseAdminClient } from "@/lib/supabase/server"
import { verifyAdmin } from "./auth"

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

/**
 * Delete a user and all their data (LGPD compliance)
 * This is a destructive action that cannot be undone
 */
export async function deleteUser(userId: string): Promise<{
  success: boolean
  message: string
  deletedData?: any
}> {
  await verifyAdmin()

  try {
    const supabase = await getSupabaseServerClient()
    const adminClient = getSupabaseAdminClient()

    // Get current user (admin performing the deletion)
    const { data: { user: currentUser } } = await supabase.auth.getUser()
    if (!currentUser) {
      throw new Error('Not authenticated')
    }

    // Verify user exists before attempting deletion
    const { data: { user: targetUser }, error: getUserError } = await adminClient.auth.admin.getUserById(userId)
    if (getUserError || !targetUser) {
      return {
        success: false,
        message: 'User not found'
      }
    }

    // Call database function to delete all user data
    const { data: deletionResult, error: dbError } = await supabase
      .rpc('delete_user_data', {
        p_user_id: userId,
        p_deleted_by_user_id: currentUser.id,
        p_deletion_type: 'admin'
      })

    if (dbError) {
      console.error('[Admin] Error deleting user data:', dbError)
      throw new Error(`Failed to delete user data: ${dbError.message}`)
    }

    console.log('[Admin] User data deleted:', deletionResult)

    // Delete user from auth.users using Admin API
    const { error: authError } = await adminClient.auth.admin.deleteUser(userId)

    if (authError) {
      console.error('[Admin] Error deleting auth user:', authError)
      return {
        success: false,
        message: `User data deleted but failed to remove auth account: ${authError.message}`,
        deletedData: deletionResult
      }
    }

    return {
      success: true,
      message: `User deleted successfully. ${deletionResult.data_summary.total_records_deleted} records removed.`,
      deletedData: deletionResult
    }

  } catch (error: any) {
    console.error('[Admin] Error in deleteUser:', error)
    return {
      success: false,
      message: error.message || 'Failed to delete user'
    }
  }
}
