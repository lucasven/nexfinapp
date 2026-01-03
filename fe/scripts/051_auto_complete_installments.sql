-- Migration 051: Auto-Complete Installment Plans
-- Purpose: Automatically mark installment plans as 'paid_off' when all payments are completed
-- Story: 2.5 Enhancement - Auto-transition fully paid installments
-- Date: 2024-12-08

-- ==============================================
-- Step 1: Create trigger function
-- ==============================================

CREATE OR REPLACE FUNCTION auto_complete_installment_plan()
RETURNS TRIGGER AS $$
DECLARE
  v_total_payments INTEGER;
  v_paid_payments INTEGER;
  v_current_status TEXT;
BEGIN
  -- Only process if a payment was just marked as 'paid'
  IF NEW.status = 'paid' AND (OLD.status IS NULL OR OLD.status != 'paid') THEN

    -- Get the current plan status
    SELECT status INTO v_current_status
    FROM installment_plans
    WHERE id = NEW.plan_id;

    -- Only process if plan is currently 'active'
    IF v_current_status = 'active' THEN

      -- Count total payments for this plan
      SELECT COUNT(*) INTO v_total_payments
      FROM installment_payments
      WHERE plan_id = NEW.plan_id;

      -- Count paid payments for this plan
      SELECT COUNT(*) INTO v_paid_payments
      FROM installment_payments
      WHERE plan_id = NEW.plan_id
        AND status = 'paid';

      -- If all payments are paid, mark plan as paid_off
      IF v_paid_payments = v_total_payments THEN
        UPDATE installment_plans
        SET
          status = 'paid_off',
          updated_at = NOW()
        WHERE id = NEW.plan_id;

        RAISE NOTICE 'Auto-completed installment plan %: all % payments are paid', NEW.plan_id, v_total_payments;
      END IF;

    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add comment
COMMENT ON FUNCTION auto_complete_installment_plan() IS
  'Trigger function that automatically marks installment plans as paid_off when all payments are completed. Only processes active plans.';

-- ==============================================
-- Step 2: Create trigger
-- ==============================================

DROP TRIGGER IF EXISTS trigger_auto_complete_installment_plan ON installment_payments;

CREATE TRIGGER trigger_auto_complete_installment_plan
  AFTER UPDATE OF status ON installment_payments
  FOR EACH ROW
  WHEN (NEW.status = 'paid')
  EXECUTE FUNCTION auto_complete_installment_plan();

-- Add comment
COMMENT ON TRIGGER trigger_auto_complete_installment_plan ON installment_payments IS
  'Automatically marks installment plans as paid_off when all payments reach paid status';

-- ==============================================
-- Step 3: Backfill existing data
-- ==============================================
-- Find and fix any installment plans that should already be marked as paid_off

WITH fully_paid_plans AS (
  SELECT
    ip.id AS plan_id,
    COUNT(*) AS total_payments,
    COUNT(*) FILTER (WHERE ipm.status = 'paid') AS paid_payments
  FROM installment_plans ip
  LEFT JOIN installment_payments ipm ON ipm.plan_id = ip.id
  WHERE ip.status = 'active'
  GROUP BY ip.id
  HAVING COUNT(*) = COUNT(*) FILTER (WHERE ipm.status = 'paid')
    AND COUNT(*) > 0  -- Ensure plan has payments
)
UPDATE installment_plans
SET
  status = 'paid_off',
  updated_at = NOW()
FROM fully_paid_plans
WHERE installment_plans.id = fully_paid_plans.plan_id;

-- Report results
DO $$
DECLARE
  v_updated_count INTEGER;
BEGIN
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  IF v_updated_count > 0 THEN
    RAISE NOTICE 'Backfill: Updated % installment plans from active to paid_off', v_updated_count;
  ELSE
    RAISE NOTICE 'Backfill: No installment plans needed status update';
  END IF;
END $$;

-- ==============================================
-- Verification queries (for manual testing)
-- ==============================================

-- Query 1: Check trigger exists
-- SELECT
--   tgname AS trigger_name,
--   pg_get_triggerdef(oid) AS trigger_definition
-- FROM pg_trigger
-- WHERE tgname = 'trigger_auto_complete_installment_plan';

-- Query 2: Find plans that should be auto-completed (should return 0 rows after migration)
-- SELECT
--   ip.id,
--   ip.description,
--   ip.status,
--   COUNT(*) AS total_payments,
--   COUNT(*) FILTER (WHERE ipm.status = 'paid') AS paid_payments
-- FROM installment_plans ip
-- LEFT JOIN installment_payments ipm ON ipm.plan_id = ip.id
-- WHERE ip.status = 'active'
-- GROUP BY ip.id, ip.description, ip.status
-- HAVING COUNT(*) = COUNT(*) FILTER (WHERE ipm.status = 'paid')
--   AND COUNT(*) > 0;

-- Query 3: Count plans by status
-- SELECT status, COUNT(*)
-- FROM installment_plans
-- GROUP BY status
-- ORDER BY status;
