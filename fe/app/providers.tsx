'use client'

import posthog from 'posthog-js'
import { PostHogProvider as PHProvider } from 'posthog-js/react'
import { useEffect, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // Story 3.3: React Query client for budget progress caching
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        // Default staleTime for all queries
        staleTime: 60 * 1000, // 1 minute
        // Retry failed queries
        retry: 1,
      },
    },
  }))

  useEffect(() => {
    // Track pageviews
    if (pathname) {
      let url = window.origin + pathname
      if (searchParams && searchParams.toString()) {
        url = url + `?${searchParams.toString()}`
      }
      posthog.capture('$pageview', {
        $current_url: url,
      })
    }
  }, [pathname, searchParams])

  return (
    <PHProvider client={posthog}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </PHProvider>
  )
}

