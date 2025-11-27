/**
 * Engagement System Types
 *
 * TypeScript interfaces and types for the Smart Onboarding & Engagement System.
 *
 * Epic: 1 - Foundation & Message Infrastructure
 * Story: 1.3 - Engagement Service Directory Structure
 */

/**
 * User engagement states (5-state machine)
 *
 * State transitions:
 * - active → goodbye_sent (14-day inactivity)
 * - goodbye_sent → active (response option 3: "I'm still here")
 * - goodbye_sent → remind_later (response option 2: "Remind me later")
 * - goodbye_sent → dormant (response option 1 or 48h timeout)
 * - remind_later → active (user message or reminder due)
 * - dormant → active (user returns)
 * - help_flow → active (help resolved)
 */
export type EngagementState =
  | 'active'
  | 'goodbye_sent'
  | 'help_flow'
  | 'remind_later'
  | 'dormant'

/**
 * Triggers that cause state transitions
 */
export type TransitionTrigger =
  | 'user_message'           // Any user message
  | 'inactivity_14d'         // 14 days without activity
  | 'goodbye_response_1'     // "I'm taking a break"
  | 'goodbye_response_2'     // "Remind me later"
  | 'goodbye_response_3'     // "I'm still here"
  | 'goodbye_timeout'        // 48h without response to goodbye
  | 'reminder_due'           // Scheduled reminder time reached
  | 'help_requested'         // User explicitly asked for help
  | 'help_resolved'          // Help flow completed

/**
 * Types of proactive messages the system can send
 */
export type MessageType =
  | 'welcome'        // First-time user greeting
  | 'tier_unlock'    // Tier completion celebration
  | 'goodbye'        // Self-select/goodbye message
  | 'weekly_review'  // Weekly activity summary
  | 'reminder'       // Remind-later follow-up
  | 'help_restart'   // Re-engagement after help flow

/**
 * User's engagement state record
 */
export interface UserEngagementState {
  id: string
  userId: string
  state: EngagementState
  lastActivityAt: Date
  goodbyeSentAt: Date | null
  goodbyeExpiresAt: Date | null
  remindAt: Date | null
  createdAt: Date
  updatedAt: Date
}

/**
 * Goodbye response types for analytics tracking (FR40)
 */
export type GoodbyeResponseType = 'confused' | 'busy' | 'all_good' | 'timeout'

/**
 * Transition metadata for analytics and debugging
 *
 * AC-4.7.1: Full context for engagement_state_transitions
 * AC-4.7.3: response_type for goodbye responses (FR40)
 * AC-4.7.4: unprompted_return for organic returns (FR41)
 * AC-4.7.5: days_inactive for all transitions (FR42)
 */
export interface TransitionMetadata {
  /** Days since last activity (FR42) */
  days_inactive: number

  /** Response type for goodbye triggers (FR40) */
  response_type?: GoodbyeResponseType

  /** True if user returned after 3+ days without prompt (FR41) */
  unprompted_return?: boolean

  /** Days since goodbye message was sent */
  days_since_goodbye?: number

  /** Hours waited before timeout */
  hours_waited?: number

  /** Source of trigger */
  trigger_source?: 'user_message' | 'scheduler'

  /** Previous state before transition */
  previous_state?: EngagementState

  /** Additional custom metadata */
  [key: string]: unknown
}

/**
 * State transition log entry
 */
export interface StateTransition {
  id: string
  userId: string
  fromState: EngagementState
  toState: EngagementState
  trigger: TransitionTrigger
  metadata: TransitionMetadata | null
  createdAt: Date
}

/**
 * Queued proactive message
 */
export interface QueuedMessage {
  id: string
  userId: string
  messageType: MessageType
  messageKey: string
  messageParams: Record<string, unknown> | null
  destination: 'individual' | 'group'
  destinationJid: string
  scheduledFor: Date
  sentAt: Date | null
  status: 'pending' | 'sent' | 'failed' | 'cancelled'
  retryCount: number
  errorMessage: string | null
  idempotencyKey: string
  createdAt: Date
}

/**
 * Tier progress tracking
 *
 * Tier 1 actions: add_expense, edit_category, delete_expense, add_category
 * Tier 2 actions: set_budget, add_recurring, list_categories
 * Tier 3 actions: edit_category (advanced), view_report
 */
export interface TierProgress {
  tier1: {
    add_expense: boolean
    edit_category: boolean
    delete_expense: boolean
    add_category: boolean
    completed_at?: string
  }
  tier2: {
    set_budget: boolean
    add_recurring: boolean
    list_categories: boolean
    completed_at?: string
  }
  tier3: {
    edit_category: boolean
    view_report: boolean
    completed_at?: string
  }
  magic_moment_at?: string
}

/**
 * Valid state transitions map (simple version)
 * Used for quick validation of allowed target states
 */
export const VALID_TRANSITIONS: Record<EngagementState, EngagementState[]> = {
  active: ['goodbye_sent', 'help_flow'],
  goodbye_sent: ['active', 'remind_later', 'dormant', 'help_flow'],
  help_flow: ['active'],
  remind_later: ['active', 'dormant'],
  dormant: ['active'],
}

/**
 * Transition map: state + trigger → new state
 * Defines all 10 valid transitions per architecture state diagram
 *
 * State transitions:
 * - ACTIVE ──(inactivity_14d)──> GOODBYE_SENT
 * - GOODBYE_SENT ──(user_message)──> ACTIVE
 * - GOODBYE_SENT ──(goodbye_response_1)──> HELP_FLOW
 * - GOODBYE_SENT ──(goodbye_response_2)──> REMIND_LATER
 * - GOODBYE_SENT ──(goodbye_response_3)──> DORMANT
 * - GOODBYE_SENT ──(goodbye_timeout)──> DORMANT
 * - HELP_FLOW ──(user_message)──> ACTIVE
 * - REMIND_LATER ──(user_message)──> ACTIVE
 * - REMIND_LATER ──(reminder_due)──> DORMANT
 * - DORMANT ──(user_message)──> ACTIVE
 */
export const TRANSITION_MAP: Record<
  EngagementState,
  Partial<Record<TransitionTrigger, EngagementState>>
> = {
  active: {
    inactivity_14d: 'goodbye_sent',
  },
  goodbye_sent: {
    user_message: 'active',
    goodbye_response_1: 'help_flow',
    goodbye_response_2: 'remind_later',
    goodbye_response_3: 'dormant',
    goodbye_timeout: 'dormant',
  },
  help_flow: {
    user_message: 'active',
  },
  remind_later: {
    user_message: 'active',
    reminder_due: 'dormant',
  },
  dormant: {
    user_message: 'active',
  },
}

/**
 * Check if a state transition is valid (simple state-to-state check)
 */
export function isValidTransition(
  from: EngagementState,
  to: EngagementState
): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false
}

/**
 * Get the target state for a given current state and trigger
 * Returns null if transition is not valid
 */
export function getTransitionTarget(
  currentState: EngagementState,
  trigger: TransitionTrigger
): EngagementState | null {
  return TRANSITION_MAP[currentState]?.[trigger] ?? null
}
