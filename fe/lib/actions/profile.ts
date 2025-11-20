"use server"

import { getSupabaseServerClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import type { UserProfile, AuthorizedWhatsAppNumber } from "@/lib/types"
import { trackServerEvent } from "@/lib/analytics/server-tracker"
import { AnalyticsEvent } from "@/lib/analytics/events"
import { updateUserPropertiesInAnalytics } from "@/lib/analytics/user-properties"

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

  // Get display name from auth metadata
  const authDisplayName = user.user_metadata?.display_name

  // Create profile if it doesn't exist
  if (!data) {
    const { data: newProfile, error: insertError } = await supabase
      .from("user_profiles")
      .insert({
        user_id: user.id,
        display_name: authDisplayName || null,
      })
      .select()
      .single()

    if (insertError) throw insertError
    return newProfile
  }

  // Sync display name from auth metadata if profile doesn't have one but auth does
  if (!data.display_name && authDisplayName) {
    const { data: updatedProfile, error: updateError } = await supabase
      .from("user_profiles")
      .update({
        display_name: authDisplayName,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id)
      .select()
      .single()

    if (updateError) {
      console.error("Error syncing display name from auth:", updateError)
      return data
    }
    return updatedProfile
  }

  return data
}

export async function updateProfile(data: { display_name?: string; locale?: 'pt-br' | 'en' }) {
  const supabase = await getSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")

  // Ensure profile exists
  await getProfile()

  // Update the user_profiles table
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

  // Sync display name with Supabase Auth user metadata
  if (data.display_name !== undefined) {
    const { error: authError } = await supabase.auth.updateUser({
      data: {
        display_name: data.display_name,
      },
    })

    if (authError) {
      console.error("Error syncing display name to auth:", authError)
      // Don't throw - profile was updated successfully, just log the auth sync issue
    }
  }

  // Track profile update event
  const changedFields = Object.keys(data)
  await trackServerEvent(
    user.id,
    AnalyticsEvent.PROFILE_UPDATED,
    {
      changed_fields: changedFields,
      has_display_name: !!data.display_name,
      has_locale: !!data.locale,
      locale: data.locale,
    }
  )

  revalidatePath("/profile")
  return profile
}

export async function getUserLocale(): Promise<'pt-br' | 'en'> {
  const supabase = await getSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  
  if (!user) return 'pt-br' // Default for non-authenticated users

  const { data } = await supabase
    .from("user_profiles")
    .select("locale")
    .eq("user_id", user.id)
    .single()

  return (data?.locale as 'pt-br' | 'en') || 'pt-br'
}

export async function setUserLocale(locale: 'pt-br' | 'en') {
  const supabase = await getSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")

  // Get current locale before updating
  const currentProfile = await getProfile()
  const oldLocale = currentProfile?.locale

  // Ensure profile exists
  await getProfile()

  // Update the user_profiles table
  const { error } = await supabase
    .from("user_profiles")
    .update({
      locale,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user.id)

  if (error) throw error

  // Track locale change event
  await trackServerEvent(
    user.id,
    AnalyticsEvent.LOCALE_CHANGED,
    {
      old_locale: oldLocale,
      new_locale: locale,
    }
  )

  revalidatePath("/")
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

  // Track WhatsApp number addition
  await trackServerEvent(
    user.id,
    AnalyticsEvent.WHATSAPP_NUMBER_ADDED,
    {
      is_primary: data.is_primary,
      permission_can_view: data.permissions.can_view,
      permission_can_add: data.permissions.can_add,
      permission_can_edit: data.permissions.can_edit,
      permission_can_delete: data.permissions.can_delete,
      permission_can_manage_budgets: data.permissions.can_manage_budgets,
      permission_can_view_reports: data.permissions.can_view_reports,
    }
  )

  // Refresh user properties in analytics (WhatsApp connection is a key milestone)
  await updateUserPropertiesInAnalytics(user.id)

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

  // Get number details before deletion for analytics
  const { data: numberToDelete } = await supabase
    .from("authorized_whatsapp_numbers")
    .select("is_primary")
    .eq("id", id)
    .eq("user_id", user.id)
    .single()

  const { error } = await supabase
    .from("authorized_whatsapp_numbers")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id)

  if (error) throw error

  // Track WhatsApp number removal
  await trackServerEvent(
    user.id,
    AnalyticsEvent.WHATSAPP_NUMBER_REMOVED,
    {
      was_primary: numberToDelete?.is_primary || false,
    }
  )

  revalidatePath("/profile")
}

// Onboarding helper functions
export async function checkOnboardingStatus(): Promise<{
  onboarding_completed: boolean
  whatsapp_setup_completed: boolean
  first_category_added: boolean
  first_expense_added: boolean
  onboarding_step: string | null
} | null> {
  const supabase = await getSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data, error } = await supabase
    .from("user_profiles")
    .select("onboarding_completed, whatsapp_setup_completed, first_category_added, first_expense_added, onboarding_step")
    .eq("user_id", user.id)
    .single()

  if (error && error.code !== "PGRST116") throw error

  return data
}

export async function updateOnboardingStep(
  step: string,
  stepData?: {
    whatsapp_setup_completed?: boolean
    first_category_added?: boolean
    first_expense_added?: boolean
  }
) {
  const supabase = await getSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")

  const { error } = await supabase
    .from("user_profiles")
    .update({
      onboarding_step: step,
      ...stepData,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user.id)

  if (error) throw error

  revalidatePath("/onboarding")
}

export async function markOnboardingComplete() {
  const supabase = await getSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")

  const { error } = await supabase
    .from("user_profiles")
    .update({
      onboarding_completed: true,
      onboarding_step: "completed",
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user.id)

  if (error) throw error

  revalidatePath("/")
}
