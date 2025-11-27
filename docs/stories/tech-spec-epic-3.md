# Epic Technical Specification: Progressive Tier Journey

**Date:** 2025-11-22
**Author:** Lucas
**Epic ID:** 3
**Status:** Contexted

---

## Overview

Epic 3 implements the Progressive Tier Journey—a 3-tier onboarding system where users feel accomplishment as they master features. Unlike traditional tutorials that front-load information, this system tracks actual user actions and celebrates completions at natural moments, building confidence progressively.

This epic delivers the "achievement unlock" experience that transforms learning into discovery. Users progress through Tier 1 (Expense Mastery), Tier 2 (Plan Ahead), and Tier 3 (See the Big Picture), with each tier unlocking after demonstrating competency—not just reading instructions.

**Key Principle:** Track tier completion (not individual steps) for cleaner analytics. Celebrate without being annoying. Never gate features.

---

## Objectives and Scope

### In Scope

- Tier progress tracking service with atomic JSONB updates
- Tier action detection hooks integrated into existing handlers
- Tier completion detection with milestone celebrations
- No hard gating policy enforcement (users can do anything anytime)
- Skip onboarding command ("parar dicas" / "stop tips")
- Tier completion analytics (PostHog events)
- Integration with existing handlers (transactions, categories, budgets, reports, recurring)

### Out of Scope

- First message detection and welcome flow (Epic 2 - completed)
- Engagement state machine and re-engagement (Epic 4)
- Scheduled jobs for proactive messages (Epic 5)
- Web settings integration (Epic 6)
- Testing infrastructure (Epic 7)

---

## System Architecture Alignment

This epic implements the following architecture components:

| Architecture Section | Implementation |
|---------------------|----------------|
| Project Structure - services/onboarding/ | Story 3.1 (tier-tracker.ts) |
| Data Architecture - user_profiles extensions | Uses `onboarding_tier`, `onboarding_tier_progress` from Epic 1 |
| Implementation Patterns - Configuration Constants | Uses `TIER_1_ACTIONS`, `TIER_2_ACTIONS`, `TIER_3_ACTIONS` from Epic 1 |
| FR Category - Onboarding & Discovery | FR4-FR8, FR10, FR38 |
| Analytics Events | `onboarding_tier_completed` |

**FRs Covered:**
- **FR4:** System tracks user progress through 3-tier onboarding journey
- **FR5:** System detects when a user completes all actions within a tier
- **FR6:** System sends tier completion celebration message
- **FR7:** System unlocks next tier guidance after completion
- **FR8:** Users can perform any action regardless of tier (no hard gating)
- **FR10:** Users can explicitly skip onboarding guidance
- **FR38:** System tracks tier completion events with timestamps

**ADRs Applied:** None specific to Epic 3 (uses patterns from Epic 1)

---

## Detailed Design

### Services and Modules

| Module | File | Responsibility |
|--------|------|----------------|
| **Tier Tracker Service** | `services/onboarding/tier-tracker.ts` | Track actions, detect completions, manage tier state |
| **Tier Progress Handler** | `handlers/engagement/tier-progress-handler.ts` | Process tier celebrations, queue unlock messages |
| **Opt-Out Handler** | `handlers/engagement/opt-out-handler.ts` | Handle "stop tips" / "enable tips" commands |
| **Constants** | `services/engagement/constants.ts` | `TIER_1_ACTIONS`, `TIER_2_ACTIONS`, `TIER_3_ACTIONS` (from Epic 1) |

### Data Models and Contracts

#### Tier Progress Structure (JSONB in user_profiles)

```typescript
// From services/engagement/types.ts (Epic 1)
interface TierProgress {
  tier1: {
    add_expense: boolean
    edit_category: boolean
    delete_expense: boolean
    add_category: boolean
    completed_at?: string  // ISO timestamp when tier completed
  }
  tier2: {
    set_budget: boolean
    add_recurring: boolean
    list_categories: boolean
    completed_at?: string
  }
  tier3: {
    edit_category: boolean
    view_report: boolean
    completed_at?: string
  }
  magic_moment_at?: string  // From Epic 2
}
```

#### Tier Action Definitions

```typescript
// From services/engagement/constants.ts (Epic 1)
export const ENGAGEMENT_CONFIG = {
  TIER_1_ACTIONS: ['add_expense', 'edit_category', 'delete_expense', 'add_category'] as const,
  TIER_2_ACTIONS: ['set_budget', 'add_recurring', 'list_categories'] as const,
  TIER_3_ACTIONS: ['edit_category', 'view_report'] as const,
} as const

type Tier1Action = typeof ENGAGEMENT_CONFIG.TIER_1_ACTIONS[number]
type Tier2Action = typeof ENGAGEMENT_CONFIG.TIER_2_ACTIONS[number]
type Tier3Action = typeof ENGAGEMENT_CONFIG.TIER_3_ACTIONS[number]
type TierAction = Tier1Action | Tier2Action | Tier3Action
```

### APIs and Interfaces

#### Tier Tracker Service API

```typescript
// services/onboarding/tier-tracker.ts

interface TierUpdate {
  action: TierAction
  recorded: boolean          // True if action was newly recorded
  tierCompleted: 1 | 2 | 3 | null  // Tier number if completed, null otherwise
  shouldSendUnlock: boolean  // True if celebration should be sent
  currentTier: number        // Current onboarding_tier value (0-3)
}

/**
 * Record a tier-relevant action and check for tier completion
 *
 * @param userId - User's ID
 * @param action - The action performed (e.g., 'add_expense')
 * @returns TierUpdate with completion status
 */
export async function recordAction(
  userId: string,
  action: TierAction
): Promise<TierUpdate>

/**
 * Get current tier progress for a user
 */
export async function getTierProgress(userId: string): Promise<TierProgress>

/**
 * Check if specific tier is complete (all actions done)
 */
export async function checkTierCompletion(
  userId: string,
  tier: 1 | 2 | 3
): Promise<boolean>

/**
 * Get user's current tier level (0 = none, 1-3 = completed that tier)
 */
export async function getCurrentTier(userId: string): Promise<number>

/**
 * Check if user has tips enabled (not opted out)
 */
export async function areTipsEnabled(userId: string): Promise<boolean>
```

#### Opt-Out Handler API

```typescript
// handlers/engagement/opt-out-handler.ts

/**
 * Handle tip opt-out/opt-in commands
 *
 * Commands:
 * - "parar dicas" / "stop tips" → Disable tips
 * - "ativar dicas" / "enable tips" → Enable tips
 *
 * @returns Localized confirmation message
 */
export async function handleTipOptOut(
  userId: string,
  messageText: string,
  locale: 'pt-br' | 'en'
): Promise<string | null>  // null if not a tip command

/**
 * Check if message is a tip opt-out/opt-in command
 */
export function isTipCommand(messageText: string): boolean
```

### Workflows and Sequencing

**Action Recording Flow:**

```
User performs action (e.g., adds expense)
        ↓
[Existing Handler] → Process action normally
        ↓
[recordAction()] → Update onboarding_tier_progress JSONB
        ↓
    Action newly recorded?
        │
   ┌────┴────┐
  YES        NO
   │          │
   ▼          ▼
[Check Tier     [Return early
 Completion]     no change]
   │
   ▼
Tier complete?
   │
┌──┴──┐
YES    NO
 │      │
 ▼      ▼
[Set completed_at]   [Done]
[Update onboarding_tier]
[Check tips enabled]
   │
   ▼
Tips enabled?
   │
┌──┴──┐
YES    NO
 │      │
 ▼      ▼
[Queue          [Track analytics
 celebration     only, no message]
 message]
   │
   ▼
[Fire PostHog event]
```

**Story Execution Order:**

```
3.1 Tier Progress Tracking Service
        ↓
3.2 Tier Action Detection Hooks ──→ 3.3 Tier Completion Detection & Celebrations
        │                                    │
        └────────────────────────────────────┼─→ 3.4 No Hard Gating Policy
                                             │
                                             └─→ 3.5 Skip Onboarding Command
                                                      │
                                                      └─→ 3.6 Tier Completion Analytics
```

---

## Non-Functional Requirements

### Performance

| Requirement | Target | Validation |
|-------------|--------|------------|
| Action recording time | < 100ms | Non-blocking, async database update |
| Tier completion check | < 50ms | In-memory check after DB read |
| No impact on primary response | Tier tracking is fire-and-forget | Handler returns before tracking completes |

### Security

| Requirement | Implementation |
|-------------|----------------|
| User data access | RLS policies on user_profiles (existing) |
| Tier progress manipulation | Only service role can modify tier progress |

### Reliability/Availability

| Requirement | Implementation |
|-------------|----------------|
| Atomic tier updates | Single UPDATE query with JSONB merge |
| Idempotent recording | Re-recording same action is safe (already true) |
| Lost tracking recovery | If tracking fails, handler still succeeds |

### Observability

| Signal | Implementation |
|--------|----------------|
| Tier completion events | PostHog: `onboarding_tier_completed` |
| Action recorded events | PostHog: `onboarding_action_recorded` (optional, may be verbose) |
| Skip tips events | PostHog: `onboarding_tips_toggled` |

---

## Dependencies and Integrations

### Epic 1 Dependencies (Completed)

| Dependency | Status | Used For |
|------------|--------|----------|
| `user_profiles.onboarding_tier` | ✓ done | Current tier level (0-3) |
| `user_profiles.onboarding_tier_progress` | ✓ done | JSONB progress tracking |
| `services/engagement/types.ts` | ✓ done | `TierProgress` type |
| `services/engagement/constants.ts` | ✓ done | Tier action arrays |
| `handlers/engagement/tier-progress-handler.ts` | ✓ stub | Implement celebrations |
| `handlers/engagement/opt-out-handler.ts` | ✓ stub | Implement commands |
| Localization messages | ✓ done | Tier unlock messages |

### Epic 2 Dependencies (Completed)

| Dependency | Status | Used For |
|------------|--------|----------|
| `magic_moment_at` tracking | ✓ done | Context for celebrations |
| Contextual hints infrastructure | ✓ done | Similar pattern for tier hints |

### Existing Handler Integration Points

| Handler File | Action to Track | Hook Location |
|--------------|-----------------|---------------|
| `handlers/transactions/expenses.ts` | `add_expense` | After successful expense creation |
| `handlers/transactions/expenses.ts` | `delete_expense` | After successful expense deletion |
| `handlers/categories/categories.ts` | `add_category` | After successful category creation |
| `handlers/categories/categories.ts` | `edit_category` | After successful category edit |
| `handlers/budgets/budgets.ts` | `set_budget` | After successful budget creation/update |
| `handlers/recurring/recurring.ts` | `add_recurring` | After successful recurring expense creation |
| `handlers/categories/categories.ts` | `list_categories` | After successful category listing |
| `handlers/reports/reports.ts` | `view_report` | After successful report generation |

---

## Acceptance Criteria (Authoritative)

### Story 3.1: Tier Progress Tracking Service

1. **AC-3.1.1:** `recordAction(userId, 'add_expense')` updates `onboarding_tier_progress.tier1.add_expense = true` atomically
2. **AC-3.1.2:** Recording same action twice does not error and returns `recorded: false`
3. **AC-3.1.3:** `checkTierCompletion(userId, 1)` returns `true` only when ALL Tier 1 actions are `true`
4. **AC-3.1.4:** When tier completes, `tier.completed_at` is set to ISO timestamp
5. **AC-3.1.5:** When tier completes, `user_profiles.onboarding_tier` is incremented
6. **AC-3.1.6:** `getTierProgress(userId)` returns complete `TierProgress` object

### Story 3.2: Tier Action Detection Hooks

7. **AC-3.2.1:** Adding expense calls `recordAction(userId, 'add_expense')`
8. **AC-3.2.2:** Deleting expense calls `recordAction(userId, 'delete_expense')`
9. **AC-3.2.3:** Adding category calls `recordAction(userId, 'add_category')`
10. **AC-3.2.4:** Editing category calls `recordAction(userId, 'edit_category')`
11. **AC-3.2.5:** Setting budget calls `recordAction(userId, 'set_budget')`
12. **AC-3.2.6:** Adding recurring expense calls `recordAction(userId, 'add_recurring')`
13. **AC-3.2.7:** Listing categories calls `recordAction(userId, 'list_categories')`
14. **AC-3.2.8:** Viewing report calls `recordAction(userId, 'view_report')`
15. **AC-3.2.9:** Tier tracking does NOT block or slow down primary handler response

### Story 3.3: Tier Completion Detection & Celebrations

16. **AC-3.3.1:** Completing last Tier 1 action sends celebration message with Tier 2 guidance
17. **AC-3.3.2:** Completing last Tier 2 action sends celebration message with Tier 3 guidance
18. **AC-3.3.3:** Completing last Tier 3 action sends final "pro" celebration message
19. **AC-3.3.4:** Celebration messages use max one emoji
20. **AC-3.3.5:** If tips disabled, NO celebration sent but progress tracked silently
21. **AC-3.3.6:** Messages queued via message queue service (idempotent)

### Story 3.4: No Hard Gating Policy

22. **AC-3.4.1:** Tier 0 user CAN set budget (Tier 2 action) without error
23. **AC-3.4.2:** Tier 0 user CAN view report (Tier 3 action) without error
24. **AC-3.4.3:** Out-of-order actions still record correctly to their respective tiers
25. **AC-3.4.4:** Each tier celebrates independently when complete (regardless of order)

### Story 3.5: Skip Onboarding Command

26. **AC-3.5.1:** "parar dicas" or "stop tips" disables tips, sends confirmation
27. **AC-3.5.2:** "ativar dicas" or "enable tips" re-enables tips, sends confirmation
28. **AC-3.5.3:** With tips disabled, tier completions tracked but NOT celebrated
29. **AC-3.5.4:** Tip preference is separate from re-engagement opt-out (FR28-32)
30. **AC-3.5.5:** Command matching is case-insensitive

### Story 3.6: Tier Completion Analytics

31. **AC-3.6.1:** Tier completion fires PostHog event `onboarding_tier_completed`
32. **AC-3.6.2:** Event includes: `tier`, `completed_at`, `time_to_complete_days`, `days_since_signup`
33. **AC-3.6.3:** Analytics can calculate T1→T2 conversion rate from events
34. **AC-3.6.4:** Analytics can calculate average time per tier from events

---

## Traceability Mapping

| AC | Spec Section | Component/API | Test Approach |
|----|--------------|---------------|---------------|
| AC-3.1.1 - AC-3.1.6 | Data Models, APIs | `tier-tracker.ts` | Unit: Mock DB, verify JSONB updates |
| AC-3.2.1 - AC-3.2.9 | Workflows, Integrations | Existing handlers + hooks | Integration: Test each handler calls recordAction |
| AC-3.3.1 - AC-3.3.6 | APIs, Workflows | `tier-progress-handler.ts` | Unit: Test celebration conditions |
| AC-3.4.1 - AC-3.4.4 | Workflows | `tier-tracker.ts` | Unit: Test out-of-order scenarios |
| AC-3.5.1 - AC-3.5.5 | APIs | `opt-out-handler.ts` | Unit: Test command matching |
| AC-3.6.1 - AC-3.6.4 | Observability | PostHog calls | Integration: Verify event payloads |

---

## Risks, Assumptions, Open Questions

### Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| **R1:** Handler modifications break existing functionality | Medium | High | Add hooks carefully, test thoroughly |
| **R2:** JSONB updates not atomic | Low | Medium | Use single UPDATE with jsonb_set |
| **R3:** Tier tracking slows down handlers | Low | Medium | Make tracking async/non-blocking |

### Assumptions

| Assumption | Validation |
|------------|------------|
| **A1:** All target handlers exist and are stable | Verified in codebase |
| **A2:** PostHog client available in WhatsApp bot | Verified - `posthog-node` in package.json |
| **A3:** Epic 1 infrastructure (JSONB column, types, constants) complete | Verified in sprint-status |

### Open Questions

| Question | Status | Resolution |
|----------|--------|------------|
| **Q1:** Should "edit_category" count for both Tier 1 and Tier 3? | Resolved | No - Tier 1 uses different action. Per PRD: T1="edit expense category", T3="edit a category" (the category itself). Disambiguate as `edit_expense_category` vs `edit_category_definition` |
| **Q2:** What if user completes Tier 2 before Tier 1? | Resolved | Both celebrate independently when complete. No forced order. |

---

## Test Strategy Summary

### Unit Tests

| Target | Test File | Coverage |
|--------|-----------|----------|
| `recordAction()` | `tier-tracker.test.ts` | Single action, multiple actions, duplicate action |
| `checkTierCompletion()` | `tier-tracker.test.ts` | Partial tier, complete tier, all tiers |
| `getTierProgress()` | `tier-tracker.test.ts` | Empty progress, partial, complete |
| Celebration logic | `tier-progress-handler.test.ts` | Tips enabled/disabled, each tier |
| Opt-out commands | `opt-out-handler.test.ts` | pt-BR, en, case variations |

### Integration Tests

| Target | Test File | Coverage |
|--------|-----------|----------|
| Handler hooks | `tier-action-hooks.test.ts` | Each handler calls recordAction |
| Full tier journey | `tier-journey.test.ts` | Complete all 3 tiers, verify celebrations |
| Out-of-order completion | `tier-journey.test.ts` | Tier 2 before Tier 1 |

### Manual Verification

| Target | Checklist |
|--------|-----------|
| Celebration messages | Review tone, emoji count |
| Handler integration | Test each action in WhatsApp |

---

## Implementation Notes

### JSONB Update Pattern

Use PostgreSQL's `jsonb_set` for atomic updates:

```sql
UPDATE user_profiles
SET onboarding_tier_progress = jsonb_set(
  COALESCE(onboarding_tier_progress, '{}'),
  '{tier1,add_expense}',
  'true'::jsonb
)
WHERE id = $1
RETURNING onboarding_tier_progress;
```

### Async/Non-Blocking Pattern

```typescript
// In handler - fire and forget
recordAction(userId, 'add_expense').catch(err => {
  logger.error('Tier tracking failed', { userId, action: 'add_expense', error: err })
  // Don't throw - primary handler should still succeed
})

// Return primary response immediately
return formatExpenseResponse(expense, locale)
```

### Tip Preference Storage

Add column to user_profiles if not already present (check Epic 1 migration):

```sql
-- May need to add if not in 033_engagement_system.sql
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS onboarding_tips_enabled BOOLEAN DEFAULT true;
```

### Localization Keys Used

From `localization/pt-br.ts` (Epic 1):
- `engagementTier1Complete` - "Você já dominou o básico! Quer ir além?..."
- `engagementTier2Complete` - "Você não está só rastreando—está planejando!..."
- `engagementTier3Complete` - "Você é um profissional agora!..."
- `engagementTipsDisabled` - "Dicas desativadas. Envie 'ativar dicas' para reativar."
- `engagementTipsEnabled` - "Dicas ativadas! Você receberá sugestões após ações."

---

_Generated by BMAD Epic Tech Context Workflow_
_Date: 2025-11-22_
_For: Lucas_
_Epic: 3 - Progressive Tier Journey_
