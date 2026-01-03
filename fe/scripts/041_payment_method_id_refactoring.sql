-- Migration: Payment Method ID Refactoring
-- Purpose: Migrate transactions.payment_method from TEXT to UUID foreign key
-- Date: 2025-12-02
-- Epic: 2 - Parcelamento Intelligence
-- Story: 2.0 - Epic 2 Foundation & Blockers Resolution (Part 1)
-- Version: 041

-- ============================================================================
-- SECTION 1: DATA MIGRATION - Map TEXT payment_method values to UUIDs
-- Purpose: Populate payment_method_id column before making it NOT NULL
-- ============================================================================

-- Step 1: Create temporary function for fuzzy matching payment methods
CREATE OR REPLACE FUNCTION find_payment_method_by_name(
  p_user_id UUID,
  p_payment_method_text TEXT
) RETURNS UUID AS $$
DECLARE
  v_payment_method_id UUID;
BEGIN
  -- Try exact match first
  SELECT id INTO v_payment_method_id
  FROM payment_methods
  WHERE user_id = p_user_id
    AND LOWER(TRIM(name)) = LOWER(TRIM(p_payment_method_text))
  LIMIT 1;

  IF v_payment_method_id IS NOT NULL THEN
    RETURN v_payment_method_id;
  END IF;

  -- Try fuzzy match (case-insensitive LIKE)
  SELECT id INTO v_payment_method_id
  FROM payment_methods
  WHERE user_id = p_user_id
    AND LOWER(name) LIKE '%' || LOWER(TRIM(p_payment_method_text)) || '%'
  LIMIT 1;

  RETURN v_payment_method_id;
END;
$$ LANGUAGE plpgsql;

-- Step 2: Standard mappings for common payment method names
-- Map "Cartão de Crédito" / "Credit Card" / "credit_card" to user's credit card
UPDATE transactions t
SET payment_method_id = (
  SELECT id FROM payment_methods
  WHERE user_id = t.user_id
    AND type = 'credit'
  ORDER BY created_at ASC
  LIMIT 1
)
WHERE payment_method_id IS NULL
  AND payment_method IS NOT NULL
  AND (
    LOWER(payment_method) IN ('cartão de crédito', 'credit card', 'credit_card', 'cartao de credito')
  );

-- Map "Débito" / "Debit Card" / "debit_card" to user's debit payment method
UPDATE transactions t
SET payment_method_id = (
  SELECT id FROM payment_methods
  WHERE user_id = t.user_id
    AND type = 'debit'
  ORDER BY created_at ASC
  LIMIT 1
)
WHERE payment_method_id IS NULL
  AND payment_method IS NOT NULL
  AND (
    LOWER(payment_method) IN ('débito', 'debito', 'debit card', 'debit_card', 'debit')
  );

-- Map "Dinheiro" / "Cash" to user's cash payment method
UPDATE transactions t
SET payment_method_id = (
  SELECT id FROM payment_methods
  WHERE user_id = t.user_id
    AND type = 'cash'
  ORDER BY created_at ASC
  LIMIT 1
)
WHERE payment_method_id IS NULL
  AND payment_method IS NOT NULL
  AND (
    LOWER(payment_method) IN ('dinheiro', 'cash', 'dinheiro vivo')
  );

-- Map "Pix" to user's pix payment method
UPDATE transactions t
SET payment_method_id = (
  SELECT id FROM payment_methods
  WHERE user_id = t.user_id
    AND type = 'pix'
  ORDER BY created_at ASC
  LIMIT 1
)
WHERE payment_method_id IS NULL
  AND payment_method IS NOT NULL
  AND LOWER(payment_method) = 'pix';

-- Map "Transferência" / "Bank Transfer" / "bank_transfer" to user's other/bank payment method
UPDATE transactions t
SET payment_method_id = (
  SELECT id FROM payment_methods
  WHERE user_id = t.user_id
    AND type = 'other'
  ORDER BY created_at ASC
  LIMIT 1
)
WHERE payment_method_id IS NULL
  AND payment_method IS NOT NULL
  AND (
    LOWER(payment_method) IN ('transferência', 'transferencia', 'bank transfer', 'bank_transfer')
  );

-- Step 3: Fuzzy matching for custom payment method names
-- This handles cases where users have custom payment method names
UPDATE transactions t
SET payment_method_id = find_payment_method_by_name(t.user_id, t.payment_method)
WHERE payment_method_id IS NULL
  AND payment_method IS NOT NULL
  AND payment_method != '';

-- Step 4: Create default payment methods for transactions without matches
-- For users who have transactions but no payment_methods, create default ones
-- This ensures no data loss

-- Create default cash payment method for unmapped transactions
INSERT INTO payment_methods (user_id, name, type)
SELECT DISTINCT t.user_id, 'Cash (Migrated)', 'cash'
FROM transactions t
LEFT JOIN payment_methods pm ON pm.user_id = t.user_id AND pm.type = 'cash'
WHERE t.payment_method_id IS NULL
  AND t.payment_method IS NOT NULL
  AND pm.id IS NULL
ON CONFLICT (user_id, name) DO NOTHING;

-- Map remaining unmapped transactions to the default cash payment method
UPDATE transactions t
SET payment_method_id = (
  SELECT id FROM payment_methods
  WHERE user_id = t.user_id
    AND name = 'Cash (Migrated)'
  LIMIT 1
)
WHERE payment_method_id IS NULL
  AND payment_method IS NOT NULL;

-- Step 5: Handle NULL payment_method (transactions with no payment method specified)
-- Create a default "Unspecified" payment method for these cases
INSERT INTO payment_methods (user_id, name, type)
SELECT DISTINCT t.user_id, 'Unspecified (Migrated)', 'other'
FROM transactions t
LEFT JOIN payment_methods pm ON pm.user_id = t.user_id AND pm.name = 'Unspecified (Migrated)'
WHERE t.payment_method_id IS NULL
  AND (t.payment_method IS NULL OR t.payment_method = '')
  AND pm.id IS NULL
ON CONFLICT (user_id, name) DO NOTHING;

-- Map transactions with NULL/empty payment_method to "Unspecified"
UPDATE transactions t
SET payment_method_id = (
  SELECT id FROM payment_methods
  WHERE user_id = t.user_id
    AND name = 'Unspecified (Migrated)'
  LIMIT 1
)
WHERE payment_method_id IS NULL
  AND (payment_method IS NULL OR payment_method = '');

-- ============================================================================
-- SECTION 2: VALIDATION - Log unmapped transactions
-- Purpose: Identify any transactions that couldn't be mapped (should be 0)
-- ============================================================================

-- Create a temporary table to log unmapped transactions for manual review
CREATE TEMP TABLE IF NOT EXISTS unmapped_transactions AS
SELECT
  id,
  user_id,
  payment_method,
  description,
  amount,
  date,
  created_at
FROM transactions
WHERE payment_method_id IS NULL;

-- Log count of unmapped transactions (should be 0)
DO $$
DECLARE
  unmapped_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO unmapped_count FROM unmapped_transactions;

  IF unmapped_count > 0 THEN
    RAISE WARNING 'Found % unmapped transactions. Review unmapped_transactions temp table.', unmapped_count;
  ELSE
    RAISE NOTICE 'All transactions successfully mapped to payment_method_id';
  END IF;
END $$;

-- ============================================================================
-- SECTION 3: MAKE payment_method_id NOT NULL
-- Purpose: Enforce payment_method_id requirement going forward
-- ============================================================================

-- Add NOT NULL constraint (will fail if any NULL values remain)
ALTER TABLE transactions ALTER COLUMN payment_method_id SET NOT NULL;

-- Verify the constraint was added
-- Expected: Column should now be NOT NULL
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'transactions'
      AND column_name = 'payment_method_id'
      AND is_nullable = 'NO'
  ) THEN
    RAISE NOTICE 'payment_method_id column is now NOT NULL';
  ELSE
    RAISE WARNING 'payment_method_id column is still nullable - migration may have failed';
  END IF;
END $$;

-- ============================================================================
-- SECTION 4: RENAME legacy payment_method column
-- Purpose: Preserve old data for audit, but mark as deprecated
-- ============================================================================

-- Rename old TEXT column to payment_method_legacy for audit trail
-- Don't drop it immediately in case rollback is needed
ALTER TABLE transactions RENAME COLUMN payment_method TO payment_method_legacy;

-- Add comment to legacy column
COMMENT ON COLUMN transactions.payment_method_legacy IS
  'DEPRECATED: Legacy TEXT field replaced by payment_method_id UUID foreign key. Kept for audit purposes.';

-- ============================================================================
-- SECTION 5: ADD INDEX for improved query performance
-- Purpose: Optimize queries that join transactions with payment_methods
-- ============================================================================

-- Index already exists from migration 040, but verify it's present
-- CREATE INDEX IF NOT EXISTS idx_transactions_payment_method ON transactions(payment_method_id);

-- Composite index for common query patterns (user + payment method)
CREATE INDEX IF NOT EXISTS idx_transactions_user_payment_method
  ON transactions(user_id, payment_method_id);

-- ============================================================================
-- SECTION 6: UPDATE analytics and comments
-- Purpose: Document the schema change
-- ============================================================================

-- Update column comment
COMMENT ON COLUMN transactions.payment_method_id IS
  'Foreign key to payment_methods table. Required field. Enables conditional UI rendering and payment method analytics.';

-- ============================================================================
-- SECTION 7: CLEANUP
-- Purpose: Drop temporary function used for migration
-- ============================================================================

DROP FUNCTION IF EXISTS find_payment_method_by_name(UUID, TEXT);

-- ============================================================================
-- MIGRATION COMPLETE
-- Expected execution time: < 2 minutes for 10k transactions
-- Post-migration: Verify unmapped_transactions temp table is empty
-- Rollback: See 041_payment_method_id_refactoring_rollback.sql
-- ============================================================================

-- Post-migration validation queries (run manually to verify):
--
-- 1. Check all transactions have payment_method_id:
-- SELECT COUNT(*) FROM transactions WHERE payment_method_id IS NULL;
-- Expected: 0
--
-- 2. Verify payment_method_legacy column exists:
-- SELECT COUNT(*) FROM information_schema.columns
-- WHERE table_name = 'transactions' AND column_name = 'payment_method_legacy';
-- Expected: 1
--
-- 3. Check unmapped transactions (should be empty):
-- SELECT * FROM unmapped_transactions;
-- Expected: 0 rows
--
-- 4. Verify foreign key constraint:
-- SELECT con.conname, pg_get_constraintdef(con.oid)
-- FROM pg_constraint con
-- JOIN pg_class rel ON rel.oid = con.conrelid
-- WHERE rel.relname = 'transactions' AND con.contype = 'f' AND con.conname LIKE '%payment_method%';
-- Expected: transactions_payment_method_id_fkey REFERENCES payment_methods(id)
