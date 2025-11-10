'use client'

import posthog from 'posthog-js'
import { AnalyticsEvent, EventProperties } from './events'

/**
 * Track an analytics event
 * 
 * @param event - The event to track (use AnalyticsEvent enum)
 * @param properties - Optional event properties
 */
export function trackEvent(
  event: AnalyticsEvent | string,
  properties?: EventProperties
): void {
  // Only track on client side
  if (typeof window === 'undefined') {
    return
  }

  try {
    posthog.capture(event, properties)
  } catch (error) {
    console.error('Failed to track event:', error)
  }
}

/**
 * Identify a user in analytics
 * 
 * @param userId - Unique user identifier
 * @param traits - User traits/properties
 */
export function identifyUser(
  userId: string,
  traits?: Record<string, any>
): void {
  // Only identify on client side
  if (typeof window === 'undefined') {
    return
  }

  try {
    posthog.identify(userId, traits)
  } catch (error) {
    console.error('Failed to identify user:', error)
  }
}

/**
 * Reset user identity (on logout)
 */
export function resetUser(): void {
  if (typeof window === 'undefined') {
    return
  }

  try {
    posthog.reset()
  } catch (error) {
    console.error('Failed to reset user:', error)
  }
}

/**
 * Set user properties
 * 
 * @param properties - Properties to set on the user
 */
export function setUserProperties(properties: Record<string, any>): void {
  if (typeof window === 'undefined') {
    return
  }

  try {
    posthog.people.set(properties)
  } catch (error) {
    console.error('Failed to set user properties:', error)
  }
}

/**
 * Track page view (already handled by PostHogProvider, but available for manual tracking)
 * 
 * @param path - Page path
 * @param properties - Optional properties
 */
export function trackPageView(path: string, properties?: EventProperties): void {
  if (typeof window === 'undefined') {
    return
  }

  try {
    posthog.capture('$pageview', {
      $current_url: window.origin + path,
      ...properties,
    })
  } catch (error) {
    console.error('Failed to track page view:', error)
  }
}

