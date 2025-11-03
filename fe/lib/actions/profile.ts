"use server"

import { getSupabaseServerClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import type { UserProfile, AuthorizedWhatsAppNumber } from "@/lib/types"

export async function getProfile(): Promise<UserProfile | null> {
  const supabase = await getSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")

  const { data, error } = await supabase
    .from("user_profiles")
    .select("*")
    .eq("user_id", user.id)
    .single()

  if (error && error.code !== "PGRST116") throw error // PGRST116 = no rows returned

  // Create profile if it doesn't exist
  if (!data) {
    const { data: newProfile, error: insertError } = await supabase
      .from("user_profiles")
      .insert({
        user_id: user.id,
      })
      .select()
      .single()

    if (insertError) throw insertError
    return newProfile
  }

  return data
}

export async function updateProfile(data: { username?: string; display_name?: string }) {
  const supabase = await getSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")

  // Ensure profile exists
  await getProfile()

  const { data: profile, error } = await supabase
    .from("user_profiles")
    .update({
      ...data,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user.id)
    .select()
    .single()

  if (error) throw error

  revalidatePath("/profile")
  return profile
}

export async function getAuthorizedNumbers(): Promise<AuthorizedWhatsAppNumber[]> {
  const supabase = await getSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")

  const { data, error } = await supabase
    .from("authorized_whatsapp_numbers")
    .select("*")
    .eq("user_id", user.id)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: true })

  if (error) throw error
  return data || []
}

export async function addAuthorizedNumber(data: {
  whatsapp_number: string
  name: string
  is_primary: boolean
  permissions: {
    can_view: boolean
    can_add: boolean
    can_edit: boolean
    can_delete: boolean
    can_manage_budgets: boolean
    can_view_reports: boolean
  }
}) {
  const supabase = await getSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")

  const { data: newNumber, error } = await supabase
    .from("authorized_whatsapp_numbers")
    .insert({
      user_id: user.id,
      whatsapp_number: data.whatsapp_number,
      name: data.name,
      is_primary: data.is_primary,
      permissions: data.permissions,
    })
    .select()
    .single()

  if (error) throw error

  revalidatePath("/profile")
  return newNumber
}

export async function updateAuthorizedNumber(
  id: string,
  data: {
    whatsapp_number?: string
    name?: string
    is_primary?: boolean
    permissions?: {
      can_view: boolean
      can_add: boolean
      can_edit: boolean
      can_delete: boolean
      can_manage_budgets: boolean
      can_view_reports: boolean
    }
  },
) {
  const supabase = await getSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")

  const { data: updatedNumber, error } = await supabase
    .from("authorized_whatsapp_numbers")
    .update({
      ...data,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single()

  if (error) throw error

  revalidatePath("/profile")
  return updatedNumber
}

export async function deleteAuthorizedNumber(id: string) {
  const supabase = await getSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")

  const { error } = await supabase
    .from("authorized_whatsapp_numbers")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id)

  if (error) throw error

  revalidatePath("/profile")
}
