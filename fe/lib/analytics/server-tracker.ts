'use server'

import { PostHog } from 'posthog-node'
import { AnalyticsEvent, EventProperties } from './events'

// Initialize PostHog client for server-side tracking
let posthogClient: PostHog | null = null

function getPostHogClient(): PostHog {
  if (!posthogClient) {
    if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) {
      console.warn('PostHog key not found, analytics will not be tracked')
      // Return a mock client that does nothing
      return {
        capture: () => {},
        identify: () => {},
        shutdown: async () => {},
      } as any
    }
    
    posthogClient = new PostHog(
      process.env.NEXT_PUBLIC_POSTHOG_KEY,
      { 
        host: 'https://us.i.posthog.com',
        flushAt: 1, // Send immediately for better reliability
        flushInterval: 0, // Don't wait
      }
    )
  }
  return posthogClient
}

/**
 * Track an analytics event from server-side code
 * 
 * @param userId - User ID (distinct_id in PostHog)
 * @param event - The event to track
 * @param properties - Optional event properties
 */
export async function trackServerEvent(
  userId: string,
  event: AnalyticsEvent | string,
  properties?: EventProperties
): Promise<void> {
  try {
    const client = getPostHogClient()
    client.capture({
      distinctId: userId,
      event,
      properties,
    })
  } catch (error) {
    console.error('Failed to track server event:', error)
  }
}

/**
 * Identify a user from server-side code
 * 
 * @param userId - User ID
 * @param properties - User properties
 */
export async function identifyServerUser(
  userId: string,
  properties?: Record<string, any>
): Promise<void> {
  try {
    const client = getPostHogClient()
    client.identify({
      distinctId: userId,
      properties,
    })
  } catch (error) {
    console.error('Failed to identify server user:', error)
  }
}

/**
 * Flush all pending events (call on app shutdown)
 */
export async function flushAnalytics(): Promise<void> {
  if (posthogClient) {
    await posthogClient.shutdown()
    posthogClient = null
  }
}

