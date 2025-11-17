-- Migration 014: Onboarding Tracking
-- Add columns to user_profiles table to track onboarding progress

-- Add onboarding tracking columns to user_profiles
ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS onboarding_step VARCHAR(50),
ADD COLUMN IF NOT EXISTS whatsapp_setup_completed BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS first_category_added BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS first_expense_added BOOLEAN DEFAULT false;

-- Create index for efficient onboarding status queries
CREATE INDEX IF NOT EXISTS idx_user_profiles_onboarding
ON user_profiles(user_id, onboarding_completed);

-- Add comment for documentation
COMMENT ON COLUMN user_profiles.onboarding_completed IS 'Indicates if user has completed the initial onboarding flow';
COMMENT ON COLUMN user_profiles.onboarding_step IS 'Current step in the onboarding process (e.g., whatsapp_setup, first_category, first_expense, features)';
COMMENT ON COLUMN user_profiles.whatsapp_setup_completed IS 'Indicates if user has set up their WhatsApp number';
COMMENT ON COLUMN user_profiles.first_category_added IS 'Indicates if user has created their first category';
COMMENT ON COLUMN user_profiles.first_expense_added IS 'Indicates if user has added their first expense';
