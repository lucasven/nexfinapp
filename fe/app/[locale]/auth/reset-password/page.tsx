"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import { Link } from "@/lib/localization/link"
import { useTranslations } from "next-intl"
import { Loader2, CheckCircle2, AlertCircle, Eye, EyeOff } from "lucide-react"
import { trackEvent } from "@/lib/analytics/tracker"
import { AnalyticsEvent } from "@/lib/analytics/events"

export default function ResetPasswordPage() {
  const t = useTranslations()
  const router = useRouter()
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [hasValidToken, setHasValidToken] = useState(false)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    checkSession()
  }, [])

  const checkSession = async () => {
    try {
      const supabase = getSupabaseBrowserClient()

      // Check if there's a valid session (user clicked the reset link)
      const { data: { session }, error } = await supabase.auth.getSession()

      if (error || !session) {
        setHasValidToken(false)
        setError(
          t("auth.resetPassword.invalidToken", {
            defaultValue: "Invalid or expired reset link. Please request a new one.",
          })
        )
      } else {
        setHasValidToken(true)
      }
    } catch (err) {
      console.error("Session check error:", err)
      setHasValidToken(false)
      setError(
        t("auth.resetPassword.sessionError", {
          defaultValue: "Unable to verify reset link. Please try again.",
        })
      )
    } finally {
      setChecking(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")

    if (password.length < 6) {
      setError(
        t("auth.passwordTooShort", { defaultValue: "Password must be at least 6 characters" })
      )
      setLoading(false)
      return
    }

    if (password !== confirmPassword) {
      setError(t("auth.passwordMismatch", { defaultValue: "Passwords do not match" }))
      setLoading(false)
      return
    }

    try {
      const supabase = getSupabaseBrowserClient()

      const { error: updateError } = await supabase.auth.updateUser({
        password: password,
      })

      if (updateError) throw updateError

      // Track successful password reset
      trackEvent(AnalyticsEvent.PASSWORD_RESET_COMPLETED, {
        method: "email_link",
      })

      setSuccess(true)

      // Redirect to login after 3 seconds
      setTimeout(() => {
        router.push("/auth/login")
      }, 3000)
    } catch (err: any) {
      console.error("Password reset error:", err)
      setError(
        err.message ||
          t("auth.resetPassword.error", {
            defaultValue: "Failed to reset password. Please try again.",
          })
      )

      // Track error
      trackEvent(AnalyticsEvent.PASSWORD_RESET_FAILED, {
        error: err.message,
        step: "update",
      })
    } finally {
      setLoading(false)
    }
  }

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!hasValidToken) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertCircle className="h-6 w-6 text-destructive" />
              <CardTitle className="text-2xl">
                {t("auth.resetPassword.invalidTitle", { defaultValue: "Invalid Reset Link" })}
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">{error}</p>
            <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 p-3 rounded-lg">
              <p className="text-sm text-blue-800 dark:text-blue-200">
                {t("auth.resetPassword.linkExpired", {
                  defaultValue:
                    "Password reset links expire after 1 hour for security. Please request a new link.",
                })}
              </p>
            </div>
          </CardContent>
          <CardFooter>
            <Link href="/auth/forgot-password" className="w-full">
              <Button className="w-full">
                {t("auth.resetPassword.requestNew", { defaultValue: "Request New Link" })}
              </Button>
            </Link>
          </CardFooter>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">
            {t("auth.resetPassword.title", { defaultValue: "Reset Password" })}
          </CardTitle>
          <CardDescription>
            {t("auth.resetPassword.description", {
              defaultValue: "Choose a new password for your account",
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
                    {t("auth.resetPassword.success.title", {
                      defaultValue: "Password reset successful!",
                    })}
                  </p>
                  <p className="text-sm text-green-800 dark:text-green-200">
                    {t("auth.resetPassword.success.description", {
                      defaultValue:
                        "Your password has been updated. Redirecting you to login...",
                    })}
                  </p>
                </div>
              </div>
            </div>
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
                <Label htmlFor="password">
                  {t("auth.newPassword", { defaultValue: "New Password" })}
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={loading}
                    autoFocus
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                    onClick={() => setShowPassword(!showPassword)}
                    disabled={loading}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    )}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("auth.passwordRequirement", {
                    defaultValue: "Must be at least 6 characters",
                  })}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">
                  {t("auth.confirmPassword", { defaultValue: "Confirm Password" })}
                </Label>
                <Input
                  id="confirmPassword"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>
            </CardContent>

            <CardFooter className="flex flex-col gap-4">
              <Button
                type="submit"
                className="w-full"
                disabled={loading || !password || !confirmPassword}
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {loading
                  ? t("common.updating", { defaultValue: "Updating..." })
                  : t("auth.resetPassword.button", { defaultValue: "Reset Password" })}
              </Button>

              <Link
                href="/auth/login"
                className="text-sm text-center text-muted-foreground hover:text-primary transition-colors"
              >
                {t("auth.backToLogin", { defaultValue: "Back to login" })}
              </Link>
            </CardFooter>
          </form>
        )}
      </Card>
    </div>
  )
}
