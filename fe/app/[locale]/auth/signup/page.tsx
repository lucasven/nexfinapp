"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { useRouter, useSearchParams } from "next/navigation"
import { Link } from "@/lib/localization/link"
import { useTranslations } from 'next-intl'
import { trackEvent } from "@/lib/analytics/tracker"
import { AnalyticsEvent } from "@/lib/analytics/events"
import { Badge } from "@/components/ui/badge"

export default function SignupPage() {
  const t = useTranslations()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)
  const [isInvited, setIsInvited] = useState(false)

  // Check for invitation token on mount
  useEffect(() => {
    const token = searchParams.get('token')
    const type = searchParams.get('type')
    
    if (token && type === 'invite') {
      setIsInvited(true)
      
      // Try to extract email from token (Supabase includes it in the hash)
      const supabase = getSupabaseBrowserClient()
      supabase.auth.getSession().then(({ data }) => {
        if (data.session?.user?.email) {
          setEmail(data.session.user.email)
        }
      })
    }
  }, [searchParams])

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")
    setSuccess(false)

    if (password !== confirmPassword) {
      setError("Passwords do not match")
      setLoading(false)
      return
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters")
      setLoading(false)
      return
    }

    try {
      const supabase = getSupabaseBrowserClient()
      
      // Check beta status before allowing signup
      const { data: betaSignup, error: betaError } = await supabase
        .from("beta_signups")
        .select("status")
        .eq("email", email)
        .single()

      if (betaError || !betaSignup || betaSignup.status !== "approved") {
        setError("Beta access required. Please join our waitlist at the landing page.")
        setLoading(false)
        return
      }

      // Proceed with signup
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL || window.location.origin,
        },
      })

      if (error) throw error

      // Track invitation acceptance if this was an invited user
      if (isInvited) {
        trackEvent(AnalyticsEvent.USER_ACCEPTED_BETA_INVITATION, {
          email,
        })
      }

      setSuccess(true)
      setTimeout(() => {
        router.push("/auth/login")
      }, 2000)
    } catch (err: any) {
      setError(err.message || "Failed to sign up")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">{t('auth.signup')}</CardTitle>
          <CardDescription>{t('auth.signUpWithEmail')}</CardDescription>
          {isInvited && (
            <div className="mt-2">
              <Badge variant="default" className="bg-blue-600">Beta Invitation</Badge>
            </div>
          )}
        </CardHeader>
        <form onSubmit={handleSignup}>
          <CardContent className="space-y-4">
            {error && <div className="bg-red-50 text-red-600 p-3 rounded-md text-sm">{error}</div>}

            {success && (
              <div className="bg-green-50 text-green-600 p-3 rounded-md text-sm">
                Account created successfully! Redirecting to login...
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">{t('auth.email')}</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isInvited && !!email}
              />
              {isInvited && email && (
                <p className="text-xs text-muted-foreground">
                  Email pre-filled from your invitation
                </p>
              )}
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

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">{t('auth.confirmPassword')}</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            <Button type="submit" className="w-full" disabled={loading || success}>
              {loading ? t('common.loading') : t('auth.signup')}
            </Button>
            <p className="text-sm text-center text-muted-foreground">
              {t('auth.haveAccount')}{" "}
              <Link href="/auth/login" className="text-primary hover:underline">
                {t('auth.login')}
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
