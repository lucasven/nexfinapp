"use server"

import { getSupabaseServerClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

/**
 * User actions for account management and self-service operations
 */

/**
 * Delete the current user's account (LGPD compliance - right to be forgotten)
 * This is a self-service action that allows users to delete their own data
 *
 * Steps:
 * 1. Verify user is authenticated
 * 2. Call database function to delete all user data
 * 3. Delete user from auth.users using their session
 * 4. Return summary of deleted data
 */
export async function deleteMyAccount(): Promise<{
  success: boolean
  message: string
  deletedData?: any
}> {
  try {
    const supabase = await getSupabaseServerClient()

    // Get current authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return {
        success: false,
        message: "Not authenticated. Please log in to delete your account.",
      }
    }

    const userId = user.id
    const userEmail = user.email || "Unknown"

    console.log("[User] Self-deletion requested by:", userEmail)

    // Call database function to delete all user data
    const { data: deletionResult, error: dbError } = await supabase.rpc(
      "delete_user_data",
      {
        p_user_id: userId,
        p_deleted_by_user_id: userId, // User is deleting their own account
        p_deletion_type: "self",
      }
    )

    if (dbError) {
      console.error("[User] Error deleting user data:", dbError)
      throw new Error(`Failed to delete your data: ${dbError.message}`)
    }

    console.log("[User] User data deleted successfully:", deletionResult)

    // Sign out the user (this will also delete the session)
    const { error: signOutError } = await supabase.auth.signOut()

    if (signOutError) {
      console.warn("[User] Error signing out after deletion:", signOutError)
      // Continue with deletion even if sign out fails
    }

    // Delete user from auth.users
    // Note: This requires the user to be authenticated, which they currently are
    // Supabase will handle the deletion through the session
    const { error: deleteAuthError } = await supabase.auth.admin.deleteUser(
      userId
    )

    if (deleteAuthError) {
      console.error("[User] Error deleting auth user:", deleteAuthError)
      // Data was deleted but auth user remains - inform user
      return {
        success: false,
        message: `Your data was deleted, but we couldn't remove your authentication account. Please contact support. Error: ${deleteAuthError.message}`,
        deletedData: deletionResult,
      }
    }

    // Revalidate all pages since user no longer exists
    revalidatePath("/", "layout")

    return {
      success: true,
      message: `Your account has been permanently deleted. ${deletionResult.data_summary.total_records_deleted} records were removed.`,
      deletedData: deletionResult,
    }
  } catch (error: any) {
    console.error("[User] Error in deleteMyAccount:", error)
    return {
      success: false,
      message: error.message || "Failed to delete your account. Please try again or contact support.",
    }
  }
}

/**
 * Get summary of user's data (for display before deletion)
 */
export async function getMyDataSummary(): Promise<{
  success: boolean
  data?: {
    transactionCount: number
    categoryCount: number
    budgetCount: number
    recurringCount: number
    whatsappNumberCount: number
    groupCount: number
  }
  message?: string
}> {
  try {
    const supabase = await getSupabaseServerClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return {
        success: false,
        message: "Not authenticated",
      }
    }

    // Count transactions
    const { count: transactionCount } = await supabase
      .from("transactions")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)

    // Count custom categories
    const { count: categoryCount } = await supabase
      .from("categories")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)

    // Count budgets
    const { count: budgetCount } = await supabase
      .from("budgets")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)

    // Count recurring transactions
    const { count: recurringCount } = await supabase
      .from("recurring_transactions")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)

    // Count WhatsApp numbers
    const { count: whatsappNumberCount } = await supabase
      .from("authorized_whatsapp_numbers")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)

    // Count authorized groups
    const { count: groupCount } = await supabase
      .from("authorized_groups")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)

    return {
      success: true,
      data: {
        transactionCount: transactionCount || 0,
        categoryCount: categoryCount || 0,
        budgetCount: budgetCount || 0,
        recurringCount: recurringCount || 0,
        whatsappNumberCount: whatsappNumberCount || 0,
        groupCount: groupCount || 0,
      },
    }
  } catch (error: any) {
    console.error("[User] Error getting data summary:", error)
    return {
      success: false,
      message: "Failed to load data summary",
    }
  }
}
