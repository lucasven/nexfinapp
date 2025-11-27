# Engagement Preferences Analytics - SQL Queries

This document provides SQL queries for analyzing engagement preference data directly from the PostgreSQL database.

## Database Schema Reference

### user_profiles Table

```sql
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  reengagement_opt_out BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

**Key Column**:
- `reengagement_opt_out`: If `true`, user has opted out of re-engagement messages (goodbye messages, weekly reviews). If `false` or `NULL`, user is opted in.

## Core Metrics Queries

### 1. Total Opt-Out Rate

**Purpose**: Calculate the current opt-out rate across all active users

```sql
SELECT
  COUNT(*) as total_users,
  COUNT(*) FILTER (WHERE reengagement_opt_out = true) as opted_out_users,
  COUNT(*) FILTER (WHERE reengagement_opt_out = false OR reengagement_opt_out IS NULL) as opted_in_users,
  ROUND(
    (COUNT(*) FILTER (WHERE reengagement_opt_out = true)::numeric / COUNT(*)::numeric) * 100,
    2
  ) as opt_out_rate_percent
FROM user_profiles
WHERE user_id IN (SELECT id FROM auth.users);
```

**Expected Output**:
```
 total_users | opted_out_users | opted_in_users | opt_out_rate_percent
-------------+-----------------+----------------+---------------------
         150 |              15 |            135 |                10.00
```

**Interpretation**:
- Target: < 10% opt-out rate
- Warning: 10-20% opt-out rate (monitor closely)
- Alert: > 20% opt-out rate (investigate messaging issues)

### 2. Opt-Out Count by Status

**Purpose**: Simple count of opted-out vs opted-in users

```sql
SELECT
  reengagement_opt_out,
  COUNT(*) as user_count
FROM user_profiles
WHERE user_id IN (SELECT id FROM auth.users)
GROUP BY reengagement_opt_out
ORDER BY reengagement_opt_out;
```

**Expected Output**:
```
 reengagement_opt_out | user_count
----------------------+------------
 false                |        135
 true                 |         15
```

### 3. Total User Count

**Purpose**: Get baseline user count for calculating percentages

```sql
SELECT COUNT(*) as total_active_users
FROM user_profiles
WHERE user_id IN (SELECT id FROM auth.users);
```

### 4. Opted-Out Users List

**Purpose**: Retrieve list of users who have opted out (for debugging)

```sql
SELECT
  up.id,
  up.user_id,
  up.reengagement_opt_out,
  up.updated_at as last_preference_change,
  au.email
FROM user_profiles up
JOIN auth.users au ON up.user_id = au.id
WHERE up.reengagement_opt_out = true
ORDER BY up.updated_at DESC
LIMIT 50;
```

**Note**: Be mindful of LGPD/privacy when accessing user emails. Use only for legitimate debugging purposes.

## Time-Series Queries

### 5. Users Created vs Opted-Out Over Time

**Purpose**: Track when users were created vs when they opted out

```sql
SELECT
  DATE(up.created_at) as date,
  COUNT(*) as users_created,
  COUNT(*) FILTER (WHERE up.reengagement_opt_out = true) as opted_out
FROM user_profiles up
WHERE up.created_at >= now() - interval '30 days'
GROUP BY DATE(up.created_at)
ORDER BY date DESC;
```

**Note**: This shows current opt-out status, not when they opted out. For historical opt-out tracking, use PostHog events.

### 6. Recent Preference Changes

**Purpose**: Identify users who recently changed preferences (based on updated_at)

```sql
SELECT
  DATE(updated_at) as date,
  COUNT(*) as preferences_changed
FROM user_profiles
WHERE updated_at >= now() - interval '7 days'
  AND updated_at > created_at + interval '1 minute' -- Exclude initial creation
GROUP BY DATE(updated_at)
ORDER BY date DESC;
```

**Limitation**: `updated_at` may change for reasons other than preference changes. For accurate preference change tracking, use PostHog events.

## Comparison Queries

### 7. Opt-Out Rate Comparison (Current vs Historical)

**Purpose**: Compare current opt-out rate to a baseline

```sql
WITH current_rate AS (
  SELECT
    ROUND(
      (COUNT(*) FILTER (WHERE reengagement_opt_out = true)::numeric / COUNT(*)::numeric) * 100,
      2
    ) as rate
  FROM user_profiles
  WHERE user_id IN (SELECT id FROM auth.users)
),
baseline AS (
  SELECT 10.0 as target_rate -- Target: < 10% opt-out
)
SELECT
  c.rate as current_opt_out_rate,
  b.target_rate,
  c.rate - b.target_rate as difference,
  CASE
    WHEN c.rate <= b.target_rate THEN 'HEALTHY'
    WHEN c.rate <= 20.0 THEN 'WARNING'
    ELSE 'CRITICAL'
  END as status
FROM current_rate c, baseline b;
```

**Expected Output**:
```
 current_opt_out_rate | target_rate | difference | status
----------------------+-------------+------------+---------
                10.00 |       10.00 |       0.00 | HEALTHY
```

## User Segmentation Queries

### 8. Opt-Out Rate by User Tenure

**Purpose**: Identify if newer or older users opt out more frequently

```sql
SELECT
  CASE
    WHEN up.created_at >= now() - interval '7 days' THEN '0-7 days'
    WHEN up.created_at >= now() - interval '30 days' THEN '8-30 days'
    WHEN up.created_at >= now() - interval '90 days' THEN '31-90 days'
    ELSE '90+ days'
  END as user_age_group,
  COUNT(*) as total_users,
  COUNT(*) FILTER (WHERE reengagement_opt_out = true) as opted_out,
  ROUND(
    (COUNT(*) FILTER (WHERE reengagement_opt_out = true)::numeric / COUNT(*)::numeric) * 100,
    2
  ) as opt_out_rate_percent
FROM user_profiles up
WHERE up.user_id IN (SELECT id FROM auth.users)
GROUP BY user_age_group
ORDER BY
  CASE user_age_group
    WHEN '0-7 days' THEN 1
    WHEN '8-30 days' THEN 2
    WHEN '31-90 days' THEN 3
    ELSE 4
  END;
```

**Expected Insight**: If newer users opt out more, onboarding may be too aggressive. If older users opt out more, engagement cadence may be too frequent.

## Validation Queries

### 9. Data Quality Check

**Purpose**: Ensure data integrity in reengagement_opt_out column

```sql
SELECT
  COUNT(*) as total_records,
  COUNT(*) FILTER (WHERE reengagement_opt_out IS NULL) as null_values,
  COUNT(*) FILTER (WHERE reengagement_opt_out = true) as true_values,
  COUNT(*) FILTER (WHERE reengagement_opt_out = false) as false_values,
  COUNT(*) FILTER (WHERE reengagement_opt_out IS NOT NULL) as non_null_values
FROM user_profiles;
```

**Expected**: Very few or zero NULL values (should default to `false`).

### 10. Cross-Check with Active Users

**Purpose**: Verify all active users have profiles

```sql
SELECT
  (SELECT COUNT(*) FROM auth.users) as total_auth_users,
  (SELECT COUNT(*) FROM user_profiles WHERE user_id IN (SELECT id FROM auth.users)) as users_with_profiles,
  (SELECT COUNT(*) FROM auth.users WHERE id NOT IN (SELECT user_id FROM user_profiles)) as users_without_profiles;
```

**Expected**: `users_without_profiles` should be 0 or very low (new users may not have profiles yet).

## Performance Optimization

### Index Recommendations

For optimal query performance with large datasets (>10,000 users):

```sql
-- Index on reengagement_opt_out for fast filtering
CREATE INDEX IF NOT EXISTS idx_user_profiles_reengagement_opt_out
ON user_profiles(reengagement_opt_out);

-- Index on updated_at for time-series queries
CREATE INDEX IF NOT EXISTS idx_user_profiles_updated_at
ON user_profiles(updated_at);

-- Composite index for active opted-out users
CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id_opt_out
ON user_profiles(user_id, reengagement_opt_out);
```

**Note**: Check existing indexes before creating new ones:
```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'user_profiles';
```

### Query Optimization Tips

1. **Use EXPLAIN ANALYZE** to identify slow queries:
   ```sql
   EXPLAIN ANALYZE
   SELECT COUNT(*) FILTER (WHERE reengagement_opt_out = true) as opted_out
   FROM user_profiles;
   ```

2. **Filter early** in WHERE clauses to reduce rows scanned:
   ```sql
   -- Good: Filter in WHERE
   SELECT COUNT(*) FROM user_profiles WHERE reengagement_opt_out = true;

   -- Less efficient: Filter in FILTER clause
   SELECT COUNT(*) FILTER (WHERE reengagement_opt_out = true) FROM user_profiles;
   ```

3. **Use read replicas** for analytics queries to avoid impacting production:
   - Configure Supabase read replica connection string
   - Route analytics queries to replica

## Execution Methods

### Option 1: Supabase Dashboard

1. Navigate to: `supabase.com/dashboard/project/{project-ref}/sql`
2. Paste query into SQL editor
3. Click "Run" to execute
4. Results displayed in table format
5. Export to CSV if needed

### Option 2: psql CLI

```bash
# Set database URL from environment
export DATABASE_URL="postgresql://postgres:password@host:5432/database"

# Execute query from file
psql $DATABASE_URL < query.sql

# Interactive psql session
psql $DATABASE_URL

# Execute inline query
psql $DATABASE_URL -c "SELECT COUNT(*) FROM user_profiles WHERE reengagement_opt_out = true;"
```

### Option 3: Node.js Script

```typescript
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

const { data, error } = await supabase
  .from('user_profiles')
  .select('*', { count: 'exact', head: true })

console.log('Total users:', data?.count)
```

## Limitations & Alternatives

### Database State vs Event History

**Database State**:
- Shows current opt-out status only
- Cannot track historical changes (when user opted out, then back in)
- Cannot attribute opt-outs to specific sources (WhatsApp vs web)

**PostHog Events** (Recommended for Historical Data):
- Track every preference change with timestamp and source
- Enable trend analysis and opt-back-in funnel
- See [engagement-preferences.md](./engagement-preferences.md) for PostHog queries

### Opt-Back-In Count

To calculate how many users opted out then back in, use **PostHog events** instead of database queries. The database only stores current state, not history.

**PostHog Query**:
```
Event: engagement_preference_changed
Filter:
  - Step 1: preference = 'opted_out'
  - Step 2: preference = 'opted_in' (within 30 days)
Chart: Funnel
```

## Troubleshooting

### Issue: Query Timeout

**Cause**: Large dataset (>100k users), no indexes, or complex joins

**Solution**:
- Add indexes (see Performance Optimization section)
- Use LIMIT clauses for testing
- Run queries during off-peak hours
- Use read replica connection

### Issue: Incorrect Counts

**Cause**: Including deleted users or test accounts

**Solution**:
- Always join with `auth.users` to filter active users only
- Exclude test accounts: `WHERE email NOT LIKE '%test%'`
- Verify `user_id` foreign key integrity

### Issue: NULL Values in reengagement_opt_out

**Cause**: Migration didn't set default, or legacy data

**Solution**:
```sql
-- Update NULL values to false (opted-in by default)
UPDATE user_profiles
SET reengagement_opt_out = false
WHERE reengagement_opt_out IS NULL;

-- Add NOT NULL constraint
ALTER TABLE user_profiles
ALTER COLUMN reengagement_opt_out SET DEFAULT false,
ALTER COLUMN reengagement_opt_out SET NOT NULL;
```

## Data Privacy & LGPD Compliance

### Safe Queries

These queries use anonymized data (UUIDs, aggregates):
- Opt-out rate calculations
- User counts by segment
- Time-series aggregates

### Queries Requiring Caution

These queries expose PII and require legitimate purpose:
- Queries joining with `auth.users.email`
- Individual user opt-out lists
- Cross-referencing with transaction data

**Guideline**: Use aggregate queries for metrics. Only access individual user data for debugging specific issues with user consent.

## Related Documentation

- [PostHog Events Documentation](./engagement-preferences.md) - Event-based analytics
- [Scheduler Metrics Documentation](./scheduler-metrics.md) - Log-based analytics
- [Sample Queries File](../../scripts/analytics/sample-queries.sql) - Executable SQL examples

## References

- Database Schema: `fe/scripts/034_engagement_system.sql`
- Tech Spec: `docs/sprint-artifacts/tech-spec-epic-6.md#AC-6.5`
- Story: `docs/sprint-artifacts/6-5-analytics-dashboard-access.md`
