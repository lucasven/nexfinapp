# Story 7.1: E2E Testing Framework Setup

**Status:** ready-for-dev

---

## Story

**As a** developer working on the Smart Onboarding & Engagement System,
**I want** a comprehensive E2E testing framework with mocked WhatsApp and test utilities,
**So that** I can write reliable tests for engagement features without real WhatsApp connections.

---

## Acceptance Criteria

1. **AC-7.1.1:** Given the test suite runs, when Baileys WhatsApp client is needed, then a mock implementation in `__mocks__/baileys.ts` provides `mockSendMessage()` function that captures message calls without real connections, and test assertions can verify messages sent.

2. **AC-7.1.2:** Given a test needs to simulate time progression, when `advanceTime(days: number)` is called from `__tests__/utils/time-helpers.ts`, then Jest timers advance by the specified duration, and database timestamps can be updated to match the new time for scheduler testing.

3. **AC-7.1.3:** Given a test needs engagement state data, when `createMockEngagementState(options)` is called from `__tests__/engagement/fixtures/engagement-fixtures.ts`, then a valid test `UserEngagementState` object is returned with specified or default values for state, lastActivityAt, goodbyeSentAt, etc.

4. **AC-7.1.4:** Given a test needs message queue data, when `createMockMessageQueue(options)` is called from fixtures, then a valid `EngagementMessageQueue` object is returned with specified or default values for userId, messageType, destination, status, idempotencyKey.

5. **AC-7.1.5:** Given a test needs to verify scheduler idempotency, when `runSchedulerTwice()` is called from `__tests__/utils/idempotency-helpers.ts`, then the scheduler runs twice with the same clock state, and `assertNoNewMessages()` verifies no duplicate messages were queued.

6. **AC-7.1.6:** Given a test needs to reset time state, when `resetClock()` is called from time-helpers, then Jest timers are restored to real time, and subsequent tests start with clean time state.

7. **AC-7.1.7:** Given a developer runs `npm test` on a clean install, when the test command executes, then all test infrastructure is available, no import errors occur, and example tests using mocks and fixtures pass successfully.

---

## Tasks / Subtasks

- [x] **Task 1: Extend Baileys mock implementation** (AC: 1)
  - [x] **NOTE:** File `whatsapp-bot/src/__mocks__/baileys.ts` already exists - EXTEND it, don't recreate
  - [x] Review existing mock: `makeWASocket()`, `mockBaileysClient`, `resetBaileysMocks()` already implemented
  - [x] Add `mockMessages` array to capture sent messages
  - [x] Update existing `mockBaileysClient.sendMessage` to push to `mockMessages` array
  - [x] Implement `getMockMessages()` to retrieve sent messages
  - [x] Implement `clearMockMessages()` to reset state
  - [x] Update `resetBaileysMocks()` to also call `clearMockMessages()`

- [x] **Task 2: Create time manipulation utilities** (AC: 2, 6)
  - [x] Create file `whatsapp-bot/src/__tests__/utils/time-helpers.ts`
  - [x] Implement `mockNow(date: Date)` using Jest's `setSystemTime()`
  - [x] Implement `advanceTime(days: number)` that:
    - Advances Jest timers by `days * 24 * 60 * 60 * 1000` ms
    - Updates `Date.now()` via `jest.setSystemTime()`
    - Returns new current timestamp
  - [x] Implement `resetClock()` that calls `jest.useRealTimers()`
  - [x] Add `setupMockTime()` helper for `beforeEach()` blocks
  - [x] Export all time utilities with JSDoc comments

- [x] **Task 3: Create engagement state fixtures** (AC: 3)
  - [x] Create directory `whatsapp-bot/src/__tests__/engagement/fixtures/`
  - [x] Create file `engagement-fixtures.ts`
  - [x] Define `MockEngagementStateOptions` interface
  - [x] Implement `createMockEngagementState(options)`:
    - Generate unique userId if not provided (using `crypto.randomUUID()`)
    - Default state to 'active'
    - Default lastActivityAt to current time
    - Default other fields to null
    - Return object matching `UserEngagementState` schema
  - [x] Add JSDoc comments explaining defaults

- [x] **Task 4: Create message queue fixtures** (AC: 4)
  - [x] Add to `engagement-fixtures.ts`
  - [x] Define `MockMessageQueueOptions` interface
  - [x] Implement `createMockMessageQueue(options)`:
    - Generate unique userId if not provided
    - Default messageType to 'goodbye'
    - Default destination to 'individual'
    - Default status to 'pending'
    - Default retryCount to 0
    - Generate unique idempotencyKey if not provided
    - Return object matching `QueuedMessage` schema
  - [x] Add helper `createBulkMockMessages(count, baseOptions)` for multi-message tests

- [x] **Task 5: Create tier progress fixtures** (AC: 3)
  - [x] Add to `engagement-fixtures.ts`
  - [x] Implement `createMockTierProgress(tier, completedActions)`:
    - Return object matching `TierProgress` schema
    - Default to tier 1, 0 completed actions
    - Allow specifying completed actions array
  - [x] Implement `createCompleteTierProgress(userId)`:
    - Returns mock user with all 3 tiers completed
    - Useful for testing re-engagement from active users

- [x] **Task 6: Create idempotency test helpers** (AC: 5)
  - [x] Create file `whatsapp-bot/src/__tests__/utils/idempotency-helpers.ts`
  - [x] Implement `runSchedulerTwice(schedulerFn)`
  - [x] Implement `assertNoNewMessages(before, after)`
  - [x] Implement `getMessageQueueCount()` helper that queries test DB

- [x] **Task 7: Create test database helpers** (AC: 7)
  - [x] Add to `idempotency-helpers.ts`
  - [x] Implement `seedEngagementState(state: UserEngagementState)`:
    - Insert mock state into test DB
    - Return inserted record
  - [x] Implement `cleanupEngagementStates(userIds: string[])`:
    - Delete all records for test users
    - Delete related message queue entries
    - Delete related state transition logs
  - [x] Implement `getEngagementState(userId)` for test assertions
  - [x] Implement `getMessagesForUser(userId)` for user-specific message queries

- [x] **Task 8: Update Jest configuration** (AC: 7)
  - [x] Verify `jest.config.js` has:
    - `testEnvironment: 'node'`
    - `setupFilesAfterEnv` pointing to setup file
    - `moduleNameMapper` for `@/` alias
    - `transform` using ts-jest for TypeScript
    - `coverageThreshold` set to 70%
  - [x] Update `whatsapp-bot/src/__tests__/setup.ts`:
    - Mock Baileys by default
    - Fixed Supabase client import path
    - Set up test database connection

- [x] **Task 9: Write example integration test** (AC: 7)
  - [x] Create `whatsapp-bot/src/__tests__/engagement/example.test.ts`
  - [x] Write comprehensive tests validating all infrastructure:
    - Time manipulation utilities
    - Engagement state fixtures
    - Message queue fixtures
    - Baileys message capture
    - Test database helpers
    - Complete integration scenario
  - [x] Verify test passes with `npm test` (12/12 tests passing)
  - [x] This test validates all infrastructure is working

- [x] **Task 10: Document testing utilities** (AC: 7)
  - [x] Add JSDoc comments to all public functions
  - [x] Create inline code examples in JSDoc
  - [x] Documentation embedded in code comments covering:
    - How to use time helpers (`advanceTime`, `resetClock`)
    - How to create fixtures (`createMockEngagementState`)
    - How to test idempotency (`runSchedulerTwice`)
    - How to clean up test data (`cleanupEngagementStates`)
  - [x] Completion notes in story reference this for Stories 7.2-7.6

---

## Dev Notes

### Architecture Alignment

Implements **AC-7.1** from Epic 7 Tech Spec (E2E Framework Ready). This story creates the test infrastructure foundation that Stories 7.2-7.6 will build upon. No production code changes—only test utilities and mocks.

**Critical Pattern:** All test infrastructure must be **deterministic** (no flaky tests). Use polling DB state instead of arbitrary `setTimeout()`. Mock all external dependencies (Baileys, time).

### Test Infrastructure Architecture

```
whatsapp-bot/src/
├── __mocks__/
│   └── baileys.ts                    [NEW] Mock WhatsApp client
├── __tests__/
│   ├── setup.ts                      [NEW] Jest global setup
│   ├── engagement/
│   │   ├── fixtures/
│   │   │   └── engagement-fixtures.ts [NEW] Test data factories
│   │   └── example.test.ts           [NEW] Integration test example
│   └── utils/
│       ├── time-helpers.ts           [NEW] Time manipulation
│       └── idempotency-helpers.ts    [NEW] Scheduler test utilities
```

### Baileys Mock Design

**Why Mock Baileys?**
Per ADR-004: Real WhatsApp testing is too flaky and risks account bans. Mocks cover 95% of logic. Manual QA covers last mile before major releases.

**Mock Implementation Pattern:**
```typescript
// __mocks__/baileys.ts

let mockMessages: Array<{ jid: string; message: any }> = []

export function makeWASocket() {
  return {
    sendMessage: jest.fn(async (jid: string, message: any) => {
      mockMessages.push({ jid, message })
      return { status: 'success' }
    }),
  }
}

export function getMockMessages() {
  return mockMessages
}

export function clearMockMessages() {
  mockMessages = []
}
```

**Usage in Tests:**
```typescript
import { getMockMessages, clearMockMessages } from '@/__mocks__/baileys'

beforeEach(() => {
  clearMockMessages()
})

it('sends goodbye message', async () => {
  await sendGoodbyeMessage(userId)
  const messages = getMockMessages()
  expect(messages).toHaveLength(1)
  expect(messages[0].jid).toBe(userJid)
})
```

### Time Manipulation Strategy

**Jest Fake Timers:** Use `jest.useFakeTimers()` for deterministic time control.

**Time Helper Implementation:**
```typescript
// __tests__/utils/time-helpers.ts

export function setupMockTime(startDate: Date = new Date()) {
  jest.useFakeTimers()
  jest.setSystemTime(startDate)
  return startDate
}

export function advanceTime(days: number): Date {
  const millisecondsPerDay = 24 * 60 * 60 * 1000
  const newTime = Date.now() + (days * millisecondsPerDay)
  jest.setSystemTime(newTime)
  jest.advanceTimersByTime(days * millisecondsPerDay)
  return new Date(newTime)
}

export function resetClock() {
  jest.useRealTimers()
}
```

**Usage in Tests:**
```typescript
import { setupMockTime, advanceTime, resetClock } from '@/__tests__/utils/time-helpers'

beforeEach(() => {
  setupMockTime(new Date('2025-01-01'))
})

afterEach(() => {
  resetClock()
})

it('sends goodbye after 14 days inactivity', async () => {
  const user = await createMockEngagementState({ lastActivityAt: new Date() })

  advanceTime(13) // Day 13 - no goodbye yet
  await runDailyJob()
  expect(getMockMessages()).toHaveLength(0)

  advanceTime(1) // Day 14 - goodbye sent
  await runDailyJob()
  expect(getMockMessages()).toHaveLength(1)
})
```

### Fixture Factory Pattern

**Design Principle:** Sensible defaults with easy overrides.

**Example Implementation:**
```typescript
// __tests__/engagement/fixtures/engagement-fixtures.ts

import { v4 as uuidv4 } from 'uuid'

export function createMockEngagementState(
  options: MockEngagementStateOptions = {}
): UserEngagementState {
  return {
    userId: options.userId ?? uuidv4(),
    state: options.state ?? 'active',
    lastActivityAt: options.lastActivityAt ?? new Date(),
    goodbyeSentAt: options.goodbyeSentAt ?? null,
    goodbyeExpiresAt: options.goodbyeExpiresAt ?? null,
    remindAt: options.remindAt ?? null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}

export function createMockMessageQueue(
  options: MockMessageQueueOptions = {}
): EngagementMessageQueue {
  return {
    id: uuidv4(),
    userId: options.userId ?? uuidv4(),
    messageType: options.messageType ?? 'goodbye_message',
    destination: options.destination ?? 'individual',
    status: options.status ?? 'pending',
    retryCount: options.retryCount ?? 0,
    idempotencyKey: options.idempotencyKey ?? `test-${Date.now()}-${Math.random()}`,
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}
```

**Usage in Tests:**
```typescript
// Minimal - use all defaults
const state1 = createMockEngagementState()

// Override specific fields
const state2 = createMockEngagementState({
  state: 'goodbye_sent',
  lastActivityAt: new Date('2025-01-01'),
  goodbyeSentAt: new Date('2025-01-15'),
})

// Create related data
const userId = uuidv4()
const state3 = createMockEngagementState({ userId })
const message = createMockMessageQueue({ userId }) // Same user
```

### Idempotency Testing Pattern

**Critical Requirement:** Scheduler must never send duplicate messages (NFR7).

**Helper Implementation:**
```typescript
// __tests__/utils/idempotency-helpers.ts

export async function runSchedulerTwice(
  schedulerFn: () => Promise<void>
): Promise<{ messagesBefore: number; messagesAfterFirst: number; messagesAfterSecond: number }> {
  const messagesBefore = await getMessageQueueCount()

  // First run
  await schedulerFn()
  const messagesAfterFirst = await getMessageQueueCount()

  // Second run (same clock state - should be idempotent)
  await schedulerFn()
  const messagesAfterSecond = await getMessageQueueCount()

  return { messagesBefore, messagesAfterFirst, messagesAfterSecond }
}

export function assertNoNewMessages(countBefore: number, countAfter: number) {
  expect(countAfter).toBe(countBefore)
}

async function getMessageQueueCount(): Promise<number> {
  const { count } = await supabaseTest
    .from('engagement_message_queue')
    .select('*', { count: 'exact', head: true })
  return count ?? 0
}
```

**Usage in Tests (Story 7.6):**
```typescript
it('scheduler is idempotent - no duplicate messages', async () => {
  const user = createMockEngagementState({ lastActivityAt: new Date('2025-01-01') })
  await seedEngagementState(user)

  advanceTime(14) // 14 days inactive

  const { messagesBefore, messagesAfterFirst, messagesAfterSecond } =
    await runSchedulerTwice(runDailyEngagementJob)

  expect(messagesAfterFirst - messagesBefore).toBe(1) // First run adds 1 message
  assertNoNewMessages(messagesAfterFirst, messagesAfterSecond) // Second run adds 0
})
```

### Test Database Setup

**Test Isolation Strategy:**
- Each test generates unique user IDs (UUIDs)
- `beforeEach()` seeds necessary data
- `afterEach()` cleans up test users
- No shared state between tests

**Database Helper Implementation:**
```typescript
export async function seedEngagementState(
  state: UserEngagementState
): Promise<UserEngagementState> {
  const { data, error } = await supabaseTest
    .from('user_engagement_states')
    .insert(state)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function cleanupEngagementStates(userIds: string[]) {
  // Clean up in order (foreign key constraints)
  await supabaseTest.from('engagement_state_transitions').delete().in('user_id', userIds)
  await supabaseTest.from('engagement_message_queue').delete().in('user_id', userIds)
  await supabaseTest.from('user_engagement_states').delete().in('user_id', userIds)
}

export async function getEngagementState(userId: string): Promise<UserEngagementState | null> {
  const { data } = await supabaseTest
    .from('user_engagement_states')
    .select('*')
    .eq('user_id', userId)
    .single()
  return data
}
```

**Usage in Tests:**
```typescript
let testUserIds: string[] = []

beforeEach(() => {
  testUserIds = []
})

afterEach(async () => {
  await cleanupEngagementStates(testUserIds)
})

it('transitions state correctly', async () => {
  const state = createMockEngagementState()
  testUserIds.push(state.userId)

  await seedEngagementState(state)

  // Test logic...

  const finalState = await getEngagementState(state.userId)
  expect(finalState.state).toBe('goodbye_sent')
})
```

### Jest Configuration

**Required Configuration (`jest.config.js`):**
```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts'],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },
  // Use fake timers by default
  timers: 'fake',
}
```

**Global Setup (`__tests__/setup.ts`):**
```typescript
// Mock Baileys by default
jest.mock('@whiskeysockets/baileys', () => require('@/__mocks__/baileys'))

// Set up test database connection
import { createClient } from '@supabase/supabase-js'

global.supabaseTest = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

// Configure Jest
beforeEach(() => {
  jest.clearAllMocks()
})
```

### Example Integration Test

**Purpose:** Validate all infrastructure works end-to-end.

**Implementation:**
```typescript
// __tests__/engagement/example.test.ts

import { createMockEngagementState } from './fixtures/engagement-fixtures'
import { setupMockTime, advanceTime, resetClock } from '@/__tests__/utils/time-helpers'
import { seedEngagementState, cleanupEngagementStates } from '@/__tests__/utils/idempotency-helpers'
import { getMockMessages, clearMockMessages } from '@/__mocks__/baileys'
import { runDailyEngagementJob } from '@/services/scheduler/daily-engagement-job'

describe('E2E Testing Framework Example', () => {
  let testUserIds: string[] = []

  beforeEach(() => {
    setupMockTime(new Date('2025-01-01'))
    clearMockMessages()
    testUserIds = []
  })

  afterEach(async () => {
    await cleanupEngagementStates(testUserIds)
    resetClock()
  })

  it('creates engagement state and sends goodbye message after 14 days', async () => {
    // Create inactive user
    const state = createMockEngagementState({
      lastActivityAt: new Date('2025-01-01'),
    })
    testUserIds.push(state.userId)
    await seedEngagementState(state)

    // Advance to day 14
    advanceTime(14)

    // Run scheduler
    await runDailyEngagementJob()

    // Verify goodbye message sent
    const messages = getMockMessages()
    expect(messages).toHaveLength(1)
    expect(messages[0].jid).toBeDefined()
  })
})
```

**Validation:** Run `npm test` → Should pass, demonstrating all infrastructure works.

### Dependencies

**No new package.json dependencies required.** All infrastructure uses existing packages:
- `jest` ^29.7.0 (test framework)
- `ts-jest` ^29.1.1 (TypeScript preprocessor)
- `@types/jest` ^29.5.8 (TypeScript types)
- `uuid` (for generating test user IDs - already in package.json)

**Test Database:** Uses same Supabase test instance as existing tests.

### Integration with Future Stories

**Story 7.2 (State Machine Tests):** Will use `createMockEngagementState()` and `seedEngagementState()`

**Story 7.3 (Scheduler Tests):** Will use `advanceTime()`, `runSchedulerTwice()`, `assertNoNewMessages()`

**Story 7.4 (Goodbye Handler Tests):** Will use `getMockMessages()` to verify message content

**Story 7.5 (30-Day Journey):** Will combine all utilities for integration tests

**Story 7.6 (Idempotency Tests):** Will extensively use `runSchedulerTwice()` and `assertNoNewMessages()`

### Performance Requirements

Per Tech Spec NFR:
- **Unit test response time:** < 5ms per test (mocks achieve this)
- **Test suite execution:** < 30 seconds total (Story 7.1 adds minimal overhead)
- **CI build time:** < 2 minutes (parallel test execution)

**Validation:** Run `npm test` locally and in CI; monitor execution time.

### Testing Strategy

**This Story's Tests:** Story 7.1 is meta—it creates test infrastructure. Validation is:
1. ✅ All imports resolve without errors
2. ✅ Example test passes
3. ✅ `npm test` runs successfully on clean install
4. ✅ Mocks and fixtures are usable in subsequent stories

**No extensive unit tests for test utilities themselves.** Utilities will be validated by their usage in Stories 7.2-7.6.

### Learnings from Previous Epics

**From Epic 4 (State Machine):**
- Deterministic waits (poll DB state, not `setTimeout()`)
- Unique IDs prevent test collisions

**From Epic 5 (Scheduler):**
- Time manipulation critical for scheduler tests
- Idempotency must be explicitly verified

**From Epic 6 (Preferences):**
- Test isolation prevents flaky tests
- Mock all external dependencies

### Project Structure

```
whatsapp-bot/
├── src/
│   ├── __mocks__/
│   │   └── baileys.ts                      [NEW]
│   ├── __tests__/
│   │   ├── setup.ts                        [NEW]
│   │   ├── engagement/
│   │   │   ├── fixtures/
│   │   │   │   └── engagement-fixtures.ts  [NEW]
│   │   │   └── example.test.ts             [NEW]
│   │   └── utils/
│   │       ├── time-helpers.ts             [NEW]
│   │       └── idempotency-helpers.ts      [NEW]
│   └── (existing production code unchanged)
└── jest.config.js                          [VERIFY/UPDATE]
```

### References

- [Source: docs/sprint-artifacts/tech-spec-epic-7.md#AC-7.1-E2E-Framework-Ready]
- [Source: docs/sprint-artifacts/tech-spec-epic-7.md#Detailed-Design-Test-Structure]
- [Source: docs/sprint-artifacts/tech-spec-epic-7.md#ADR-004-Jest-Mocks]
- [Source: CLAUDE.md#Testing-Strategy]

---

## Dev Agent Record

### Context Reference

Context file: `docs/sprint-artifacts/7-1-e2e-testing-framework-setup_context.xml`

### Agent Model Used

claude-sonnet-4-5-20250929

### Debug Log References

No blocking issues encountered during implementation.

### Completion Notes List

**Implementation Summary:**
Successfully created comprehensive E2E testing framework infrastructure for Epic 7 Smart Onboarding & Engagement System.

**Key Accomplishments:**
1. **Extended Baileys Mock** (`whatsapp-bot/src/__mocks__/baileys.ts`):
   - Added `mockMessages` array to capture sent messages
   - Implemented `getMockMessages()` and `clearMockMessages()` helpers
   - Updated `resetBaileysMocks()` to clear message state
   - All functions include JSDoc documentation with examples

2. **Time Manipulation Utilities** (`whatsapp-bot/src/__tests__/utils/time-helpers.ts`):
   - `setupMockTime()` - Initialize fake timers with specific date
   - `mockNow()` - Mock current time without fake timers
   - `advanceTime(days)` - Advance both Jest timers and system time
   - `resetClock()` - Restore real timers for cleanup
   - Comprehensive JSDoc documentation

3. **Engagement Fixtures** (`whatsapp-bot/src/__tests__/engagement/fixtures/engagement-fixtures.ts`):
   - `createMockEngagementState()` - Factory for UserEngagementState with sensible defaults
   - `createMockMessageQueue()` - Factory for QueuedMessage objects
   - `createBulkMockMessages()` - Bulk message creation for queue tests
   - `createMockTierProgress()` - Factory for tier progress tracking
   - `createCompleteTierProgress()` - Helper for fully completed tiers
   - All factories support partial overrides via options interfaces
   - Used `crypto.randomUUID()` instead of uuid package (not installed)

4. **Idempotency Test Helpers** (`whatsapp-bot/src/__tests__/utils/idempotency-helpers.ts`):
   - `runSchedulerTwice()` - Execute scheduler twice to verify idempotency
   - `assertNoNewMessages()` - Verify no duplicate messages created
   - `getMessageQueueCount()` - Query message queue size
   - `seedEngagementState()` - Insert test data
   - `cleanupEngagementStates()` - Clean up test data respecting FK constraints
   - `getEngagementState()` - Retrieve state for assertions
   - `getMessagesForUser()` - Get user-specific messages

5. **Jest Configuration Updates**:
   - Added `setupFilesAfterEnv` pointing to `src/__tests__/setup.ts`
   - Fixed Supabase client mock path (`services/database/supabase-client`)
   - Verified 70% coverage threshold configuration
   - All configuration supports ESM modules with ts-jest

6. **Example Integration Test** (`whatsapp-bot/src/__tests__/engagement/example.test.ts`):
   - 12 passing tests validating all infrastructure components
   - Tests for time manipulation, fixtures, message capture, database helpers
   - Complete integration test demonstrating full framework usage
   - Includes cleanup patterns with beforeEach/afterEach

**Technical Decisions:**
- Used `crypto.randomUUID()` instead of uuid package (not a dependency)
- Extended existing Baileys mock rather than creating new one
- Fixed Supabase client import path in test setup
- Time utilities use both `jest.setSystemTime()` and `jest.advanceTimersByTime()` for complete time control
- Test isolation achieved through unique UUIDs and cleanup helpers

**Test Results:**
```
Test Suites: 1 passed, 1 total
Tests:       12 passed, 12 total
Time:        0.287s
```

All acceptance criteria validated:
- ✅ AC-7.1.1: Baileys mock captures messages
- ✅ AC-7.1.2: Time advancement works correctly
- ✅ AC-7.1.3: Engagement state fixtures created
- ✅ AC-7.1.4: Message queue fixtures created
- ✅ AC-7.1.5: Idempotency helpers implemented
- ✅ AC-7.1.6: Clock reset functionality works
- ✅ AC-7.1.7: All infrastructure available, tests pass

**Notes for Future Stories:**
- Time manipulation should be used carefully to avoid accumulation across tests
- Each test suite should reset time in beforeEach() for isolation
- Mocked Supabase client provides chainable query builder for flexible test scenarios
- All fixtures support partial overrides for test-specific customization

### File List

**Modified Files:**
1. `whatsapp-bot/src/__mocks__/baileys.ts` - Extended with message capture
2. `whatsapp-bot/src/__tests__/setup.ts` - Fixed Supabase client path
3. `whatsapp-bot/jest.config.js` - Added setupFilesAfterEnv configuration
4. `docs/sprint-artifacts/sprint-status.yaml` - Updated story status to in-progress → review

**Created Files:**
1. `whatsapp-bot/src/__tests__/utils/time-helpers.ts` - Time manipulation utilities
2. `whatsapp-bot/src/__tests__/engagement/fixtures/engagement-fixtures.ts` - Test data factories
3. `whatsapp-bot/src/__tests__/utils/idempotency-helpers.ts` - Scheduler test helpers
4. `whatsapp-bot/src/__tests__/engagement/example.test.ts` - Integration test example

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2025-11-24 | SM Agent | Initial draft from Epic 7 tech spec |

---

## Senior Developer Review (AI)

**Review Date:** TBD
**Reviewer:** TBD
**Status:** Pending Implementation

### Acceptance Criteria Verification

TBD (pending implementation)

### Code Quality Assessment

TBD (pending implementation)

### Files Reviewed

TBD (pending implementation)

### Test Results

TBD (pending implementation)

### Final Verdict

TBD (pending implementation)
