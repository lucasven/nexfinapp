"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { WhatsAppNumberDialog } from "@/components/whatsapp-number-dialog"
import { CheckCircle2, MessageSquare, Smartphone, ArrowRight, Loader2 } from "lucide-react"
import { useTranslations } from "next-intl"
import { useRouter } from "next/navigation"
import { getProfile } from "@/lib/actions/profile"
import { trackEvent } from "@/lib/analytics/tracker"
import { AnalyticsEvent } from "@/lib/analytics/events"

export default function OnboardingPage() {
  const t = useTranslations()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<any>(null)
  const [whatsappAdded, setWhatsappAdded] = useState(false)
  const [currentStep, setCurrentStep] = useState(1)

  useEffect(() => {
    loadProfile()
  }, [])

  const loadProfile = async () => {
    try {
      const profileData = await getProfile()
      setProfile(profileData)

      // Check if WhatsApp setup is already completed
      if (profileData?.whatsapp_setup_completed) {
        setWhatsappAdded(true)
        setCurrentStep(3)
      }

      // Track onboarding page view
      trackEvent(AnalyticsEvent.ONBOARDING_STARTED, {
        onboarding_step: profileData?.onboarding_step || 'welcome'
      })
    } catch (error) {
      console.error("Failed to load profile:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleWhatsAppAdded = () => {
    setWhatsappAdded(true)
    setCurrentStep(2)
    loadProfile() // Reload to get updated profile

    trackEvent(AnalyticsEvent.ONBOARDING_WHATSAPP_ADDED, {
      onboarding_step: 'whatsapp_setup'
    })
  }

  const handleComplete = () => {
    trackEvent(AnalyticsEvent.ONBOARDING_COMPLETED, {
      onboarding_step: 'complete'
    })

    router.push("/categories")
  }

  const handleSkip = () => {
    trackEvent(AnalyticsEvent.ONBOARDING_SKIPPED, {
      onboarding_step: currentStep === 1 ? 'whatsapp_setup' : 'waiting_for_greeting'
    })

    router.push("/categories")
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  const progress = (currentStep / 3) * 100

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20 p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
            {t('onboarding.welcome.heading', { defaultValue: 'Welcome to Expense Tracker!' })}
          </h1>
          <p className="text-muted-foreground text-lg">
            {t('onboarding.subtitle', { defaultValue: 'Let\'s get you set up in just a few steps' })}
          </p>
        </div>

        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>{t('onboarding.progress', { defaultValue: 'Progress' })}</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        {/* Steps */}
        <div className="grid gap-6">
          {/* Step 1: Connect WhatsApp */}
          <Card className={currentStep === 1 ? "border-primary shadow-lg" : "border-muted"}>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-full ${whatsappAdded ? 'bg-green-100' : 'bg-primary/10'}`}>
                  {whatsappAdded ? (
                    <CheckCircle2 className="h-6 w-6 text-green-600" />
                  ) : (
                    <Smartphone className="h-6 w-6 text-primary" />
                  )}
                </div>
                <div className="flex-1">
                  <CardTitle className="text-xl">
                    {t('onboarding.step1.title', { defaultValue: 'Step 1: Connect Your WhatsApp' })}
                  </CardTitle>
                  <CardDescription>
                    {t('onboarding.step1.description', {
                      defaultValue: 'Add your WhatsApp number to track expenses via chat'
                    })}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            {!whatsappAdded && currentStep === 1 && (
              <CardContent className="space-y-4">
                <div className="bg-muted/50 p-4 rounded-lg space-y-2">
                  <p className="text-sm font-medium">
                    {t('onboarding.step1.benefits.title', { defaultValue: 'Why connect WhatsApp?' })}
                  </p>
                  <ul className="text-sm space-y-1 text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                      <span>{t('onboarding.step1.benefits.1', { defaultValue: 'Track expenses instantly by sending a message' })}</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                      <span>{t('onboarding.step1.benefits.2', { defaultValue: 'Scan receipts using your phone camera' })}</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                      <span>{t('onboarding.step1.benefits.3', { defaultValue: 'Get budget alerts and spending insights' })}</span>
                    </li>
                  </ul>
                </div>

                <WhatsAppNumberDialog
                  trigger={
                    <Button size="lg" className="w-full">
                      <Smartphone className="mr-2 h-5 w-5" />
                      {t('onboarding.step1.button', { defaultValue: 'Add WhatsApp Number' })}
                    </Button>
                  }
                  onSaved={handleWhatsAppAdded}
                />

                <Button variant="ghost" className="w-full" onClick={handleSkip}>
                  {t('onboarding.skipForNow', { defaultValue: 'Skip for now' })}
                </Button>
              </CardContent>
            )}
          </Card>

          {/* Step 2: Wait for Greeting */}
          <Card className={currentStep === 2 ? "border-primary shadow-lg" : "border-muted"}>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-full ${currentStep >= 2 ? 'bg-primary/10' : 'bg-muted'}`}>
                  <MessageSquare className={`h-6 w-6 ${currentStep >= 2 ? 'text-primary' : 'text-muted-foreground'}`} />
                </div>
                <div className="flex-1">
                  <CardTitle className="text-xl">
                    {t('onboarding.step2.title', { defaultValue: 'Step 2: Check Your WhatsApp' })}
                  </CardTitle>
                  <CardDescription>
                    {t('onboarding.step2.description', {
                      defaultValue: 'We\'re sending you a greeting message with instructions'
                    })}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            {currentStep === 2 && (
              <CardContent className="space-y-4">
                <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 p-4 rounded-lg space-y-3">
                  <div className="flex items-start gap-3">
                    <MessageSquare className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                    <div className="space-y-2 flex-1">
                      <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                        {t('onboarding.step2.waiting.title', { defaultValue: 'Message on its way!' })}
                      </p>
                      <p className="text-sm text-blue-700 dark:text-blue-300">
                        {t('onboarding.step2.waiting.description', {
                          defaultValue: 'You should receive a greeting message on WhatsApp within the next minute. It will guide you through using the bot.'
                        })}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium">
                    {t('onboarding.step2.next.title', { defaultValue: 'What happens next?' })}
                  </p>
                  <ul className="text-sm space-y-2 text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <span className="font-semibold text-primary">1.</span>
                      <span>{t('onboarding.step2.next.1', { defaultValue: 'Open the message from our WhatsApp bot' })}</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="font-semibold text-primary">2.</span>
                      <span>{t('onboarding.step2.next.2', { defaultValue: 'Try sending your first expense (e.g., "Spent $50 on groceries")' })}</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="font-semibold text-primary">3.</span>
                      <span>{t('onboarding.step2.next.3', { defaultValue: 'Return here to view your dashboard and set up budgets' })}</span>
                    </li>
                  </ul>
                </div>

                <Button size="lg" className="w-full" onClick={() => setCurrentStep(3)}>
                  {t('onboarding.step2.button', { defaultValue: 'I got the message, continue' })}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>

                <Button variant="ghost" className="w-full" onClick={handleSkip}>
                  {t('onboarding.continueToApp', { defaultValue: 'Continue to app' })}
                </Button>
              </CardContent>
            )}
          </Card>

          {/* Step 3: Complete */}
          <Card className={currentStep === 3 ? "border-primary shadow-lg" : "border-muted"}>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-full ${currentStep === 3 ? 'bg-green-100' : 'bg-muted'}`}>
                  <CheckCircle2 className={`h-6 w-6 ${currentStep === 3 ? 'text-green-600' : 'text-muted-foreground'}`} />
                </div>
                <div className="flex-1">
                  <CardTitle className="text-xl">
                    {t('onboarding.step3.title', { defaultValue: 'All Set!' })}
                  </CardTitle>
                  <CardDescription>
                    {t('onboarding.step3.description', {
                      defaultValue: 'You\'re ready to start tracking your expenses'
                    })}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            {currentStep === 3 && (
              <CardContent className="space-y-4">
                <div className="bg-gradient-to-r from-green-50 to-blue-50 dark:from-green-950/30 dark:to-blue-950/30 p-6 rounded-lg text-center space-y-3">
                  <CheckCircle2 className="h-12 w-12 text-green-600 mx-auto" />
                  <div>
                    <p className="font-semibold text-lg">
                      {t('onboarding.step3.complete.title', { defaultValue: 'Setup Complete!' })}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {t('onboarding.step3.complete.description', {
                        defaultValue: 'You can now track expenses via WhatsApp or the web dashboard'
                      })}
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  <p className="text-sm font-medium">
                    {t('onboarding.step3.suggestions.title', { defaultValue: 'Suggested next steps:' })}
                  </p>
                  <div className="grid gap-2">
                    <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
                      <CheckCircle2 className="h-5 w-5 text-primary mt-0.5" />
                      <div>
                        <p className="text-sm font-medium">
                          {t('onboarding.step3.suggestions.1.title', { defaultValue: 'Set up budgets' })}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {t('onboarding.step3.suggestions.1.description', { defaultValue: 'Create monthly budgets for different categories' })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
                      <CheckCircle2 className="h-5 w-5 text-primary mt-0.5" />
                      <div>
                        <p className="text-sm font-medium">
                          {t('onboarding.step3.suggestions.2.title', { defaultValue: 'Customize categories' })}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {t('onboarding.step3.suggestions.2.description', { defaultValue: 'Add categories that match your spending habits' })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
                      <CheckCircle2 className="h-5 w-5 text-primary mt-0.5" />
                      <div>
                        <p className="text-sm font-medium">
                          {t('onboarding.step3.suggestions.3.title', { defaultValue: 'Try the WhatsApp bot' })}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {t('onboarding.step3.suggestions.3.description', { defaultValue: 'Send your first expense via WhatsApp' })}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <Button size="lg" className="w-full" onClick={handleComplete}>
                  {t('onboarding.step3.button', { defaultValue: 'Go to Dashboard' })}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </CardContent>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
