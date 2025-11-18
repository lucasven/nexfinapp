-- Migration: Fix match_type constraint to align with actual code implementation
-- Date: 2025-11-18
-- Purpose: The original constraint allowed 'keyword' but the category matcher uses 'synonym'
--          This was causing OCR transactions to fail when matched via keyword/synonym matching

-- Step 1: Drop the existing constraint
ALTER TABLE transactions
DROP CONSTRAINT IF EXISTS check_match_type_values;

-- Step 2: Update any existing 'keyword' values to 'synonym' for consistency
-- (This handles any data that may have been inserted with the old expected value)
UPDATE transactions
SET match_type = 'synonym'
WHERE match_type = 'keyword';

-- Step 3: Add the corrected constraint with values that match the actual code
-- Valid match types from category-matcher.ts:
--   - 'exact': Direct category name match
--   - 'fuzzy': Levenshtein distance matching
--   - 'synonym': Keyword/synonym dictionary matching
--   - 'ai': AI-based similarity matching
--   - 'merchant': Merchant name recognition
--   - 'fallback': Default category when no match found
ALTER TABLE transactions
ADD CONSTRAINT check_match_type_values
  CHECK (
    match_type IS NULL OR
    match_type IN ('exact', 'fuzzy', 'synonym', 'ai', 'merchant', 'fallback', 'legacy')
  );

-- Step 4: Add index for better query performance on match_type filtering
CREATE INDEX IF NOT EXISTS idx_transactions_match_type
ON transactions(match_type)
WHERE match_type IS NOT NULL;

-- Step 5: Add comment explaining the constraint
COMMENT ON CONSTRAINT check_match_type_values ON transactions IS
'Ensures match_type contains only valid values from the category matching system. NULL allowed for manual entries.';

-- Verification query (uncomment to run):
-- SELECT
--   match_type,
--   COUNT(*) as count,
--   ROUND(AVG(match_confidence)::numeric, 2) as avg_confidence
-- FROM transactions
-- WHERE match_type IS NOT NULL
-- GROUP BY match_type
-- ORDER BY count DESC;
