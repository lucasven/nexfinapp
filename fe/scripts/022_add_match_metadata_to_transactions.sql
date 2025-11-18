-- Migration: Add Match Metadata to Transactions
-- Date: 2025-11-17
-- Description: Adds match_confidence and match_type columns to track category matching quality

-- ============================================
-- PART 1: Add columns to transactions table
-- ============================================

ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS match_confidence DECIMAL(3,2),
ADD COLUMN IF NOT EXISTS match_type TEXT;

-- ============================================
-- PART 2: Add indexes for analytics queries
-- ============================================

-- Index for low-confidence queries (most common filter)
CREATE INDEX IF NOT EXISTS idx_transactions_match_confidence
  ON transactions(match_confidence)
  WHERE match_confidence < 0.80;

-- Index for match type analytics
CREATE INDEX IF NOT EXISTS idx_transactions_match_type
  ON transactions(match_type)
  WHERE match_type IS NOT NULL;

-- ============================================
-- PART 3: Add constraints and comments
-- ============================================

-- Add check constraint for confidence range (0.0 to 1.0)
ALTER TABLE transactions
ADD CONSTRAINT check_match_confidence_range
  CHECK (match_confidence IS NULL OR (match_confidence >= 0 AND match_confidence <= 1));

-- Add check constraint for valid match types
ALTER TABLE transactions
ADD CONSTRAINT check_match_type_values
  CHECK (match_type IS NULL OR match_type IN ('exact', 'fuzzy', 'keyword', 'substring', 'merchant', 'user_preference', 'fallback', 'legacy'));

-- Add comments
COMMENT ON COLUMN transactions.match_confidence IS 'Category match confidence score (0.0-1.0). Null for manually entered/corrected categories.';
COMMENT ON COLUMN transactions.match_type IS 'Match strategy used: exact, fuzzy, keyword, substring, merchant, user_preference, fallback. Null for manually entered categories.';

-- ============================================
-- PART 4: Backfill data (optional)
-- ============================================

-- Set fallback confidence for existing transactions without match data
-- This is optional and can be skipped if you prefer to only track new transactions
UPDATE transactions
SET
  match_confidence = 0.75,
  match_type = 'legacy'
WHERE
  match_confidence IS NULL
  AND match_type IS NULL
  AND created_at < NOW();

COMMENT ON TABLE transactions IS 'Transaction records with category match metadata for quality tracking (added 2025-11-17)';
