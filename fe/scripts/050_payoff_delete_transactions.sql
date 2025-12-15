-- Migration: Update delete_installment_plan_atomic to delete transactions
-- Date: 2025-12-08
-- Description: When paying off installments, delete future transactions to prevent orphaned records

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

  -- NEW: Delete transactions linked to pending payments
  -- This prevents orphaned transactions from appearing on the dashboard
  DELETE FROM transactions
  WHERE id IN (
    SELECT transaction_id
    FROM installment_payments
    WHERE plan_id = p_plan_id
      AND status = 'pending'
      AND transaction_id IS NOT NULL
  );

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
