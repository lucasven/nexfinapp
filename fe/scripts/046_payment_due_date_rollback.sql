-- Rollback Migration: 046_payment_due_date_rollback.sql
-- Description: Remove payment_due_day column from payment_methods table
-- Date: 2025-12-03
-- Story: 4.1 - Set Payment Due Date
--
-- WARNING: This rollback will delete all payment_due_day data.
-- Only use this if you need to revert the payment due date feature.
--
-- Dependencies:
-- - No other tables/columns depend on payment_due_day
-- - Safe to rollback as long as Stories 4.2-4.5 are not deployed
--   (they depend on this column)

-- Remove payment_due_day column
ALTER TABLE payment_methods
  DROP COLUMN IF EXISTS payment_due_day;

-- Verification queries
-- =====================

-- 1. Verify column is removed
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'payment_methods'
  AND column_name = 'payment_due_day';
-- Expected: No rows returned

-- 2. Verify payment_methods table still exists and is functional
SELECT id, name, type, credit_mode, statement_closing_day
FROM payment_methods
LIMIT 5;

-- Rollback complete
-- =================
-- Column: payment_due_day removed successfully
-- All other payment_methods columns intact
