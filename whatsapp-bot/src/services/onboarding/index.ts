/**
 * Onboarding Services Index
 *
 * Re-exports all onboarding-related services for convenient imports.
 *
 * Epic 2 & 3: Smart Onboarding & Progressive Tier Journey
 */

// Greeting services
export { sendOnboardingGreeting, processOnboardingMessages } from './greeting-sender.js'
export { queueGreetingForNewUser, shouldReceiveGreeting } from './queue-greeting.js'

// Tier tracking services (Story 3.1, 3.2)
export {
  // Magic moment
  recordMagicMoment,
  type MagicMomentResult,
  type ExpenseData,
  // Tier progress tracking
  getTierProgress,
  recordAction,
  checkTierCompletion,
  type TierUpdate,
  // Fire-and-forget helper (Story 3.2)
  trackTierAction,
  // Re-exported types
  type TierAction,
  type TierProgress,
} from './tier-tracker.js'
