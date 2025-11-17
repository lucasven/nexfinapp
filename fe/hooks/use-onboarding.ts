"use client"

import { useEffect, useState } from "react"
import { checkOnboardingStatus } from "@/lib/actions/profile"

export type OnboardingStep =
  | null
  | 'welcome'
  | 'add_category'
  | 'add_expense'
  | 'features_tour'
  | 'completed'

export interface OnboardingStatus {
  onboarding_completed: boolean
  whatsapp_setup_completed: boolean
  first_category_added: boolean
  first_expense_added: boolean
  onboarding_step: OnboardingStep
}

export function useOnboarding() {
  const [status, setStatus] = useState<OnboardingStatus | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = async () => {
    try {
      setLoading(true)
      const data = await checkOnboardingStatus()
      if (data) {
        setStatus({
          onboarding_completed: data.onboarding_completed,
          whatsapp_setup_completed: data.whatsapp_setup_completed,
          first_category_added: data.first_category_added,
          first_expense_added: data.first_expense_added,
          onboarding_step: data.onboarding_step as OnboardingStep,
        })
      }
    } catch (error) {
      console.error("Error loading onboarding status:", error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  const isOnboarding = status && !status.onboarding_completed
  const currentStep = status?.onboarding_step

  return {
    status,
    loading,
    refresh,
    isOnboarding,
    currentStep,
  }
}
