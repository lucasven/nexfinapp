# Epic Technical Specification: Conversation-First Welcome

**Date:** 2025-11-21
**Author:** Lucas
**Epic ID:** 2
**Status:** Contexted

---

## Overview

Epic 2 delivers the "conversation-first welcome" experience that makes NexFinApp feel different from traditional expense trackers. When a user sends their first WhatsApp message, the bot responds conversationally to whatever they said BEFORE providing onboarding guidance, proving the NLP "magic" immediately.

This epic is **user-facing and critical**—it's the user's first impression and determines whether they experience the "aha moment" that drives retention.

---

## Objectives and Scope

### In Scope

- First message detection (new user vs. returning user)
- Conversational response to first message with contextual acknowledgment
- Guide to first expense with natural language example
- Preferred destination auto-detection (individual vs. group)
- Magic moment tracking (first NLP-parsed expense)
- Contextual hints after relevant actions
- PostHog analytics events

### Out of Scope

- Tier tracking and celebrations (Epic 3)
- Goodbye/re-engagement flows (Epic 4)
- Scheduled messages (Epic 5)
- Web integration (Epic 6)

---

## System Architecture Alignment

This epic implements the following architecture components:

| Architecture Section | Implementation |
|---------------------|----------------|
| Integration Points - Message Flow | Stories 2.1, 2.2, 2.3 |
| Project Structure - handlers/engagement/ | Story 2.1, 2.2 |
| Project Structure - services/onboarding/ | Story 2.5 |
| Data Architecture - user_profiles extensions | Story 2.4, 2.5 |
| FR Category - Onboarding & Discovery | All stories |

**FRs Covered:** FR1, FR2, FR3, FR9, FR24, FR25, FR39

---

## Detailed Design

### Services and Modules

| Module | File | Responsibility |
|--------|------|----------------|
| **First Message Handler** | `handlers/engagement/first-message-handler.ts` | Detect first message, orchestrate welcome flow |
| **Activity Tracker** | `services/engagement/activity-tracker.ts` | Update `last_activity_at`, check first message |
| **Message Router** | `services/engagement/message-router.ts` | Route to preferred destination |
| **Onboarding Service** | `services/onboarding/greeting-sender.ts` | Existing - extend for contextual response |

### Data Models and Contracts

#### First Message Detection

```typescript
// services/engagement/activity-tracker.ts

interface ActivityCheckResult {
  isFirstMessage: boolean
  userId: string
  preferredDestination: 'individual' | 'group'
  engagementState: EngagementState
}

/**
 * Check user activity and detect first message
 * Creates engagement state record if needed
 */
async function checkAndRecordActivity(
  userId: string,
  messageContext: MessageContext
): Promise<ActivityCheckResult>
```

#### Message Context

```typescript
// handlers/engagement/first-message-handler.ts

interface MessageContext {
  jid: string                    // Sender JID
  isGroup: boolean               // true if @g.us
  groupJid?: string              // Group JID if applicable
  pushName?: string              // WhatsApp display name
  messageText: string            // Raw message content
  parsedIntent?: ParsedIntent    // From NLP layer (if parseable)
}

interface FirstMessageResponse {
  contextualGreeting: string     // Personalized greeting
  guidanceMessage: string        // Guide to first expense
  shouldProcessIntent: boolean   // True if message was parseable
}
```

#### Preferred Destination

```typescript
// services/engagement/message-router.ts

interface DestinationPreference {
  preferred_destination: 'individual' | 'group'
  destination_jid: string        // JID to send proactive messages
}

/**
 * Auto-detect destination from first message context
 * Only sets if not already set (no auto-override)
 */
async function setPreferredDestination(
  userId: string,
  messageContext: MessageContext
): Promise<DestinationPreference>
```

### APIs and Interfaces

#### First Message Handler API

```typescript
// handlers/engagement/first-message-handler.ts

/**
 * Handle first message from a new user
 *
 * Flow:
 * 1. Create engagement state record (state = 'active')
 * 2. Set preferred destination based on message context
 * 3. Generate contextual greeting based on message content
 * 4. Include guidance to first expense
 * 5. If message is parseable, process it too
 *
 * @returns Response message to send
 */
export async function handleFirstMessage(
  userId: string,
  context: MessageContext
): Promise<string>

/**
 * Check if user needs first message handling
 */
export async function isFirstMessage(userId: string): Promise<boolean>
```

#### Magic Moment Tracking API

```typescript
// services/onboarding/tier-tracker.ts

/**
 * Record magic moment - first NLP-parsed expense
 *
 * @param userId - User ID
 * @param wasNlpParsed - True if expense was parsed via NLP (not explicit command)
 * @returns True if this was the first magic moment
 */
export async function recordMagicMoment(
  userId: string,
  wasNlpParsed: boolean
): Promise<boolean>
```

#### Contextual Hints API

```typescript
// handlers/engagement/first-message-handler.ts

interface HintContext {
  action: 'add_expense' | 'add_category' | 'set_budget' | 'view_report'
  count: number              // How many times this action performed
  userTier: number           // Current onboarding tier
  hintsEnabled: boolean      // User hasn't opted out of tips
}

/**
 * Get contextual hint to append to response (or null)
 */
export function getContextualHint(
  context: HintContext,
  locale: 'pt-br' | 'en'
): string | null
```

### Workflows and Sequencing

**Message Flow with First Message Detection:**

```
User sends message
        ↓
[Activity Tracker] → checkAndRecordActivity()
        ↓
    is_first_message?
        │
   ┌────┴────┐
  YES        NO
   │          │
   ▼          ▼
[First Message    [Normal NLP
 Handler]          Pipeline]
   │
   ▼
[Set Preferred Destination]
   │
   ▼
[Generate Contextual Response]
   │
   ▼
[Include Guidance Message]
   │
   ▼
[Process Intent if parseable]
   │
   ▼
[Track Magic Moment if NLP expense]
   │
   ▼
Response Sent
```

**Story Execution Order:**

```
2.1 First Message Detection
        ↓
2.2 Conversational First Response ──┬─→ 2.4 Preferred Destination
        ↓                           │
2.3 Guide to First Expense ─────────┘
        ↓
2.5 Magic Moment Tracking
        ↓
2.6 Contextual Hints After Actions
```

---

## Non-Functional Requirements

### Performance

| Requirement | Target | Validation |
|-------------|--------|------------|
| First message response | < 3 seconds | NFR1: Measure from message receipt to response |
| Database query time | < 100ms | Indexed queries on user_id |
| Activity tracking | Non-blocking | Async update, don't delay response |

### Security

| Requirement | Implementation |
|-------------|----------------|
| User data access | RLS policies on user_engagement_states |
| Group context | Only store JID, no message content |
| Push name | Optional, used for personalization only |

### Observability

| Signal | Implementation |
|--------|----------------|
| First message events | PostHog: `engagement_first_message` |
| Magic moment events | PostHog: `onboarding_magic_moment` |
| Preferred destination set | PostHog: `engagement_destination_set` |

---

## Dependencies and Integrations

### Epic 1 Dependencies

| Dependency | Status | Used For |
|------------|--------|----------|
| `user_engagement_states` table | done | First message detection |
| `user_profiles.preferred_destination` | done | Destination storage |
| `user_profiles.magic_moment_at` | done | Magic moment tracking |
| `services/engagement/activity-tracker.ts` | stub | Extend with logic |
| `services/engagement/message-router.ts` | stub | Extend with logic |
| `handlers/engagement/first-message-handler.ts` | stub | Implement |
| Localization messages | done | `engagementFirstMessage`, etc. |

### Existing Codebase Integration

| Component | Integration Point |
|-----------|------------------|
| `handlers/core/message-handler.ts` | Add first message check before NLP |
| `handlers/transactions/*.ts` | Add magic moment tracking |
| `services/onboarding/greeting-sender.ts` | Extend for contextual response |
| `localization/*.ts` | Use engagement messages |

---

## Acceptance Criteria (Authoritative)

### Story 2.1: First Message Detection

1. **AC-2.1.1:** Given a user sends their first WhatsApp message, a new `user_engagement_states` record is created with `state = 'active'`
2. **AC-2.1.2:** Given a user has sent messages before, `isFirstMessage()` returns `false`
3. **AC-2.1.3:** `last_activity_at` is updated on every message (not just first)
4. **AC-2.1.4:** First message detection works for both individual and group messages

### Story 2.2: Conversational First Response

5. **AC-2.2.1:** Response includes user's `push_name` if available ("Oi João!")
6. **AC-2.2.2:** Response acknowledges parseable content contextually
7. **AC-2.2.3:** Response is warm for unparseable content (no error tone)
8. **AC-2.2.4:** Response time is < 3 seconds (NFR1)

### Story 2.3: Guide to First Expense

9. **AC-2.3.1:** Welcome message includes natural language expense example in user's locale
10. **AC-2.3.2:** If first message IS an expense, it's processed and celebrated (no redundant guidance)
11. **AC-2.3.3:** Guidance uses casual register ("você") and max one emoji

### Story 2.4: Preferred Destination Auto-Detection

12. **AC-2.4.1:** Individual chat → `preferred_destination = 'individual'`
13. **AC-2.4.2:** Group chat → `preferred_destination = 'group'` with group JID stored
14. **AC-2.4.3:** Existing preference is NOT auto-overridden on subsequent messages
15. **AC-2.4.4:** Group JIDs are correctly identified (ends with `@g.us`)

### Story 2.5: Magic Moment Tracking

16. **AC-2.5.1:** First NLP-parsed expense sets `magic_moment_at = now()`
17. **AC-2.5.2:** PostHog event `onboarding_magic_moment` fired with timestamp
18. **AC-2.5.3:** Explicit commands (`/add 50 food`) do NOT trigger magic moment
19. **AC-2.5.4:** Subsequent NLP expenses do NOT update timestamp

### Story 2.6: Contextual Hints After Actions

20. **AC-2.6.1:** First expense → hint about custom categories
21. **AC-2.6.2:** 3+ expenses in same category → hint about budget
22. **AC-2.6.3:** Tier 2+ users do NOT receive basic hints
23. **AC-2.6.4:** Users who opted out of tips do NOT receive hints
24. **AC-2.6.5:** Hints are non-blocking (appended to confirmation, not separate message)

---

## Traceability Mapping

| AC | Spec Section | Component/API | Test Approach |
|----|--------------|---------------|---------------|
| AC-2.1.1 - AC-2.1.4 | Data Models, Workflows | `activity-tracker.ts`, `first-message-handler.ts` | Unit: Mock DB, verify record creation |
| AC-2.2.1 - AC-2.2.4 | APIs/Interfaces | `first-message-handler.ts` | Unit: Test response generation |
| AC-2.3.1 - AC-2.3.3 | Workflows | `first-message-handler.ts`, localization | Unit: Verify message content |
| AC-2.4.1 - AC-2.4.4 | Data Models, APIs | `message-router.ts` | Unit: Test JID detection, preference storage |
| AC-2.5.1 - AC-2.5.4 | APIs/Interfaces | `tier-tracker.ts` | Unit: Test magic moment logic |
| AC-2.6.1 - AC-2.6.5 | APIs/Interfaces | `first-message-handler.ts` | Unit: Test hint conditions |

---

## Risks, Assumptions, Open Questions

### Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| **R1:** NLP parsing slow on first message | Low | Medium | Measure response time, optimize if needed |
| **R2:** Group context detection unreliable | Low | Medium | Test with various group types |
| **R3:** Message handler refactoring breaks existing flows | Medium | High | Thorough testing, careful integration |

### Assumptions

| Assumption | Validation |
|------------|------------|
| **A1:** `push_name` available from Baileys message | Verify in existing code |
| **A2:** Group JID format is consistent (`@g.us`) | Verify Baileys documentation |
| **A3:** Existing NLP pipeline returns parseable flag | Check existing code |

### Open Questions

| Question | Status | Resolution |
|----------|--------|------------|
| **Q1:** Should contextual response vary by message type (text, image, etc.)? | Resolved | Text only for MVP; images use existing OCR flow |
| **Q2:** Should first message trigger if user had web activity but no WhatsApp? | Resolved | Yes - first WhatsApp message regardless of web activity |

---

## Test Strategy Summary

### Unit Tests

| Target | Test File | Coverage |
|--------|-----------|----------|
| First message detection | `first-message-handler.test.ts` | New user, returning user, group, individual |
| Contextual response | `first-message-handler.test.ts` | With/without push_name, parseable/unparseable |
| Destination detection | `message-router.test.ts` | Individual, group, existing preference |
| Magic moment | `tier-tracker.test.ts` | NLP vs command, first vs subsequent |
| Contextual hints | `first-message-handler.test.ts` | All hint conditions |

### Integration Tests

| Target | Test File | Coverage |
|--------|-----------|----------|
| Full first message flow | `welcome-flow.test.ts` | End-to-end with mock Baileys |

---

## Implementation Notes

### Existing Code Patterns

Check existing handlers for patterns:
- `handlers/transactions/add-transaction.ts` - Response formatting
- `services/onboarding/greeting-sender.ts` - Welcome message logic
- `utils/user-identifiers.ts` - JID extraction

### Integration Point: message-handler.ts

The first message check should be added early in the message processing flow:

```typescript
// handlers/core/message-handler.ts (existing file)

// Add near the top of processMessage()
const activityResult = await checkAndRecordActivity(userId, context)

if (activityResult.isFirstMessage) {
  return await handleFirstMessage(userId, context)
}

// ... existing NLP pipeline continues
```

### Localization Keys Used

From `localization/pt-br.ts` (Epic 1):
- `engagementFirstMessage(contextualResponse)`
- `engagementFirstExpenseSuccess`
- `engagementGuideToFirstExpense`
- `engagementHintAddCategory`
- `engagementHintSetBudget`

---

_Generated by BMAD Epic Tech Context Workflow_
_Date: 2025-11-21_
_For: Lucas_
_Epic: 2 - Conversation-First Welcome_
