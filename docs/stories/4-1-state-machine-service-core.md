# Story 4.1: State Machine Service Core

**Status:** review

---

## Story

**As a** system,
**I want** a state machine service with validated transitions,
**So that** engagement states change predictably and correctly across all user interactions.

---

## Acceptance Criteria

1. **AC-4.1.1:** `transitionState()` validates all 10 transitions per architecture state diagram
2. **AC-4.1.2:** Invalid transitions are logged and rejected with descriptive error
3. **AC-4.1.3:** Every successful transition creates `engagement_state_transitions` record
4. **AC-4.1.4:** State machine handles missing user gracefully (creates initial state)
5. **AC-4.1.5:** Concurrent transitions for same user handled safely (optimistic locking)

---

## Tasks / Subtasks

- [x] **Task 1: Define transition validation map** (AC: 1, 2)
  - [x] Create `TRANSITION_MAP` constant mapping current state → allowed triggers → new state
  - [x] Include all 10 valid transitions from architecture diagram:
    - `active` + `inactivity_14d` → `goodbye_sent`
    - `goodbye_sent` + `user_message` → `active`
    - `goodbye_sent` + `goodbye_response_1` → `help_flow`
    - `goodbye_sent` + `goodbye_response_2` → `remind_later`
    - `goodbye_sent` + `goodbye_response_3` → `dormant`
    - `goodbye_sent` + `goodbye_timeout` → `dormant`
    - `help_flow` + `user_message` → `active`
    - `remind_later` + `user_message` → `active`
    - `remind_later` + `reminder_due` → `dormant`
    - `dormant` + `user_message` → `active`

- [x] **Task 2: Implement `transitionState()` function** (AC: 1, 2, 3, 5)
  - [x] Accept `userId: string` and `trigger: TransitionTrigger` parameters
  - [x] Fetch current state from `user_engagement_states` table
  - [x] Validate transition against `TRANSITION_MAP`
  - [x] If invalid: log error with context (userId, currentState, trigger), return failure result
  - [x] If valid: execute state update in single transaction
  - [x] Use optimistic locking via `updated_at` check
  - [x] Return `TransitionResult` with success, previousState, newState, sideEffects

- [x] **Task 3: Implement state initialization for new users** (AC: 4)
  - [x] In `transitionState()`, if user has no `user_engagement_states` record:
    - Create new record with `state = 'active'`, `last_activity_at = now()`
  - [x] For `user_message` trigger on new user, don't fail - just initialize
  - [x] Log initialization as side effect

- [x] **Task 4: Implement transition logging** (AC: 3)
  - [x] After successful state update, insert into `engagement_state_transitions`:
    - `user_id`, `from_state`, `to_state`, `trigger`, `metadata`, `created_at`
  - [x] Calculate `days_inactive` for metadata when applicable (from `last_activity_at`)
  - [x] Include in same transaction as state update

- [x] **Task 5: Implement state-specific timestamp updates** (AC: 1)
  - [x] On transition to `goodbye_sent`:
    - Set `goodbye_sent_at = now()`
    - Set `goodbye_expires_at = now() + 48 hours`
  - [x] On transition to `remind_later`:
    - Set `remind_at = now() + 14 days`
  - [x] On transition to `active`:
    - Clear `goodbye_sent_at`, `goodbye_expires_at`, `remind_at`
  - [x] Always update `updated_at = now()`

- [x] **Task 6: Implement query helper functions** (AC: 1)
  - [x] `getEngagementState(userId)`: Return current state or 'active' for new users
  - [x] `getInactiveUsers(days)`: Return users where state='active' AND last_activity_at < now - days
  - [x] `getExpiredGoodbyes()`: Return users where state='goodbye_sent' AND goodbye_expires_at < now
  - [x] `getDueReminders()`: Return users where state='remind_later' AND remind_at < now

- [x] **Task 7: Write unit tests** (AC: 1-5)
  - [x] Test all 10 valid transitions succeed
  - [x] Test invalid transitions rejected with error
  - [x] Test transition log created for each transition
  - [x] Test new user initialization works
  - [x] Test concurrent transition handling (simulate race condition)
  - [x] Test timestamp updates for each state type
  - [x] Test query helper functions return correct results

---

## Dev Notes

### Architecture Alignment

Implements the core state machine per architecture.md state diagram. This is the foundational service that all other Epic 4 stories depend on.

**Architectural Constraints:**
1. All state changes MUST go through `transitionState()` - never update DB directly
2. State transitions must be safe to retry (idempotent where possible)
3. Every transition logged to `engagement_state_transitions` for audit trail
4. Use single transaction for atomicity (state update + log insert)

### State Transition Diagram Reference

```
ACTIVE ──(inactivity_14d)──> GOODBYE_SENT
GOODBYE_SENT ──(user_message)──> ACTIVE
GOODBYE_SENT ──(goodbye_response_1)──> HELP_FLOW ──(user_message)──> ACTIVE
GOODBYE_SENT ──(goodbye_response_2)──> REMIND_LATER ──(user_message)──> ACTIVE
GOODBYE_SENT ──(goodbye_response_3)──> DORMANT
GOODBYE_SENT ──(goodbye_timeout)──> DORMANT
REMIND_LATER ──(reminder_due)──> DORMANT
DORMANT ──(user_message)──> ACTIVE
```

### Type Definitions (from Epic 1)

```typescript
// services/engagement/types.ts (already created in Epic 1)
type EngagementState = 'active' | 'goodbye_sent' | 'help_flow' | 'remind_later' | 'dormant'

type TransitionTrigger =
  | 'user_message'
  | 'inactivity_14d'
  | 'goodbye_response_1'
  | 'goodbye_response_2'
  | 'goodbye_response_3'
  | 'goodbye_timeout'
  | 'reminder_due'

interface TransitionResult {
  success: boolean
  previousState: EngagementState
  newState: EngagementState
  sideEffects: string[]
}
```

### Implementation Pattern

```typescript
// services/engagement/state-machine.ts

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

export async function transitionState(
  userId: string,
  trigger: TransitionTrigger
): Promise<TransitionResult> {
  // 1. Get current state (or initialize)
  // 2. Validate transition
  // 3. Execute in transaction (update state + insert log)
  // 4. Return result with side effects
}
```

### Database Tables (created in Epic 1)

- `user_engagement_states`: Primary state storage
- `engagement_state_transitions`: Audit log

### Concurrency Handling

Use Postgres advisory locks or optimistic locking:

```typescript
// Option 1: Optimistic locking via updated_at
const result = await supabase
  .from('user_engagement_states')
  .update({ state: newState, updated_at: now })
  .eq('user_id', userId)
  .eq('updated_at', currentUpdatedAt)  // Only update if unchanged

// Option 2: Advisory lock
await supabase.rpc('pg_advisory_xact_lock', { key: hashUserId(userId) })
```

### Project Structure Notes

- File location: `whatsapp-bot/src/services/engagement/state-machine.ts`
- Exports: `transitionState`, `getEngagementState`, `getInactiveUsers`, `getExpiredGoodbyes`, `getDueReminders`
- Uses Supabase service client from existing patterns
- Follow existing service patterns from `services/onboarding/tier-tracker.ts`

### Learnings from Previous Story

**From Story 3-6-tier-completion-analytics (Status: done)**

- **PostHog Integration**: Uses existing analytics/tracker.ts with `trackEvent` function - follow same pattern for state change events in Story 4.7
- **Fire-and-forget Pattern**: Analytics calls use `.catch()` for non-blocking error handling - apply same pattern
- **Time Calculations**: `days_since_signup` calculation pattern at tier-tracker.ts:572-575 - reuse for `days_inactive` metadata
- **Test Structure**: 35 tests in tier-tracker.test.ts - follow similar organization for state-machine.test.ts

[Source: docs/stories/3-6-tier-completion-analytics.md#Dev-Agent-Record]

### References

- [Source: docs/sprint-artifacts/tech-spec-epic-4.md#Story-4.1-State-Machine-Service-Core]
- [Source: docs/architecture.md#Novel-Pattern-Design-Engagement-State-Machine]
- [Source: docs/epics.md#Story-4.1-State-Machine-Service-Core]

---

## Dev Agent Record

### Context Reference

- [docs/stories/4-1-state-machine-service-core.context.xml](4-1-state-machine-service-core.context.xml)

### Agent Model Used

Claude claude-sonnet-4-5-20250929

### Debug Log References

Implementation followed patterns from tier-tracker.ts. Used optimistic locking via updated_at check for concurrent safety. All 10 transitions validated via TRANSITION_MAP constant.

### Completion Notes List

- Implemented TRANSITION_MAP constant with all 10 valid state transitions
- transitionState() validates transitions, logs to audit table, handles optimistic locking
- New user initialization creates active state on first user_message
- State-specific timestamp updates for goodbye_sent (48h expiry), remind_later (14 days)
- Query helpers for scheduler jobs: getInactiveUsers, getExpiredGoodbyes, getDueReminders
- 40 unit tests covering all acceptance criteria
- Fixed activity-tracker.ts to use new transitionState signature

### File List

- whatsapp-bot/src/services/engagement/types.ts (modified - added TRANSITION_MAP, getTransitionTarget)
- whatsapp-bot/src/services/engagement/state-machine.ts (modified - full implementation)
- whatsapp-bot/src/services/engagement/index.ts (modified - updated exports)
- whatsapp-bot/src/services/engagement/activity-tracker.ts (modified - updated transitionState calls)
- whatsapp-bot/src/__tests__/services/engagement/state-machine.test.ts (new - 40 tests)

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2025-11-22 | SM Agent (Bob) | Initial draft from Epic 4 tech spec |
| 2025-11-22 | SM Agent (Bob) | Story context generated, marked ready-for-dev |
| 2025-11-22 | Dev Agent (Amelia) | Implementation complete, 40/40 tests passing, marked ready for review |
