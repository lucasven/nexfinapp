-- Migration: Credit Card Management Schema
-- Purpose: Extend schema with credit card features including installments, statement tracking, and user mode preferences
-- Date: 2025-12-02
-- Epic: 1 - Credit Card Foundation
-- Story: 1.1 - Database Schema Migration for Credit Card Features
-- Version: 040

-- ============================================================================
-- SECTION 1: CREATE OR EXTEND payment_methods TABLE
-- Purpose: Create table if not exists, then add columns to support Credit Mode features
-- ============================================================================

-- Create payment_methods table if it doesn't exist
CREATE TABLE IF NOT EXISTS payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('credit', 'debit', 'cash', 'pix', 'other')) DEFAULT 'other',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, name)
);

-- Add table comment
COMMENT ON TABLE payment_methods IS
  'Stores user payment methods with type classification for credit card management features.';

-- Enable RLS on payment_methods
ALTER TABLE payment_methods ENABLE ROW LEVEL SECURITY;

-- Create RLS policy: Users can only access their own payment methods
DROP POLICY IF EXISTS payment_methods_user_policy ON payment_methods;
CREATE POLICY payment_methods_user_policy ON payment_methods
  FOR ALL USING (user_id = auth.uid());

-- Create index for user lookups
CREATE INDEX IF NOT EXISTS idx_payment_methods_user ON payment_methods(user_id);

-- Extend payment_methods table with credit card specific columns
ALTER TABLE payment_methods
  ADD COLUMN IF NOT EXISTS statement_closing_day INTEGER
    CHECK (statement_closing_day BETWEEN 1 AND 31),
  ADD COLUMN IF NOT EXISTS payment_due_day INTEGER
    CHECK (payment_due_day > 0),
  ADD COLUMN IF NOT EXISTS credit_mode BOOLEAN DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS monthly_budget DECIMAL(10,2);

-- Add column comments for documentation
COMMENT ON COLUMN payment_methods.statement_closing_day IS
  'Day of month when statement closes (1-31). NULL for non-credit cards.';
COMMENT ON COLUMN payment_methods.payment_due_day IS
  'Days after closing when payment is due (e.g., 10 = due 10 days after closing).';
COMMENT ON COLUMN payment_methods.credit_mode IS
  'TRUE if user opted into Credit Mode (vs Simple Mode). NULL = not yet chosen. Only for type=credit.';
COMMENT ON COLUMN payment_methods.monthly_budget IS
  'User-defined budget per statement period. NULL if not set.';

-- Add payment_method_id column to transactions table for foreign key relationship
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS payment_method_id UUID REFERENCES payment_methods(id) ON DELETE SET NULL;

-- Add index for payment method lookups on transactions
CREATE INDEX IF NOT EXISTS idx_transactions_payment_method ON transactions(payment_method_id);

-- Add column comment
COMMENT ON COLUMN transactions.payment_method_id IS
  'Foreign key to payment_methods table. Replaces legacy payment_method TEXT field.';

-- ============================================================================
-- SECTION 2: CREATE installment_plans TABLE
-- Purpose: Parent table for installment tracking (foundation for Epic 2)
-- ============================================================================

CREATE TABLE IF NOT EXISTS installment_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  description TEXT NOT NULL,
  total_amount DECIMAL(10,2) NOT NULL,
  total_installments INTEGER NOT NULL CHECK (total_installments > 0),
  status TEXT NOT NULL CHECK (status IN ('active', 'paid_off', 'cancelled')) DEFAULT 'active',
  merchant TEXT,
  category_id UUID REFERENCES categories(id),
  payment_method_id UUID REFERENCES payment_methods(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add table comment
COMMENT ON TABLE installment_plans IS
  'Tracks installment purchase plans. Foundation for Epic 2 installment features.';

-- ============================================================================
-- SECTION 3: CREATE installment_payments TABLE
-- Purpose: Child table tracking individual installment payments
-- ============================================================================

CREATE TABLE IF NOT EXISTS installment_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES installment_plans(id) ON DELETE CASCADE,
  transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
  installment_number INTEGER NOT NULL CHECK (installment_number > 0),
  amount DECIMAL(10,2) NOT NULL,
  due_date DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'paid', 'cancelled')) DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add table comment
COMMENT ON TABLE installment_payments IS
  'Individual installment payment records. CASCADE delete when plan deleted, SET NULL when transaction deleted.';

-- ============================================================================
-- SECTION 4: CREATE INDEXES FOR PERFORMANCE
-- Purpose: Optimize common queries (user+status lookups, due date filtering)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_installment_plans_user_status
  ON installment_plans(user_id, status);

CREATE INDEX IF NOT EXISTS idx_installment_payments_plan
  ON installment_payments(plan_id);

CREATE INDEX IF NOT EXISTS idx_installment_payments_transaction
  ON installment_payments(transaction_id);

CREATE INDEX IF NOT EXISTS idx_installment_payments_due_date_status
  ON installment_payments(due_date, status);

-- ============================================================================
-- SECTION 5: ENABLE ROW LEVEL SECURITY (RLS)
-- Purpose: Enforce user_id = auth.uid() pattern for data isolation
-- ============================================================================

ALTER TABLE installment_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE installment_payments ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only access their own installment plans
CREATE POLICY installment_plans_user_policy ON installment_plans
  FOR ALL USING (user_id = auth.uid());

-- Policy: Users can only access payments for their own plans
CREATE POLICY installment_payments_user_policy ON installment_payments
  FOR ALL USING (
    plan_id IN (SELECT id FROM installment_plans WHERE user_id = auth.uid())
  );

-- ============================================================================
-- SECTION 6: POST-MIGRATION VALIDATION QUERIES (FOR MANUAL TESTING)
-- Purpose: Verify migration completed successfully
-- ============================================================================

-- Verify payment_methods columns added (should return 4):
-- SELECT COUNT(*)
-- FROM information_schema.columns
-- WHERE table_name = 'payment_methods'
--   AND column_name IN ('credit_mode', 'statement_closing_day', 'payment_due_day', 'monthly_budget');

-- Verify installment tables created (should return 2):
-- SELECT COUNT(*)
-- FROM information_schema.tables
-- WHERE table_schema = 'public'
--   AND table_name IN ('installment_plans', 'installment_payments');

-- Verify RLS enabled on new tables (should return 2 rows with rowsecurity = true):
-- SELECT tablename, rowsecurity
-- FROM pg_tables
-- WHERE schemaname = 'public'
--   AND tablename IN ('installment_plans', 'installment_payments');

-- Verify indexes created (should return 4):
-- SELECT COUNT(*)
-- FROM pg_indexes
-- WHERE schemaname = 'public'
--   AND indexname IN (
--     'idx_installment_plans_user_status',
--     'idx_installment_payments_plan',
--     'idx_installment_payments_transaction',
--     'idx_installment_payments_due_date_status'
--   );

-- Verify CHECK constraints exist (should return rows for each constraint):
-- SELECT con.conname, pg_get_constraintdef(con.oid)
-- FROM pg_constraint con
-- JOIN pg_class rel ON rel.oid = con.conrelid
-- WHERE rel.relname IN ('payment_methods', 'installment_plans', 'installment_payments')
--   AND con.contype = 'c';

-- Verify foreign key constraints (should return 5 foreign keys):
-- SELECT con.conname,
--        rel.relname AS table_name,
--        pg_get_constraintdef(con.oid) AS constraint_def
-- FROM pg_constraint con
-- JOIN pg_class rel ON rel.oid = con.conrelid
-- WHERE rel.relname IN ('installment_plans', 'installment_payments')
--   AND con.contype = 'f';

-- ============================================================================
-- MIGRATION COMPLETE
-- Expected execution time: < 30 seconds (NFR requirement)
-- Next steps: Run validation queries, test RLS policies, execute rollback test
-- ============================================================================
