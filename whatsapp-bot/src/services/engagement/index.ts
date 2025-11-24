/**
 * Engagement Services
 *
 * Re-exports all engagement-related services.
 * These services manage the Smart Onboarding & Engagement System.
 *
 * Epic: 1 - Foundation & Message Infrastructure
 * Story: 1.3 - Engagement Service Directory Structure
 */

// Types and constants
export * from './types.js'
export * from './constants.js'

// State machine service (Epic 4)
export {
  transitionState,
  getEngagementState,
  getEngagementStateRecord,
  initializeEngagementState,
  updateLastActivity,
  getInactiveUsers,
  getExpiredGoodbyes,
  getDueReminders,
  getTransitionTarget,
  // Story 4.7: Transition history query helpers
  getUserTransitionHistory,
  getTransitionStats,
  type TransitionResult,
  type TransitionStats,
} from './state-machine.js'

// Analytics helpers (Story 4.7)
export {
  calculateDaysInactive,
  calculateHoursWaited,
  getGoodbyeResponseType,
  isUnpromptedReturn,
  fireTransitionAnalytics,
  fireStateChangedEvent,
  fireGoodbyeResponseEvent,
  fireUnpromptedReturnEvent,
  GOODBYE_TRIGGER_TO_RESPONSE_TYPE,
  UNPROMPTED_RETURN_DAYS_THRESHOLD,
} from './analytics.js'

// Re-export isValidTransition from types for backward compatibility
export { isValidTransition } from './types.js'

// Activity tracker service (Epic 2, Epic 4)
export {
  // Story 2.1: First Message Detection
  checkAndRecordActivity,
  isFirstMessage,
  // Story 4.2: Activity Tracking & Auto-Reactivation
  // MessageContext now includes isGoodbyeResponse?: boolean for goodbye response detection
  // ActivityCheckResult now includes reactivated?: boolean and previousState?: EngagementState
  getDaysSinceLastActivity,
  type MessageContext,
  type ActivityCheckResult,
  // Legacy Epic 4 interfaces (stubs)
  recordActivity,
  isInactive,
  type ActivityEvent,
  type ActivityResult,
} from './activity-tracker.js'

// Message router service (Epic 4)
export {
  getMessageDestination,
  setPreferredDestination,
  autoDetectDestination,
  type RouteResult,
} from './message-router.js'
