"use client"

import React, { useState } from "react"
import { useOnboarding } from "@/hooks/use-onboarding"
import { TutorialOverlay } from "@/components/onboarding/tutorial-overlay"
import { ResumeTourFAB } from "@/components/onboarding/resume-tour-fab"
import { skipOnboardingStep, advanceOnboardingStep } from "@/lib/actions/onboarding"
import { useTranslations } from 'next-intl'
import { useRouter } from "next/navigation"

export function HomeOnboardingWrapper({ children, currentStep: propCurrentStep }: { children: React.ReactNode, currentStep?: any }) {
  const t = useTranslations()
  const router = useRouter()
  const { currentStep: hookCurrentStep, isOnboarding, loading, refresh: refreshOnboarding } = useOnboarding()
  const [showExpenseTutorial, setShowExpenseTutorial] = useState(false)
  const [showFeaturesTour, setShowFeaturesTour] = useState(false)
  const [tutorialDismissed, setTutorialDismissed] = useState(false)

  // Use prop if provided, otherwise use hook
  const currentStep = propCurrentStep ?? hookCurrentStep

  // Show tutorial when on add_expense step
  React.useEffect(() => {
    if (!loading && currentStep === 'add_expense' && !tutorialDismissed) {
      const timer = setTimeout(() => setShowExpenseTutorial(true), 500)
      return () => clearTimeout(timer)
    }
  }, [loading, currentStep, tutorialDismissed])

  // Show features tour when on features_tour step
  React.useEffect(() => {
    if (!loading && currentStep === 'features_tour' && !tutorialDismissed) {
      const timer = setTimeout(() => setShowFeaturesTour(true), 500)
      return () => clearTimeout(timer)
    }
  }, [loading, currentStep, tutorialDismissed])

  const handleSkipExpenseTutorial = async () => {
    setShowExpenseTutorial(false)
    setTutorialDismissed(true)
    await skipOnboardingStep('add_expense')
    await refreshOnboarding()
  }

  const handleSkipFeaturesTour = async () => {
    setShowFeaturesTour(false)
    setTutorialDismissed(true)
    await skipOnboardingStep('features_tour')
    await refreshOnboarding()
  }

  const handleResumeTour = () => {
    setTutorialDismissed(false)
    if (currentStep === 'add_expense') {
      setShowExpenseTutorial(true)
    } else if (currentStep === 'features_tour') {
      setShowFeaturesTour(true)
    }
  }

  const handleFeaturesTourNext = async () => {
    setShowFeaturesTour(false)
    await advanceOnboardingStep('features_tour')
    await refreshOnboarding()
    router.refresh()
  }

  return (
    <>
      {children}

      {/* Tutorial overlay for add_expense step */}
      <TutorialOverlay
        isOpen={showExpenseTutorial}
        onClose={() => setShowExpenseTutorial(false)}
        onSkip={handleSkipExpenseTutorial}
        targetSelector="[data-onboarding-add-transaction]"
        title={t('onboarding.expense.tutorialTitle')}
        description={t('onboarding.expense.tutorialDescription')}
        step={3}
        totalSteps={4}
        showNext={false}
        position="bottom"
      />

      {/* Tutorial overlay for features_tour step */}
      <TutorialOverlay
        isOpen={showFeaturesTour}
        onClose={() => setShowFeaturesTour(false)}
        onNext={handleFeaturesTourNext}
        onSkip={handleSkipFeaturesTour}
        targetSelector="[data-onboarding-features]"
        title={t('onboarding.features.tutorialTitle')}
        description={t('onboarding.features.tutorialDescription')}
        step={4}
        totalSteps={4}
        showNext={true}
        nextLabel={t('onboarding.complete')}
        position="bottom"
      />

      {/* Resume tour FAB if user dismissed but still onboarding */}
      {isOnboarding && (currentStep === 'add_expense' || currentStep === 'features_tour') && tutorialDismissed && (
        <ResumeTourFAB onClick={handleResumeTour} />
      )}
    </>
  )
}
