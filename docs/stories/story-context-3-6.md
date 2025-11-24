# Story Context: 3-6 Tier Completion Analytics

**Generated:** 2025-11-22
**Story:** [3-6-tier-completion-analytics.md](3-6-tier-completion-analytics.md)

---

## Code References

### Primary Implementation Target

**File:** `whatsapp-bot/src/services/onboarding/tier-tracker.ts`
**Location:** Lines 306-344 (recordAction function - tier completion handling)

```typescript
// Gap: PostHog event NOT fired when tier completes
// Need to add trackEvent('onboarding_tier_completed', ...) at line ~344
```

### Analytics Infrastructure (Exists)

| File | Purpose |
|------|---------|
| `whatsapp-bot/src/analytics/posthog-client.ts` | PostHog singleton client |
| `whatsapp-bot/src/analytics/tracker.ts` | `trackEvent(event, userId, properties)` function |
| `whatsapp-bot/src/analytics/events.ts` | Event enum (add new event here) |
| `whatsapp-bot/src/analytics/index.ts` | Re-exports trackEvent |

### Existing Tier Tracker Code

**recordAction()** already:
- Detects tier completion (`newlyCompletedTier` at line 303)
- Sets `completed_at` timestamp (lines 306-317)
- Updates `onboarding_tier` column (lines 319-332)
- Returns `TierUpdate` with `tierCompleted` value

**Missing:** PostHog analytics event fire

### TierProgress Type (from types.ts)

```typescript
interface TierProgress {
  tier1: {
    add_expense: boolean
    edit_category: boolean
    delete_expense: boolean
    add_category: boolean
    completed_at?: string
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
  magic_moment_at?: string
}
```

### Test File

**File:** `whatsapp-bot/src/__tests__/services/onboarding/tier-tracker.test.ts`
- 34 existing tests
- Need to add Story 3.6 tests for PostHog event firing

---

## Implementation Plan

### Task 1: Add PostHog Event in recordAction()

Location: `tier-tracker.ts:344` (after tier completion logic, before return)

```typescript
// Fire PostHog analytics event (Story 3.6)
if (newlyCompletedTier !== null) {
  const daysSinceSignup = await calculateDaysSinceSignup(userId)
  const timeToComplete = calculateTimeToComplete(
    currentProgress,
    newlyCompletedTier,
    daysSinceSignup
  )

  trackEvent('onboarding_tier_completed', userId, {
    tier: newlyCompletedTier,
    completed_at: now,
    time_to_complete_days: timeToComplete,
    days_since_signup: daysSinceSignup,
  })
}
```

### Task 2: Helper Functions

```typescript
async function calculateDaysSinceSignup(userId: string): Promise<number> {
  const supabase = getSupabaseClient()
  const { data } = await supabase
    .from('user_profiles')
    .select('created_at')
    .eq('user_id', userId)
    .single()

  if (!data?.created_at) return 0

  const signupDate = new Date(data.created_at)
  const now = new Date()
  return Math.floor((now.getTime() - signupDate.getTime()) / (1000 * 60 * 60 * 24))
}

function calculateTimeToComplete(
  progress: TierProgress,
  tier: 1 | 2 | 3,
  daysSinceSignup: number
): number {
  const now = new Date()

  if (tier === 1) {
    // From signup to Tier 1 completion
    return daysSinceSignup
  }

  // From previous tier completion to this tier
  const prevTierKey = `tier${tier - 1}` as 'tier1' | 'tier2'
  const prevCompletedAt = progress[prevTierKey].completed_at

  if (!prevCompletedAt) {
    // Fallback: use days since signup
    return daysSinceSignup
  }

  const prevDate = new Date(prevCompletedAt)
  return Math.floor((now.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24))
}
```

### Task 3: Unit Tests

Add to `tier-tracker.test.ts`:
- Test Tier 1 completion fires event with correct properties
- Test Tier 2 completion calculates time from T1 completion
- Test Tier 3 completion calculates time from T2 completion
- Test event payload structure matches AC-3.6.2

---

## Acceptance Criteria Mapping

| AC | Implementation |
|----|----------------|
| AC-3.6.1 | `trackEvent('onboarding_tier_completed', ...)` in recordAction() |
| AC-3.6.2 | Event properties: tier, completed_at, time_to_complete_days, days_since_signup |
| AC-3.6.3 | Verified by PostHog query: count tier=2 / count tier=1 |
| AC-3.6.4 | Verified by PostHog query: avg(time_to_complete_days) group by tier |

---

## Dependencies

- `trackEvent` from `../../analytics/index.js` (already imported in tier-tracker.ts:18)
- `getSupabaseClient` (already imported)
- `TierProgress` type (already imported)

---

## Risks

| Risk | Mitigation |
|------|------------|
| Extra DB query for created_at | Optimize: fetch created_at in same query as tier_progress |
| PostHog not configured | trackEvent handles null client gracefully |

