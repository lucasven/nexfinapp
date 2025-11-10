-- Add locale column to user_profiles table
-- This migration adds support for user language preferences

-- Add locale column with default 'pt-br'
ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS locale VARCHAR(10) DEFAULT 'pt-br';

-- Add check constraint to ensure only valid locales
ALTER TABLE user_profiles
ADD CONSTRAINT check_locale CHECK (locale IN ('pt-br', 'en') OR locale IS NULL);

-- Create index for faster locale lookups
CREATE INDEX IF NOT EXISTS idx_user_profiles_locale ON user_profiles(locale);

-- Add comment to column
COMMENT ON COLUMN user_profiles.locale IS 'User preferred language/locale (pt-br or en)';
