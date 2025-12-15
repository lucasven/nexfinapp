-- Migration: create_installment_plan_atomic function
-- Split from 042_atomic_transaction_functions.sql for Supabase compatibility

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
