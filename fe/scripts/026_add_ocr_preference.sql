-- Migration: Add OCR auto-add user preference
-- Date: 2025-11-18
-- Purpose: Allow users to choose between "always confirm" (default) or "auto-add" (legacy) for OCR

-- Step 1: Add ocr_auto_add column to user_profiles
ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS ocr_auto_add BOOLEAN DEFAULT FALSE;

-- Step 2: Add comment explaining the field
COMMENT ON COLUMN user_profiles.ocr_auto_add IS
'User preference for OCR transaction handling:
  FALSE (default) = Always show preview and ask for confirmation
  TRUE = Automatically add transactions like the old behavior
Users can change this with /settings ocr [auto|confirm]';

-- Step 3: Add index for faster lookups (only index TRUE values for efficiency)
CREATE INDEX IF NOT EXISTS idx_user_profiles_ocr_auto_add
ON user_profiles(ocr_auto_add)
WHERE ocr_auto_add = TRUE;

-- Verification query (uncomment to run):
-- SELECT
--   ocr_auto_add,
--   COUNT(*) as user_count
-- FROM user_profiles
-- GROUP BY ocr_auto_add
-- ORDER BY user_count DESC;
