-- Migration: Add reminder opt-out columns to user_profiles
--
-- Story 3.4: Statement Closing Reminder (statement_reminders_enabled)
-- Story 4.2: Payment Due Reminder (payment_reminders_enabled)
--
-- Both columns default to true (reminders enabled by default)
-- Users can opt out by setting to false

-- Add statement reminders opt-out column (Story 3.4)
ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS statement_reminders_enabled BOOLEAN DEFAULT true;

-- Add payment reminders opt-out column (Story 4.2)
ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS payment_reminders_enabled BOOLEAN DEFAULT true;

-- Add comments for documentation
COMMENT ON COLUMN user_profiles.statement_reminders_enabled IS
  'Opt-out for statement closing reminders (3 days before closing). Default: true (enabled)';

COMMENT ON COLUMN user_profiles.payment_reminders_enabled IS
  'Opt-out for payment due reminders (2 days before due). Default: true (enabled)';

-- Index for efficient opt-out queries in scheduled jobs
-- Partial index only includes enabled users (the common case)
CREATE INDEX IF NOT EXISTS idx_user_profiles_statement_reminders_enabled
  ON user_profiles(user_id)
  WHERE statement_reminders_enabled = true OR statement_reminders_enabled IS NULL;

CREATE INDEX IF NOT EXISTS idx_user_profiles_payment_reminders_enabled
  ON user_profiles(user_id)
  WHERE payment_reminders_enabled = true OR payment_reminders_enabled IS NULL;
