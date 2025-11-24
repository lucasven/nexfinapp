# NexFinApp - Epic Breakdown

**Author:** Lucas
**Date:** 2025-11-21
**Project Level:** Brownfield Enhancement
**Target Scale:** 10,000 users

---

## Overview

This document provides the complete epic and story breakdown for NexFinApp's Smart Onboarding & Engagement System, decomposing the requirements from the [PRD](./prd.md) into implementable stories.

**Living Document Notice:** This is the initial version. It will be updated after UX Design workflow adds interaction details to stories.

**Context Incorporated:**
- ✅ PRD requirements (53 FRs)
- ✅ Architecture technical decisions
- ℹ️ No UX Design (basic structure, can enhance later)

## Epic Summary

| Epic | Title | User Value | FRs Covered |
|------|-------|------------|-------------|
| **1** | Foundation & Message Infrastructure | Enables all subsequent functionality | FR33-FR37 + infrastructure |
| **2** | Conversation-First Welcome | New users experience the "magic" immediately | FR1-FR3, FR9, FR24-FR25, FR39 |
| **3** | Progressive Tier Journey | Users feel accomplishment as they master features | FR4-FR8, FR10, FR38 |
| **4** | Engagement State Machine | Inactive users get respectful goodbye, not spam | FR11-FR19, FR26-FR27, FR40-FR42 |
| **5** | Scheduled Jobs & Weekly Reviews | Active users get celebration; inactive get silence | FR20-FR23, FR44-FR48 |
| **6** | User Preferences & Web Integration | Users control their experience from both channels | FR28-FR32, FR43 |
| **7** | Testing & Quality Assurance | Reliable, bug-free system (indirect user value) | FR49-FR53 |

---

## Functional Requirements Inventory

### Onboarding & Discovery (FR1-FR10)
| FR | Description |
|----|-------------|
| FR1 | System detects first WhatsApp message after account connection |
| FR2 | System responds conversationally to first message before guidance |
| FR3 | System guides toward first expense with natural language example |
| FR4 | System tracks 3-tier onboarding progress (Tier 1, 2, 3) |
| FR5 | System detects tier action completion |
| FR6 | System sends tier completion celebration |
| FR7 | System unlocks next tier guidance after completion |
| FR8 | Users can perform any action regardless of tier (no hard gating) |
| FR9 | System provides contextual hints after relevant actions |
| FR10 | Users can skip onboarding guidance ("stop tips") |

### Engagement State Management (FR11-FR19)
| FR | Description |
|----|-------------|
| FR11 | System maintains 5 engagement states (ACTIVE, GOODBYE_SENT, HELP_FLOW, REMIND_LATER, DORMANT) |
| FR12 | Auto-transition to GOODBYE_SENT after 14 days inactive |
| FR13 | Send self-select goodbye message on state transition |
| FR14 | Process goodbye responses (options 1, 2, 3) |
| FR15 | Response "1" → HELP_FLOW + restart Tier 1 |
| FR16 | Response "2" → REMIND_LATER + 2-week timer |
| FR17 | Response "3" or 48h timeout → DORMANT |
| FR18 | Any message from DORMANT → ACTIVE |
| FR19 | Idempotent scheduler (no duplicate messages) |

### Weekly Engagement (FR20-FR23)
| FR | Description |
|----|-------------|
| FR20 | Track weekly activity (had activity vs. no activity) |
| FR21 | Send weekly review if user had activity |
| FR22 | No weekly review if no activity (silence by design) |
| FR23 | Weekly review celebrates and checks in conversationally |

### Message Destination (FR24-FR27)
| FR | Description |
|----|-------------|
| FR24 | Store preferred destination per user (individual/group) |
| FR25 | Auto-detect preferred destination from first interaction |
| FR26 | Send proactive messages to preferred destination |
| FR27 | Users can change preferred destination via command |

### User Preferences & Opt-Out (FR28-FR32)
| FR | Description |
|----|-------------|
| FR28 | WhatsApp opt-out command ("stop reminders") |
| FR29 | Web settings opt-out toggle |
| FR30 | Sync opt-out between WhatsApp and web |
| FR31 | Respect opt-out for re-engagement, allow onboarding tips |
| FR32 | Users can opt back in via either channel |

### Message Content & Tone (FR33-FR37)
| FR | Description |
|----|-------------|
| FR33 | Follow tone guidelines (curiosity, celebration, dignity, empowerment) |
| FR34 | Never send guilt, pressure, judgment, manipulation |
| FR35 | Appropriate message length by context |
| FR36 | Maximum one emoji per message |
| FR37 | Messages in user's preferred language (pt-BR/en) |

### Analytics & Learning (FR38-FR43)
| FR | Description |
|----|-------------|
| FR38 | Track tier completion events with timestamps |
| FR39 | Track "magic moment" (first NLP-parsed expense) |
| FR40 | Track goodbye response distribution |
| FR41 | Track unprompted returns (3+ days without prompt) |
| FR42 | Track engagement state transitions with timestamps |
| FR43 | Analytics accessible via admin dashboard/queries |

### Scheduler & Background (FR44-FR48)
| FR | Description |
|----|-------------|
| FR44 | Daily evaluation of engagement states |
| FR45 | Process REMIND_LATER reminders after 2 weeks |
| FR46 | Weekly review evaluation (identify users with activity) |
| FR47 | Idempotent scheduler operations |
| FR48 | Scheduler state persisted in database |

### Testing Infrastructure (FR49-FR53)
| FR | Description |
|----|-------------|
| FR49 | E2E testing for WhatsApp flows (mock client) |
| FR50 | Integration tests for 30-day journey scenarios |
| FR51 | Unit tests for scheduler timing logic |
| FR52 | Test coverage for all state transitions |
| FR53 | Idempotency verification tests |

---

## FR Coverage Map

| FR Range | Epic | Coverage Description |
|----------|------|---------------------|
| FR1-FR3 | Epic 2 | First message detection, conversational response, guide to first expense |
| FR4-FR8 | Epic 3 | Tier tracking, completion detection, celebrations, unlocks, no hard gating |
| FR9 | Epic 2 | Contextual hints after actions |
| FR10 | Epic 3 | Skip onboarding command |
| FR11-FR19 | Epic 4 | 5-state engagement machine, transitions, idempotency |
| FR20-FR23 | Epic 5 | Weekly activity tracking, weekly review messages |
| FR24-FR25 | Epic 2 | Preferred destination storage and auto-detection |
| FR26-FR27 | Epic 4 | Message routing to preferred destination, change command |
| FR28-FR32 | Epic 6 | Opt-out via WhatsApp/web, sync, respect, opt-back-in |
| FR33-FR37 | Epic 1 | Tone guidelines, message length, emoji limits, localization |
| FR38 | Epic 3 | Tier completion analytics |
| FR39 | Epic 2 | Magic moment tracking |
| FR40-FR42 | Epic 4 | Goodbye response, unprompted returns, state transition analytics |
| FR43 | Epic 6 | Analytics dashboard access |
| FR44-FR48 | Epic 5 | Daily/weekly jobs, scheduler idempotency, persistence |
| FR49-FR53 | Epic 7 | E2E tests, integration tests, unit tests, coverage |

**Coverage validation:** All 53 FRs mapped to epics. No gaps.

---

## Epic 1: Foundation & Message Infrastructure

**Goal:** Establish the database schema, service structure, and localization messages that enable all engagement functionality.

**FRs Covered:** FR33-FR37 (tone, length, emoji, language) + infrastructure for all other FRs

---

### Story 1.1: Database Schema Migration

**As a** developer,
**I want** the engagement system database schema created,
**So that** all subsequent features have proper data storage.

**Acceptance Criteria:**

**Given** the existing database schema
**When** migration `033_engagement_system.sql` is applied
**Then** the following tables are created:
- `user_engagement_states` with columns: id, user_id, state, last_activity_at, goodbye_sent_at, goodbye_expires_at, remind_at, created_at, updated_at
- `engagement_state_transitions` with columns: id, user_id, from_state, to_state, trigger, metadata, created_at
- `engagement_message_queue` with columns: id, user_id, message_type, message_key, message_params, destination, destination_jid, scheduled_for, sent_at, status, retry_count, error_message, idempotency_key, created_at

**And** the following columns are added to `user_profiles`:
- `preferred_destination` TEXT DEFAULT 'individual'
- `reengagement_opt_out` BOOLEAN DEFAULT false
- `onboarding_tier` INTEGER DEFAULT 0
- `onboarding_tier_progress` JSONB DEFAULT '{}'
- `magic_moment_at` TIMESTAMPTZ

**And** indexes are created for efficient scheduler queries
**And** RLS policies enforce user-level access control

**Prerequisites:** None (first story)

**Technical Notes:**
- Migration file: `fe/scripts/033_engagement_system.sql`
- CHECK constraints on state, message_type, status, destination columns
- UNIQUE constraint on idempotency_key
- See Architecture doc for full schema

---

### Story 1.2: Engagement Handler Directory Structure

**As a** developer,
**I want** the engagement handler directory structure created,
**So that** handler implementations have a consistent home.

**Acceptance Criteria:**

**Given** the existing `whatsapp-bot/src/handlers/` directory
**When** the engagement handler structure is created
**Then** the following files exist:
- `handlers/engagement/index.ts` (exports all handlers)
- `handlers/engagement/goodbye-handler.ts` (placeholder)
- `handlers/engagement/first-message-handler.ts` (placeholder)
- `handlers/engagement/tier-progress-handler.ts` (placeholder)
- `handlers/engagement/opt-out-handler.ts` (placeholder)

**And** all files pass TypeScript compilation

**Prerequisites:** None

**Technical Notes:**
- Follow existing handler patterns from `handlers/transactions/`
- Use kebab-case files, camelCase exports

---

### Story 1.3: Engagement Service Directory Structure

**As a** developer,
**I want** the engagement and scheduler service directories created with types,
**So that** service implementations have proper structure and type safety.

**Acceptance Criteria:**

**Given** the existing `whatsapp-bot/src/services/` directory
**When** the engagement service structure is created
**Then** the following files exist:
- `services/engagement/index.ts`, `state-machine.ts`, `activity-tracker.ts`, `message-router.ts`, `constants.ts`, `types.ts`
- `services/scheduler/index.ts`, `daily-engagement-job.ts`, `weekly-review-job.ts`, `message-sender.ts`

**And** `types.ts` defines: `EngagementState`, `TransitionTrigger`, `MessageType`, `TierProgress`
**And** `constants.ts` defines: `INACTIVITY_THRESHOLD_DAYS: 14`, `GOODBYE_TIMEOUT_HOURS: 48`, `REMIND_LATER_DAYS: 14`, tier action arrays

**Prerequisites:** Story 1.1 (types reference DB schema)

**Technical Notes:**
- Constants align with PRD specifications
- Types align with architecture document

---

### Story 1.4: Engagement Localization - Portuguese (pt-BR)

**As a** user who speaks Portuguese,
**I want** all engagement messages in natural Brazilian Portuguese,
**So that** the bot feels like a supportive friend, not a robot.

**Acceptance Criteria:**

**Given** the existing `localization/pt-br.ts` file
**When** engagement messages are added
**Then** message categories exist for: welcome, tier unlocks, goodbye/self-select, weekly review, opt-out

**And** all messages follow tone guidelines:
- Use curiosity, celebration, dignity, empowerment
- NO guilt, pressure, judgment, manipulation
- Maximum ONE emoji per message
- Casual register ("você" not "o senhor")

**Prerequisites:** Story 1.3 (message types defined)

**Technical Notes:**
- Reference PRD "Critical Interaction Flows" for exact copy
- Support variable interpolation: `{user_name}`, `{expense_amount}`, `{category}`

---

### Story 1.5: Engagement Localization - English

**As a** user who speaks English,
**I want** all engagement messages in natural English,
**So that** I receive the same supportive experience as Portuguese users.

**Acceptance Criteria:**

**Given** the existing `localization/en.ts` file
**When** engagement messages are added
**Then** all message keys from Story 1.4 have English equivalents
**And** messages are natural English (not direct translations)
**And** tone guidelines are followed

**Prerequisites:** Story 1.4 (pt-BR defines all keys)

**Technical Notes:**
- Adapt idioms appropriately

---

### Story 1.6: Message Queue Service Foundation

**As a** system,
**I want** a message queue service for proactive messages,
**So that** messages have retry capability, audit trail, and idempotency.

**Acceptance Criteria:**

**Given** the `engagement_message_queue` table exists
**When** `queueMessage()` is called with valid params
**Then** a queue entry is created with `status = 'pending'`, `retry_count = 0`, unique `idempotency_key`

**And** duplicate idempotency_keys are silently ignored (upsert)

**Given** `getIdempotencyKey(userId, eventType, date)` is called
**Then** returns format: `{userId}:{eventType}:{YYYY-MM-DD}`

**Given** a message fails to send
**When** retry logic executes
**Then** `retry_count` increments, and after 3 failures status becomes 'failed'

**Prerequisites:** Story 1.1 (database), Story 1.3 (types)

**Technical Notes:**
- Exponential backoff: 1s, 2s, 4s
- `processMessageQueue()` completed in Epic 5

---

## Epic 2: Conversation-First Welcome

**Goal:** New users experience the conversational "magic" immediately upon first WhatsApp interaction—proving NexFinApp is different.

**FRs Covered:** FR1, FR2, FR3, FR9, FR24, FR25, FR39

---

### Story 2.1: First Message Detection

**As a** system,
**I want** to detect when a user sends their first WhatsApp message after account connection,
**So that** I can trigger the special welcome flow.

**Acceptance Criteria:**

**Given** a user has connected their WhatsApp and never sent a message before
**When** they send any message
**Then** `is_first_message = true` and a new `user_engagement_states` record is created

**Given** a user has previously sent messages
**When** they send another message
**Then** `is_first_message = false`

**Prerequisites:** Epic 1 complete

**Technical Notes:**
- Check `user_engagement_states` for existing record
- Location: `handlers/engagement/first-message-handler.ts`

---

### Story 2.2: Conversational First Response

**As a** new user,
**I want** the bot to respond conversationally to whatever I said,
**So that** I feel heard before receiving onboarding instructions.

**Acceptance Criteria:**

**Given** a user sends their first message with parseable content
**When** the first-message handler processes it
**Then** the response acknowledges their message contextually before guiding
**And** includes user's name if available from `push_name`

**Given** unparseable content
**When** processed
**Then** response is warm and gently guides toward an example

**Example:** User: "oi" → Bot: "Oi {name}! Que bom ter você aqui 😊 Experimenta mandar algo tipo 'gastei 50 no almoço'..."

**Prerequisites:** Story 2.1, Story 1.4

**Technical Notes:**
- Response time target: < 3 seconds (NFR1)

---

### Story 2.3: Guide to First Expense

**As a** new user,
**I want** to be guided toward logging my first expense with a natural example,
**So that** I understand the conversational interface.

**Acceptance Criteria:**

**Given** welcome message sent and no expense logged yet
**When** welcome flow completes
**Then** message includes natural language example in user's locale

**Given** first message IS an expense
**When** processed
**Then** expense logged, celebration sent, no redundant guidance

**Prerequisites:** Story 2.2

**Technical Notes:**
- Integrate with existing transaction handlers
- Conditional guidance based on what user accomplished

---

### Story 2.4: Preferred Destination Auto-Detection

**As a** user who interacts via WhatsApp group,
**I want** the system to remember my preferred context,
**So that** all bot messages come to the right place.

**Acceptance Criteria:**

**Given** first message from individual chat
**When** processed
**Then** `preferred_destination = 'individual'`

**Given** first message from group chat
**When** processed
**Then** `preferred_destination = 'group'` and group JID stored

**Given** existing preferred_destination
**When** message from different context
**Then** preference NOT auto-changed (requires explicit command)

**Prerequisites:** Story 2.1, Story 1.1

**Technical Notes:**
- Group JIDs end with `@g.us`
- 66% of users use groups (per PRD)

---

### Story 2.5: Magic Moment Tracking

**As a** product team,
**I want** to track when users experience their first successful NLP-parsed expense,
**So that** we can measure onboarding effectiveness.

**Acceptance Criteria:**

**Given** user has never logged an NLP expense
**When** they successfully log one via natural language
**Then** `magic_moment_at = now()` and PostHog event `onboarding_magic_moment` fired

**Given** user already has magic_moment_at set
**When** they log another NLP expense
**Then** timestamp NOT updated, no duplicate event

**Given** expense logged via explicit command
**Then** does NOT count as magic moment

**Prerequisites:** Story 2.3

**Technical Notes:**
- Distinguish NLP path vs explicit command path

---

### Story 2.6: Contextual Hints After Actions

**As a** new user,
**I want** to receive relevant suggestions after I complete actions,
**So that** I discover features naturally.

**Acceptance Criteria:**

**Given** user logged first expense
**When** confirmation sent
**Then** contextual hint included: "Quer criar categorias personalizadas?"

**Given** user logged 3+ expenses in same category
**When** third confirmed
**Then** budget hint included

**Given** user opted out of tips OR is Tier 2+
**When** action completed
**Then** no hints sent

**Prerequisites:** Story 2.5, Story 1.4

**Technical Notes:**
- Check `onboarding_tier` to avoid regressive hints
- Hints are non-blocking

---

## Epic 3: Progressive Tier Journey

**Goal:** Users feel accomplishment as they master features through a 3-tier progressive disclosure system.

**FRs Covered:** FR4, FR5, FR6, FR7, FR8, FR10, FR38

---

### Story 3.1: Tier Progress Tracking Service

**As a** system,
**I want** a service to track user progress through onboarding tiers,
**So that** I can detect completions and send appropriate messages.

**Acceptance Criteria:**

**Given** a user completes an action
**When** `recordAction(userId, actionName)` is called
**Then** `onboarding_tier_progress` JSONB is updated atomically

**Given** all actions in a tier are complete
**When** `checkTierCompletion()` is called
**Then** returns `true` and sets `tier.completed_at`

**Prerequisites:** Epic 1, Epic 2

**Technical Notes:**
- Location: `services/onboarding/tier-tracker.ts`
- Tier 1: add_expense, edit_category, delete_expense, add_category
- Tier 2: set_budget, add_recurring, list_categories
- Tier 3: edit_category, view_report

---

### Story 3.2: Tier Action Detection Hooks

**As a** system,
**I want** existing handlers to report tier-relevant actions,
**So that** tier progress is tracked automatically.

**Acceptance Criteria:**

**Given** user performs any tier-tracked action (add expense, set budget, view report, etc.)
**When** handler completes successfully
**Then** `recordAction()` is called with appropriate action name

**Prerequisites:** Story 3.1

**Technical Notes:**
- Add hook calls to: transactions/, categories/, budgets/, recurring/, reports/
- Non-blocking: tier tracking shouldn't slow primary actions

---

### Story 3.3: Tier Completion Detection & Celebrations

**As a** user,
**I want** to receive a celebration message when I complete a tier,
**So that** I feel accomplished and motivated.

**Acceptance Criteria:**

**Given** user completes last Tier 1 action
**When** completion detected
**Then** celebration + Tier 2 guidance sent, `onboarding_tier = 1`

**Given** user completes last Tier 2 action
**Then** celebration + Tier 3 guidance sent, `onboarding_tier = 2`

**Given** user completes last Tier 3 action
**Then** final "pro" celebration sent, `onboarding_tier = 3`

**Given** user opted out of tips
**Then** NO celebration sent, but progress still tracked

**Prerequisites:** Story 3.2, Story 1.4

**Technical Notes:**
- Queue via message queue service
- One emoji max in celebration

---

### Story 3.4: No Hard Gating Policy

**As a** user,
**I want** to perform any action at any time regardless of tier,
**So that** I'm not blocked from features I need.

**Acceptance Criteria:**

**Given** Tier 0 user wants to perform Tier 2/3 action
**When** they attempt it
**Then** action succeeds, progress recorded, no blocking

**Given** actions completed out of order
**When** tiers evaluated
**Then** each tier celebrates independently when complete

**Prerequisites:** Story 3.3

**Technical Notes:**
- No conditional checks blocking actions based on tier
- Tier tracking is informational, not gatekeeping

---

### Story 3.5: Skip Onboarding Command

**As a** user,
**I want** to stop receiving onboarding tips,
**So that** I can use the app without tutorial interruptions.

**Acceptance Criteria:**

**Given** user sends "parar dicas" or "stop tips"
**When** processed
**Then** tips disabled, confirmation sent

**Given** tips disabled
**When** tier actions completed
**Then** NO celebrations/hints, progress tracked silently

**Given** user sends "ativar dicas" or "enable tips"
**Then** tips re-enabled

**Prerequisites:** Story 1.4, Story 1.3

**Technical Notes:**
- Distinct from re-engagement opt-out (this is tips only)
- Handler: `handlers/engagement/opt-out-handler.ts`

---

### Story 3.6: Tier Completion Analytics

**As a** product team,
**I want** tier completion events tracked with timestamps,
**So that** I can measure onboarding funnel effectiveness.

**Acceptance Criteria:**

**Given** tier completion
**When** recorded
**Then** PostHog event `onboarding_tier_completed` fired with tier, time_to_complete, days_since_signup

**Given** analytics query
**Then** can calculate T1→T2 conversion, T2→T3 conversion, avg time per tier

**Prerequisites:** Story 3.3

**Technical Notes:**
- Store `completed_at` in JSONB per tier
- Aligns with PRD success metrics

---

## Epic 4: Engagement State Machine

**Goal:** Inactive users receive respectful re-engagement—a dignified goodbye with options, not spam.

**FRs Covered:** FR11-FR19, FR26-FR27, FR40-FR42

---

### Story 4.1: State Machine Service Core

**As a** system,
**I want** a state machine service with validated transitions,
**So that** engagement states change predictably and correctly.

**Acceptance Criteria:**

**Given** the 5 valid states and transition triggers
**When** `transitionState(userId, trigger)` is called
**Then** only valid transitions execute per the architecture transition map
**And** invalid transitions are logged and rejected
**And** transition record created in `engagement_state_transitions`

**Prerequisites:** Epic 1

**Technical Notes:**
- Location: `services/engagement/state-machine.ts`
- All state changes go through this service—never update DB directly

---

### Story 4.2: Activity Tracking & Auto-Reactivation

**As a** system,
**I want** to track user activity and auto-reactivate dormant users,
**So that** any user message immediately brings them back to active.

**Acceptance Criteria:**

**Given** any user sends a message
**When** processed
**Then** `last_activity_at = now()` updated

**Given** user in `dormant` or `goodbye_sent` sends non-response message
**When** activity tracked
**Then** auto-transition to `active`

**Prerequisites:** Story 4.1, Epic 2

**Technical Notes:**
- Location: `services/engagement/activity-tracker.ts`
- Must be fast—runs on every message

---

### Story 4.3: Self-Select Goodbye Message

**As a** user who has been inactive,
**I want** a respectful goodbye message with options,
**So that** I can choose how to proceed without pressure.

**Acceptance Criteria:**

**Given** user transitions to `goodbye_sent`
**When** transition completes
**Then** goodbye message queued with 3 options (confused/busy/all good)
**And** `goodbye_sent_at = now()`, `goodbye_expires_at = now() + 48h`
**And** routed to preferred destination

**Given** goodbye already sent this period
**Then** duplicate NOT sent (idempotency)

**Prerequisites:** Story 4.1, Story 1.4, Story 1.6

**Technical Notes:**
- Idempotency key: `{userId}:goodbye_sent:{date}`
- Tone: dignity, no guilt

---

### Story 4.4: Goodbye Response Processing

**As a** user who received a goodbye message,
**I want** my response processed correctly,
**So that** the system respects my choice.

**Acceptance Criteria:**

**Given** response "1" (confused)
**Then** → `help_flow` → help message → restart Tier 1 hints → `active`

**Given** response "2" (busy)
**Then** → `remind_later`, `remind_at = now() + 14 days`, confirmation sent

**Given** response "3" (all good)
**Then** → `dormant`, confirmation sent

**Given** other response
**Then** → `active`, process normally

**Prerequisites:** Story 4.3, Story 4.1

**Technical Notes:**
- Handler: `handlers/engagement/goodbye-handler.ts`
- Simple regex matching (no NLP needed)

---

### Story 4.5: 48h Timeout to Dormant

**As a** system,
**I want** auto-transition to dormant after 48h no response,
**So that** we stop waiting and respect implicit choice.

**Acceptance Criteria:**

**Given** `goodbye_sent` state and `goodbye_expires_at < now()`
**When** daily scheduler checks
**Then** transition to `dormant` (trigger: `goodbye_timeout`)
**And** NO message sent (silence is design)

**Prerequisites:** Story 4.4, Story 4.1

**Technical Notes:**
- Logic in `services/scheduler/daily-engagement-job.ts`
- Precision not critical (48h vs 49h acceptable)

---

### Story 4.6: Message Routing Service

**As a** system,
**I want** proactive messages routed to preferred destination,
**So that** messages arrive where users expect.

**Acceptance Criteria:**

**Given** `preferred_destination = 'individual'`
**Then** proactive messages go to individual JID

**Given** `preferred_destination = 'group'`
**Then** proactive messages go to stored group JID

**Given** user sends "mudar para grupo/individual" or "switch to group/individual"
**Then** preference updated, confirmation sent

**Prerequisites:** Story 2.4, Story 1.6

**Technical Notes:**
- Location: `services/engagement/message-router.ts`

---

### Story 4.7: State Transition Logging & Analytics

**As a** product team,
**I want** all state transitions logged with context,
**So that** I can analyze engagement patterns.

**Acceptance Criteria:**

**Given** any state transition
**When** completed
**Then** record in `engagement_state_transitions` with from_state, to_state, trigger, metadata
**And** PostHog event `engagement_state_changed` fired

**Given** dormant via goodbye response
**Then** `metadata.response_type` tracks confused/busy/all_good/timeout (FR40)

**Given** dormant user returns after 3+ days unprompted
**Then** `metadata.unprompted_return = true` (FR41)

**Prerequisites:** Story 4.1

**Technical Notes:**
- All analytics derive from transition logs
- DB for historical, PostHog for real-time

---

## Epic 5: Scheduled Jobs & Weekly Reviews

**Goal:** Active users get timely celebration; inactive users get silence. Reliable, idempotent background processing.

**FRs Covered:** FR20-FR23, FR44-FR48

---

### Story 5.1: Daily Engagement Job

**As a** system,
**I want** a daily job evaluating all user engagement states,
**So that** inactive users receive goodbyes and timeouts are processed.

**Acceptance Criteria:**

**Given** daily job runs (6 AM UTC)
**When** evaluating users
**Then** performs:
- Check 1: 14-day inactive `active` users → `goodbye_sent` + queue message
- Check 2: Expired `goodbye_sent` (48h) → `dormant` (no message)
- Check 3: Due `remind_later` → `dormant` (no message)

**Given** job runs multiple times
**Then** no duplicate transitions/messages (idempotent)

**Prerequisites:** Epic 4, Story 1.6

**Technical Notes:**
- Location: `services/scheduler/daily-engagement-job.ts`
- Target: < 60 seconds for full user base

---

### Story 5.2: Weekly Activity Detection

**As a** system,
**I want** to detect which users had activity last week,
**So that** only active users receive weekly reviews.

**Acceptance Criteria:**

**Given** `getActiveUsersLastWeek()` called
**Then** returns users with transactions OR bot interactions in past 7 days

**Given** no activity, opt-out, or dormant state
**Then** user excluded from weekly review list

**Prerequisites:** Story 5.1

**Technical Notes:**
- Query `transactions` + `last_activity_at`
- Efficient indexed queries

---

### Story 5.3: Weekly Review Job & Message

**As an** active user,
**I want** a weekly celebration message,
**So that** I feel acknowledged for tracking expenses.

**Acceptance Criteria:**

**Given** weekly job runs (9 AM UTC Monday)
**When** user had activity last week
**Then** weekly review message queued

**Given** no activity last week
**Then** NO message (silence is design)

**Given** review already sent this week
**Then** duplicate NOT sent (idempotency)

**Prerequisites:** Story 5.2, Story 1.4

**Technical Notes:**
- Idempotency key: `{userId}:weekly_review:{week_start}`
- Tone: celebration, not pressure

---

### Story 5.4: Message Queue Processor

**As a** system,
**I want** to process queued messages via WhatsApp,
**So that** proactive messages reach users.

**Acceptance Criteria:**

**Given** pending messages in queue
**When** `processMessageQueue()` runs
**Then** each sent via Baileys, marked `sent`

**Given** send fails
**Then** `retry_count++`, stays `pending`

**Given** `retry_count >= 3`
**Then** `status = 'failed'`

**Given** multiple messages
**Then** 500ms delay between (rate limiting)

**Prerequisites:** Story 1.6, Story 4.6

**Technical Notes:**
- Exponential backoff: 1s, 2s, 4s
- NFR5: Max 3 retries

---

### Story 5.5: Railway Cron Integration

**As a** system,
**I want** jobs configured in Railway cron,
**So that** they run reliably.

**Acceptance Criteria:**

**Given** Railway deployment
**Then** cron jobs configured:
- Daily: `0 6 * * *` → `run-engagement-daily.js`
- Weekly: `0 9 * * 1` → `run-engagement-weekly.js`

**Given** job completes
**Then** exit 0 on success, non-zero on failure, structured logs

**Prerequisites:** Story 5.1, Story 5.3, Story 5.4

**Technical Notes:**
- Add to `railway.cron.yml`
- NFR4: 99.9% success rate

---

### Story 5.6: Scheduler Idempotency Guarantees

**As a** system operator,
**I want** scheduler operations safely re-runnable,
**So that** re-runs don't cause duplicates.

**Acceptance Criteria:**

**Given** goodbye/review already sent
**When** job re-runs
**Then** no duplicate (idempotency key)

**Given** service restarts mid-job
**When** re-runs
**Then** already-processed skipped, partial completes

**Prerequisites:** All Epic 5 stories

**Technical Notes:**
- Multi-level idempotency: state machine, message queue keys, timestamps
- NFR7: No duplicate messages ever

---

## Epic 6: User Preferences & Web Integration

**Goal:** Users control notification preferences from both WhatsApp and web, with seamless sync.

**FRs Covered:** FR28-FR32, FR43

---

### Story 6.1: WhatsApp Opt-Out/Opt-In Commands

**As a** user,
**I want** to control re-engagement messages via WhatsApp commands,
**So that** I can opt out without opening the web app.

**Acceptance Criteria:**

**Given** "parar lembretes" or "stop reminders"
**When** processed
**Then** `reengagement_opt_out = true`, confirmation sent

**Given** "ativar lembretes" or "start reminders"
**When** processed
**Then** `reengagement_opt_out = false`, confirmation sent

**Given** variations in phrasing
**Then** intent recognized (generous matching)

**Prerequisites:** Story 1.3, Story 1.4

**Technical Notes:**
- Handler: `handlers/engagement/opt-out-handler.ts`
- Distinct from "stop tips" (Story 3.5)

---

### Story 6.2: Web Settings Opt-Out Toggle

**As a** user,
**I want** to control re-engagement from web settings,
**So that** I can manage preferences without WhatsApp.

**Acceptance Criteria:**

**Given** user on `/[locale]/settings`
**Then** "Notification Preferences" section visible with toggle

**Given** toggle changed
**When** clicked
**Then** server action updates preference, UI shows success

**Prerequisites:** Story 1.1

**Technical Notes:**
- Component: `fe/components/settings/notification-preferences.tsx`
- Server action: `fe/lib/actions/engagement.ts`

---

### Story 6.3: Cross-Channel Preference Sync

**As a** user,
**I want** opt-out preference synced between channels,
**So that** my choice is respected everywhere.

**Acceptance Criteria:**

**Given** opt-out via WhatsApp
**When** checking web within 5 seconds
**Then** toggle shows opted-out

**Given** opt-out via web
**When** scheduler runs
**Then** opt-out respected

**Prerequisites:** Story 6.1, Story 6.2

**Technical Notes:**
- Single source of truth: `user_profiles.reengagement_opt_out`
- NFR10: < 5s sync (achieved via shared DB)

---

### Story 6.4: Opt-Out Respect in Engagement System

**As a** user who opted out,
**I want** the system to respect my preference,
**So that** I don't receive unwanted messages.

**Acceptance Criteria:**

**Given** `reengagement_opt_out = true`
**When** daily scheduler evaluates
**Then** user SKIPPED (no goodbye)

**Given** opted out
**When** weekly review runs
**Then** user SKIPPED

**Given** opted out of re-engagement only
**When** tier action completed
**Then** onboarding tips STILL sent (different preference)

**Prerequisites:** Story 6.3, Epic 5

**Technical Notes:**
- Check opt-out in scheduler jobs
- LGPD compliance: easy opt-out mandatory

---

### Story 6.5: Analytics Dashboard Access

**As a** product team,
**I want** engagement analytics accessible,
**So that** I can measure system effectiveness.

**Acceptance Criteria:**

**Given** engagement system running
**Then** accessible via:
- PostHog: state_changed, tier_completed, magic_moment, goodbye_response events
- Database queries: response distribution, tier conversion, unprompted returns

**Prerequisites:** Story 4.7, Story 3.6

**Technical Notes:**
- No new UI for MVP (queries + PostHog)
- All data captured by previous stories

---

## Epic 7: Testing & Quality Assurance

**Goal:** Comprehensive test coverage ensuring reliability, with focus on scheduler timing and idempotency.

**FRs Covered:** FR49-FR53

---

### Story 7.1: E2E Testing Framework Setup

**As a** developer,
**I want** an E2E testing framework for WhatsApp bot flows,
**So that** I can test without real WhatsApp connection.

**Acceptance Criteria:**

**Given** test framework set up
**Then** Baileys mocked to simulate incoming/outgoing messages

**Given** test utilities
**Then** helpers available: `createMockUser()`, `mockIncomingMessage()`, `getQueuedMessages()`, `advanceTime()`

**Given** CI run
**Then** all tests pass without external dependencies

**Prerequisites:** Epic 1

**Technical Notes:**
- Location: `__tests__/engagement/`
- ADR-004: Jest + mocks covers 95% of logic

---

### Story 7.2: State Machine Unit Tests

**As a** developer,
**I want** comprehensive unit tests for state machine,
**So that** I can trust transitions work correctly.

**Acceptance Criteria:**

**Given** state machine tests
**Then** coverage includes:
- All 10 valid transitions
- Invalid transitions rejected
- Edge cases (already in state, rapid transitions, missing user)

**Prerequisites:** Story 4.1

**Technical Notes:**
- Location: `__tests__/engagement/state-machine.test.ts`
- FR52: Test coverage for all state transitions

---

### Story 7.3: Scheduler Unit Tests

**As a** developer,
**I want** unit tests for scheduler timing logic,
**So that** I can trust jobs run correctly.

**Acceptance Criteria:**

**Given** daily job tests
**Then** coverage: 13-day (no action), 14-day (action), 15-day (no duplicate), opted-out (skip)

**Given** timeout tests
**Then** coverage: 47h (no action), 48h+ (dormant)

**Given** weekly job tests
**Then** coverage: with activity (send), no activity (skip), opted out (skip), dormant (skip)

**Prerequisites:** Story 5.1, Story 5.3

**Technical Notes:**
- Location: `__tests__/engagement/daily-job.test.ts`, `weekly-job.test.ts`
- FR51: Unit tests for scheduler timing logic

---

### Story 7.4: Goodbye Handler Tests

**As a** developer,
**I want** tests for goodbye response parsing,
**So that** responses are correctly interpreted.

**Acceptance Criteria:**

**Given** goodbye handler tests
**Then** coverage:
- Exact matches: "1", "2", "3"
- Emoji: "1️⃣", "2️⃣", "3️⃣"
- Keywords pt-BR: "confuso", "ocupado", "tudo certo"
- Keywords en: "confused", "busy", "all good"
- Non-responses → active

**Prerequisites:** Story 4.4

**Technical Notes:**
- Location: `__tests__/engagement/goodbye-handler.test.ts`

---

### Story 7.5: 30-Day Journey Integration Test

**As a** developer,
**I want** integration test simulating full 30-day journey,
**So that** complete lifecycle is verified.

**Acceptance Criteria:**

**Given** 30-day journey test
**Then** simulates 5 scenarios:
1. Happy path (active user through all tiers)
2. Inactive → Goodbye → Help (response "1")
3. Inactive → Goodbye → Remind Later (response "2")
4. Inactive → Goodbye → Dormant (timeout)
5. Opt-out user (no proactive messages)

**Prerequisites:** All previous epics

**Technical Notes:**
- Location: `__tests__/engagement/30-day-journey.test.ts`
- FR50: Integration tests for 30-day journey scenarios
- Critical integration test

---

### Story 7.6: Idempotency Verification Tests

**As a** developer,
**I want** tests verifying idempotency guarantees,
**So that** re-runs never cause duplicates.

**Acceptance Criteria:**

**Given** idempotency tests
**Then** coverage:
- Scheduler: daily/weekly twice → no duplicates
- Message queue: same key → one entry
- State machine: same transition twice → no error
- Database: upsert behavior

**Given** tests pass
**Then** NFR7 (no duplicates ever) verified

**Prerequisites:** Story 5.6

**Technical Notes:**
- Location: `__tests__/engagement/idempotency.test.ts`
- FR53: Idempotency verification tests

---

## FR Coverage Matrix

| FR | Description | Epic | Story |
|----|-------------|------|-------|
| FR1 | Detect first WhatsApp message | Epic 2 | 2.1 |
| FR2 | Respond conversationally to first message | Epic 2 | 2.2 |
| FR3 | Guide toward first expense | Epic 2 | 2.3 |
| FR4 | Track 3-tier onboarding progress | Epic 3 | 3.1 |
| FR5 | Detect tier action completion | Epic 3 | 3.2 |
| FR6 | Send tier completion celebration | Epic 3 | 3.3 |
| FR7 | Unlock next tier guidance | Epic 3 | 3.3 |
| FR8 | No hard gating on actions | Epic 3 | 3.4 |
| FR9 | Contextual hints after actions | Epic 2 | 2.6 |
| FR10 | Skip onboarding command | Epic 3 | 3.5 |
| FR11 | Maintain 5 engagement states | Epic 4 | 4.1 |
| FR12 | Auto-transition after 14 days | Epic 4 | 4.1, 5.1 |
| FR13 | Send self-select goodbye | Epic 4 | 4.3 |
| FR14 | Process goodbye responses | Epic 4 | 4.4 |
| FR15 | Response "1" → help flow | Epic 4 | 4.4 |
| FR16 | Response "2" → remind later | Epic 4 | 4.4 |
| FR17 | Response "3" / timeout → dormant | Epic 4 | 4.4, 4.5 |
| FR18 | Any message from dormant → active | Epic 4 | 4.2 |
| FR19 | Idempotent scheduler | Epic 5 | 5.6 |
| FR20 | Track weekly activity | Epic 5 | 5.2 |
| FR21 | Send weekly review if active | Epic 5 | 5.3 |
| FR22 | No weekly review if inactive | Epic 5 | 5.3 |
| FR23 | Weekly review tone | Epic 5 | 5.3 |
| FR24 | Store preferred destination | Epic 2 | 2.4 |
| FR25 | Auto-detect destination | Epic 2 | 2.4 |
| FR26 | Route to preferred destination | Epic 4 | 4.6 |
| FR27 | Change destination command | Epic 4 | 4.6 |
| FR28 | WhatsApp opt-out command | Epic 6 | 6.1 |
| FR29 | Web opt-out toggle | Epic 6 | 6.2 |
| FR30 | Sync opt-out between channels | Epic 6 | 6.3 |
| FR31 | Respect opt-out for re-engagement | Epic 6 | 6.4 |
| FR32 | Opt back in | Epic 6 | 6.1 |
| FR33 | Tone guidelines | Epic 1 | 1.4, 1.5 |
| FR34 | No guilt/pressure messaging | Epic 1 | 1.4, 1.5 |
| FR35 | Appropriate message length | Epic 1 | 1.4, 1.5 |
| FR36 | Max one emoji per message | Epic 1 | 1.4, 1.5 |
| FR37 | User's preferred language | Epic 1 | 1.4, 1.5 |
| FR38 | Track tier completion events | Epic 3 | 3.6 |
| FR39 | Track magic moment | Epic 2 | 2.5 |
| FR40 | Track goodbye response distribution | Epic 4 | 4.7 |
| FR41 | Track unprompted returns | Epic 4 | 4.7 |
| FR42 | Track state transitions | Epic 4 | 4.7 |
| FR43 | Analytics dashboard access | Epic 6 | 6.5 |
| FR44 | Daily engagement evaluation | Epic 5 | 5.1 |
| FR45 | Process reminders | Epic 5 | 5.1 |
| FR46 | Weekly review evaluation | Epic 5 | 5.3 |
| FR47 | Idempotent operations | Epic 5 | 5.6 |
| FR48 | Scheduler state persistence | Epic 5 | 5.1 |
| FR49 | E2E testing for WhatsApp | Epic 7 | 7.1 |
| FR50 | 30-day journey tests | Epic 7 | 7.5 |
| FR51 | Scheduler unit tests | Epic 7 | 7.3 |
| FR52 | State transition coverage | Epic 7 | 7.2 |
| FR53 | Idempotency tests | Epic 7 | 7.6 |

**Coverage validation:** All 53 FRs mapped to specific stories. No gaps.

---

## Summary

### Epic Breakdown Overview

| Epic | Title | Stories | FRs |
|------|-------|---------|-----|
| 1 | Foundation & Message Infrastructure | 6 | FR33-37 |
| 2 | Conversation-First Welcome | 6 | FR1-3, 9, 24-25, 39 |
| 3 | Progressive Tier Journey | 6 | FR4-8, 10, 38 |
| 4 | Engagement State Machine | 7 | FR11-19, 26-27, 40-42 |
| 5 | Scheduled Jobs & Weekly Reviews | 6 | FR20-23, 44-48 |
| 6 | User Preferences & Web Integration | 5 | FR28-32, 43 |
| 7 | Testing & Quality Assurance | 6 | FR49-53 |
| **Total** | | **42 stories** | **53 FRs** |

### Implementation Sequence

```
Epic 1 (Foundation) ─────────────────────────────────────────────────────────┐
    │                                                                        │
    ├──→ Epic 2 (Welcome) ──→ Epic 3 (Tiers) ──┐                            │
    │                                           │                            │
    └──→ Epic 4 (State Machine) ←───────────────┘                            │
              │                                                              │
              ├──→ Epic 5 (Scheduler) ──→ Epic 6 (Preferences)               │
              │                                                              │
              └──────────────────────────────────────────→ Epic 7 (Testing) ←┘
```

### Key Deliverables

**User-Facing:**
- Conversation-first welcome with magic moment
- 3-tier progressive onboarding with celebrations
- Respectful self-select goodbye (never spam)
- Weekly celebration for active users
- Dual-channel preference control

**System:**
- 5-state engagement machine
- Idempotent scheduler with daily/weekly jobs
- Message queue with retry capability
- Comprehensive analytics tracking

**Quality:**
- E2E test framework with mocked Baileys
- 30-day journey integration tests
- Idempotency verification tests

---

_Generated by BMAD Epic & Story Decomposition Workflow_
_Date: 2025-11-21_
_For: Lucas_
_Project: NexFinApp Smart Onboarding & Engagement System_
