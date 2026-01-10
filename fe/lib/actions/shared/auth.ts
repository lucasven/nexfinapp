"use server"

import { getSupabaseServerClient } from "@/lib/supabase/server"
import type { User } from "@supabase/supabase-js"

/**
 * Result type for getAuthenticatedUser
 */
export type AuthResult =
  | { user: User; error: null }
  | { user: null; error: string }

/**
 * Get authenticated user from Supabase auth.
 * Returns user object or error message.
 *
 * @example
 * const { user, error } = await getAuthenticatedUser()
 * if (error) return { success: false, error }
 */
export async function getAuthenticatedUser(): Promise<AuthResult> {
  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { user: null, error: "Not authenticated" }
  }
  return { user, error: null }
}

/**
 * Require authenticated user or throw error.
 * Use this for functions that throw instead of returning error objects.
 *
 * @example
 * const user = await requireAuthenticatedUser()
 * // user is guaranteed to be defined
 *
 * @throws {Error} If user is not authenticated
 */
export async function requireAuthenticatedUser(): Promise<User> {
  const { user, error } = await getAuthenticatedUser()
  if (!user) {
    throw new Error(error)
  }
  return user
}
