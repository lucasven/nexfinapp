-- Migration: Atomic Transaction Functions for Credit Mode and Installments
-- Purpose: Implement PostgreSQL RPC functions for atomic multi-table operations
-- Date: 2025-12-02
-- Epic: 2 - Parcelamento Intelligence
-- Story: 2.0 - Epic 2 Foundation & Blockers Resolution (Part 3)
-- Version: 042

-- ============================================================================
-- SECTION 1: switch_credit_mode_atomic()
-- Purpose: Atomically switch payment method credit_mode with optional installment cleanup
-- ============================================================================

CREATE OR REPLACE FUNCTION switch_credit_mode_atomic(
  p_user_id UUID,
  p_payment_method_id UUID,
  p_new_mode BOOLEAN,
  p_cleanup_installments BOOLEAN DEFAULT FALSE
) RETURNS TABLE(success BOOLEAN, error_message TEXT) AS $$
BEGIN
  -- Validate payment method ownership
  IF NOT EXISTS (
    SELECT 1 FROM payment_methods
    WHERE id = p_payment_method_id AND user_id = p_user_id
  ) THEN
    RETURN QUERY SELECT FALSE, 'Payment method not found or unauthorized'::TEXT;
    RETURN;
  END IF;

  -- If cleanup requested AND switching TO Simple Mode (p_new_mode = FALSE)
  -- Mark installment plans as paid_off and cancel pending payments
  IF p_cleanup_installments = TRUE AND p_new_mode = FALSE THEN
    -- Update installment_plans to paid_off status
    UPDATE installment_plans
    SET status = 'paid_off', updated_at = NOW()
    WHERE payment_method_id = p_payment_method_id
      AND user_id = p_user_id
      AND status = 'active';

    -- Cancel all pending installment payments for this payment method
    UPDATE installment_payments
    SET status = 'cancelled', updated_at = NOW()
    WHERE plan_id IN (
      SELECT id FROM installment_plans
      WHERE payment_method_id = p_payment_method_id
        AND user_id = p_user_id
    ) AND status = 'pending';
  END IF;

  -- Update payment_methods.credit_mode
  UPDATE payment_methods
  SET credit_mode = p_new_mode, updated_at = NOW()
  WHERE id = p_payment_method_id AND user_id = p_user_id;

  -- Return success
  RETURN QUERY SELECT TRUE, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  -- Automatic rollback on any error (PostgreSQL transaction semantics)
  RETURN QUERY SELECT FALSE, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql;

-- Add function comment
COMMENT ON FUNCTION switch_credit_mode_atomic IS
  'Atomically switch payment method credit mode with optional installment cleanup. All operations succeed or fail together.';

-- ============================================================================
-- SECTION 2: create_installment_plan_atomic()
-- Purpose: Atomically create installment plan + all monthly payment records
-- ============================================================================

CREATE OR REPLACE FUNCTION create_installment_plan_atomic(
  p_user_id UUID,
  p_payment_method_id UUID,
  p_description TEXT,
  p_total_amount DECIMAL(10,2),
  p_total_installments INTEGER,
  p_merchant TEXT,
  p_category_id UUID,
  p_first_payment_date DATE
) RETURNS TABLE(plan_id UUID, success BOOLEAN, error_message TEXT) AS $$
DECLARE
  v_plan_id UUID;
  v_payment_amount DECIMAL(10,2);
  v_current_date DATE;
  i INTEGER;
BEGIN
  -- Validate inputs
  IF p_total_installments < 1 OR p_total_installments > 60 THEN
    RETURN QUERY SELECT NULL::UUID, FALSE, 'Installments must be between 1 and 60'::TEXT;
    RETURN;
  END IF;

  IF p_total_amount <= 0 THEN
    RETURN QUERY SELECT NULL::UUID, FALSE, 'Total amount must be positive'::TEXT;
    RETURN;
  END IF;

  -- Validate payment method ownership and Credit Mode
  IF NOT EXISTS (
    SELECT 1 FROM payment_methods
    WHERE id = p_payment_method_id
      AND user_id = p_user_id
      AND type = 'credit'
      AND credit_mode = TRUE
  ) THEN
    RETURN QUERY SELECT NULL::UUID, FALSE, 'Payment method must be Credit Mode credit card'::TEXT;
    RETURN;
  END IF;

  -- Calculate payment amount per installment (rounded to 2 decimals)
  v_payment_amount := ROUND(p_total_amount / p_total_installments, 2);

  -- Create installment plan (parent record)
  INSERT INTO installment_plans (
    user_id, payment_method_id, description, total_amount,
    total_installments, status, merchant, category_id
  ) VALUES (
    p_user_id, p_payment_method_id, p_description, p_total_amount,
    p_total_installments, 'active', p_merchant, p_category_id
  ) RETURNING id INTO v_plan_id;

  -- Create monthly installment payments (child records)
  v_current_date := p_first_payment_date;
  FOR i IN 1..p_total_installments LOOP
    INSERT INTO installment_payments (
      plan_id, installment_number, due_date, amount, status
    ) VALUES (
      v_plan_id, i, v_current_date, v_payment_amount, 'pending'
    );

    -- Move to next month (handles month overflow automatically)
    v_current_date := v_current_date + INTERVAL '1 month';
  END LOOP;

  -- Return success with plan_id
  RETURN QUERY SELECT v_plan_id, TRUE, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  -- Automatic rollback on any error
  -- Both installment_plans and installment_payments will be rolled back
  RETURN QUERY SELECT NULL::UUID, FALSE, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql;

-- Add function comment
COMMENT ON FUNCTION create_installment_plan_atomic IS
  'Atomically create installment plan with all monthly payment records. All-or-nothing operation prevents partial state.';

-- ============================================================================
-- SECTION 3: delete_installment_plan_atomic()
-- Purpose: Atomically delete/cancel installment plan and pending payments
-- ============================================================================

CREATE OR REPLACE FUNCTION delete_installment_plan_atomic(
  p_user_id UUID,
  p_plan_id UUID,
  p_delete_type TEXT -- 'cancel' or 'paid_off'
) RETURNS TABLE(success BOOLEAN, error_message TEXT) AS $$
BEGIN
  -- Validate ownership
  IF NOT EXISTS (
    SELECT 1 FROM installment_plans
    WHERE id = p_plan_id AND user_id = p_user_id
  ) THEN
    RETURN QUERY SELECT FALSE, 'Installment plan not found or unauthorized'::TEXT;
    RETURN;
  END IF;

  -- Validate delete_type parameter
  IF p_delete_type NOT IN ('cancel', 'paid_off') THEN
    RETURN QUERY SELECT FALSE, 'Invalid delete_type (must be cancel or paid_off)'::TEXT;
    RETURN;
  END IF;

  -- Update plan status based on delete_type
  UPDATE installment_plans
  SET status = p_delete_type::TEXT, updated_at = NOW()
  WHERE id = p_plan_id AND user_id = p_user_id;

  -- Cancel all pending installment payments
  UPDATE installment_payments
  SET status = 'cancelled', updated_at = NOW()
  WHERE plan_id = p_plan_id AND status = 'pending';

  -- Return success
  RETURN QUERY SELECT TRUE, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  -- Automatic rollback on any error
  RETURN QUERY SELECT FALSE, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql;

-- Add function comment
COMMENT ON FUNCTION delete_installment_plan_atomic IS
  'Atomically delete or cancel installment plan with all pending payments. Supports cancel and paid_off operations.';

-- ============================================================================
-- SECTION 4: POST-MIGRATION VALIDATION
-- Purpose: Verify functions created successfully
-- ============================================================================

-- Verify all 3 functions exist (should return 3 rows):
DO $$
DECLARE
  function_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO function_count
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public'
    AND p.proname IN (
      'switch_credit_mode_atomic',
      'create_installment_plan_atomic',
      'delete_installment_plan_atomic'
    );

  IF function_count = 3 THEN
    RAISE NOTICE 'All 3 atomic transaction functions created successfully';
  ELSE
    RAISE WARNING 'Expected 3 functions, found %', function_count;
  END IF;
END $$;

-- ============================================================================
-- MIGRATION COMPLETE
-- Expected execution time: < 5 seconds
-- Post-migration: Test functions manually in Supabase SQL editor
-- Rollback: See 042_atomic_transaction_functions_rollback.sql
-- ============================================================================

-- Manual testing queries (run in Supabase SQL editor):
--
-- Test 1: switch_credit_mode_atomic (without cleanup)
-- SELECT * FROM switch_credit_mode_atomic(
--   '<user-uuid>',
--   '<payment-method-uuid>',
--   TRUE, -- Switch to Credit Mode
--   FALSE -- Don't cleanup installments
-- );
--
-- Test 2: create_installment_plan_atomic (12 monthly payments)
-- SELECT * FROM create_installment_plan_atomic(
--   '<user-uuid>',
--   '<payment-method-uuid>',
--   'Macbook Pro',
--   12000.00,
--   12,
--   'Apple Store',
--   '<category-uuid>',
--   '2025-01-01'::DATE
-- );
--
-- Test 3: delete_installment_plan_atomic (cancel)
-- SELECT * FROM delete_installment_plan_atomic(
--   '<user-uuid>',
--   '<plan-uuid>',
--   'cancel'
-- );
--
-- Verify rollback behavior:
-- Try creating plan with invalid data (e.g., 100 installments)
-- SELECT * FROM create_installment_plan_atomic(
--   '<user-uuid>',
--   '<payment-method-uuid>',
--   'Test',
--   1000.00,
--   100, -- Invalid (> 60)
--   NULL,
--   NULL,
--   '2025-01-01'::DATE
-- );
-- Expected: Returns success=FALSE, no records created in database
