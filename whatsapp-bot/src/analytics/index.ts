/**
 * Analytics Module
 *
 * Exports all analytics functionality for the WhatsApp bot.
 */

export { initializePostHog, getPostHog, shutdownPostHog } from './posthog-client.js'
export { trackEvent, identifyUser, setUserProperties, setGroupProperties, hashSensitiveData, trackPerformance } from './tracker.js'
export { WhatsAppAnalyticsEvent, WhatsAppAnalyticsProperty, EventProperties } from './events.js'
