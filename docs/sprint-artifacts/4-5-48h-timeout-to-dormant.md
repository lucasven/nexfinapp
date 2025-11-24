# Story 4.5: 48h Timeout to Dormant

**Status:** done

---

## Story

**As a** system,
**I want** to auto-transition users to dormant after 48 hours without a goodbye response,
**So that** we stop waiting and respect the implicit choice of non-response.

---

## Acceptance Criteria

1. **AC-4.5.1:** `getExpiredGoodbyes()` returns users where `state = 'goodbye_sent'` AND `goodbye_expires_at < now()`
2. **AC-4.5.2:** Transition trigger is `goodbye_timeout` (distinct from `goodbye_response_3`)
3. **AC-4.5.3:** No message is sent on timeout - silence is design (dignity, not guilt)
4. **AC-4.5.4:** Metadata includes `response_type: 'timeout'` for analytics (FR40)
5. **AC-4.5.5:** Multiple daily job runs don't cause duplicate transitions (idempotency)
6. **AC-4.5.6:** State transition is logged to `engagement_state_transitions` table

---

## Tasks / Subtasks

- [x] **Task 1: Implement getExpiredGoodbyes() query function** (AC: 1)
  - [x] Add function to `services/engagement/state-machine.ts`
  - [x] Query: `SELECT * FROM user_engagement_states WHERE state = 'goodbye_sent' AND goodbye_expires_at < NOW()`
  - [x] Use existing index `idx_engagement_goodbye_expires` for performance
  - [x] Return array of `UserEngagementState` objects
  - [x] Handle empty results (no expired goodbyes)

- [x] **Task 2: Add goodbye_timeout trigger to state machine** (AC: 2, 6)
  - [x] Add `goodbye_timeout` to `TransitionTrigger` type in `types.ts`
  - [x] Add transition rule to `VALID_TRANSITIONS`:
    - `goodbye_sent + goodbye_timeout → dormant`
  - [x] Ensure `transitionState()` logs to `engagement_state_transitions`
  - [x] Validate that only `goodbye_sent` state can receive this trigger

- [x] **Task 3: Implement timeout transition side effects** (AC: 3, 4)
  - [x] In state machine side effects for `goodbye_timeout`:
    - **DO NOT** queue any message (silence by design)
    - Set `metadata.response_type = 'timeout'`
    - Set `metadata.days_inactive` = days since `last_activity_at`
  - [x] Clear `goodbye_sent_at` and `goodbye_expires_at` on transition to dormant
  - [x] Update `updated_at` timestamp

- [x] **Task 4: Extend daily engagement job for timeout processing** (AC: 1, 5)
  - [x] In `services/scheduler/daily-engagement-job.ts`:
  - [x] Add timeout check step after inactivity check:
    ```typescript
    // Step 2: Process expired goodbye timeouts
    const expiredGoodbyes = await getExpiredGoodbyes()
    for (const user of expiredGoodbyes) {
      await transitionState(user.user_id, 'goodbye_timeout')
    }
    ```
  - [x] Use try/catch per user to prevent single failure from blocking batch
  - [x] Log count of processed timeouts in job summary

- [x] **Task 5: Implement idempotency for timeout transitions** (AC: 5)
  - [x] Transition is naturally idempotent:
    - User in `dormant` state won't appear in `getExpiredGoodbyes()` query
    - Second call for same user returns 0 results
  - [x] Add defensive check: skip if user not in `goodbye_sent` state
  - [x] Log warning if transition skipped (user already processed)

- [x] **Task 6: Add PostHog analytics event** (AC: 4)
  - [x] Fire `engagement_goodbye_response` event with:
    - `response_type: 'timeout'`
    - `user_id`
    - `days_since_goodbye`: calculated from `goodbye_sent_at`
    - `hours_waited`: calculated from `goodbye_sent_at` to now
  - [x] Use same event name as response processing for unified analytics

- [x] **Task 7: Write unit tests for timeout functionality** (AC: 1-6)
  - [x] Test: `getExpiredGoodbyes()` returns users with `goodbye_expires_at < now`
  - [x] Test: `getExpiredGoodbyes()` excludes users with `goodbye_expires_at > now`
  - [x] Test: `getExpiredGoodbyes()` excludes users not in `goodbye_sent` state
  - [x] Test: `transitionState(userId, 'goodbye_timeout')` transitions to `dormant`
  - [x] Test: Invalid trigger on non-goodbye_sent state is rejected
  - [x] Test: No message queued on timeout transition
  - [x] Test: Metadata includes `response_type: 'timeout'`
  - [x] Test: Daily job processes multiple expired users
  - [x] Test: Daily job re-run doesn't cause duplicate transitions
  - [x] Test: PostHog event fired with correct properties

- [x] **Task 8: Add edge case handling** (AC: 5, 6)
  - [x] Handle database connection failures gracefully
  - [x] Handle race condition: user responds during job execution
    - Query returns user → User responds → Transition already happened
    - transitionState() should handle gracefully (already in active = skip)
  - [x] Log structured error details for debugging

---

## Dev Notes

### Architecture Alignment

Implements FR17 (Response "3" or 48h timeout → DORMANT) from the PRD. This story provides the timeout logic that complements Story 4.4's response processing.

**Key Design Decision (ADR-005):** Timeout check runs in the daily job rather than precise scheduling. Precision not critical - 48h vs 49h doesn't matter for UX. This simplifies scheduler architecture.

### Integration with Daily Job

```
Daily Engagement Job (6 AM UTC)
      ↓
[Step 1: Check 14-day inactivity] → Queue goodbye for inactive users
      ↓
[Step 2: Check expired goodbyes] → Transition to dormant (this story)
      ↓
[Step 3: Check due reminders] → Transition to dormant (Epic 5)
      ↓
Report job summary
```

### Query Design

```typescript
// services/engagement/state-machine.ts

async function getExpiredGoodbyes(): Promise<UserEngagementState[]> {
  const { data, error } = await supabaseAdmin
    .from('user_engagement_states')
    .select('*')
    .eq('state', 'goodbye_sent')
    .lt('goodbye_expires_at', new Date().toISOString())

  if (error) {
    logger.error('Failed to query expired goodbyes', { error })
    throw error
  }

  return data || []
}
```

Uses partial index `idx_engagement_goodbye_expires` for efficient queries:
```sql
CREATE INDEX idx_engagement_goodbye_expires ON user_engagement_states(goodbye_expires_at)
  WHERE goodbye_expires_at IS NOT NULL;
```

### Transition Side Effects

```typescript
// In transitionState() when trigger === 'goodbye_timeout'

if (trigger === 'goodbye_timeout') {
  // Update state with cleanup
  await supabaseAdmin
    .from('user_engagement_states')
    .update({
      state: 'dormant',
      goodbye_sent_at: null,
      goodbye_expires_at: null,
      updated_at: new Date().toISOString()
    })
    .eq('user_id', userId)

  // Log transition with metadata
  await supabaseAdmin
    .from('engagement_state_transitions')
    .insert({
      user_id: userId,
      from_state: 'goodbye_sent',
      to_state: 'dormant',
      trigger: 'goodbye_timeout',
      metadata: {
        response_type: 'timeout',
        days_inactive: calculateDaysInactive(user.last_activity_at)
      }
    })

  // Fire analytics event
  posthog.capture({
    distinctId: userId,
    event: 'engagement_goodbye_response',
    properties: {
      response_type: 'timeout',
      days_since_goodbye: calculateDaysSince(user.goodbye_sent_at)
    }
  })

  // NO MESSAGE QUEUED - silence is design
}
```

### Silence by Design

Per PRD and architecture, when a user doesn't respond to the goodbye message:
- **No additional message is sent**
- The user is transitioned quietly to dormant
- This respects the implicit "I'm not interested right now" choice
- Any future message from the user will immediately reactivate them (Story 4.2)

This is intentional dignified silence, not a bug.

### Timing Precision

Per ADR-005:
- Daily job runs at 6 AM UTC
- User's goodbye expires at variable times (48h from send)
- Maximum "overshoot" is ~24h (goodbye sent just after 6 AM, processed next day)
- This is acceptable per product requirements

Example timeline:
1. Day 1, 7 AM: Goodbye sent, `goodbye_expires_at = Day 3, 7 AM`
2. Day 3, 6 AM: Daily job runs, goodbye not yet expired
3. Day 4, 6 AM: Daily job runs, goodbye expired, transitions to dormant

### Project Structure Notes

- Modify: `whatsapp-bot/src/services/engagement/state-machine.ts` (add getExpiredGoodbyes, update transitions)
- Modify: `whatsapp-bot/src/services/engagement/types.ts` (add goodbye_timeout trigger)
- Modify: `whatsapp-bot/src/services/scheduler/daily-engagement-job.ts` (add timeout step)
- Test file: `whatsapp-bot/src/__tests__/services/engagement/timeout.test.ts`

### Learnings from Previous Story

**From Story 4-4-goodbye-response-processing (Status: ready-for-dev)**

- **State Machine Pattern**: Follows same `transitionState(userId, trigger)` pattern
- **Transition Trigger Naming**: Uses underscore format (`goodbye_timeout`) consistent with `goodbye_response_1`
- **Metadata Structure**: Same structure for `response_type` field for unified analytics (FR40)
- **Analytics Event**: Uses same `engagement_goodbye_response` event with `response_type: 'timeout'`
- **No Message Queuing**: Unlike other transitions, timeout has NO side effect of queuing messages

**Coordination with Story 4.4:**
- Story 4.4 handles responses 1, 2, 3 → different states
- Story 4.5 handles no response (timeout) → dormant
- Both use the same `VALID_TRANSITIONS` map in state machine
- Both track `response_type` for analytics

[Source: docs/sprint-artifacts/4-4-goodbye-response-processing.md]

### Test Coverage Requirements

Per Epic 7 (Story 7.3: Scheduler Unit Tests):
- Timeout tests: 47h (no action), 48h+ (dormant)
- Scheduler re-run doesn't cause duplicates
- No message sent on timeout

### References

- [Source: docs/epics.md#Story-4.5-48h-Timeout-to-Dormant]
- [Source: docs/architecture.md#ADR-005-Single-Daily-Job-for-Timeouts]
- [Source: docs/sprint-artifacts/tech-spec-epic-4.md#Story-4.5-48h-Timeout-to-Dormant]
- [Source: docs/architecture.md#State-Transition-Contract]

---

## Dev Agent Record

### Context Reference

- No context file found (proceeded with story file only)

### Agent Model Used

claude-sonnet-4-5-20250929

### Debug Log References

- TypeScript compilation: PASSED (no errors)
- State machine tests: 40/40 passed
- Timeout tests: 24/24 passed
- Daily engagement job tests: 9/9 passed
- Total new tests added: 33 tests across 2 test files

### Completion Notes List

1. **Tasks 1-2 Pre-existing**: `getExpiredGoodbyes()` and `goodbye_timeout` trigger were already implemented in the codebase from prior stories.

2. **Task 3 - Side Effects**: Implemented `executeGoodbyeTimeoutSideEffects()` function in state-machine.ts that:
   - Tracks PostHog analytics with `response_type: 'timeout'`
   - Calculates and logs timing metrics (days_since_goodbye, hours_waited)
   - Explicitly does NOT queue any message (silence by design)
   - Added `no_message_sent_by_design` side effect marker

3. **Task 4 - Daily Job**: Extended `runDailyEngagementJob()` to:
   - Query expired goodbyes using `getExpiredGoodbyes()`
   - Process each user with `transitionState(userId, 'goodbye_timeout')`
   - Per-user try/catch for fault isolation
   - Track `timeoutsProcessed` count in job results

4. **Task 5 - Idempotency**: Implemented via:
   - Query design (users in dormant state filtered out)
   - Defensive skip for invalid transition errors (race condition handling)
   - Optimistic locking in transitionState()

5. **Task 6 - Analytics**: Added `ENGAGEMENT_GOODBYE_RESPONSE` event enum and firing in `executeGoodbyeTimeoutSideEffects()` with:
   - response_type: 'timeout'
   - days_since_goodbye
   - hours_waited
   - from_state/to_state

6. **Task 7-8 - Tests & Edge Cases**: Created comprehensive test suites covering all ACs and edge cases.

### File List

**Modified:**
- `whatsapp-bot/src/services/engagement/state-machine.ts` - Added timeout side effects, analytics, timestamp cleanup
- `whatsapp-bot/src/services/scheduler/daily-engagement-job.ts` - Implemented timeout processing in daily job
- `whatsapp-bot/src/analytics/events.ts` - Added ENGAGEMENT_STATE_TRANSITION and ENGAGEMENT_GOODBYE_RESPONSE events

**Created:**
- `whatsapp-bot/src/__tests__/services/engagement/timeout.test.ts` - 24 tests for timeout functionality
- `whatsapp-bot/src/__tests__/services/scheduler/daily-engagement-job.test.ts` - 9 tests for daily job

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2025-11-22 | SM Agent | Initial draft from Epic 4 requirements |
| 2025-11-24 | Dev Agent (Claude) | Implemented all tasks, added tests, marked for review |
| 2025-11-24 | Code Review (Claude) | Code review passed - all ACs met, tests passing, marked done |

---

### Completion Notes
**Completed:** 2025-11-24
**Definition of Done:** All acceptance criteria met, code reviewed, tests passing
