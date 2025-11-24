/**
 * Scheduler Services
 *
 * Re-exports all scheduler-related services.
 * These services manage scheduled jobs for the engagement system.
 *
 * Epic: 1 - Foundation & Message Infrastructure
 * Story: 1.3 - Engagement Service Directory Structure
 */

// Message sender service (Story 1.6, Story 4.6, Epic 5)
export {
  queueMessage,
  processMessageQueue,
  cancelMessage,
  getPendingMessages,
  getIdempotencyKey,
  resolveDestinationJid, // Story 4.6: Message routing at send time
  MAX_MESSAGE_RETRIES,
  type QueueMessageParams,
  type ProcessResult,
} from './message-sender.js'

// Daily engagement job (Epic 5)
export {
  runDailyEngagementJob,
  type JobResult,
} from './daily-engagement-job.js'

// Weekly review job (Epic 5)
export {
  runWeeklyReviewJob,
} from './weekly-review-job.js'

// Activity detector (Epic 5)
export {
  getActiveUsersLastWeek,
  getUserActivityCount,
  type ActiveUser,
} from './activity-detector.js'
