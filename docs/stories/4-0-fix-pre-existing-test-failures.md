# Story 4.0: Fix Pre-existing Test Failures

Status: done

## Story

As a developer,
I want to fix the pre-existing test failures in the codebase,
so that the test suite runs cleanly and new story implementations can be validated without noise from unrelated failures.

## Background

This story was identified during the **Epic 3 Retrospective** (2025-11-22) as technical debt that was creating noise in test runs across stories 3.1, 3.4, and 3.6. The retrospective explicitly called out:

> "Pre-existing test failures in `expenses.test.ts` and `correction-detector.test.ts` that created noise in test runs."

**Owner:** Dana (QA)
**Timing:** Parallel with Stories 4.1-4.2
**Source:** [Epic 3 Retrospective](./epic-3-retro-2025-11-22.md#what-could-be-improved)

## Acceptance Criteria

1. **AC1:** All tests in `expenses.test.ts` pass without failures
2. **AC2:** All tests in `correction-detector.test.ts` pass without failures
3. **AC3:** Full test suite (`npm test`) exits with 0 failures
4. **AC4:** No new test skips introduced (`.skip()` only if explicitly justified and documented)
5. **AC5:** Test coverage remains at or above 70% threshold

## Tasks / Subtasks

- [x] Task 1: Analyze expenses.test.ts failures (AC: 1)
  - [x] 1.1 Run `npm test -- expenses.test.ts` and capture error output
  - [x] 1.2 Identify root cause of each failure (mock issues, type mismatches, async timing, etc.)
  - [x] 1.3 Document findings in this story file

- [x] Task 2: Fix expenses.test.ts failures (AC: 1)
  - [x] 2.1 Update mocks if Supabase/service signatures changed
  - [x] 2.2 Fix type mismatches from TypeScript updates
  - [x] 2.3 Fix async/await issues if present
  - [x] 2.4 Ensure all assertions match current implementation behavior

- [x] Task 3: Analyze correction-detector.test.ts failures (AC: 2)
  - [x] 3.1 Run `npm test -- correction-detector.test.ts` and capture error output
  - [x] 3.2 Identify root cause of each failure
  - [x] 3.3 Document findings in this story file

- [x] Task 4: Fix correction-detector.test.ts failures (AC: 2)
  - [x] 4.1 Update mocks if service contracts changed
  - [x] 4.2 Fix any logic drift between tests and implementation
  - [x] 4.3 Ensure assertions match expected behavior

- [x] Task 5: Validate full test suite (AC: 3, 5)
  - [x] 5.1 Run complete `npm test` suite
  - [x] 5.2 Verify all tests pass (exit code 0)
  - [x] 5.3 Check coverage report meets 70% threshold
  - [x] 5.4 Run `npm run build` to ensure no TypeScript errors

- [x] Task 6: Document any skipped tests (AC: 4)
  - [x] 6.1 If any tests must be skipped, add explicit justification comment
  - [x] 6.2 Create follow-up task for any deferred fixes

## Dev Notes

### Why This Story Matters

Clean test runs are essential for:
1. **Confidence in new implementations** - developers can trust that failures are from their changes
2. **CI/CD reliability** - automated builds won't have false negatives
3. **Sprint velocity** - no time wasted debugging unrelated failures

### Known Issue Context

From Epic 3 reviews, these failures appeared consistently but were not caused by Epic 3 changes. They likely originate from:
- Earlier refactoring of transaction handlers
- Mock setup not updated when Supabase client patterns changed
- Type signature changes in services

### Testing Standards

- Tests should follow existing patterns in `whatsapp-bot/src/__tests__/`
- Use mocks from `whatsapp-bot/src/__mocks__/`
- Mock Supabase calls, not real database
- Console warnings for PostHog API key are expected (not failures)

### Files to Investigate

| File | Type | Location |
|------|------|----------|
| expenses.test.ts | Test | `whatsapp-bot/src/__tests__/handlers/transactions/expenses.test.ts` |
| correction-detector.test.ts | Test | `whatsapp-bot/src/__tests__/services/detection/correction-detector.test.ts` |
| supabase.ts | Mock | `whatsapp-bot/src/__mocks__/supabase.ts` |

### References

- [Source: docs/stories/epic-3-retro-2025-11-22.md#what-could-be-improved]
- [Source: CLAUDE.md#testing-strategy]

## Dev Agent Record

### Context Reference

<!-- Path(s) to story context XML will be added here by context workflow -->

### Agent Model Used

Claude Sonnet 4.5 (claude-sonnet-4-5-20250929)

### Debug Log References

### Completion Notes List

**Failure 1: expenses.test.ts - Duplicate Warning Message**
- Test expected: `'Aviso de duplicata: Possível duplicata (80%)'`
- Implementation returns: `'Aviso de duplicata: Possível duplicata (80%)\n🆔 Duplicate ID: ABC123'`
- Root Cause: Implementation at expenses.ts:100 appends duplicate ID to warning message. Test mock for `storePendingTransaction` returned undefined.
- Fix: Updated mock to return `'ABC123'` and updated test expectation to include the duplicate ID line.

**Failure 2: correction-detector.test.ts - Transaction ID Validation**
- Test expected: `'ta errado mesmo'` → `action: 'update'`, `transactionId: 'ERRADO'`
- Implementation returns: `action: 'unknown'`
- Root Cause: Implementation was hardened (lines 46-52) to require transaction IDs contain both letters AND numbers (e.g., `ABC123`). "errado" is 6 chars but all letters, correctly rejected.
- Fix: Updated test expectation to match correct behavior: `action: 'unknown'` with confidence 0.2.

**Validation Results:**
- 15 test suites passed
- 280 tests passed, 0 failures
- No new test skips introduced
- Build errors in `services/engagement/` are pre-existing from Epic 4 in-progress work (not related to these test fixes)

### File List

| File | Change |
|------|--------|
| whatsapp-bot/src/__tests__/handlers/transactions/expenses.test.ts | Updated mock return value and test expectation for duplicate warning |
| whatsapp-bot/src/__tests__/services/detection/correction-detector.test.ts | Updated test expectation to match corrected transaction ID validation |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2025-11-22 | Bob (SM) | Story created from Epic 3 Retrospective action item |
| 2025-11-22 | Murat (TEA) | Fixed test failures, all 280 tests passing |
