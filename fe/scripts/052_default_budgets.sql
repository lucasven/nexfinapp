-- Migration: 052_default_budgets.sql
-- Purpose: Add support for fixed default budgets per category
-- Default budgets apply to all months unless overridden by a monthly budget

-- Step 1: Add is_default column
ALTER TABLE budgets ADD COLUMN IF NOT EXISTS is_default BOOLEAN DEFAULT false;

-- Step 2: Allow NULL values for month and year (for default budgets)
-- First, drop the existing CHECK constraints
ALTER TABLE budgets DROP CONSTRAINT IF EXISTS budgets_month_check;

-- Step 3: Drop the existing unique constraint
ALTER TABLE budgets DROP CONSTRAINT IF EXISTS budgets_user_id_category_id_month_year_key;

-- Step 4: Make month and year nullable
ALTER TABLE budgets ALTER COLUMN month DROP NOT NULL;
ALTER TABLE budgets ALTER COLUMN year DROP NOT NULL;

-- Step 5: Create partial unique indexes
-- One default budget per (user, category)
CREATE UNIQUE INDEX IF NOT EXISTS budgets_user_category_default_idx
  ON budgets (user_id, category_id)
  WHERE is_default = true;

-- One monthly override per (user, category, month, year)
CREATE UNIQUE INDEX IF NOT EXISTS budgets_user_category_month_year_idx
  ON budgets (user_id, category_id, month, year)
  WHERE is_default = false AND month IS NOT NULL AND year IS NOT NULL;

-- Step 6: Add check constraint for data consistency
-- Defaults have NULL month/year, overrides have values
ALTER TABLE budgets ADD CONSTRAINT budgets_default_check CHECK (
  (is_default = true AND month IS NULL AND year IS NULL) OR
  (is_default = false AND month IS NOT NULL AND year IS NOT NULL AND month >= 1 AND month <= 12)
);

-- Step 7: Mark all existing budgets as non-defaults (they have month/year values)
UPDATE budgets SET is_default = false WHERE is_default IS NULL;

-- Step 8: Create index for default budget lookups
CREATE INDEX IF NOT EXISTS idx_budgets_default_lookup
  ON budgets (user_id, category_id)
  WHERE is_default = true;

-- Step 9: Create helper function to get effective budget for a category/month
CREATE OR REPLACE FUNCTION get_effective_budget(
  p_user_id UUID,
  p_category_id UUID,
  p_month INTEGER,
  p_year INTEGER
) RETURNS TABLE (
  budget_id UUID,
  amount DECIMAL(10, 2),
  is_default BOOLEAN,
  source_type TEXT
) AS $$
BEGIN
  -- First try to find a monthly override
  RETURN QUERY
  SELECT b.id, b.amount, b.is_default, 'override'::TEXT AS source_type
  FROM budgets b
  WHERE b.user_id = p_user_id
    AND b.category_id = p_category_id
    AND b.month = p_month
    AND b.year = p_year
    AND b.is_default = false
  LIMIT 1;

  -- If no override found, return default if exists
  IF NOT FOUND THEN
    RETURN QUERY
    SELECT b.id, b.amount, b.is_default, 'default'::TEXT AS source_type
    FROM budgets b
    WHERE b.user_id = p_user_id
      AND b.category_id = p_category_id
      AND b.is_default = true
    LIMIT 1;
  END IF;
END;
$$ LANGUAGE plpgsql STABLE;

-- Step 10: Add comment for documentation
COMMENT ON COLUMN budgets.is_default IS 'When true, this budget applies to all months unless overridden. When true, month and year must be NULL.';
COMMENT ON FUNCTION get_effective_budget(UUID, UUID, INTEGER, INTEGER) IS 'Returns the effective budget for a category in a specific month. Prefers monthly override, falls back to default budget.';
