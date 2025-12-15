-- Migration 047: Create System Category for Credit Card Payments
-- Story 4.5: System Category for Credit Card Payments
-- Date: 2025-12-03
--
-- Purpose: Create system-managed category "Pagamento Cartão de Crédito" / "Credit Card Payment"
--          for auto-generated payment transactions (Story 4.3 dependency)
--
-- Dependency: Story 4.3 (Auto-Create Payment Transaction) requires this category to exist

-- Add is_system column to categories table if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'categories' AND column_name = 'is_system'
  ) THEN
    ALTER TABLE categories ADD COLUMN is_system BOOLEAN DEFAULT FALSE NOT NULL;
    COMMENT ON COLUMN categories.is_system IS 'System-managed category (cannot be edited/deleted by users)';
  END IF;
END $$;

-- Create index on is_system for efficient queries
CREATE INDEX IF NOT EXISTS idx_categories_is_system ON categories(is_system) WHERE is_system = true;

-- Insert system category for credit card payments (pt-BR)
INSERT INTO categories (name, type, is_system, user_id, created_at)
SELECT
  'Pagamento Cartão de Crédito',
  'expense',
  true,
  NULL, -- System category not owned by any user
  NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM categories
  WHERE is_system = true
  AND name = 'Pagamento Cartão de Crédito'
);

-- Insert system category for credit card payments (English)
INSERT INTO categories (name, type, is_system, user_id, created_at)
SELECT
  'Credit Card Payment',
  'expense',
  true,
  NULL, -- System category not owned by any user
  NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM categories
  WHERE is_system = true
  AND name = 'Credit Card Payment'
);

-- Modify RLS policies to allow system categories to be visible to all users
-- Drop existing policy if it exists
DROP POLICY IF EXISTS "Users can view their own categories and system categories" ON categories;

-- Create new policy that allows viewing system categories
CREATE POLICY "Users can view their own categories and system categories" ON categories
  FOR SELECT
  USING (
    user_id = auth.uid() OR is_system = true
  );

-- Prevent users from modifying system categories
CREATE POLICY "Users cannot modify system categories" ON categories
  FOR UPDATE
  USING (
    user_id = auth.uid() AND is_system = false
  );

CREATE POLICY "Users cannot delete system categories" ON categories
  FOR DELETE
  USING (
    user_id = auth.uid() AND is_system = false
  );

-- Add comment explaining system categories
COMMENT ON TABLE categories IS 'User-defined and system-managed categories for transactions. System categories (is_system=true) are read-only and visible to all users.';
