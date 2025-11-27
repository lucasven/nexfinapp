# Epic Technical Specification: Engagement State Machine

Date: 2025-11-22
Author: Lucas
Epic ID: 4
Status: Draft

---

## Overview

Epic 4 implements the 5-state engagement state machine that powers NexFinApp's "comfort over pressure" re-engagement philosophy. Inactive users receive a respectful self-select goodbye message with three options (confused, busy, all good) instead of spam. The system tracks all state transitions, routes messages to preferred destinations, and ensures any user message immediately reactivates dormant users.

This epic is the core behavioral engine for re-engagement, building on the foundation infrastructure (Epic 1) and integrating with the welcome flow (Epic 2) and tier system (Epic 3). It provides the state management that Epic 5's scheduler jobs will use to trigger transitions.

## Objectives and Scope

### In Scope

- **State Machine Service** (Story 4.1): Core transition logic with validation, 5 states (ACTIVE, GOODBYE_SENT, HELP_FLOW, REMIND_LATER, DORMANT), 10 valid transitions
- **Activity Tracking** (Story 4.2): Update `last_activity_at` on every message, auto-reactivate dormant/goodbye_sent users
- **Self-Select Goodbye** (Story 4.3): Queue dignity-first goodbye message with 3 options when entering GOODBYE_SENT state
- **Response Processing** (Story 4.4): Parse user responses ("1", "2", "3") and trigger appropriate transitions
- **48h Timeout** (Story 4.5): Transition expired GOODBYE_SENT users to DORMANT (logic here, execution in Epic 5)
- **Message Routing** (Story 4.6): Route proactive messages to preferred destination (individual/group), handle destination change commands
- **Analytics Logging** (Story 4.7): Log all transitions to `engagement_state_transitions`, fire PostHog events

### Out of Scope

- **Scheduler execution**: Epic 5 handles daily/weekly job execution
- **First message handling**: Epic 2 handles welcome flow
- **Tier progress**: Epic 3 handles tier tracking
- **Opt-out preferences**: Epic 6 handles user preferences UI
- **Test infrastructure**: Epic 7 handles comprehensive testing

## System Architecture Alignment

### Components Referenced

| Component | Location | Purpose |
|-----------|----------|---------|
| State Machine Service | `services/engagement/state-machine.ts` | Core transition logic |
| Activity Tracker | `services/engagement/activity-tracker.ts` | Update activity, auto-reactivate |
| Message Router | `services/engagement/message-router.ts` | Route to preferred destination |
| Goodbye Handler | `handlers/engagement/goodbye-handler.ts` | Parse and process responses |
| Constants | `services/engagement/constants.ts` | Configuration values |
| Types | `services/engagement/types.ts` | TypeScript definitions |

### Database Tables

- `user_engagement_states`: Primary state storage (created in Epic 1)
- `engagement_state_transitions`: Audit log for all transitions
- `engagement_message_queue`: Message queue for proactive sends
- `user_profiles.preferred_destination`: Message routing preference

### Architectural Constraints

1. **Single Source of Truth**: All state changes MUST go through `transitionState()` - never update DB directly
2. **Idempotency**: State transitions must be safe to retry
3. **Audit Trail**: Every transition logged to `engagement_state_transitions`
4. **Message Queue**: All proactive messages queued before sending (retry capability)

---

## Detailed Design

### Services and Modules

| Service | Responsibility | Inputs | Outputs |
|---------|---------------|--------|---------|
| `state-machine.ts` | Validate and execute state transitions | userId, trigger | TransitionResult |
| `activity-tracker.ts` | Track activity, trigger auto-reactivation | userId, messageContext | void |
| `message-router.ts` | Resolve destination, queue messages | userId, messageType | void |
| `goodbye-handler.ts` | Parse responses, delegate to state machine | message, userId | response message |

### Data Models and Contracts

```typescript
// services/engagement/types.ts

type EngagementState = 'active' | 'goodbye_sent' | 'help_flow' | 'remind_later' | 'dormant'

type TransitionTrigger =
  | 'user_message'       // Any message from user
  | 'inactivity_14d'     // Daily job detects 14 days
  | 'goodbye_response_1' // "Confused"
  | 'goodbye_response_2' // "Busy"
  | 'goodbye_response_3' // "All good"
  | 'goodbye_timeout'    // 48h no response
  | 'reminder_due'       // 14 days after remind_later

interface TransitionResult {
  success: boolean
  previousState: EngagementState
  newState: EngagementState
  sideEffects: string[]  // e.g., ['queued_goodbye_message', 'logged_transition']
}

interface UserEngagementState {
  id: string
  user_id: string
  state: EngagementState
  last_activity_at: Date
  goodbye_sent_at?: Date
  goodbye_expires_at?: Date
  remind_at?: Date
  created_at: Date
  updated_at: Date
}

interface StateTransitionLog {
  id: string
  user_id: string
  from_state: EngagementState
  to_state: EngagementState
  trigger: TransitionTrigger
  metadata: {
    response_type?: 'confused' | 'busy' | 'all_good' | 'timeout'
    unprompted_return?: boolean
    days_inactive?: number
  }
  created_at: Date
}
```

### APIs and Interfaces

```typescript
// services/engagement/state-machine.ts

/**
 * Execute a state transition with full validation and side effects
 */
async function transitionState(
  userId: string,
  trigger: TransitionTrigger
): Promise<TransitionResult>

/**
 * Get current engagement state for a user
 */
async function getEngagementState(userId: string): Promise<EngagementState>

/**
 * Query users in specific states for scheduler
 */
async function getInactiveUsers(days: number): Promise<UserEngagementState[]>
async function getExpiredGoodbyes(): Promise<UserEngagementState[]>
async function getDueReminders(): Promise<UserEngagementState[]>
```

```typescript
// services/engagement/activity-tracker.ts

/**
 * Update activity timestamp and auto-reactivate if needed
 * Called on EVERY incoming message
 */
async function trackActivity(
  userId: string,
  messageContext: { isGoodbyeResponse: boolean }
): Promise<void>
```

```typescript
// services/engagement/message-router.ts

/**
 * Get resolved destination for a user
 */
async function getDestination(userId: string): Promise<{
  type: 'individual' | 'group'
  jid: string
}>

/**
 * Update user's preferred destination
 */
async function setDestination(
  userId: string,
  destination: 'individual' | 'group',
  jid: string
): Promise<void>
```

```typescript
// handlers/engagement/goodbye-handler.ts

/**
 * Parse and process goodbye response message
 * Returns appropriate response or null if not a goodbye response
 */
async function handleGoodbyeResponse(
  userId: string,
  message: string,
  locale: string
): Promise<string | null>
```

### Workflows and Sequencing

**State Transition Flow:**

```
1. Handler receives user message
2. activity-tracker.trackActivity() called
   ├── Updates last_activity_at
   ├── Checks current state
   └── If dormant/goodbye_sent → transitionState(user_message)
3. If message matches goodbye response pattern:
   ├── goodbye-handler parses response
   ├── transitionState(goodbye_response_N) called
   └── Appropriate side effects executed
4. Response sent to user
```

**Goodbye Send Flow (triggered by scheduler in Epic 5):**

```
1. Scheduler detects 14 days inactive
2. transitionState(userId, 'inactivity_14d') called
3. State machine:
   ├── Validates transition active → goodbye_sent
   ├── Sets goodbye_sent_at, goodbye_expires_at
   ├── Logs transition
   └── Queues goodbye message via message-router
4. Message queue processor sends message (Epic 5)
```

**Auto-Reactivation Flow:**

```
1. Dormant user sends any message
2. activity-tracker detects dormant state
3. transitionState(userId, 'user_message')
4. State: dormant → active
5. Metadata: unprompted_return = true if 3+ days
6. Normal message processing continues
```

---

## Non-Functional Requirements

### Performance

| Requirement | Target | Implementation |
|-------------|--------|----------------|
| NFR1: Activity tracking latency | < 50ms | Single DB update, no blocking |
| NFR2: State transition latency | < 100ms | Indexed queries, single transaction |
| NFR-REF: First message response | < 3 seconds | Activity tracking is async, doesn't block |

### Security

| Requirement | Implementation |
|-------------|----------------|
| State isolation | RLS policies on all tables - users see only own state |
| Service role access | Scheduler uses service role to bypass RLS for batch queries |
| No PII in logs | Transition logs use user_id only, no message content |

### Reliability/Availability

| Requirement | Target | Implementation |
|-------------|--------|----------------|
| NFR7: No duplicate messages | 100% | Idempotency keys on all queued messages |
| NFR6: State persistence | Survive restarts | All state in Postgres, no in-memory timers |
| Transition atomicity | All or nothing | Single transaction for state + log + queue |

### Observability

| Requirement | Implementation |
|-------------|----------------|
| NFR12: Scheduler job logging | Structured logs with user_id, state, trigger |
| NFR13: State change logging | All transitions to engagement_state_transitions table |
| PostHog events | `engagement_state_changed` with from/to/trigger |

---

## Dependencies and Integrations

### Internal Dependencies

| Dependency | Source | Required By |
|------------|--------|-------------|
| Database schema | Epic 1, Story 1.1 | All stories |
| Type definitions | Epic 1, Story 1.3 | All stories |
| Localization messages | Epic 1, Stories 1.4-1.5 | Stories 4.3, 4.4 |
| Message queue service | Epic 1, Story 1.6 | Story 4.3, 4.6 |
| First message detection | Epic 2, Story 2.1 | Story 4.2 (state initialization) |
| Preferred destination | Epic 2, Story 2.4 | Story 4.6 |

### External Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| @supabase/supabase-js | Existing | Database access |
| posthog-node | Existing | Analytics events |

### Framework Patterns

- Follow existing handler patterns from `handlers/transactions/`
- Use Supabase service client for state machine operations
- PostHog analytics via existing `services/analytics/` patterns

---

## Acceptance Criteria (Authoritative)

### Story 4.1: State Machine Service Core

| AC ID | Criteria |
|-------|----------|
| AC4.1.1 | `transitionState()` validates all 10 transitions per architecture diagram |
| AC4.1.2 | Invalid transitions are logged and rejected with descriptive error |
| AC4.1.3 | Every successful transition creates `engagement_state_transitions` record |
| AC4.1.4 | State machine handles missing user gracefully (creates initial state) |
| AC4.1.5 | Concurrent transitions for same user handled safely (optimistic locking) |

### Story 4.2: Activity Tracking & Auto-Reactivation

| AC ID | Criteria |
|-------|----------|
| AC4.2.1 | Every incoming message updates `last_activity_at` |
| AC4.2.2 | User in `dormant` sending any message → transitions to `active` |
| AC4.2.3 | User in `goodbye_sent` sending non-response message → transitions to `active` |
| AC4.2.4 | Unprompted return (3+ days since last activity) logged in metadata |
| AC4.2.5 | Activity tracking completes in < 50ms |

### Story 4.3: Self-Select Goodbye Message

| AC ID | Criteria |
|-------|----------|
| AC4.3.1 | Transition to `goodbye_sent` queues goodbye message |
| AC4.3.2 | `goodbye_sent_at` and `goodbye_expires_at` (48h) set on transition |
| AC4.3.3 | Message routed to user's preferred destination |
| AC4.3.4 | Message includes all 3 options (1, 2, 3) in user's locale |
| AC4.3.5 | Duplicate goodbye prevented by idempotency key |

### Story 4.4: Goodbye Response Processing

| AC ID | Criteria |
|-------|----------|
| AC4.4.1 | Response "1" → `help_flow` → help message → `active` |
| AC4.4.2 | Response "2" → `remind_later` with `remind_at = now + 14 days` |
| AC4.4.3 | Response "3" → `dormant` immediately |
| AC4.4.4 | Emoji responses ("1️⃣", "2️⃣", "3️⃣") recognized |
| AC4.4.5 | Keyword responses ("confuso", "ocupado", "tudo certo") recognized |
| AC4.4.6 | Non-matching response → `active`, processed normally |

### Story 4.5: 48h Timeout to Dormant

| AC ID | Criteria |
|-------|----------|
| AC4.5.1 | `getExpiredGoodbyes()` returns users where `goodbye_expires_at < now()` |
| AC4.5.2 | Transition trigger is `goodbye_timeout` |
| AC4.5.3 | No message sent on timeout (silence is design) |
| AC4.5.4 | Metadata includes `response_type: 'timeout'` |

### Story 4.6: Message Routing Service

| AC ID | Criteria |
|-------|----------|
| AC4.6.1 | `getDestination()` returns stored preference or default 'individual' |
| AC4.6.2 | Group JIDs stored when `preferred_destination = 'group'` |
| AC4.6.3 | Command "mudar para grupo" / "switch to group" updates preference |
| AC4.6.4 | Command "mudar para individual" / "switch to individual" updates preference |
| AC4.6.5 | All queued messages include resolved destination_jid |

### Story 4.7: State Transition Logging & Analytics

| AC ID | Criteria |
|-------|----------|
| AC4.7.1 | Every transition logged to `engagement_state_transitions` |
| AC4.7.2 | PostHog event `engagement_state_changed` fired with from/to/trigger |
| AC4.7.3 | Goodbye response type tracked in metadata (FR40) |
| AC4.7.4 | Unprompted return events tracked in metadata (FR41) |
| AC4.7.5 | Days inactive included in transition metadata |

---

## Traceability Mapping

| AC | Spec Section | Component/API | Test Idea |
|----|--------------|---------------|-----------|
| AC4.1.1 | Workflows: State Transition Flow | `transitionState()` | Test all 10 valid transitions |
| AC4.1.2 | Workflows: State Transition Flow | `transitionState()` | Test invalid transition rejection |
| AC4.1.3 | Data Models: StateTransitionLog | `engagement_state_transitions` | Verify log created on transition |
| AC4.1.4 | Services: state-machine.ts | `transitionState()` | Test new user initialization |
| AC4.1.5 | Reliability/Availability | DB transaction | Concurrent transition test |
| AC4.2.1 | Workflows: Auto-Reactivation | `trackActivity()` | Verify timestamp update |
| AC4.2.2 | Workflows: Auto-Reactivation | `trackActivity()` | Dormant → active test |
| AC4.2.3 | Workflows: Auto-Reactivation | `trackActivity()` | Goodbye_sent → active test |
| AC4.2.4 | Data Models: metadata | `transitionState()` | Unprompted return detection |
| AC4.2.5 | Performance: NFR1 | `trackActivity()` | Latency benchmark |
| AC4.3.1 | Workflows: Goodbye Send Flow | `transitionState()` | Queue message on goodbye |
| AC4.3.2 | Data Models: UserEngagementState | `transitionState()` | Verify timestamps set |
| AC4.3.3 | APIs: message-router | `queueMessage()` | Destination routing test |
| AC4.3.4 | Localization | `localization/*.ts` | Message content test |
| AC4.3.5 | Reliability: NFR7 | `idempotency_key` | Duplicate prevention test |
| AC4.4.1 | Workflows: goodbye response | `handleGoodbyeResponse()` | Response "1" flow test |
| AC4.4.2 | Workflows: goodbye response | `handleGoodbyeResponse()` | Response "2" flow test |
| AC4.4.3 | Workflows: goodbye response | `handleGoodbyeResponse()` | Response "3" flow test |
| AC4.4.4 | APIs: goodbye-handler | `handleGoodbyeResponse()` | Emoji parsing test |
| AC4.4.5 | APIs: goodbye-handler | `handleGoodbyeResponse()` | Keyword parsing test |
| AC4.4.6 | APIs: goodbye-handler | `handleGoodbyeResponse()` | Non-response handling |
| AC4.5.1 | APIs: state-machine | `getExpiredGoodbyes()` | Query test |
| AC4.5.2 | Data Models: TransitionTrigger | `transitionState()` | Trigger verification |
| AC4.5.3 | Workflows: timeout | Side effects | No message queued test |
| AC4.5.4 | Data Models: metadata | `transitionState()` | Metadata content test |
| AC4.6.1 | APIs: message-router | `getDestination()` | Default destination test |
| AC4.6.2 | Data Models: user_profiles | `setDestination()` | Group JID storage test |
| AC4.6.3 | APIs: message-router | Command handler | pt-BR command test |
| AC4.6.4 | APIs: message-router | Command handler | en command test |
| AC4.6.5 | Data Models: engagement_message_queue | `queueMessage()` | JID inclusion test |
| AC4.7.1 | Observability: NFR13 | `engagement_state_transitions` | Log verification |
| AC4.7.2 | Observability: PostHog | PostHog client | Event firing test |
| AC4.7.3 | Data Models: metadata | `transitionState()` | Response type tracking |
| AC4.7.4 | Data Models: metadata | `transitionState()` | Unprompted return tracking |
| AC4.7.5 | Data Models: metadata | `transitionState()` | Days inactive tracking |

---

## Risks, Assumptions, Open Questions

### Risks

| Risk | Mitigation |
|------|------------|
| Concurrent state updates causing race conditions | Use optimistic locking with version column or Postgres advisory locks |
| Message queue growing unbounded if sends fail | Implement failed message cleanup job, alert on queue size |
| Activity tracking adding latency to message processing | Keep tracking async, non-blocking |

### Assumptions

| Assumption | Validation |
|------------|------------|
| Users understand "1", "2", "3" response format | Monitor response distribution, iterate on copy if needed |
| 48h timeout is appropriate window | Track timeout rate, adjust if too high/low |
| Group vs individual routing covers 100% of cases | Monitor for edge cases (multi-group users) |

### Open Questions

| Question | Resolution Path |
|----------|-----------------|
| Should we support "undo" for goodbye responses? | Defer to post-MVP based on user feedback |
| How to handle users in multiple groups? | Use first interaction group; explicit switch for others |

---

## Test Strategy Summary

### Test Levels

| Level | Focus | Location |
|-------|-------|----------|
| Unit | State machine transitions, response parsing | `__tests__/engagement/state-machine.test.ts` |
| Integration | Activity tracking + state transitions | `__tests__/engagement/activity-tracker.test.ts` |
| E2E (mock) | Full goodbye flow with mocked Baileys | `__tests__/engagement/goodbye-handler.test.ts` |

### Critical Test Cases

1. **Valid transitions**: All 10 transitions per architecture diagram
2. **Invalid transitions**: Rejected with appropriate error
3. **Auto-reactivation**: dormant/goodbye_sent → active on any message
4. **Response parsing**: "1", "1️⃣", "confuso" all recognized
5. **Idempotency**: Duplicate goodbye attempts don't send multiple messages
6. **Timeout logic**: 48h expiry triggers dormant transition

### Coverage Targets

- State machine: 100% transition coverage
- Response parser: 100% recognized patterns
- Activity tracker: 90%+ line coverage

---

_Generated by BMAD Epic Tech Context Workflow_
_Date: 2025-11-22_
_For: Lucas_
