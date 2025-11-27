/**
 * Engagement Handlers
 *
 * Re-exports all engagement-related message handlers.
 * These handlers manage the Smart Onboarding & Engagement System.
 *
 * Epic: 1 - Foundation & Message Infrastructure
 * Story: 1.2 - Engagement Handler Directory Structure
 */

// Goodbye/Self-Select handlers (Epic 4)
export {
  handleGoodbyeResponse,
  parseGoodbyeResponse,
  processGoodbyeResponse,
  isGoodbyeResponse,
  checkAndHandleGoodbyeResponse,
  type GoodbyeResponse,
  type GoodbyeResult,
  type GoodbyeResponseType,
} from './goodbye-handler.js'

// First message/Welcome handlers (Epic 2)
export {
  handleFirstMessage,
  handleFirstMessageLegacy,
  hasMagicMoment,
  shouldTriggerWelcomeFlow,
  type FirstMessageResponse,
  type FirstMessageHandlerContext,
  type FirstMessageContext,
  type FirstMessageResult,
} from './first-message-handler.js'

// Tier progress handlers (Epic 3)
export {
  recordTierAction,
  getTierProgress,
  skipOnboarding,
  type TierAction,
  type TierProgressContext,
  type TierProgressResult,
} from './tier-progress-handler.js'

// Opt-out preference handlers (Epic 6)
export {
  handleOptOutCommand,
  parseOptOutCommand,
  isOptedOut,
  type OptOutContext,
  type OptOutResult,
} from './opt-out-handler.js'

// Destination switch handlers (Epic 4, Story 4.6)
export {
  handleDestinationSwitch,
  isDestinationSwitchCommand,
  type DestinationSwitchCommand,
  type DestinationSwitchContext,
  type DestinationSwitchResult,
} from './destination-handler.js'
