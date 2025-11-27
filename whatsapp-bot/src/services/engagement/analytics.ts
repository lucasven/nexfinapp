/**
 * Engagement Analytics Service
 *
 * PostHog event firing and analytics helpers for engagement state transitions.
 *
 * Epic: 4 - Engagement State Machine
 * Story: 4.7 - State Transition Logging & Analytics
 *
 * AC-4.7.2: PostHog event `engagement_state_changed` fired on every transition
 * AC-4.7.3: Goodbye response type tracked in transition metadata (FR40)
 * AC-4.7.4: Unprompted return events tracked (FR41)
 * AC-4.7.7: User's preferred destination included for segmentation
 */

import { trackEvent } from '../../analytics/tracker.js'
import { WhatsAppAnalyticsEvent } from '../../analytics/events.js'
import { logger } from '../monitoring/logger.js'
import type {
  EngagementState,
  TransitionTrigger,
  TransitionMetadata,
  GoodbyeResponseType,
} from './types.js'

// =============================================================================
// Constants
// =============================================================================

/**
 * Mapping of goodbye triggers to response types for analytics (FR40)
 */
export const GOODBYE_TRIGGER_TO_RESPONSE_TYPE: Record<string, GoodbyeResponseType> = {
  goodbye_response_1: 'confused',  // "I'm taking a break / confused about app"
  goodbye_response_2: 'busy',      // "Remind me later / busy right now"
  goodbye_response_3: 'all_good',  // "I'm still here / all good"
  goodbye_timeout: 'timeout',      // No response within 48h
}

/**
 * Minimum days inactive to qualify as unprompted return (FR41)
 */
export const UNPROMPTED_RETURN_DAYS_THRESHOLD = 3

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Calculate days since last activity
 *
 * AC-4.7.5: Days since last activity included in all transition metadata (FR42)
 *
 * @param lastActivityAt - Last activity timestamp
 * @returns Number of days since last activity (floor)
 */
export function calculateDaysInactive(lastActivityAt: Date | null): number {
  if (!lastActivityAt) {
    return 0
  }

  const now = new Date()
  const diffMs = now.getTime() - lastActivityAt.getTime()

  // Handle edge case of future dates
  if (diffMs < 0) {
    return 0
  }

  return Math.floor(diffMs / (1000 * 60 * 60 * 24))
}

/**
 * Calculate hours since a given timestamp
 *
 * @param timestamp - The timestamp to measure from
 * @returns Number of hours since timestamp (floor)
 */
export function calculateHoursWaited(timestamp: Date | null): number {
  if (!timestamp) {
    return 0
  }

  const now = new Date()
  const diffMs = now.getTime() - timestamp.getTime()

  if (diffMs < 0) {
    return 0
  }

  return Math.floor(diffMs / (1000 * 60 * 60))
}

/**
 * Get response type for a goodbye trigger
 *
 * AC-4.7.3: Maps goodbye triggers to response types for FR40 tracking
 *
 * @param trigger - The transition trigger
 * @returns GoodbyeResponseType or undefined if not a goodbye trigger
 */
export function getGoodbyeResponseType(trigger: TransitionTrigger): GoodbyeResponseType | undefined {
  return GOODBYE_TRIGGER_TO_RESPONSE_TYPE[trigger]
}

/**
 * Check if a transition qualifies as an unprompted return
 *
 * AC-4.7.4: Unprompted return when:
 * - User was in `dormant` state
 * - User was inactive for 3+ days
 * - No goodbye message was pending (not responding to goodbye_sent)
 *
 * @param trigger - The transition trigger
 * @param fromState - Previous engagement state
 * @param daysInactive - Days since last activity
 * @returns True if this is an unprompted return (FR41)
 */
export function isUnpromptedReturn(
  trigger: TransitionTrigger,
  fromState: EngagementState,
  daysInactive: number
): boolean {
  // Must be a user_message trigger
  if (trigger !== 'user_message') {
    return false
  }

  // Must be coming from dormant state (not goodbye_sent - that would be responding to goodbye)
  if (fromState !== 'dormant') {
    return false
  }

  // Must have been inactive for 3+ days
  return daysInactive >= UNPROMPTED_RETURN_DAYS_THRESHOLD
}

// =============================================================================
// Analytics Event Firing
// =============================================================================

/**
 * Fire the generic engagement_state_changed event
 *
 * AC-4.7.2: PostHog event fired on every successful transition with full properties
 * AC-4.7.7: Include preferred_destination for segmentation analytics
 *
 * @param userId - The user's ID
 * @param fromState - Previous engagement state
 * @param toState - New engagement state
 * @param trigger - The trigger that caused the transition
 * @param metadata - Transition metadata
 * @param preferredDestination - User's preferred message destination
 */
export function fireStateChangedEvent(
  userId: string,
  fromState: EngagementState,
  toState: EngagementState,
  trigger: TransitionTrigger,
  metadata: TransitionMetadata,
  preferredDestination?: string
): void {
  try {
    trackEvent(
      WhatsAppAnalyticsEvent.ENGAGEMENT_STATE_CHANGED,
      userId,
      {
        from_state: fromState,
        to_state: toState,
        trigger: trigger,
        days_inactive: metadata.days_inactive,
        response_type: metadata.response_type,
        unprompted_return: metadata.unprompted_return,
        preferred_destination: preferredDestination,
      }
    )

    logger.debug('Fired engagement_state_changed event', {
      userId,
      fromState,
      toState,
      trigger,
    })
  } catch (error) {
    // Non-blocking: log error but don't fail
    logger.error('Failed to fire engagement_state_changed event', { userId }, error as Error)
  }
}

/**
 * Fire the specialized goodbye_response event
 *
 * AC-4.7.3: Goodbye response type tracked for FR40 analytics
 *
 * @param userId - The user's ID
 * @param responseType - The goodbye response type
 * @param metadata - Transition metadata with timing info
 */
export function fireGoodbyeResponseEvent(
  userId: string,
  responseType: GoodbyeResponseType,
  metadata: TransitionMetadata
): void {
  try {
    trackEvent(
      WhatsAppAnalyticsEvent.ENGAGEMENT_GOODBYE_RESPONSE,
      userId,
      {
        response_type: responseType,
        days_since_goodbye: metadata.days_since_goodbye,
        hours_waited: metadata.hours_waited,
        from_state: 'goodbye_sent',
        to_state: metadata.previous_state === 'goodbye_sent' ? 'dormant' : metadata.previous_state,
      }
    )

    logger.debug('Fired engagement_goodbye_response event', {
      userId,
      responseType,
      daysSinceGoodbye: metadata.days_since_goodbye,
    })
  } catch (error) {
    // Non-blocking: log error but don't fail
    logger.error('Failed to fire engagement_goodbye_response event', { userId }, error as Error)
  }
}

/**
 * Fire the specialized unprompted_return event
 *
 * AC-4.7.4: Unprompted return events tracked for FR41 analytics
 *
 * @param userId - The user's ID
 * @param daysInactive - Days since last activity
 * @param previousState - State before return
 * @param userTier - User's current tier (optional)
 */
export function fireUnpromptedReturnEvent(
  userId: string,
  daysInactive: number,
  previousState: EngagementState,
  userTier?: number
): void {
  try {
    trackEvent(
      WhatsAppAnalyticsEvent.ENGAGEMENT_UNPROMPTED_RETURN,
      userId,
      {
        days_inactive: daysInactive,
        previous_state: previousState,
        user_tier: userTier,
      }
    )

    logger.debug('Fired engagement_unprompted_return event', {
      userId,
      daysInactive,
      previousState,
    })
  } catch (error) {
    // Non-blocking: log error but don't fail
    logger.error('Failed to fire engagement_unprompted_return event', { userId }, error as Error)
  }
}

/**
 * Fire all applicable analytics events for a state transition
 *
 * This is the main entry point that determines which events to fire
 * based on the transition details.
 *
 * @param userId - The user's ID
 * @param fromState - Previous engagement state
 * @param toState - New engagement state
 * @param trigger - The trigger that caused the transition
 * @param metadata - Full transition metadata
 * @param preferredDestination - User's preferred message destination
 */
export function fireTransitionAnalytics(
  userId: string,
  fromState: EngagementState,
  toState: EngagementState,
  trigger: TransitionTrigger,
  metadata: TransitionMetadata,
  preferredDestination?: string
): void {
  // Always fire the generic state_changed event (AC-4.7.2)
  fireStateChangedEvent(userId, fromState, toState, trigger, metadata, preferredDestination)

  // Fire specialized goodbye_response event if applicable (AC-4.7.3)
  const responseType = getGoodbyeResponseType(trigger)
  if (responseType) {
    fireGoodbyeResponseEvent(userId, responseType, {
      ...metadata,
      previous_state: fromState,
    })
  }

  // Fire specialized unprompted_return event if applicable (AC-4.7.4)
  if (metadata.unprompted_return) {
    fireUnpromptedReturnEvent(userId, metadata.days_inactive, fromState)
  }
}
