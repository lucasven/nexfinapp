-- Migration: 045 - Budget Calculation Function
-- Epic: 3 - Statement-Aware Budgets
-- Story: 3.3 - Budget Progress Dashboard Statement Period
-- Date: 2025-12-03
-- Description: Creates the calculate_statement_budget_spent() PostgreSQL function for
--              calculating total budget spent (transactions + installment payments)
--              in a statement period. Single source of truth for budget calculations.

-- ============================================================================
-- Budget Spent Calculation Function
-- ============================================================================

CREATE OR REPLACE FUNCTION calculate_statement_budget_spent(
    p_payment_method_id UUID,
    p_user_id UUID,
    p_start_date DATE,
    p_end_date DATE
  ) RETURNS DECIMAL(10,2) AS $$
  DECLARE
    transactions_sum DECIMAL(10,2);
    installments_sum DECIMAL(10,2);
    total_spent DECIMAL(10,2);
  BEGIN
    -- Calculate sum of expense transactions in period
    SELECT COALESCE(SUM(amount), 0)
    INTO transactions_sum
    FROM transactions
    WHERE user_id = p_user_id
      AND payment_method_id = p_payment_method_id
      AND type = 'expense'
      AND date >= p_start_date
      AND date <= p_end_date;

    -- Calculate sum of pending installment payments due in period
    -- FIX: Only count if NOT already linked to a transaction (to avoid double-counting)
    SELECT COALESCE(SUM(ip.amount), 0)
    INTO installments_sum
    FROM installment_payments ip
    INNER JOIN installment_plans ipl ON ip.plan_id = ipl.id
    WHERE ipl.user_id = p_user_id
      AND ipl.payment_method_id = p_payment_method_id
      AND ip.status = 'pending'
      AND ip.transaction_id IS NULL  -- <<< NEW: Exclude linked installments
      AND ip.due_date >= p_start_date
      AND ip.due_date <= p_end_date;

    total_spent := transactions_sum + installments_sum;
    RETURN total_spent;
  END;
  $$ LANGUAGE plpgsql STABLE;

-- Add comment for documentation
COMMENT ON FUNCTION calculate_statement_budget_spent(UUID, UUID, DATE, DATE) IS
'Calculates total budget spent in a statement period.
Single source of truth for budget progress calculations across web and WhatsApp.

Parameters:
  p_payment_method_id: Payment method ID to calculate for
  p_user_id: User ID (for RLS enforcement)
  p_start_date: Start of statement period (inclusive)
  p_end_date: End of statement period (inclusive)

Returns:
  DECIMAL(10,2): Total spent (transactions + installment payments)

Logic:
  1. Sum all expense transactions in period
  2. Sum all pending installment payments due in period
  3. Return total (transactions + installments)

Notes:
  - Only expense transactions counted (type = ''expense'')
  - Only pending installment payments counted (to avoid double-counting paid ones)
  - Income transactions excluded
  - Transactions outside period excluded
  - Uses STABLE for performance (can be cached within transaction)

Performance:
  - Uses existing indexes on (user_id, payment_method_id, date)
  - Target: < 200ms for 1000 transactions (NFR5 - critical path)
  - Tested with up to 10,000 transactions with acceptable performance

Example:
  SELECT calculate_statement_budget_spent(
    ''pm-uuid'',
    ''user-uuid'',
    ''2025-12-06'',
    ''2026-01-05''
  );
  -- Returns: 2450.00 (e.g., R$ 2000 transactions + R$ 450 installments)
';

-- ============================================================================
-- Verification Queries (for manual testing)
-- ============================================================================

-- Test 1: User with transactions only (no installments)
-- Expected: Sum of expense transactions in period
-- SELECT calculate_statement_budget_spent(
--   'payment-method-uuid',
--   'user-uuid',
--   '2025-12-01',
--   '2025-12-31'
-- );

-- Test 2: User with transactions + installment payments
-- Expected: Sum of transactions + pending installment payments
-- SELECT calculate_statement_budget_spent(
--   'payment-method-uuid',
--   'user-uuid',
--   '2025-12-01',
--   '2025-12-31'
-- );

-- Test 3: User with no transactions in period
-- Expected: 0.00
-- SELECT calculate_statement_budget_spent(
--   'payment-method-uuid',
--   'user-uuid',
--   '2099-01-01',
--   '2099-01-31'
-- );

-- Test 4: Verify income transactions excluded
-- Expected: Only expenses counted (income ignored)
-- SELECT calculate_statement_budget_spent(
--   'payment-method-uuid',
--   'user-uuid',
--   '2025-12-01',
--   '2025-12-31'
-- );

-- Test 5: Verify paid installments excluded
-- Expected: Only pending installment payments counted
-- SELECT calculate_statement_budget_spent(
--   'payment-method-uuid',
--   'user-uuid',
--   '2025-12-01',
--   '2025-12-31'
-- );
