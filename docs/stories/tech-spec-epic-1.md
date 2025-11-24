# Epic Technical Specification: Foundation & Message Infrastructure

**Date:** 2025-11-21
**Author:** Lucas
**Epic ID:** 1
**Status:** Contexted

---

## Overview

Epic 1 establishes the foundational infrastructure required for the Smart Onboarding & Engagement System. This epic creates the database schema, service architecture, localization system, and message queue that all subsequent epics depend on.

This is a **pure infrastructure epic**—no user-facing features are delivered, but all future engagement functionality requires these foundations. The epic aligns with the PRD's tone guidelines (FR33-FR37) by establishing the localization messages that will be used throughout the system.

---

## Objectives and Scope

### In Scope

- Database migration `033_engagement_system.sql` creating:
  - `user_engagement_states` table (5-state machine storage)
  - `engagement_state_transitions` table (audit log)
  - `engagement_message_queue` table (proactive message delivery)
  - Extended columns on `user_profiles`
- Handler directory structure (`handlers/engagement/`)
- Service directory structure (`services/engagement/`, `services/scheduler/`)
- TypeScript types for engagement state machine
- Configuration constants (thresholds, tier actions)
- Localization messages in Portuguese (pt-BR)
- Localization messages in English
- Message queue service foundation (queueing, idempotency, retry logic)

### Out of Scope

- Actual state transitions (Epic 4)
- Message sending via WhatsApp/Baileys (Epic 5)
- User-facing onboarding flow (Epic 2)
- Tier tracking logic (Epic 3)
- Web integration (Epic 6)

---

## System Architecture Alignment

This epic implements the following architecture components:

| Architecture Section | Implementation |
|---------------------|----------------|
| Data Architecture - New Tables | Story 1.1 |
| Data Architecture - Extended Columns | Story 1.1 |
| Data Architecture - RLS Policies | Story 1.1 |
| Project Structure - handlers/engagement/ | Story 1.2 |
| Project Structure - services/engagement/ | Story 1.3 |
| Project Structure - services/scheduler/ | Story 1.3 |
| Implementation Patterns - Naming Conventions | Story 1.3 |
| Implementation Patterns - Configuration Constants | Story 1.3 |
| Implementation Patterns - Idempotency Pattern | Story 1.6 |
| Localization | Stories 1.4, 1.5 |

**ADRs Applied:**
- ADR-001: Separate engagement state table (Story 1.1)
- ADR-003: Message queue table (Story 1.6)

---

## Detailed Design

### Services and Modules

| Module | File | Responsibility |
|--------|------|----------------|
| **Engagement Types** | `services/engagement/types.ts` | TypeScript interfaces for `EngagementState`, `TransitionTrigger`, `TierProgress`, `MessageType` |
| **Engagement Constants** | `services/engagement/constants.ts` | `INACTIVITY_THRESHOLD_DAYS: 14`, `GOODBYE_TIMEOUT_HOURS: 48`, tier action arrays |
| **Handler Index** | `handlers/engagement/index.ts` | Re-exports all engagement handlers |
| **Goodbye Handler** | `handlers/engagement/goodbye-handler.ts` | Placeholder for goodbye response processing |
| **First Message Handler** | `handlers/engagement/first-message-handler.ts` | Placeholder for welcome flow |
| **Tier Progress Handler** | `handlers/engagement/tier-progress-handler.ts` | Placeholder for tier tracking |
| **Opt-Out Handler** | `handlers/engagement/opt-out-handler.ts` | Placeholder for opt-out commands |
| **Message Queue Service** | `services/scheduler/message-sender.ts` | `queueMessage()`, `getIdempotencyKey()`, retry logic |

### Data Models and Contracts

#### user_engagement_states

```sql
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

-- Indexes for scheduler queries
CREATE INDEX idx_engagement_state ON user_engagement_states(state);
CREATE INDEX idx_engagement_last_activity ON user_engagement_states(last_activity_at);
CREATE INDEX idx_engagement_goodbye_expires ON user_engagement_states(goodbye_expires_at)
  WHERE goodbye_expires_at IS NOT NULL;
CREATE INDEX idx_engagement_remind_at ON user_engagement_states(remind_at)
  WHERE remind_at IS NOT NULL;
```

#### engagement_state_transitions

```sql
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
```

#### engagement_message_queue

```sql
CREATE TABLE engagement_message_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message_type TEXT NOT NULL
    CHECK (message_type IN ('welcome', 'tier_unlock', 'goodbye', 'weekly_review', 'reminder', 'help_restart')),
  message_key TEXT NOT NULL,
  message_params JSONB,
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

#### user_profiles Extensions

```sql
ALTER TABLE user_profiles
  ADD COLUMN preferred_destination TEXT DEFAULT 'individual'
    CHECK (preferred_destination IN ('individual', 'group')),
  ADD COLUMN reengagement_opt_out BOOLEAN DEFAULT false,
  ADD COLUMN onboarding_tier INTEGER DEFAULT 0 CHECK (onboarding_tier BETWEEN 0 AND 3),
  ADD COLUMN onboarding_tier_progress JSONB DEFAULT '{}',
  ADD COLUMN magic_moment_at TIMESTAMPTZ;
```

### APIs and Interfaces

#### Message Queue Service Interface

```typescript
// services/scheduler/message-sender.ts

interface QueueMessageParams {
  userId: string
  messageType: MessageType
  messageKey: string
  messageParams?: Record<string, unknown>
  destination: 'individual' | 'group'
  destinationJid: string
  scheduledFor?: Date
}

// Queue a proactive message with idempotency
async function queueMessage(params: QueueMessageParams): Promise<void>

// Generate idempotency key
function getIdempotencyKey(userId: string, eventType: string, date: Date): string
// Returns: "{userId}:{eventType}:{YYYY-MM-DD}"

// Process pending messages (called by scheduler)
async function processMessageQueue(): Promise<ProcessResult>

interface ProcessResult {
  processed: number
  succeeded: number
  failed: number
  errors: Array<{ messageId: string; error: string }>
}
```

#### TypeScript Types

```typescript
// services/engagement/types.ts

type EngagementState = 'active' | 'goodbye_sent' | 'help_flow' | 'remind_later' | 'dormant'

type TransitionTrigger =
  | 'user_message'
  | 'inactivity_14d'
  | 'goodbye_response_1'
  | 'goodbye_response_2'
  | 'goodbye_response_3'
  | 'goodbye_timeout'
  | 'reminder_due'

type MessageType = 'welcome' | 'tier_unlock' | 'goodbye' | 'weekly_review' | 'reminder' | 'help_restart'

interface TierProgress {
  tier1: {
    add_expense: boolean
    edit_category: boolean
    delete_expense: boolean
    add_category: boolean
    completed_at?: string
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
  magic_moment_at?: string
}
```

### Workflows and Sequencing

**Story Execution Order:**

```
1.1 Database Schema Migration
        ↓
1.2 Handler Directory Structure ──┬─→ 1.4 Localization pt-BR ──→ 1.5 Localization en
        ↓                         │
1.3 Service Directory Structure ──┘
        ↓
1.6 Message Queue Service Foundation
```

**Dependencies:**
- Story 1.2 and 1.3 can run in parallel after 1.1
- Story 1.4 must complete before 1.5 (defines all keys)
- Story 1.6 requires 1.1 (database) and 1.3 (types)

---

## Non-Functional Requirements

### Performance

| Requirement | Target | Validation |
|-------------|--------|------------|
| Migration execution time | < 30 seconds | Manual verification during deployment |
| Index creation | Complete without locking | Use `CONCURRENTLY` if production data exists |

**Note:** Epic 1 is infrastructure-only. Performance NFRs (NFR1-NFR3) apply to Epics 4-5.

### Security

| Requirement | Implementation |
|-------------|----------------|
| RLS on `user_engagement_states` | Users can SELECT own row; service role full access |
| RLS on `engagement_state_transitions` | Users can SELECT own rows (read-only); service role full access |
| RLS on `engagement_message_queue` | Service role only (no user access) |

**RLS Policies:**

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

### Reliability/Availability

| Requirement | Implementation |
|-------------|----------------|
| Migration rollback | Wrap in transaction; test on staging first |
| Idempotency key uniqueness | UNIQUE constraint prevents duplicates |
| Queue message durability | PostgreSQL ACID guarantees |

### Observability

| Signal | Implementation |
|--------|----------------|
| Migration success | Log migration completion with table row counts |
| Service initialization | Log when engagement services are loaded |
| Queue operations | Log message queued, sent, failed events |

---

## Dependencies and Integrations

### Existing Dependencies (No Changes)

| Dependency | Version | Usage |
|------------|---------|-------|
| @supabase/supabase-js | ^2.x | Database client |
| typescript | ^5.x | Type definitions |

### Existing Localization Files

| File | Changes |
|------|---------|
| `whatsapp-bot/src/localization/pt-br.ts` | Add engagement message keys |
| `whatsapp-bot/src/localization/en.ts` | Add engagement message keys |

### Integration Points

| Integration | Epic 1 Responsibility |
|-------------|----------------------|
| Supabase Database | Create tables via migration |
| Existing `localization/` | Extend with new message categories |
| Existing handler pattern | Follow `handlers/transactions/` structure |

---

## Acceptance Criteria (Authoritative)

### Story 1.1: Database Schema Migration

1. **AC-1.1.1:** Migration file `033_engagement_system.sql` exists in `fe/scripts/`
2. **AC-1.1.2:** Running migration creates `user_engagement_states` table with all columns
3. **AC-1.1.3:** Running migration creates `engagement_state_transitions` table with all columns
4. **AC-1.1.4:** Running migration creates `engagement_message_queue` table with all columns
5. **AC-1.1.5:** Running migration adds 5 columns to `user_profiles`
6. **AC-1.1.6:** All indexes are created for efficient scheduler queries
7. **AC-1.1.7:** RLS policies enforce user-level access control
8. **AC-1.1.8:** CHECK constraints validate state values

### Story 1.2: Engagement Handler Directory Structure

9. **AC-1.2.1:** File `handlers/engagement/index.ts` exists and exports all handlers
10. **AC-1.2.2:** File `handlers/engagement/goodbye-handler.ts` exists (placeholder)
11. **AC-1.2.3:** File `handlers/engagement/first-message-handler.ts` exists (placeholder)
12. **AC-1.2.4:** File `handlers/engagement/tier-progress-handler.ts` exists (placeholder)
13. **AC-1.2.5:** File `handlers/engagement/opt-out-handler.ts` exists (placeholder)
14. **AC-1.2.6:** All files pass TypeScript compilation

### Story 1.3: Engagement Service Directory Structure

15. **AC-1.3.1:** File `services/engagement/types.ts` defines `EngagementState`, `TransitionTrigger`, `MessageType`, `TierProgress`
16. **AC-1.3.2:** File `services/engagement/constants.ts` defines `INACTIVITY_THRESHOLD_DAYS: 14`, `GOODBYE_TIMEOUT_HOURS: 48`, `REMIND_LATER_DAYS: 14`, tier action arrays
17. **AC-1.3.3:** File `services/engagement/index.ts` exports all engagement services
18. **AC-1.3.4:** Files exist: `state-machine.ts`, `activity-tracker.ts`, `message-router.ts` (placeholders)
19. **AC-1.3.5:** Files exist: `services/scheduler/index.ts`, `daily-engagement-job.ts`, `weekly-review-job.ts`, `message-sender.ts` (placeholders)

### Story 1.4: Engagement Localization - Portuguese

20. **AC-1.4.1:** `localization/pt-br.ts` contains welcome message categories
21. **AC-1.4.2:** `localization/pt-br.ts` contains tier unlock messages (Tier 1, 2, 3)
22. **AC-1.4.3:** `localization/pt-br.ts` contains goodbye/self-select messages
23. **AC-1.4.4:** `localization/pt-br.ts` contains weekly review messages
24. **AC-1.4.5:** `localization/pt-br.ts` contains opt-out confirmation messages
25. **AC-1.4.6:** All messages use casual register ("você"), max one emoji
26. **AC-1.4.7:** No guilt, pressure, judgment, or manipulation framing

### Story 1.5: Engagement Localization - English

27. **AC-1.5.1:** All keys from Story 1.4 have English equivalents in `localization/en.ts`
28. **AC-1.5.2:** Messages are natural English (not direct translations)
29. **AC-1.5.3:** Tone guidelines followed (curiosity, celebration, dignity, empowerment)

### Story 1.6: Message Queue Service Foundation

30. **AC-1.6.1:** `queueMessage()` creates queue entry with `status = 'pending'`, `retry_count = 0`
31. **AC-1.6.2:** Duplicate idempotency keys are silently ignored (upsert behavior)
32. **AC-1.6.3:** `getIdempotencyKey()` returns format `{userId}:{eventType}:{YYYY-MM-DD}`
33. **AC-1.6.4:** Retry logic increments `retry_count` on failure
34. **AC-1.6.5:** After 3 failures, status becomes `'failed'`

---

## Traceability Mapping

| AC | Spec Section | Component/API | Test Approach |
|----|--------------|---------------|---------------|
| AC-1.1.1 - AC-1.1.8 | Data Models | `033_engagement_system.sql` | Integration: Run migration, verify tables |
| AC-1.2.1 - AC-1.2.6 | Services/Modules | `handlers/engagement/` | Unit: Import all, verify TypeScript compiles |
| AC-1.3.1 - AC-1.3.5 | Services/Modules, APIs | `services/engagement/`, `services/scheduler/` | Unit: Verify types, constants match spec |
| AC-1.4.1 - AC-1.4.7 | N/A | `localization/pt-br.ts` | Manual: Review all messages for tone compliance |
| AC-1.5.1 - AC-1.5.3 | N/A | `localization/en.ts` | Manual: Review all messages for tone compliance |
| AC-1.6.1 - AC-1.6.5 | APIs/Interfaces | `message-sender.ts` | Unit: Test queue, idempotency, retry logic |

---

## Risks, Assumptions, Open Questions

### Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| **R1:** Migration conflicts with existing schema | Low | Medium | Run on staging first; review existing migrations |
| **R2:** RLS policies block service operations | Medium | High | Test scheduler with service role key |
| **R3:** Localization messages don't match PRD tone | Low | Medium | Review against PRD "Critical Interaction Flows" section |

### Assumptions

| Assumption | Validation |
|------------|------------|
| **A1:** Existing `user_profiles` table exists and is stable | Verified in brownfield docs |
| **A2:** Service role key available for scheduler operations | Existing pattern in codebase |
| **A3:** Localization pattern follows existing `localization/pt-br.ts` structure | Verified in brownfield docs |

### Open Questions

| Question | Status | Resolution |
|----------|--------|------------|
| **Q1:** Should `magic_moment_at` be in `user_profiles` or separate table? | Resolved | PRD + Architecture spec: `user_profiles` |
| **Q2:** Is 48h timeout precise or approximate? | Resolved | ADR-005: Approximate (daily job) |

---

## Test Strategy Summary

### Unit Tests

| Target | Test File | Coverage |
|--------|-----------|----------|
| TypeScript types compile | `types.test.ts` | Verify all types export correctly |
| Constants values | `constants.test.ts` | Verify thresholds match PRD |
| `getIdempotencyKey()` | `message-sender.test.ts` | Format, uniqueness |
| `queueMessage()` | `message-sender.test.ts` | Queue creation, upsert behavior |
| Retry logic | `message-sender.test.ts` | Increment, max retries, status change |

### Integration Tests

| Target | Test File | Coverage |
|--------|-----------|----------|
| Migration execution | `migration.test.ts` | All tables created, indexes exist |
| RLS policies | `rls.test.ts` | User access restricted, service role works |
| Queue persistence | `queue.test.ts` | Messages survive restarts |

### Manual Verification

| Target | Checklist |
|--------|-----------|
| Localization pt-BR | Review all messages for tone, emoji count |
| Localization en | Review all messages for natural English |
| Directory structure | Verify all files exist and compile |

---

_Generated by BMAD Epic Tech Context Workflow_
_Date: 2025-11-21_
_For: Lucas_
_Epic: 1 - Foundation & Message Infrastructure_
