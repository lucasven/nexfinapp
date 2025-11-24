/**
 * Engagement State Machine Service
 *
 * Manages user engagement state transitions with validation,
 * logging, and side effects (message queueing, analytics).
 *
 * Epic: 4 - Engagement State Machine
 * Story: 4.1 - State Machine Service Core
 *
 * AC-4.1.1: transitionState() validates all 10 transitions per architecture state diagram
 * AC-4.1.2: Invalid transitions are logged and rejected with descriptive error
 * AC-4.1.3: Every successful transition creates engagement_state_transitions record
 * AC-4.1.4: State machine handles missing user gracefully (creates initial state)
 * AC-4.1.5: Concurrent transitions for same user handled safely (optimistic locking)
 */

import { getSupabaseClient } from '../database/supabase-client.js'
import { logger } from '../monitoring/logger.js'
import type {
  EngagementState,
  TransitionTrigger,
  UserEngagementState,
  MessageType,
  TransitionMetadata,
  StateTransition,
} from './types.js'
import { getTransitionTarget } from './types.js'
import {
  GOODBYE_TIMEOUT_HOURS,
  REMIND_LATER_DAYS,
} from './constants.js'
import { queueMessage, getIdempotencyKey } from '../scheduler/message-sender.js'
import { getMessageDestination } from './message-router.js'
import { trackEvent } from '../../analytics/tracker.js'
import { WhatsAppAnalyticsEvent } from '../../analytics/events.js'
import {
  calculateDaysInactive,
  calculateHoursWaited,
  getGoodbyeResponseType,
  isUnpromptedReturn,
  fireTransitionAnalytics,
} from './analytics.js'

// =============================================================================
// Types
// =============================================================================

export interface TransitionResult {
  success: boolean
  previousState: EngagementState
  newState: EngagementState
  transitionId?: string
  error?: string
  sideEffects: string[]
}

/**
 * Database row type for user_engagement_states table
 */
interface EngagementStateRow {
  id: string
  user_id: string
  state: EngagementState
  last_activity_at: string
  goodbye_sent_at: string | null
  goodbye_expires_at: string | null
  remind_at: string | null
  created_at: string
  updated_at: string
}

/**
 * Database row type for engagement_state_transitions table
 */
interface TransitionLogRow {
  id: string
  user_id: string
  from_state: string
  to_state: string
  trigger: string
  metadata: Record<string, unknown> | null
  created_at: string
}

// =============================================================================
// Main State Machine Functions
// =============================================================================

/**
 * Transition a user to a new engagement state
 *
 * AC-4.1.1: Validates all 10 transitions per architecture state diagram
 * AC-4.1.2: Invalid transitions are logged and rejected with descriptive error
 * AC-4.1.3: Every successful transition creates engagement_state_transitions record
 * AC-4.1.4: Handles missing user gracefully (creates initial state)
 * AC-4.1.5: Uses optimistic locking for concurrent safety
 *
 * @param userId - The user's ID
 * @param trigger - The trigger causing the transition
 * @param metadata - Optional metadata to include in transition log
 * @returns Result of the transition attempt
 */
export async function transitionState(
  userId: string,
  trigger: TransitionTrigger,
  metadata?: Record<string, unknown>
): Promise<TransitionResult> {
  const supabase = getSupabaseClient()
  const sideEffects: string[] = []

  try {
    // Step 1: Get or create current engagement state
    let currentState = await getEngagementStateInternal(userId)

    // AC-4.1.4: Initialize for new users
    if (!currentState) {
      // For user_message trigger on new user, initialize to active
      if (trigger === 'user_message') {
        const initResult = await initializeEngagementState(userId)
        if (!initResult) {
          return {
            success: false,
            previousState: 'active',
            newState: 'active',
            error: 'Failed to initialize engagement state for new user',
            sideEffects: [],
          }
        }
        sideEffects.push('initialized_new_user')

        // New user already in active state, user_message keeps them active
        // No actual transition needed, just return success
        return {
          success: true,
          previousState: 'active',
          newState: 'active',
          sideEffects,
        }
      } else {
        // Non-user_message trigger on non-existent user - this shouldn't happen
        logger.error('Transition attempted for non-existent user with non-user_message trigger', {
          userId,
          trigger,
        })
        return {
          success: false,
          previousState: 'active',
          newState: 'active',
          error: `User ${userId} does not have an engagement state record`,
          sideEffects: [],
        }
      }
    }

    const previousState = currentState.state

    // Step 2: Validate transition using TRANSITION_MAP
    const targetState = getTransitionTarget(previousState, trigger)

    if (!targetState) {
      // AC-4.1.2: Invalid transition - log and reject with descriptive error
      const errorMsg = `Invalid transition: ${previousState} + ${trigger} is not a valid transition`
      logger.warn('Invalid state transition attempted', {
        userId,
        currentState: previousState,
        trigger,
        error: errorMsg,
      })
      return {
        success: false,
        previousState,
        newState: previousState,
        error: errorMsg,
        sideEffects: [],
      }
    }

    // Step 3: Prepare state-specific timestamp updates
    const now = new Date()
    const updateData = buildStateUpdateData(targetState, now)
    updateData.state = targetState
    updateData.updated_at = now.toISOString()

    // Calculate full metadata for transition logging (AC-4.7.1, AC-4.7.3, AC-4.7.4, AC-4.7.5)
    const daysInactive = calculateDaysInactive(currentState.lastActivityAt)
    const fullMetadata = buildTransitionMetadata(
      trigger,
      previousState,
      currentState,
      daysInactive,
      metadata
    )

    // Step 4: Execute state update with optimistic locking (via updated_at check)
    // AC-4.1.5: Concurrent transitions handled safely
    const { data: updatedState, error: updateError } = await supabase
      .from('user_engagement_states')
      .update(updateData)
      .eq('user_id', userId)
      .eq('updated_at', currentState.updatedAt.toISOString()) // Optimistic lock
      .select()
      .single()

    if (updateError) {
      // Check if it's a "no rows returned" error (race condition)
      if (updateError.code === 'PGRST116') {
        logger.warn('Optimistic lock conflict - state was modified concurrently', {
          userId,
          trigger,
          previousState,
          targetState,
        })
        return {
          success: false,
          previousState,
          newState: previousState,
          error: 'State was modified by another process. Please retry.',
          sideEffects: [],
        }
      }
      logger.error('Failed to update engagement state', { userId, trigger }, updateError)
      return {
        success: false,
        previousState,
        newState: previousState,
        error: `Database error: ${updateError.message}`,
        sideEffects: [],
      }
    }

    if (!updatedState) {
      // Optimistic lock failed - state was updated by another process
      logger.warn('Optimistic lock failed - no rows updated', {
        userId,
        trigger,
        previousState,
        targetState,
      })
      return {
        success: false,
        previousState,
        newState: previousState,
        error: 'State was modified by another process. Please retry.',
        sideEffects: [],
      }
    }

    // Step 5: Log the transition (AC-4.1.3)
    const { data: transitionLog, error: logError } = await supabase
      .from('engagement_state_transitions')
      .insert({
        user_id: userId,
        from_state: previousState,
        to_state: targetState,
        trigger,
        metadata: fullMetadata,
      })
      .select('id')
      .single()

    if (logError) {
      // Log error but don't fail the transition - state update already succeeded
      logger.error('Failed to log state transition', { userId, trigger, previousState, targetState }, logError)
    }

    // Step 6: Fire PostHog analytics events (AC-4.7.2, AC-4.7.3, AC-4.7.4, AC-4.7.7)
    // Analytics should NEVER cause a state transition to fail (error handling strategy)
    try {
      // Get user's preferred destination for segmentation analytics
      const destinationInfo = await getMessageDestination(userId)
      fireTransitionAnalytics(
        userId,
        previousState,
        targetState,
        trigger,
        fullMetadata,
        destinationInfo?.destination
      )
      sideEffects.push('fired_analytics_events')
    } catch (analyticsError) {
      // Log error but don't fail the transition - state update already succeeded
      logger.error('Failed to fire analytics events', { userId, trigger }, analyticsError as Error)
    }

    // Record side effects based on state change
    sideEffects.push(`transitioned_${previousState}_to_${targetState}`)
    if (targetState === 'active' && previousState !== 'active') {
      sideEffects.push('reactivated_user')
    }
    if (targetState === 'goodbye_sent' && previousState === 'active') {
      sideEffects.push('goodbye_timer_started')
      // AC-4.3.1: Queue goodbye message on transition to goodbye_sent
      const goodbyeEffects = await executeGoodbyeSideEffects(userId)
      sideEffects.push(...goodbyeEffects)
    }
    if (targetState === 'remind_later') {
      sideEffects.push('reminder_scheduled')
    }

    // AC-4.5.3, AC-4.5.4: Handle goodbye_timeout side effects
    // - NO message is sent (silence is design - dignity, not guilt)
    // - Track analytics with response_type: 'timeout'
    if (trigger === 'goodbye_timeout') {
      const timeoutEffects = await executeGoodbyeTimeoutSideEffects(userId, currentState)
      sideEffects.push(...timeoutEffects)
    }

    logger.info('State transition completed', {
      userId,
      trigger,
      previousState,
      newState: targetState,
      daysInactive,
      sideEffects,
    })

    return {
      success: true,
      previousState,
      newState: targetState,
      transitionId: transitionLog?.id,
      sideEffects,
    }
  } catch (error) {
    logger.error('Unexpected error in transitionState', { userId, trigger }, error as Error)
    return {
      success: false,
      previousState: 'active',
      newState: 'active',
      error: `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
      sideEffects: [],
    }
  }
}

/**
 * Execute side effects for goodbye_sent transition
 *
 * AC-4.3.1: Queue goodbye message via message queue service
 * AC-4.3.3: Route message to user's preferred destination
 * AC-4.3.4: Include user's locale for localized message
 * AC-4.3.5: Use idempotency key to prevent duplicates
 *
 * Note: Timestamps (goodbye_sent_at, goodbye_expires_at) are set by buildStateUpdateData()
 * This function handles message queuing as a side effect.
 *
 * @param userId - The user's ID
 * @returns Array of side effect names that were executed
 */
async function executeGoodbyeSideEffects(userId: string): Promise<string[]> {
  const supabase = getSupabaseClient()
  const sideEffects: string[] = []

  try {
    // AC-4.3.3: Get user's preferred destination
    const destination = await getMessageDestination(userId)
    if (!destination) {
      logger.warn('Cannot queue goodbye message: no destination found', { userId })
      return sideEffects
    }

    // AC-4.3.4: Fetch user's locale
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('preferred_language')
      .eq('id', userId)
      .maybeSingle()

    if (profileError) {
      logger.error('Error fetching user locale for goodbye message', { userId }, profileError)
    }

    const locale = profile?.preferred_language || 'pt-br'

    // AC-4.3.5: Generate idempotency key to prevent duplicate goodbye same day
    const idempotencyKey = getIdempotencyKey(userId, 'goodbye_sent')

    // AC-4.3.1: Queue goodbye message
    const queued = await queueMessage({
      userId,
      messageType: 'goodbye' as MessageType,
      messageKey: 'engagement.goodbye_self_select',
      messageParams: { locale },
      destination: destination.destination,
      destinationJid: destination.destinationJid,
    })

    if (queued) {
      sideEffects.push('queued_goodbye_message')
      logger.info('Goodbye message queued', {
        userId,
        destination: destination.destination,
        locale,
        idempotencyKey,
      })
    } else {
      logger.warn('Failed to queue goodbye message (may be duplicate)', { userId, idempotencyKey })
    }

    return sideEffects
  } catch (error) {
    logger.error('Unexpected error in executeGoodbyeSideEffects', { userId }, error as Error)
    return sideEffects
  }
}

/**
 * Execute side effects for goodbye_timeout transition
 *
 * AC-4.5.3: NO message is sent (silence is design - dignity, not guilt)
 * AC-4.5.4: Track analytics with response_type: 'timeout' for FR40
 * AC-4.5.6: State transition is already logged by transitionState()
 *
 * @param userId - The user's ID
 * @param userState - The user's engagement state before transition
 * @returns Array of side effect names that were executed
 */
async function executeGoodbyeTimeoutSideEffects(
  userId: string,
  userState: UserEngagementState
): Promise<string[]> {
  const sideEffects: string[] = []

  try {
    // Calculate timing metrics for analytics
    const now = new Date()
    const goodbyeSentAt = userState.goodbyeSentAt
    let daysSinceGoodbye = 0
    let hoursWaited = 0

    if (goodbyeSentAt) {
      hoursWaited = Math.floor(
        (now.getTime() - goodbyeSentAt.getTime()) / (1000 * 60 * 60)
      )
      daysSinceGoodbye = Math.floor(hoursWaited / 24)
    }

    // AC-4.5.4: Fire PostHog analytics event
    // Uses same event name as response processing for unified analytics (FR40)
    trackEvent(
      WhatsAppAnalyticsEvent.ENGAGEMENT_GOODBYE_RESPONSE,
      userId,
      {
        response_type: 'timeout',
        days_since_goodbye: daysSinceGoodbye,
        hours_waited: hoursWaited,
        from_state: 'goodbye_sent',
        to_state: 'dormant',
      }
    )
    sideEffects.push('tracked_goodbye_timeout_analytics')

    logger.info('Goodbye timeout processed (silence by design)', {
      userId,
      daysSinceGoodbye,
      hoursWaited,
    })

    // AC-4.5.3: Explicitly NO message queued
    // This is intentional dignified silence, not a bug
    sideEffects.push('no_message_sent_by_design')

    return sideEffects
  } catch (error) {
    logger.error('Unexpected error in executeGoodbyeTimeoutSideEffects', { userId }, error as Error)
    return sideEffects
  }
}

/**
 * Build state-specific update data for timestamps
 *
 * AC-4.1.1: State-specific timestamp updates
 * - goodbye_sent: set goodbye_sent_at, goodbye_expires_at
 * - remind_later: set remind_at
 * - active: clear all timestamps
 */
function buildStateUpdateData(
  targetState: EngagementState,
  now: Date
): Record<string, string | null> {
  const updateData: Record<string, string | null> = {}

  switch (targetState) {
    case 'goodbye_sent':
      updateData.goodbye_sent_at = now.toISOString()
      updateData.goodbye_expires_at = new Date(
        now.getTime() + GOODBYE_TIMEOUT_HOURS * 60 * 60 * 1000
      ).toISOString()
      break

    case 'remind_later':
      updateData.remind_at = new Date(
        now.getTime() + REMIND_LATER_DAYS * 24 * 60 * 60 * 1000
      ).toISOString()
      break

    case 'active':
      // Clear all engagement-related timestamps
      updateData.goodbye_sent_at = null
      updateData.goodbye_expires_at = null
      updateData.remind_at = null
      // Update last_activity_at when returning to active
      updateData.last_activity_at = now.toISOString()
      break

    case 'help_flow':
      // No special timestamp handling for help flow
      break

    case 'dormant':
      // Clear goodbye-related timestamps when transitioning to dormant
      updateData.goodbye_sent_at = null
      updateData.goodbye_expires_at = null
      updateData.remind_at = null
      break
  }

  return updateData
}

/**
 * Build full transition metadata with all analytics fields
 *
 * AC-4.7.1: Full context for engagement_state_transitions record
 * AC-4.7.3: response_type for goodbye responses (FR40)
 * AC-4.7.4: unprompted_return for organic returns (FR41)
 * AC-4.7.5: days_inactive for all transitions (FR42)
 *
 * @param trigger - The transition trigger
 * @param fromState - Previous engagement state
 * @param userState - User's engagement state record
 * @param daysInactive - Days since last activity
 * @param additionalMetadata - Optional extra metadata
 * @returns Full TransitionMetadata object
 */
function buildTransitionMetadata(
  trigger: TransitionTrigger,
  fromState: EngagementState,
  userState: UserEngagementState,
  daysInactive: number,
  additionalMetadata?: Record<string, unknown>
): TransitionMetadata {
  const metadata: TransitionMetadata = {
    days_inactive: daysInactive,
    ...(additionalMetadata as Record<string, unknown>),
  }

  // AC-4.7.3: Add response_type for goodbye triggers (FR40)
  const responseType = getGoodbyeResponseType(trigger)
  if (responseType) {
    metadata.response_type = responseType
    metadata.trigger_source = trigger === 'goodbye_timeout' ? 'scheduler' : 'user_message'

    // Add goodbye timing info for timeout tracking
    if (userState.goodbyeSentAt) {
      const hoursWaited = calculateHoursWaited(userState.goodbyeSentAt)
      metadata.hours_waited = hoursWaited
      metadata.days_since_goodbye = Math.floor(hoursWaited / 24)
    }
  }

  // AC-4.7.4: Check for unprompted return (FR41)
  if (isUnpromptedReturn(trigger, fromState, daysInactive)) {
    metadata.unprompted_return = true
    metadata.trigger_source = 'user_message'
  }

  // Set trigger_source if not already set
  if (!metadata.trigger_source) {
    metadata.trigger_source = trigger.startsWith('goodbye_timeout') ||
                              trigger === 'inactivity_14d' ||
                              trigger === 'reminder_due'
      ? 'scheduler'
      : 'user_message'
  }

  return metadata
}

// =============================================================================
// State Retrieval Functions
// =============================================================================

/**
 * Get the current engagement state for a user
 *
 * Returns 'active' as default state for new users who don't have a record yet.
 *
 * @param userId - The user's ID
 * @returns Current engagement state (defaults to 'active')
 */
export async function getEngagementState(userId: string): Promise<EngagementState> {
  const state = await getEngagementStateInternal(userId)
  return state?.state ?? 'active'
}

/**
 * Get the full engagement state record for a user
 *
 * @param userId - The user's ID
 * @returns Full UserEngagementState or null if not found
 */
export async function getEngagementStateRecord(
  userId: string
): Promise<UserEngagementState | null> {
  return getEngagementStateInternal(userId)
}

/**
 * Internal function to get engagement state from database
 */
async function getEngagementStateInternal(
  userId: string
): Promise<UserEngagementState | null> {
  const supabase = getSupabaseClient()

  try {
    const { data, error } = await supabase
      .from('user_engagement_states')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows found - user doesn't have engagement state
        return null
      }
      logger.error('Error fetching engagement state', { userId }, error)
      return null
    }

    if (!data) {
      return null
    }

    return mapRowToEngagementState(data as EngagementStateRow)
  } catch (error) {
    logger.error('Unexpected error fetching engagement state', { userId }, error as Error)
    return null
  }
}

/**
 * Map database row to UserEngagementState interface
 */
function mapRowToEngagementState(row: EngagementStateRow): UserEngagementState {
  return {
    id: row.id,
    userId: row.user_id,
    state: row.state,
    lastActivityAt: new Date(row.last_activity_at),
    goodbyeSentAt: row.goodbye_sent_at ? new Date(row.goodbye_sent_at) : null,
    goodbyeExpiresAt: row.goodbye_expires_at ? new Date(row.goodbye_expires_at) : null,
    remindAt: row.remind_at ? new Date(row.remind_at) : null,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  }
}

// =============================================================================
// State Initialization
// =============================================================================

/**
 * Initialize engagement state for a new user
 *
 * AC-4.1.4: Creates initial state with state='active', last_activity_at=now()
 *
 * @param userId - The user's ID
 * @returns The created engagement state or null on failure
 */
export async function initializeEngagementState(
  userId: string
): Promise<UserEngagementState | null> {
  const supabase = getSupabaseClient()
  const now = new Date()

  try {
    const { data, error } = await supabase
      .from('user_engagement_states')
      .insert({
        user_id: userId,
        state: 'active',
        last_activity_at: now.toISOString(),
      })
      .select()
      .single()

    if (error) {
      // Check if it's a unique constraint violation (user already has state)
      if (error.code === '23505') {
        logger.debug('Engagement state already exists (race condition)', { userId })
        // Return existing state
        return getEngagementStateInternal(userId)
      }
      logger.error('Failed to initialize engagement state', { userId }, error)
      return null
    }

    if (!data) {
      return null
    }

    logger.info('Initialized engagement state for new user', { userId })
    return mapRowToEngagementState(data as EngagementStateRow)
  } catch (error) {
    logger.error('Unexpected error initializing engagement state', { userId }, error as Error)
    return null
  }
}

// =============================================================================
// Query Helper Functions (for scheduler jobs)
// =============================================================================

/**
 * Get users who have been inactive for a specified number of days
 *
 * Returns users where state='active' AND last_activity_at < now - days
 * Used by scheduler to trigger inactivity_14d transitions
 *
 * @param days - Number of days of inactivity
 * @returns Array of inactive users
 */
export async function getInactiveUsers(days: number): Promise<UserEngagementState[]> {
  const supabase = getSupabaseClient()

  try {
    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

    const { data, error } = await supabase
      .from('user_engagement_states')
      .select('*')
      .eq('state', 'active')
      .lt('last_activity_at', cutoffDate.toISOString())

    if (error) {
      logger.error('Failed to fetch inactive users', { days }, error)
      return []
    }

    return (data || []).map((row) => mapRowToEngagementState(row as EngagementStateRow))
  } catch (error) {
    logger.error('Unexpected error fetching inactive users', { days }, error as Error)
    return []
  }
}

/**
 * Get users with expired goodbye messages
 *
 * Returns users where state='goodbye_sent' AND goodbye_expires_at < now
 * Used by scheduler to trigger goodbye_timeout transitions
 *
 * @returns Array of users with expired goodbye messages
 */
export async function getExpiredGoodbyes(): Promise<UserEngagementState[]> {
  const supabase = getSupabaseClient()

  try {
    const now = new Date()

    const { data, error } = await supabase
      .from('user_engagement_states')
      .select('*')
      .eq('state', 'goodbye_sent')
      .lt('goodbye_expires_at', now.toISOString())

    if (error) {
      logger.error('Failed to fetch expired goodbyes', {}, error)
      return []
    }

    return (data || []).map((row) => mapRowToEngagementState(row as EngagementStateRow))
  } catch (error) {
    logger.error('Unexpected error fetching expired goodbyes', {}, error as Error)
    return []
  }
}

/**
 * Get users with due reminders
 *
 * Returns users where state='remind_later' AND remind_at < now
 * Used by scheduler to trigger reminder_due transitions
 *
 * @returns Array of users with due reminders
 */
export async function getDueReminders(): Promise<UserEngagementState[]> {
  const supabase = getSupabaseClient()

  try {
    const now = new Date()

    const { data, error } = await supabase
      .from('user_engagement_states')
      .select('*')
      .eq('state', 'remind_later')
      .lt('remind_at', now.toISOString())

    if (error) {
      logger.error('Failed to fetch due reminders', {}, error)
      return []
    }

    return (data || []).map((row) => mapRowToEngagementState(row as EngagementStateRow))
  } catch (error) {
    logger.error('Unexpected error fetching due reminders', {}, error as Error)
    return []
  }
}

// =============================================================================
// Activity Tracking (will be fully implemented in Story 4.2)
// =============================================================================

/**
 * Update last activity timestamp for a user
 * Called on every user message to track engagement
 *
 * @param userId - The user's ID
 * @returns True if updated successfully
 */
export async function updateLastActivity(userId: string): Promise<boolean> {
  const supabase = getSupabaseClient()
  const now = new Date()

  try {
    const { error } = await supabase
      .from('user_engagement_states')
      .update({ last_activity_at: now.toISOString() })
      .eq('user_id', userId)

    if (error) {
      logger.error('Failed to update last activity', { userId }, error)
      return false
    }

    return true
  } catch (error) {
    logger.error('Unexpected error updating last activity', { userId }, error as Error)
    return false
  }
}

// =============================================================================
// Transition History Query Functions (AC-4.7.6, AC-4.7.9)
// =============================================================================

/**
 * Database row type for engagement_state_transitions table (for query results)
 */
interface TransitionHistoryRow {
  id: string
  user_id: string
  from_state: string
  to_state: string
  trigger: string
  metadata: Record<string, unknown> | null
  created_at: string
}

/**
 * Get a user's transition history for debugging and analysis
 *
 * AC-4.7.6: All transition logs queryable by user_id
 *
 * @param userId - The user's ID
 * @param limit - Maximum number of records (default 50)
 * @returns Array of state transitions, newest first
 */
export async function getUserTransitionHistory(
  userId: string,
  limit: number = 50
): Promise<StateTransition[]> {
  const supabase = getSupabaseClient()

  try {
    const { data, error } = await supabase
      .from('engagement_state_transitions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      logger.error('Failed to fetch user transition history', { userId, limit }, error)
      return []
    }

    return (data || []).map((row: TransitionHistoryRow) => ({
      id: row.id,
      userId: row.user_id,
      fromState: row.from_state as EngagementState,
      toState: row.to_state as EngagementState,
      trigger: row.trigger as TransitionTrigger,
      metadata: row.metadata as TransitionMetadata | null,
      createdAt: new Date(row.created_at),
    }))
  } catch (error) {
    logger.error('Unexpected error fetching transition history', { userId }, error as Error)
    return []
  }
}

/**
 * Statistics for state transitions
 */
export interface TransitionStats {
  totalTransitions: number
  transitionsByType: Record<string, number>
  responseTypeDistribution: Record<string, number>
  unpromptedReturns: number
  averageDaysInactive: number
}

/**
 * Get aggregate transition statistics for analytics
 *
 * AC-4.7.9: Aggregate stats for future dashboard
 *
 * @param startDate - Start of date range
 * @param endDate - End of date range
 * @returns Aggregate statistics
 */
export async function getTransitionStats(
  startDate: Date,
  endDate: Date
): Promise<TransitionStats> {
  const supabase = getSupabaseClient()
  const defaultStats: TransitionStats = {
    totalTransitions: 0,
    transitionsByType: {},
    responseTypeDistribution: {},
    unpromptedReturns: 0,
    averageDaysInactive: 0,
  }

  try {
    const { data, error } = await supabase
      .from('engagement_state_transitions')
      .select('*')
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString())

    if (error) {
      logger.error('Failed to fetch transition stats', { startDate, endDate }, error)
      return defaultStats
    }

    if (!data || data.length === 0) {
      return defaultStats
    }

    const stats: TransitionStats = {
      totalTransitions: data.length,
      transitionsByType: {},
      responseTypeDistribution: {},
      unpromptedReturns: 0,
      averageDaysInactive: 0,
    }

    let totalDaysInactive = 0
    let daysInactiveCount = 0

    for (const row of data as TransitionHistoryRow[]) {
      // Count transitions by trigger type
      const trigger = row.trigger
      stats.transitionsByType[trigger] = (stats.transitionsByType[trigger] || 0) + 1

      // Analyze metadata
      if (row.metadata) {
        const meta = row.metadata as TransitionMetadata

        // Count response types (FR40)
        if (meta.response_type) {
          stats.responseTypeDistribution[meta.response_type] =
            (stats.responseTypeDistribution[meta.response_type] || 0) + 1
        }

        // Count unprompted returns (FR41)
        if (meta.unprompted_return) {
          stats.unpromptedReturns++
        }

        // Sum days inactive for average (FR42)
        if (typeof meta.days_inactive === 'number') {
          totalDaysInactive += meta.days_inactive
          daysInactiveCount++
        }
      }
    }

    // Calculate average days inactive
    if (daysInactiveCount > 0) {
      stats.averageDaysInactive = Math.round(totalDaysInactive / daysInactiveCount)
    }

    return stats
  } catch (error) {
    logger.error('Unexpected error calculating transition stats', { startDate, endDate }, error as Error)
    return defaultStats
  }
}

// Re-export types and validation functions
export { getTransitionTarget } from './types.js'
export type { EngagementState, TransitionTrigger, UserEngagementState } from './types.js'
