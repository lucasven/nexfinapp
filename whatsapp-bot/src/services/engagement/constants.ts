/**
 * Engagement System Constants
 *
 * Configuration constants for the Smart Onboarding & Engagement System.
 * These values are derived from the PRD and should not be changed
 * without updating the corresponding documentation.
 *
 * Epic: 1 - Foundation & Message Infrastructure
 * Story: 1.3 - Engagement Service Directory Structure
 */

/**
 * Inactivity threshold for triggering goodbye message
 * After 14 days of no activity, user enters goodbye_sent state
 *
 * Source: PRD FR12, NFR5
 */
export const INACTIVITY_THRESHOLD_DAYS = 14

/**
 * Timeout for goodbye response
 * If user doesn't respond to goodbye message within 48 hours,
 * they transition to dormant state
 *
 * Source: PRD FR18
 */
export const GOODBYE_TIMEOUT_HOURS = 48

/**
 * Default remind-later delay
 * When user selects "remind me later", we wait this many days
 *
 * Source: PRD FR16
 */
export const REMIND_LATER_DAYS = 14

/**
 * Maximum retry attempts for message delivery
 * After this many failures, message status becomes 'failed'
 *
 * Source: Architecture ADR-003
 */
export const MAX_MESSAGE_RETRIES = 3

/**
 * Tier 1 actions - Basics
 * User completes Tier 1 when all these actions are done
 *
 * Source: PRD FR3-FR6
 */
export const TIER_1_ACTIONS = [
  'add_expense',
  'edit_category',
  'delete_expense',
  'add_category',
] as const

/**
 * Tier 2 actions - Power User
 * User completes Tier 2 when all these actions are done
 *
 * Source: PRD FR3-FR6
 */
export const TIER_2_ACTIONS = [
  'set_budget',
  'add_recurring',
  'list_categories',
] as const

/**
 * Tier 3 actions - Expert
 * User completes Tier 3 when all these actions are done
 *
 * Source: PRD FR3-FR6
 */
export const TIER_3_ACTIONS = [
  'edit_category',  // Advanced category management
  'view_report',
] as const

/**
 * All tier actions combined
 */
export const ALL_TIER_ACTIONS = [
  ...TIER_1_ACTIONS,
  ...TIER_2_ACTIONS,
  ...TIER_3_ACTIONS,
] as const

/**
 * Weekly review - days of inactivity threshold
 * Users who haven't been active for this many days get weekly review
 *
 * Source: PRD FR20
 */
export const WEEKLY_REVIEW_INACTIVITY_DAYS = 7

/**
 * Weekly review - minimum transactions for summary
 * Users need at least this many transactions to get meaningful review
 *
 * Source: PRD FR21
 */
export const WEEKLY_REVIEW_MIN_TRANSACTIONS = 1

/**
 * Message type to localization key prefix mapping
 */
export const MESSAGE_TYPE_PREFIXES: Record<string, string> = {
  welcome: 'engagement.welcome',
  tier_unlock: 'engagement.tier',
  goodbye: 'engagement.goodbye',
  weekly_review: 'engagement.weekly',
  reminder: 'engagement.reminder',
  help_restart: 'engagement.help',
}

/**
 * Default engagement state for new users
 */
export const DEFAULT_ENGAGEMENT_STATE = 'active' as const

/**
 * Default onboarding tier for new users
 */
export const DEFAULT_ONBOARDING_TIER = 0

/**
 * Default preferred destination for new users
 */
export const DEFAULT_PREFERRED_DESTINATION = 'individual' as const
