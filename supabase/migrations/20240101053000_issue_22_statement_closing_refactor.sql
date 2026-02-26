-- Migration: 053 - Issue #22: Statement Closing Refactor
-- Description: Refactors credit card statement closing from fixed day to dynamic calculation.
--   OLD MODEL: User sets statement_closing_day (fixed) + payment_due_day (offset after closing)
--   NEW MODEL: User sets payment_due_day (actual day of month) + days_before_closing (days before payment)
--   System CALCULATES closing day dynamically (varies by month length)

-- ============================================================================
-- 1. Add new column: days_before_closing
-- ============================================================================

ALTER TABLE payment_methods ADD COLUMN IF NOT EXISTS days_before_closing INTEGER;

-- ============================================================================
-- 2. Migrate existing data
-- ============================================================================

-- Convert existing cards: 
--   OLD: statement_closing_day=5, payment_due_day=10 (offset) → payment date = 15th
--   NEW: payment_due_day=15 (actual day), days_before_closing=10, statement_closing_day=5 (cached)
UPDATE payment_methods
SET
  -- New payment_due_day = old closing + old offset (the actual day they pay)
  payment_due_day = CASE
    WHEN statement_closing_day IS NOT NULL AND payment_due_day IS NOT NULL THEN
      CASE
        WHEN (statement_closing_day + payment_due_day) > 31 THEN
          (statement_closing_day + payment_due_day) - 31
        ELSE
          statement_closing_day + payment_due_day
      END
    WHEN statement_closing_day IS NOT NULL AND payment_due_day IS NULL THEN
      statement_closing_day  -- If no offset was set, payment day = closing day
    ELSE payment_due_day
  END,
  -- days_before_closing = old payment_due_day (offset), represents gap between closing and payment
  days_before_closing = CASE
    WHEN statement_closing_day IS NOT NULL AND payment_due_day IS NOT NULL THEN
      payment_due_day  -- The old offset becomes days_before
    WHEN statement_closing_day IS NOT NULL THEN
      0  -- No offset = closes on payment day
    ELSE NULL
  END
WHERE statement_closing_day IS NOT NULL;

-- ============================================================================
-- 3. Update constraint on payment_due_day (1-31 day of month, not 1-60 offset)
-- ============================================================================

-- Drop old constraint if exists
DO $$
BEGIN
  -- Find and drop any CHECK constraint on payment_due_day
  PERFORM 1 FROM pg_constraint c
  JOIN pg_class t ON c.conrelid = t.oid
  WHERE t.relname = 'payment_methods'
    AND pg_get_constraintdef(c.oid) LIKE '%payment_due_day%';
  
  IF FOUND THEN
    EXECUTE (
      SELECT 'ALTER TABLE payment_methods DROP CONSTRAINT ' || c.conname
      FROM pg_constraint c
      JOIN pg_class t ON c.conrelid = t.oid
      WHERE t.relname = 'payment_methods'
        AND pg_get_constraintdef(c.oid) LIKE '%payment_due_day%'
      LIMIT 1
    );
  END IF;
END $$;

-- Add new constraint: payment_due_day is now a day-of-month (1-31)
ALTER TABLE payment_methods ADD CONSTRAINT payment_due_day_range 
  CHECK (payment_due_day >= 1 AND payment_due_day <= 31);

-- Add constraint for days_before_closing
ALTER TABLE payment_methods ADD CONSTRAINT days_before_closing_range
  CHECK (days_before_closing >= 0 AND days_before_closing <= 30);

-- ============================================================================
-- 4. SQL Function: calculate_closing_date
-- ============================================================================

CREATE OR REPLACE FUNCTION calculate_closing_date(
  p_payment_day INTEGER,
  p_days_before INTEGER,
  p_reference_date DATE DEFAULT CURRENT_DATE
) RETURNS DATE AS $$
DECLARE
  -- The payment date in the same month as reference
  payment_date DATE;
  closing_date DATE;
BEGIN
  -- Validate inputs
  IF p_payment_day < 1 OR p_payment_day > 31 THEN
    RAISE EXCEPTION 'Payment day must be between 1 and 31';
  END IF;
  IF p_days_before < 0 OR p_days_before > 30 THEN
    RAISE EXCEPTION 'Days before closing must be between 0 and 30';
  END IF;

  -- Build the payment date in the reference month
  -- Handle months shorter than payment_day (e.g., Feb 31 → Feb 28)
  payment_date := make_date(
    EXTRACT(YEAR FROM p_reference_date)::INTEGER,
    EXTRACT(MONTH FROM p_reference_date)::INTEGER,
    LEAST(p_payment_day, EXTRACT(DAY FROM (date_trunc('month', p_reference_date) + INTERVAL '1 month' - INTERVAL '1 day'))::INTEGER)
  );

  -- Closing date = payment date minus days_before
  closing_date := payment_date - p_days_before;

  RETURN closing_date;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION calculate_closing_date(INTEGER, INTEGER, DATE) IS
'Calculates the statement closing date for a given payment day and days-before offset.
The closing date is: payment_day - days_before_closing calendar days.
Varies by month length (e.g., payment day 1, 7 days before: Jan→Dec 25, Mar→Feb 22).

Parameters:
  p_payment_day: Day of month when payment is due (1-31)
  p_days_before: Number of days before payment that statement closes (0-30)
  p_reference_date: Reference date to determine which month (defaults to today)

Returns: The closing date as DATE';

-- ============================================================================
-- 5. SQL Function: calculate_statement_period_v2
-- ============================================================================

CREATE OR REPLACE FUNCTION calculate_statement_period_v2(
  p_payment_day INTEGER,
  p_days_before INTEGER,
  p_reference_date DATE DEFAULT CURRENT_DATE
) RETURNS TABLE(period_start DATE, period_end DATE) AS $$
DECLARE
  current_closing DATE;
  prev_closing DATE;
  ref_month_payment DATE;
BEGIN
  -- Calculate the closing date in the reference month
  current_closing := calculate_closing_date(p_payment_day, p_days_before, p_reference_date);

  -- If reference date is after closing, we're in the next period
  IF p_reference_date > current_closing THEN
    -- Move to next month for closing
    prev_closing := current_closing;
    current_closing := calculate_closing_date(p_payment_day, p_days_before, (p_reference_date + INTERVAL '1 month')::DATE);
  ELSE
    -- Calculate previous closing (one month back)
    prev_closing := calculate_closing_date(p_payment_day, p_days_before, (p_reference_date - INTERVAL '1 month')::DATE);
  END IF;

  -- Period: (prev_closing + 1) to current_closing
  RETURN QUERY SELECT (prev_closing + 1)::DATE AS period_start, current_closing AS period_end;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION calculate_statement_period_v2(INTEGER, INTEGER, DATE) IS
'Calculates statement period boundaries using the new dynamic closing model.

Parameters:
  p_payment_day: Day of month when payment is due (1-31)
  p_days_before: Number of days before payment that statement closes (0-30)
  p_reference_date: Date within the desired period (defaults to today)

Returns:
  period_start: First day of the statement period (previous closing + 1)
  period_end: Last day of the statement period (closing date)';

-- ============================================================================
-- 6. Update get_budget_progress to work with new model
-- ============================================================================

-- Make p_closing_day have a default so it can be omitted
-- When NULL, calculate from payment_methods table
CREATE OR REPLACE FUNCTION get_budget_progress(
  p_user_id UUID,
  p_payment_method_id UUID,
  p_closing_day INTEGER DEFAULT NULL
) RETURNS TABLE(
  budget_amount NUMERIC,
  spent_amount NUMERIC,
  remaining_amount NUMERIC,
  progress_percentage NUMERIC,
  period_start DATE,
  period_end DATE,
  transaction_count INTEGER
) AS $$
DECLARE
  v_closing_day INTEGER;
  v_payment_day INTEGER;
  v_days_before INTEGER;
  v_budget NUMERIC;
  v_period_start DATE;
  v_period_end DATE;
  v_spent NUMERIC;
  v_count INTEGER;
BEGIN
  -- Get payment method details
  SELECT pm.monthly_budget, pm.payment_due_day, pm.days_before_closing, pm.statement_closing_day
  INTO v_budget, v_payment_day, v_days_before, v_closing_day
  FROM payment_methods pm
  WHERE pm.id = p_payment_method_id AND pm.user_id = p_user_id;

  IF v_budget IS NULL THEN
    RETURN;
  END IF;

  -- Use explicit p_closing_day if provided (backward compat)
  IF p_closing_day IS NOT NULL THEN
    v_closing_day := p_closing_day;
  END IF;

  -- Calculate period using new model if available
  IF v_days_before IS NOT NULL AND v_payment_day IS NOT NULL THEN
    SELECT sp.period_start, sp.period_end
    INTO v_period_start, v_period_end
    FROM calculate_statement_period_v2(v_payment_day, v_days_before, CURRENT_DATE) sp;
  ELSIF v_closing_day IS NOT NULL THEN
    -- Fallback to old model
    SELECT sp.period_start, sp.period_end
    INTO v_period_start, v_period_end
    FROM calculate_statement_period(v_closing_day, CURRENT_DATE) sp;
  ELSE
    RETURN;
  END IF;

  -- Calculate spent amount and count
  SELECT COALESCE(SUM(ABS(t.amount)), 0), COUNT(*)
  INTO v_spent, v_count
  FROM transactions t
  WHERE t.user_id = p_user_id
    AND t.payment_method_id = p_payment_method_id
    AND t.date >= v_period_start
    AND t.date <= v_period_end
    AND t.type = 'expense';

  RETURN QUERY SELECT
    v_budget,
    v_spent,
    v_budget - v_spent,
    CASE WHEN v_budget > 0 THEN (v_spent / v_budget * 100) ELSE 0 END,
    v_period_start,
    v_period_end,
    v_count;
END;
$$ LANGUAGE plpgsql;
