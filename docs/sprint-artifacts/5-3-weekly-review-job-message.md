# Story 5.3: Weekly Review Job & Message

**Status:** review

---

## Story

**As a** active user,
**I want** to receive a weekly celebratory message acknowledging my financial tracking activity,
**So that** I feel encouraged to continue using the app and see my progress recognized.

---

## Acceptance Criteria

1. **AC-5.3.1:** Given the weekly job runs at 9 AM UTC Monday, when evaluating active users, then users with activity last week receive a `weekly_review` message queued to their preferred destination.

2. **AC-5.3.2:** Given a user had NO activity last week, when the weekly job runs, then NO message is sent to that user.

3. **AC-5.3.3:** Given the weekly job runs twice in the same week, when processing the same user, then only ONE weekly review message exists (idempotency via `{userId}:weekly_review:{YYYY-Www}` key).

---

## Tasks / Subtasks

- [x] **Task 1: Create weekly review job service** (AC: 1, 2, 3)
  - [x] Create file `services/scheduler/weekly-review-job.ts`
  - [x] Implement `runWeeklyReviewJob()` function
  - [x] Return `JobResult` with processed/succeeded/failed/skipped counts
  - [x] Add structured logging for job start/completion
  - [x] Add error handling with try-catch per user

- [x] **Task 2: Implement active user detection** (AC: 1, 2)
  - [x] Call `getActiveUsersLastWeek()` from `activity-detector.ts` (Story 5.2)
  - [x] Filter users:
    - Include: `state IN ('active', 'help_flow')`
    - Exclude: `reengagement_opt_out = true`
    - Exclude: `state = 'dormant'`
  - [x] Get user locale, preferred destination, destination JID
  - [x] Track users with activity vs. no activity

- [x] **Task 3: Generate idempotency keys** (AC: 3)
  - [x] Format: `{userId}:weekly_review:{YYYY-Www}` using ISO week format
  - [x] Use `date-fns/formatISO` and `date-fns/getISOWeek` for consistent week calculation
  - [x] Example: `abc123:weekly_review:2025-W47`
  - [x] Ensure same key generated for all runs within same week

- [x] **Task 4: Modify message-sender.ts to accept custom idempotency keys** (AC: 3)
  - [x] Add optional `idempotencyKey?: string` to `QueueMessageParams` interface
  - [x] Modify `queueMessage()` function to use custom key if provided
  - [x] Maintain backward compatibility (generate default key if not provided)
  - [x] Update line ~71: `const idempotencyKey = params.idempotencyKey || getIdempotencyKey(...)`

- [x] **Task 5: Queue weekly review messages** (AC: 1)
  - [x] For each active user:
    - Call `queueMessage()` from `message-sender.ts`
    - Pass custom idempotency key with ISO week format
    - Set `messageType = 'weekly_review'`
    - Use `messageKey = 'engagementWeeklyReviewCelebration'`
    - Pass `messageParams` with transaction count
    - Route to `preferredDestination` (individual/group)
    - Set `scheduledFor = now()` (send immediately)
  - [x] Track success/failure per user (queueMessage returns boolean)
  - [x] Handle errors with try-catch per user (failure isolation)

- [x] **Task 6: Add localization messages** (AC: 1)
  - [x] Add to `localization/pt-br.ts`:
    ```typescript
    engagementWeeklyReviewCelebration: (count: number) =>
      `Parabéns! 🎉 Você registrou ${count} transaç${count === 1 ? 'ão' : 'ões'} esta semana. Continue assim!`
    ```
  - [x] Add to `localization/en.ts`:
    ```typescript
    engagementWeeklyReviewCelebration: (count: number) =>
      `Congratulations! 🎉 You recorded ${count} transaction${count === 1 ? '' : 's'} this week. Keep it up!`
    ```
  - [x] Ensure consistent message structure across locales

- [x] **Task 7: Create cron entry point script** (AC: 1)
  - [x] Create file `cron/run-engagement-weekly.ts`
  - [x] Import and call `runWeeklyReviewJob()`
  - [x] Log job result with structured data
  - [x] Exit with code 0 on success, non-zero on failure
  - [x] Ensure Supabase service role connection initialized

- [x] **Task 8: Add Railway cron configuration** (AC: 1)
  - [x] Add to `railway.cron.yml`:
    ```yaml
    - name: engagement-weekly
      schedule: "0 9 * * 1"
      command: "tsx src/cron/run-engagement-weekly.ts"
    ```
  - [x] Verify cron schedule format (9 AM UTC Monday)
  - [x] Test cron command runs successfully locally

- [x] **Task 9: Add PostHog analytics event** (AC: 1)
  - [x] Fire `engagement_weekly_review_sent` event when message queued
  - [x] Include properties:
    - `transaction_count`
    - `destination` (individual/group)
    - `locale`
  - [x] Track event via PostHog client

- [x] **Task 10: Write unit tests** (AC: 1, 2, 3)
  - [x] Test: Active user with 3 transactions receives weekly review
  - [x] Test: User with bot activity only (no transactions) receives weekly review
  - [x] Test: User with no activity does NOT receive message
  - [x] Test: Dormant user is excluded (handled by activity-detector)
  - [x] Test: Opted-out user is excluded (handled by activity-detector)
  - [x] Test: Same user processed twice in same week = one message (idempotency)
  - [x] Test: Job continues processing after one user fails
  - [x] Test: Job result counts are accurate
  - [x] Test: ISO week format consistency (same key for Mon-Sun)
  - [x] Test: Localization message rendering in pt-BR and en

---

## Dev Notes

### Architecture Alignment

Implements FR21 (weekly reviews for active users), FR22 (activity-triggered only), FR23 (celebratory tone), and FR47 (respect opt-out preferences). This story creates the weekly celebration job that rewards engaged users with positive reinforcement.

**Critical Pattern:** Unlike the daily job which handles state transitions, the weekly job is purely celebratory - it sends messages but does NOT change engagement states. The state machine is not involved.

### Integration Flow

```
Railway Cron (9 AM UTC Monday)
      ↓
run-engagement-weekly.ts
      ↓
runWeeklyReviewJob()
      ↓
┌─────────────────────────────────────┐
│ 1. Call getActiveUsersLastWeek()    │
│    (from activity-detector.ts)      │
│    → Returns users with activity    │
└─────────────────────────────────────┘
      ↓
┌─────────────────────────────────────┐
│ 2. For each active user:            │
│    - Generate ISO week key          │
│    - Call queueMessage()             │
│    - Track success/failure           │
│    - Fire PostHog event              │
└─────────────────────────────────────┘
      ↓
┌─────────────────────────────────────┐
│ 3. Return JobResult with counts     │
│    - processed: total users checked │
│    - succeeded: messages queued      │
│    - failed: errors during queue     │
│    - skipped: already sent this week │
└─────────────────────────────────────┘
```

### Service Dependencies

- **Uses:** Activity Detector `getActiveUsersLastWeek()` from `services/scheduler/activity-detector.ts` (Story 5.2)
- **Uses:** Message Sender `queueMessage()` from `services/scheduler/message-sender.ts` (Story 5.4)
- **Uses:** Localization messages from `localization/pt-br.ts` and `localization/en.ts` (Epic 1)
- **Uses:** PostHog client for analytics events
- **Uses:** `date-fns` for ISO week formatting
- **NOT USED:** State Machine (no state transitions in this job)

### Implementation Pattern

```typescript
// services/scheduler/weekly-review-job.ts

import { getActiveUsersLastWeek } from './activity-detector.js'
import { queueMessage } from './message-sender.js'
import { logger } from '@/utils/logger.js'
import { posthog } from '@/utils/posthog.js'
import { format, getISOWeek, getISOWeekYear } from 'date-fns'

interface JobResult {
  processed: number
  succeeded: number
  failed: number
  skipped: number
  errors: Array<{ userId: string; error: string }>
  durationMs: number
}

export async function runWeeklyReviewJob(): Promise<JobResult> {
  const startTime = Date.now()
  const result: JobResult = {
    processed: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    errors: [],
    durationMs: 0
  }

  logger.info('Weekly review job started', {
    started_at: new Date().toISOString()
  })

  try {
    // Step 1: Get active users from last week
    const activeUsers = await getActiveUsersLastWeek()

    logger.info('Active users detected for weekly review', {
      count: activeUsers.length
    })

    // Step 2: Process each active user
    for (const user of activeUsers) {
      result.processed++

      try {
        // Generate idempotency key using ISO week
        const now = new Date()
        const weekYear = getISOWeekYear(now)
        const weekNumber = getISOWeek(now)
        const idempotencyKey = `${user.userId}:weekly_review:${weekYear}-W${weekNumber.toString().padStart(2, '0')}`

        // Queue weekly review message
        await queueMessage({
          userId: user.userId,
          messageType: 'weekly_review',
          messageKey: 'engagement.weekly_review.celebration',
          messageParams: {
            count: user.transactionCount.toString()
          },
          destination: user.preferredDestination,
          destinationJid: user.destinationJid,
          scheduledFor: now,
          idempotencyKey
        })

        result.succeeded++

        // Fire PostHog analytics event
        posthog.capture({
          distinctId: user.userId,
          event: 'engagement_weekly_review_sent',
          properties: {
            transaction_count: user.transactionCount,
            destination: user.preferredDestination,
            locale: user.locale
          }
        })

        logger.debug('Queued weekly review for user', {
          userId: user.userId,
          transactionCount: user.transactionCount,
          destination: user.preferredDestination
        })
      } catch (error) {
        // Check if error is due to duplicate idempotency key
        if (error.code === '23505') { // PostgreSQL unique constraint violation
          result.skipped++
          logger.debug('Weekly review already sent this week', {
            userId: user.userId
          })
        } else {
          result.failed++
          result.errors.push({
            userId: user.userId,
            error: error.message
          })
          logger.error('Failed to queue weekly review', {
            userId: user.userId,
            error
          })
        }
      }
    }
  } catch (error) {
    logger.error('Weekly review job failed', { error })
    throw error
  } finally {
    result.durationMs = Date.now() - startTime
    logger.info('Weekly review job completed', {
      duration_ms: result.durationMs,
      processed: result.processed,
      succeeded: result.succeeded,
      failed: result.failed,
      skipped: result.skipped
    })
  }

  return result
}
```

```typescript
// cron/run-engagement-weekly.ts

import { runWeeklyReviewJob } from '@/services/scheduler/weekly-review-job.js'
import { logger } from '@/utils/logger.js'

async function main() {
  try {
    const result = await runWeeklyReviewJob()

    logger.info('Weekly review job completed successfully', result)

    if (result.failed > 0) {
      logger.warn('Some users failed to process', {
        failed_count: result.failed,
        errors: result.errors
      })
    }

    process.exit(0)
  } catch (error) {
    logger.error('Weekly review job failed', { error })
    process.exit(1)
  }
}

main()
```

### ISO Week Format for Idempotency

**Critical:** Use ISO 8601 week format (YYYY-Www) for consistent week boundaries:
- Week starts on Monday, ends on Sunday
- Week 1 is the week with first Thursday of the year
- Format example: `2025-W47` (year 2025, week 47)

```typescript
import { getISOWeek, getISOWeekYear } from 'date-fns'

const weekYear = getISOWeekYear(new Date()) // 2025
const weekNumber = getISOWeek(new Date())   // 47
const key = `${userId}:weekly_review:${weekYear}-W${weekNumber.toString().padStart(2, '0')}`
// Result: "abc123:weekly_review:2025-W47"
```

This ensures all runs from Monday-Sunday of the same week generate the same key.

### Celebratory Message Design

**Tone:** Positive, encouraging, non-intrusive
**Content:** Acknowledge activity with specific count, encourage continuation
**Frequency:** Once per week, only for active users
**Silence:** No message for inactive users (silence is design)

**Portuguese Example:** "Parabéns! 🎉 Você registrou 5 transações esta semana. Continue assim!"
**English Example:** "Congratulations! 🎉 You recorded 5 transactions this week. Keep it up!"

### Failure Isolation Pattern

Same as Story 5.1 - individual user failures do NOT fail entire job:

```typescript
for (const user of activeUsers) {
  try {
    await processUser(user)
    succeeded++
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      skipped++  // Already sent this week
    } else {
      logger.error('Failed to process user', { userId: user.id, error })
      errors.push({ userId: user.id, error: error.message })
      failed++
    }
    // Continue to next user - don't fail entire batch
  }
}
```

### Idempotency Guarantees

The job is safe to re-run multiple times per week:
- **Idempotency Key:** `{userId}:weekly_review:{YYYY-Www}` is unique per user per week
- **Database Constraint:** `engagement_message_queue.idempotency_key` has UNIQUE constraint
- **Re-run Behavior:** Second attempt with same key is rejected by database (23505 error)
- **Error Handling:** Duplicate key error caught and counted as `skipped`

No duplicate messages occur on re-runs within same week.

### Activity Definition

A user is "active" if they have:
- **Transaction activity:** Created transactions in last 7 days, OR
- **Bot interaction activity:** `last_activity_at` within last 7 days (includes commands, messages)

This is handled by `getActiveUsersLastWeek()` from Story 5.2.

### Project Structure

```
whatsapp-bot/
├── src/
│   ├── services/scheduler/
│   │   └── weekly-review-job.ts           [NEW]
│   ├── cron/
│   │   └── run-engagement-weekly.ts       [NEW]
│   ├── localization/
│   │   ├── pt-br.ts                       [MODIFIED - add weekly_review messages]
│   │   └── en.ts                          [MODIFIED - add weekly_review messages]
│   └── __tests__/
│       └── scheduler/
│           └── weekly-review-job.test.ts  [NEW]
└── railway.cron.yml                        [MODIFIED - add engagement-weekly job]
```

### Learnings from Previous Stories

**From Story 5.1 (Daily Engagement Job):**
- Use failure isolation pattern (try-catch per user)
- Return detailed `JobResult` with counts
- Use structured logging throughout
- Exit codes matter for cron jobs (0 = success, non-zero = failure)

**From Story 5.2 (Weekly Activity Detection):**
- `getActiveUsersLastWeek()` returns all necessary user data (userId, transactionCount, preferredDestination, destinationJid, locale)
- Activity includes both transactions AND bot interactions
- Dormant and opted-out users already filtered by activity detector

**From Story 4.6 (Message Routing):**
- Use `preferredDestination` and `destinationJid` from user profile
- Message routing to individual/group handled by message sender

### Performance Expectations

Per NFR3 and architecture requirements:
- **Target:** < 60 seconds for full user base (10,000 users)
- **Implementation:**
  - Single aggregated query in `getActiveUsersLastWeek()` (Story 5.2)
  - No N+1 queries - all user data fetched in batch
  - Message queuing is database insert (fast)
  - PostHog events are fire-and-forget (non-blocking)

### Error Handling Strategy

1. **Activity detection failures**: Throw error, fail entire job (data access issue)
2. **Individual user failures**: Log and continue (isolation pattern)
3. **Duplicate key errors**: Count as `skipped`, continue processing
4. **Message queue failures**: Caught per user, added to errors array
5. **Job completion**: Always log final result, even on partial failure

### Analytics Events

**Event:** `engagement_weekly_review_sent`
**Fired When:** Weekly review message successfully queued
**Properties:**
- `transaction_count` (number): Transaction count for the week
- `destination` (string): 'individual' or 'group'
- `locale` (string): User's locale (pt-BR or en)

**Purpose:** Track weekly review delivery rate and user activity patterns

### References

- [Source: docs/sprint-artifacts/tech-spec-epic-5.md#Story-5.3-Weekly-Review-Job-Message]
- [Source: docs/architecture.md#FR21-Weekly-Reviews-for-Active-Users]
- [Source: docs/architecture.md#FR22-Activity-Triggered-Engagement]
- [Source: docs/architecture.md#FR23-Celebratory-Tone]
- [Source: docs/sprint-artifacts/5-2-weekly-activity-detection.md]

---

## Dev Agent Record

### Implementation Summary

**Date Completed:** 2025-11-24
**Dev Agent:** Claude Code (Sonnet 4.5)

### Files Created
- `whatsapp-bot/src/services/scheduler/weekly-review-job.ts` - Main weekly review job implementation
- `whatsapp-bot/src/cron/run-engagement-weekly.ts` - Cron entry point for Railway
- `whatsapp-bot/src/__tests__/scheduler/weekly-review-job.test.ts` - Comprehensive unit tests (10 tests, all passing)

### Files Modified
- `whatsapp-bot/src/services/scheduler/message-sender.ts` - Added optional `idempotencyKey` parameter to `QueueMessageParams` interface
- `whatsapp-bot/src/localization/pt-br.ts` - Added `engagementWeeklyReviewCelebration` message
- `whatsapp-bot/src/localization/en.ts` - Added `engagementWeeklyReviewCelebration` message
- `whatsapp-bot/railway.cron.yml` - Added `engagement-weekly` cron job (Monday 9 AM UTC)
- `docs/sprint-artifacts/sprint-status.yaml` - Updated story status to `in-progress` → `review`

### Dependencies Added
- `date-fns` package for ISO week formatting (`getISOWeek`, `getISOWeekYear`)

### Implementation Notes

1. **Idempotency Key Format:** Successfully implemented ISO week-based idempotency keys (`{userId}:weekly_review:{YYYY-Www}`) ensuring no duplicate messages within the same week.

2. **Backward Compatibility:** Modified `message-sender.ts` to accept optional custom idempotency keys while maintaining backward compatibility for existing callers.

3. **Localization:** Added celebratory messages in both Portuguese and English with proper pluralization support.

4. **PostHog Analytics:** Integrated analytics tracking for `engagement_weekly_review_sent` event with transaction count, destination, and locale properties.

5. **Test Coverage:** All 10 unit tests passing, covering:
   - Active users with transactions
   - Bot activity only (count=0)
   - No activity (no message)
   - ISO week format consistency
   - Failure isolation (job continues after individual user failures)
   - Exception handling
   - Group destination routing
   - Localization support

### Acceptance Criteria Status

- ✅ **AC-5.3.1:** Active users receive weekly_review message to preferred destination
- ✅ **AC-5.3.2:** Users with NO activity do NOT receive messages
- ✅ **AC-5.3.3:** Idempotency via `{userId}:weekly_review:{YYYY-Www}` key - verified through tests

### Issues Encountered

None. Implementation proceeded smoothly with all dependencies available from Story 5.2 (activity-detector).

### Next Steps

Story is ready for code review. Once approved:
- Deploy to Railway to activate the weekly cron job
- Monitor PostHog analytics for `engagement_weekly_review_sent` events
- Verify idempotency behavior in production with repeated job runs

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2025-11-24 | SM Agent | Initial draft from Epic 5 tech spec |
| 2025-11-24 | Dev Agent | Implementation complete - all tasks done, 10 tests passing |

---
