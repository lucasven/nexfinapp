import { PostHog } from 'posthog-node'

/**
 * PostHog Analytics Client for WhatsApp Bot
 *
 * Provides server-side event tracking for WhatsApp bot interactions.
 * All events are sent to PostHog for analytics and monitoring.
 */

let posthogInstance: PostHog | null = null

/**
 * Initialize PostHog client
 */
export function initializePostHog(): PostHog | null {
  // Return existing instance if already initialized
  if (posthogInstance) {
    return posthogInstance
  }

  const apiKey = process.env.POSTHOG_API_KEY
  const host = process.env.POSTHOG_HOST || 'https://us.i.posthog.com'

  // PostHog is optional - skip if not configured
  if (!apiKey) {
    console.warn('PostHog API key not configured. Analytics will be disabled.')
    return null
  }

  try {
    posthogInstance = new PostHog(apiKey, {
      host: host,
      flushAt: 1, // Send events immediately (important for serverless/Railway)
      flushInterval: 0, // Don't batch events
    })

    console.log('PostHog analytics initialized successfully')
    return posthogInstance
  } catch (error) {
    console.error('Failed to initialize PostHog:', error)
    return null
  }
}

/**
 * Get PostHog client instance
 */
export function getPostHog(): PostHog | null {
  if (!posthogInstance) {
    return initializePostHog()
  }
  return posthogInstance
}

/**
 * Shutdown PostHog client (flush pending events)
 */
export async function shutdownPostHog(): Promise<void> {
  if (posthogInstance) {
    await posthogInstance.shutdown()
    posthogInstance = null
    console.log('PostHog analytics shut down')
  }
}
