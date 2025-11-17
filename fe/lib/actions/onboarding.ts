"use server"

import { getSupabaseServerClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { trackServerEvent } from "@/lib/analytics/server-tracker"
import { AnalyticsEvent, AnalyticsProperty } from "@/lib/analytics/events"

export type OnboardingStep =
  | null
  | 'welcome'
  | 'add_category'
  | 'add_expense'
  | 'features_tour'
  | 'completed'

export async function startOnboarding() {
  const supabase = await getSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")

  const { error } = await supabase
    .from("user_profiles")
    .update({
      onboarding_step: 'welcome',
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user.id)

  if (error) throw error

  await trackServerEvent(user.id, AnalyticsEvent.ONBOARDING_TUTORIAL_STARTED)

  revalidatePath("/")
}

export async function advanceOnboardingStep(currentStep: OnboardingStep) {
  const supabase = await getSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")

  let nextStep: OnboardingStep = null
  const updates: Record<string, any> = {
    updated_at: new Date().toISOString(),
  }

  switch (currentStep) {
    case 'welcome':
      nextStep = 'add_category'
      updates.whatsapp_setup_completed = true
      break
    case 'add_category':
      nextStep = 'add_expense'
      updates.first_category_added = true
      break
    case 'add_expense':
      nextStep = 'features_tour'
      updates.first_expense_added = true
      break
    case 'features_tour':
      nextStep = 'completed'
      updates.onboarding_completed = true
      break
    default:
      nextStep = 'welcome'
  }

  updates.onboarding_step = nextStep

  const { error } = await supabase
    .from("user_profiles")
    .update(updates)
    .eq("user_id", user.id)

  if (error) throw error

  await trackServerEvent(user.id, AnalyticsEvent.ONBOARDING_STEP_COMPLETED, {
    [AnalyticsProperty.ONBOARDING_STEP]: currentStep || 'unknown',
  })

  revalidatePath("/")
  revalidatePath("/categories")
  revalidatePath("/onboarding")
}

export async function skipOnboardingStep(step: OnboardingStep) {
  const supabase = await getSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")

  await trackServerEvent(user.id, AnalyticsEvent.ONBOARDING_STEP_SKIPPED, {
    [AnalyticsProperty.ONBOARDING_STEP]: step || 'unknown',
    [AnalyticsProperty.ONBOARDING_SKIP_REASON]: 'user_clicked_skip',
  })

  // Advance to next step
  await advanceOnboardingStep(step)
}

export async function completeOnboarding() {
  const supabase = await getSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")

  const { error } = await supabase
    .from("user_profiles")
    .update({
      onboarding_completed: true,
      onboarding_step: 'completed',
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user.id)

  if (error) throw error

  await trackServerEvent(user.id, AnalyticsEvent.ONBOARDING_COMPLETED)

  revalidatePath("/")
}
