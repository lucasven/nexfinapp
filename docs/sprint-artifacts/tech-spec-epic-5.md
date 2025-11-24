# Epic Technical Specification: Scheduled Jobs & Weekly Reviews

Date: 2025-11-24
Author: Lucas
Epic ID: 5
Status: Draft

---

## Overview

Epic 5 implements the background job infrastructure that powers NexFinApp's proactive engagement system. This includes a daily job for processing 14-day inactivity checks and goodbye timeouts, a weekly review job that celebrates active users, and the message queue processor that ensures reliable delivery with retry capability.

The core principle is **"silence is the design"**—users without activity receive no messages. Active users get timely, non-intrusive celebrations. The scheduler operates idempotently, meaning jobs can be safely re-run without side effects like duplicate messages.

This epic builds on Epic 4's state machine foundation and Epic 1's message queue service to create the timing-based automation that transitions users through engagement states.

## Objectives and Scope

### In Scope

- **Daily Engagement Job**: Evaluate all users for 14-day inactivity → `goodbye_sent`, 48h timeout → `dormant`, and `remind_later` expiration → `dormant`
- **Weekly Activity Detection**: Query transactions and `last_activity_at` to identify users with activity in the past 7 days
- **Weekly Review Job**: Send celebratory messages to active users (activity-triggered only)
- **Message Queue Processor**: Process pending messages via Baileys with retry logic and rate limiting
- **Railway Cron Integration**: Configure daily (6 AM UTC) and weekly (9 AM UTC Monday) cron jobs
- **Idempotency Guarantees**: Ensure no duplicate messages or transitions on re-runs

### Out of Scope

- State machine core logic (Epic 4)
- Message content/localization (Epic 1)
- Opt-out handling (Epic 6)
- User-facing commands (Epic 2-4)

## System Architecture Alignment

### Architecture References

Per the [architecture.md](../architecture.md) decisions:

| Decision | Alignment |
|----------|-----------|
| Database-driven scheduler (ADR-002) | Jobs query DB state, not in-memory timers |
| Message queue table (ADR-003) | All proactive messages queue before send |
| Single daily job for timeouts (ADR-005) | One job handles 14d inactive + 48h timeout + remind_later |
| Jest + mocks for testing (ADR-004) | Scheduler tests use time mocking, not real delays |

### Integration Points

```
Railway Cron (daily/weekly)
      ↓
[Job Runner] → Query eligible users from DB
      ↓
[State Machine] → Calculate transitions (from Epic 4)
      ↓
[Message Queue] → Insert messages with idempotency keys
      ↓
[Message Sender] → Process queue, send via Baileys
      ↓
[Update Status] → Mark sent/failed in queue
```

### File Locations (from Architecture)

- `services/scheduler/daily-engagement-job.ts`
- `services/scheduler/weekly-review-job.ts`
- `services/scheduler/message-sender.ts`
- `cron/run-engagement-daily.ts`
- `cron/run-engagement-weekly.ts`

## Detailed Design

### Services and Modules

| Service | File | Responsibility |
|---------|------|----------------|
| **DailyEngagementJob** | `services/scheduler/daily-engagement-job.ts` | Orchestrates daily checks: 14-day inactivity, 48h timeouts, remind_later expiration |
| **WeeklyReviewJob** | `services/scheduler/weekly-review-job.ts` | Identifies active users and queues weekly review messages |
| **MessageSender** | `services/scheduler/message-sender.ts` | Processes message queue, sends via Baileys with retry logic |
| **ActivityDetector** | `services/scheduler/activity-detector.ts` | Queries transactions + last_activity_at for weekly activity |

**Module Dependencies (imports):**

```
daily-engagement-job.ts
├── imports: state-machine (Epic 4)
├── imports: message-sender (this epic)
├── imports: constants (Epic 1)
└── imports: supabase client

weekly-review-job.ts
├── imports: activity-detector (this epic)
├── imports: message-sender (this epic)
├── imports: constants (Epic 1)
└── imports: supabase client

message-sender.ts
├── imports: message-router (Epic 4)
├── imports: localization (Epic 1)
└── imports: baileys sock instance
```

### Data Models and Contracts

**Tables Used (from Epic 1 migration):**

```sql
-- Primary: engagement_message_queue (read/write)
engagement_message_queue (
  id UUID,
  user_id UUID,
  message_type TEXT,       -- 'goodbye', 'weekly_review', 'reminder'
  message_key TEXT,        -- Localization key
  message_params JSONB,    -- Variables for localization
  destination TEXT,        -- 'individual' | 'group'
  destination_jid TEXT,    -- WhatsApp JID to send to
  scheduled_for TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  status TEXT,             -- 'pending', 'sent', 'failed', 'cancelled'
  retry_count INTEGER,
  error_message TEXT,
  idempotency_key TEXT UNIQUE,
  created_at TIMESTAMPTZ
)

-- Read: user_engagement_states (from Epic 4)
user_engagement_states (
  user_id UUID,
  state TEXT,              -- 'active', 'goodbye_sent', 'remind_later', 'dormant'
  last_activity_at TIMESTAMPTZ,
  goodbye_sent_at TIMESTAMPTZ,
  goodbye_expires_at TIMESTAMPTZ,
  remind_at TIMESTAMPTZ
)

-- Read: user_profiles (opt-out check)
user_profiles (
  user_id UUID,
  reengagement_opt_out BOOLEAN,
  preferred_destination TEXT,
  whatsapp_jid TEXT
)

-- Read: transactions (weekly activity check)
transactions (
  user_id UUID,
  created_at TIMESTAMPTZ
)
```

**TypeScript Contracts:**

```typescript
// Job result contract
interface JobResult {
  processed: number
  succeeded: number
  failed: number
  skipped: number  // Opted-out users
  errors: Array<{ userId: string; error: string }>
  durationMs: number
}

// Message queue entry
interface QueuedMessage {
  userId: string
  messageType: 'goodbye' | 'weekly_review' | 'reminder' | 'help_restart'
  messageKey: string
  messageParams?: Record<string, string>
  destination: 'individual' | 'group'
  destinationJid: string
  scheduledFor: Date
  idempotencyKey: string
}

// Active user for weekly review
interface ActiveUser {
  userId: string
  transactionCount: number
  lastActivityAt: Date
  preferredDestination: 'individual' | 'group'
  destinationJid: string
  locale: string
}
```

### APIs and Interfaces

**Service Interfaces:**

```typescript
// services/scheduler/daily-engagement-job.ts
export async function runDailyEngagementJob(): Promise<JobResult>

// services/scheduler/weekly-review-job.ts
export async function runWeeklyReviewJob(): Promise<JobResult>

// services/scheduler/message-sender.ts
export async function processMessageQueue(): Promise<ProcessResult>
export async function queueMessage(params: QueuedMessage): Promise<void>

// services/scheduler/activity-detector.ts
export async function getActiveUsersLastWeek(): Promise<ActiveUser[]>
export async function getUserActivityCount(userId: string, days: number): Promise<number>
```

**Database Queries (Critical):**

```sql
-- Daily: Find 14-day inactive ACTIVE users (not opted out)
SELECT ues.user_id, ues.last_activity_at, up.preferred_destination, up.whatsapp_jid
FROM user_engagement_states ues
JOIN user_profiles up ON ues.user_id = up.user_id
WHERE ues.state = 'active'
  AND ues.last_activity_at < NOW() - INTERVAL '14 days'
  AND up.reengagement_opt_out = false;

-- Daily: Find expired goodbye states (48h timeout)
SELECT user_id
FROM user_engagement_states
WHERE state = 'goodbye_sent'
  AND goodbye_expires_at < NOW();

-- Daily: Find due remind_later states
SELECT user_id
FROM user_engagement_states
WHERE state = 'remind_later'
  AND remind_at < NOW();

-- Weekly: Find users with activity in last 7 days (not opted out, not dormant)
SELECT DISTINCT up.user_id, up.preferred_destination, up.whatsapp_jid, up.locale,
       COUNT(t.id) as transaction_count
FROM user_profiles up
JOIN user_engagement_states ues ON up.user_id = ues.user_id
LEFT JOIN transactions t ON up.user_id = t.user_id
  AND t.created_at > NOW() - INTERVAL '7 days'
WHERE ues.state IN ('active', 'help_flow')
  AND up.reengagement_opt_out = false
  AND (t.id IS NOT NULL OR ues.last_activity_at > NOW() - INTERVAL '7 days')
GROUP BY up.user_id, up.preferred_destination, up.whatsapp_jid, up.locale;
```

### Workflows and Sequencing

**Daily Job Sequence (6 AM UTC):**

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
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 4. PROCESS MESSAGE QUEUE                                        │
│    Query: pending messages with scheduled_for <= now()          │
│    For each message:                                            │
│      - Send via Baileys                                         │
│      - Mark sent/failed                                         │
│      - 500ms delay between sends                                │
└─────────────────────────────────────────────────────────────────┘
```

**Weekly Job Sequence (9 AM UTC Monday):**

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. DETECT ACTIVE USERS                                          │
│    Query: users with transactions OR bot activity last 7 days   │
│    Filter: state IN (active, help_flow), not opted out          │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 2. QUEUE WEEKLY REVIEWS                                         │
│    For each active user:                                        │
│      - Generate idempotency key: {userId}:weekly_review:{week}  │
│      - queueMessage(weekly_review)                              │
│      - Skip if key already exists (idempotent)                  │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 3. PROCESS MESSAGE QUEUE                                        │
│    (Same as daily step 4)                                       │
└─────────────────────────────────────────────────────────────────┘
```

**Message Send Sequence (with retry):**

```
Send Attempt
    │
    ├─── Success ──→ status = 'sent', sent_at = now()
    │
    └─── Failure ──→ retry_count++
                         │
                    retry_count < 3?
                         │
                    ┌────┴────┐
                    │         │
                   Yes       No
                    │         │
                    ▼         ▼
               Wait (exp)   status = 'failed'
               backoff      error_message = reason
               1s/2s/4s
                    │
                    ▼
               Retry send
```

## Non-Functional Requirements

### Performance

| Requirement | Target | Implementation |
|-------------|--------|----------------|
| **NFR3: Scheduler evaluation time** | < 60 seconds for full user base | Batch queries with indexed columns; parallel processing where safe |
| **Daily job completion** | < 60s for 10,000 users | Single pass per check type; efficient WHERE clauses |
| **Weekly job completion** | < 60s for 10,000 users | Single aggregated query; no N+1 queries |
| **Message sending rate** | 100 messages/minute | 500ms delay between sends (WhatsApp rate limit compliance) |

**Query Optimization:**
- All queries use indexed columns: `state`, `last_activity_at`, `goodbye_expires_at`, `remind_at`
- Opt-out check done in JOIN (single query, not per-user lookup)
- Weekly activity uses single aggregated query with GROUP BY

### Security

| Aspect | Implementation |
|--------|----------------|
| **Service Role Access** | Cron jobs use `SUPABASE_SERVICE_KEY` (bypasses RLS) |
| **No Secrets in Logs** | User IDs logged, never JIDs or message content |
| **Message Content** | Localization keys only in queue; content resolved at send time |
| **Cron Endpoint** | No external HTTP endpoint; Railway triggers internal command |

**Data Access Pattern:**
- Jobs read from multiple tables (requires service role)
- Message queue writes are service-role only
- No user-accessible endpoints for scheduler operations

### Reliability/Availability

| Requirement | Target | Implementation |
|-------------|--------|----------------|
| **NFR4: Scheduler job success rate** | 99.9% | Try-catch per user; log and continue on individual failures |
| **NFR5: Message delivery confirmation** | Retry on failure, max 3 attempts | Exponential backoff: 1s, 2s, 4s |
| **NFR6: State persistence** | Survive service restarts | All state in database; no in-memory timers |
| **NFR7: Idempotency guarantee** | No duplicate messages ever | Unique idempotency_key constraint; upsert with ignoreDuplicates |

**Failure Isolation Pattern:**
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

**Idempotency Key Patterns:**
- Goodbye: `{userId}:goodbye_sent:{YYYY-MM-DD}`
- Weekly review: `{userId}:weekly_review:{YYYY-Www}` (ISO week)
- Reminder: `{userId}:reminder:{remind_at_timestamp}`

### Observability

| Requirement | Implementation |
|-------------|----------------|
| **NFR12: Scheduler job logging** | Full audit trail with start/end times, counts, errors |
| **NFR13: Engagement state change logging** | All transitions logged via state machine (Epic 4) |
| **NFR14: Message delivery logging** | Success/failure per message with error details |

**Structured Log Events:**

```typescript
// Job start
logger.info('Daily engagement job started', {
  job_id: jobId,
  started_at: new Date().toISOString()
})

// Job completion
logger.info('Daily engagement job completed', {
  job_id: jobId,
  duration_ms: durationMs,
  processed: result.processed,
  succeeded: result.succeeded,
  failed: result.failed,
  skipped: result.skipped
})

// Individual failure
logger.error('Failed to process user engagement', {
  job_id: jobId,
  user_id: userId,
  check_type: 'inactivity_14d',
  error: error.message
})

// Message sent
logger.info('Engagement message sent', {
  message_id: messageId,
  user_id: userId,
  message_type: 'goodbye',
  destination: 'individual'
})

// Message failed
logger.error('Engagement message failed', {
  message_id: messageId,
  user_id: userId,
  message_type: 'goodbye',
  retry_count: 3,
  error: error.message,
  status: 'failed'
})
```

**PostHog Events (via state machine):**
- `engagement_state_changed` - from Epic 4, triggered by transitions
- `engagement_weekly_review_sent` - NEW, fired when review queued

## Dependencies and Integrations

### Internal Dependencies (Epic Prerequisites)

| Dependency | Epic | Required For |
|------------|------|--------------|
| `user_engagement_states` table | Epic 1 | Query user states, timestamps |
| `engagement_message_queue` table | Epic 1 | Queue and track messages |
| `state-machine.ts` service | Epic 4 | `transitionState()` function |
| `message-router.ts` service | Epic 4 | Route to preferred destination |
| Localization messages | Epic 1 | `goodbye`, `weekly_review` keys |
| `constants.ts` | Epic 1 | `INACTIVITY_THRESHOLD_DAYS`, etc. |

### External Dependencies (from package.json)

| Package | Version | Usage |
|---------|---------|-------|
| `@whiskeysockets/baileys` | ^6.7.9 | WhatsApp message sending |
| `@supabase/supabase-js` | ^2.39.3 | Database queries |
| `pino` | ^8.17.2 | Structured logging |
| `posthog-node` | ^5.11.2 | Analytics events |
| `tsx` | ^4.20.6 | Cron script execution |

**No new dependencies required** - all functionality uses existing packages.

### Infrastructure Dependencies

| Component | Dependency | Configuration |
|-----------|------------|---------------|
| **Railway Cron** | Railway platform | `railway.cron.yml` |
| **Supabase** | Service role key | `SUPABASE_SERVICE_KEY` env var |
| **Baileys Socket** | WhatsApp connection | Existing `sock` instance from bot startup |

### Integration Points

**1. State Machine (Epic 4):**
```typescript
import { transitionState } from '@/services/engagement/state-machine'

// Daily job calls
await transitionState(userId, 'inactivity_14d')  // → goodbye_sent
await transitionState(userId, 'goodbye_timeout') // → dormant
await transitionState(userId, 'reminder_due')    // → dormant
```

**2. Message Queue (Epic 1):**
```typescript
import { queueMessage } from '@/services/scheduler/message-sender'

await queueMessage({
  userId,
  messageType: 'goodbye',
  messageKey: 'engagement.goodbye.self_select',
  destination: user.preferredDestination,
  destinationJid: user.whatsappJid,
  idempotencyKey: `${userId}:goodbye_sent:${today}`
})
```

**3. Baileys Socket (existing):**
```typescript
import { getSocket } from '@/index'  // Or however sock is exported

const sock = getSocket()
await sock.sendMessage(jid, { text: localizedMessage })
```

**4. Railway Cron:**
```yaml
# railway.cron.yml additions
jobs:
  - name: engagement-daily
    schedule: "0 6 * * *"
    command: "tsx src/cron/run-engagement-daily.ts"

  - name: engagement-weekly
    schedule: "0 9 * * 1"
    command: "tsx src/cron/run-engagement-weekly.ts"
```

### Database Indexes (from Epic 1 migration)

Required indexes for scheduler performance:
```sql
CREATE INDEX idx_engagement_state ON user_engagement_states(state);
CREATE INDEX idx_engagement_last_activity ON user_engagement_states(last_activity_at);
CREATE INDEX idx_engagement_goodbye_expires ON user_engagement_states(goodbye_expires_at)
  WHERE goodbye_expires_at IS NOT NULL;
CREATE INDEX idx_engagement_remind_at ON user_engagement_states(remind_at)
  WHERE remind_at IS NOT NULL;
CREATE INDEX idx_queue_status ON engagement_message_queue(status)
  WHERE status = 'pending';
```

## Acceptance Criteria (Authoritative)

### Story 5.1: Daily Engagement Job

**AC-5.1.1**: Given the daily job runs at 6 AM UTC, when evaluating active users, then users with `last_activity_at` > 14 days ago AND `reengagement_opt_out = false` are transitioned to `goodbye_sent` and a goodbye message is queued.

**AC-5.1.2**: Given the daily job runs, when evaluating `goodbye_sent` users, then users with `goodbye_expires_at < now()` are transitioned to `dormant` with NO message sent.

**AC-5.1.3**: Given the daily job runs, when evaluating `remind_later` users, then users with `remind_at < now()` are transitioned to `dormant` with NO message sent.

**AC-5.1.4**: Given a user has `reengagement_opt_out = true`, when the daily job evaluates them, then they are skipped (no transition, no message).

### Story 5.2: Weekly Activity Detection

**AC-5.2.1**: Given `getActiveUsersLastWeek()` is called, when executed, then it returns users who have either transactions created in the last 7 days OR `last_activity_at` within 7 days.

**AC-5.2.2**: Given a user has `state = 'dormant'`, when `getActiveUsersLastWeek()` runs, then that user is excluded.

**AC-5.2.3**: Given a user has `reengagement_opt_out = true`, when `getActiveUsersLastWeek()` runs, then that user is excluded.

### Story 5.3: Weekly Review Job & Message

**AC-5.3.1**: Given the weekly job runs at 9 AM UTC Monday, when evaluating active users, then users with activity last week receive a `weekly_review` message queued to their preferred destination.

**AC-5.3.2**: Given a user had NO activity last week, when the weekly job runs, then NO message is sent to that user.

**AC-5.3.3**: Given the weekly job runs twice in the same week, when processing the same user, then only ONE weekly review message exists (idempotency via `{userId}:weekly_review:{YYYY-Www}` key).

### Story 5.4: Message Queue Processor

**AC-5.4.1**: Given pending messages in the queue with `scheduled_for <= now()`, when `processMessageQueue()` runs, then each message is sent via Baileys and marked `status = 'sent'` with `sent_at = now()`.

**AC-5.4.2**: Given a message fails to send, when `retry_count < 3`, then the message remains `pending` with `retry_count` incremented and retry uses exponential backoff (1s, 2s, 4s).

**AC-5.4.3**: Given a message fails and `retry_count >= 3`, when processing, then `status = 'failed'` and `error_message` is set.

**AC-5.4.4**: Given multiple messages to send, when processing, then there is a 500ms delay between sends (rate limiting).

### Story 5.5: Railway Cron Integration

**AC-5.5.1**: Given Railway deployment, when the cron configuration is applied, then `engagement-daily` runs at `0 6 * * *` (6 AM UTC daily).

**AC-5.5.2**: Given Railway deployment, when the cron configuration is applied, then `engagement-weekly` runs at `0 9 * * 1` (9 AM UTC Monday).

**AC-5.5.3**: Given a job completes successfully, when finished, then it exits with code 0 and logs structured completion message.

**AC-5.5.4**: Given a job fails, when finished, then it exits with non-zero code and logs error details.

### Story 5.6: Scheduler Idempotency Guarantees

**AC-5.6.1**: Given a goodbye message was already sent today, when the daily job re-runs, then no duplicate goodbye is queued (idempotency key prevents insert).

**AC-5.6.2**: Given a weekly review was already sent this week, when the weekly job re-runs, then no duplicate review is queued.

**AC-5.6.3**: Given the service restarts mid-job, when the job re-runs, then already-processed users are skipped and partial work completes.

**AC-5.6.4**: Given `queueMessage()` is called with the same `idempotencyKey` twice, when executed, then only one queue entry exists (upsert with ignoreDuplicates).

## Traceability Mapping

| AC | FR | Spec Section | Component/API | Test Idea |
|----|-----|--------------|---------------|-----------|
| AC-5.1.1 | FR44, FR12 | Daily Job Sequence Step 1 | `runDailyEngagementJob()`, `transitionState()` | Mock 14-day inactive user, verify transition + message queued |
| AC-5.1.2 | FR44, FR17 | Daily Job Sequence Step 2 | `runDailyEngagementJob()` | Mock expired goodbye, verify dormant transition, no message |
| AC-5.1.3 | FR45 | Daily Job Sequence Step 3 | `runDailyEngagementJob()` | Mock due remind_later, verify dormant transition |
| AC-5.1.4 | FR47 | Daily Job Sequence | `runDailyEngagementJob()` | Mock opted-out user, verify skipped count |
| AC-5.2.1 | FR20 | Activity Detector | `getActiveUsersLastWeek()` | Query with known transactions, verify returned |
| AC-5.2.2 | FR22 | Activity Detector | `getActiveUsersLastWeek()` | Dormant user excluded |
| AC-5.2.3 | FR22 | Activity Detector | `getActiveUsersLastWeek()` | Opted-out user excluded |
| AC-5.3.1 | FR21, FR23 | Weekly Job Sequence | `runWeeklyReviewJob()` | Active user gets weekly review |
| AC-5.3.2 | FR22 | Weekly Job Sequence | `runWeeklyReviewJob()` | No activity = no message |
| AC-5.3.3 | FR47 | Weekly Job Sequence | `runWeeklyReviewJob()` | Re-run same week, single message |
| AC-5.4.1 | FR48 | Message Send Sequence | `processMessageQueue()` | Pending message sent, marked sent |
| AC-5.4.2 | NFR5 | Message Send Sequence | `processMessageQueue()` | Fail once, verify retry queued |
| AC-5.4.3 | NFR5 | Message Send Sequence | `processMessageQueue()` | 3 failures = failed status |
| AC-5.4.4 | NFR3 | Message Send Sequence | `processMessageQueue()` | Multiple messages, verify timing |
| AC-5.5.1 | FR44 | Railway Cron | `railway.cron.yml` | Config validation |
| AC-5.5.2 | FR46 | Railway Cron | `railway.cron.yml` | Config validation |
| AC-5.5.3 | NFR4 | Cron Entry Points | Exit codes | Job success exit 0 |
| AC-5.5.4 | NFR4 | Cron Entry Points | Exit codes | Job failure exit non-zero |
| AC-5.6.1 | FR19, FR47 | Idempotency Patterns | `queueMessage()` | Duplicate goodbye blocked |
| AC-5.6.2 | FR19, FR47 | Idempotency Patterns | `queueMessage()` | Duplicate weekly blocked |
| AC-5.6.3 | FR48 | Failure Isolation | Job runner | Partial completion test |
| AC-5.6.4 | FR19, NFR7 | Message Queue | `queueMessage()` | Same key twice = one entry |

## Risks, Assumptions, Open Questions

### Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| **Baileys socket not connected when cron runs** | High - Messages fail | Medium | Check socket status before processing; log warning and retry next cycle |
| **WhatsApp rate limiting** | Medium - Messages delayed | Medium | 500ms delay built-in; monitor for 429 errors; implement adaptive backoff if needed |
| **Cron job overlap** | Medium - Duplicate processing | Low | Idempotency keys prevent duplicates; jobs designed to complete < 60s |
| **Database connection timeout** | High - Job fails | Low | Supabase connection pooling; retry logic per user |
| **Clock drift between Railway nodes** | Low - Timing variance | Low | Use database timestamps, not server time |

### Assumptions

| Assumption | Rationale | Validation |
|------------|-----------|------------|
| Epic 1 migration creates required tables/indexes | Architecture specifies schema in Epic 1 | Verify tables exist before Epic 5 implementation |
| Epic 4 state machine `transitionState()` is available | Dependency chain: Epic 4 before Epic 5 | Import and call in integration tests |
| Baileys socket is accessible from cron scripts | Bot must be running for messages to send | Test cron scripts in dev environment |
| Railway cron executes in same environment as bot | Cron needs access to socket | Verify Railway cron configuration |
| 10,000 user scale is sufficient for initial launch | PRD target scale | Monitor query performance in production |

### Open Questions

| Question | Owner | Status | Decision |
|----------|-------|--------|----------|
| Should cron jobs initialize their own Baileys connection or use running bot? | Dev | **RESOLVED** | Use running bot's socket - cron triggers endpoint that uses existing connection |
| What timezone should weekly review use for "Monday"? | PM | **RESOLVED** | UTC - keeps logic simple, users are in similar timezone (Brazil) |
| Should failed messages be retried on next cron run or marked terminal? | Dev | **RESOLVED** | Terminal after 3 attempts - prevents infinite retry loops |
| How to handle users who become active DURING job execution? | Dev | **RESOLVED** | Activity tracker updates state immediately; job processes stale query results (acceptable) |

## Test Strategy Summary

### Test Levels

| Level | Coverage Focus | Location |
|-------|----------------|----------|
| **Unit Tests** | Individual functions, query builders, idempotency logic | `__tests__/services/scheduler/*.test.ts` |
| **Integration Tests** | Database queries, state transitions, message queue flow | `__tests__/engagement/*.test.ts` |
| **E2E Tests** | Full job execution with mocked Baileys | `__tests__/engagement/daily-job.test.ts`, `weekly-job.test.ts` |

### Unit Test Coverage

```
services/scheduler/
├── daily-engagement-job.test.ts
│   ├── 14-day inactivity detection
│   ├── 48h timeout detection
│   ├── remind_later expiration
│   ├── opt-out skipping
│   └── error handling per user
├── weekly-review-job.test.ts
│   ├── active user detection
│   ├── no-activity exclusion
│   ├── opt-out exclusion
│   └── idempotency key generation
├── message-sender.test.ts
│   ├── successful send
│   ├── retry on failure
│   ├── max retry exceeded
│   ├── rate limiting (500ms delay)
│   └── idempotency upsert
└── activity-detector.test.ts
    ├── transaction-based activity
    ├── bot interaction activity
    └── combined activity detection
```

### Key Test Scenarios

**Daily Job Tests:**
1. User at 13 days inactive → no action
2. User at 14 days inactive → goodbye_sent + message queued
3. User at 15 days inactive (already processed) → no duplicate
4. User opted out → skipped
5. Goodbye at 47h → no action
6. Goodbye at 48h+ → dormant, no message
7. Job failure on one user → continues to next

**Weekly Job Tests:**
1. User with 3 transactions this week → weekly review sent
2. User with bot activity only → weekly review sent
3. User with no activity → no message
4. User dormant → excluded
5. Same week re-run → no duplicate

**Idempotency Tests:**
1. Same goodbye key twice → one queue entry
2. Same weekly key twice → one queue entry
3. Different dates → separate entries

### Test Utilities

```typescript
// __tests__/helpers/scheduler-test-utils.ts

export function createMockUser(overrides?: Partial<User>): User
export function createEngagementState(userId: string, state: EngagementState, overrides?: Partial<EngagementStateRow>): EngagementStateRow
export function advanceTime(days: number): void  // Mocks Date.now()
export function mockBaileysSend(success: boolean): jest.Mock
export function getQueuedMessages(userId: string): QueuedMessage[]
```

### Test Data Patterns

```typescript
// Standard test scenarios
const scenarios = {
  activeUser: createEngagementState(userId, 'active', {
    last_activity_at: subDays(new Date(), 5)
  }),
  inactiveUser: createEngagementState(userId, 'active', {
    last_activity_at: subDays(new Date(), 15)
  }),
  goodbyeExpired: createEngagementState(userId, 'goodbye_sent', {
    goodbye_expires_at: subHours(new Date(), 49)
  }),
  remindDue: createEngagementState(userId, 'remind_later', {
    remind_at: subDays(new Date(), 1)
  })
}
```

### Coverage Targets

| Metric | Target | Rationale |
|--------|--------|-----------|
| Line Coverage | 85% | Scheduler logic is critical |
| Branch Coverage | 80% | All state transitions covered |
| Function Coverage | 90% | All exported functions tested |

### CI Integration

```yaml
# Part of existing npm test
npm test -- --testPathPattern=scheduler
npm test -- --testPathPattern=engagement

# Coverage report
npm test -- --coverage --testPathPattern="scheduler|engagement"
```

---

_Generated by BMAD Epic Tech Context Workflow_
_Date: 2025-11-24_
_For: Lucas_
_Epic: 5 - Scheduled Jobs & Weekly Reviews_
