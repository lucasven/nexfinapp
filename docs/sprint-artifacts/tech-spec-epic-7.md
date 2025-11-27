# Epic Technical Specification: Testing & Quality Assurance

Date: 2025-11-24
Author: Lucas
Epic ID: epic-7
Status: Draft

---

## Overview

Epic 7 establishes comprehensive test coverage for NexFinApp's Smart Onboarding & Engagement System, ensuring reliability and correctness across all engagement features. This epic delivers testing infrastructure, automated test suites, and quality gates that validate the system's critical behaviors—particularly scheduler idempotency and state machine transitions.

The testing strategy prioritizes reliability over coverage metrics. Given the system's reliance on time-based state transitions and proactive messaging, tests must validate that users never receive duplicate messages (NFR7), state transitions execute correctly under all conditions, and scheduler jobs achieve 99.9% success rates (NFR4).

## Objectives and Scope

**Objectives:**
1. Establish E2E testing framework with mocked WhatsApp (Baileys) for integration testing without live connections
2. Achieve comprehensive unit test coverage for state machine transitions (all 10 valid transitions)
3. Validate scheduler timing logic across edge cases (13-day inactive, 14-day threshold, 48h timeout)
4. Verify idempotency guarantees prevent duplicate messages under all scenarios
5. Simulate complete 30-day user journeys covering all engagement paths
6. Ensure test infrastructure supports future feature development

**In Scope:**
- E2E test framework setup with Baileys mocks and test utilities
- Unit tests for state machine service (all transitions, invalid states, edge cases)
- Unit tests for scheduler timing logic (daily/weekly jobs, timeout handling)
- Unit tests for goodbye response parsing (exact matches, keywords, emoji variations)
- Integration test for 30-day user journey (5 scenarios: happy path, goodbye responses, opt-out)
- Idempotency verification tests (scheduler re-runs, message queue deduplication)
- Test fixtures and helpers for engagement system (mock states, advance time, reset helpers)

**Out of Scope:**
- Performance/load testing (post-MVP, requires production-like scale)
- Manual QA test plans (covered by automated tests)
- UI/frontend testing for web opt-out toggle (standard React Testing Library patterns)
- Real WhatsApp integration testing (per ADR-004: too flaky, risks account bans)

## System Architecture Alignment

This epic aligns with the brownfield architecture by extending existing test patterns:

**Existing Test Infrastructure:**
- Jest test framework with ts-jest for TypeScript ESM modules
- 70% coverage threshold (branches, functions, lines, statements)
- Mock infrastructure for Supabase client (`__mocks__/supabase.ts`)
- Factory patterns for test data (`createMockUserSession`, `createMockParsedIntent`)
- Test structure mirrors source: `__tests__/` directories alongside implementation

**New Test Structure (Epic 7 Additions):**
```
whatsapp-bot/src/__tests__/
├── engagement/                     # NEW - Epic 7
│   ├── fixtures/                   # Test data factories
│   │   └── engagement-fixtures.ts  # createMockEngagementState, etc.
│   ├── state-machine.test.ts       # Story 7.2
│   ├── daily-job.test.ts           # Story 7.3
│   ├── weekly-job.test.ts          # Story 7.3
│   ├── goodbye-handler.test.ts     # Story 7.4
│   ├── tier-progress.test.ts       # Tier tracker validation
│   ├── 30-day-journey.test.ts      # Story 7.5
│   └── idempotency.test.ts         # Story 7.6
├── utils/
│   ├── time-helpers.ts             # advanceTime, mockNow, resetClock
│   └── idempotency-helpers.ts      # runSchedulerTwice, assertNoNewMessages
└── __mocks__/
    └── baileys.ts                   # NEW - Mock WhatsApp client
```

**Architectural Decisions Enabling Testability:**
- **ADR-002 (Database-driven scheduler):** State persisted in DB, not memory—easily inspectable and controllable in tests
- **ADR-003 (Message queue):** All proactive messages go through queue—interceptable, verifiable, retryable
- **ADR-004 (Jest + mocks):** Real WhatsApp testing unnecessary; mocks cover 95% of logic
- **ADR-005 (Single daily job):** Simplified scheduler logic easier to test than distributed timers

## Detailed Design

### Services and Modules

Epic 7 does not introduce new production services—it tests existing engagement services. The "modules" in this epic are test utilities and mocks:

| Module | Location | Responsibility | Dependencies |
|--------|----------|----------------|--------------|
| **Engagement Test Fixtures** | `__tests__/engagement/fixtures/engagement-fixtures.ts` | Factory functions for test data: `createMockEngagementState()`, `createMockMessageQueue()`, `createMockTierProgress()` | None |
| **Time Helpers** | `__tests__/utils/time-helpers.ts` | Mock time manipulation: `advanceTime(days)`, `mockNow(date)`, `resetClock()` | Jest timer mocks |
| **Idempotency Helpers** | `__tests__/utils/idempotency-helpers.ts` | Scheduler test utilities: `runSchedulerTwice()`, `assertNoNewMessages()` | Supabase mock |
| **Baileys Mock** | `__mocks__/baileys.ts` | Mock WhatsApp client for testing message sending without real connection | None |
| **State Machine Tests** | `__tests__/engagement/state-machine.test.ts` | Unit tests for all state transitions (Story 7.2) | State machine service |
| **Scheduler Tests** | `__tests__/engagement/daily-job.test.ts`, `weekly-job.test.ts` | Unit tests for timing logic (Story 7.3) | Scheduler services |
| **Goodbye Handler Tests** | `__tests__/engagement/goodbye-handler.test.ts` | Unit tests for response parsing (Story 7.4) | Goodbye handler |
| **Journey Tests** | `__tests__/engagement/30-day-journey.test.ts` | Integration test for complete user journeys (Story 7.5) | All engagement services |
| **Idempotency Tests** | `__tests__/engagement/idempotency.test.ts` | Verification tests for scheduler guarantees (Story 7.6) | Scheduler services, message queue |

**Test Execution Flow:**
1. Unit tests run first (fast, no DB dependencies)
2. Integration tests run second (require test DB connection)
3. E2E tests run last (simulate full message flows)

**Coverage Target:** 70% across branches, functions, lines, statements (existing threshold maintained)

### Data Models and Contracts

Epic 7 does not create new database tables—it tests existing engagement tables. Test data models:

```typescript
// Test Fixtures Interface
export interface MockEngagementStateOptions {
  userId?: string
  state?: EngagementState
  lastActivityAt?: Date
  goodbyeSentAt?: Date | null
  goodbyeExpiresAt?: Date | null
  remindAt?: Date | null
}

export interface MockMessageQueueOptions {
  userId?: string
  messageType?: MessageType
  destination?: 'individual' | 'group'
  status?: 'pending' | 'sent' | 'failed'
  retryCount?: number
  idempotencyKey?: string
}
```

**Test Database Schema:** All tests use production schema (from Epic 1 Story 1.1):
- `user_engagement_states`, `engagement_state_transitions`, `engagement_message_queue`, `user_profiles`

**Test Isolation:** `beforeEach()` seeds data, `afterEach()` cleans up, unique user IDs prevent collisions

### APIs and Interfaces

Epic 7 tests existing APIs—no new production APIs. Key interfaces under test:

```typescript
// State Machine Service (Story 7.2)
interface StateTransitionAPI {
  transitionState(userId: string, trigger: TransitionTrigger): Promise<TransitionResult>
  getEngagementState(userId: string): Promise<EngagementState>
  getInactiveUsers(days: number): Promise<UserEngagementState[]>
}
// Coverage: All 10 valid transitions, invalid transition rejection, edge cases

// Scheduler Service (Story 7.3)
interface SchedulerAPI {
  runDailyEngagementJob(): Promise<JobResult>
  runWeeklyReviewJob(): Promise<JobResult>
}
// Coverage: 13/14/15-day thresholds, 47h/48h timeouts, weekly activity detection

// Goodbye Handler (Story 7.4)
interface GoodbyeHandlerAPI {
  processGoodbyeResponse(userId: string, message: string): Promise<HandlerResult>
}
// Coverage: Exact matches ("1", "2", "3"), emoji, keywords (pt-BR/en)
```

### Workflows and Sequencing

**30-Day Journey Test Scenarios (Story 7.5):**

1. **Happy Path:** Day 1 welcome → Day 2-14 tier completions → Day 8/15 weekly reviews → Day 30 active
2. **Goodbye → Help:** Day 15 goodbye → Day 16 response "1" → restart Tier 1 → active
3. **Goodbye → Remind Later:** Day 15 goodbye → Day 16 response "2" → Day 30 remind expires → dormant
4. **Goodbye → Timeout:** Day 15 goodbye → Day 17 no response (48h) → dormant
5. **Opted Out:** Day 2 opt-out → Day 15 no goodbye sent (respects opt-out) → active

**Idempotency Test Workflow (Story 7.6):**
```
Setup user with 14-day inactivity → Run daily job → Verify goodbye sent
→ Run daily job AGAIN same day → Verify NO duplicate message (idempotency)
```

## Non-Functional Requirements

### Performance

| Requirement | Target | Test Approach |
|-------------|--------|---------------|
| Test suite execution time | < 30 seconds total | Optimize unit tests for speed, parallel execution where possible |
| Unit test response time | < 5ms per test | Mock all external dependencies (DB, Baileys, OpenAI) |
| Integration test time | < 10 seconds total | Use test DB with minimal seed data |
| CI build time | < 2 minutes | Parallel test execution, cached dependencies |

**Validation:** Run `npm test` locally and in CI; monitor execution time per test suite.

### Security

| Requirement | Test Coverage |
|-------------|---------------|
| No test secrets in code | Verify `.env.test` not committed, mocks don't use real credentials |
| RLS policy respect | Integration tests verify users can only access own engagement state |
| Service role isolation | Tests confirm scheduler bypasses RLS correctly with service key |

**Validation:** Code review for hardcoded secrets, RLS tests in Story 7.1.

### Reliability/Availability

| Requirement | Target | Test Coverage |
|-------------|--------|---------------|
| Test stability | 0 flaky tests | Deterministic waits (poll DB state, not arbitrary `setTimeout`) |
| Test isolation | 100% independent tests | Each test creates/cleans up own data, no shared state |
| Idempotency verification | No duplicates ever | Story 7.6 tests scheduler re-runs produce zero new messages |
| Retry logic validation | 3 retries, exponential backoff | Unit tests mock failures, verify retry_count increments correctly |

**Validation:** Run test suite 10 times in CI; all runs must pass (no flakes).

### Observability

| Requirement | Implementation |
|-------------|----------------|
| Test failure diagnostics | Structured logs with user IDs, timestamps, state transitions |
| Coverage reporting | Jest coverage output to console + HTML report |
| Failed assertion context | Custom matchers provide detailed diff (expected vs actual state) |

**Validation:** Review test failure logs for clarity, ensure coverage report accessible.

## Dependencies and Integrations

**Testing Dependencies (from package.json):**

| Dependency | Version | Purpose |
|------------|---------|---------|
| `jest` | ^29.7.0 | Test framework |
| `ts-jest` | ^29.1.1 | TypeScript preprocessor for Jest |
| `@types/jest` | ^29.5.8 | TypeScript types for Jest |

**No new dependencies required.** All testing infrastructure uses existing packages.

**Integration Points:**

| System | Test Approach |
|--------|---------------|
| Supabase | Mock client with `__mocks__/supabase.ts` (existing pattern) |
| Baileys (WhatsApp) | New mock in `__mocks__/baileys.ts` (Story 7.1) |
| OpenAI | Existing mock (not tested in Epic 7, tested in Epic 2-6) |
| PostHog | Mock client, verify event calls |

## Acceptance Criteria (Authoritative)

**Epic 7 Success Criteria:**

1. **E2E Framework Ready (Story 7.1)**
   - Baileys mock created with `mockSendMessage()` function
   - Test utilities available: `advanceTime()`, `createMockEngagementState()`, `runSchedulerTwice()`
   - `npm test` runs without errors on clean install

2. **State Machine Coverage (Story 7.2)**
   - All 10 valid transitions have passing tests
   - Invalid transitions (e.g., `dormant → goodbye_sent`) correctly rejected
   - Edge cases covered: already in state, rapid transitions, missing user

3. **Scheduler Timing Validated (Story 7.3)**
   - Daily job tests: 13-day (no action), 14-day (goodbye sent), 15-day (no duplicate)
   - Timeout tests: 47h (no action), 48h+ (dormant transition)
   - Weekly job tests: activity (review sent), no activity (silence), opt-out (skip)

4. **Goodbye Parsing Verified (Story 7.4)**
   - Tests pass for exact matches ("1", "2", "3"), emoji ("1️⃣"), keywords ("confuso", "confused")
   - Non-response messages correctly treated as normal user input → active

5. **30-Day Journeys Pass (Story 7.5)**
   - All 5 scenarios execute without errors
   - Final states verified: Scenario 1 = active, 2 = active, 3 = dormant, 4 = dormant, 5 = active

6. **Idempotency Guaranteed (Story 7.6)**
   - Scheduler re-run test: `runSchedulerTwice()` → zero new messages
   - Message queue test: duplicate idempotency key → upsert ignores
   - State machine test: same transition twice → no error, single log entry

7. **Coverage Threshold Met**
   - `npm run test:coverage` shows ≥ 70% for engagement code (branches, functions, lines, statements)

## Traceability Mapping

| Acceptance Criterion | Test File | PRD FR Coverage |
|---------------------|-----------|-----------------|
| AC1: E2E Framework Ready | `__mocks__/baileys.ts`, `fixtures/`, `utils/` | FR49 (E2E testing support) |
| AC2: State Machine Coverage | `state-machine.test.ts` | FR11-FR18, FR52 (state transitions, test coverage) |
| AC3: Scheduler Timing | `daily-job.test.ts`, `weekly-job.test.ts` | FR12, FR17, FR20-FR22, FR44-FR46, FR51 |
| AC4: Goodbye Parsing | `goodbye-handler.test.ts` | FR14-FR16 (goodbye response processing) |
| AC5: 30-Day Journeys | `30-day-journey.test.ts` | FR1-FR53 (all FRs validated in integration) |
| AC6: Idempotency Guaranteed | `idempotency.test.ts` | FR19, FR47, FR53 (idempotent scheduler, NFR7) |
| AC7: Coverage Threshold | Jest coverage report | Indirect: validates all engagement code tested |

**FR Coverage Summary:**
- **FR49-FR53** (Testing Infrastructure) → Directly covered by Epic 7 stories
- **FR1-FR48** (Functional Requirements) → Indirectly validated by integration tests (Story 7.5)

## Risks, Assumptions, Open Questions

**Risks:**

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **Flaky tests due to timing** | Medium | High | Use deterministic waits (poll DB state, not `setTimeout`); mock all timers |
| **Test DB pollution across runs** | Low | Medium | `afterEach()` cleanup; unique user IDs per test |
| **Baileys mock doesn't reflect real behavior** | Low | Low | Per ADR-004: Manual QA before major releases covers last mile |
| **Coverage drops below 70%** | Low | Medium | Run coverage in CI; block merge if threshold not met |
| **Tests too slow (> 30s)** | Medium | Low | Optimize unit tests; parallelize where possible |

**Assumptions:**

| Assumption | Validation |
|------------|------------|
| Existing test infrastructure (Jest, ts-jest) sufficient | Confirmed: package.json already has jest ^29.7.0 |
| Test DB available in CI | Confirmed: Existing tests use Supabase test instance |
| 70% coverage achievable for engagement code | To validate: Run coverage after Epic 1-6 complete |
| Mocked Baileys covers 95% of logic | Per ADR-004: Accepted tradeoff (manual QA for real WhatsApp) |

**Open Questions:**

| Question | Answer / Plan |
|----------|---------------|
| Should we test real WhatsApp delivery? | **No** (per ADR-004: too flaky, risks account bans). Manual QA only. |
| Do we need load testing for 10K users? | **Post-MVP**. Scheduler scalability covered by NFR8, not Epic 7 scope. |
| Should tests run in parallel? | **Yes**, where possible. Jest default concurrency is safe with unique user IDs. |
| How to handle test data retention? | **Clean up in afterEach()**. Delete test users/states after each test. |

## Test Strategy Summary

**Test Pyramid Allocation:**
- **60% Unit Tests:** State machine logic, tier tracking, message routing, goodbye parsing
- **30% Integration Tests:** Scheduler jobs with real DB queries, message queue operations
- **10% E2E Tests:** 30-day journey scenarios, critical user flows

**Test Levels by Story:**

| Story | Level | Focus | Tools |
|-------|-------|-------|-------|
| 7.1 | Meta | Framework setup | Jest, mocks, fixtures |
| 7.2 | Unit | State machine transitions | Jest, mocked Supabase |
| 7.3 | Unit + Integration | Scheduler timing logic | Jest, test DB |
| 7.4 | Unit | Goodbye response parsing | Jest, mocked handlers |
| 7.5 | E2E/Integration | 30-day user journeys | Jest, test DB, mocked Baileys |
| 7.6 | Integration | Idempotency verification | Jest, test DB |

**Quality Gates:**

| Gate | Threshold | Enforcement |
|------|-----------|-------------|
| Test pass rate | 100% | CI fails if any test fails |
| Coverage | ≥ 70% (branches, functions, lines, statements) | CI fails if below threshold |
| Test execution time | < 30 seconds | Warning if exceeded, optimize as needed |
| Flakiness | 0 flaky tests | Manual review; re-run suite 10x to validate |

**Critical Test Scenarios (Must Pass):**

1. **Idempotency:** Scheduler runs twice → zero duplicate messages (NFR7)
2. **State Transitions:** All 10 valid transitions execute correctly (FR11-FR18)
3. **Timeout Handling:** 48h goodbye timeout → dormant (FR17)
4. **Opt-Out Respect:** Opted-out user never receives re-engagement messages (FR31)
5. **30-Day Happy Path:** User completes all tiers, receives weekly reviews, stays active (FR1-FR53 integration)

**Test Execution in CI:**

```bash
# Run full test suite with coverage
npm run test:coverage

# Output includes:
# - Test results (passed/failed)
# - Coverage report (branches, functions, lines, statements)
# - Execution time per suite
# - Failed assertion details with diffs

# CI gates:
# - All tests must pass
# - Coverage ≥ 70% for engagement code
# - No errors or warnings in logs
```
