"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { Link } from "@/lib/localization/link"
import { useTranslations, useLocale } from "next-intl"
import { ArrowLeft, Mail, Loader2, CheckCircle2 } from "lucide-react"
import { trackEvent } from "@/lib/analytics/tracker"
import { AnalyticsEvent } from "@/lib/analytics/events"

export default function ForgotPasswordPage() {
  const t = useTranslations()
  const locale = useLocale()
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")
    setSuccess(false)

    if (!email) {
      setError(t("auth.emailRequired", { defaultValue: "Email is required" }))
      setLoading(false)
      return
    }

    try {
      const supabase = getSupabaseBrowserClient()

      // Get the app URL with locale
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin
      const redirectUrl = `${appUrl}/${locale}/auth/reset-password`

      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: redirectUrl,
      })

      if (resetError) throw resetError

      // Track password reset request
      trackEvent(AnalyticsEvent.PASSWORD_RESET_REQUESTED, {
        email,
        locale,
      })

      setSuccess(true)
    } catch (err: any) {
      console.error("Password reset error:", err)
      setError(
        err.message ||
          t("auth.passwordResetError", {
            defaultValue: "Failed to send reset email. Please try again.",
          })
      )

      // Track error
      trackEvent(AnalyticsEvent.PASSWORD_RESET_FAILED, {
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
            {t("auth.forgotPassword.title", { defaultValue: "Forgot Password?" })}
          </CardTitle>
          <CardDescription>
            {t("auth.forgotPassword.description", {
              defaultValue: "Enter your email and we'll send you a link to reset your password",
            })}
          </CardDescription>
        </CardHeader>

        {success ? (
          <CardContent className="space-y-4">
            <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900 p-4 rounded-lg">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 mt-0.5 shrink-0" />
                <div className="space-y-2">
                  <p className="text-sm font-medium text-green-900 dark:text-green-100">
                    {t("auth.forgotPassword.success.title", { defaultValue: "Check your email!" })}
                  </p>
                  <p className="text-sm text-green-800 dark:text-green-200">
                    {t.rich("auth.forgotPassword.success.description", {
                      defaultValue:
                        "We've sent a password reset link to {email}. Click the link in the email to create a new password.",
                      email: email,
                    })}
                  </p>
                  <p className="text-xs text-green-700 dark:text-green-300 mt-2">
                    {t("auth.forgotPassword.success.note", {
                      defaultValue: "Didn't receive the email? Check your spam folder or try again.",
                    })}
                  </p>
                </div>
              </div>
            </div>

            <Button variant="outline" className="w-full" onClick={() => setSuccess(false)}>
              <Mail className="mr-2 h-4 w-4" />
              {t("auth.forgotPassword.sendAnother", { defaultValue: "Send another email" })}
            </Button>
          </CardContent>
        ) : (
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              {error && (
                <div className="bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 p-3 rounded-md text-sm">
                  {error}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">{t("auth.email", { defaultValue: "Email" })}</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder={t("auth.emailPlaceholder", { defaultValue: "you@example.com" })}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={loading}
                  autoFocus
                />
              </div>

              <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 p-3 rounded-lg">
                <p className="text-xs text-blue-800 dark:text-blue-200">
                  {t("auth.forgotPassword.info", {
                    defaultValue:
                      "You'll receive an email with a secure link to reset your password. The link expires in 1 hour.",
                  })}
                </p>
              </div>
            </CardContent>

            <CardFooter className="flex flex-col gap-4">
              <Button type="submit" className="w-full" disabled={loading || !email}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {loading
                  ? t("common.sending", { defaultValue: "Sending..." })
                  : t("auth.forgotPassword.sendLink", { defaultValue: "Send Reset Link" })}
              </Button>

              <Link
                href="/auth/login"
                className="flex items-center justify-center text-sm text-muted-foreground hover:text-primary transition-colors"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                {t("auth.backToLogin", { defaultValue: "Back to login" })}
              </Link>
            </CardFooter>
          </form>
        )}
      </Card>
    </div>
  )
}
