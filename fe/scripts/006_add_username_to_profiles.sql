-- Migration: Add username field to user_profiles
-- This enables users to have a unique username in addition to display_name

-- Add username column to user_profiles table
ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS username TEXT UNIQUE;

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_user_profiles_username ON user_profiles(username);

-- Add comment to explain the field
COMMENT ON COLUMN user_profiles.username IS 'Unique username for the user, used for identification and mentions';

