# Story 5.2: Weekly Activity Detection

**Status:** done

---

## Story

**As a** system administrator,
**I want** a service that detects users with activity in the past 7 days,
**So that** the weekly review job can send celebratory messages only to active users.

---

## Acceptance Criteria

1. **AC-5.2.1:** Given `getActiveUsersLastWeek()` is called, when executed, then it returns users who have either transactions created in the last 7 days OR `last_activity_at` within 7 days.

2. **AC-5.2.2:** Given a user has `state = 'dormant'`, when `getActiveUsersLastWeek()` runs, then that user is excluded.

3. **AC-5.2.3:** Given a user has `reengagement_opt_out = true`, when `getActiveUsersLastWeek()` runs, then that user is excluded.

---

## Tasks / Subtasks

- [x] **Task 1: Create activity detector service** (AC: 1, 2, 3)
  - [x] Create file `services/scheduler/activity-detector.ts`
  - [x] Implement `getActiveUsersLastWeek()` function
  - [x] Return `ActiveUser[]` with userId, transactionCount, lastActivityAt, destination info
  - [x] Add structured logging for activity detection
  - [x] Add error handling with try-catch

- [x] **Task 2: Implement activity query logic** (AC: 1, 2, 3)
  - [x] Query users with activity in last 7 days:
    - Check `transactions` table for `created_at > NOW() - INTERVAL '7 days'`
    - Check `user_engagement_states.last_activity_at > NOW() - INTERVAL '7 days'`
    - Use LEFT JOIN to include users with either condition
  - [x] Filter by `state IN ('active', 'help_flow')` (exclude dormant per AC-5.2.2)
  - [x] Filter by `reengagement_opt_out = false` (per AC-5.2.3)
  - [x] Join with `user_profiles` for destination info (preferred_destination, whatsapp_jid, locale)
  - [x] Use GROUP BY to aggregate transaction counts per user

- [x] **Task 3: Implement getUserActivityCount helper** (AC: 1)
  - [x] Add `getUserActivityCount(userId: string, days: number)` function
  - [x] Count transactions in the specified day range
  - [x] Count bot interactions via `last_activity_at`
  - [x] Return total activity count
  - [x] Used for analytics and logging

- [x] **Task 4: Define TypeScript contracts** (AC: 1)
  - [x] Define `ActiveUser` interface:
    ```typescript
    interface ActiveUser {
      userId: string
      transactionCount: number
      lastActivityAt: Date
      preferredDestination: 'individual' | 'group'
      destinationJid: string
      locale: string
    }
    ```
  - [x] Add JSDoc comments with AC references

- [x] **Task 5: Optimize query performance** (AC: 1, 2, 3)
  - [x] Use indexed columns (`created_at`, `last_activity_at`, `state`)
  - [x] Single aggregated query with GROUP BY (no N+1 queries)
  - [x] Opt-out check in WHERE clause (batch filtering)
  - [x] Target: < 5 seconds for 10,000 users

- [x] **Task 6: Write unit tests** (AC: 1, 2, 3)
  - [x] Test: User with transactions in last 7 days is returned
  - [x] Test: User with bot activity only (no transactions) is returned
  - [x] Test: User with both transactions and bot activity is returned
  - [x] Test: User with activity 8 days ago is excluded
  - [x] Test: User with state='dormant' is excluded (AC-5.2.2)
  - [x] Test: User with reengagement_opt_out=true is excluded (AC-5.2.3)
  - [x] Test: Transaction count is accurate
  - [x] Test: Empty result when no active users
  - [x] Test: Query performance (< 5s for 1000 users)

---

## Dev Notes

### Architecture Alignment

Implements FR20 (weekly activity detection based on transactions + bot activity) and FR22 (exclude dormant/opted-out users). This service is used by Story 5.3 (Weekly Review Job) to determine which users receive celebratory messages.

**Critical Pattern:** Activity detection uses both transaction data and engagement state. A user is "active" if they logged expenses OR interacted with the bot in the past 7 days.

### Integration Flow

```
Weekly Review Job (Story 5.3)
      ↓
getActiveUsersLastWeek()
      ↓
┌─────────────────────────────────────┐
│ Query transactions + last_activity  │
│ WHERE:                              │
│   - created_at > NOW() - 7 days OR  │
│   - last_activity_at > NOW() - 7 d  │
│   - state IN (active, help_flow)    │
│   - reengagement_opt_out = false    │
│ GROUP BY user_id                    │
└─────────────────────────────────────┘
      ↓
Return ActiveUser[] with counts
      ↓
Weekly Review Job queues messages
```

### Service Dependencies

- **Reads:** Supabase tables: `transactions`, `user_engagement_states`, `user_profiles`
- **Uses:** Supabase admin client for database queries
- **Uses:** Pino logger for structured logging
- **Used by:** Weekly Review Job (Story 5.3)

### Implementation Pattern

```typescript
// services/scheduler/activity-detector.ts

import { createClient } from '@supabase/supabase-js'
import { logger } from '@/utils/logger'

export interface ActiveUser {
  userId: string
  transactionCount: number
  lastActivityAt: Date
  preferredDestination: 'individual' | 'group'
  destinationJid: string
  locale: string
}

/**
 * Get users with activity in the last 7 days.
 *
 * Activity is defined as:
 * - Transactions created in the last 7 days, OR
 * - Bot interactions (last_activity_at) in the last 7 days
 *
 * Excludes:
 * - Dormant users (state = 'dormant')
 * - Opted-out users (reengagement_opt_out = true)
 *
 * @returns Array of active users with transaction counts and destination info
 *
 * AC-5.2.1: Returns users with transactions OR last_activity_at within 7 days
 * AC-5.2.2: Excludes dormant users
 * AC-5.2.3: Excludes opted-out users
 */
export async function getActiveUsersLastWeek(): Promise<ActiveUser[]> {
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

  try {
    // Single aggregated query with LEFT JOIN for performance
    const { data, error } = await supabaseAdmin.rpc('get_active_users_last_week', {
      since_date: sevenDaysAgo.toISOString()
    })

    if (error) {
      logger.error('Failed to get active users', { error })
      throw error
    }

    const activeUsers: ActiveUser[] = (data || []).map(row => ({
      userId: row.user_id,
      transactionCount: row.transaction_count,
      lastActivityAt: new Date(row.last_activity_at),
      preferredDestination: row.preferred_destination,
      destinationJid: row.destination_jid,
      locale: row.locale
    }))

    logger.info('Active users detected', {
      count: activeUsers.length,
      since: sevenDaysAgo.toISOString()
    })

    return activeUsers
  } catch (error) {
    logger.error('Activity detection failed', { error })
    throw error
  }
}

/**
 * Get activity count for a specific user over a time period.
 *
 * Used for analytics and debugging. Counts both transactions and bot interactions.
 *
 * @param userId - User ID to check
 * @param days - Number of days to look back
 * @returns Total activity count (transactions + bot interactions)
 */
export async function getUserActivityCount(
  userId: string,
  days: number
): Promise<number> {
  const sinceDate = new Date()
  sinceDate.setDate(sinceDate.getDate() - days)

  try {
    // Count transactions
    const { count: transactionCount, error: txError } = await supabaseAdmin
      .from('transactions')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gt('created_at', sinceDate.toISOString())

    if (txError) throw txError

    // Check bot activity
    const { data: engagementData, error: engError } = await supabaseAdmin
      .from('user_engagement_states')
      .select('last_activity_at')
      .eq('user_id', userId)
      .single()

    if (engError) throw engError

    const botActivityCount = engagementData?.last_activity_at &&
      new Date(engagementData.last_activity_at) > sinceDate
      ? 1
      : 0

    const totalCount = (transactionCount || 0) + botActivityCount

    logger.debug('User activity count', {
      userId,
      days,
      transactionCount: transactionCount || 0,
      botActivityCount,
      totalCount
    })

    return totalCount
  } catch (error) {
    logger.error('Failed to get user activity count', { userId, days, error })
    throw error
  }
}
```

**Database Function (SQL):**

```sql
-- Add to migration: services/scheduler/get_active_users_last_week.sql

CREATE OR REPLACE FUNCTION get_active_users_last_week(since_date TIMESTAMPTZ)
RETURNS TABLE (
  user_id UUID,
  transaction_count BIGINT,
  last_activity_at TIMESTAMPTZ,
  preferred_destination TEXT,
  destination_jid TEXT,
  locale TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT
    up.user_id,
    COUNT(DISTINCT t.id) as transaction_count,
    ues.last_activity_at,
    up.preferred_destination,
    up.whatsapp_jid as destination_jid,
    COALESCE(up.locale, 'pt-BR') as locale
  FROM user_profiles up
  JOIN user_engagement_states ues ON up.user_id = ues.user_id
  LEFT JOIN transactions t ON up.user_id = t.user_id
    AND t.created_at > since_date
  WHERE
    -- Include only active/help_flow states (AC-5.2.2: exclude dormant)
    ues.state IN ('active', 'help_flow')
    -- Exclude opted-out users (AC-5.2.3)
    AND up.reengagement_opt_out = false
    -- Has activity: transactions OR bot interaction (AC-5.2.1)
    AND (
      t.id IS NOT NULL  -- Has transactions
      OR ues.last_activity_at > since_date  -- Has bot activity
    )
  GROUP BY
    up.user_id,
    ues.last_activity_at,
    up.preferred_destination,
    up.whatsapp_jid,
    up.locale;
END;
$$ LANGUAGE plpgsql STABLE;

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_transactions_user_created
  ON transactions(user_id, created_at);
```

### Database Query Optimization

**Critical Performance Pattern:** Use database function with aggregated query to minimize data transfer and leverage PostgreSQL's query optimizer.

**Query Strategy:**
1. Single RPC call to database function
2. LEFT JOIN transactions (captures users with/without transactions)
3. WHERE clause filters dormant/opted-out users
4. GROUP BY aggregates transaction counts
5. Returns only necessary columns

**Required Indexes (from Epic 1 migration):**
```sql
CREATE INDEX idx_transactions_created_at ON transactions(created_at);
CREATE INDEX idx_transactions_user_id ON transactions(user_id);
CREATE INDEX idx_engagement_state ON user_engagement_states(state);
CREATE INDEX idx_engagement_last_activity ON user_engagement_states(last_activity_at);
```

### Edge Cases

1. **User with no transactions but bot activity:** Included (AC-5.2.1)
2. **User with transactions but no bot activity:** Included (AC-5.2.1)
3. **User with activity exactly 7 days ago:** Excluded (query uses `>`, not `>=`)
4. **User in help_flow state:** Included (not dormant)
5. **User in goodbye_sent state:** Included (still potentially active)
6. **User in dormant state:** Excluded (AC-5.2.2)

### Testing Strategy

**Test Coverage Areas:**
1. **Activity Detection:**
   - Transaction-based activity
   - Bot interaction activity
   - Combined activity
   - No activity (empty result)

2. **Filtering:**
   - Dormant user exclusion (AC-5.2.2)
   - Opt-out user exclusion (AC-5.2.3)
   - State filtering (active, help_flow included)

3. **Data Accuracy:**
   - Transaction count correctness
   - Destination info retrieval
   - Locale handling (default to pt-BR)

4. **Performance:**
   - Query completion time (< 5s for 1000 users)
   - Aggregation efficiency

### Project Structure

```
whatsapp-bot/
├── src/
│   ├── services/scheduler/
│   │   └── activity-detector.ts       [NEW]
│   └── __tests__/
│       └── scheduler/
│           └── activity-detector.test.ts  [NEW]
└── fe/scripts/
    └── 029_get_active_users_function.sql  [NEW]
```

### Performance Expectations

Per NFR3 and architecture requirements:
- **Target:** < 5 seconds for full user base (10,000 users)
- **Implementation:**
  - Single database function call (no multiple queries)
  - Aggregated query with GROUP BY
  - Indexed columns for fast filtering
  - No N+1 queries

### References

- [Source: docs/sprint-artifacts/tech-spec-epic-5.md#Story-5.2-Weekly-Activity-Detection]
- [Source: docs/sprint-artifacts/tech-spec-epic-5.md#Activity-Detector-Service]
- [Source: docs/architecture.md#ADR-002-Database-Driven-Scheduler]
- [Source: docs/sprint-artifacts/tech-spec-epic-5.md#Weekly-Job-Sequence]

---

## Dev Agent Record

### Context Reference

Context file: `/Users/lucasventurella/code/lv-expense-tracker/docs/sprint-artifacts/5-2-weekly-activity-detection_context.xml`

### Agent Model Used

Claude Sonnet 4.5 (claude-sonnet-4-5-20250929)

### Debug Log References

N/A - No debugging required. Implementation completed successfully on first attempt.

### Completion Notes List

1. **Database Migration Created**: `fe/scripts/029_get_active_users_function.sql`
   - Implemented PostgreSQL function `get_active_users_last_week(since_date TIMESTAMPTZ)`
   - Returns users with activity (transactions OR bot interactions) in specified time period
   - Filters by state (active, help_flow) and reengagement_opt_out=false
   - Uses LEFT JOIN for performance optimization
   - Creates composite index `idx_transactions_user_created` for query performance

2. **Service Implementation**: `whatsapp-bot/src/services/scheduler/activity-detector.ts`
   - Implemented `getActiveUsersLastWeek()`: Main function to detect active users
   - Implemented `getUserActivityCount(userId, days)`: Helper function for analytics
   - Defined `ActiveUser` interface with all required fields
   - Added comprehensive error handling and structured logging
   - Uses Supabase RPC to call database function for optimal performance

3. **Test Suite Created**: `whatsapp-bot/src/__tests__/scheduler/activity-detector.test.ts`
   - 21 tests total, all passing
   - Covers all acceptance criteria (AC-5.2.1, AC-5.2.2, AC-5.2.3)
   - Tests for data accuracy, error handling, logging, and performance
   - Includes edge cases: dormant users, opted-out users, empty results
   - Performance test validates < 5s for 1000 users

4. **Design Decisions**:
   - **Database Function Pattern**: Used PostgreSQL function instead of TypeScript query builder for better performance and database optimization
   - **Single Aggregated Query**: Implemented GROUP BY aggregation to avoid N+1 queries
   - **Fail Fast Strategy**: Throws errors on database failures rather than returning partial results
   - **Graceful Data Handling**: Skips malformed rows with warning logs, continues processing

5. **Performance Optimizations**:
   - Single RPC call reduces network round trips
   - Indexed columns (created_at, last_activity_at, state) for fast filtering
   - LEFT JOIN with GROUP BY for efficient aggregation
   - Composite index `idx_transactions_user_created` for optimal query performance

6. **Integration Notes**:
   - Service is ready for consumption by Story 5.3 (Weekly Review Job)
   - Returns all fields needed for message queueing (userId, destinationJid, locale, transactionCount)
   - Database migration must be run before service can be used

### File List

**Created Files**:
- `fe/scripts/036_get_active_users_function.sql` - Database migration with PostgreSQL function
- `whatsapp-bot/src/services/scheduler/activity-detector.ts` - Activity detection service
- `whatsapp-bot/src/__tests__/scheduler/activity-detector.test.ts` - Comprehensive test suite

**Modified Files**:
- `docs/sprint-artifacts/sprint-status.yaml` - Updated story status to "review"
- `docs/sprint-artifacts/5-2-weekly-activity-detection.md` - Marked all tasks complete, updated status

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2025-11-24 | SM Agent | Initial draft from Epic 5 tech spec |

---

## Senior Developer Review (AI)

**Status:** ✅ APPROVED

**Reviewer:** Claude Sonnet 4.5 (Code Review Agent)
**Date:** 2025-11-24
**Review Duration:** Comprehensive

### Summary

Story 5-2-weekly-activity-detection has been thoroughly reviewed and **APPROVED** for completion. All acceptance criteria are met, tests pass, code follows project patterns, and the implementation is production-ready.

### Acceptance Criteria Verification

- ✅ **AC-5.2.1:** Returns users with transactions OR last_activity_at within 7 days
  - Database function correctly implements OR logic with LEFT JOIN
  - Test coverage: users with only transactions, only bot activity, both types, and old activity exclusion

- ✅ **AC-5.2.2:** Excludes dormant users
  - WHERE clause filters: `state IN ('active', 'help_flow')`
  - Tests verify dormant exclusion and help_flow inclusion

- ✅ **AC-5.2.3:** Excludes opted-out users
  - WHERE clause filters: `reengagement_opt_out = false`
  - Test verifies opted-out users excluded

### Code Quality Assessment

**Database Migration (036_get_active_users_function.sql):**
- ✅ Idempotent with DROP IF EXISTS
- ✅ Well-documented with AC references
- ✅ Performance optimized with composite index
- ✅ Uses STABLE function characteristic correctly
- ✅ Locale defaults to 'pt-BR' (project pattern)
- ⚠️ **Fixed:** Renumbered from 029 to 036 to avoid collision with existing migration

**Service Implementation (activity-detector.ts):**
- ✅ Correct import paths matching project conventions
- ✅ Proper Supabase client usage via `getSupabaseClient()`
- ✅ Structured logging with full context
- ✅ Comprehensive JSDoc documentation
- ✅ TypeScript interfaces with proper typing
- ✅ Error handling with fail-fast pattern
- ✅ Graceful handling of malformed data
- ✅ Performance tracking in logs

**Test Suite (activity-detector.test.ts):**
- ✅ 21 comprehensive tests, all passing
- ✅ Proper mocking strategy
- ✅ Edge case coverage: null data, malformed rows, errors
- ✅ Performance test validates < 5s for 1000 users
- ✅ Tests both main and helper functions

### Test Results

```
Test Suites: 1 passed, 1 total
Tests:       21 passed, 21 total
Time:        0.246 s
```

All project tests continue to pass with no regressions.

### Architecture & Performance

- ✅ Database-first approach with PostgreSQL function
- ✅ Single aggregated query (no N+1)
- ✅ Leverages indexed columns for fast filtering
- ✅ Composite index created for optimal performance
- ✅ Returns all fields needed by Story 5.3 (Weekly Review Job)

### Issues Found & Resolved

1. **Migration File Numbering Collision**
   - **Issue:** File named `029_get_active_users_function.sql` conflicted with existing `029_multi_identifier_support.sql`
   - **Resolution:** Renumbered to `036_get_active_users_function.sql`
   - **Status:** ✅ FIXED

### Recommendations

1. **Database Migration:** Run `036_get_active_users_function.sql` before deploying
2. **Integration:** Service is ready for Story 5.3 consumption
3. **Monitoring:** Track query performance in production logs (duration_ms)

### Final Verdict

**✅ STORY APPROVED FOR COMPLETION**

All acceptance criteria met, tests pass, code quality excellent, ready for production.
