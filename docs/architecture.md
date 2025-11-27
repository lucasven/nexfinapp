# Architecture - Smart Onboarding & Engagement System

## Executive Summary

This architecture extends NexFinApp's existing brownfield codebase to implement a Smart Onboarding & Engagement System. The design introduces a 5-state engagement state machine, database-driven scheduler for proactive messaging, and progressive 3-tier onboarding—all while preserving existing patterns and infrastructure.

**Core Principle:** Comfort over pressure. The system guides users toward feature discovery without guilt or manipulation, respecting user autonomy throughout.

---

## Decision Summary

| Category | Decision | Rationale |
|----------|----------|-----------|
| Engagement State Storage | New `user_engagement_states` table | Clean separation from user_profiles, easier to query and audit state transitions |
| Tier Progress Tracking | JSON column in `user_profiles` | Simple extension of existing onboarding fields, no new table needed |
| Scheduler Architecture | Database-driven + Railway cron trigger | Idempotent, survives restarts, aligns with existing cron infrastructure |
| Message Destination Storage | `user_profiles.preferred_destination` column | User-level preference, not per-number |
| Opt-Out Sync Mechanism | Shared column in `user_profiles` | Single source of truth for both WhatsApp and Web |
| State Transition Logging | New `engagement_state_transitions` table | Queryable analytics, full audit trail |
| Weekly Activity Detection | Query `transactions` table | No new storage needed, leverages existing data |
| E2E Test Framework | Jest + mock Baileys (CI only) | Fast, reliable, covers 95% of logic |
| Goodbye Response Parsing | Simple regex | Responses are "1", "2", "3" - no NLP needed |
| Tier Completion Events | PostHog + database | Analytics in PostHog, state queries from DB |
| Message Queue | New `engagement_message_queue` table | Retry capability, audit trail, idempotency |
| Reminder Timer Storage | `remind_at` column in engagement state table | Simpler than separate scheduled jobs table |
| 48h Timeout Handling | Daily job checks `goodbye_expires_at` | One job handles all timeouts, precision not critical |

---

## Project Structure

```
whatsapp-bot/src/
├── handlers/
│   ├── core/
│   │   ├── message-handler.ts          # Existing - entry point
│   │   ├── text-handler.ts             # Existing - NLP routing
│   │   └── intent-executor.ts          # Existing - extend for engagement intents
│   ├── transactions/                   # Existing
│   ├── budgets/                        # Existing
│   ├── categories/                     # Existing
│   ├── reports/                        # Existing
│   ├── recurring/                      # Existing
│   └── engagement/                     # NEW
│       ├── index.ts                    # Export all handlers
│       ├── goodbye-handler.ts          # Process goodbye responses (1/2/3)
│       ├── first-message-handler.ts    # Conversation-first welcome + magic moment
│       ├── tier-progress-handler.ts    # Track tier completions, send unlocks
│       └── opt-out-handler.ts          # "stop reminders" command
│
├── services/
│   ├── ai/                             # Existing
│   ├── user/                           # Existing
│   ├── onboarding/                     # Existing - extend
│   │   ├── greeting-sender.ts          # Existing
│   │   └── tier-tracker.ts             # NEW - tier progress logic
│   ├── engagement/                     # NEW
│   │   ├── index.ts                    # Export all services
│   │   ├── state-machine.ts            # State transitions + validation
│   │   ├── activity-tracker.ts         # Update last_activity_at
│   │   ├── message-router.ts           # Route to preferred destination
│   │   └── constants.ts                # Configuration constants
│   └── scheduler/                      # NEW
│       ├── index.ts                    # Export all scheduler services
│       ├── daily-engagement-job.ts     # 14-day inactivity, timeout checks
│       ├── weekly-review-job.ts        # Activity-triggered reviews
│       └── message-sender.ts           # Process queue, send messages
│
├── cron/
│   ├── process-recurring.js            # Existing
│   ├── run-engagement-daily.ts         # NEW - Railway cron entry
│   └── run-engagement-weekly.ts        # NEW - Railway cron entry
│
├── localization/
│   ├── pt-br.ts                        # Existing - add engagement messages
│   └── en.ts                           # Existing - add engagement messages
│
└── __tests__/
    ├── handlers/                       # Existing
    ├── services/                       # Existing
    └── engagement/                     # NEW
        ├── state-machine.test.ts       # Unit tests for transitions
        ├── daily-job.test.ts           # Scheduler idempotency tests
        ├── weekly-job.test.ts          # Weekly review logic tests
        ├── goodbye-handler.test.ts     # Response parsing tests
        ├── tier-progress.test.ts       # Tier completion tests
        └── 30-day-journey.test.ts      # Integration test

fe/
├── app/[locale]/
│   └── settings/
│       └── page.tsx                    # Existing - add opt-out toggle
│
├── lib/actions/
│   ├── ... existing actions ...
│   └── engagement.ts                   # NEW - opt-out toggle action
│
└── components/
    └── settings/
        └── notification-preferences.tsx # NEW - opt-out UI component
```

---

## FR Category to Architecture Mapping

| FR Category | FRs | Primary Code Location | Database Tables |
|-------------|-----|----------------------|-----------------|
| Onboarding & Discovery | FR1-FR10 | `handlers/engagement/first-message-handler.ts`, `services/onboarding/tier-tracker.ts` | `user_profiles` |
| Engagement State Management | FR11-FR19 | `services/engagement/state-machine.ts`, `handlers/engagement/goodbye-handler.ts` | `user_engagement_states`, `engagement_state_transitions` |
| Weekly Engagement | FR20-FR23 | `services/scheduler/weekly-review-job.ts` | `engagement_message_queue` |
| Message Destination | FR24-FR27 | `services/engagement/message-router.ts` | `user_profiles.preferred_destination` |
| User Preferences & Opt-Out | FR28-FR32 | `handlers/engagement/opt-out-handler.ts`, `fe/lib/actions/engagement.ts` | `user_profiles.reengagement_opt_out` |
| Message Content & Tone | FR33-FR37 | `localization/pt-br.ts`, `localization/en.ts` | - |
| Analytics & Learning | FR38-FR43 | Distributed (PostHog calls), `engagement_state_transitions` | `engagement_state_transitions` |
| Scheduler & Background | FR44-FR48 | `services/scheduler/*.ts`, `cron/*.ts` | `engagement_message_queue` |
| Testing Infrastructure | FR49-FR53 | `__tests__/engagement/*.ts` | - |

---

## Technology Stack Details

### Core Technologies (Existing - No Changes)

| Layer | Technology | Version |
|-------|------------|---------|
| Frontend | Next.js | 15.x |
| Frontend UI | Radix UI + Tailwind CSS | Latest |
| Backend | Node.js + TypeScript ESM | 18+ LTS |
| WhatsApp | Baileys | Latest |
| Database | PostgreSQL (Supabase) | 15+ |
| Vector Search | pgvector | 0.5+ |
| AI/NLP | OpenAI GPT-4o-mini | Latest |
| Analytics | PostHog | Latest |
| Hosting (Frontend) | Vercel | - |
| Hosting (Bot) | Railway | - |

### New Dependencies

None required. All new functionality uses existing libraries.

---

## Integration Points

### WhatsApp Bot ↔ Engagement System

```
Message Received
      ↓
[Activity Tracker] → Update last_activity_at
      ↓
[State Check] → If DORMANT/GOODBYE_SENT → Transition to ACTIVE
      ↓
[Existing NLP Pipeline]
      ↓
[Tier Progress Check] → If action completes tier → Queue unlock message
      ↓
Response Sent
```

### Scheduler ↔ Database ↔ WhatsApp

```
Railway Cron (daily/weekly)
      ↓
[Job Runner] → Query eligible users from DB
      ↓
[State Machine] → Calculate transitions
      ↓
[Message Queue] → Insert messages with idempotency keys
      ↓
[Message Sender] → Process queue, send via Baileys
      ↓
[Update Status] → Mark sent/failed in queue
```

### Frontend ↔ Backend Sync (Opt-Out)

```
User toggles opt-out on web
      ↓
Server Action → Update user_profiles.reengagement_opt_out
      ↓
WhatsApp Bot reads same column on next scheduler run
      ↓
Opt-out respected (< 5 second sync via shared DB)
```

---

## Novel Pattern Design: Engagement State Machine

### State Diagram

```
                         ┌─────────────────────────────────────────┐
                         │           USER SENDS MESSAGE            │
                         └─────────────────┬───────────────────────┘
                                           │
                                           ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                                  ACTIVE                                       │
│  • Normal operation                                                          │
│  • last_activity_at updated on every message                                 │
│  • Receives weekly review if had activity                                    │
└──────────────────────────────────────────┬───────────────────────────────────┘
                                           │
                              (14 days no activity)
                                           │
                                           ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                              GOODBYE_SENT                                     │
│  • goodbye_sent_at = now()                                                   │
│  • goodbye_expires_at = now() + 48h                                          │
│  • Self-select message sent                                                  │
└───────┬──────────────────────┬──────────────────────┬───────────────────────┘
        │                      │                      │
   (response "1")        (response "2")      (response "3" OR 48h timeout)
        │                      │                      │
        ▼                      ▼                      ▼
┌───────────────┐    ┌─────────────────┐    ┌─────────────────────────────────┐
│   HELP_FLOW   │    │  REMIND_LATER   │    │            DORMANT              │
│               │    │                 │    │                                 │
│ • Restart T1  │    │ • remind_at =   │    │ • No proactive messages        │
│ • Then ACTIVE │    │   now() + 14d   │    │ • Door stays open              │
└───────┬───────┘    └────────┬────────┘    └───────────────┬─────────────────┘
        │                     │                             │
        │            (14 days pass)                         │
        │                     │                    (any user message)
        ▼                     ▼                             │
┌──────────────────────────────────────────────────────────▼───────────────────┐
│                                  ACTIVE                                       │
└──────────────────────────────────────────────────────────────────────────────┘
```

### State Transition Contract

```typescript
type EngagementState = 'active' | 'goodbye_sent' | 'help_flow' | 'remind_later' | 'dormant'

type TransitionTrigger =
  | 'user_message'       // Any message from user
  | 'inactivity_14d'     // Daily job detects 14 days
  | 'goodbye_response_1' // "Confused"
  | 'goodbye_response_2' // "Busy"
  | 'goodbye_response_3' // "All good"
  | 'goodbye_timeout'    // 48h no response
  | 'reminder_due'       // 14 days after remind_later

const VALID_TRANSITIONS: Record<EngagementState, Partial<Record<TransitionTrigger, EngagementState>>> = {
  active: {
    inactivity_14d: 'goodbye_sent'
  },
  goodbye_sent: {
    user_message: 'active',
    goodbye_response_1: 'help_flow',
    goodbye_response_2: 'remind_later',
    goodbye_response_3: 'dormant',
    goodbye_timeout: 'dormant'
  },
  help_flow: {
    user_message: 'active'
  },
  remind_later: {
    user_message: 'active',
    reminder_due: 'dormant'
  },
  dormant: {
    user_message: 'active'
  }
}
```

### Tier Progress Structure

```typescript
// Stored in user_profiles.onboarding_tier_progress (JSONB)
interface TierProgress {
  tier1: {
    add_expense: boolean
    edit_category: boolean
    delete_expense: boolean
    add_category: boolean
    completed_at?: string  // ISO timestamp
  }
  tier2: {
    set_budget: boolean
    add_recurring: boolean
    list_categories: boolean
    completed_at?: string
  }
  tier3: {
    edit_category: boolean
    view_report: boolean
    completed_at?: string
  }
  magic_moment_at?: string  // First NLP-parsed expense
}
```

---

## Implementation Patterns

### Naming Conventions

| Type | Pattern | Example |
|------|---------|---------|
| Database tables | snake_case, plural | `user_engagement_states` |
| Database columns | snake_case | `last_activity_at` |
| TypeScript files | kebab-case | `state-machine.ts` |
| TypeScript types | PascalCase | `EngagementState` |
| TypeScript functions | camelCase | `transitionState()` |
| Constants | SCREAMING_SNAKE | `INACTIVITY_THRESHOLD_DAYS` |
| Analytics events | snake_case with prefix | `engagement_state_changed` |

### Configuration Constants

```typescript
// services/engagement/constants.ts
export const ENGAGEMENT_CONFIG = {
  INACTIVITY_THRESHOLD_DAYS: 14,
  GOODBYE_TIMEOUT_HOURS: 48,
  REMIND_LATER_DAYS: 14,
  WEEKLY_REVIEW_DAY: 1,  // Monday (0=Sunday)
  MAX_MESSAGE_RETRY: 3,

  TIER_1_ACTIONS: ['add_expense', 'edit_category', 'delete_expense', 'add_category'],
  TIER_2_ACTIONS: ['set_budget', 'add_recurring', 'list_categories'],
  TIER_3_ACTIONS: ['edit_category', 'view_report'],
} as const
```

### Idempotency Pattern

```typescript
// Idempotency key format
function getIdempotencyKey(userId: string, eventType: string, date: Date): string {
  return `${userId}:${eventType}:${date.toISOString().split('T')[0]}`
}

// Usage in scheduler
await supabase
  .from('engagement_message_queue')
  .upsert({
    user_id: userId,
    message_type: 'goodbye',
    idempotency_key: getIdempotencyKey(userId, 'goodbye_sent', new Date()),
    // ...
  }, {
    onConflict: 'idempotency_key',
    ignoreDuplicates: true
  })
```

### State Transition Pattern

```typescript
// Always use state machine service - never update state directly

// ✅ Correct
import { transitionState } from '@/services/engagement/state-machine'
await transitionState(userId, 'goodbye_response_1')

// ❌ Wrong - bypasses validation, logging, side effects
await supabase.from('user_engagement_states').update({ state: 'help_flow' })
```

### Message Queue Pattern

```typescript
// Always queue proactive messages

// ✅ Correct
import { queueMessage } from '@/services/scheduler/message-sender'
await queueMessage({
  userId,
  messageType: 'goodbye',
  destination: user.preferred_destination,
  idempotencyKey: getIdempotencyKey(userId, 'goodbye_sent', new Date())
})

// ❌ Wrong - no retry, audit trail, or idempotency
await sendWhatsAppMessage(userJid, goodbyeMessage)
```

### Error Handling Pattern

```typescript
// Scheduler: Log and continue (batch resilience)
for (const user of users) {
  try {
    await transitionToGoodbye(user.id)
  } catch (error) {
    logger.error('Failed to process engagement', { user_id: user.id, error })
    // Continue to next user
  }
}

// User-facing: Friendly error response
try {
  await processGoodbyeResponse(userId, response)
  return getLocalizedMessage('goodbye_acknowledged', locale)
} catch (error) {
  logger.error('Goodbye response failed', { userId, error })
  return getLocalizedMessage('error_generic', locale)
}
```

---

## Consistency Rules

### Code Organization

- Engagement handlers go in `handlers/engagement/`
- Engagement services go in `services/engagement/`
- Scheduler services go in `services/scheduler/`
- Tests mirror source structure in `__tests__/engagement/`

### Error Handling

- Scheduler jobs: Log errors, continue processing (never fail batch for one user)
- User handlers: Return localized friendly message, log details
- Never expose internal errors to users

### Logging Strategy

```typescript
// Structured logging for all engagement events
logger.info('Engagement state transition', {
  user_id: userId,
  from_state: previousState,
  to_state: newState,
  trigger: trigger,
  timestamp: new Date().toISOString()
})
```

### Analytics Events

| Event | Properties | Trigger |
|-------|------------|---------|
| `engagement_state_changed` | from_state, to_state, trigger, days_inactive | Any state transition |
| `onboarding_tier_completed` | tier, actions_completed, time_to_complete | Tier completion |
| `onboarding_magic_moment` | first_expense_category, first_expense_amount | First NLP-parsed expense |
| `engagement_goodbye_sent` | days_inactive, preferred_destination | Goodbye message sent |
| `engagement_goodbye_response` | response_type (confused/busy/all_good/timeout) | User responds or timeout |
| `engagement_weekly_review_sent` | activity_count, days_active | Weekly review sent |

---

## Data Architecture

### New Tables

```sql
-- Engagement state machine
CREATE TABLE user_engagement_states (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  state TEXT NOT NULL DEFAULT 'active'
    CHECK (state IN ('active', 'goodbye_sent', 'help_flow', 'remind_later', 'dormant')),
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  goodbye_sent_at TIMESTAMPTZ,
  goodbye_expires_at TIMESTAMPTZ,
  remind_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_engagement_state ON user_engagement_states(state);
CREATE INDEX idx_engagement_last_activity ON user_engagement_states(last_activity_at);
CREATE INDEX idx_engagement_goodbye_expires ON user_engagement_states(goodbye_expires_at)
  WHERE goodbye_expires_at IS NOT NULL;
CREATE INDEX idx_engagement_remind_at ON user_engagement_states(remind_at)
  WHERE remind_at IS NOT NULL;

-- State transition audit log
CREATE TABLE engagement_state_transitions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  from_state TEXT NOT NULL,
  to_state TEXT NOT NULL,
  trigger TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_transitions_user ON engagement_state_transitions(user_id);
CREATE INDEX idx_transitions_created ON engagement_state_transitions(created_at);

-- Proactive message queue
CREATE TABLE engagement_message_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message_type TEXT NOT NULL
    CHECK (message_type IN ('welcome', 'tier_unlock', 'goodbye', 'weekly_review', 'reminder', 'help_restart')),
  message_key TEXT NOT NULL,  -- Localization key
  message_params JSONB,       -- Variables for localization
  destination TEXT NOT NULL CHECK (destination IN ('individual', 'group')),
  destination_jid TEXT NOT NULL,
  scheduled_for TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
  retry_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_queue_status ON engagement_message_queue(status) WHERE status = 'pending';
CREATE INDEX idx_queue_scheduled ON engagement_message_queue(scheduled_for) WHERE status = 'pending';
```

### Extended Columns (user_profiles)

```sql
ALTER TABLE user_profiles
  ADD COLUMN preferred_destination TEXT DEFAULT 'individual'
    CHECK (preferred_destination IN ('individual', 'group')),
  ADD COLUMN reengagement_opt_out BOOLEAN DEFAULT false,
  ADD COLUMN onboarding_tier INTEGER DEFAULT 0 CHECK (onboarding_tier BETWEEN 0 AND 3),
  ADD COLUMN onboarding_tier_progress JSONB DEFAULT '{}',
  ADD COLUMN magic_moment_at TIMESTAMPTZ;
```

### RLS Policies

```sql
-- user_engagement_states
ALTER TABLE user_engagement_states ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own engagement state" ON user_engagement_states
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role manages engagement" ON user_engagement_states
  FOR ALL USING (auth.jwt()->>'role' = 'service_role');

-- engagement_state_transitions (read-only for users)
ALTER TABLE engagement_state_transitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own transitions" ON engagement_state_transitions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role manages transitions" ON engagement_state_transitions
  FOR ALL USING (auth.jwt()->>'role' = 'service_role');

-- engagement_message_queue (service role only)
ALTER TABLE engagement_message_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages queue" ON engagement_message_queue
  FOR ALL USING (auth.jwt()->>'role' = 'service_role');
```

---

## API Contracts

### State Machine Service

```typescript
// services/engagement/state-machine.ts

interface TransitionResult {
  success: boolean
  previousState: EngagementState
  newState: EngagementState
  sideEffects: string[]  // e.g., ['queued_goodbye_message', 'logged_transition']
}

// Main transition function
async function transitionState(
  userId: string,
  trigger: TransitionTrigger
): Promise<TransitionResult>

// Query functions
async function getEngagementState(userId: string): Promise<EngagementState>
async function getInactiveUsers(days: number): Promise<UserEngagementState[]>
async function getExpiredGoodbyes(): Promise<UserEngagementState[]>
async function getDueReminders(): Promise<UserEngagementState[]>
```

### Scheduler Services

```typescript
// services/scheduler/daily-engagement-job.ts
async function runDailyEngagementJob(): Promise<JobResult>

// services/scheduler/weekly-review-job.ts
async function runWeeklyReviewJob(): Promise<JobResult>

// services/scheduler/message-sender.ts
async function processMessageQueue(): Promise<ProcessResult>
async function queueMessage(params: QueueMessageParams): Promise<void>

interface JobResult {
  processed: number
  succeeded: number
  failed: number
  errors: Array<{ userId: string; error: string }>
}
```

### Tier Tracker Service

```typescript
// services/onboarding/tier-tracker.ts

async function recordAction(userId: string, action: TierAction): Promise<TierUpdate>
async function getTierProgress(userId: string): Promise<TierProgress>
async function checkTierCompletion(userId: string, tier: 1 | 2 | 3): Promise<boolean>

interface TierUpdate {
  action: TierAction
  tierCompleted: number | null  // null if no tier completed
  shouldSendUnlock: boolean
}
```

---

## Security Architecture

### Authentication

- **No changes** to existing Supabase Auth + Multi-identifier WhatsApp system
- Engagement state tied to `auth.users.id`

### Authorization

- RLS on all new tables (see Data Architecture)
- Service role for scheduler operations (bypasses RLS)
- User can only view own engagement state

### Data Protection

- No new sensitive data collected
- Engagement state is not PII
- Transition logs include user_id (existing pattern)

### Opt-Out Respect

- `reengagement_opt_out = true` blocks ALL proactive messages
- Scheduler checks opt-out before queuing any message
- Onboarding tips still allowed (separate from re-engagement)

---

## Performance Considerations

### Scheduler Efficiency

| Requirement | Target | Implementation |
|-------------|--------|----------------|
| Daily job completion | < 60 seconds | Batch queries, parallel message queuing |
| Weekly job completion | < 60 seconds | Single query for active users |
| Queue processing | 100 messages/minute | Sequential send with 500ms delay |

### Database Queries

```sql
-- Efficient inactivity check (uses index)
SELECT * FROM user_engagement_states
WHERE state = 'active'
  AND last_activity_at < NOW() - INTERVAL '14 days';

-- Efficient timeout check (uses partial index)
SELECT * FROM user_engagement_states
WHERE state = 'goodbye_sent'
  AND goodbye_expires_at < NOW();
```

### Message Sending

- 500ms delay between messages (WhatsApp rate limiting)
- Retry with exponential backoff (1s, 2s, 4s)
- Max 3 retries before marking failed

---

## Deployment Architecture

### Railway Cron Jobs

```yaml
# railway.cron.yml (add to existing)
jobs:
  - name: engagement-daily
    schedule: "0 6 * * *"  # 6 AM UTC daily
    command: "node dist/cron/run-engagement-daily.js"

  - name: engagement-weekly
    schedule: "0 9 * * 1"  # 9 AM UTC Monday
    command: "node dist/cron/run-engagement-weekly.js"
```

### Database Migrations

Migration file: `033_engagement_system.sql`
- Creates 3 new tables
- Adds 5 columns to user_profiles
- Creates indexes and RLS policies

### Environment Variables

No new environment variables required.

---

## Development Environment

### Prerequisites

No new prerequisites. Existing setup sufficient.

### Setup Commands

```bash
# Apply new migration
psql $DATABASE_URL < fe/scripts/033_engagement_system.sql

# Run tests
cd whatsapp-bot
npm test -- --testPathPattern=engagement
```

### Local Testing

```bash
# Test scheduler jobs locally
npm run test:scheduler

# Test state machine transitions
npm test -- state-machine.test.ts

# Run 30-day journey integration test
npm test -- 30-day-journey.test.ts
```

---

## Architecture Decision Records (ADRs)

### ADR-001: Separate Engagement State Table

**Decision:** Create new `user_engagement_states` table instead of extending `user_profiles`

**Context:** Need to track 5 engagement states with timestamps and support efficient scheduler queries

**Rationale:**
- Clean separation of concerns (profile vs. engagement)
- Easier to add indexes for scheduler queries
- Simpler audit trail with dedicated transition table
- `user_profiles` already has many columns

**Consequences:**
- One additional JOIN for combined queries
- Slightly more complex initial setup

---

### ADR-002: Database-Driven Scheduler

**Decision:** Use database polling + Railway cron instead of in-process timers

**Context:** Need reliable, idempotent scheduled jobs for engagement transitions

**Rationale:**
- Survives service restarts (state in DB, not memory)
- Idempotency via unique keys prevents double-sends
- Aligns with existing Railway cron infrastructure
- Audit trail built-in via message queue

**Consequences:**
- Slightly higher latency (daily check vs. real-time)
- Requires cron job configuration

---

### ADR-003: Message Queue Table

**Decision:** Queue all proactive messages in database before sending

**Context:** Need retry capability, audit trail, and idempotency for WhatsApp messages

**Rationale:**
- Failed sends can be retried automatically
- Full audit trail of what was sent when
- Idempotency keys prevent duplicate messages
- Destination routing centralized

**Consequences:**
- Two-phase send (queue then process)
- Additional table to maintain

---

### ADR-004: Jest + Mocks for Testing

**Decision:** Use Jest with mocked Baileys for all automated testing

**Context:** Need reliable E2E testing for WhatsApp bot flows

**Rationale:**
- No official Baileys sandbox exists
- Real WhatsApp testing is flaky and risks account bans
- Mocks cover 95% of logic (everything except actual message delivery)
- Fast, deterministic CI execution

**Consequences:**
- "Last mile" (actual Baileys send/receive) untested in CI
- Manual QA recommended before major releases

---

### ADR-005: Single Daily Job for Timeouts

**Decision:** Check 48h goodbye timeout in daily job rather than precise scheduling

**Context:** Need to handle goodbye response timeouts

**Rationale:**
- Simplicity: one job handles all time-based transitions
- Precision not critical (48h vs 49h doesn't matter for UX)
- Reduces scheduler complexity
- Easier to debug and monitor

**Consequences:**
- Up to 24h delay beyond exact 48h timeout
- Acceptable per product requirements

---

_Generated by BMAD Decision Architecture Workflow_
_Date: 2025-11-21_
_For: Lucas_
