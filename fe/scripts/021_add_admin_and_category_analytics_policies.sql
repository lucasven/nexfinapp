-- Migration: Add Admin Column and Category Analytics RLS Policies
-- Date: 2025-11-17
-- Description: Adds is_admin column to user_profiles and creates RLS policies for category analytics tables

-- ============================================
-- PART 1: Add is_admin column to user_profiles
-- ============================================

ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_user_profiles_is_admin ON user_profiles(is_admin)
  WHERE is_admin = true;

COMMENT ON COLUMN user_profiles.is_admin IS 'Flag indicating if user has admin privileges';

-- ============================================
-- PART 2: Update is_admin() function to use database column
-- ============================================

CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN COALESCE(
    (SELECT is_admin FROM user_profiles WHERE user_id = auth.uid()),
    false
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION is_admin() IS 'Returns true if current user has admin privileges (checks user_profiles.is_admin column)';

-- ============================================
-- PART 3: RLS Policies for Category Analytics Tables
-- ============================================

-- Enable RLS on category matching tables if not already enabled
ALTER TABLE category_synonyms ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_category_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE category_corrections ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchant_category_mapping ENABLE ROW LEVEL SECURITY;

-- ============================================
-- category_synonyms policies
-- ============================================

CREATE POLICY "Admin can view category_synonyms"
  ON category_synonyms FOR SELECT
  USING (is_admin());

CREATE POLICY "Admin can insert category_synonyms"
  ON category_synonyms FOR INSERT
  WITH CHECK (is_admin());

CREATE POLICY "Admin can update category_synonyms"
  ON category_synonyms FOR UPDATE
  USING (is_admin());

CREATE POLICY "Admin can delete category_synonyms"
  ON category_synonyms FOR DELETE
  USING (is_admin());

-- ============================================
-- user_category_preferences policies
-- ============================================

CREATE POLICY "Admin can view user_category_preferences"
  ON user_category_preferences FOR SELECT
  USING (is_admin());

CREATE POLICY "Users can view their own category_preferences"
  ON user_category_preferences FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "System can insert user_category_preferences"
  ON user_category_preferences FOR INSERT
  WITH CHECK (true); -- Bot can create preferences for any user

CREATE POLICY "System can update user_category_preferences"
  ON user_category_preferences FOR UPDATE
  USING (true); -- Bot can update preferences (frequency counter)

-- ============================================
-- category_corrections policies
-- ============================================

CREATE POLICY "Admin can view category_corrections"
  ON category_corrections FOR SELECT
  USING (is_admin());

CREATE POLICY "Users can view their own category_corrections"
  ON category_corrections FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "System can insert category_corrections"
  ON category_corrections FOR INSERT
  WITH CHECK (true); -- Trigger creates corrections automatically

CREATE POLICY "Admin can update category_corrections"
  ON category_corrections FOR UPDATE
  USING (is_admin());

-- ============================================
-- merchant_category_mapping policies
-- ============================================

CREATE POLICY "Admin can view merchant_category_mapping"
  ON merchant_category_mapping FOR SELECT
  USING (is_admin());

CREATE POLICY "Anyone can view global merchant_mappings"
  ON merchant_category_mapping FOR SELECT
  USING (is_global = true);

CREATE POLICY "Users can view their own merchant_mappings"
  ON merchant_category_mapping FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Admin can insert merchant_mappings"
  ON merchant_category_mapping FOR INSERT
  WITH CHECK (is_admin());

CREATE POLICY "Admin can update merchant_mappings"
  ON merchant_category_mapping FOR UPDATE
  USING (is_admin());

CREATE POLICY "Admin can delete merchant_mappings"
  ON merchant_category_mapping FOR DELETE
  USING (is_admin());

-- ============================================
-- PART 4: Helper function for admin actions logging (optional)
-- ============================================

-- Create admin_actions table for audit trail
CREATE TABLE IF NOT EXISTS admin_actions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_user_id UUID NOT NULL,
  action_type TEXT NOT NULL, -- 'approve_match', 'reject_match', 'add_merchant', etc.
  target_table TEXT,
  target_id UUID,
  details JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_admin_actions_admin ON admin_actions(admin_user_id);
CREATE INDEX idx_admin_actions_type ON admin_actions(action_type);
CREATE INDEX idx_admin_actions_created ON admin_actions(created_at DESC);

-- RLS: Only admins can view admin actions
ALTER TABLE admin_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can view admin_actions"
  ON admin_actions FOR SELECT
  USING (is_admin());

CREATE POLICY "Admin can insert admin_actions"
  ON admin_actions FOR INSERT
  WITH CHECK (is_admin());

COMMENT ON TABLE admin_actions IS 'Audit trail of admin actions performed on category matching data';

-- ============================================
-- PART 5: Manual step reminder
-- ============================================

-- IMPORTANT: After running this migration, you must manually set your user as admin:
-- UPDATE user_profiles
-- SET is_admin = true
-- WHERE user_id = (SELECT id FROM auth.users WHERE email = 'lucas.venturella@hotmail.com');
