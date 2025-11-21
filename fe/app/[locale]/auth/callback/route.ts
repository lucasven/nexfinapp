import { NextRequest, NextResponse } from "next/server"
import { getSupabaseServerClient } from "@/lib/supabase/server"
import { trackServerEvent, identifyServerUser } from "@/lib/analytics/server-tracker"
import { AnalyticsEvent } from "@/lib/analytics/events"
import { getUserAnalyticsProperties } from "@/lib/actions/analytics"

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get("code")
  const locale = requestUrl.pathname.split("/")[1] || "en"

  if (code) {
    const supabase = await getSupabaseServerClient()

    // Exchange the code for a session
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (error) {
      console.error("Magic link auth error:", error)

      // Track failed magic link login (use anonymous ID since user auth failed)
      await trackServerEvent("anonymous", AnalyticsEvent.MAGIC_LINK_LOGIN_FAILED, {
        error: error.message,
      })

      // Redirect to login with error
      return NextResponse.redirect(
        new URL(`/${locale}/auth/login?error=auth_failed`, requestUrl.origin)
      )
    }

    if (data.user) {
      // Get enhanced user properties for analytics (non-blocking)
      try {
        const enhancedProperties = await getUserAnalyticsProperties()

        // Identify user in PostHog
        if (enhancedProperties) {
          await identifyServerUser(data.user.id, enhancedProperties)
        }

        // Track successful magic link login
        await trackServerEvent(data.user.id, AnalyticsEvent.MAGIC_LINK_LOGIN_SUCCESS, {
          auth_method: "magic_link",
          locale: enhancedProperties?.locale || locale,
          has_whatsapp_connected: enhancedProperties?.has_whatsapp_connected || false,
          total_transactions: enhancedProperties?.total_transactions || 0,
        })
      } catch (analyticsError) {
        // Log but don't block login if analytics fails
        console.warn("Failed to fetch analytics properties:", analyticsError)

        // Track with basic info
        await identifyServerUser(data.user.id, { email: data.user.email })
        await trackServerEvent(data.user.id, AnalyticsEvent.MAGIC_LINK_LOGIN_SUCCESS, {
          auth_method: "magic_link",
          locale: locale,
        })
      }

      // Redirect to home page
      return NextResponse.redirect(new URL(`/${locale}`, requestUrl.origin))
    }
  }

  // If no code or user, redirect to login
  return NextResponse.redirect(
    new URL(`/${locale}/auth/login`, requestUrl.origin)
  )
}
