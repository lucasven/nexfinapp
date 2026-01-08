-- Rollback: 052_default_budgets.sql
-- WARNING: This will delete all default budgets (is_default = true)

-- Step 1: Delete all default budgets (they have no month/year)
DELETE FROM budgets WHERE is_default = true;

-- Step 2: Drop the helper function
DROP FUNCTION IF EXISTS get_effective_budget(UUID, UUID, INTEGER, INTEGER);

-- Step 3: Drop indexes
DROP INDEX IF EXISTS idx_budgets_default_lookup;
DROP INDEX IF EXISTS budgets_user_category_default_idx;
DROP INDEX IF EXISTS budgets_user_category_month_year_idx;

-- Step 4: Drop check constraint
ALTER TABLE budgets DROP CONSTRAINT IF EXISTS budgets_default_check;

-- Step 5: Make month and year NOT NULL again
ALTER TABLE budgets ALTER COLUMN month SET NOT NULL;
ALTER TABLE budgets ALTER COLUMN year SET NOT NULL;

-- Step 6: Recreate original check constraint
ALTER TABLE budgets ADD CONSTRAINT budgets_month_check CHECK (month >= 1 AND month <= 12);

-- Step 7: Recreate original unique constraint
ALTER TABLE budgets ADD CONSTRAINT budgets_user_id_category_id_month_year_key
  UNIQUE (user_id, category_id, month, year);

-- Step 8: Drop is_default column
ALTER TABLE budgets DROP COLUMN IF EXISTS is_default;
