-- ==============================================================================
-- Engagement Preferences Analytics - Sample SQL Queries
-- ==============================================================================
--
-- This file contains executable SQL queries for analyzing engagement preference
-- data directly from the PostgreSQL database.
--
-- Usage:
--   1. Via psql: psql $DATABASE_URL < scripts/analytics/sample-queries.sql
--   2. Via Supabase Dashboard: Copy-paste queries into SQL editor
--   3. Via Node.js: Use Supabase client to execute queries
--
-- References:
--   - Full documentation: docs/analytics/sql-queries.md
--   - Tech Spec: docs/sprint-artifacts/tech-spec-epic-6.md#AC-6.5
-- ==============================================================================

-- ==============================================================================
-- 1. TOTAL OPT-OUT RATE
-- ==============================================================================
--
-- Purpose: Calculate the current opt-out rate across all active users
-- Expected: < 10% healthy, 10-20% warning, > 20% critical
--

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

-- Expected output:
--  total_users | opted_out_users | opted_in_users | opt_out_rate_percent
-- -------------+-----------------+----------------+---------------------
--          150 |              15 |            135 |                10.00


-- ==============================================================================
-- 2. OPT-OUT COUNT BY STATUS
-- ==============================================================================
--
-- Purpose: Simple count of opted-out vs opted-in users
--

SELECT
  reengagement_opt_out,
  COUNT(*) as user_count
FROM user_profiles
WHERE user_id IN (SELECT id FROM auth.users)
GROUP BY reengagement_opt_out
ORDER BY reengagement_opt_out;

-- Expected output:
--  reengagement_opt_out | user_count
-- ----------------------+------------
--  false                |        135
--  true                 |         15


-- ==============================================================================
-- 3. TOTAL USER COUNT
-- ==============================================================================
--
-- Purpose: Get baseline user count for calculating percentages
--

SELECT COUNT(*) as total_active_users
FROM user_profiles
WHERE user_id IN (SELECT id FROM auth.users);

-- Expected output:
--  total_active_users
-- --------------------
--                 150


-- ==============================================================================
-- 4. OPTED-OUT USERS LIST (DEBUG ONLY)
-- ==============================================================================
--
-- Purpose: Retrieve list of users who have opted out
-- WARNING: Contains PII (email). Use only for legitimate debugging.
--

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

-- Expected output: List of up to 50 opted-out users with emails


-- ==============================================================================
-- 5. OPT-OUT RATE COMPARISON (CURRENT VS TARGET)
-- ==============================================================================
--
-- Purpose: Compare current opt-out rate to target and determine health status
--

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

-- Expected output:
--  current_opt_out_rate | target_rate | difference | status
-- ----------------------+-------------+------------+---------
--                 10.00 |       10.00 |       0.00 | HEALTHY


-- ==============================================================================
-- 6. OPT-OUT RATE BY USER TENURE
-- ==============================================================================
--
-- Purpose: Identify if newer or older users opt out more frequently
-- Insight: If newer users opt out more, onboarding may be too aggressive
--

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

-- Expected output:
--  user_age_group | total_users | opted_out | opt_out_rate_percent
-- ----------------+-------------+-----------+---------------------
--  0-7 days       |          20 |         1 |                 5.00
--  8-30 days      |          30 |         3 |                10.00
--  31-90 days     |          50 |         6 |                12.00
--  90+ days       |          50 |         5 |                10.00


-- ==============================================================================
-- 7. USERS CREATED VS OPTED-OUT OVER TIME
-- ==============================================================================
--
-- Purpose: Track when users were created vs their current opt-out status
-- Note: Shows current state, not when they opted out
--

SELECT
  DATE(up.created_at) as date,
  COUNT(*) as users_created,
  COUNT(*) FILTER (WHERE up.reengagement_opt_out = true) as opted_out
FROM user_profiles up
WHERE up.created_at >= now() - interval '30 days'
GROUP BY DATE(up.created_at)
ORDER BY date DESC
LIMIT 30;

-- Expected output: Daily breakdown of user creation and opt-out status


-- ==============================================================================
-- 8. DATA QUALITY CHECK
-- ==============================================================================
--
-- Purpose: Ensure data integrity in reengagement_opt_out column
-- Expected: Very few or zero NULL values
--

SELECT
  COUNT(*) as total_records,
  COUNT(*) FILTER (WHERE reengagement_opt_out IS NULL) as null_values,
  COUNT(*) FILTER (WHERE reengagement_opt_out = true) as true_values,
  COUNT(*) FILTER (WHERE reengagement_opt_out = false) as false_values,
  COUNT(*) FILTER (WHERE reengagement_opt_out IS NOT NULL) as non_null_values
FROM user_profiles;

-- Expected output:
--  total_records | null_values | true_values | false_values | non_null_values
-- ---------------+-------------+-------------+--------------+-----------------
--            150 |           0 |          15 |          135 |             150


-- ==============================================================================
-- 9. CROSS-CHECK WITH ACTIVE USERS
-- ==============================================================================
--
-- Purpose: Verify all active users have profiles
-- Expected: users_without_profiles should be 0 or very low
--

SELECT
  (SELECT COUNT(*) FROM auth.users) as total_auth_users,
  (SELECT COUNT(*) FROM user_profiles WHERE user_id IN (SELECT id FROM auth.users)) as users_with_profiles,
  (SELECT COUNT(*) FROM auth.users WHERE id NOT IN (SELECT user_id FROM user_profiles)) as users_without_profiles;

-- Expected output:
--  total_auth_users | users_with_profiles | users_without_profiles
-- ------------------+---------------------+-----------------------
--               150 |                 150 |                     0


-- ==============================================================================
-- 10. RECENT PREFERENCE CHANGES (ESTIMATED)
-- ==============================================================================
--
-- Purpose: Identify users who recently changed preferences based on updated_at
-- Limitation: updated_at may change for reasons other than preference changes
-- Recommendation: Use PostHog events for accurate preference change tracking
--

SELECT
  DATE(updated_at) as date,
  COUNT(*) as preferences_changed
FROM user_profiles
WHERE updated_at >= now() - interval '7 days'
  AND updated_at > created_at + interval '1 minute' -- Exclude initial creation
GROUP BY DATE(updated_at)
ORDER BY date DESC;

-- Expected output: Daily count of profile updates (proxy for preference changes)


-- ==============================================================================
-- PERFORMANCE OPTIMIZATION: INDEX RECOMMENDATIONS
-- ==============================================================================
--
-- These indexes improve query performance for large datasets (>10k users)
-- Run these ONLY if experiencing slow query performance
--

-- Index on reengagement_opt_out for fast filtering
-- CREATE INDEX IF NOT EXISTS idx_user_profiles_reengagement_opt_out
-- ON user_profiles(reengagement_opt_out);

-- Index on updated_at for time-series queries
-- CREATE INDEX IF NOT EXISTS idx_user_profiles_updated_at
-- ON user_profiles(updated_at);

-- Composite index for active opted-out users
-- CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id_opt_out
-- ON user_profiles(user_id, reengagement_opt_out);

-- Check existing indexes before creating new ones:
-- SELECT indexname, indexdef
-- FROM pg_indexes
-- WHERE tablename = 'user_profiles';


-- ==============================================================================
-- TROUBLESHOOTING QUERIES
-- ==============================================================================

-- Check current database
-- SELECT current_database();

-- Verify user_profiles table exists
-- SELECT COUNT(*) FROM user_profiles LIMIT 1;

-- Check for NULL values in reengagement_opt_out
-- SELECT COUNT(*) FROM user_profiles WHERE reengagement_opt_out IS NULL;

-- Update NULL values to false (if needed)
-- UPDATE user_profiles
-- SET reengagement_opt_out = false
-- WHERE reengagement_opt_out IS NULL;


-- ==============================================================================
-- NOTES
-- ==============================================================================
--
-- 1. Database State vs Event History:
--    - Database shows current opt-out status only
--    - Cannot track historical changes (when user opted out, then back in)
--    - Cannot attribute opt-outs to specific sources (WhatsApp vs web)
--    - For historical data, use PostHog events (see engagement-preferences.md)
--
-- 2. Opt-Back-In Count:
--    - Cannot be calculated from database alone (no history)
--    - Use PostHog funnel: opted_out → opted_in events
--
-- 3. Privacy & LGPD Compliance:
--    - Use aggregate queries for metrics (safe)
--    - Avoid queries with email/PII unless debugging with user consent
--    - Queries use user_id (UUID) not PII where possible
--
-- 4. Performance:
--    - Queries are optimized for <10k users without indexes
--    - Add indexes if experiencing slow performance (see above)
--    - Use read replica for analytics queries in production
--
-- ==============================================================================
-- END OF QUERIES
-- ==============================================================================
