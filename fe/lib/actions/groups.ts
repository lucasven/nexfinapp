"use server"

import { getSupabaseServerClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import type { AuthorizedGroup } from "@/lib/types"

/**
 * Get all authorized groups for the current user
 */
export async function getAuthorizedGroups(): Promise<AuthorizedGroup[]> {
  const supabase = await getSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")

  const { data, error } = await supabase
    .from("authorized_groups")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })

  if (error) throw error

  return data || []
}

/**
 * Toggle group authorization (activate/deactivate)
 */
export async function toggleGroupAuthorization(
  groupId: string,
  isActive: boolean
): Promise<void> {
  const supabase = await getSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")

  const { error } = await supabase
    .from("authorized_groups")
    .update({
      is_active: isActive,
      updated_at: new Date().toISOString(),
    })
    .eq("id", groupId)
    .eq("user_id", user.id)

  if (error) throw error

  revalidatePath("/profile")
}

/**
 * Delete an authorized group
 */
export async function deleteAuthorizedGroup(groupId: string): Promise<void> {
  const supabase = await getSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")

  const { error } = await supabase
    .from("authorized_groups")
    .delete()
    .eq("id", groupId)
    .eq("user_id", user.id)

  if (error) throw error

  revalidatePath("/profile")
}

