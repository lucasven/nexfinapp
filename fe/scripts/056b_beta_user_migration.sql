-- 056b_beta_user_migration.sql
-- One-time: grant beta users lifetime Couples tier subscription
-- Run AFTER 056_pricing_tiers.sql
--
-- Adjust the WHERE clause date to match your actual launch date.
-- Before running, verify the count:
--
--   SELECT count(*) FROM auth.users
--   WHERE created_at < '2026-02-01'
--     AND id NOT IN (SELECT user_id FROM subscriptions WHERE status = 'active');

-- Issue #6: Use NOT EXISTS instead of ON CONFLICT DO NOTHING (no UNIQUE on user_id)
INSERT INTO subscriptions (user_id, tier, type, status, started_at)
SELECT
  id,
  'couples',
  'lifetime',
  'active',
  now()
FROM auth.users
WHERE created_at < '2026-02-01'
  AND NOT EXISTS (
    SELECT 1 FROM subscriptions
    WHERE subscriptions.user_id = auth.users.id
      AND subscriptions.status = 'active'
  );
