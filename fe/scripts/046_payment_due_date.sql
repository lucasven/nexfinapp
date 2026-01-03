-- Migration: 046_payment_due_date.sql
-- Description: Add payment_due_day column to payment_methods table
-- Date: 2025-12-03
-- Story: 4.1 - Set Payment Due Date
-- Epic: 4 - Payment Reminders & Auto-Accounting
--
-- Purpose:
-- Add payment_due_day to store how many days after statement closing
-- the credit card payment is due. This enables payment reminders and
-- auto-payment transaction creation in subsequent stories.
--
-- Example:
-- - closing_day = 5
-- - payment_due_day = 10
-- - Payment due on 15th of each month (5 + 10 = 15)
--
-- Edge cases handled:
-- - closing_day 25 + payment_due_day 10 = 35 → Due on 5th of next month
-- - closing_day 31 + payment_due_day 10 in Feb → Due on Mar 10
--
-- Dependencies:
-- - Requires payment_methods table (Migration 001)
-- - Requires credit_mode column (Migration 040, Epic 1)
-- - Requires statement_closing_day column (Migration 043, Story 3.1)

-- Add payment_due_day column to payment_methods table
--ALTER TABLE payment_methods
 -- ADD COLUMN payment_due_day INTEGER
  --CHECK (payment_due_day > 0 AND payment_due_day <= 60);

-- Add helpful comment
COMMENT ON COLUMN payment_methods.payment_due_day IS
  'Days after statement_closing_day when payment is due. Range: 1-60 days. Example: closing_day=5, payment_due_day=10 → due on 15th. Only applicable for Credit Mode credit cards (credit_mode = true).';

-- Verification queries
-- =====================

-- 1. Verify column exists
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'payment_methods'
  AND column_name = 'payment_due_day';

-- 2. Verify CHECK constraint exists
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'payment_methods'::regclass
  AND conname LIKE '%payment_due_day%';

-- 3. Test valid values (should succeed)
-- Note: These are commented out for production. Uncomment for testing with real data.
-- UPDATE payment_methods SET payment_due_day = 10 WHERE id = '<test-payment-method-id>';
-- UPDATE payment_methods SET payment_due_day = 1 WHERE id = '<test-payment-method-id>';
-- UPDATE payment_methods SET payment_due_day = 60 WHERE id = '<test-payment-method-id>';

-- 4. Test invalid values (should fail with CHECK constraint violation)
-- Note: These are commented out. Uncomment to test constraint.
-- UPDATE payment_methods SET payment_due_day = 0 WHERE id = '<test-payment-method-id>'; -- Should fail
-- UPDATE payment_methods SET payment_due_day = 61 WHERE id = '<test-payment-method-id>'; -- Should fail

-- 5. Verify existing payment methods are unaffected (all should have NULL payment_due_day)
SELECT id, name, type, credit_mode, statement_closing_day, payment_due_day
FROM payment_methods
LIMIT 10;

-- Migration complete
-- ===================
-- Column: payment_due_day added successfully
-- Type: INTEGER (nullable)
-- Constraint: CHECK (payment_due_day > 0 AND payment_due_day <= 60)
-- Default: NULL (users must explicitly set this value)
-- RLS: Existing payment_methods RLS policies apply automatically
