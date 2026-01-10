"use server"

import { getSupabaseServerClient } from "@/lib/supabase/server"

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
export async function verifyAdmin() {
  const isAdmin = await checkIsAdmin()
  if (!isAdmin) {
    throw new Error("Unauthorized: Admin access required")
  }
}
