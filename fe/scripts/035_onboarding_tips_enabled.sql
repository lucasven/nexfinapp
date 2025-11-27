-- Migration: Add onboarding_tips_enabled column
-- Purpose: Separate setting for disabling onboarding tips from re-engagement opt-out
-- Date: 2025-11-22
-- Epic: 3 - Progressive Tier Journey
-- Story: 3.5 - Skip Onboarding Command

-- ============================================================================
-- COLUMN: user_profiles.onboarding_tips_enabled
-- Purpose: Controls whether user receives onboarding tips (tier celebrations, hints)
-- Separate from reengagement_opt_out which controls goodbye/weekly review messages
-- ============================================================================

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS onboarding_tips_enabled BOOLEAN DEFAULT true;

-- Comment for documentation
COMMENT ON COLUMN user_profiles.onboarding_tips_enabled IS 'If true (default), user receives onboarding tips: tier completion celebrations, contextual hints. Independent from reengagement_opt_out. Story 3.5.';

-- ============================================================================
-- VERIFICATION (commented out, for manual testing)
-- ============================================================================

-- Verify column added:
-- SELECT column_name, data_type, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'user_profiles'
-- AND column_name = 'onboarding_tips_enabled';

-- Verify separation from reengagement_opt_out:
-- SELECT column_name, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'user_profiles'
-- AND column_name IN ('onboarding_tips_enabled', 'reengagement_opt_out');
