# Story 5.1: Daily Engagement Job

**Status:** done

---

## Story

**As a** system administrator,
**I want** a daily scheduled job that evaluates user engagement states,
**So that** inactive users receive goodbye messages and expired states transition automatically.

---

## Acceptance Criteria

1. **AC-5.1.1:** Given the daily job runs at 6 AM UTC, when evaluating active users, then users with `last_activity_at` > 14 days ago AND `reengagement_opt_out = false` are transitioned to `goodbye_sent` and a goodbye message is queued.

2. **AC-5.1.2:** Given the daily job runs, when evaluating `goodbye_sent` users, then users with `goodbye_expires_at < now()` are transitioned to `dormant` with NO message sent.

3. **AC-5.1.3:** Given the daily job runs, when evaluating `remind_later` users, then users with `remind_at < now()` are transitioned to `dormant` with NO message sent.

4. **AC-5.1.4:** Given a user has `reengagement_opt_out = true`, when the daily job evaluates them, then they are skipped (no transition, no message).

---

## Tasks / Subtasks

- [x] **Task 1: Create daily engagement job service** (AC: 1, 2, 3, 4)
  - [x] Create file `services/scheduler/daily-engagement-job.ts`
  - [x] Implement `runDailyEngagementJob()` function
  - [x] Return `JobResult` with processed/succeeded/failed/skipped counts
  - [x] Add structured logging for job start/completion
  - [x] Add error handling with try-catch per user

- [x] **Task 2: Implement 14-day inactivity check** (AC: 1, 4)
  - [x] Query `user_engagement_states` for:
    - `state = 'active'`
    - `last_activity_at < NOW() - INTERVAL '14 days'`
  - [x] Query `user_profiles` to check `reengagement_opt_out = false`
  - [x] For each eligible user:
    - Call `transitionState(userId, 'inactivity_14d')`
    - Track success/failure/skipped in job result
  - [x] Use indexed columns (`state`, `last_activity_at`) for performance

- [x] **Task 3: Implement 48-hour timeout check** (AC: 2)
  - [x] Query `user_engagement_states` for:
    - `state = 'goodbye_sent'`
    - `goodbye_expires_at < NOW()`
  - [x] For each user:
    - Call `transitionState(userId, 'goodbye_timeout')`
    - No message sent (silence is design)
  - [x] Use indexed column `goodbye_expires_at` for performance

- [x] **Task 4: Implement remind_later expiration check** (AC: 3)
  - [x] Query `user_engagement_states` for:
    - `state = 'remind_later'`
    - `remind_at < NOW()`
  - [x] For each user:
    - Call `transitionState(userId, 'reminder_due')`
    - No message sent (transitions to dormant)
  - [x] Use indexed column `remind_at` for performance

- [x] **Task 5: Add job result tracking** (AC: 1, 2, 3, 4)
  - [x] Track `processed` count (total users evaluated)
  - [x] Track `succeeded` count (successful transitions)
  - [x] Track `failed` count (errors during processing)
  - [x] Track `skipped` count (opted-out users)
  - [x] Collect errors array with `{ userId, error }` for failed cases
  - [x] Track `durationMs` for performance monitoring

- [x] **Task 6: Create cron entry point script** (AC: 1)
  - [x] Create file `cron/run-engagement-daily.ts`
  - [x] Import and call `runDailyEngagementJob()`
  - [x] Log job result
  - [x] Exit with code 0 on success, non-zero on failure
  - [x] Ensure Supabase service role connection initialized

- [x] **Task 7: Add Railway cron configuration** (AC: 1)
  - [x] Add to `railway.cron.yml`:
    ```yaml
    - name: engagement-daily
      schedule: "0 6 * * *"
      command: "tsx src/cron/run-engagement-daily.ts"
    ```
  - [x] Verify cron schedule format (6 AM UTC daily)
  - [x] Test cron command runs successfully locally

- [x] **Task 8: Write unit tests** (AC: 1, 2, 3, 4)
  - [x] Test: 14-day inactive user transitions to goodbye_sent
  - [x] Test: Opted-out user is skipped
  - [x] Test: Expired goodbye transitions to dormant
  - [x] Test: Due remind_later transitions to dormant
  - [x] Test: User at 13 days inactive is not processed
  - [x] Test: Job continues processing after one user fails
  - [x] Test: Job result counts are accurate
  - [x] Test: Job completion within 60 seconds for 100 users (performance)

---

## Dev Notes

### Architecture Alignment

Implements FR44 (daily scheduler evaluates users) and FR47 (respect opt-out preferences). This story creates the core daily job that powers the engagement system's time-based automation.

**Critical Pattern:** The job queries eligible users and calls `transitionState()` - the state machine handles all side effects (timestamps, message queuing). The job is a thin orchestration layer.

### Integration Flow

```
Railway Cron (6 AM UTC)
      ↓
run-engagement-daily.ts
      ↓
runDailyEngagementJob()
      ↓
┌─────────────────────────────────────┐
│ 1. Query 14-day inactive users      │
│    (active, not opted out)          │
│    → transitionState(inactivity_14d)│
│    → goodbye message queued          │
└─────────────────────────────────────┘
      ↓
┌─────────────────────────────────────┐
│ 2. Query expired goodbye users      │
│    (goodbye_expires_at < now)       │
│    → transitionState(goodbye_timeout)│
│    → NO message (silence)            │
└─────────────────────────────────────┘
      ↓
┌─────────────────────────────────────┐
│ 3. Query due remind_later users     │
│    (remind_at < now)                │
│    → transitionState(reminder_due)  │
│    → NO message (silence)            │
└─────────────────────────────────────┘
      ↓
Return JobResult with counts
```

### Service Dependencies

- **Uses:** State Machine `transitionState()` from `services/engagement/state-machine.ts` (Epic 4)
- **Uses:** Supabase admin client for database queries
- **Uses:** Pino logger for structured logging
- **Uses:** Constants from `utils/constants.ts` (INACTIVITY_THRESHOLD_DAYS = 14)
- **Calls:** Message Queue Service indirectly via state machine side effects

### Implementation Pattern

```typescript
// services/scheduler/daily-engagement-job.ts

import { createClient } from '@supabase/supabase-js'
import { transitionState } from '@/services/engagement/state-machine'
import { logger } from '@/utils/logger'
import { INACTIVITY_THRESHOLD_DAYS } from '@/utils/constants'

interface JobResult {
  processed: number
  succeeded: number
  failed: number
  skipped: number
  errors: Array<{ userId: string; error: string }>
  durationMs: number
}

export async function runDailyEngagementJob(): Promise<JobResult> {
  const startTime = Date.now()
  const result: JobResult = {
    processed: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    errors: [],
    durationMs: 0
  }

  logger.info('Daily engagement job started', {
    started_at: new Date().toISOString()
  })

  try {
    // Step 1: Process 14-day inactive users
    await processInactiveUsers(result)

    // Step 2: Process expired goodbye timeouts
    await processGoodbyeTimeouts(result)

    // Step 3: Process due remind_later states
    await processRemindLaterDue(result)

  } catch (error) {
    logger.error('Daily engagement job failed', { error })
    throw error
  } finally {
    result.durationMs = Date.now() - startTime
    logger.info('Daily engagement job completed', {
      duration_ms: result.durationMs,
      processed: result.processed,
      succeeded: result.succeeded,
      failed: result.failed,
      skipped: result.skipped
    })
  }

  return result
}

async function processInactiveUsers(result: JobResult): Promise<void> {
  const inactivityDate = new Date()
  inactivityDate.setDate(inactivityDate.getDate() - INACTIVITY_THRESHOLD_DAYS)

  const { data: users, error } = await supabaseAdmin
    .from('user_engagement_states')
    .select(`
      user_id,
      last_activity_at,
      user_profiles!inner(reengagement_opt_out)
    `)
    .eq('state', 'active')
    .lt('last_activity_at', inactivityDate.toISOString())
    .eq('user_profiles.reengagement_opt_out', false)

  if (error) {
    logger.error('Failed to query inactive users', { error })
    throw error
  }

  for (const user of users || []) {
    result.processed++
    try {
      await transitionState(user.user_id, 'inactivity_14d')
      result.succeeded++
      logger.debug('Processed inactive user', { userId: user.user_id })
    } catch (error) {
      result.failed++
      result.errors.push({
        userId: user.user_id,
        error: error.message
      })
      logger.error('Failed to process inactive user', {
        userId: user.user_id,
        error
      })
    }
  }
}

async function processGoodbyeTimeouts(result: JobResult): Promise<void> {
  const { data: users, error } = await supabaseAdmin
    .from('user_engagement_states')
    .select('user_id, goodbye_expires_at')
    .eq('state', 'goodbye_sent')
    .lt('goodbye_expires_at', new Date().toISOString())

  if (error) {
    logger.error('Failed to query goodbye timeouts', { error })
    throw error
  }

  for (const user of users || []) {
    result.processed++
    try {
      await transitionState(user.user_id, 'goodbye_timeout')
      result.succeeded++
      logger.debug('Processed goodbye timeout', { userId: user.user_id })
    } catch (error) {
      result.failed++
      result.errors.push({
        userId: user.user_id,
        error: error.message
      })
      logger.error('Failed to process goodbye timeout', {
        userId: user.user_id,
        error
      })
    }
  }
}

async function processRemindLaterDue(result: JobResult): Promise<void> {
  const { data: users, error } = await supabaseAdmin
    .from('user_engagement_states')
    .select('user_id, remind_at')
    .eq('state', 'remind_later')
    .lt('remind_at', new Date().toISOString())

  if (error) {
    logger.error('Failed to query remind_later due', { error })
    throw error
  }

  for (const user of users || []) {
    result.processed++
    try {
      await transitionState(user.user_id, 'reminder_due')
      result.succeeded++
      logger.debug('Processed remind_later due', { userId: user.user_id })
    } catch (error) {
      result.failed++
      result.errors.push({
        userId: user.user_id,
        error: error.message
      })
      logger.error('Failed to process remind_later due', {
        userId: user.user_id,
        error
      })
    }
  }
}
```

```typescript
// cron/run-engagement-daily.ts

import { runDailyEngagementJob } from '@/services/scheduler/daily-engagement-job'
import { logger } from '@/utils/logger'

async function main() {
  try {
    const result = await runDailyEngagementJob()

    logger.info('Daily engagement job completed successfully', result)

    if (result.failed > 0) {
      logger.warn('Some users failed to process', {
        failed_count: result.failed,
        errors: result.errors
      })
    }

    process.exit(0)
  } catch (error) {
    logger.error('Daily engagement job failed', { error })
    process.exit(1)
  }
}

main()
```

### Database Query Optimization

**Critical Performance Pattern:** All queries use indexed columns to ensure < 60s completion for 10,000 users.

Required indexes (from Epic 1 migration):
```sql
CREATE INDEX idx_engagement_state ON user_engagement_states(state);
CREATE INDEX idx_engagement_last_activity ON user_engagement_states(last_activity_at);
CREATE INDEX idx_engagement_goodbye_expires ON user_engagement_states(goodbye_expires_at)
  WHERE goodbye_expires_at IS NOT NULL;
CREATE INDEX idx_engagement_remind_at ON user_engagement_states(remind_at)
  WHERE remind_at IS NOT NULL;
```

### Failure Isolation Pattern

**Critical:** If one user fails to process, the job MUST continue processing other users. Each user is wrapped in try-catch:

```typescript
for (const user of users) {
  try {
    await processUser(user)
    succeeded++
  } catch (error) {
    logger.error('Failed to process user', { userId: user.id, error })
    errors.push({ userId: user.id, error: error.message })
    failed++
    // Continue to next user - don't fail entire batch
  }
}
```

### Idempotency Guarantees

The job is safe to re-run multiple times per day:
- **Inactivity check**: State machine + message queue handle idempotency via unique keys
- **Timeout check**: Once transitioned to dormant, user is no longer in goodbye_sent state
- **Remind_later check**: Once transitioned to dormant, user is no longer in remind_later state

No duplicate messages or transitions occur on re-runs.

### Project Structure

```
whatsapp-bot/
├── src/
│   ├── services/scheduler/
│   │   └── daily-engagement-job.ts       [NEW]
│   ├── cron/
│   │   └── run-engagement-daily.ts       [NEW]
│   └── __tests__/
│       └── scheduler/
│           └── daily-engagement-job.test.ts  [NEW]
└── railway.cron.yml                      [MODIFIED]
```

### Learnings from Previous Stories

**From Story 4.1 (State Machine Core):**
- Use `transitionState()` for ALL state changes - never update database directly
- State machine handles all side effects (timestamps, message queuing)
- Return `TransitionResult` with side effects for testing/logging

**From Story 4.3 (Goodbye Message):**
- Goodbye message queuing is automatic when transitioning to `goodbye_sent`
- Idempotency keys prevent duplicate messages on re-runs
- Message routing to preferred destination handled by state machine

**From Story 4.5 (48h Timeout):**
- Timeout transition to dormant does NOT send a message (silence is design)
- `goodbye_expires_at` is set when entering `goodbye_sent` state
- This story implements the scheduled check; Story 4.5 implements the transition logic

### Performance Expectations

Per NFR3 and architecture requirements:
- **Target:** < 60 seconds for full user base (10,000 users)
- **Implementation:**
  - Single pass per check type (3 queries total)
  - Indexed WHERE clauses on all queries
  - Opt-out check in JOIN (single query, not per-user lookup)
  - No N+1 queries

### Error Handling Strategy

1. **Query failures**: Throw error, fail entire job (data access issue)
2. **Individual user failures**: Log and continue (isolation pattern)
3. **State transition failures**: Caught per user, added to errors array
4. **Job completion**: Always log final result, even on partial failure

### References

- [Source: docs/sprint-artifacts/tech-spec-epic-5.md#Story-5.1-Daily-Engagement-Job]
- [Source: docs/architecture.md#ADR-002-Database-Driven-Scheduler]
- [Source: docs/architecture.md#ADR-005-Single-Daily-Job]
- [Source: docs/sprint-artifacts/tech-spec-epic-4.md#State-Machine-Service]

---

## Dev Agent Record

### Context Reference

Context file: `docs/sprint-artifacts/5-1-daily-engagement-job_context.xml`

### Agent Model Used

Claude Sonnet 4.5 (model ID: claude-sonnet-4-5-20250929)

### Debug Log References

No critical debugging required. All tests passed on first run after fixing mock data structure.

### Completion Notes List

1. **Implementation Approach:**
   - Created `daily-engagement-job.ts` service with three sequential checks (14-day inactivity, goodbye timeout, remind_later expiration)
   - Used two-query pattern for opt-out check to avoid Supabase relationship schema issues
   - Each user wrapped in try-catch for failure isolation (AC requirement)
   - Job returns detailed `JobResult` with processed/succeeded/failed/skipped counts

2. **Key Design Decisions:**
   - **Opt-out Query Pattern:** Initially used INNER JOIN syntax (`user_profiles!inner(reengagement_opt_out)`) but this required Supabase schema relationship configuration. Changed to two separate queries to avoid schema dependencies:
     1. Query all inactive users from `user_engagement_states`
     2. Query `user_profiles` for opt-out status
     3. Build opt-out map and skip users in-memory
   - This pattern is more database-agnostic and avoids runtime schema errors

3. **Testing:**
   - All 10 unit tests pass (AC-5.1.1, AC-5.1.2, AC-5.1.3, AC-5.1.4, error handling, performance)
   - Test coverage includes:
     - Single and multiple user processing
     - Opt-out user skipping
     - Failure isolation (job continues after one user fails)
     - Accurate result counts
     - Performance test (100 users completes < 60s)
   - Cron script tested locally and runs successfully

4. **Integration Points:**
   - Uses `transitionState()` from state machine (Epic 4) for all state changes
   - Uses `getExpiredGoodbyes()` and `getDueReminders()` helper functions from state machine
   - Uses `INACTIVITY_THRESHOLD_DAYS` constant (14 days)
   - Uses Supabase client for database queries
   - Uses structured logger for job tracking

5. **Railway Cron Configuration:**
   - Added `engagement-daily` job to `railway.cron.yml` at 6 AM UTC
   - Command: `tsx src/cron/run-engagement-daily.ts`
   - Schedule: `0 6 * * *` (daily at 6 AM UTC)

### File List

**Files Created:**
- `whatsapp-bot/src/services/scheduler/daily-engagement-job.ts` - Main job service (233 lines)
- `whatsapp-bot/src/cron/run-engagement-daily.ts` - Cron entry point (49 lines)
- `whatsapp-bot/src/__tests__/scheduler/daily-engagement-job.test.ts` - Unit tests (502 lines, 10 tests)

**Files Modified:**
- `whatsapp-bot/railway.cron.yml` - Added engagement-daily cron job
- `docs/sprint-artifacts/sprint-status.yaml` - Updated story status: ready-for-dev → in-progress → review
- `docs/sprint-artifacts/5-1-daily-engagement-job.md` - Marked all tasks complete, added Dev Agent Record

**Files Removed:**
- `whatsapp-bot/src/__tests__/services/scheduler/daily-engagement-job.test.ts` - Old test file from previous incomplete implementation

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2025-11-24 | SM Agent | Initial draft from Epic 5 tech spec |

---

## Senior Developer Review (AI)

**Review Date:** 2025-11-24
**Reviewer:** Claude Sonnet 4.5 (Code Review Agent)
**Status:** ✅ APPROVED

### Acceptance Criteria Verification

**AC-5.1.1**: ✅ PASS - 14-day inactive users with `reengagement_opt_out=false` correctly transition to `goodbye_sent` with goodbye message queued via state machine.

**AC-5.1.2**: ✅ PASS - Expired goodbye users (48h timeout) correctly transition to `dormant` with no message sent (silence by design).

**AC-5.1.3**: ✅ PASS - Due `remind_later` users correctly transition to `dormant` with no message sent (silence by design).

**AC-5.1.4**: ✅ PASS - Users with `reengagement_opt_out=true` are correctly skipped (increments `skipped` counter, no processing).

### Code Quality Assessment

**Architecture Alignment**: ✅ EXCELLENT
- Follows thin orchestration pattern - delegates all state logic to `transitionState()`
- No direct database updates to state fields
- Uses helper functions from state machine (`getExpiredGoodbyes`, `getDueReminders`)
- Properly imports constants (`INACTIVITY_THRESHOLD_DAYS = 14`)

**Error Handling**: ✅ EXCELLENT
- Individual user failures wrapped in try-catch with failure isolation
- Job continues processing after individual failures (critical requirement)
- Errors collected in `result.errors` array with userId context
- Structured logging with proper error context throughout

**Database Query Optimization**: ✅ GOOD
- Uses two-query pattern to avoid Supabase schema relationship dependencies
- Queries filter by indexed columns (`state`, `last_activity_at`, `goodbye_expires_at`, `remind_at`)
- No N+1 queries - fetches all opt-out statuses in single batch query
- Builds opt-out map in memory for O(1) lookups

**Code Structure**: ✅ EXCELLENT
- Clear separation of concerns (3 processing functions)
- Comprehensive JSDoc comments with AC references
- TypeScript interfaces properly defined (`JobResult`)
- ESM imports with .js extensions (project convention)

**Testing**: ✅ COMPREHENSIVE
- 10 test cases covering all ACs and edge cases
- Tests failure isolation (job continues after one user fails)
- Tests opted-out user skipping
- Tests boundary conditions (13 days vs 14 days)
- Performance test (100 users < 60s)
- All 521 tests in suite pass

**Cron Integration**: ✅ CORRECT
- Railway cron configured correctly (6 AM UTC daily, schedule: "0 6 * * *")
- Entry point script handles errors properly (exit codes)
- Uses `tsx` for TypeScript execution (consistent with project)
- Structured logging throughout cron lifecycle

### Project Patterns Compliance

**From CLAUDE.md**: ✅ FULL COMPLIANCE
- TypeScript with ESM modules (.js extensions on imports)
- Structured logging with context objects
- Database access via Supabase service key
- Error handling with graceful fallbacks
- Stateless job processing with idempotency guarantees
- Code organization matches project structure

### Minor Observations (Not Blocking)

1. **Two-Query Pattern**: Implementation uses two-query approach for opt-out checking instead of INNER JOIN. This is intentional per Dev Notes to avoid Supabase schema relationship configuration requirements. Valid design decision.

2. **Exit Code Strategy**: Cron script exits with code 0 even if some users fail (partial failures). This is correct per the failure isolation pattern - individual failures shouldn't fail entire job.

3. **Performance Note**: Test verifies < 60s for 100 users with mocks. Real production performance with 10,000 users will need monitoring, but indexed queries and batch fetching pattern should scale well.

### Files Reviewed

- `whatsapp-bot/src/services/scheduler/daily-engagement-job.ts` (264 lines)
- `whatsapp-bot/src/cron/run-engagement-daily.ts` (51 lines)
- `whatsapp-bot/src/__tests__/scheduler/daily-engagement-job.test.ts` (505 lines, 10 tests)
- `whatsapp-bot/railway.cron.yml` (engagement-daily job configuration)

### Test Results

```
✓ All 521 tests pass (23 test suites)
✓ 10 new tests for Story 5.1 all pass
✓ Cron entry point script executes successfully
✓ No regressions detected
```

### Final Verdict

**✅ APPROVED FOR PRODUCTION**

All acceptance criteria met, code quality excellent, comprehensive test coverage, follows project patterns. Story 5-1-daily-engagement-job is ready for deployment.

**Recommendation**: Mark story as done and proceed to Story 5.2 (Weekly Activity Detection).
