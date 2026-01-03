-- Migration: 043_budget_with_installments.sql
-- Story 2.8: Installment Impact on Budget Tracking
-- Description: Create database function to calculate budget including installment payments
-- Author: Dev Agent (BMAD dev-story workflow)
-- Date: 2025-12-03

-- =====================================================
-- Function: get_budget_for_period
-- =====================================================
-- Purpose: Calculate budget for a statement period including:
--   - Regular transactions in the period
--   - Installment payments due in the period (pending only)
--
-- Key Features:
--   - UNION ALL for efficient query (no duplicate elimination)
--   - Only pending installment payments (avoid double counting paid ones)
--   - Category grouping with transaction details
--   - Performance optimized with existing indexes
--
-- Parameters:
--   p_user_id: User ID
--   p_payment_method_id: Payment method ID
--   p_period_start: Statement period start date (YYYY-MM-DD)
--   p_period_end: Statement period end date (YYYY-MM-DD)
--
-- Returns: Table with columns:
--   - date: Transaction/payment date
--   - description: Transaction/payment description
--   - amount: Transaction/payment amount
--   - category_id: Category ID (nullable)
--   - category_name: Category name
--   - category_emoji: Category emoji
--   - is_installment: Boolean flag (true for installment payments)
--   - installment_number: Payment number (for installments only)
--   - total_installments: Total installment count (for installments only)
--   - plan_description: Installment plan description (for installments only)
-- =====================================================

CREATE OR REPLACE FUNCTION get_budget_for_period(
  p_user_id UUID,
  p_payment_method_id UUID,
  p_period_start DATE,
  p_period_end DATE
)
RETURNS TABLE (
  date DATE,
  description TEXT,
  amount DECIMAL,
  category_id UUID,
  category_name TEXT,
  category_emoji TEXT,
  is_installment BOOLEAN,
  installment_number INTEGER,
  total_installments INTEGER,
  plan_description TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    combined.date,
    combined.description,
    combined.amount,
    combined.category_id,
    COALESCE(c.name, 'Sem Categoria') AS category_name,
    c.icon AS category_emoji,
    combined.is_installment,
    combined.installment_number,
    combined.total_installments,
    combined.plan_description
  FROM (
    -- Part 1: Regular transactions in period
    SELECT
      t.date::DATE AS date,
      t.description,
      t.amount,
      t.category_id,
      FALSE AS is_installment,
      NULL::INTEGER AS installment_number,
      NULL::INTEGER AS total_installments,
      NULL::TEXT AS plan_description
    FROM transactions t
    WHERE t.user_id = p_user_id
      AND t.payment_method_id = p_payment_method_id
      AND t.date >= p_period_start
      AND t.date <= p_period_end
      AND t.type = 'expense'

    UNION ALL

    -- Part 2: Installment payments due in period (pending only)
    SELECT
      ip.due_date::DATE AS date,
      ipl.description,
      ip.amount,
      ipl.category_id,
      TRUE AS is_installment,
      ip.installment_number,
      ipl.total_installments,
      ipl.description AS plan_description
    FROM installment_payments ip
    JOIN installment_plans ipl ON ip.plan_id = ipl.id
    WHERE ipl.user_id = p_user_id
      AND ipl.payment_method_id = p_payment_method_id
      AND ip.due_date >= p_period_start
      AND ip.due_date <= p_period_end
      AND ip.status = 'pending'
  ) combined
  LEFT JOIN categories c ON combined.category_id = c.id
  ORDER BY combined.date DESC, combined.is_installment ASC;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_budget_for_period(UUID, UUID, DATE, DATE) TO authenticated;

-- Add comment
COMMENT ON FUNCTION get_budget_for_period IS 'Story 2.8: Calculate budget for statement period including regular transactions and installment payments';

-- =====================================================
-- Verification Queries (for testing)
-- =====================================================
-- These queries can be used to verify the function works correctly

-- Example 1: Get budget for a specific period
-- SELECT * FROM get_budget_for_period(
--   'user-uuid',
--   'payment-method-uuid',
--   '2024-12-06',
--   '2025-01-05'
-- );

-- Example 2: Calculate total spent
-- SELECT SUM(amount) as total_spent
-- FROM get_budget_for_period(
--   'user-uuid',
--   'payment-method-uuid',
--   '2024-12-06',
--   '2025-01-05'
-- );

-- Example 3: Group by category
-- SELECT
--   category_name,
--   category_emoji,
--   SUM(amount) as category_total,
--   COUNT(*) as transaction_count,
--   SUM(CASE WHEN is_installment THEN 1 ELSE 0 END) as installment_count,
--   SUM(CASE WHEN NOT is_installment THEN 1 ELSE 0 END) as regular_count
-- FROM get_budget_for_period(
--   'user-uuid',
--   'payment-method-uuid',
--   '2024-12-06',
--   '2025-01-05'
-- )
-- GROUP BY category_name, category_emoji
-- ORDER BY category_total DESC;

-- =====================================================
-- Performance Notes
-- =====================================================
-- This function leverages existing indexes:
--   - idx_transactions_user_method_date (from Epic 1)
--   - idx_installment_payments_due_date_status (from Epic 1)
--   - idx_installment_plans_user_status (from Epic 1)
--
-- Target performance: < 300ms for 20 transactions + 10 installments
-- Use UNION ALL (not UNION) to avoid duplicate elimination overhead
-- =====================================================
