-- Migration: 036_get_active_users_function.sql
-- Purpose: Create database function for weekly activity detection
-- Epic: 5 (Scheduled Jobs & Weekly Reviews)
-- Story: 5.2 (Weekly Activity Detection)
-- AC: 5.2.1, 5.2.2, 5.2.3

-- Drop function if exists (for idempotency)
DROP FUNCTION IF EXISTS get_active_users_last_week(TIMESTAMPTZ);

-- Create function to get active users from last week
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

-- Create composite index for performance optimization
-- This supports the weekly activity query pattern
CREATE INDEX IF NOT EXISTS idx_transactions_user_created
  ON transactions(user_id, created_at);

-- Comment on function for documentation
COMMENT ON FUNCTION get_active_users_last_week IS
'Get users with activity in the last 7 days. Activity = transactions OR bot interactions. Excludes dormant and opted-out users.';
