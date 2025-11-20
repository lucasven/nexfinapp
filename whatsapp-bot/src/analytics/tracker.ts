import { getPostHog } from './posthog-client.js'
import { WhatsAppAnalyticsEvent, EventProperties } from './events.js'
import crypto from 'crypto'

/**
 * Track an analytics event
 *
 * @param event - The event to track (use WhatsAppAnalyticsEvent enum)
 * @param distinctId - User identifier (user_id or phone number)
 * @param properties - Optional event properties
 */
export function trackEvent(
  event: WhatsAppAnalyticsEvent | string,
  distinctId: string,
  properties?: EventProperties
): void {
  const posthog = getPostHog()

  // Skip if PostHog is not configured
  if (!posthog) {
    return
  }

  try {
    posthog.capture({
      distinctId: distinctId,
      event: event,
      properties: {
        ...properties,
        platform: 'whatsapp',
        environment: process.env.NODE_ENV || 'production',
      },
    })
  } catch (error) {
    console.error('Failed to track event:', error)
  }
}

/**
 * Identify a user in analytics
 *
 * @param distinctId - Unique user identifier (user_id)
 * @param properties - User properties
 */
export function identifyUser(
  distinctId: string,
  properties?: Record<string, any>
): void {
  const posthog = getPostHog()

  if (!posthog) {
    return
  }

  try {
    posthog.identify({
      distinctId: distinctId,
      properties: {
        ...properties,
        platform: 'whatsapp',
      },
    })
  } catch (error) {
    console.error('Failed to identify user:', error)
  }
}

/**
 * Set user properties (person properties)
 *
 * @param distinctId - Unique user identifier
 * @param properties - Properties to set
 */
export function setUserProperties(
  distinctId: string,
  properties: Record<string, any>
): void {
  const posthog = getPostHog()

  if (!posthog) {
    return
  }

  try {
    posthog.identify({
      distinctId: distinctId,
      properties: properties,
    })
  } catch (error) {
    console.error('Failed to set user properties:', error)
  }
}

/**
 * Set group properties (for WhatsApp groups)
 *
 * @param groupType - The type of group (e.g., 'whatsapp_group')
 * @param groupKey - The group identifier
 * @param properties - Group properties
 */
export function setGroupProperties(
  groupType: string,
  groupKey: string,
  properties: Record<string, any>
): void {
  const posthog = getPostHog()

  if (!posthog) {
    return
  }

  try {
    posthog.groupIdentify({
      groupType: groupType,
      groupKey: groupKey,
      properties: properties,
    })
  } catch (error) {
    console.error('Failed to set group properties:', error)
  }
}

/**
 * Hash sensitive data (phone numbers, group IDs) for privacy
 *
 * @param value - The value to hash
 * @returns SHA256 hash of the value
 */
export function hashSensitiveData(value: string): string {
  return crypto
    .createHash('sha256')
    .update(value)
    .digest('hex')
}

/**
 * Track performance metric
 *
 * @param metricName - Name of the metric
 * @param durationMs - Duration in milliseconds
 * @param distinctId - User identifier
 * @param additionalProperties - Additional properties
 */
export function trackPerformance(
  metricName: string,
  durationMs: number,
  distinctId: string,
  additionalProperties?: EventProperties
): void {
  trackEvent(
    `performance_${metricName}`,
    distinctId,
    {
      processing_time_ms: durationMs,
      ...additionalProperties,
    }
  )
}
