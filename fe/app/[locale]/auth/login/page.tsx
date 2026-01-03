"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import { Link } from "@/lib/localization/link"
import { useTranslations, useLocale } from 'next-intl'
import { Loader2, Mail, KeyRound, CheckCircle2 } from "lucide-react"
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
  const [magicLinkSent, setMagicLinkSent] = useState(false)
  const [magicLinkEmail, setMagicLinkEmail] = useState("")

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

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")
    setMagicLinkSent(false)

    try {
      const supabase = getSupabaseBrowserClient()

      // Get the app URL with locale for callback
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin
      const redirectUrl = `${appUrl}/${locale}/auth/callback`

      const { error } = await supabase.auth.signInWithOtp({
        email: magicLinkEmail,
        options: {
          emailRedirectTo: redirectUrl,
        },
      })

      if (error) throw error

      // Track magic link request
      trackEvent(AnalyticsEvent.MAGIC_LINK_REQUESTED, {
        email: magicLinkEmail,
        locale,
      })

      setMagicLinkSent(true)
    } catch (err: any) {
      setError(
        err.message ||
          t("auth.magicLinkError", {
            defaultValue: "Failed to send magic link. Please try again.",
          })
      )

      // Track error
      trackEvent(AnalyticsEvent.MAGIC_LINK_LOGIN_FAILED, {
        error: err.message,
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">
            {t("auth.login", { defaultValue: "Login" })}
          </CardTitle>
          <CardDescription>
            {t("auth.loginDescription", {
              defaultValue: "Choose your preferred login method",
            })}
          </CardDescription>
        </CardHeader>

        <Tabs defaultValue="password" className="w-full" onValueChange={() => setError("")}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="password" className="flex items-center gap-2">
              <KeyRound className="h-4 w-4" />
              {t("auth.password", { defaultValue: "Password" })}
            </TabsTrigger>
            <TabsTrigger value="magic-link" className="flex items-center gap-2">
              <Mail className="h-4 w-4" />
              {t("auth.magicLink.label", { defaultValue: "Magic Link" })}
            </TabsTrigger>
          </TabsList>

          {/* Password Login Tab */}
          <TabsContent value="password">
            <form onSubmit={handleLogin}>
              <CardContent className="space-y-4">
                {error && (
                  <div className="bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 p-3 rounded-md text-sm">
                    {error}
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="email">
                    {t("auth.email", { defaultValue: "Email" })}
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder={t("auth.emailPlaceholder", {
                      defaultValue: "you@example.com",
                    })}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={loading}
                    autoFocus
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">
                      {t("auth.password", { defaultValue: "Password" })}
                    </Label>
                    <Link
                      href="/auth/forgot-password"
                      className="text-xs text-primary hover:underline"
                      tabIndex={-1}
                    >
                      {t("auth.forgotPassword.label", { defaultValue: "Forgot password?" })}
                    </Link>
                  </div>
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={loading}
                  />
                </div>
              </CardContent>

              <CardFooter className="flex flex-col gap-4">
                <Button type="submit" className="w-full" disabled={loading || !email || !password}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {loading
                    ? t("common.loading", { defaultValue: "Loading..." })
                    : t("auth.login", { defaultValue: "Login" })}
                </Button>

                <p className="text-sm text-center text-muted-foreground">
                  {t("auth.noAccount", { defaultValue: "Don't have an account?" })}{" "}
                  <Link href="/auth/signup" className="text-primary hover:underline">
                    {t("auth.signup", { defaultValue: "Sign up" })}
                  </Link>
                </p>
              </CardFooter>
            </form>
          </TabsContent>

          {/* Magic Link Tab */}
          <TabsContent value="magic-link">
            {magicLinkSent ? (
              <CardContent className="space-y-4">
                <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900 p-4 rounded-lg">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 mt-0.5 shrink-0" />
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-green-900 dark:text-green-100">
                        {t("auth.magicLink.success.title", {
                          defaultValue: "Check your email!",
                        })}
                      </p>
                      <p className="text-sm text-green-800 dark:text-green-200">
                        {t.rich("auth.magicLink.success.description", {
                          defaultValue:
                            "We've sent a magic link to {email}. Click the link in the email to log in instantly.",
                          email: magicLinkEmail,
                        })}
                      </p>
                      <p className="text-xs text-green-700 dark:text-green-300 mt-2">
                        {t("auth.magicLink.success.note", {
                          defaultValue:
                            "The link will expire in 1 hour. Didn't receive it? Check your spam folder.",
                        })}
                      </p>
                    </div>
                  </div>
                </div>

                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setMagicLinkSent(false)}
                >
                  <Mail className="mr-2 h-4 w-4" />
                  {t("auth.magicLink.sendAnother", { defaultValue: "Send another link" })}
                </Button>
              </CardContent>
            ) : (
              <form onSubmit={handleMagicLink}>
                <CardContent className="space-y-4">
                  {error && (
                    <div className="bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 p-3 rounded-md text-sm">
                      {error}
                    </div>
                  )}

                  <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 p-3 rounded-lg">
                    <p className="text-xs text-blue-800 dark:text-blue-200">
                      {t("auth.magicLink.info", {
                        defaultValue:
                          "We'll send you a secure login link via email. No password needed!",
                      })}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="magic-email">
                      {t("auth.email", { defaultValue: "Email" })}
                    </Label>
                    <Input
                      id="magic-email"
                      type="email"
                      placeholder={t("auth.emailPlaceholder", {
                        defaultValue: "you@example.com",
                      })}
                      value={magicLinkEmail}
                      onChange={(e) => setMagicLinkEmail(e.target.value)}
                      required
                      disabled={loading}
                      autoFocus
                    />
                  </div>
                </CardContent>

                <CardFooter className="flex flex-col gap-4">
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={loading || !magicLinkEmail}
                  >
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {loading
                      ? t("common.sending", { defaultValue: "Sending..." })
                      : t("auth.magicLink.sendLink", { defaultValue: "Send Magic Link" })}
                  </Button>

                  <p className="text-sm text-center text-muted-foreground">
                    {t("auth.noAccount", { defaultValue: "Don't have an account?" })}{" "}
                    <Link href="/auth/signup" className="text-primary hover:underline">
                      {t("auth.signup", { defaultValue: "Sign up" })}
                    </Link>
                  </p>
                </CardFooter>
              </form>
            )}
          </TabsContent>
        </Tabs>
      </Card>
    </div>
  )
}
