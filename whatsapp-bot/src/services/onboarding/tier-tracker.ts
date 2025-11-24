/**
 * Tier Tracker Service
 *
 * Tracks user progression through onboarding tiers and magic moments.
 * Part of the Smart Onboarding & Engagement System (Epic 2, Epic 3).
 *
 * Epic 3, Story 3.1: Tier Progress Tracking Service
 * - AC-3.1.1: recordAction() updates JSONB atomically
 * - AC-3.1.2: Tier 1 completion detection
 * - AC-3.1.3: Tier 2 completion detection
 * - AC-3.1.4: Tier 3 completion detection
 * - AC-3.1.5: Idempotent action recording
 * - AC-3.1.6: onboarding_tier column updated to highest completed tier
 * - AC-3.1.7: getTierProgress() returns typed TierProgress
 */

import { getSupabaseClient } from '../database/supabase-client.js'
import { trackEvent } from '../../analytics/index.js'
import { logger } from '../monitoring/logger.js'
import { TierProgress } from '../engagement/types.js'
import { TierAction } from '../../handlers/engagement/tier-progress-handler.js'
import {
  TIER_1_ACTIONS,
  TIER_2_ACTIONS,
  TIER_3_ACTIONS,
} from '../engagement/constants.js'

/**
 * Result of recording a magic moment
 */
export interface MagicMomentResult {
  isFirstMagicMoment: boolean
  timestamp?: Date
}

/**
 * Expense data for analytics tracking
 */
export interface ExpenseData {
  amount: number
  category: string
}

/**
 * Record magic moment - first NLP-parsed expense
 *
 * AC-2.5.1: First NLP expense sets magic_moment_at = now()
 * AC-2.5.2: PostHog event onboarding_magic_moment fired with timestamp
 * AC-2.5.3: Explicit commands do NOT trigger magic moment (caller passes wasNlpParsed=false)
 * AC-2.5.4: Subsequent NLP expenses do NOT update timestamp (idempotency check)
 *
 * @param userId - User ID
 * @param wasNlpParsed - True if expense was parsed via NLP (not explicit command)
 * @param expenseData - Optional expense details for analytics
 * @returns Result indicating if this was the first magic moment
 */
export async function recordMagicMoment(
  userId: string,
  wasNlpParsed: boolean,
  expenseData?: ExpenseData
): Promise<MagicMomentResult> {
  // AC-2.5.3: Explicit commands should NOT trigger magic moment
  if (!wasNlpParsed) {
    logger.debug('Magic moment skipped - not NLP parsed', { userId })
    return { isFirstMagicMoment: false }
  }

  const supabase = getSupabaseClient()

  try {
    // AC-2.5.4: Check if magic_moment_at is already set (idempotency check)
    const { data: profile, error: fetchError } = await supabase
      .from('user_profiles')
      .select('magic_moment_at, created_at')
      .eq('user_id', userId)
      .single()

    if (fetchError) {
      logger.error('Failed to fetch user profile for magic moment', { userId }, fetchError)
      return { isFirstMagicMoment: false }
    }

    // AC-2.5.4: If already set, return false without update or event
    if (profile?.magic_moment_at) {
      logger.debug('Magic moment already recorded', {
        userId,
        existingTimestamp: profile.magic_moment_at
      })
      return { isFirstMagicMoment: false }
    }

    // AC-2.5.1: Set magic_moment_at = now()
    const now = new Date()

    // Atomic update with WHERE magic_moment_at IS NULL to prevent race conditions
    const { data: updated, error: updateError } = await supabase
      .from('user_profiles')
      .update({ magic_moment_at: now.toISOString() })
      .eq('user_id', userId)
      .is('magic_moment_at', null) // Only update if still null (prevents race condition)
      .select('magic_moment_at, created_at')
      .single()

    if (updateError) {
      // Check if it's a "no rows returned" error (race condition - another request beat us)
      if (updateError.code === 'PGRST116') {
        logger.debug('Magic moment race condition - already set by another request', { userId })
        return { isFirstMagicMoment: false }
      }
      logger.error('Failed to update magic moment', { userId }, updateError)
      return { isFirstMagicMoment: false }
    }

    if (!updated) {
      // Race condition: another request set magic_moment_at between our check and update
      logger.debug('Magic moment not updated - race condition', { userId })
      return { isFirstMagicMoment: false }
    }

    // Calculate time since signup (in days)
    const signupDate = profile?.created_at ? new Date(profile.created_at) : now
    const timeSinceSignupDays = (now.getTime() - signupDate.getTime()) / (1000 * 60 * 60 * 24)

    // AC-2.5.2: Fire PostHog event with properties
    // AC-2.5.4: Event properties include first_expense_category, first_expense_amount, time_since_signup
    trackEvent(
      'onboarding_magic_moment',
      userId,
      {
        first_expense_category: expenseData?.category || 'unknown',
        first_expense_amount: expenseData?.amount || 0,
        time_since_signup: Number(timeSinceSignupDays.toFixed(2)),
        timestamp: now.toISOString(),
      }
    )

    logger.info('Magic moment recorded', {
      userId,
      timestamp: now.toISOString(),
      timeSinceSignupDays: timeSinceSignupDays.toFixed(2),
      expenseCategory: expenseData?.category,
      expenseAmount: expenseData?.amount,
    })

    return {
      isFirstMagicMoment: true,
      timestamp: now,
    }
  } catch (error) {
    logger.error('Unexpected error recording magic moment', { userId }, error as Error)
    return { isFirstMagicMoment: false }
  }
}

// =============================================================================
// Tier Progress Tracking (Story 3.1)
// =============================================================================

/**
 * Result of recording a tier action
 * AC-3.1.1, AC-3.1.2, AC-3.1.3, AC-3.1.4
 */
export interface TierUpdate {
  action: TierAction
  tierCompleted: number | null // null if no tier completed by this action
  shouldSendUnlock: boolean    // true only on FIRST completion
}

/**
 * Default empty tier progress structure
 */
const DEFAULT_TIER_PROGRESS: TierProgress = {
  tier1: {
    add_expense: false,
    edit_category: false,
    delete_expense: false,
    add_category: false,
  },
  tier2: {
    set_budget: false,
    add_recurring: false,
    list_categories: false,
  },
  tier3: {
    edit_category: false,
    view_report: false,
  },
}

/**
 * Get user's current tier progress
 *
 * AC-3.1.7: Returns typed TierProgress object with current state of all tiers
 *
 * @param userId - The user's ID
 * @returns TierProgress object with current state
 */
export async function getTierProgress(userId: string): Promise<TierProgress> {
  const supabase = getSupabaseClient()

  try {
    const { data: profile, error } = await supabase
      .from('user_profiles')
      .select('onboarding_tier_progress')
      .eq('user_id', userId)
      .single()

    if (error) {
      logger.warn('Could not fetch tier progress', { userId, error: error.message })
      return { ...DEFAULT_TIER_PROGRESS }
    }

    // Merge stored progress with defaults to ensure all fields exist
    const stored = profile?.onboarding_tier_progress as TierProgress | null
    if (!stored) {
      return { ...DEFAULT_TIER_PROGRESS }
    }

    return {
      tier1: { ...DEFAULT_TIER_PROGRESS.tier1, ...stored.tier1 },
      tier2: { ...DEFAULT_TIER_PROGRESS.tier2, ...stored.tier2 },
      tier3: { ...DEFAULT_TIER_PROGRESS.tier3, ...stored.tier3 },
      magic_moment_at: stored.magic_moment_at,
    }
  } catch (error) {
    logger.error('Unexpected error fetching tier progress', { userId }, error as Error)
    return { ...DEFAULT_TIER_PROGRESS }
  }
}

/**
 * Record a user action and check for tier completion
 *
 * AC-3.1.1: Updates onboarding_tier_progress JSONB atomically
 * AC-3.1.5: Idempotent - re-recording same action = no-op (no error, no duplicate timestamp)
 *
 * @param userId - The user's ID
 * @param action - The action performed
 * @returns TierUpdate with completion info
 */
export async function recordAction(userId: string, action: TierAction): Promise<TierUpdate> {
  const supabase = getSupabaseClient()

  try {
    // Get current progress first
    const currentProgress = await getTierProgress(userId)

    // Determine which tier(s) this action belongs to
    const tierUpdates: Record<string, boolean> = {}

    if ((TIER_1_ACTIONS as readonly string[]).includes(action)) {
      tierUpdates[`tier1.${action}`] = true
    }
    if ((TIER_2_ACTIONS as readonly string[]).includes(action)) {
      tierUpdates[`tier2.${action}`] = true
    }
    if ((TIER_3_ACTIONS as readonly string[]).includes(action)) {
      tierUpdates[`tier3.${action}`] = true
    }

    // Build JSONB update for atomic merge
    // Use SQL jsonb_deep_merge via RPC or build nested object
    const progressUpdate: Partial<TierProgress> = {}

    if ((TIER_1_ACTIONS as readonly string[]).includes(action)) {
      progressUpdate.tier1 = {
        ...currentProgress.tier1,
        [action]: true,
      }
    }
    if ((TIER_2_ACTIONS as readonly string[]).includes(action)) {
      progressUpdate.tier2 = {
        ...currentProgress.tier2,
        [action]: true,
      }
    }
    if ((TIER_3_ACTIONS as readonly string[]).includes(action)) {
      progressUpdate.tier3 = {
        ...currentProgress.tier3,
        [action]: true,
      }
    }

    // Merge with current progress for full update
    const newProgress: TierProgress = {
      tier1: { ...currentProgress.tier1, ...progressUpdate.tier1 },
      tier2: { ...currentProgress.tier2, ...progressUpdate.tier2 },
      tier3: { ...currentProgress.tier3, ...progressUpdate.tier3 },
      magic_moment_at: currentProgress.magic_moment_at,
    }

    // Check tier completions BEFORE update to detect new completions
    const wasT1Complete = isTierComplete(currentProgress, 1)
    const wasT2Complete = isTierComplete(currentProgress, 2)
    const wasT3Complete = isTierComplete(currentProgress, 3)

    // Check tier completions AFTER update
    const isT1Complete = isTierComplete(newProgress, 1)
    const isT2Complete = isTierComplete(newProgress, 2)
    const isT3Complete = isTierComplete(newProgress, 3)

    // Determine if a tier was newly completed
    let newlyCompletedTier: number | null = null
    const now = new Date().toISOString()

    if (isT1Complete && !wasT1Complete) {
      newlyCompletedTier = 1
      newProgress.tier1.completed_at = now
    }
    if (isT2Complete && !wasT2Complete) {
      newlyCompletedTier = 2
      newProgress.tier2.completed_at = now
    }
    if (isT3Complete && !wasT3Complete) {
      newlyCompletedTier = 3
      newProgress.tier3.completed_at = now
    }

    // Calculate highest completed tier for onboarding_tier column
    let highestTier = 0
    if (isT1Complete) highestTier = 1
    if (isT2Complete) highestTier = 2
    if (isT3Complete) highestTier = 3

    // AC-3.1.1: Atomic JSONB update
    const { error: updateError } = await supabase
      .from('user_profiles')
      .update({
        onboarding_tier_progress: newProgress,
        onboarding_tier: highestTier,
      })
      .eq('user_id', userId)

    if (updateError) {
      logger.error('Failed to update tier progress', { userId, action }, updateError)
      return { action, tierCompleted: null, shouldSendUnlock: false }
    }

    logger.info('Tier action recorded', {
      userId,
      action,
      tierCompleted: newlyCompletedTier,
      highestTier,
    })

    // Story 3.6: Fire PostHog analytics event on tier completion
    // AC-3.6.1: Fire event onboarding_tier_completed
    // AC-3.6.2: Include tier, completed_at, time_to_complete_days, days_since_signup
    if (newlyCompletedTier !== null) {
      fireTierCompletionAnalytics(userId, newlyCompletedTier, currentProgress, now)
    }

    return {
      action,
      tierCompleted: newlyCompletedTier,
      shouldSendUnlock: newlyCompletedTier !== null,
    }
  } catch (error) {
    logger.error('Unexpected error recording tier action', { userId, action }, error as Error)
    return { action, tierCompleted: null, shouldSendUnlock: false }
  }
}

/**
 * Check if a specific tier is complete
 *
 * AC-3.1.2: Tier 1 complete when all 4 actions done
 * AC-3.1.3: Tier 2 complete when all 3 actions done
 * AC-3.1.4: Tier 3 complete when all 2 actions done
 *
 * @param userId - The user's ID
 * @param tier - The tier to check (1, 2, or 3)
 * @returns true if all actions in the tier are complete
 */
export async function checkTierCompletion(
  userId: string,
  tier: 1 | 2 | 3
): Promise<boolean> {
  const progress = await getTierProgress(userId)
  return isTierComplete(progress, tier)
}

/**
 * Internal helper to check tier completion from progress object
 */
function isTierComplete(progress: TierProgress, tier: 1 | 2 | 3): boolean {
  switch (tier) {
    case 1:
      return (
        progress.tier1.add_expense &&
        progress.tier1.edit_category &&
        progress.tier1.delete_expense &&
        progress.tier1.add_category
      )
    case 2:
      return (
        progress.tier2.set_budget &&
        progress.tier2.add_recurring &&
        progress.tier2.list_categories
      )
    case 3:
      return (
        progress.tier3.edit_category &&
        progress.tier3.view_report
      )
    default:
      return false
  }
}

// =============================================================================
// Fire-and-Forget Helper (Story 3.2, 3.3)
// =============================================================================

/**
 * Track a tier action in a fire-and-forget manner
 *
 * AC-3.2.9: Tier tracking does NOT block or slow down primary handler response
 * Story 3.3: Also triggers tier celebration if tier completed
 *
 * This helper:
 * - Calls recordAction asynchronously
 * - If tier completed, calls handleTierCompletionAsync
 * - Catches and logs any errors
 * - Never throws - primary handler always succeeds
 *
 * @param userId - The user's ID
 * @param action - The action performed
 */
export function trackTierAction(userId: string, action: TierAction): void {
  recordAction(userId, action)
    .then((tierUpdate) => {
      // Story 3.3: Trigger celebration if tier was completed
      if (tierUpdate.tierCompleted !== null && tierUpdate.shouldSendUnlock) {
        // Dynamic import to avoid circular dependency
        import('../../handlers/engagement/tier-progress-handler.js')
          .then(({ handleTierCompletionAsync }) => {
            handleTierCompletionAsync(userId, tierUpdate)
          })
          .catch((err) => {
            logger.error('Failed to load tier-progress-handler', {
              userId,
              action,
              error: err instanceof Error ? err.message : String(err),
            })
          })
      }
    })
    .catch((err) => {
      logger.error('Tier tracking failed (non-blocking)', {
        userId,
        action,
        error: err instanceof Error ? err.message : String(err),
      })
      // Don't throw - primary handler should still succeed
    })
}

// =============================================================================
// Tips Preference (Story 3.5)
// =============================================================================

/**
 * Check if onboarding tips are enabled for a user
 *
 * AC-3.5.3: With tips disabled, tier completions tracked but NOT celebrated
 * AC-3.5.4: Tip preference is separate from re-engagement opt-out
 *
 * @param userId - The user's ID
 * @returns true if tips are enabled (default), false if disabled
 */
export async function areTipsEnabled(userId: string): Promise<boolean> {
  const supabase = getSupabaseClient()

  try {
    const { data: profile, error } = await supabase
      .from('user_profiles')
      .select('onboarding_tips_enabled')
      .eq('user_id', userId)
      .single()

    if (error) {
      logger.warn('Could not fetch tip preference', { userId, error: error.message })
      // Default to true (tips enabled) on error
      return true
    }

    // Default to true if column is null (new users)
    return profile?.onboarding_tips_enabled ?? true
  } catch (error) {
    logger.error('Unexpected error checking tip preference', { userId }, error as Error)
    // Default to true on error
    return true
  }
}

// =============================================================================
// Tier Completion Analytics (Story 3.6)
// =============================================================================

/**
 * Fire PostHog analytics event for tier completion
 *
 * AC-3.6.1: Fire event onboarding_tier_completed
 * AC-3.6.2: Include tier, completed_at, time_to_complete_days, days_since_signup
 *
 * Fire-and-forget - errors are logged but don't block caller
 */
function fireTierCompletionAnalytics(
  userId: string,
  tier: number,
  currentProgress: TierProgress,
  completedAt: string
): void {
  // Async analytics - don't block the main flow
  calculateAnalyticsData(userId, tier, currentProgress)
    .then(({ daysSinceSignup, timeToCompleteDays }) => {
      trackEvent('onboarding_tier_completed', userId, {
        tier,
        completed_at: completedAt,
        time_to_complete_days: timeToCompleteDays,
        days_since_signup: daysSinceSignup,
      })

      logger.info('Tier completion analytics fired', {
        userId,
        tier,
        timeToCompleteDays,
        daysSinceSignup,
      })
    })
    .catch((err) => {
      logger.error('Failed to fire tier completion analytics', {
        userId,
        tier,
        error: err instanceof Error ? err.message : String(err),
      })
    })
}

/**
 * Calculate analytics data for tier completion
 *
 * AC-3.6.2: Calculate time_to_complete_days and days_since_signup
 *
 * @param userId - User ID
 * @param tier - Completed tier (1, 2, or 3)
 * @param currentProgress - Current tier progress (before this completion)
 */
async function calculateAnalyticsData(
  userId: string,
  tier: number,
  currentProgress: TierProgress
): Promise<{ daysSinceSignup: number; timeToCompleteDays: number }> {
  const supabase = getSupabaseClient()

  // Fetch user signup date
  const { data: profile, error } = await supabase
    .from('user_profiles')
    .select('created_at')
    .eq('user_id', userId)
    .single()

  if (error || !profile?.created_at) {
    logger.warn('Could not fetch created_at for analytics', { userId })
    return { daysSinceSignup: 0, timeToCompleteDays: 0 }
  }

  const signupDate = new Date(profile.created_at)
  const now = new Date()

  // Days since signup
  const daysSinceSignup = Math.floor(
    (now.getTime() - signupDate.getTime()) / (1000 * 60 * 60 * 24)
  )

  // Time to complete this tier
  // AC-3.6.2: For Tier 1, from signup. For T2/T3, from previous tier completion.
  const timeToCompleteDays = calculateTimeToComplete(
    tier,
    currentProgress,
    signupDate,
    now
  )

  return { daysSinceSignup, timeToCompleteDays }
}

/**
 * Calculate days to complete a tier
 *
 * - Tier 1: days from signup to now
 * - Tier 2: days from tier1.completed_at to now (fallback to signup if not set)
 * - Tier 3: days from tier2.completed_at to now (fallback to signup if not set)
 */
function calculateTimeToComplete(
  tier: number,
  progress: TierProgress,
  signupDate: Date,
  now: Date
): number {
  let startDate: Date

  if (tier === 1) {
    // Tier 1: from signup
    startDate = signupDate
  } else if (tier === 2) {
    // Tier 2: from Tier 1 completion (or signup if not set)
    startDate = progress.tier1.completed_at
      ? new Date(progress.tier1.completed_at)
      : signupDate
  } else if (tier === 3) {
    // Tier 3: from Tier 2 completion (or signup if not set)
    startDate = progress.tier2.completed_at
      ? new Date(progress.tier2.completed_at)
      : signupDate
  } else {
    startDate = signupDate
  }

  return Math.floor((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
}

// Re-export TierAction and TierProgress for convenience
export type { TierAction, TierProgress }
