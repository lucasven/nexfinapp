-- Migration: 037_opt_out_index.sql
-- Purpose: Add index on user_profiles.reengagement_opt_out for scheduler performance
-- Epic: 6 (User Preferences & Web Integration)
-- Story: 6.4 (Opt-Out Respect in Engagement System)
-- AC: 6.4.5 (Performance requirement: < 5s for 10k users)

-- Create index on reengagement_opt_out column
-- This index is used by:
-- 1. Daily engagement job (processInactiveUsers query)
-- 2. Weekly review job (get_active_users_last_week SQL function)
--
-- With 10k+ users, this index ensures scheduler queries complete in < 5 seconds
-- by allowing efficient filtering of opted-out users before queuing messages.
CREATE INDEX IF NOT EXISTS idx_user_profiles_reengagement_opt_out
  ON user_profiles(reengagement_opt_out);

-- Comment for documentation
COMMENT ON INDEX idx_user_profiles_reengagement_opt_out IS
'Performance index for scheduler jobs. Filters opted-out users (Story 6.4). Target: < 5s for 10k users.';

-- ============================================================================
-- VERIFICATION QUERIES (commented out, for manual testing)
-- ============================================================================

-- Verify index was created:
-- SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'user_profiles' AND indexname = 'idx_user_profiles_reengagement_opt_out';

-- Test query performance with EXPLAIN ANALYZE (daily engagement job pattern):
-- EXPLAIN ANALYZE
-- SELECT ues.user_id, ues.last_activity_at, up.reengagement_opt_out
-- FROM user_engagement_states ues
-- INNER JOIN user_profiles up ON ues.user_id = up.id
-- WHERE ues.state = 'active'
--   AND ues.last_activity_at < NOW() - INTERVAL '14 days'
--   AND up.reengagement_opt_out = false;

-- Expected: Query should use "Index Scan using idx_user_profiles_reengagement_opt_out" in query plan
-- Expected execution time: < 5 seconds for 10k users
