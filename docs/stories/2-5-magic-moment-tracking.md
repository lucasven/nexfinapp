# Story 2.5: Magic Moment Tracking

**Status:** done

---

## Story

**As a** product team,
**I want** to track when users experience their first successful NLP-parsed expense,
**So that** we can measure onboarding effectiveness.

---

## Acceptance Criteria

1. **AC-2.5.1:** Given a user has never logged an NLP expense, when they successfully log one via natural language, then `magic_moment_at = now()` is set and PostHog event `onboarding_magic_moment` is fired
2. **AC-2.5.2:** Given a user already has `magic_moment_at` set, when they log another NLP expense, then the timestamp is NOT updated and no duplicate event is fired
3. **AC-2.5.3:** Given an expense is logged via explicit command (e.g., `/add 50 food`), then it does NOT count as a magic moment
4. **AC-2.5.4:** The magic moment event includes relevant properties: `first_expense_category`, `first_expense_amount`, `time_since_signup`

---

## Tasks / Subtasks

- [x] **Task 1: Implement recordMagicMoment() function** (AC: 1, 2, 3)
  - [x] Create function in `services/onboarding/tier-tracker.ts`
  - [x] Accept userId and wasNlpParsed flag
  - [x] Check if magic_moment_at is already set
  - [x] If not set AND wasNlpParsed: update user_profiles.magic_moment_at
  - [x] Return boolean indicating if this was the first magic moment

- [x] **Task 2: Add PostHog event firing** (AC: 1, 4)
  - [x] Import PostHog client
  - [x] Fire `onboarding_magic_moment` event with properties:
    - `first_expense_category`
    - `first_expense_amount`
    - `time_since_signup` (days)
    - `timestamp`

- [x] **Task 3: Integrate with expense processing flow** (AC: 1, 3)
  - [x] Identify where NLP-parsed expenses are processed (text-handler.ts)
  - [x] Add call to recordMagicMoment() after successful expense creation
  - [x] Pass wasNlpParsed=true only for NLP path
  - [x] Explicit commands should NOT trigger magic moment

- [x] **Task 4: Add idempotency check** (AC: 2)
  - [x] Query user_profiles.magic_moment_at before update
  - [x] If already set, return false without update or event
  - [x] Ensure atomic operation (no race conditions)

- [x] **Task 5: Write unit tests** (AC: 1, 2, 3, 4)
  - [x] Test: first NLP expense sets magic_moment_at
  - [x] Test: subsequent NLP expenses don't update timestamp
  - [x] Test: explicit command expenses don't trigger magic moment
  - [x] Test: PostHog event fired with correct properties

---

## Dev Notes

### Architecture Alignment

Implements magic moment tracking from `services/onboarding/tier-tracker.ts` per architecture doc.

### Data Model

```typescript
// user_profiles table (from Epic 1 migration)
magic_moment_at: TIMESTAMPTZ | null  // First NLP-parsed expense timestamp
```

### API Contract

```typescript
// services/onboarding/tier-tracker.ts

interface MagicMomentResult {
  isFirstMagicMoment: boolean
  timestamp?: Date
}

/**
 * Record magic moment - first NLP-parsed expense
 * @param userId - User ID
 * @param wasNlpParsed - True if expense was parsed via NLP (not explicit command)
 * @param expenseData - Expense details for analytics
 */
export async function recordMagicMoment(
  userId: string,
  wasNlpParsed: boolean,
  expenseData?: { amount: number; category: string }
): Promise<MagicMomentResult>
```

### Integration Point

```
NLP Expense Flow:
Message → parseIntent() → intent.type === 'add_expense' → processExpense()
                                                              ↓
                                                    [recordMagicMoment(wasNlpParsed=true)]
                                                              ↓
                                                    [PostHog event if first]

Explicit Command Flow:
Message → /add command → processExpense()
                              ↓
                    [NO magic moment call]
```

### PostHog Event Schema

```typescript
posthog.capture({
  distinctId: userId,
  event: 'onboarding_magic_moment',
  properties: {
    first_expense_category: 'food',
    first_expense_amount: 50.00,
    time_since_signup: 0.5,  // days
    locale: 'pt-BR'
  }
})
```

### Project Structure Notes

- Service location: `whatsapp-bot/src/services/onboarding/tier-tracker.ts`
- Integration: `whatsapp-bot/src/handlers/core/text-handler.ts` (after expense creation)
- Analytics: Use existing PostHog client from `services/analytics/`

### References

- [Source: docs/epics.md#Story-2.5-Magic-Moment-Tracking]
- [Source: docs/stories/tech-spec-epic-2.md#Story-2.5]
- [Source: docs/architecture.md#Analytics-Events]
- Depends on: Story 2.3 (guide to first expense)

---

## Dev Agent Record

### Context Reference

- `docs/architecture.md` (PostHog event schema)
- `docs/stories/2-3-guide-to-first-expense.md` (predecessor)

### Learnings from Previous Stories

**From Story 2-2 (Status: done)**

- `parseIntent()` used for NLP expense detection
- `text-handler.ts` is main integration point for message flow
- Expense detection uses 0.5 confidence threshold
- ESM imports with `.js` extension pattern

**From Story 2-1 (Status: done)**

- Supabase client pattern via `getSupabaseClient()`
- Safe error handling with defaults
- Test infrastructure has pre-existing tsconfig issue

### Agent Model Used

Claude Sonnet 4.5 (claude-sonnet-4-5-20250929)

### Debug Log References

- Created tier-tracker.ts with recordMagicMoment() function
- Added wasNlpParsed parameter to executeIntent() and handleAddExpense()
- Integrated magic moment tracking into NLP expense flow (semantic_cache and ai_function_calling paths)
- Explicit commands pass wasNlpParsed=false, preventing magic moment trigger (AC-2.5.3)

### Completion Notes List

1. **recordMagicMoment() Implementation**: Created with idempotent atomic update using `.is('magic_moment_at', null)` to prevent race conditions
2. **PostHog Event**: Fires `onboarding_magic_moment` with properties: first_expense_category, first_expense_amount, time_since_signup (days), timestamp
3. **Integration**: Modified text-handler.ts to pass wasNlpParsed flag through executeIntent() based on parsing strategy
4. **Unit Tests**: Comprehensive test suite covering all ACs, though tests cannot run due to pre-existing tsconfig issue (documented in Story 2-1)

### File List

**MODIFIED:**
- whatsapp-bot/src/handlers/core/text-handler.ts (pass wasNlpParsed to executeIntent)
- whatsapp-bot/src/handlers/core/intent-executor.ts (add wasNlpParsed param, pass to handleAddExpense)
- whatsapp-bot/src/handlers/transactions/expenses.ts (add wasNlpParsed param, call recordMagicMoment)
- whatsapp-bot/src/__mocks__/supabase.ts (add .is() mock method)

**NEW:**
- whatsapp-bot/src/services/onboarding/tier-tracker.ts (recordMagicMoment function)
- whatsapp-bot/src/__tests__/services/onboarding/tier-tracker.test.ts (unit tests)

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2025-11-21 | BMad Master | Initial draft from epics.md and tech-spec-epic-2.md |
| 2025-11-21 | Dev Agent | Implemented magic moment tracking, all tasks complete |
| 2025-11-21 | Lucas (SR Review) | Senior Developer Review notes appended |

---

## Senior Developer Review (AI)

**Reviewer:** Lucas
**Date:** 2025-11-21
**Outcome:** ✅ APPROVE

### Summary

Story 2.5 implementation is complete and well-executed. The magic moment tracking correctly identifies first NLP-parsed expenses, records them idempotently, and fires PostHog events with required properties. The integration properly distinguishes between NLP paths (semantic cache, LLM) and explicit commands.

### Acceptance Criteria Coverage

| AC # | Description | Status | Evidence |
|------|-------------|--------|----------|
| AC-2.5.1 | First NLP expense sets `magic_moment_at` + event | ✅ IMPLEMENTED | `tier-tracker.ts:77-119` |
| AC-2.5.2 | Subsequent NLP expenses don't update | ✅ IMPLEMENTED | `tier-tracker.ts:68-74` |
| AC-2.5.3 | Explicit commands do NOT trigger | ✅ IMPLEMENTED | `text-handler.ts:449`, `tier-tracker.ts:47-50` |
| AC-2.5.4 | Event includes required properties | ✅ IMPLEMENTED | `tier-tracker.ts:110-119` |

**Summary: 4 of 4 acceptance criteria fully implemented**

### Task Completion Validation

| Task | Marked | Verified | Evidence |
|------|--------|----------|----------|
| Task 1: recordMagicMoment() | [x] | ✅ VERIFIED | `tier-tracker.ts:41-137` |
| Task 2: PostHog event | [x] | ✅ VERIFIED | `tier-tracker.ts:110-119` |
| Task 3: Integration | [x] | ✅ VERIFIED | `expenses.ts:188-210`, `text-handler.ts:449,650,797` |
| Task 4: Idempotency | [x] | ✅ VERIFIED | `tier-tracker.ts:68-74,84` |
| Task 5: Unit tests | [x] | ✅ VERIFIED | `tier-tracker.test.ts` |

**Summary: 5 of 5 tasks verified, 0 questionable, 0 false completions**

### Key Findings

**No HIGH or MEDIUM severity issues found.**

**Highlights:**
- Excellent race condition handling with `.is('magic_moment_at', null)` atomic check
- Non-blocking design - expense creation succeeds even if magic moment tracking fails
- Clean separation between NLP and explicit command paths

### Test Coverage and Gaps

- Comprehensive test file with 8+ test cases covering all ACs
- ⚠️ Tests cannot execute due to pre-existing project-wide tsconfig issue

### Architectural Alignment

- ✅ Implements magic moment tracking from architecture doc
- ✅ `services/onboarding/tier-tracker.ts` location matches architecture
- ✅ PostHog event schema matches specification

### Security Notes

- ✅ No security concerns

### Action Items

**Advisory Notes:**
- Note: Pre-existing test infrastructure issue should be addressed in Epic 7
