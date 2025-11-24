# System-Level Test Design

**Project:** NexFinApp Smart Onboarding & Engagement System
**Phase:** Solutioning (Phase 3)
**Author:** Murat (Master Test Architect)
**Date:** 2025-11-21

---

## Testability Assessment

### Controllability: PASS

**Assessment:** The architecture demonstrates strong controllability characteristics.

| Criterion | Status | Evidence |
|-----------|--------|----------|
| State control via API | ✅ | State machine service (`transitionState()`) allows programmatic state manipulation |
| External dependencies mockable | ✅ | Supabase client already mocked in existing tests; Baileys mockable per ADR-004 |
| Error condition triggering | ✅ | Message queue retry logic testable; scheduler jobs can be triggered manually |
| Database seeding | ✅ | Existing factory patterns (`createMockUserSession`, `createMockParsedIntent`) |
| Time manipulation | ✅ | Scheduler uses database timestamps, not real-time clocks—mockable with fake dates |

**Strengths:**
- State machine has explicit transition contracts (`VALID_TRANSITIONS` map)
- Idempotency keys enable deterministic testing (same key = same result)
- All proactive messaging goes through queue (interceptable, verifiable)

**Recommendations:**
- Add `advanceTime()` helper for scheduler testing (mock `now()`)
- Create engagement-specific factories: `createMockEngagementState()`, `createMockMessageQueue()`

---

### Observability: PASS

**Assessment:** Architecture includes comprehensive observability points.

| Criterion | Status | Evidence |
|-----------|--------|----------|
| State inspection | ✅ | `engagement_state_transitions` table logs all state changes with metadata |
| Deterministic results | ✅ | Idempotent scheduler guarantees repeatable outcomes |
| NFR validation | ✅ | PostHog analytics events (`engagement_state_changed`, `onboarding_tier_completed`) |
| Audit trail | ✅ | Message queue tracks sent/failed/retry status per message |

**Strengths:**
- All state transitions logged with timestamps, from_state, to_state, trigger
- Analytics events fire for every key action (tier completion, magic moment, goodbye response)
- Message queue provides delivery audit trail

**Recommendations:**
- Add structured logging for scheduler job execution (job_id, users_processed, duration)
- Ensure PostHog events include correlation IDs for end-to-end tracing

---

### Reliability: PASS

**Assessment:** Architecture supports reliable, isolated testing.

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Test isolation | ✅ | Database transactions can be rolled back; fixtures with auto-cleanup |
| Parallel-safe | ✅ | Unique idempotency keys per test; no shared mutable state |
| Deterministic waits | ✅ | Network-first pattern (wait for DB update, not arbitrary time) |
| Failure reproduction | ✅ | Message queue stores failure reason; retry logic documented |

**Strengths:**
- ADR-002 (Database-driven scheduler) ensures state survives restarts
- ADR-003 (Message queue) enables retry testing
- Existing Jest config has 70% coverage threshold

**Recommendations:**
- Add `resetEngagementState()` helper for test isolation
- Ensure all DB operations use transactions for rollback capability

---

## Architecturally Significant Requirements (ASRs)

| ASR ID | Requirement | Category | Prob | Impact | Score | Testability Challenge |
|--------|-------------|----------|------|--------|-------|----------------------|
| ASR-1 | First message response < 3s (NFR1) | PERF | 2 | 3 | 6 | Requires load testing with realistic NLP latency |
| ASR-2 | Scheduler job 99.9% success rate (NFR4) | OPS | 2 | 3 | 6 | Needs chaos testing (DB failures, timeouts) |
| ASR-3 | No duplicate messages ever (NFR7) | DATA | 3 | 3 | 9 | **CRITICAL** - Must verify idempotency under all conditions |
| ASR-4 | Opt-out sync < 5s (NFR10) | PERF | 1 | 2 | 2 | Straightforward database query timing |
| ASR-5 | 10K users without architecture changes (NFR8) | PERF | 2 | 2 | 4 | Requires load testing scheduler at scale |
| ASR-6 | State persistence across restarts (NFR6) | DATA | 2 | 3 | 6 | Test service restart scenarios |

**High-Priority ASRs (Score ≥ 6):**
- **ASR-3 (Score 9):** Idempotency is the critical path. Duplicate goodbye messages break user trust.
- **ASR-1, ASR-2, ASR-6 (Score 6):** Performance, scheduler reliability, and state persistence require dedicated test suites.

---

## Test Levels Strategy

Based on architecture (Node.js backend, WhatsApp bot, PostgreSQL), I recommend:

| Level | Allocation | Rationale |
|-------|------------|-----------|
| **Unit** | 60% | State machine logic, tier tracking, message routing—all pure functions with complex branching |
| **Integration** | 30% | Database operations, scheduler jobs with real queries, API contracts |
| **E2E** | 10% | Critical user journeys only (30-day journey, first message magic moment) |

**Justification:**
- **Unit (60%):** State machine has 10 valid transitions, 5 states, multiple triggers. Pure logic = fast, reliable unit tests.
- **Integration (30%):** Scheduler jobs must query real database (indexed queries, date comparisons). Can't mock this reliably.
- **E2E (10%):** WhatsApp is mocked per ADR-004. E2E validates message flow, not actual Baileys delivery.

**Test Level Selection per Epic:**

| Epic | Primary Level | Secondary Level | Rationale |
|------|--------------|-----------------|-----------|
| Epic 1: Foundation | Integration | - | Database schema, migrations, RLS policies |
| Epic 2: Welcome | Unit + E2E | Integration | First message detection (unit), conversational response (E2E) |
| Epic 3: Tier Journey | Unit | Integration | Tier tracker is pure logic; completion events need DB |
| Epic 4: State Machine | Unit | Integration | Transitions are pure; logging needs DB |
| Epic 5: Scheduler | Integration | Unit | Jobs query DB; idempotency logic is pure |
| Epic 6: Preferences | Integration | E2E | DB sync; web toggle requires UI test |
| Epic 7: Testing | Meta | - | Test infrastructure itself |

---

## NFR Testing Approach

### Security (LOW RISK for this feature)

**Assessment:** No new security surfaces. Existing Supabase RLS covers new tables.

| Test | Tool | Target |
|------|------|--------|
| RLS policy verification | Integration test | Users can only read own engagement state |
| Service role access | Integration test | Scheduler bypasses RLS correctly |

**Approach:** Add RLS tests to Epic 1 Story 1.1 (schema migration). No dedicated security suite needed.

---

### Performance (MEDIUM RISK - ASR-1, ASR-5)

**Assessment:** Two performance concerns: response time and scheduler scale.

| Test | Tool | Target | Threshold |
|------|------|--------|-----------|
| First message latency | Unit test with mocks | Response time | < 3s (NFR1) |
| Scheduler job duration | Integration test | Full user base scan | < 60s (NFR3) |
| 10K user simulation | k6 load test | Scheduler at scale | Linear scaling |

**Approach:**
- Unit tests verify handler logic is fast (no blocking operations)
- Integration tests measure actual scheduler queries on test dataset (100-1000 users)
- k6 load test (post-MVP) simulates 10K users for scheduler stress test

**Recommendation:** Create `benchmark/` directory for performance tests. Run on schedule, not every CI.

---

### Reliability (HIGH RISK - ASR-2, ASR-3, ASR-6)

**Assessment:** Three critical reliability concerns: scheduler uptime, idempotency, and state persistence.

| Test | Tool | Target | Acceptance |
|------|------|--------|------------|
| Scheduler idempotency | Unit + Integration | Re-run daily job | No duplicate messages |
| Message queue retry | Unit test | Failed send recovery | 3 retries, exponential backoff |
| State persistence | Integration test | Service restart | State unchanged after restart |
| Timeout handling | Unit test | 48h goodbye expiry | Correct state transition |
| Activity tracking | Unit test | Message updates last_activity_at | Always updated |

**Approach:**
- **Idempotency (ASR-3):** Dedicated test file `idempotency.test.ts` with scenarios:
  - Daily job runs twice same day → 0 duplicate messages
  - Goodbye already sent → upsert ignores duplicate key
  - Concurrent scheduler instances → database locks prevent race
- **Retry logic:** Unit test message sender with mock failures
- **Persistence:** Integration test: insert state → kill process → restart → verify state

---

### Maintainability (PASS - Existing Infrastructure)

**Assessment:** Existing test infrastructure is solid.

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Coverage threshold | ✅ | 70% global (branches, functions, lines, statements) |
| Test framework | ✅ | Jest + ts-jest with ESM support |
| Mock infrastructure | ✅ | Supabase client mocks, factory patterns |
| Test organization | ✅ | `__tests__/` mirroring source structure |

**Recommendations:**
- Add `__tests__/engagement/` directory per architecture doc
- Maintain 70% coverage for new engagement code
- Add mock for Baileys message sending (per ADR-004)

---

## Test Environment Requirements

| Environment | Purpose | Components |
|-------------|---------|------------|
| **Local (CI)** | Unit + Integration | Jest, mocked Supabase, mocked Baileys |
| **Staging** | E2E journeys | Real Supabase (test instance), mocked WhatsApp |
| **Production-like** | Load testing | k6, test Supabase with 10K seeded users |

**No new infrastructure required.** Existing local Jest + staging Supabase pattern applies.

---

## Testability Concerns

### No Blockers Found

The architecture is testable. Key decisions that enable this:
- ADR-004: Jest + mocked Baileys (no real WhatsApp dependency)
- ADR-002: Database-driven scheduler (state inspectable, no in-memory timers)
- ADR-003: Message queue (delivery trackable, retries verifiable)

### Minor Concerns (PASS with recommendations)

| Concern | Severity | Mitigation |
|---------|----------|------------|
| Baileys send/receive untested in CI | Low | Manual QA before major releases (per ADR-004) |
| Scheduler timing precision | Low | Acceptable per ADR-005 (48h vs 49h doesn't matter) |
| PostHog event verification | Low | Mock PostHog client in tests, verify calls |

---

## Recommendations for Sprint 0

Before starting Epic 1, complete these test infrastructure tasks:

### 1. Create Engagement Test Fixtures

```typescript
// __tests__/engagement/fixtures/engagement-fixtures.ts
export function createMockEngagementState(overrides?: Partial<EngagementState>): EngagementState
export function createMockMessageQueue(overrides?: Partial<QueuedMessage>): QueuedMessage
export function createMockTierProgress(tier?: 1 | 2 | 3): TierProgress
```

### 2. Add Baileys Mock

```typescript
// __mocks__/baileys.ts
export const mockSendMessage = jest.fn()
export const mockBaileys = {
  sendMessage: mockSendMessage,
  // ... other methods
}
```

### 3. Create Time Helpers

```typescript
// __tests__/utils/time-helpers.ts
export function advanceTime(days: number): void
export function mockNow(date: Date): void
export function resetClock(): void
```

### 4. Add Idempotency Test Utilities

```typescript
// __tests__/utils/idempotency-helpers.ts
export async function runSchedulerTwice(): Promise<{ firstRun: JobResult, secondRun: JobResult }>
export function assertNoNewMessages(before: number, after: number): void
```

---

## Quality Gate Criteria (Phase 3 → Phase 4)

Before proceeding to implementation (`sprint-planning`), verify:

| Criterion | Threshold | Validation |
|-----------|-----------|------------|
| Testability concerns resolved | 0 blockers | This document shows PASS |
| Test infrastructure ready | Sprint 0 tasks complete | Create fixtures, mocks, helpers |
| NFR test approach documented | All NFRs covered | See NFR Testing Approach section |
| Risk assessment complete | No score=9 unmitigated | ASR-3 (idempotency) has test plan |

**Gate Decision: PASS** — Architecture is testable. Proceed to `implementation-readiness`.

---

## Summary

| Category | Assessment | Key Finding |
|----------|------------|-------------|
| **Controllability** | PASS | State machine, database seeding, time manipulation all supported |
| **Observability** | PASS | Transition logs, analytics events, message queue audit trail |
| **Reliability** | PASS | Idempotency keys, parallel-safe design, fixture cleanup |
| **Test Levels** | 60/30/10 | Unit-heavy for state machine logic, Integration for scheduler |
| **NFR Coverage** | PASS | Performance benchmarks, reliability tests, security via RLS |
| **Testability Concerns** | 0 blockers | Minor concerns mitigated by ADRs |

---

## Next Steps

1. **Complete Sprint 0 tasks** — Create engagement fixtures, Baileys mock, time helpers
2. **Run `*framework`** — Initialize test framework structure if not exists
3. **Proceed to `implementation-readiness`** — Validate all artifacts aligned
4. **Run `*atdd` per epic** — Generate failing tests before implementation

---

_Generated by BMAD Test Architect Workflow_
_Agent: Murat (Master Test Architect)_
_Date: 2025-11-21_
_Project: NexFinApp Smart Onboarding & Engagement System_
