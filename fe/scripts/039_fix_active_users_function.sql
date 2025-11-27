-- Migration: 039_fix_active_users_function.sql
-- Purpose: Fix get_active_users_last_week function to correctly fetch whatsapp_jid
-- Issue: Migration 036 referenced up.whatsapp_jid but that column is in authorized_whatsapp_numbers, not user_profiles
-- Fix: JOIN with authorized_whatsapp_numbers to get correct whatsapp_jid for destination_jid

-- Drop existing function
DROP FUNCTION IF EXISTS get_active_users_last_week(TIMESTAMPTZ);

-- Create corrected function to get active users from last week
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
    -- Use whatsapp_jid from authorized_whatsapp_numbers (primary account)
    -- Fallback to formatted whatsapp_number if jid not available
    COALESCE(
      awn.whatsapp_jid,
      CASE
        WHEN awn.whatsapp_number IS NOT NULL
        THEN awn.whatsapp_number || '@s.whatsapp.net'
        ELSE NULL
      END
    ) as destination_jid,
    COALESCE(up.locale, 'pt-BR') as locale
  FROM user_profiles up
  JOIN user_engagement_states ues ON up.user_id = ues.user_id
  -- Join with authorized numbers to get whatsapp_jid
  -- Use a lateral join to get the best available authorized number (primary first, then first by creation date)
  LEFT JOIN LATERAL (
    SELECT whatsapp_jid, whatsapp_number
    FROM authorized_whatsapp_numbers
    WHERE authorized_whatsapp_numbers.user_id = up.user_id
    ORDER BY is_primary DESC, created_at ASC
    LIMIT 1
  ) awn ON true
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
    awn.whatsapp_jid,
    awn.whatsapp_number,
    up.locale;
END;
$$ LANGUAGE plpgsql STABLE;

-- Comment on function for documentation
COMMENT ON FUNCTION get_active_users_last_week IS
'Get users with activity in the last 7 days. Activity = transactions OR bot interactions. Excludes dormant and opted-out users. Fixed to correctly join with authorized_whatsapp_numbers for whatsapp_jid.';
