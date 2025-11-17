"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Sparkles, CheckCircle2 } from "lucide-react"
import { WhatsAppNumberDialog } from "@/components/whatsapp-number-dialog"
import { getAuthorizedNumbers } from "@/lib/actions/profile"
import { advanceOnboardingStep } from "@/lib/actions/onboarding"
import { trackEvent } from "@/lib/analytics/tracker"
import { AnalyticsEvent, AnalyticsProperty } from "@/lib/analytics/events"
import { useTranslations } from 'next-intl'
import type { AuthorizedWhatsAppNumber } from "@/lib/types"

export default function WelcomePage() {
  const t = useTranslations()
  const router = useRouter()
  const [whatsappNumbers, setWhatsappNumbers] = useState<AuthorizedWhatsAppNumber[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    // Track page view
    trackEvent(AnalyticsEvent.ONBOARDING_STARTED, {
      [AnalyticsProperty.ONBOARDING_TOTAL_STEPS]: 4,
    })

    loadWhatsAppNumbers()
  }, [])

  const loadWhatsAppNumbers = async () => {
    try {
      const numbers = await getAuthorizedNumbers()
      setWhatsappNumbers(numbers)
    } catch (error) {
      console.error("Error loading WhatsApp numbers:", error)
    }
  }

  const handleGetStarted = async () => {
    setLoading(true)
    try {
      // Advance to next step (add_category)
      await advanceOnboardingStep('welcome')

      // Redirect to categories page where tutorial will take over
      router.push('/categories')
      router.refresh()
    } catch (error) {
      console.error("Error advancing onboarding:", error)
      setLoading(false)
    }
  }

  const hasWhatsApp = whatsappNumbers.length > 0

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20 flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl">
        <CardContent className="pt-8 pb-8">
          {/* Welcome Icon */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
              <Sparkles className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-3xl font-bold mb-2">{t('onboarding.welcome.heading')}</h1>
            <p className="text-muted-foreground text-lg">
              {t('onboarding.welcome.intro')}
            </p>
          </div>

          {/* Features */}
          <div className="space-y-4 mb-8">
            <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/50">
              <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium">{t('onboarding.welcome.feature1Title')}</p>
                <p className="text-sm text-muted-foreground">{t('onboarding.welcome.feature1Desc')}</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/50">
              <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium">{t('onboarding.welcome.feature2Title')}</p>
                <p className="text-sm text-muted-foreground">{t('onboarding.welcome.feature2Desc')}</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/50">
              <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium">{t('onboarding.welcome.feature3Title')}</p>
                <p className="text-sm text-muted-foreground">{t('onboarding.welcome.feature3Desc')}</p>
              </div>
            </div>
          </div>

          {/* WhatsApp Setup */}
          <div className="mb-8 p-6 border rounded-lg bg-card">
            <h3 className="text-lg font-semibold mb-2">{t('onboarding.whatsapp.heading')}</h3>
            <p className="text-sm text-muted-foreground mb-4">
              {t('onboarding.whatsapp.explanation')}
            </p>

            {hasWhatsApp ? (
              <div className="flex items-center gap-2 text-green-600 dark:text-green-400 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <CheckCircle2 className="h-5 w-5" />
                <div>
                  <p className="font-medium">{t('onboarding.whatsapp.connected')}</p>
                  <p className="text-sm">{whatsappNumbers[0].whatsapp_number}</p>
                </div>
              </div>
            ) : (
              <WhatsAppNumberDialog
                onSaved={loadWhatsAppNumbers}
                trigger={
                  <Button size="lg" className="w-full">
                    {t('onboarding.whatsapp.addButton')}
                  </Button>
                }
              />
            )}
          </div>

          {/* Get Started Button */}
          <Button
            onClick={handleGetStarted}
            disabled={loading}
            size="lg"
            className="w-full"
          >
            {loading ? t('common.loading') : t('onboarding.getStarted')}
          </Button>

          {!hasWhatsApp && (
            <p className="text-xs text-center text-muted-foreground mt-4">
              {t('onboarding.whatsapp.instructions')}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
