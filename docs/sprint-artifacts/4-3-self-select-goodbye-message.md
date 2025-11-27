# Story 4.3: Self-Select Goodbye Message

**Status:** done

---

## Story

**As a** user who has been inactive,
**I want** a respectful goodbye message with options,
**So that** I can choose how to proceed without pressure.

---

## Acceptance Criteria

1. **AC-4.3.1:** Transition to `goodbye_sent` state queues goodbye message via message queue service
2. **AC-4.3.2:** On transition, `goodbye_sent_at = now()` and `goodbye_expires_at = now() + 48h` are set in user_engagement_states
3. **AC-4.3.3:** Message is routed to user's preferred destination (individual or group)
4. **AC-4.3.4:** Message includes all 3 options (1, 2, 3) in user's locale (pt-BR or en)
5. **AC-4.3.5:** Duplicate goodbye is prevented via idempotency key pattern

---

## Tasks / Subtasks

- [x] **Task 1: Extend transitionState() for goodbye side effects** (AC: 1, 2)
  - [x] In `state-machine.ts`, detect transition to `goodbye_sent` state
  - [x] On `active → goodbye_sent` transition:
    - Set `goodbye_sent_at = now()`
    - Set `goodbye_expires_at = now() + 48 hours`
    - Update `user_engagement_states` with both timestamps
  - [x] Add side effect: `queued_goodbye_message` to TransitionResult

- [x] **Task 2: Implement goodbye message queuing** (AC: 1, 5)
  - [x] After setting timestamps, call `queueGoodbyeMessage(userId)`
  - [x] Import `queueMessage` from message queue service (Story 1.6)
  - [x] Generate idempotency key: `{userId}:goodbye_sent:{YYYY-MM-DD}`
  - [x] Queue message with:
    - `message_type: 'goodbye'`
    - `message_key: 'engagement.goodbye_self_select'`
    - `status: 'pending'`
    - `scheduled_for: now()`

- [x] **Task 3: Resolve user destination for queuing** (AC: 3)
  - [x] Import `getDestination()` from message-router service
  - [x] Call `getDestination(userId)` to get `{ type, jid }`
  - [x] Pass resolved `destination` and `destination_jid` to queue entry
  - [x] Handle default case (individual) if no preference stored

- [x] **Task 4: Add goodbye message localization keys** (AC: 4)
  - [x] In `localization/pt-br.ts`, add key `engagement.goodbye_self_select`:
    ```
    "Oi! Percebi que faz um tempinho que você não aparece por aqui 🤔

    Tudo bem por aí? Me conta:
    1️⃣ Confuso com o app
    2️⃣ Ocupado agora
    3️⃣ Tudo certo, só não preciso mais

    Responde com o número que combina mais com você!"
    ```
  - [x] In `localization/en.ts`, add equivalent:
    ```
    "Hey! I noticed it's been a while since you dropped by 🤔

    Everything okay? Let me know:
    1️⃣ Confused about the app
    2️⃣ Just busy right now
    3️⃣ All good, just don't need it anymore

    Just reply with the number that fits!"
    ```
  - [x] Ensure tone follows guidelines: curiosity, dignity, no guilt/pressure

- [x] **Task 5: Fetch user locale for message params** (AC: 4)
  - [x] When queuing message, fetch user's locale from `user_profiles.preferred_language`
  - [x] Pass locale as `message_params: { locale }`
  - [x] Message sender will use locale when rendering from localization

- [x] **Task 6: Prevent duplicate goodbye sending** (AC: 5)
  - [x] Idempotency key format: `{userId}:goodbye_sent:{date.toISOString().split('T')[0]}`
  - [x] Message queue upsert with `onConflict: 'idempotency_key', ignoreDuplicates: true`
  - [x] If duplicate detected, log but don't error
  - [x] Add check: if user already in `goodbye_sent` state, skip queuing

- [x] **Task 7: Write unit tests** (AC: 1-5)
  - [x] Test: Transition to goodbye_sent queues message
  - [x] Test: goodbye_sent_at and goodbye_expires_at timestamps set correctly
  - [x] Test: 48h expiry calculation is accurate
  - [x] Test: Message routed to preferred destination (individual)
  - [x] Test: Message routed to preferred destination (group)
  - [x] Test: Message includes correct localization key
  - [x] Test: Duplicate goodbye same day is prevented
  - [x] Test: Goodbye on different day creates new queue entry
  - [x] Test: pt-BR user gets Portuguese message
  - [x] Test: en user gets English message

- [x] **Task 8: Update services/engagement/index.ts** (AC: 1)
  - [x] Ensure `transitionState` export includes goodbye side effects
  - [x] No new exports needed - logic is internal to state machine

---

## Dev Notes

### Architecture Alignment

Implements FR13 (send self-select goodbye message on state transition) and supports FR17 (48h timeout mechanism). This story adds the "goodbye send" side effect to the state machine and integrates with the message queue.

**Critical Pattern:** State machine handles ALL goodbye queuing logic - external callers just invoke `transitionState(userId, 'inactivity_14d')` and the message is automatically queued.

### Integration Flow

```
Daily Scheduler (Epic 5)
      ↓
transitionState(userId, 'inactivity_14d')
      ↓
State Machine detects: active → goodbye_sent
      ↓
[Side Effect 1] Set goodbye_sent_at, goodbye_expires_at
      ↓
[Side Effect 2] Get user destination preference
      ↓
[Side Effect 3] Queue goodbye message with idempotency key
      ↓
Message Queue (Epic 5) processes and sends
```

### Service Dependencies

- **Uses:** Message Queue Service from `services/scheduler/message-sender.ts` (Story 1.6)
- **Uses:** Message Router `getDestination()` from `services/engagement/message-router.ts` (Story 4.6)
- **Uses:** Localization from `localization/*.ts` (Stories 1.4, 1.5)
- **Extends:** State Machine from `services/engagement/state-machine.ts` (Story 4.1)

### Implementation Pattern

```typescript
// services/engagement/state-machine.ts - extend transitionState

async function executeGoodbyeSideEffects(userId: string): Promise<string[]> {
  const sideEffects: string[] = []
  const now = new Date()
  const expiresAt = new Date(now.getTime() + (48 * 60 * 60 * 1000)) // 48 hours

  // 1. Set timestamps
  await supabaseAdmin
    .from('user_engagement_states')
    .update({
      goodbye_sent_at: now.toISOString(),
      goodbye_expires_at: expiresAt.toISOString(),
      updated_at: now.toISOString()
    })
    .eq('user_id', userId)

  sideEffects.push('set_goodbye_timestamps')

  // 2. Get destination
  const { type: destination, jid: destinationJid } = await getDestination(userId)

  // 3. Get user locale
  const { data: profile } = await supabaseAdmin
    .from('user_profiles')
    .select('preferred_language')
    .eq('user_id', userId)
    .single()

  const locale = profile?.preferred_language || 'pt-br'

  // 4. Queue message with idempotency
  const idempotencyKey = `${userId}:goodbye_sent:${now.toISOString().split('T')[0]}`

  await queueMessage({
    userId,
    messageType: 'goodbye',
    messageKey: 'engagement.goodbye_self_select',
    messageParams: { locale },
    destination,
    destinationJid,
    idempotencyKey
  })

  sideEffects.push('queued_goodbye_message')

  return sideEffects
}

// In transitionState, after state update:
if (newState === 'goodbye_sent' && previousState === 'active') {
  const goodbyeEffects = await executeGoodbyeSideEffects(userId)
  result.sideEffects.push(...goodbyeEffects)
}
```

### Idempotency Key Design

```typescript
// Pattern: {userId}:{eventType}:{date}
// Example: "abc123:goodbye_sent:2025-11-22"

function getGoodbyeIdempotencyKey(userId: string, date: Date): string {
  return `${userId}:goodbye_sent:${date.toISOString().split('T')[0]}`
}
```

This ensures:
- Only one goodbye per user per day
- Re-running scheduler on same day doesn't send duplicates
- Next day can send new goodbye if user goes inactive again

### Message Tone Guidelines

Per PRD and architecture:
- Use curiosity ("Percebi que...", "I noticed...")
- Offer dignity and choice ("Me conta", "Let me know")
- NO guilt ("We miss you!")
- NO pressure ("Don't miss out!")
- Single emoji maximum (🤔 used)
- Casual register ("você" not "o senhor")

### Project Structure Notes

- File modifications: `whatsapp-bot/src/services/engagement/state-machine.ts`
- Localization additions: `whatsapp-bot/src/localization/pt-br.ts`, `en.ts`
- Test location: `whatsapp-bot/src/__tests__/engagement/goodbye-message.test.ts`
- No new files needed - extends existing state machine

### Learnings from Previous Story

**From Story 4-2-activity-tracking-auto-reactivation (Status: drafted)**

- **Activity Tracker Contract**: `trackActivity()` handles auto-reactivation, separate from goodbye flow
- **State Machine Dependency**: All state changes go through `transitionState()` - this story extends it
- **Non-blocking Pattern**: Activity tracking is non-blocking; goodbye queuing can be async too
- **Goodbye Response Detection**: Story 4.2 passes `isGoodbyeResponse` flag to prevent auto-reactivation during response processing

**Coordination with Story 4.4 (Goodbye Response Processing):**
- This story queues the message; Story 4.4 processes the response
- Response options (1, 2, 3) match what we queue here
- Localization keys must be consistent

[Source: docs/stories/4-2-activity-tracking-auto-reactivation.md]

### 48-Hour Timeout Handling

- `goodbye_expires_at` is set when entering `goodbye_sent`
- Story 4.5 handles the timeout logic (daily scheduler checks expiry)
- This story only sets the timestamp; doesn't check it

### References

- [Source: docs/sprint-artifacts/tech-spec-epic-4.md#Story-4.3-Self-Select-Goodbye-Message]
- [Source: docs/architecture.md#Novel-Pattern-Design-Engagement-State-Machine]
- [Source: docs/architecture.md#ADR-003-Message-Queue-Table]
- [Source: docs/epics.md#Story-4.3-Self-Select-Goodbye-Message]

---

## Dev Agent Record

### Context Reference

- [docs/sprint-artifacts/4-3-self-select-goodbye-message.context.xml](4-3-self-select-goodbye-message.context.xml)

### Agent Model Used

Claude Sonnet 4.5 (claude-sonnet-4-5-20250929)

### Debug Log References

- All tests passing: 15 goodbye-message tests + 40 state-machine tests

### Completion Notes List

- **Implementation Complete**: All 8 tasks verified complete as part of earlier implementation work
- **State Machine**: `executeGoodbyeSideEffects()` function already implemented in `state-machine.ts:311-366`
- **Localization**: `engagementGoodbyeSelfSelect` key already exists in both `pt-br.ts:351-359` and `en.ts:348-356`
- **Types**: `engagementGoodbyeSelfSelect` already defined in `types.ts:175`
- **Tests**: Comprehensive test suite in `goodbye-message.test.ts` covering all 5 acceptance criteria
- **Message Routing**: Integration with `getMessageDestination()` for individual/group routing
- **Idempotency**: Uses `getIdempotencyKey()` to prevent duplicate goodbye messages same day

### File List

**Previously Modified Files (verified complete):**
- `whatsapp-bot/src/services/engagement/state-machine.ts` - executeGoodbyeSideEffects() function
- `whatsapp-bot/src/localization/pt-br.ts` - engagementGoodbyeSelfSelect key
- `whatsapp-bot/src/localization/en.ts` - engagementGoodbyeSelfSelect key
- `whatsapp-bot/src/localization/types.ts` - engagementGoodbyeSelfSelect type definition
- `whatsapp-bot/src/__tests__/engagement/goodbye-message.test.ts` - Unit tests for Story 4.3

**Status Files Updated:**
- `docs/sprint-artifacts/sprint-status.yaml` - Changed status to review
- `docs/sprint-artifacts/4-3-self-select-goodbye-message.md` - Marked all tasks complete

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2025-11-22 | SM Agent (Bob) | Initial draft from Epic 4 tech spec |
| 2025-11-22 | SM Agent (Bob) | Story context generated, marked ready-for-dev |
| 2025-11-24 | Lucas (AI Review) | Senior Developer Review - APPROVED |

---

## Senior Developer Review (AI)

### Reviewer
Lucas (AI-Assisted)

### Date
2025-11-24

### Outcome
**APPROVE** ✅

All acceptance criteria are fully implemented with comprehensive test coverage. Code quality is excellent with proper error handling, logging, and architectural alignment.

### Summary
Story 4.3 implements the self-select goodbye message functionality that queues a respectful 3-option goodbye message when a user transitions to the `goodbye_sent` state after 14 days of inactivity. The implementation correctly integrates with the state machine, message queue service, and message router to deliver localized messages to users' preferred destinations with idempotency protection.

### Acceptance Criteria Coverage

| AC# | Description | Status | Evidence |
|-----|-------------|--------|----------|
| AC-4.3.1 | Transition to `goodbye_sent` queues goodbye message | ✅ IMPLEMENTED | `state-machine.ts:259-264` calls `executeGoodbyeSideEffects()`, `state-machine.ts:340-347` calls `queueMessage()` |
| AC-4.3.2 | `goodbye_sent_at` and `goodbye_expires_at` (48h) set | ✅ IMPLEMENTED | `state-machine.ts:382-388` in `buildStateUpdateData()` |
| AC-4.3.3 | Message routed to preferred destination | ✅ IMPLEMENTED | `state-machine.ts:317` calls `getMessageDestination()`, passes to queue at lines 345-346 |
| AC-4.3.4 | Message includes 3 options in user's locale | ✅ IMPLEMENTED | `pt-br.ts:351-359`, `en.ts:348-356`, locale fetched at `state-machine.ts:324-334` |
| AC-4.3.5 | Duplicate prevention via idempotency key | ✅ IMPLEMENTED | `message-sender.ts:45-52` generates `{userId}:{eventType}:{YYYY-MM-DD}` format |

**Summary: 5 of 5 acceptance criteria fully implemented**

### Task Completion Validation

| Task | Marked | Verified | Evidence |
|------|--------|----------|----------|
| Task 1: Extend transitionState() for goodbye side effects | [x] | ✅ VERIFIED | `state-machine.ts:259-264` |
| Task 2: Implement goodbye message queuing | [x] | ✅ VERIFIED | `state-machine.ts:311-366` |
| Task 3: Resolve user destination for queuing | [x] | ✅ VERIFIED | `state-machine.ts:317, 345-346` |
| Task 4: Add goodbye message localization keys | [x] | ✅ VERIFIED | `pt-br.ts:351-359`, `en.ts:348-356` |
| Task 5: Fetch user locale for message params | [x] | ✅ VERIFIED | `state-machine.ts:324-334` |
| Task 6: Prevent duplicate goodbye sending | [x] | ✅ VERIFIED | `message-sender.ts:45-52, 100-102` |
| Task 7: Write unit tests | [x] | ✅ VERIFIED | `goodbye-message.test.ts` - 15 tests passing |
| Task 8: Update services/engagement/index.ts | [x] | ✅ VERIFIED | No export needed - internal logic |

**Summary: 8 of 8 completed tasks verified, 0 questionable, 0 false completions**

### Test Coverage and Gaps

- ✅ **15 tests** in `goodbye-message.test.ts` covering all 5 ACs
- ✅ **40 tests** in `state-machine.test.ts` for core state machine
- ✅ All tests passing (verified via `npm test`)
- ✅ Edge cases covered: no destination, router error, duplicate detection
- No test gaps identified

### Architectural Alignment

- ✅ Follows state machine pattern from architecture docs
- ✅ Uses message queue service (Story 1.6 dependency)
- ✅ Uses message router (Story 4.6 / 2.4 dependency)
- ✅ Implements FR13 (goodbye message) and FR17 (48h timeout setup)
- ✅ Side effects separated from state transition logic

### Security Notes

- ✅ No SQL injection risks (Supabase parameterized queries)
- ✅ No hardcoded credentials
- ✅ User IDs validated through database lookup
- ✅ Safe default locale ('pt-br')

### Best-Practices and References

- TypeScript with proper type safety
- Comprehensive error handling with try-catch
- Graceful degradation (state transition succeeds even if message queuing fails)
- Proper logging at appropriate levels (info, debug, warn, error)
- [Jest Testing Best Practices](https://jestjs.io/docs/getting-started)
- [Supabase TypeScript Client](https://supabase.com/docs/reference/javascript/introduction)

### Action Items

**Code Changes Required:**
- None

**Advisory Notes:**
- Note: The idempotency key is generated both in `executeGoodbyeSideEffects()` (unused) and inside `queueMessage()` (used). This is correct behavior but could be slightly cleaner by removing the unused call in the state machine - however, this is a minor style preference and not a blocking issue.
