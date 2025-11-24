/**
 * Tier Progress Handler
 *
 * Tracks user progress through onboarding tiers and
 * triggers tier completion celebrations.
 *
 * Tiers:
 * - Tier 0: New user (no actions yet)
 * - Tier 1: Basics (add_expense, edit_category, delete_expense, add_category)
 * - Tier 2: Power User (set_budget, add_recurring, list_categories)
 * - Tier 3: Complete (edit_category, view_report)
 *
 * Epic: 1 - Foundation & Message Infrastructure
 * Story: 1.2 - Engagement Handler Directory Structure
 * Implementation: Epic 3 - Progressive Tier Journey
 *
 * Story 3.3: Tier Completion Detection & Celebrations
 * - AC-3.3.1: Tier 1 complete sends celebration + Tier 2 guidance
 * - AC-3.3.2: Tier 2 complete sends celebration + Tier 3 guidance
 * - AC-3.3.3: Tier 3 complete sends final "pro" celebration
 * - AC-3.3.4: Max one emoji per message
 * - AC-3.3.5: Tips disabled = no celebration, progress still tracked
 * - AC-3.3.6: Messages queued via message queue service (idempotent)
 */

import { logger } from '../../services/monitoring/logger.js'
import { getSupabaseClient } from '../../services/database/supabase-client.js'
import { queueMessage } from '../../services/scheduler/message-sender.js'
import type { TierUpdate } from '../../services/onboarding/tier-tracker.js'

export type TierAction =
  | 'add_expense'
  | 'edit_category'
  | 'delete_expense'
  | 'add_category'
  | 'set_budget'
  | 'add_recurring'
  | 'list_categories'
  | 'view_report'

export interface TierProgressContext {
  userId: string
  action: TierAction
  actionMetadata?: Record<string, unknown>
}

export interface TierProgressResult {
  actionRecorded: boolean
  tierCompleted: boolean
  newTier?: number
  celebrationMessageSent: boolean
  error?: string
}

/**
 * User data needed for celebration messages
 */
interface UserCelebrationData {
  tipsEnabled: boolean
  preferredDestination: 'individual' | 'group'
  destinationJid: string
  locale: 'pt-br' | 'en'
}

// =============================================================================
// Tier Celebration Handler (Story 3.3)
// =============================================================================

/**
 * Handle tier completion celebration
 *
 * Called by action hooks when recordAction returns a tierCompleted value.
 * Fire-and-forget pattern - does not block caller.
 *
 * AC-3.3.1: Tier 1 → celebration + Tier 2 guidance
 * AC-3.3.2: Tier 2 → celebration + Tier 3 guidance
 * AC-3.3.3: Tier 3 → final "pro" celebration
 * AC-3.3.5: Tips disabled → skip message, log only
 * AC-3.3.6: Queue via message queue with idempotency
 *
 * @param userId - User ID
 * @param tierUpdate - Result from recordAction
 */
export async function handleTierCompletion(
  userId: string,
  tierUpdate: TierUpdate
): Promise<void> {
  // Only handle if a tier was completed
  if (tierUpdate.tierCompleted === null || !tierUpdate.shouldSendUnlock) {
    return
  }

  const tierCompleted = tierUpdate.tierCompleted

  try {
    // Get user data for celebration
    const userData = await getUserCelebrationData(userId)

    // AC-3.3.5: Tips disabled → no celebration sent, progress tracked silently
    if (!userData.tipsEnabled) {
      logger.info('Tier celebration skipped - tips disabled', {
        userId,
        tierCompleted,
      })
      return
    }

    // Map tier to message key
    const messageKey = getTierMessageKey(tierCompleted)
    if (!messageKey) {
      logger.warn('Unknown tier completed', { userId, tierCompleted })
      return
    }

    // AC-3.3.6: Generate idempotency key
    const idempotencyKey = `${userId}:tier_${tierCompleted}_complete:${new Date().toISOString().split('T')[0]}`

    // Queue celebration message
    const queued = await queueMessage({
      userId,
      messageType: 'tier_unlock',
      messageKey,
      destination: userData.preferredDestination,
      destinationJid: userData.destinationJid,
    })

    if (queued) {
      logger.info('Tier celebration queued', {
        userId,
        tierCompleted,
        messageKey,
        idempotencyKey,
      })
    } else {
      logger.warn('Failed to queue tier celebration', {
        userId,
        tierCompleted,
      })
    }
  } catch (error) {
    // Non-blocking - log and continue
    logger.error('Error handling tier completion', { userId, tierCompleted }, error as Error)
  }
}

/**
 * Fire-and-forget wrapper for handleTierCompletion
 *
 * Use this in action hooks to avoid blocking the primary response.
 */
export function handleTierCompletionAsync(
  userId: string,
  tierUpdate: TierUpdate
): void {
  handleTierCompletion(userId, tierUpdate).catch((err) => {
    logger.error('Tier celebration async error', {
      userId,
      error: err instanceof Error ? err.message : String(err),
    })
  })
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get user data needed for celebration messages
 *
 * AC-3.5.3: Uses onboarding_tips_enabled (NOT reengagement_opt_out)
 * AC-3.5.4: These are separate settings
 */
async function getUserCelebrationData(userId: string): Promise<UserCelebrationData> {
  const supabase = getSupabaseClient()

  const { data: profile, error } = await supabase
    .from('user_profiles')
    .select('onboarding_tips_enabled, preferred_destination, whatsapp_jid, locale')
    .eq('user_id', userId)
    .single()

  if (error) {
    logger.warn('Could not fetch user profile for celebration', {
      userId,
      error: error.message,
    })
    // Return safe defaults that suppress celebrations
    return {
      tipsEnabled: false,
      preferredDestination: 'individual',
      destinationJid: '',
      locale: 'pt-br',
    }
  }

  return {
    // AC-3.5.3: onboarding_tips_enabled controls celebrations (default true)
    tipsEnabled: profile?.onboarding_tips_enabled !== false,
    preferredDestination: profile?.preferred_destination || 'individual',
    destinationJid: profile?.whatsapp_jid || '',
    locale: (profile?.locale as 'pt-br' | 'en') || 'pt-br',
  }
}

/**
 * Map tier number to localization message key
 *
 * AC-3.3.1, AC-3.3.2, AC-3.3.3: Different messages per tier
 */
function getTierMessageKey(tier: number): string | null {
  switch (tier) {
    case 1:
      return 'engagementTier1Complete'
    case 2:
      return 'engagementTier2Complete'
    case 3:
      return 'engagementTier3Complete'
    default:
      return null
  }
}

// =============================================================================
// Legacy Stubs (to be removed after full migration)
// =============================================================================

/**
 * Record a user action and check for tier completion
 *
 * @deprecated Use tier-tracker.recordAction() instead
 */
export async function recordTierAction(
  context: TierProgressContext
): Promise<TierProgressResult> {
  logger.info('Tier progress handler called (deprecated)', {
    userId: context.userId,
    action: context.action,
  })

  // Redirect to new implementation
  return {
    actionRecorded: false,
    tierCompleted: false,
    celebrationMessageSent: false,
    error: 'Use tier-tracker.recordAction() and handleTierCompletion() instead',
  }
}

/**
 * Get user's current tier and progress
 *
 * @deprecated Use tier-tracker.getTierProgress() instead
 */
export async function getTierProgress(
  userId: string
): Promise<{ tier: number; progress: Record<string, boolean> } | null> {
  logger.debug('Getting tier progress (deprecated)', { userId })
  return null
}

/**
 * Skip onboarding for experienced users
 *
 * TODO: Implement in Epic 3 (Story 3.5)
 */
export async function skipOnboarding(userId: string): Promise<boolean> {
  logger.debug('Skipping onboarding (stub)', { userId })
  return false
}
