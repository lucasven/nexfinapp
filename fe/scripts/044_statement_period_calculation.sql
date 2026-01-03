-- Migration: 044 - Statement Period Calculation Function
-- Epic: 3 - Statement-Aware Budgets
-- Story: 3.1 - Set Statement Closing Date
-- Date: 2025-12-03
-- Description: Creates the calculate_statement_period() PostgreSQL function for
--              consistent statement period calculations across web and WhatsApp.
--              Handles edge cases like Feb 31, leap years, and months with < 31 days.

-- ============================================================================
-- Statement Period Calculation Function
-- ============================================================================

CREATE OR REPLACE FUNCTION calculate_statement_period(
  p_closing_day INTEGER,
  p_reference_date DATE DEFAULT CURRENT_DATE
) RETURNS TABLE(period_start DATE, period_end DATE, next_closing DATE) AS $$
DECLARE
  current_month_closing DATE;
  prev_month_closing DATE;
  next_month_closing DATE;
BEGIN
  -- Validate closing day (1-31)
  IF p_closing_day < 1 OR p_closing_day > 31 THEN
    RAISE EXCEPTION 'Closing day must be between 1 and 31';
  END IF;

  -- Handle edge case: Feb 31 → Feb 28/29, Day 31 in 30-day months → Day 30
  -- Calculate current month closing date (adjusted for month length)
  current_month_closing := make_date(
    EXTRACT(YEAR FROM p_reference_date)::INTEGER,
    EXTRACT(MONTH FROM p_reference_date)::INTEGER,
    LEAST(p_closing_day, EXTRACT(DAY FROM (date_trunc('month', p_reference_date) + INTERVAL '1 month' - INTERVAL '1 day'))::INTEGER)
  );

  -- Calculate previous month closing date (adjusted for month length)
  prev_month_closing := make_date(
    EXTRACT(YEAR FROM (p_reference_date - INTERVAL '1 month'))::INTEGER,
    EXTRACT(MONTH FROM (p_reference_date - INTERVAL '1 month'))::INTEGER,
    LEAST(p_closing_day, EXTRACT(DAY FROM (date_trunc('month', p_reference_date - INTERVAL '1 month') + INTERVAL '1 month' - INTERVAL '1 day'))::INTEGER)
  );

  -- Calculate next month closing date (for use in the ELSE branch)
  next_month_closing := make_date(
    EXTRACT(YEAR FROM (p_reference_date + INTERVAL '1 month'))::INTEGER,
    EXTRACT(MONTH FROM (p_reference_date + INTERVAL '1 month'))::INTEGER,
    LEAST(p_closing_day, EXTRACT(DAY FROM (date_trunc('month', p_reference_date + INTERVAL '1 month') + INTERVAL '1 month' - INTERVAL '1 day'))::INTEGER)
  );

  -- Determine period boundaries based on reference date
  IF p_reference_date <= current_month_closing THEN
    -- Current period: (prev_month_closing + 1 day) to current_month_closing
    -- Example: Today is Dec 1, closing day 15
    --          Period: Nov 16 - Dec 15
    --          Next closing: Dec 15
    RETURN QUERY SELECT
      (prev_month_closing + INTERVAL '1 day')::DATE AS period_start,
      current_month_closing AS period_end,
      current_month_closing AS next_closing;
  ELSE
    -- Next period: (current_month_closing + 1 day) to next_month_closing
    -- Example: Today is Dec 20, closing day 15
    --          Period: Dec 16 - Jan 15
    --          Next closing: Jan 15
    RETURN QUERY SELECT
      (current_month_closing + INTERVAL '1 day')::DATE AS period_start,
      next_month_closing AS period_end,
      next_month_closing AS next_closing;
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Add comment for documentation
COMMENT ON FUNCTION calculate_statement_period(INTEGER, DATE) IS
'Calculates statement period boundaries for a given closing day and reference date.
Single source of truth for period calculations across web and WhatsApp.

Parameters:
  p_closing_day: Day of month when statement closes (1-31)
  p_reference_date: Date to calculate period for (defaults to today)

Returns:
  period_start: First day of current statement period
  period_end: Last day of current statement period (closing date)
  next_closing: Next closing date

Edge Cases:
  - Feb 31 (non-leap): Adjusts to Feb 28
  - Feb 31 (leap year): Adjusts to Feb 29
  - Day 30 in Feb: Adjusts to Feb 28/29
  - Day 31 in 30-day months (Apr, Jun, Sep, Nov): Adjusts to day 30

Example:
  SELECT * FROM calculate_statement_period(15, ''2025-12-01'');
  -- Returns: period_start=2025-11-16, period_end=2025-12-15, next_closing=2025-12-15
';

-- ============================================================================
-- Verification Queries (for manual testing)
-- ============================================================================

-- Test 1: Day 15, before closing (Dec 1, closing 15)
-- Expected: Period Nov 16 - Dec 15
-- SELECT * FROM calculate_statement_period(15, '2025-12-01');

-- Test 2: Day 15, after closing (Dec 20, closing 15)
-- Expected: Period Dec 16 - Jan 15
-- SELECT * FROM calculate_statement_period(15, '2025-12-20');

-- Test 3: Feb 31 in non-leap year
-- Expected: Adjusts to Feb 28
-- SELECT * FROM calculate_statement_period(31, '2025-02-15');

-- Test 4: Feb 31 in leap year
-- Expected: Adjusts to Feb 29
-- SELECT * FROM calculate_statement_period(31, '2024-02-15');

-- Test 5: Day 31 in April (30-day month)
-- Expected: Adjusts to Apr 30
-- SELECT * FROM calculate_statement_period(31, '2025-04-15');

-- Test 6: Day 30 in February non-leap
-- Expected: Adjusts to Feb 28
-- SELECT * FROM calculate_statement_period(30, '2025-02-15');

-- Test 7: Day 1 (edge case)
-- Expected: Period from 2nd of previous month to 1st of current month
-- SELECT * FROM calculate_statement_period(1, '2025-12-01');

-- Test 8: Day 31 (edge case in 31-day month)
-- Expected: Full month period
-- SELECT * FROM calculate_statement_period(31, '2025-12-15');
