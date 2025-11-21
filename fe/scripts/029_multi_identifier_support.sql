-- Migration: Multi-Identifier Support for WhatsApp User Recognition
-- Purpose: Support WhatsApp Business accounts and improve user identification reliability
-- Issue: WhatsApp Business accounts may use anonymous LIDs instead of exposing phone numbers
-- Solution: Store multiple identifiers (JID, LID, phone number) with cascading lookup

-- Add new columns to authorized_whatsapp_numbers table
ALTER TABLE authorized_whatsapp_numbers
ADD COLUMN IF NOT EXISTS whatsapp_jid TEXT,
ADD COLUMN IF NOT EXISTS whatsapp_lid TEXT,
ADD COLUMN IF NOT EXISTS account_type TEXT DEFAULT 'regular' CHECK (account_type IN ('regular', 'business', 'unknown')),
ADD COLUMN IF NOT EXISTS push_name TEXT;

-- Create indexes for the new identifier columns
-- JID is the primary identifier (always available)
CREATE INDEX IF NOT EXISTS idx_authorized_whatsapp_jid
ON authorized_whatsapp_numbers(whatsapp_jid);

-- LID is used for Business/anonymous accounts
CREATE INDEX IF NOT EXISTS idx_authorized_whatsapp_lid
ON authorized_whatsapp_numbers(whatsapp_lid);

-- Composite index for multi-field lookups
CREATE INDEX IF NOT EXISTS idx_authorized_whatsapp_identifiers
ON authorized_whatsapp_numbers(whatsapp_number, whatsapp_jid, whatsapp_lid);

-- Migrate existing data: generate JIDs from existing phone numbers
-- Format: [phone_number]@s.whatsapp.net
UPDATE authorized_whatsapp_numbers
SET whatsapp_jid = whatsapp_number || '@s.whatsapp.net',
    account_type = 'regular'
WHERE whatsapp_jid IS NULL AND whatsapp_number IS NOT NULL;

-- Create function to find user by any identifier (cascading lookup)
-- This function tries JID first (most reliable), then LID, then phone number
CREATE OR REPLACE FUNCTION find_user_by_whatsapp_identifier(
  p_jid TEXT DEFAULT NULL,
  p_lid TEXT DEFAULT NULL,
  p_phone_number TEXT DEFAULT NULL
)
RETURNS TABLE (
  user_id UUID,
  whatsapp_number TEXT,
  whatsapp_jid TEXT,
  whatsapp_lid TEXT,
  name TEXT,
  is_primary BOOLEAN,
  permissions JSONB,
  account_type TEXT,
  push_name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Try JID first (most reliable identifier)
  IF p_jid IS NOT NULL THEN
    RETURN QUERY
    SELECT
      awn.user_id,
      awn.whatsapp_number,
      awn.whatsapp_jid,
      awn.whatsapp_lid,
      awn.name,
      awn.is_primary,
      awn.permissions,
      awn.account_type,
      awn.push_name
    FROM authorized_whatsapp_numbers awn
    WHERE awn.whatsapp_jid = p_jid
    LIMIT 1;

    IF FOUND THEN
      RETURN;
    END IF;
  END IF;

  -- Try LID (for Business/anonymous accounts)
  IF p_lid IS NOT NULL THEN
    RETURN QUERY
    SELECT
      awn.user_id,
      awn.whatsapp_number,
      awn.whatsapp_jid,
      awn.whatsapp_lid,
      awn.name,
      awn.is_primary,
      awn.permissions,
      awn.account_type,
      awn.push_name
    FROM authorized_whatsapp_numbers awn
    WHERE awn.whatsapp_lid = p_lid
    LIMIT 1;

    IF FOUND THEN
      RETURN;
    END IF;
  END IF;

  -- Fallback to phone number (backward compatibility)
  IF p_phone_number IS NOT NULL THEN
    RETURN QUERY
    SELECT
      awn.user_id,
      awn.whatsapp_number,
      awn.whatsapp_jid,
      awn.whatsapp_lid,
      awn.name,
      awn.is_primary,
      awn.permissions,
      awn.account_type,
      awn.push_name
    FROM authorized_whatsapp_numbers awn
    WHERE awn.whatsapp_number = p_phone_number
    LIMIT 1;
  END IF;
END;
$$;

-- Create function to upsert user identifiers
-- This function updates existing records or inserts new ones with all available identifiers
CREATE OR REPLACE FUNCTION upsert_whatsapp_identifiers(
  p_user_id UUID,
  p_whatsapp_number TEXT,
  p_whatsapp_jid TEXT,
  p_whatsapp_lid TEXT DEFAULT NULL,
  p_push_name TEXT DEFAULT NULL,
  p_account_type TEXT DEFAULT 'regular',
  p_name TEXT DEFAULT 'Me',
  p_is_primary BOOLEAN DEFAULT false,
  p_permissions JSONB DEFAULT '{"can_view": true, "can_add": false, "can_edit": false, "can_delete": false, "can_manage_budgets": false, "can_view_reports": false}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id UUID;
BEGIN
  -- Try to find existing record by JID or phone number
  SELECT id INTO v_id
  FROM authorized_whatsapp_numbers
  WHERE (whatsapp_jid = p_whatsapp_jid OR whatsapp_number = p_whatsapp_number)
    AND user_id = p_user_id
  LIMIT 1;

  IF v_id IS NOT NULL THEN
    -- Update existing record with new identifiers
    UPDATE authorized_whatsapp_numbers
    SET
      whatsapp_number = COALESCE(p_whatsapp_number, whatsapp_number),
      whatsapp_jid = COALESCE(p_whatsapp_jid, whatsapp_jid),
      whatsapp_lid = COALESCE(p_whatsapp_lid, whatsapp_lid),
      push_name = COALESCE(p_push_name, push_name),
      account_type = COALESCE(p_account_type, account_type),
      updated_at = NOW()
    WHERE id = v_id;

    RETURN v_id;
  ELSE
    -- Insert new record
    INSERT INTO authorized_whatsapp_numbers (
      user_id,
      whatsapp_number,
      whatsapp_jid,
      whatsapp_lid,
      push_name,
      account_type,
      name,
      is_primary,
      permissions
    ) VALUES (
      p_user_id,
      p_whatsapp_number,
      p_whatsapp_jid,
      p_whatsapp_lid,
      p_push_name,
      p_account_type,
      p_name,
      p_is_primary,
      p_permissions
    )
    RETURNING id INTO v_id;

    RETURN v_id;
  END IF;
END;
$$;

-- Grant execute permissions to service role (for bot operations)
GRANT EXECUTE ON FUNCTION find_user_by_whatsapp_identifier(TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION upsert_whatsapp_identifiers(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, JSONB) TO service_role;

-- Add comments for documentation
COMMENT ON COLUMN authorized_whatsapp_numbers.whatsapp_jid IS
'Full WhatsApp JID (e.g., 5511999999999@s.whatsapp.net or 5511999999999:10@s.whatsapp.net). Most reliable identifier, always available.';

COMMENT ON COLUMN authorized_whatsapp_numbers.whatsapp_lid IS
'WhatsApp Local Identifier (LID) for Business/anonymous accounts. Used when phone number is not exposed.';

COMMENT ON COLUMN authorized_whatsapp_numbers.account_type IS
'Type of WhatsApp account: regular, business, or unknown. Helps optimize identification strategy.';

COMMENT ON COLUMN authorized_whatsapp_numbers.push_name IS
'User''s WhatsApp display name (pushName from message). Not unique but useful for user-friendly display.';

COMMENT ON FUNCTION find_user_by_whatsapp_identifier(TEXT, TEXT, TEXT) IS
'Cascading user lookup: tries JID (most reliable), then LID (for Business accounts), then phone number (backward compatibility).';

COMMENT ON FUNCTION upsert_whatsapp_identifiers(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, JSONB) IS
'Insert or update user identifiers. Updates existing records with new identifier data or creates new authorization.';

-- Refresh the user analytics materialized view to include new columns
REFRESH MATERIALIZED VIEW CONCURRENTLY user_analytics_properties;
