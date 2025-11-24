/**
 * Contextual Hints Handler
 *
 * Provides contextual hints/tips after user actions to help discover features naturally.
 *
 * Epic: 2 - Conversation-First Welcome
 * Story: 2.6 - Contextual Hints After Actions
 */

import { getSupabaseClient } from '../../services/database/supabase-client.js'
import { logger } from '../../services/monitoring/logger.js'

// =============================================================================
// Interfaces
// =============================================================================

/**
 * Context for generating contextual hints
 */
export interface HintContext {
  action: 'add_expense' | 'add_income' | 'add_category' | 'set_budget' | 'view_report'
  categoryId?: string
  categoryName?: string
  isFirstExpense?: boolean
}

/**
 * User profile data needed for hint generation
 */
interface UserHintProfile {
  onboardingTier: number
  tipsEnabled: boolean
  magicMomentAt: string | null
}

/**
 * Localization messages for hints
 */
export interface HintMessages {
  engagementHintFirstExpenseCategory: string
  engagementHintBudgetSuggestion: (count: number, category: string) => string
}

// =============================================================================
// Main Function
// =============================================================================

/**
 * Get contextual hint to append to action response
 *
 * AC-2.6.1: First expense includes category creation hint
 * AC-2.6.2: 3+ expenses in same category includes budget hint
 * AC-2.6.3: Tier 2+ users get NO basic hints
 * AC-2.6.4: Opted-out users get NO hints
 * AC-2.6.5: Hints are appended (not separate message)
 *
 * @param userId - User ID
 * @param context - Hint context (action, category, etc.)
 * @param messages - Localized hint messages
 * @returns Hint string or null if no hint applicable
 */
export async function getContextualHint(
  userId: string,
  context: HintContext,
  messages: HintMessages
): Promise<string | null> {
  try {
    // Get user profile for tier and opt-out check
    const profile = await getUserHintProfile(userId)

    // AC-2.6.3: Tier 2+ users get NO basic hints
    if (profile.onboardingTier >= 2) {
      logger.debug('Skipping hint - user is Tier 2+', { userId, tier: profile.onboardingTier })
      return null
    }

    // AC-2.6.4: Opted-out users get NO hints
    if (!profile.tipsEnabled) {
      logger.debug('Skipping hint - user opted out of tips', { userId })
      return null
    }

    // Only provide hints for add_expense action currently
    if (context.action !== 'add_expense') {
      return null
    }

    // AC-2.6.1: First expense ever - suggest custom categories
    if (context.isFirstExpense) {
      logger.info('Providing first expense category hint', { userId })
      return `\n\n${messages.engagementHintFirstExpenseCategory}`
    }

    // AC-2.6.2: 3+ expenses in same category - suggest budget
    if (context.categoryId && context.categoryName) {
      const categoryCount = await getCategoryExpenseCount(userId, context.categoryId)

      if (categoryCount >= 3) {
        logger.info('Providing budget suggestion hint', {
          userId,
          categoryName: context.categoryName,
          count: categoryCount,
        })
        return `\n\n${messages.engagementHintBudgetSuggestion(categoryCount, context.categoryName)}`
      }
    }

    return null
  } catch (error) {
    logger.error('Error getting contextual hint', { userId }, error as Error)
    return null // Fail silently - hints are non-critical
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get user profile data needed for hint decisions
 */
async function getUserHintProfile(userId: string): Promise<UserHintProfile> {
  const supabase = getSupabaseClient()

  const { data: profile, error } = await supabase
    .from('user_profiles')
    .select('onboarding_tier, tips_opt_out, magic_moment_at')
    .eq('user_id', userId)
    .single()

  if (error) {
    logger.warn('Could not fetch user profile for hints', { userId, error: error.message })
    // Return safe defaults that suppress hints
    return {
      onboardingTier: 2, // Assume Tier 2+ to suppress hints
      tipsEnabled: false,
      magicMomentAt: null,
    }
  }

  return {
    onboardingTier: profile?.onboarding_tier ?? 0,
    tipsEnabled: profile?.tips_opt_out !== true, // tips_opt_out = true means disabled
    magicMomentAt: profile?.magic_moment_at ?? null,
  }
}

/**
 * Count how many expenses the user has in a specific category
 *
 * Only counts this month's expenses to keep hints relevant
 */
async function getCategoryExpenseCount(userId: string, categoryId: string): Promise<number> {
  const supabase = getSupabaseClient()

  // Get start of current month
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .split('T')[0]

  const { count, error } = await supabase
    .from('transactions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('category_id', categoryId)
    .eq('type', 'expense')
    .gte('date', startOfMonth)

  if (error) {
    logger.warn('Could not count category expenses for hints', {
      userId,
      categoryId,
      error: error.message,
    })
    return 0
  }

  return count ?? 0
}

/**
 * Check if this is the user's first expense ever
 *
 * Uses transaction count rather than magic_moment_at to ensure accuracy
 */
export async function isFirstExpense(userId: string): Promise<boolean> {
  const supabase = getSupabaseClient()

  const { count, error } = await supabase
    .from('transactions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('type', 'expense')

  if (error) {
    logger.warn('Could not check first expense status', { userId, error: error.message })
    return false
  }

  // If count is 1, this is the first expense (just created)
  return count === 1
}
