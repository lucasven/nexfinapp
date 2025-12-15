-- Migration: switch_credit_mode_atomic function
-- Split from 042_atomic_transaction_functions.sql for Supabase compatibility

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
