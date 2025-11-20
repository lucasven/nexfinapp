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
import { useTranslations, useLocale } from 'next-intl'
import { trackEvent, identifyUser } from "@/lib/analytics/tracker"
import { AnalyticsEvent } from "@/lib/analytics/events"
import { getUserAnalyticsProperties } from "@/lib/actions/analytics"
import { Badge } from "@/components/ui/badge"
import { Loader2 } from "lucide-react"

export default function SignupPage() {
  const t = useTranslations()
  const locale = useLocale()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)
  const [isInvited, setIsInvited] = useState(false)
  const [hasSession, setHasSession] = useState(false)

  // Check for invitation token and existing session on mount
  useEffect(() => {
    const checkSession = async () => {
      const supabase = getSupabaseBrowserClient()
      
      // Check if there's an access_token in the URL hash (from invitation)
      const hashParams = new URLSearchParams(window.location.hash.substring(1))
      const accessToken = hashParams.get('access_token')
      const refreshToken = hashParams.get('refresh_token')
      
      console.log('URL tokens:', { hasAccessToken: !!accessToken, hasRefreshToken: !!refreshToken })
      
      // If we have tokens in the URL, manually set the session
      if (accessToken && refreshToken) {
        console.log('Setting session from URL tokens...')
        const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        })
        
        if (sessionError) {
          console.error('Error setting session:', sessionError)
        } else {
          console.log('Session set successfully:', sessionData.session?.user?.email)
        }
      }
      
      // Now check for the session
      const { data: { session } } = await supabase.auth.getSession()
      
      console.log('Session check:', { 
        hasSession: !!session, 
        email: session?.user?.email,
        metadata: session?.user?.user_metadata 
      })
      
      if (session?.user) {
        // User has an active session (from invitation link)
        setIsInvited(true)
        setHasSession(true)
        setEmail(session.user.email || "")
        
        console.log('Session detected! Setting hasSession=true')
        
        // Clean up the URL (remove tokens from hash)
        if (accessToken) {
          window.history.replaceState({}, document.title, window.location.pathname + window.location.search)
        }
        
        // Check if this is from an invitation
        const invitedVia = session.user.user_metadata?.invited_by
        if (invitedVia === "admin") {
          setIsInvited(true)
        }
      } else {
        console.log('No session detected')
        // Check URL parameters for token
        const token = searchParams.get('token')
        const type = searchParams.get('type')
        
        if (token && type === 'invite') {
          setIsInvited(true)
        }
      }
    }
    
    checkSession()
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
      
      // If user has a session (invited user), update their password
      if (hasSession) {
        const { error: updateError } = await supabase.auth.updateUser({
          password: password
        })

        if (updateError) throw updateError

        // Get current user session
        const { data: { user } } = await supabase.auth.getUser()

        if (user) {
          // Get enhanced user properties for analytics (non-blocking)
          try {
            const enhancedProperties = await getUserAnalyticsProperties()

            // Identify user in PostHog with comprehensive properties
            if (enhancedProperties) {
              identifyUser(user.id, enhancedProperties)
            }

            // Track signup completion
            trackEvent(AnalyticsEvent.USER_SIGNED_UP, {
              auth_method: 'email_password',
              source: 'beta_invitation',
              locale: enhancedProperties?.locale || locale,
            })

            // Track invitation acceptance
            trackEvent(AnalyticsEvent.USER_ACCEPTED_BETA_INVITATION, {
              email,
            })
          } catch (analyticsError) {
            // Log but don't block signup if analytics fails
            console.warn('Failed to fetch analytics properties:', analyticsError)

            // Track with basic info
            identifyUser(user.id, { email: user.email })
            trackEvent(AnalyticsEvent.USER_SIGNED_UP, {
              auth_method: 'email_password',
              source: 'beta_invitation',
              locale: locale,
            })
            trackEvent(AnalyticsEvent.USER_ACCEPTED_BETA_INVITATION, {
              email,
            })
          }
        }

        setSuccess(true)
        setTimeout(() => {
          router.push("/") // Go to home page
        }, 2000)
      } else {
        // Regular signup flow - check beta status first
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
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: process.env.NEXT_PUBLIC_APP_URL || window.location.origin,
          },
        })

        if (error) throw error

        // If user was created successfully, identify and track
        if (data.user) {
          // Identify user in PostHog
          identifyUser(data.user.id, {
            email: data.user.email,
            locale: locale,
            is_admin: false,
            account_created_at: data.user.created_at,
          })

          // Track signup event
          trackEvent(AnalyticsEvent.USER_SIGNED_UP, {
            auth_method: 'email_password',
            source: isInvited ? 'beta_invitation' : 'beta_approved',
            locale: locale,
          })

          // Track invitation acceptance if this was an invited user
          if (isInvited) {
            trackEvent(AnalyticsEvent.USER_ACCEPTED_BETA_INVITATION, {
              email,
            })
          }
        }

        setSuccess(true)
        setTimeout(() => {
          router.push("/auth/login")
        }, 2000)
      }
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
          <CardTitle className="text-2xl">
            {hasSession ? "Complete Your Registration" : t('auth.signup')}
          </CardTitle>
          <CardDescription>
            {hasSession 
              ? "Set your password to complete your account setup" 
              : t('auth.signUpWithEmail')
            }
          </CardDescription>
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
                {hasSession 
                  ? "Password set successfully! Redirecting..." 
                  : "Account created successfully! Redirecting to login..."
                }
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
                disabled={hasSession || (isInvited && !!email)}
              />
              {hasSession && (
                <p className="text-xs text-muted-foreground">
                  Email from your invitation
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">
                {hasSession ? "Set Your Password" : t('auth.password')}
              </Label>
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
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {loading ? t('common.loading') : (hasSession ? "Set Password" : t('auth.signup'))}
            </Button>
            {!hasSession && (
              <p className="text-sm text-center text-muted-foreground">
                {t('auth.haveAccount')}{" "}
                <Link href="/auth/login" className="text-primary hover:underline">
                  {t('auth.login')}
                </Link>
              </p>
            )}
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
