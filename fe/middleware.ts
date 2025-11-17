import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import createMiddleware from 'next-intl/middleware'
import { locales, defaultLocale } from './i18n/routing'
import { detectBrowserLocale } from './lib/localization/config'

// Create the next-intl middleware
const intlMiddleware = createMiddleware({
  locales,
  defaultLocale,
  localePrefix: 'always'
})

export async function middleware(request: NextRequest) {
  // Handle PostHog proxy requests first
  if (request.nextUrl.pathname.startsWith('/ingest')) {
    const url = request.nextUrl.clone()

    // Rewrite to PostHog servers
    if (url.pathname.startsWith('/ingest/static/')) {
      url.href = `https://us-assets.i.posthog.com${url.pathname.replace('/ingest', '')}`
    } else {
      url.href = `https://us.i.posthog.com${url.pathname.replace('/ingest', '')}${url.search}`
    }

    return NextResponse.rewrite(url)
  }

  // Skip locale middleware for API routes, but still handle Supabase auth
  if (request.nextUrl.pathname.startsWith('/api')) {
    const response = NextResponse.next()

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
            cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
          },
        },
      },
    )

    // This will refresh the auth session if needed
    await supabase.auth.getUser()

    return response
  }

  // Get locale from cookie or detect from browser
  const LOCALE_COOKIE = 'NEXT_LOCALE'
  const cookieLocale = request.cookies.get(LOCALE_COOKIE)?.value
  const browserLocale = detectBrowserLocale(request.headers.get('accept-language') || undefined)
  const detectedLocale = cookieLocale || browserLocale

  // Step 1: Use the default intl middleware
  const response = intlMiddleware(request)
  
  // Step 2: Set up Supabase client with the response
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    },
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Get the pathname without locale prefix
  const pathname = request.nextUrl.pathname
  const pathnameWithoutLocale = pathname.replace(/^\/(en|pt-br)/, '') || '/'

  // Public routes that don't require authentication
  const publicRoutes = ['/auth', '/landing']
  const isPublicRoute = publicRoutes.some(route => pathnameWithoutLocale.startsWith(route))

  // Redirect to login if not authenticated and trying to access protected routes
  if (!user && !isPublicRoute) {
    const locale = detectedLocale && locales.includes(detectedLocale as any) ? detectedLocale : defaultLocale
    return NextResponse.redirect(new URL(`/${locale}/auth/login`, request.url))
  }

  // Redirect to home if authenticated and trying to access auth pages
  if (user && pathnameWithoutLocale.startsWith('/auth')) {
    const locale = detectedLocale && locales.includes(detectedLocale as any) ? detectedLocale : defaultLocale
    return NextResponse.redirect(new URL(`/${locale}`, request.url))
  }

  // Set locale cookie if not already set
  if (!cookieLocale && detectedLocale) {
    response.cookies.set(LOCALE_COOKIE, detectedLocale, {
      path: '/',
      maxAge: 365 * 24 * 60 * 60, // 1 year
    })
  }

  // If user is authenticated, fetch their locale preference and onboarding status from database
  if (user) {
    try {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('locale, onboarding_completed, onboarding_step')
        .eq('user_id', user.id)
        .single()

      if (profile?.locale && profile.locale !== cookieLocale) {
        // Update cookie to match database preference
        response.cookies.set(LOCALE_COOKIE, profile.locale, {
          path: '/',
          maxAge: 365 * 24 * 60 * 60, // 1 year
        })

        // If the current path doesn't match the user's preferred locale, redirect
        const currentLocale = pathname.split('/')[1]
        if (currentLocale !== profile.locale && locales.includes(currentLocale as any)) {
          const newPathname = pathname.replace(`/${currentLocale}`, `/${profile.locale}`)
          return NextResponse.redirect(new URL(newPathname, request.url))
        }
      }

      // Check onboarding status - redirect to welcome page ONLY on first visit to home
      // This allows users to navigate freely during onboarding
      if (profile && !profile.onboarding_completed && profile.onboarding_step === null) {
        // First time user - redirect to welcome page
        const isHome = pathnameWithoutLocale === '/'
        const isAuth = pathnameWithoutLocale.startsWith('/auth')

        if (isHome && !isAuth) {
          const locale = profile.locale || detectedLocale || defaultLocale
          return NextResponse.redirect(new URL(`/${locale}/onboarding/welcome`, request.url))
        }
      }
    } catch (error) {
      console.error('Error fetching user profile from database:', error)
    }
  }

  return response
}

export const config = {
  matcher: [
    // PostHog proxy routes
    '/ingest/:path*',
    // All other routes except Next.js internals and static files
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'
  ],
}
