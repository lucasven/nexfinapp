-- Rollback Migration 051: Auto-Complete Installment Plans
-- Date: 2024-12-08

-- ==============================================
-- Step 1: Drop trigger
-- ==============================================

DROP TRIGGER IF EXISTS trigger_auto_complete_installment_plan ON installment_payments;

RAISE NOTICE 'Dropped trigger: trigger_auto_complete_installment_plan';

-- ==============================================
-- Step 2: Drop trigger function
-- ==============================================

DROP FUNCTION IF EXISTS auto_complete_installment_plan();

RAISE NOTICE 'Dropped function: auto_complete_installment_plan()';

-- ==============================================
-- Step 3: Manual data reversion (OPTIONAL)
-- ==============================================

-- WARNING: This rollback does NOT revert plans marked as 'paid_off' back to 'active'
-- because we cannot determine which plans were auto-completed by the trigger vs
-- manually paid off by users.
--
-- If you need to revert specific plans, run this query manually:
--
-- UPDATE installment_plans
-- SET status = 'active', updated_at = NOW()
-- WHERE id IN (
--   'plan-id-1',
--   'plan-id-2'
-- );

RAISE NOTICE 'Rollback complete. Note: Plan statuses were NOT reverted. See script comments for manual reversion.';
