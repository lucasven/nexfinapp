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
 * AC-6.4.3: Tier completion tips are INDEPENDENT of reengagement_opt_out
 *
 * IMPORTANT DISTINCTION (Story 6.4):
 * - onboarding_tips_enabled: Controls tier completion tips (THIS function)
 * - reengagement_opt_out: Controls goodbye/weekly review messages (scheduler jobs)
 *
 * Users who opt out of re-engagement messages STILL receive tier completion tips.
 * This is intentional - onboarding tips are contextual help after user actions,
 * while re-engagement messages are push notifications to inactive users.
 */
async function getUserCelebrationData(userId: string): Promise<UserCelebrationData> {
  const supabase = getSupabaseClient()

  // Note: We deliberately do NOT check reengagement_opt_out here (AC-6.4.3)
  // Fetch profile data
  const { data: profile, error: profileError } = await supabase
    .from('user_profiles')
    .select('onboarding_tips_enabled, preferred_destination, locale')
    .eq('user_id', userId)
    .single()

  if (profileError) {
    logger.warn('Could not fetch user profile for celebration', {
      userId,
      error: profileError.message,
    })
    // Return safe defaults that suppress celebrations
    return {
      tipsEnabled: false,
      preferredDestination: 'individual',
      destinationJid: '',
      locale: 'pt-br',
    }
  }

  // Fetch whatsapp_jid from authorized_whatsapp_numbers (primary first, then first by creation date)
  const { data: authorizedNumber, error: numberError } = await supabase
    .from('authorized_whatsapp_numbers')
    .select('whatsapp_jid, whatsapp_number')
    .eq('user_id', userId)
    .order('is_primary', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(1)
    .single()

  if (numberError && numberError.code !== 'PGRST116') {
    // PGRST116 = no rows returned, which is fine (user might not have authorized number yet)
    logger.warn('Could not fetch authorized number for celebration', {
      userId,
      error: numberError.message,
    })
  }

  // Build destination JID: prefer whatsapp_jid, fallback to formatted whatsapp_number
  const destinationJid =
    authorizedNumber?.whatsapp_jid ||
    (authorizedNumber?.whatsapp_number
      ? `${authorizedNumber.whatsapp_number}@s.whatsapp.net`
      : '')

  return {
    // AC-3.5.3: onboarding_tips_enabled controls celebrations (default true)
    tipsEnabled: profile?.onboarding_tips_enabled !== false,
    preferredDestination: profile?.preferred_destination || 'individual',
    destinationJid,
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

