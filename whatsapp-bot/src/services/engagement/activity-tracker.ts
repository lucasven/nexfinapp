/**
 * Activity Tracker Service
 *
 * Tracks user activity, detects first messages, and
 * automatically reactivates dormant users when they return.
 *
 * Epic: 2 - Conversation-First Welcome
 * Story: 2.1 - First Message Detection
 * Story: 4.2 - Activity Tracking & Auto-Reactivation
 */

import { logger } from '../monitoring/logger.js'
import { getSupabaseClient } from '../database/supabase-client.js'
import { transitionState } from './state-machine.js'
import type { EngagementState } from './types.js'

// =============================================================================
// Interfaces for Story 2.1 & 4.2
// =============================================================================

/**
 * Context about the incoming message
 *
 * Story 4.2 addition: isGoodbyeResponse flag to prevent auto-reactivation
 * when user is responding to a goodbye message (let goodbye-handler process it)
 */
export interface MessageContext {
  jid: string                          // Sender JID
  isGroup: boolean                     // true if @g.us
  groupJid?: string                    // Group JID if applicable
  pushName?: string                    // WhatsApp display name
  messageText: string                  // Raw message content
  isGoodbyeResponse?: boolean          // Story 4.2: True if responding to goodbye message
}

/**
 * Result of checking and recording user activity
 *
 * Story 4.2 addition: reactivated flag and previousState for tracking
 * auto-reactivation from dormant/goodbye_sent states
 */
export interface ActivityCheckResult {
  isFirstMessage: boolean              // True if no prior engagement state
  userId: string                       // User UUID
  preferredDestination: 'individual' | 'group'  // Detected from context
  engagementState: EngagementState     // Current state (after any auto-reactivation)
  reactivated?: boolean                // Story 4.2: True if auto-reactivated from dormant/goodbye_sent
  previousState?: EngagementState      // Story 4.2: State before reactivation
}

// =============================================================================
// Legacy interfaces (kept for Epic 4 compatibility)
// =============================================================================

export interface ActivityEvent {
  userId: string
  eventType: string
  timestamp: Date
  metadata?: Record<string, unknown>
}

export interface ActivityResult {
  recorded: boolean
  reactivated: boolean
  previousState?: string
  error?: string
}

/**
 * Record a user activity event
 *
 * This should be called on every meaningful user interaction.
 * If user is in dormant state, this will trigger reactivation.
 *
 * @param event - The activity event to record
 * @returns Result indicating if user was reactivated
 *
 * TODO: Implement in Epic 4 (Story 4.2)
 * - Update last_activity_at timestamp
 * - Check if user is dormant
 * - If dormant, trigger transition to active
 * - Log activity for analytics
 */
export async function recordActivity(
  event: ActivityEvent
): Promise<ActivityResult> {
  logger.info('Recording activity (stub)', {
    userId: event.userId,
    eventType: event.eventType,
  })

  // Stub implementation - will be completed in Epic 4
  return {
    recorded: false,
    reactivated: false,
    error: 'Not implemented - see Epic 4, Story 4.2',
  }
}

/**
 * Check if a user has been inactive for the threshold period
 *
 * @param userId - The user's ID
 * @returns True if user has been inactive for 14+ days
 *
 * TODO: Implement in Epic 4 (Story 4.2)
 */
export async function isInactive(userId: string): Promise<boolean> {
  logger.debug('Checking inactivity (stub)', { userId })

  // Stub implementation - will be completed in Epic 4
  return false
}

/**
 * Get the number of days since last activity
 *
 * AC-4.2.4: Used to calculate unprompted return detection (3+ days)
 *
 * @param userId - The user's ID
 * @returns Days since last activity, or null if no record
 */
export async function getDaysSinceLastActivity(
  userId: string
): Promise<number | null> {
  const supabase = getSupabaseClient()

  const { data, error } = await supabase
    .from('user_engagement_states')
    .select('last_activity_at')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    logger.error('Error getting last activity', {
      userId,
      error: error.message,
    })
    return null
  }

  if (!data?.last_activity_at) {
    return null
  }

  return calculateDaysInactive(data.last_activity_at, new Date())
}

/**
 * Calculate days between last activity and now
 *
 * @param lastActivity - ISO date string of last activity
 * @param now - Current date
 * @returns Number of full days since last activity
 */
function calculateDaysInactive(lastActivity: string, now: Date): number {
  const lastActivityDate = new Date(lastActivity)
  const diffMs = now.getTime() - lastActivityDate.getTime()
  return Math.floor(diffMs / (1000 * 60 * 60 * 24))
}

// =============================================================================
// Story 2.1: First Message Detection
// =============================================================================

/**
 * Check if this is the user's first message (no engagement state exists)
 *
 * AC-2.1.2: Returns false for returning users
 *
 * @param userId - The user's ID
 * @returns True if no engagement state record exists
 */
export async function isFirstMessage(userId: string): Promise<boolean> {
  const supabase = getSupabaseClient()

  const { data, error } = await supabase
    .from('user_engagement_states')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    logger.error('Error checking first message status', {
      userId,
      error: error.message,
    })
    // On error, assume not first message to avoid duplicate welcomes
    return false
  }

  const isFirst = data === null
  logger.debug('First message check', { userId, isFirstMessage: isFirst })

  return isFirst
}

/**
 * Check and record user activity, detecting first message and auto-reactivation
 *
 * Story 2.1:
 * - AC-2.1.1: First message creates user_engagement_states with state='active'
 * - AC-2.1.3: last_activity_at updated on every message
 * - AC-2.1.4: Works for both individual and group messages
 *
 * Story 4.2:
 * - AC-4.2.1: Every incoming message updates last_activity_at timestamp
 * - AC-4.2.2: User in dormant state sending any message → transitions to active
 * - AC-4.2.3: User in goodbye_sent state sending non-response message → transitions to active
 * - AC-4.2.4: Unprompted return (3+ days since last activity) logged in transition metadata
 * - AC-4.2.5: Activity tracking completes in < 50ms (non-blocking)
 *
 * @param userId - The user's ID
 * @param context - Message context with JID and group info
 * @returns Activity check result including isFirstMessage flag and reactivation status
 */
export async function checkAndRecordActivity(
  userId: string,
  context: MessageContext
): Promise<ActivityCheckResult> {
  const startTime = Date.now()
  const supabase = getSupabaseClient()
  const now = new Date()
  const nowIso = now.toISOString()

  // Detect destination from JID
  // Group JIDs end with @g.us, individual end with @s.whatsapp.net
  const preferredDestination: 'individual' | 'group' = context.isGroup
    ? 'group'
    : 'individual'

  logger.info('Checking and recording activity', {
    userId,
    isGroup: context.isGroup,
    preferredDestination,
    isGoodbyeResponse: context.isGoodbyeResponse ?? false,
  })

  // Check if engagement state exists
  const { data: existingState, error: selectError } = await supabase
    .from('user_engagement_states')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  if (selectError) {
    logger.error('Error checking engagement state', {
      userId,
      error: selectError.message,
    })
    logActivityDuration(startTime, userId)
    // Return safe defaults on error
    return {
      isFirstMessage: false,
      userId,
      preferredDestination,
      engagementState: 'active',
    }
  }

  // First message - create new engagement state (AC-2.1.1)
  if (existingState === null) {
    const { error: insertError } = await supabase
      .from('user_engagement_states')
      .insert({
        user_id: userId,
        state: 'active',
        last_activity_at: nowIso,
      })

    if (insertError) {
      logger.error('Error creating engagement state', {
        userId,
        error: insertError.message,
      })
      logActivityDuration(startTime, userId)
      // Return safe defaults on error
      return {
        isFirstMessage: false,
        userId,
        preferredDestination,
        engagementState: 'active',
      }
    }

    logger.info('Created engagement state for first message', {
      userId,
      state: 'active',
    })

    logActivityDuration(startTime, userId)
    return {
      isFirstMessage: true,
      userId,
      preferredDestination,
      engagementState: 'active',
    }
  }

  // Returning user - update last_activity_at (AC-4.2.1)
  const previousState = existingState.state as EngagementState
  const previousLastActivity = existingState.last_activity_at as string | null

  const { error: updateError } = await supabase
    .from('user_engagement_states')
    .update({
      last_activity_at: nowIso,
      updated_at: nowIso,
    })
    .eq('user_id', userId)

  if (updateError) {
    logger.error('Error updating last activity', {
      userId,
      error: updateError.message,
    })
  } else {
    logger.debug('Updated last activity', { userId })
  }

  // Story 4.2: Auto-reactivation logic
  let reactivated = false
  let finalState = previousState

  // AC-4.2.2: Dormant user sending any message → active
  if (previousState === 'dormant') {
    const daysInactive = previousLastActivity
      ? calculateDaysInactive(previousLastActivity, now)
      : 0

    // AC-4.2.4: Unprompted return detection (3+ days)
    const metadata = {
      unprompted_return: daysInactive >= 3,
      days_inactive: daysInactive,
      reactivation_source: 'user_message',
    }

    logger.info('Auto-reactivating dormant user', {
      userId,
      daysInactive,
      unpromptedReturn: metadata.unprompted_return,
    })

    const transitionResult = await transitionState(userId, 'user_message', metadata)

    if (transitionResult.success) {
      reactivated = true
      finalState = 'active'
    }
  }
  // AC-4.2.3: Goodbye_sent user sending non-response message → active
  else if (previousState === 'goodbye_sent' && !context.isGoodbyeResponse) {
    const daysInactive = previousLastActivity
      ? calculateDaysInactive(previousLastActivity, now)
      : 0

    logger.info('Auto-reactivating goodbye_sent user (non-response message)', {
      userId,
      daysInactive,
    })

    const transitionResult = await transitionState(userId, 'user_message', {
      reactivation_source: 'non_response_message',
      days_inactive: daysInactive,
    })

    if (transitionResult.success) {
      reactivated = true
      finalState = 'active'
    }
  }
  // If goodbye_sent + isGoodbyeResponse=true, let goodbye-handler process it
  // Do NOT auto-reactivate

  logActivityDuration(startTime, userId)

  return {
    isFirstMessage: false,
    userId,
    preferredDestination,
    engagementState: finalState,
    reactivated,
    previousState: reactivated ? previousState : undefined,
  }
}

/**
 * Log activity tracking duration for performance monitoring (AC-4.2.5)
 */
function logActivityDuration(startTime: number, userId: string): void {
  const durationMs = Date.now() - startTime
  logger.debug('Activity tracking completed', {
    userId,
    durationMs,
    withinTarget: durationMs < 50,
  })
}
