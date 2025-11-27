"use server"

import { getSupabaseServerClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

export async function updateNotificationPreferences(
  reengagementOptOut: boolean
): Promise<{ success: boolean; message?: string }> {
  try {
    const supabase = await getSupabaseServerClient()

    // Get current user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      console.error("Unauthorized attempt to update preferences", { authError })
      return { success: false, message: "Unauthorized" }
    }

    // Update preference
    const { error: updateError } = await supabase
      .from("user_profiles")
      .update({ reengagement_opt_out: reengagementOptOut })
      .eq("user_id", user.id)

    if (updateError) {
      console.error("Failed to update preference", {
        userId: user.id,
        error: updateError,
      })
      return { success: false, message: "Failed to save preferences" }
    }

    console.info("Successfully updated notification preferences", {
      userId: user.id,
      reengagement_opt_out: reengagementOptOut,
    })

    // Revalidate settings page
    revalidatePath("/[locale]/settings/account")

    return { success: true }
  } catch (error) {
    console.error("Unexpected error in updateNotificationPreferences", { error })
    return { success: false, message: "An unexpected error occurred" }
  }
}
