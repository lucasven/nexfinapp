# Story 5.1: Daily Engagement Job

**Status:** drafted

---

## Story

**As a** system,
**I want** a daily scheduled job that evaluates users for inactivity and timeout transitions,
**So that** users automatically move through engagement states based on their activity patterns.

---

## Acceptance Criteria

1. **AC-5.1.1:** Given the daily job runs at 6 AM UTC, when evaluating active users, then users with `last_activity_at` > 14 days ago AND `reengagement_opt_out = false` are transitioned to `goodbye_sent` and a goodbye message is queued
2. **AC-5.1.2:** Given the daily job runs, when evaluating `goodbye_sent` users, then users with `goodbye_expires_at < now()` are transitioned to `dormant` with NO message sent
3. **AC-5.1.3:** Given the daily job runs, when evaluating `remind_later` users, then users with `remind_at < now()` are transitioned to `dormant` with NO message sent
4. **AC-5.1.4:** Given a user has `reengagement_opt_out = true`, when the daily job evaluates them, then they are skipped (no transition, no message)

---

## Tasks / Subtasks

- [ ] **Task 1: Create daily engagement job service** (AC: 1, 2, 3, 4)
  - [ ] Create `services/scheduler/daily-engagement-job.ts`
  - [ ] Export `runDailyEngagementJob(): Promise<JobResult>` function
  - [ ] Define `JobResult` interface: `{ processed, succeeded, failed, skipped, errors, durationMs }`
  - [ ] Implement try-catch per user pattern for failure isolation

- [ ] **Task 2: Implement 14-day inactivity check** (AC: 1, 4)
  - [ ] Query `user_engagement_states` JOIN `user_profiles` for:
    - `state = 'active'`
    - `last_activity_at < NOW() - INTERVAL '14 days'`
    - `reengagement_opt_out = false`
  - [ ] For each user: call `transitionState(userId, 'inactivity_14d')`
  - [ ] For each user: call `queueMessage()` with goodbye message
  - [ ] Generate idempotency key: `{userId}:goodbye_sent:{YYYY-MM-DD}`
  - [ ] Include `preferredDestination` and `whatsappJid` from user_profiles
  - [ ] Skip users with `reengagement_opt_out = true`

- [ ] **Task 3: Implement 48h goodbye timeout check** (AC: 2)
  - [ ] Query `user_engagement_states` for:
    - `state = 'goodbye_sent'`
    - `goodbye_expires_at < NOW()`
  - [ ] For each user: call `transitionState(userId, 'goodbye_timeout')`
  - [ ] NO message queued (silence is design)
  - [ ] Log transition to dormant state

- [ ] **Task 4: Implement remind_later expiration check** (AC: 3)
  - [ ] Query `user_engagement_states` for:
    - `state = 'remind_later'`
    - `remind_at < NOW()`
  - [ ] For each user: call `transitionState(userId, 'reminder_due')`
  - [ ] NO message queued (transitions to dormant)
  - [ ] Log transition to dormant state

- [ ] **Task 5: Implement structured logging** (AC: 1-4)
  - [ ] Log job start with job_id and timestamp
  - [ ] Log job completion with duration, processed, succeeded, failed, skipped counts
  - [ ] Log individual user failures with userId, check_type, error message
  - [ ] Use existing Pino logger from project patterns

- [ ] **Task 6: Create cron entry point script** (AC: 1)
  - [ ] Create `cron/run-engagement-daily.ts`
  - [ ] Import and call `runDailyEngagementJob()`
  - [ ] Exit with code 0 on success, non-zero on failure
  - [ ] Log completion summary

- [ ] **Task 7: Write unit tests** (AC: 1-4)
  - [ ] Test user at 13 days inactive → no action
  - [ ] Test user at 14 days inactive → goodbye_sent + message queued
  - [ ] Test user at 15 days inactive (already processed) → no duplicate via idempotency
  - [ ] Test user with `reengagement_opt_out = true` → skipped
  - [ ] Test goodbye at 47h → no action
  - [ ] Test goodbye at 48h+ → dormant, no message
  - [ ] Test remind_later due → dormant transition
  - [ ] Test job failure on one user → continues to next user

---

## Dev Notes

### Architecture Alignment

Implements the daily engagement job per architecture.md ADR-002 (database-driven scheduler) and ADR-005 (single daily job for timeouts). This job is the timing-based automation that executes state transitions identified by the state machine.

**Architectural Constraints:**
1. All transitions MUST go through `transitionState()` from Epic 4
2. All messages MUST be queued via `queueMessage()` (never direct send)
3. Use service role Supabase client (bypasses RLS)
4. Jobs complete in < 60 seconds for 10,000 users
5. Idempotency guaranteed via unique keys on message queue

### Daily Job Sequence

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. INACTIVITY CHECK                                             │
│    Query: active users with last_activity_at > 14 days ago      │
│    For each user:                                               │
│      - Skip if reengagement_opt_out = true                      │
│      - transitionState(userId, 'inactivity_14d')                │
│      - queueMessage(goodbye) with idempotency key               │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 2. TIMEOUT CHECK                                                │
│    Query: goodbye_sent users with goodbye_expires_at < now()    │
│    For each user:                                               │
│      - transitionState(userId, 'goodbye_timeout')               │
│      - NO message sent (silence is design)                      │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 3. REMIND_LATER CHECK                                           │
│    Query: remind_later users with remind_at < now()             │
│    For each user:                                               │
│      - transitionState(userId, 'reminder_due')                  │
│      - NO message sent (transitions to dormant)                 │
└─────────────────────────────────────────────────────────────────┘
```

### Database Queries

```sql
-- Query 1: Find 14-day inactive ACTIVE users (not opted out)
SELECT ues.user_id, ues.last_activity_at, up.preferred_destination, up.whatsapp_jid, up.locale
FROM user_engagement_states ues
JOIN user_profiles up ON ues.user_id = up.user_id
WHERE ues.state = 'active'
  AND ues.last_activity_at < NOW() - INTERVAL '14 days'
  AND up.reengagement_opt_out = false;

-- Query 2: Find expired goodbye states (48h timeout)
SELECT user_id
FROM user_engagement_states
WHERE state = 'goodbye_sent'
  AND goodbye_expires_at < NOW();

-- Query 3: Find due remind_later states
SELECT user_id
FROM user_engagement_states
WHERE state = 'remind_later'
  AND remind_at < NOW();
```

### Type Definitions

```typescript
// services/scheduler/daily-engagement-job.ts

interface JobResult {
  processed: number
  succeeded: number
  failed: number
  skipped: number  // Opted-out users
  errors: Array<{ userId: string; error: string }>
  durationMs: number
}

interface InactiveUser {
  userId: string
  lastActivityAt: Date
  preferredDestination: 'individual' | 'group'
  destinationJid: string
  locale: string
}
```

### Implementation Pattern

```typescript
// services/scheduler/daily-engagement-job.ts

export async function runDailyEngagementJob(): Promise<JobResult> {
  const startTime = Date.now()
  const jobId = crypto.randomUUID()
  const result: JobResult = {
    processed: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    errors: [],
    durationMs: 0
  }

  logger.info('Daily engagement job started', { job_id: jobId })

  try {
    // Step 1: Process 14-day inactivity
    await processInactivityCheck(result, jobId)

    // Step 2: Process 48h goodbye timeouts
    await processGoodbyeTimeouts(result, jobId)

    // Step 3: Process remind_later expirations
    await processRemindLaterExpirations(result, jobId)

  } finally {
    result.durationMs = Date.now() - startTime
    logger.info('Daily engagement job completed', {
      job_id: jobId,
      duration_ms: result.durationMs,
      processed: result.processed,
      succeeded: result.succeeded,
      failed: result.failed,
      skipped: result.skipped
    })
  }

  return result
}

async function processInactivityCheck(result: JobResult, jobId: string) {
  const inactiveUsers = await getInactiveUsers(14)

  for (const user of inactiveUsers) {
    result.processed++

    try {
      // Transition state
      await transitionState(user.userId, 'inactivity_14d')

      // Queue goodbye message
      const today = new Date().toISOString().split('T')[0]
      await queueMessage({
        userId: user.userId,
        messageType: 'goodbye',
        messageKey: 'engagement.goodbye.self_select',
        destination: user.preferredDestination,
        destinationJid: user.destinationJid,
        scheduledFor: new Date(),
        idempotencyKey: `${user.userId}:goodbye_sent:${today}`
      })

      result.succeeded++
    } catch (error) {
      logger.error('Failed to process inactive user', {
        job_id: jobId,
        user_id: user.userId,
        check_type: 'inactivity_14d',
        error: error.message
      })
      result.failed++
      result.errors.push({ userId: user.userId, error: error.message })
    }
  }
}
```

### Dependencies (Epic Prerequisites)

| Dependency | Epic | Usage |
|------------|------|-------|
| `user_engagement_states` table | Epic 1 | Query user states, timestamps |
| `engagement_message_queue` table | Epic 1 | Queue goodbye messages |
| `state-machine.ts` service | Epic 4 | `transitionState()` function |
| `message-sender.ts` service | Story 5.4 | `queueMessage()` function |
| Localization | Epic 1 | `goodbye` message key |
| Constants | Epic 1 | `INACTIVITY_THRESHOLD_DAYS` |

**Note:** Story 5.4 (Message Queue Processor) can be developed in parallel. This story only needs the `queueMessage()` function signature, not the sending logic.

### Failure Isolation Pattern

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

### Idempotency Key Patterns

- Goodbye: `{userId}:goodbye_sent:{YYYY-MM-DD}`
  - One goodbye per day per user max
  - Re-running same day won't duplicate

### Project Structure Notes

- Service file: `whatsapp-bot/src/services/scheduler/daily-engagement-job.ts`
- Cron script: `whatsapp-bot/src/cron/run-engagement-daily.ts`
- Test file: `whatsapp-bot/src/__tests__/services/scheduler/daily-engagement-job.test.ts`
- Uses Supabase service client (bypasses RLS)
- Follow existing service patterns from `services/engagement/state-machine.ts`

### Performance Targets

| Requirement | Target | Implementation |
|-------------|--------|----------------|
| Job completion time | < 60 seconds for 10,000 users | Single pass per check type |
| Query optimization | Indexed columns | Use `state`, `last_activity_at`, `goodbye_expires_at`, `remind_at` |
| Batch processing | No N+1 queries | Single query per check type with JOIN |

### References

- [Source: docs/sprint-artifacts/tech-spec-epic-5.md#Story-5.1-Daily-Engagement-Job]
- [Source: docs/architecture.md#ADR-002-Database-Driven-Scheduler]
- [Source: docs/architecture.md#ADR-005-Single-Daily-Job-for-Timeouts]
- [Source: docs/epics.md#Story-5.1-Daily-Engagement-Job]

---

## Dev Agent Record

### Context Reference

- Context file will be generated when story is marked ready-for-dev

### Agent Model Used

- TBD when dev starts

### Debug Log References

- TBD when dev starts

### Completion Notes List

- TBD when dev starts

### File List

- TBD when dev starts

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2025-11-24 | SM Agent | Initial draft from Epic 5 tech spec |
