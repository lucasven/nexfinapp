# Story 4.7: State Transition Logging & Analytics

**Status:** done

---

## Story

**As a** product team,
**I want** all engagement state transitions logged with full context and analytics events fired,
**So that** we can analyze engagement patterns, measure re-engagement effectiveness, and debug user journeys.

---

## Acceptance Criteria

1. **AC-4.7.1:** Every successful state transition creates a record in `engagement_state_transitions` with from_state, to_state, trigger, metadata, and created_at
2. **AC-4.7.2:** PostHog event `engagement_state_changed` is fired on every transition with properties: from_state, to_state, trigger, days_inactive
3. **AC-4.7.3:** Goodbye response type is tracked in transition metadata when applicable (`response_type: 'confused' | 'busy' | 'all_good' | 'timeout'`) - FR40
4. **AC-4.7.4:** Unprompted return events are tracked in metadata (`unprompted_return: true` when user returns after 3+ days without re-engagement prompt) - FR41
5. **AC-4.7.5:** Days since last activity is included in all transition metadata (`days_inactive` field) - FR42
6. **AC-4.7.6:** All transition logs can be queried by user_id for debugging user journey reconstruction
7. **AC-4.7.7:** PostHog events include user's preferred destination for segmentation analytics

---

## Tasks / Subtasks

- [x] **Task 1: Enhance transitionState() to capture full metadata** (AC: 1, 3, 4, 5)
  - [x] Calculate `days_inactive` from `last_activity_at` to now for all transitions
  - [x] Add `response_type` mapping for goodbye triggers:
    - `goodbye_response_1` → `response_type: 'confused'`
    - `goodbye_response_2` → `response_type: 'busy'`
    - `goodbye_response_3` → `response_type: 'all_good'`
    - `goodbye_timeout` → `response_type: 'timeout'`
  - [x] Calculate `unprompted_return` for `user_message` triggers:
    - Check if coming from `dormant` state
    - Check if `days_inactive >= 3`
    - No goodbye message was pending (distinguishes from responding to goodbye)
  - [x] Ensure metadata object is properly typed with all optional fields

- [x] **Task 2: Create logTransition() helper function** (AC: 1, 6)
  - [x] Add function to `services/engagement/state-machine.ts`:
    ```typescript
    async function logTransition(
      userId: string,
      fromState: EngagementState,
      toState: EngagementState,
      trigger: TransitionTrigger,
      metadata: TransitionMetadata
    ): Promise<void>
    ```
  - [x] Insert into `engagement_state_transitions` table
  - [x] Handle database errors gracefully (log error but don't fail transition)
  - [x] Use indexed user_id column for efficient queries

- [x] **Task 3: Add PostHog event firing** (AC: 2, 7)
  - [x] Import PostHog client from existing `services/analytics/` or create new
  - [x] Fire `engagement_state_changed` event on every successful transition:
    ```typescript
    posthog.capture({
      distinctId: userId,
      event: 'engagement_state_changed',
      properties: {
        from_state: previousState,
        to_state: newState,
        trigger: trigger,
        days_inactive: metadata.days_inactive,
        response_type: metadata.response_type,
        unprompted_return: metadata.unprompted_return,
        preferred_destination: user.preferred_destination
      }
    })
    ```
  - [x] Ensure event is non-blocking (fire and forget pattern)
  - [x] Handle PostHog client errors gracefully

- [x] **Task 4: Create specialized analytics events for key transitions** (AC: 3, 4)
  - [x] Fire `engagement_goodbye_response` event for goodbye-related transitions:
    - Properties: `response_type`, `days_since_goodbye`, `hours_waited`
    - Triggers: `goodbye_response_1`, `goodbye_response_2`, `goodbye_response_3`, `goodbye_timeout`
  - [x] Fire `engagement_unprompted_return` event when user returns unprompted:
    - Properties: `days_inactive`, `previous_state`, `user_tier`
  - [x] These are in addition to the generic `engagement_state_changed` event

- [x] **Task 5: Add metadata type definitions** (AC: 1, 3, 4, 5)
  - [x] Update `services/engagement/types.ts`:
    ```typescript
    interface TransitionMetadata {
      days_inactive: number
      response_type?: 'confused' | 'busy' | 'all_good' | 'timeout'
      unprompted_return?: boolean
      days_since_goodbye?: number
      hours_waited?: number
      trigger_source?: 'user_message' | 'scheduler'
    }
    ```
  - [x] Ensure backward compatibility with existing code

- [x] **Task 6: Implement unprompted return detection logic** (AC: 4)
  - [x] In `trackActivity()` or at transition time:
    - Check if user was in `dormant` state
    - Check if `now - last_activity_at >= 3 days`
    - Check if no goodbye message was sent (not coming from `goodbye_sent`)
  - [x] Set `unprompted_return: true` only when all conditions met
  - [x] This tracks users who came back organically (FR41)

- [x] **Task 7: Create helper to calculate days inactive** (AC: 5)
  - [x] Add utility function:
    ```typescript
    function calculateDaysInactive(lastActivityAt: Date): number {
      const now = new Date()
      const diffMs = now.getTime() - lastActivityAt.getTime()
      return Math.floor(diffMs / (1000 * 60 * 60 * 24))
    }
    ```
  - [x] Use in all transition metadata calculations
  - [x] Handle edge cases (null last_activity_at, future dates)

- [x] **Task 8: Write unit tests for analytics logging** (AC: 1-7)
  - [x] Test: Transition creates log entry in `engagement_state_transitions`
  - [x] Test: Log entry contains correct from_state, to_state, trigger
  - [x] Test: PostHog event fired with correct properties
  - [x] Test: `days_inactive` calculated correctly
  - [x] Test: `response_type` mapped correctly for each goodbye trigger
  - [x] Test: `unprompted_return` set correctly for qualifying transitions
  - [x] Test: Logs queryable by user_id (index verification)
  - [x] Test: Database error doesn't fail the transition
  - [x] Test: PostHog error doesn't fail the transition

- [x] **Task 9: Add query helpers for analytics** (AC: 6)
  - [x] Add function to retrieve user's transition history:
    ```typescript
    async function getUserTransitionHistory(
      userId: string,
      limit?: number
    ): Promise<StateTransitionLog[]>
    ```
  - [x] Add function to get aggregate stats (for future dashboard):
    ```typescript
    async function getTransitionStats(
      startDate: Date,
      endDate: Date
    ): Promise<TransitionStats>
    ```
  - [x] These support FR43 (analytics accessible via queries)

---

## Dev Notes

### Architecture Alignment

This story implements FR40, FR41, FR42, and FR43 from the PRD:
- **FR40:** Track goodbye response distribution (confused/busy/all_good/timeout)
- **FR41:** Track unprompted return events (user message after 3+ days without prompt)
- **FR42:** Track engagement state transitions with timestamps
- **FR43:** Analytics data accessible via database queries

### Analytics Event Strategy

Per architecture document, we use a dual-track approach:
- **Database:** Full audit trail in `engagement_state_transitions` for historical queries
- **PostHog:** Real-time events for dashboards and funnels

This provides both long-term queryability and real-time visibility.

### PostHog Event Naming Convention

Following existing patterns:
- `engagement_state_changed` - Generic state transition
- `engagement_goodbye_response` - Specific goodbye outcomes
- `engagement_unprompted_return` - Organic returns (valuable signal)

### Metadata Structure

```typescript
// Example transition metadata for goodbye timeout
{
  days_inactive: 14,
  response_type: 'timeout',
  days_since_goodbye: 2,
  hours_waited: 48,
  trigger_source: 'scheduler'
}

// Example transition metadata for unprompted return
{
  days_inactive: 7,
  unprompted_return: true,
  trigger_source: 'user_message'
}
```

### Integration Points

This story enhances the existing `transitionState()` function from Story 4.1. All logging and analytics are side effects that happen AFTER the core state transition succeeds:

```
transitionState(userId, trigger)
    ↓
[1. Validate transition]
    ↓
[2. Update state in DB]
    ↓
[3. Calculate metadata] ← This story
    ↓
[4. Log to engagement_state_transitions] ← This story
    ↓
[5. Fire PostHog events] ← This story
    ↓
[6. Execute other side effects (queue messages, etc.)]
```

### Error Handling Strategy

Analytics logging should NEVER cause a state transition to fail:
- Wrap database log insert in try/catch
- Wrap PostHog calls in try/catch
- Log errors but continue execution
- State integrity is more important than analytics

### Project Structure Notes

- Modify: `whatsapp-bot/src/services/engagement/state-machine.ts` (add logging to transitionState)
- Modify: `whatsapp-bot/src/services/engagement/types.ts` (add TransitionMetadata interface)
- Modify: `whatsapp-bot/src/services/engagement/index.ts` (export new helpers)
- Create: `whatsapp-bot/src/services/engagement/analytics.ts` (PostHog event helpers)
- Test file: `whatsapp-bot/src/__tests__/services/engagement/analytics.test.ts`

### Learnings from Previous Story

**From Story 4-5-48h-timeout-to-dormant (Status: drafted)**

- **Response Type Pattern**: Use same `response_type` field for all goodbye outcomes (confused, busy, all_good, timeout)
- **Analytics Event**: Use `engagement_goodbye_response` event name for all goodbye-related analytics
- **Metadata Structure**: Include `days_since_goodbye` and `hours_waited` for timeout cases
- **Database + PostHog**: Dual-track approach established - DB for queries, PostHog for real-time

**Coordination with Story 4.5:**
- Story 4.5 handles the timeout TRANSITION (state change)
- Story 4.7 handles the LOGGING of all transitions including timeout
- The `response_type: 'timeout'` metadata is set in 4.5, logged to DB/PostHog in 4.7

[Source: docs/sprint-artifacts/4-5-48h-timeout-to-dormant.md#Dev-Notes]

### Test Coverage Requirements

Per Epic 7 (Story 7.2: State Machine Unit Tests):
- All transitions must be logged correctly
- Metadata must be accurate for each transition type
- Query helpers must return correct data

### Database Schema Reference

```sql
-- engagement_state_transitions (created in Epic 1, Story 1.1)
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

### References

- [Source: docs/epics.md#Story-4.7-State-Transition-Logging-Analytics]
- [Source: docs/architecture.md#Analytics-Events]
- [Source: docs/sprint-artifacts/tech-spec-epic-4.md#Story-4.7-State-Transition-Logging-Analytics]
- [Source: docs/prd.md#Analytics-Learning]

---

## Dev Agent Record

### Context Reference

- [4-7-state-transition-logging-analytics.context.xml](docs/sprint-artifacts/4-7-state-transition-logging-analytics.context.xml)

### Agent Model Used

Claude Sonnet 4.5 (claude-sonnet-4-5-20250929)

### Debug Log References

N/A

### Completion Notes List

- All 9 tasks completed successfully
- Created new `analytics.ts` service with PostHog event firing helpers
- Enhanced `transitionState()` with full metadata calculation including:
  - `days_inactive` for all transitions (FR42)
  - `response_type` mapping for goodbye triggers (FR40)
  - `unprompted_return` detection for organic returns (FR41)
- Added specialized analytics events:
  - `engagement_state_changed` (fired on every transition)
  - `engagement_goodbye_response` (fired for goodbye-related transitions)
  - `engagement_unprompted_return` (fired for organic returns)
- Implemented query helpers for analytics:
  - `getUserTransitionHistory()` for debugging user journeys
  - `getTransitionStats()` for aggregate analytics
- All analytics operations are non-blocking (fire-and-forget pattern)
- TypeScript compiles without errors
- 33 new tests added, all passing
- 40 existing state-machine tests continue to pass

### File List

**Modified:**
- `whatsapp-bot/src/services/engagement/types.ts` - Added `TransitionMetadata` and `GoodbyeResponseType` types
- `whatsapp-bot/src/services/engagement/state-machine.ts` - Enhanced with analytics integration, metadata building, and query helpers
- `whatsapp-bot/src/services/engagement/index.ts` - Added exports for new functions
- `whatsapp-bot/src/analytics/events.ts` - Added new analytics event types
- `docs/stories/sprint-status.yaml` - Updated story status

**Created:**
- `whatsapp-bot/src/services/engagement/analytics.ts` - New analytics service with PostHog event firing
- `whatsapp-bot/src/__tests__/services/engagement/analytics.test.ts` - Unit tests for analytics logging

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2025-11-22 | SM Agent | Initial draft from Epic 4 requirements |
| 2025-11-24 | Dev Agent (Claude Sonnet 4.5) | Implemented all tasks, ready for review |
| 2025-11-24 | Senior Developer Review (AI) | Review passed - all AC implemented, all tests pass |

---

## Senior Developer Review (AI)

### Reviewer
Lucas (AI-assisted)

### Date
2025-11-24

### Outcome
**Approve** - All acceptance criteria fully implemented with evidence. All completed tasks verified. No issues found.

### Summary
Story 4.7 implements comprehensive analytics logging for the engagement state machine. The implementation adds full metadata tracking to all state transitions, fires PostHog events for real-time analytics, and provides query helpers for historical analysis. Code follows established patterns and all tests pass.

### Key Findings

**HIGH Severity:** None

**MEDIUM Severity:** None

**LOW Severity:** None

### Acceptance Criteria Coverage

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC-4.7.1 | Every transition creates `engagement_state_transitions` record | ✅ IMPLEMENTED | `state-machine.ts:249-264` - inserts to `engagement_state_transitions` with from_state, to_state, trigger, metadata |
| AC-4.7.2 | PostHog `engagement_state_changed` fired on every transition | ✅ IMPLEMENTED | `state-machine.ts:266-283` calls `fireTransitionAnalytics()`, `analytics.ts:154-187` fires event with all properties |
| AC-4.7.3 | `response_type` tracked for goodbye triggers (FR40) | ✅ IMPLEMENTED | `analytics.ts:32-37` GOODBYE_TRIGGER_TO_RESPONSE_TYPE mapping, `state-machine.ts:549-560` includes in metadata |
| AC-4.7.4 | `unprompted_return` tracked for organic returns (FR41) | ✅ IMPLEMENTED | `analytics.ts:118-135` isUnpromptedReturn() with 3-day threshold, `state-machine.ts:563-567` sets metadata flag |
| AC-4.7.5 | `days_inactive` in all transition metadata (FR42) | ✅ IMPLEMENTED | `analytics.ts:56-70` calculateDaysInactive(), `state-machine.ts:185,544-546` includes in all metadata |
| AC-4.7.6 | Logs queryable by user_id | ✅ IMPLEMENTED | `state-machine.ts:874-905` getUserTransitionHistory() uses user_id index |
| AC-4.7.7 | PostHog events include preferred destination | ✅ IMPLEMENTED | `state-machine.ts:270-277` fetches destination, `analytics.ts:160-174` includes in event properties |

**Summary:** 7 of 7 acceptance criteria fully implemented

### Task Completion Validation

| Task | Marked As | Verified As | Evidence |
|------|-----------|-------------|----------|
| Task 1: Enhance transitionState() with metadata | ✅ Complete | ✅ VERIFIED | `state-machine.ts:184-192` buildTransitionMetadata(), `types.ts:82-106` TransitionMetadata interface |
| Task 2: Create logTransition() helper | ✅ Complete | ✅ VERIFIED | `state-machine.ts:249-264` insert to engagement_state_transitions with error handling |
| Task 3: Add PostHog event firing | ✅ Complete | ✅ VERIFIED | `analytics.ts:154-187` fireStateChangedEvent(), `state-machine.ts:266-283` calls from transitionState |
| Task 4: Specialized analytics events | ✅ Complete | ✅ VERIFIED | `analytics.ts:198-225` fireGoodbyeResponseEvent(), `analytics.ts:237-263` fireUnpromptedReturnEvent() |
| Task 5: Add metadata type definitions | ✅ Complete | ✅ VERIFIED | `types.ts:71-106` TransitionMetadata interface with all required fields |
| Task 6: Unprompted return detection | ✅ Complete | ✅ VERIFIED | `analytics.ts:118-135` isUnpromptedReturn() checks dormant state, 3+ days, user_message trigger |
| Task 7: Days inactive helper | ✅ Complete | ✅ VERIFIED | `analytics.ts:56-70` calculateDaysInactive() with null/future date handling |
| Task 8: Unit tests | ✅ Complete | ✅ VERIFIED | `analytics.test.ts` - 33 tests covering all ACs, all passing |
| Task 9: Query helpers | ✅ Complete | ✅ VERIFIED | `state-machine.ts:874-905` getUserTransitionHistory(), `state-machine.ts:928-1005` getTransitionStats() |

**Summary:** 9 of 9 completed tasks verified, 0 questionable, 0 falsely marked complete

### Test Coverage and Gaps

- **analytics.test.ts**: 33 tests covering utility functions, transition logging, PostHog events, and query helpers
- **state-machine.test.ts**: 40 tests continue to pass with analytics integration
- All tests pass: `npm test -- --testPathPattern="engagement"` ✅
- TypeScript compiles without errors: `npx tsc --noEmit` ✅

### Architectural Alignment

Implementation follows architecture document patterns:
- **Dual-track analytics**: DB for audit trail + PostHog for real-time ✓
- **Fire-and-forget**: Analytics never block transitions (`state-machine.ts:268,280-282`) ✓
- **Event naming**: Uses `engagement_state_changed`, `engagement_goodbye_response`, `engagement_unprompted_return` per architecture ✓
- **Error handling**: Try/catch around all analytics calls with logging ✓

### Security Notes

No security issues identified:
- No PII in analytics events (only user_id)
- Graceful error handling prevents information leakage
- Service role access for DB operations

### Best-Practices and References

- PostHog event taxonomy follows [PostHog best practices](https://posthog.com/docs/product-analytics/events)
- Non-blocking analytics pattern prevents degraded user experience
- TypeScript strict mode compliance

### Action Items

**Code Changes Required:** None

**Advisory Notes:**
- Note: Consider adding PostHog dashboard templates in future to visualize these events
- Note: The UNPROMPTED_RETURN_DAYS_THRESHOLD (3 days) could be made configurable in constants.ts if needed
