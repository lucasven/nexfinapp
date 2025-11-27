# Epic Technical Specification: User Preferences & Web Integration

Date: 2025-11-24
Author: Lucas (with Bob, Scrum Master)
Epic ID: epic-6
Status: Ready

---

## Overview

Epic 6 implements dual-channel user preference control for the NexFinApp engagement system, enabling users to manage re-engagement notifications from both WhatsApp and the web interface. This epic closes the loop on user autonomy by providing seamless opt-out/opt-in capabilities with near-instant synchronization across channels.

The core value proposition: **Users control the conversation on their terms, from any channel, without friction.** This respects LGPD requirements while maintaining the "comfort over pressure" philosophy established in Epics 1-5.

## Objectives and Scope

### In Scope

**WhatsApp Channel:**
- Natural language opt-out/opt-in commands ("stop reminders", "start reminders")
- Generous intent matching for variations in phrasing
- Confirmation messages in user's locale (pt-BR/en)
- Distinction between re-engagement opt-out and onboarding tips opt-out

**Web Channel:**
- Notification Preferences Card in Account Settings page
- Switch component for re-engagement message toggle
- Optimistic UI with error handling
- Visual distinction between re-engagement and onboarding tip controls

**Cross-Channel Synchronization:**
- Single source of truth: `user_profiles.reengagement_opt_out`
- < 5 second sync latency (NFR10 from PRD)
- Scheduler respects opt-out state before queuing messages

**Analytics:**
- Track opt-out/opt-in events with channel metadata
- Dashboard access to preference distribution metrics

### Out of Scope

- Per-WhatsApp-number notification silencing (Growth Feature per PRD)
- Granular notification type controls (weekly review vs goodbye separate toggles)
- Email notification preferences (no email channel in MVP)
- Push notification settings (no push in MVP)

## System Architecture Alignment

This epic integrates with the existing architecture established in Epics 1-5:

**Backend (WhatsApp Bot):**
- Extends `handlers/engagement/opt-out-handler.ts` (created in Epic 1, skeleton only)
- Uses existing localization system (`localization/pt-br.ts`, `localization/en.ts`)
- Integrates with engagement state machine from Epic 4
- Scheduler from Epic 5 reads `reengagement_opt_out` before queuing messages

**Frontend (Next.js Web App):**
- New card in existing `/[locale]/settings/account` page
- New Radix UI Switch component (`components/ui/switch.tsx`)
- New server action in `lib/actions/engagement.ts`
- Uses existing Supabase client patterns for data access

**Database:**
- Uses `user_profiles.reengagement_opt_out` column (added in Epic 1, Story 1.1)
- No new tables required
- Shared database ensures < 5s sync via direct column reads

**Constraints Respected:**
- Follows existing Card-based settings page pattern
- Matches existing focus/accessibility styles
- Uses established server action patterns
- Aligns with PRD tone guidelines (comfort over pressure)

## Detailed Design

### Services and Modules

| Module | Location | Responsibility | Owner |
|--------|----------|----------------|-------|
| **Opt-Out Handler** | `whatsapp-bot/src/handlers/engagement/opt-out-handler.ts` | Parse WhatsApp commands, update preference, send confirmation | Backend |
| **Notification Preferences Card** | `fe/components/settings/notification-preferences.tsx` | Render preference UI, handle toggle interactions | Frontend |
| **Switch Component** | `fe/components/ui/switch.tsx` | Reusable Radix UI Switch primitive with styling | Frontend |
| **Engagement Server Action** | `fe/lib/actions/engagement.ts` | Update preference via Supabase, return success/failure | Frontend |
| **Daily/Weekly Schedulers** | `whatsapp-bot/src/services/scheduler/*.ts` | Check opt-out before queuing messages (extend Epic 5) | Backend |

**Input/Output Contracts:**

**Opt-Out Handler (WhatsApp):**
- Input: User message text, user ID, locale
- Output: Updated `reengagement_opt_out` boolean, localized confirmation message
- Side Effects: PostHog event `engagement_preference_changed`

**Server Action (Web):**
- Input: `reengagementOptOut: boolean`
- Output: `{ success: boolean; message?: string }`
- Side Effects: DB update, PostHog event `engagement_preference_changed`

**Scheduler Integration:**
- Input: Eligible users from state machine queries
- Filter: Exclude users where `reengagement_opt_out = true`
- Output: Reduced queue of messages (opt-out users skipped)

### Data Models and Contracts

**Database Schema (Existing - Epic 1):**

```sql
-- user_profiles table (extend existing)
ALTER TABLE user_profiles
  ADD COLUMN reengagement_opt_out BOOLEAN DEFAULT false;
```

**No new tables required.** All data lives in existing `user_profiles` table.

**TypeScript Types:**

```typescript
// whatsapp-bot/src/services/engagement/types.ts
export interface OptOutCommand {
  intent: 'opt_out' | 'opt_in'
  source: 'whatsapp' | 'web'
  userId: string
  timestamp: Date
}

// fe/lib/types/engagement.ts
export interface NotificationPreferences {
  reengagementOptOut: boolean
  onboardingTipsEnabled: boolean // Different preference (Story 3.5)
}
```

**Data Validation:**

- `reengagement_opt_out`: Boolean only, default `false`
- No null values allowed (COALESCE to false in queries)
- Both channels write directly to same column (no eventual consistency issues)

**RLS Policy (Existing):**

Users can update their own `user_profiles.reengagement_opt_out`:

```sql
CREATE POLICY "Users can update own profile" ON user_profiles
  FOR UPDATE USING (auth.uid() = id);
```

Service role (WhatsApp bot) has full access via `SUPABASE_SERVICE_KEY`.

### APIs and Interfaces

**WhatsApp Command Handler API:**

```typescript
// whatsapp-bot/src/handlers/engagement/opt-out-handler.ts

export async function handleOptOutCommand(
  userId: string,
  messageText: string,
  locale: 'pt-BR' | 'en'
): Promise<string> {
  // 1. Parse intent (opt-out vs opt-in)
  const intent = parseOptOutIntent(messageText, locale)

  // 2. Update database
  const { data, error } = await supabase
    .from('user_profiles')
    .update({ reengagement_opt_out: intent === 'opt_out' })
    .eq('id', userId)
    .select()
    .single()

  // 3. Track analytics
  await trackPostHogEvent('engagement_preference_changed', {
    user_id: userId,
    preference: intent === 'opt_out' ? 'opted_out' : 'opted_in',
    source: 'whatsapp'
  })

  // 4. Return localized confirmation
  return getLocalizedMessage(
    intent === 'opt_out' ? 'optout_confirmed' : 'optin_confirmed',
    locale
  )
}

function parseOptOutIntent(text: string, locale: 'pt-BR' | 'en'): 'opt_out' | 'opt_in' | null {
  const lowerText = text.toLowerCase().trim()

  // Opt-out patterns
  const optOutPatterns = locale === 'pt-BR'
    ? ['parar lembretes', 'parar reengajamento', 'stop reminders', 'cancelar notificações']
    : ['stop reminders', 'opt out', 'disable notifications', 'unsubscribe']

  // Opt-in patterns
  const optInPatterns = locale === 'pt-BR'
    ? ['ativar lembretes', 'ativar reengajamento', 'start reminders', 'quero notificações']
    : ['start reminders', 'opt in', 'enable notifications', 'subscribe']

  if (optOutPatterns.some(p => lowerText.includes(p))) return 'opt_out'
  if (optInPatterns.some(p => lowerText.includes(p))) return 'opt_in'
  return null
}
```

**Web Server Action API:**

```typescript
// fe/lib/actions/engagement.ts
"use server"

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function updateNotificationPreferences(
  reengagementOptOut: boolean
): Promise<{ success: boolean; message?: string }> {
  try {
    const supabase = createClient()

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return { success: false, message: 'Unauthorized' }
    }

    // Update preference
    const { error: updateError } = await supabase
      .from('user_profiles')
      .update({ reengagement_opt_out: reengagementOptOut })
      .eq('id', user.id)

    if (updateError) {
      console.error('Failed to update preference:', updateError)
      return { success: false, message: 'Failed to save preferences' }
    }

    // Track analytics (client-side PostHog via usePostHog)
    // Event will be fired from component after successful response

    // Revalidate settings page
    revalidatePath('/[locale]/settings/account')

    return { success: true }
  } catch (error) {
    console.error('Unexpected error:', error)
    return { success: false, message: 'An unexpected error occurred' }
  }
}
```

**Switch Component API (Radix UI):**

```typescript
// fe/components/ui/switch.tsx
import * as SwitchPrimitive from "@radix-ui/react-switch"

interface SwitchProps extends React.ComponentProps<typeof SwitchPrimitive.Root> {
  checked?: boolean
  onCheckedChange?: (checked: boolean) => void
  disabled?: boolean
}

export function Switch({ checked, onCheckedChange, disabled, ...props }: SwitchProps) {
  // Implementation per UX spec
}
```

**Scheduler Integration Points:**

```typescript
// whatsapp-bot/src/services/scheduler/daily-engagement-job.ts

async function getEligibleUsersForGoodbye(): Promise<User[]> {
  const { data } = await supabase
    .from('user_engagement_states')
    .select('user_id, user_profiles(reengagement_opt_out)')
    .eq('state', 'active')
    .lt('last_activity_at', getInactivityThreshold())

  // Filter out opted-out users
  return data.filter(u => !u.user_profiles.reengagement_opt_out)
}

// Similar filtering in weekly-review-job.ts
```

### Workflows and Sequencing

**Sequence 1: WhatsApp Opt-Out Flow**

```
User sends "parar lembretes"
         │
         ▼
┌────────────────────────┐
│ Message Handler        │ ← Entry point (existing)
└───────────┬────────────┘
            │
            ▼
┌────────────────────────┐
│ Intent Detection       │ ← NLP layer identifies opt-out intent
└───────────┬────────────┘
            │
            ▼
┌────────────────────────┐
│ Opt-Out Handler        │ ← handleOptOutCommand()
│ - Parse intent         │
│ - Update DB            │
│ - Track analytics      │
└───────────┬────────────┘
            │
            ▼
┌────────────────────────┐
│ Localization Layer     │ ← Get confirmation message
└───────────┬────────────┘
            │
            ▼
┌────────────────────────┐
│ Response Sent          │ ← "Lembretes pausados ✓"
└────────────────────────┘
```

**Sequence 2: Web Toggle Flow**

```
User clicks Switch
         │
         ▼
┌────────────────────────┐
│ Optimistic UI Update   │ ← Switch visually changes immediately
└───────────┬────────────┘
            │
            ▼
┌────────────────────────┐
│ Server Action          │ ← updateNotificationPreferences()
│ - Auth check           │
│ - DB update            │
│ - Revalidate path      │
└───────────┬────────────┘
            │
       ┌────┴────┐
       │         │
   Success    Failure
       │         │
       ▼         ▼
   ┌─────┐   ┌──────┐
   │Toast│   │Revert│ ← Toggle returns to previous state
   │"✓"  │   │Toast │
   └─────┘   └──────┘
       │
       ▼
┌────────────────────────┐
│ PostHog Event          │ ← Track from client after success
│ engagement_preference_ │
│ changed                │
└────────────────────────┘
```

**Sequence 3: Cross-Channel Sync Verification**

```
User opts out on Web (t=0s)
         │
         ▼
┌────────────────────────┐
│ DB Column Updated      │ ← reengagement_opt_out = true
└───────────┬────────────┘
            │
            ▼ (t < 5s per NFR10)
┌────────────────────────┐
│ Scheduler Job Runs     │ ← Daily job checks eligibility
│ (Epic 5)               │
└───────────┬────────────┘
            │
            ▼
┌────────────────────────┐
│ Query Filters User     │ ← WHERE reengagement_opt_out = false
└───────────┬────────────┘
            │
            ▼
┌────────────────────────┐
│ User SKIPPED           │ ← No goodbye message queued
└────────────────────────┘

Sync latency = database read latency (< 100ms typical)
```

**Sequence 4: Scheduler Respects Opt-Out**

```
Daily Job: Evaluate 14-day inactive users
         │
         ▼
┌────────────────────────────────────────┐
│ Query:                                 │
│ SELECT * FROM user_engagement_states   │
│ WHERE state = 'active'                 │
│   AND last_activity_at < 14 days ago  │
│   AND user_profiles.reengagement_      │
│       opt_out = false                  │ ← Critical filter
└───────────┬────────────────────────────┘
            │
            ▼
    ┌───────┴───────┐
    │               │
Opted Out       Not Opted Out
    │               │
    ▼               ▼
┌────────┐    ┌──────────────────┐
│ SKIP   │    │ Queue Goodbye    │
│ Silently│   │ Message          │
└────────┘    └──────────────────┘
```

## Non-Functional Requirements

### Performance

| Requirement | Target | Implementation Strategy |
|-------------|--------|------------------------|
| **Web Toggle Response Time** | < 200ms optimistic UI, < 2s server confirmation | Optimistic UI updates immediately; server action runs async |
| **WhatsApp Command Response** | < 2 seconds | Simple DB update + string matching (no heavy NLP) |
| **Cross-Channel Sync Latency** | < 5 seconds (NFR10) | Shared database column—sync is instant via direct reads |
| **Scheduler Query Performance** | No degradation with opt-out filter | Indexed query on `reengagement_opt_out` (if >10k users) |

**Performance Notes:**
- No caching needed (preference changes are infrequent, ~once per user lifetime)
- Optimistic UI masks network latency for better perceived performance
- Opt-out filter adds negligible overhead to scheduler queries (boolean column)

### Security

| Requirement | Implementation | Rationale |
|-------------|----------------|-----------|
| **User can only update own preferences** | RLS policy: `auth.uid() = user_id` | Prevents cross-user preference tampering |
| **WhatsApp bot uses service role** | `SUPABASE_SERVICE_KEY` bypasses RLS | Bot needs to update any user's preference |
| **Server action validates auth** | `supabase.auth.getUser()` check | Reject unauthenticated requests |
| **No sensitive data in opt-out events** | PostHog events: user_id + preference only | LGPD compliance—no PII beyond what's necessary |

**Security Notes:**
- No new attack surface (reuses existing auth patterns)
- Boolean column cannot be SQL-injected (type-safe)
- LGPD Article 18: Right to opt-out fully respected via dual channels

### Reliability/Availability

| Requirement | Target | Mitigation |
|-------------|--------|------------|
| **Opt-out must never fail silently** | 99.9% success rate | Server action returns explicit success/failure; toast on error |
| **Web toggle failure recovery** | Revert to previous state on error | Optimistic UI with rollback pattern |
| **WhatsApp command idempotency** | Multiple "stop reminders" = same result | DB update is idempotent (SET to same value) |
| **Scheduler respects opt-out 100%** | Zero messages to opted-out users | CRITICAL: Query filter verified in tests |

**Failure Modes & Handling:**

1. **Database unavailable during toggle**: User sees error toast, toggle reverts, can retry
2. **WhatsApp bot crashes after opt-out**: Preference already persisted in DB (no data loss)
3. **Scheduler reads stale data**: Impossible—direct DB reads, no cache layer
4. **User opts out during goodbye message send**: Message already queued, but future messages skipped (acceptable 1-time race condition)

### Observability

| Signal Type | What to Log/Track | Tool |
|-------------|-------------------|------|
| **Analytics Events** | `engagement_preference_changed` with source (whatsapp/web), preference (opted_in/opted_out), timestamp | PostHog |
| **Server Action Logs** | Success/failure, user_id, error messages | Console logs → Cloud logging |
| **WhatsApp Handler Logs** | Opt-out command received, intent parsed, DB update result | Structured logs |
| **Scheduler Logs** | Count of users filtered by opt-out, total eligible vs queued | Daily job logs |

**Key Metrics to Monitor:**

1. **Opt-out rate**: % of users who opt out within 30 days (expect <10% if messaging is respectful)
2. **Opt-in after opt-out**: Track users who opt back in (validates easy opt-in UX)
3. **Channel preference**: WhatsApp vs web opt-out source distribution
4. **Scheduler skips**: Daily count of users skipped due to opt-out (should grow linearly with opt-out rate)

**Alerting:**

- Alert if opt-out rate spikes >20% in 24 hours (indicates messaging issue)
- Alert if scheduler fails to respect opt-out (user opted out but received message—CRITICAL bug)

## Dependencies and Integrations

### External Dependencies

**No new dependencies required.** All functionality uses existing libraries:

| Dependency | Version | Purpose | Already Installed |
|------------|---------|---------|-------------------|
| `@radix-ui/react-switch` | 1.1.2 | Switch primitive for toggle UI | ✅ Yes (fe/package.json) |
| `@supabase/ssr` | Latest | Server-side Supabase client | ✅ Yes |
| `next-intl` | Latest | Localization system | ✅ Yes |
| Baileys | Latest | WhatsApp library | ✅ Yes (whatsapp-bot) |
| PostHog | Latest | Analytics tracking | ✅ Yes |

### Integration Points with Existing Systems

**Epic 1 (Foundation):**
- Uses `user_profiles.reengagement_opt_out` column (Story 1.1)
- Uses localization keys added in Stories 1.4-1.5
- Uses engagement types/constants from Story 1.3

**Epic 4 (State Machine):**
- State machine checks opt-out before transitions
- Message router respects opt-out preference

**Epic 5 (Scheduler):**
- Daily job filters opted-out users (Story 5.1)
- Weekly review job filters opted-out users (Story 5.3)
- Message queue respects opt-out (Story 5.4)

**Frontend Settings Page:**
- Integrates into existing `/[locale]/settings/account` page
- Uses existing Card pattern from other settings sections
- Uses existing server action patterns

**Database:**
- Direct column writes (no ORM complexity)
- Shared between both channels via Supabase client

## Acceptance Criteria (Authoritative)

These are the testable requirements that define "done" for Epic 6. All criteria derived from Stories 6.1-6.5 in the Epics document.

### AC-6.1: WhatsApp Opt-Out Command (Story 6.1)

**Given** a user sends "parar lembretes" or "stop reminders" (pt-BR/en variations)
**When** the opt-out handler processes the command
**Then** `user_profiles.reengagement_opt_out` is set to `true`
**And** a confirmation message is sent in the user's locale
**And** PostHog event `engagement_preference_changed` is tracked with `source: 'whatsapp'`

**Given** a user sends "ativar lembretes" or "start reminders"
**When** the opt-in handler processes the command
**Then** `user_profiles.reengagement_opt_out` is set to `false`
**And** a confirmation message is sent
**And** PostHog event tracked with `source: 'whatsapp'`

**Given** variations in phrasing ("cancelar notificações", "disable notifications", etc.)
**Then** intent is correctly recognized via pattern matching

### AC-6.2: Web Settings Toggle (Story 6.2)

**Given** a user navigates to `/[locale]/settings/account`
**Then** a "Notification Preferences" Card is visible
**And** the Card contains a Switch component for "Re-engagement Messages"
**And** the Switch reflects the current `reengagement_opt_out` state (inverted for UX)

**Given** a user clicks the Switch to opt out
**When** the server action completes successfully
**Then** the Switch remains in the new position
**And** a success toast is displayed ("Preferences saved")
**And** the database is updated

**Given** the server action fails
**When** the error is returned
**Then** the Switch reverts to its previous position
**And** an error toast is displayed ("Failed to save preferences. Please try again.")

### AC-6.3: Cross-Channel Sync (Story 6.3)

**Given** a user opts out via WhatsApp
**When** they check the web settings within 5 seconds
**Then** the web toggle shows "opted out" (NFR10: < 5s sync)

**Given** a user opts out via web
**When** the daily scheduler runs within 5 seconds
**Then** the scheduler query excludes that user from goodbye messages

**Given** multiple rapid toggles from the same or different channels
**Then** the final state in the database reflects the most recent command
**And** no race conditions cause inconsistent state

### AC-6.4: Scheduler Respects Opt-Out (Story 6.4)

**Given** a user has `reengagement_opt_out = true`
**When** the daily engagement job evaluates users for goodbye messages
**Then** that user is EXCLUDED from the results (not queued)

**Given** a user has `reengagement_opt_out = true`
**When** the weekly review job evaluates users for review messages
**Then** that user is EXCLUDED from the results

**Given** a user has `reengagement_opt_out = true`
**When** they complete a tier action
**Then** onboarding tips are STILL sent (different preference, Story 3.5)

**Given** a user opts out AFTER a goodbye message is queued but BEFORE it's sent
**Then** the message sends (acceptable race condition)
**But** future messages are blocked

### AC-6.5: Analytics Dashboard Access (Story 6.5)

**Given** the engagement system is running
**When** querying PostHog for `engagement_preference_changed` events
**Then** events include properties: `user_id`, `preference` (opted_in/opted_out), `source` (whatsapp/web), `timestamp`

**Given** database query for opt-out distribution
**Then** can calculate: total users, opted-out users, opt-out rate, opt-back-in count

**Given** scheduler logs
**Then** can extract: users skipped per day due to opt-out, total eligible vs. queued

### Cross-Cutting Criteria (All Stories)

**Security:**
- Users can only update their own `reengagement_opt_out` preference (RLS enforced)
- WhatsApp bot uses service role for necessary privilege escalation
- No sensitive data logged beyond user_id

**Localization:**
- All WhatsApp confirmation messages in pt-BR and English
- Web toggle labels/descriptions in pt-BR and English via next-intl

**Error Handling:**
- Failed WhatsApp command → User receives error message, preference unchanged
- Failed web toggle → Optimistic UI reverts, error toast shown, retry available

**Idempotency:**
- Multiple "stop reminders" commands → Same result (already opted out)
- Multiple toggle clicks → Each updates database, no duplicate events

**LGPD Compliance:**
- Easy opt-out from both channels (LGPD Article 18)
- Opt-out respected 100% for re-engagement messages
- Users can opt back in at any time

## Traceability Mapping

This table maps each Acceptance Criterion back to PRD Functional Requirements, architecture components, and test coverage.

| AC | PRD FR | Architecture Component | Test Coverage | Implementation File |
|----|--------|------------------------|---------------|---------------------|
| **AC-6.1** | FR28 | Opt-Out Handler, Intent Parser | Unit: opt-out-handler.test.ts | handlers/engagement/opt-out-handler.ts |
| **AC-6.2** | FR29 | Switch Component, Server Action | Integration: notification-preferences.test.tsx | components/settings/notification-preferences.tsx |
| **AC-6.3** | FR30 | Database Column (shared) | Integration: cross-channel-sync.test.ts | user_profiles.reengagement_opt_out |
| **AC-6.4** | FR31 | Scheduler Query Filters | Unit: scheduler-respect-optout.test.ts | services/scheduler/daily-engagement-job.ts |
| **AC-6.5** | FR43 | PostHog Events, DB Queries | Analytics verification (manual) | PostHog dashboard + SQL queries |

### Detailed FR → AC → Component Mapping

**FR28: WhatsApp opt-out command**
- AC-6.1: WhatsApp command processing
- Component: `handlers/engagement/opt-out-handler.ts`
- Function: `handleOptOutCommand()`, `parseOptOutIntent()`
- Test: Verify command variations recognized, DB updated, confirmation sent

**FR29: Web settings opt-out toggle**
- AC-6.2: Web toggle UI and server action
- Component: `fe/components/settings/notification-preferences.tsx`, `fe/lib/actions/engagement.ts`
- Function: `updateNotificationPreferences()`
- Test: Verify toggle click → server action → DB update → UI feedback

**FR30: Sync opt-out between WhatsApp and web**
- AC-6.3: Cross-channel sync verification
- Component: `user_profiles.reengagement_opt_out` (shared DB column)
- Mechanism: Direct DB reads (< 5s sync via shared database)
- Test: Opt-out on one channel → verify on other channel within 5s

**FR31: Respect opt-out for re-engagement, allow onboarding tips**
- AC-6.4: Scheduler filters opted-out users
- Component: `services/scheduler/daily-engagement-job.ts`, `services/scheduler/weekly-review-job.ts`
- Query: `WHERE reengagement_opt_out = false` filter
- Test: Verify opted-out users excluded from goodbye/review queues, but still receive tier tips

**FR32: Users can opt back in**
- AC-6.1: Opt-in command processing
- Same components as opt-out, reverse operation
- Test: Verify opt-in command sets `reengagement_opt_out = false`

**FR43: Analytics dashboard access**
- AC-6.5: PostHog events and DB queries
- Events: `engagement_preference_changed` with source/preference/timestamp
- Queries: Opt-out rate, opt-back-in count, scheduler skip counts
- Test: Manual verification of event properties and query results

### Test Strategy by AC

| AC | Test Type | Test Location | Coverage Goal |
|----|-----------|---------------|---------------|
| AC-6.1 | Unit | `__tests__/handlers/opt-out-handler.test.ts` | 100% intent parsing, 100% DB update paths |
| AC-6.2 | Integration | `fe/__tests__/components/notification-preferences.test.tsx` | Render, click, optimistic UI, error rollback |
| AC-6.3 | Integration | `__tests__/integration/cross-channel-sync.test.ts` | Sync latency < 5s, no race conditions |
| AC-6.4 | Unit | `__tests__/services/scheduler-optout.test.ts` | Opted-out users excluded, tips still sent |
| AC-6.5 | Manual | PostHog dashboard + SQL console | Event schema, query accuracy |

### Implementation Dependencies

```
Epic 1 (Foundation) MUST complete first
    │
    ├──→ Story 1.1 (DB schema) ──→ All AC requirements
    ├──→ Story 1.3 (Types) ──→ AC-6.1, AC-6.2
    └──→ Story 1.4-1.5 (Localization) ──→ AC-6.1

Epic 5 (Scheduler) MUST complete before AC-6.4
    │
    ├──→ Story 5.1 (Daily job) ──→ AC-6.4 (goodbye filter)
    └──→ Story 5.3 (Weekly job) ──→ AC-6.4 (review filter)
```

## Risks, Assumptions, Open Questions

### Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| **Race condition: User opts out during message send** | Low - One message sent after opt-out | Low | Acceptable: Message already queued before opt-out, future messages blocked. Document as expected behavior. |
| **Opt-out rate higher than expected (>20%)** | High - Indicates messaging is too aggressive | Medium | Monitor PostHog alerts. If triggered, review message tone/frequency in Epic 4-5. |
| **Users confused about opt-out vs. tips opt-out** | Medium - Users opt out of wrong preference | Medium | UX copy distinguishes clearly. Info note in web UI explains difference. |
| **Scheduler fails to respect opt-out (critical bug)** | Critical - LGPD violation, user trust broken | Very Low | Comprehensive test coverage (AC-6.4). Alert if opted-out user receives message. |
| **Web toggle optimistic UI confuses users** | Low - User thinks they opted out but didn't | Very Low | Error toast clearly states failure. Toggle reverts visually. Retry available. |

### Assumptions

| Assumption | Validation Method | If False, Then... |
|------------|-------------------|-------------------|
| **Users will use both WhatsApp and web channels** | Track `source` distribution in PostHog | If 95%+ WhatsApp-only, deprioritize web UI refinements |
| **< 10% of users will opt out** | Monitor opt-out rate weekly | If >20%, indicates messaging tone issue—revisit Epic 4 copy |
| **Opt-back-in rate will be >30% of opt-outs** | Track opt-in events after previous opt-out | If <10%, indicates permanent disengagement—review value proposition |
| **Shared DB column provides "instant" sync** | Measure actual sync latency in tests | If >5s, add cache invalidation or pub/sub mechanism |
| **Simple pattern matching sufficient for intent** | Manual testing of edge cases + user feedback | If high failure rate, upgrade to NLP-based intent detection |

### Open Questions

| Question | Decision Needed By | Assigned To | Status |
|----------|-------------------|-------------|--------|
| **Should we show opt-out count to users?** ("You're one of 47 users who opted out") | Before Story 6.2 implementation | Lucas (Product) | **OPEN** - Transparency vs. social proof trade-off |
| **Do we need per-message-type granularity?** (Opt out of weekly review but keep goodbye) | Before Epic 6 implementation | Lucas (Product) | **OUT OF SCOPE** - Listed as Growth Feature in PRD |
| **Should web UI allow opting out of onboarding tips?** | Before Story 6.2 implementation | Lucas (Product) | **DEFERRED** - WhatsApp-only for MVP (Story 3.5) |
| **What happens if user opts out then deletes their account?** | Before Story 6.1 implementation | Dev Team | **ANSWERED** - Cascade delete via FK constraint, no orphaned opt-out records |
| **Should scheduler log opted-out user count per run?** | Before Story 5.1 integration | Dev Team | **YES** - Add to observability (NFR: Scheduler Logs) |

### Constraints & Assumptions Inherited from Earlier Epics

- **Database schema finalized in Epic 1** - Cannot change `reengagement_opt_out` column type/name
- **Scheduler architecture from Epic 5** - Must use existing query-based filtering, not event-driven
- **Localization keys from Epic 1** - Must add opt-out messages to existing structure
- **RLS policies from brownfield** - Must respect existing `user_profiles` RLS pattern

### Known Limitations (Accepted)

1. **One-time race condition** acceptable: If user opts out while goodbye message is in queue, that message sends, but future messages blocked
2. **No retroactive message cancellation**: Cannot un-send messages already delivered before opt-out
3. **No per-destination opt-out**: User opts out globally, not per group/individual chat (Growth Feature per PRD)

## Test Strategy Summary

### Test Pyramid for Epic 6

```
                    Manual QA
                  /           \
              Integration Tests (3)
            /                      \
        Unit Tests (5)              E2E (1)
      /                                   \
```

**Test Distribution:**
- Unit Tests: 5 files (70% of test effort)
- Integration Tests: 3 files (20% of test effort)
- E2E Tests: 1 comprehensive scenario (10% of test effort)

### Unit Tests (5 files)

**1. `__tests__/handlers/opt-out-handler.test.ts`**
- Test intent parsing for all variations
- Test DB update success/failure paths
- Test confirmation message localization
- Test PostHog event tracking
- **Coverage Target**: 100% branches

**2. `__tests__/services/scheduler-optout.test.ts`**
- Test daily job filters opted-out users
- Test weekly job filters opted-out users
- Test onboarding tips still sent (Story 3.5 distinction)
- Test query performance with 10k+ users
- **Coverage Target**: 100% query logic

**3. `fe/__tests__/actions/engagement.test.ts`**
- Test server action auth validation
- Test DB update via Supabase client
- Test error handling (unauthorized, DB failure)
- Test revalidatePath call
- **Coverage Target**: 100% action logic

**4. `fe/__tests__/components/switch.test.tsx`**
- Test Switch component rendering
- Test checked/unchecked states
- Test onCheckedChange callback
- Test disabled state
- Test keyboard navigation (Tab, Space)
- Test accessibility (role, aria-checked)
- **Coverage Target**: 100% Radix wrapper

**5. `fe/__tests__/components/notification-preferences.test.tsx`**
- Test Card rendering with current preference
- Test optimistic UI toggle
- Test success toast on server action success
- Test error rollback on server action failure
- Test PostHog event firing after success
- **Coverage Target**: 100% component logic

### Integration Tests (3 files)

**1. `__tests__/integration/cross-channel-sync.test.ts`**
```typescript
// Test scenario: Opt-out via WhatsApp, verify on web
test('WhatsApp opt-out reflects on web within 5s', async () => {
  // 1. User sends "stop reminders" via mock WhatsApp
  // 2. Wait up to 5 seconds
  // 3. Query web settings API
  // 4. Assert: reengagement_opt_out = true
  // 5. Assert: latency < 5000ms
})

// Test scenario: Opt-out via web, verify scheduler skip
test('Web opt-out excludes user from scheduler', async () => {
  // 1. User toggles off via web UI
  // 2. Run daily scheduler job
  // 3. Assert: User NOT in goodbye queue
})
```

**2. `__tests__/integration/scheduler-respect-optout.test.ts`**
```typescript
// Test scenario: Opted-out user excluded from all re-engagement
test('Opted-out user receives no goodbye or weekly review', async () => {
  // 1. Set user to opted-out + 14 days inactive
  // 2. Run daily job
  // 3. Assert: No goodbye queued
  // 4. Set user to opted-out + had activity
  // 5. Run weekly job
  // 6. Assert: No review queued
})

// Test scenario: Opted-out user still receives onboarding tips
test('Opted-out user receives tier completion tips', async () => {
  // 1. Set user to opted-out
  // 2. Complete Tier 1
  // 3. Assert: Tier completion message sent
})
```

**3. `fe/__tests__/integration/settings-page.test.tsx`**
```typescript
// Test scenario: Full web toggle flow
test('User can opt out via settings page', async () => {
  // 1. Navigate to /settings/account
  // 2. Assert: Notification Preferences Card visible
  // 3. Click Switch
  // 4. Wait for server action
  // 5. Assert: Success toast, Switch state persisted
  // 6. Refresh page
  // 7. Assert: Switch still reflects opt-out
})
```

### E2E Test (1 comprehensive scenario)

**`__tests__/e2e/opt-out-journey.test.ts`**
```typescript
// Full user journey: Opt-out, verify scheduler skip, opt back in
test('Complete opt-out and opt-in journey', async () => {
  // Setup: User with 13 days inactive

  // Day 14: User opts out via WhatsApp
  await sendWhatsAppMessage(user, 'parar lembretes')
  await expectConfirmation('Lembretes pausados')

  // Day 15: Scheduler runs, user skipped
  await runDailyJob()
  await expectNoGoodbyeMessage(user)

  // Day 16: User opts back in via web
  await toggleWebSettings(user, true)
  await expectSuccessToast()

  // Day 17: Scheduler runs, user included
  await runDailyJob()
  await expectGoodbyeMessageQueued(user)
})
```

### Manual QA Checklist

Before release, manually verify:

- [ ] WhatsApp opt-out command works in pt-BR and English
- [ ] Web toggle reflects current state accurately
- [ ] Optimistic UI feels snappy (< 200ms perceived)
- [ ] Error toast message is clear and actionable
- [ ] Switch component works with keyboard (Tab + Space)
- [ ] Screen reader announces "On" / "Off" correctly
- [ ] Info note distinguishes re-engagement from tips
- [ ] PostHog events appear in dashboard with correct properties
- [ ] Opted-out users receive no goodbye/weekly review (verify in logs)
- [ ] Opted-out users still receive tier tips

### Performance Benchmarks

| Operation | Target | Measurement Method |
|-----------|--------|-------------------|
| WhatsApp command response | < 2s | Log timestamp difference |
| Web toggle optimistic UI | < 200ms | Performance.now() before/after |
| Server action round-trip | < 2s | Server action timing |
| Scheduler query with opt-out filter | < 5s for 10k users | SQL EXPLAIN ANALYZE |
| Cross-channel sync latency | < 5s | Integration test assertion |

### Test Data Requirements

**Mock Users:**
- User A: Opted out via WhatsApp, 14 days inactive
- User B: Opted in, 14 days inactive (for comparison)
- User C: Opted out via web, had activity this week
- User D: Opted in, had activity this week (for comparison)
- User E: Rapidly toggles opt-out/in (race condition test)

**Database States:**
- Empty DB (fresh install)
- 10,000 users (performance test)
- Mix of opted-in/out (50/50 distribution)

### Continuous Integration

All tests run on:
- PR creation
- Merge to main
- Daily cron (integration tests)

**Failure Thresholds:**
- Unit tests: 0 failures allowed
- Integration tests: 0 failures allowed
- E2E tests: 1 retry allowed before failing
- Coverage: 80% minimum (Epic 7 target)
