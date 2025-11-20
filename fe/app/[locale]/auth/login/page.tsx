"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import { Link } from "@/lib/localization/link"
import { useTranslations, useLocale } from 'next-intl'
import { Loader2 } from "lucide-react"
import { identifyUser, trackEvent } from "@/lib/analytics/tracker"
import { AnalyticsEvent } from "@/lib/analytics/events"
import { getUserAnalyticsProperties } from "@/lib/actions/analytics"

export default function LoginPage() {
  const t = useTranslations()
  const locale = useLocale()
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")

    try {
      const supabase = getSupabaseBrowserClient()
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) throw error

      // Get enhanced user properties for analytics (non-blocking)
      try {
        const enhancedProperties = await getUserAnalyticsProperties()

        // Identify user in PostHog with comprehensive properties
        if (enhancedProperties) {
          identifyUser(data.user.id, enhancedProperties)
        }

        // Track login event
        trackEvent(AnalyticsEvent.USER_LOGGED_IN, {
          auth_method: 'email_password',
          locale: enhancedProperties?.locale || locale,
          has_whatsapp_connected: enhancedProperties?.has_whatsapp_connected || false,
          total_transactions: enhancedProperties?.total_transactions || 0,
        })
      } catch (analyticsError) {
        // Log but don't block login if analytics fails
        console.warn('Failed to fetch analytics properties:', analyticsError)

        // Track with basic info
        identifyUser(data.user.id, { email: data.user.email })
        trackEvent(AnalyticsEvent.USER_LOGGED_IN, {
          auth_method: 'email_password',
          locale: locale,
        })
      }

      router.push("/")
      router.refresh()
    } catch (err: any) {
      setError(err.message || "Failed to login")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">{t('auth.login')}</CardTitle>
          <CardDescription>{t('auth.signInWithEmail')}</CardDescription>
        </CardHeader>
        <form onSubmit={handleLogin}>
          <CardContent className="space-y-4">
            {error && <div className="bg-red-50 text-red-600 p-3 rounded-md text-sm">{error}</div>}

            <div className="space-y-2">
              <Label htmlFor="email">{t('auth.email')}</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">{t('auth.password')}</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {loading ? t('common.loading') : t('auth.login')}
            </Button>
            <p className="text-sm text-center text-muted-foreground">
              {t('auth.noAccount')}{" "}
              <Link href="/auth/signup" className="text-primary hover:underline">
                {t('auth.signup')}
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
