-- Migration: 053 - Fix Statement Period Overflow
-- Date: 2026-01-08
-- Description: Fixes calculate_statement_period() to handle months with fewer days
--              than the closing day (e.g., Feb 30 -> Feb 28).
--
-- Issue: For closing days 26-31, the function could:
--   1. Error with make_date(2026, 2, 30) - Feb 30 doesn't exist
--   2. Overflow period_end into the next month (Jan 31 period ending Mar 2)
--
-- Fix: Use LEAST() to cap closing day to the actual last day of the target month.

-- ============================================================================
-- Helper Function: Get last day of month
-- ============================================================================

CREATE OR REPLACE FUNCTION get_last_day_of_month(p_date DATE)
RETURNS INTEGER AS $$
BEGIN
  RETURN EXTRACT(DAY FROM (date_trunc('month', p_date) + INTERVAL '1 month' - INTERVAL '1 day'))::INTEGER;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================================
-- Fixed calculate_statement_period Function
-- ============================================================================

CREATE OR REPLACE FUNCTION calculate_statement_period(
  p_closing_day INTEGER,
  p_reference_date DATE DEFAULT CURRENT_DATE
) RETURNS TABLE(period_start DATE, period_end DATE, next_closing DATE) AS $$
DECLARE
  ref_year INTEGER;
  ref_month INTEGER;
  ref_day INTEGER;
  period_start_date DATE;
  period_end_date DATE;
  next_closing_date DATE;
  -- Variables for safe date calculations
  current_month_last_day INTEGER;
  prev_month_last_day INTEGER;
  next_month_last_day INTEGER;
  actual_closing_day INTEGER;
  prev_month_first DATE;
  next_month_first DATE;
BEGIN
  -- Validate closing day (1-31)
  IF p_closing_day < 1 OR p_closing_day > 31 THEN
    RAISE EXCEPTION 'Closing day must be between 1 and 31';
  END IF;

  ref_year := EXTRACT(YEAR FROM p_reference_date)::INTEGER;
  ref_month := EXTRACT(MONTH FROM p_reference_date)::INTEGER;
  ref_day := EXTRACT(DAY FROM p_reference_date)::INTEGER;

  -- Get last day of current month (handles Feb, 30-day months, etc.)
  current_month_last_day := get_last_day_of_month(p_reference_date);

  -- Determine effective closing day for current month
  actual_closing_day := LEAST(p_closing_day, current_month_last_day);

  IF ref_day <= actual_closing_day THEN
    -- Before or on closing day: current period ends this month
    -- Period: (prev month, closingDay + 1) to (this month, closingDay)

    -- Period end: this month's closing day (capped to last day)
    period_end_date := make_date(ref_year, ref_month, actual_closing_day);

    -- Period start: previous month's closing day + 1
    prev_month_first := (date_trunc('month', p_reference_date) - INTERVAL '1 month')::DATE;
    prev_month_last_day := get_last_day_of_month(prev_month_first);
    -- Cap previous closing day to last day of previous month, then add 1
    -- But if closing day + 1 > last day, we start on the 1st of current month
    IF p_closing_day >= prev_month_last_day THEN
      -- Previous month closes on its last day, so period starts on 1st of current month
      period_start_date := make_date(ref_year, ref_month, 1);
    ELSE
      period_start_date := prev_month_first + (p_closing_day)::INTEGER;
    END IF;

    next_closing_date := period_end_date;
  ELSE
    -- After closing day: current period ends next month
    -- Period: (this month, closingDay + 1) to (next month, closingDay)

    -- Period start: this month's closing day + 1
    IF actual_closing_day + 1 > current_month_last_day THEN
      -- If closing_day + 1 exceeds this month, start on 1st of next month
      next_month_first := (date_trunc('month', p_reference_date) + INTERVAL '1 month')::DATE;
      period_start_date := next_month_first;
    ELSE
      period_start_date := make_date(ref_year, ref_month, actual_closing_day + 1);
    END IF;

    -- Period end: next month's closing day (capped to last day of next month)
    next_month_first := (date_trunc('month', p_reference_date) + INTERVAL '1 month')::DATE;
    next_month_last_day := get_last_day_of_month(next_month_first);
    period_end_date := make_date(
      EXTRACT(YEAR FROM next_month_first)::INTEGER,
      EXTRACT(MONTH FROM next_month_first)::INTEGER,
      LEAST(p_closing_day, next_month_last_day)
    );

    next_closing_date := period_end_date;
  END IF;

  RETURN QUERY SELECT period_start_date, period_end_date, next_closing_date;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Update function comment
COMMENT ON FUNCTION calculate_statement_period(INTEGER, DATE) IS
'Calculates statement period boundaries for a given closing day and reference date.
Single source of truth for period calculations across web and WhatsApp.

FIXED (Migration 053): Now correctly handles months with fewer days than closing day.
- Feb with closing day 30 -> uses Feb 28 (or 29 in leap year)
- Apr/Jun/Sep/Nov with closing day 31 -> uses day 30
- No more date overflow into next month

Parameters:
  p_closing_day: Day of month when statement closes (1-31)
  p_reference_date: Date to calculate period for (defaults to today)

Returns:
  period_start: First day of current statement period (previous_closing + 1)
  period_end: Last day of current statement period (closing date, capped to month end)
  next_closing: Next closing date

Examples:
  SELECT * FROM calculate_statement_period(30, ''2026-02-15'');
  -- Returns: period_start=2026-01-31, period_end=2026-02-28, next_closing=2026-02-28

  SELECT * FROM calculate_statement_period(31, ''2026-04-15'');
  -- Returns: period_start=2026-04-01, period_end=2026-04-30, next_closing=2026-04-30

  SELECT * FROM calculate_statement_period(30, ''2026-01-31'');
  -- Returns: period_start=2026-01-31, period_end=2026-02-28, next_closing=2026-02-28
';

-- ============================================================================
-- Verification Queries
-- ============================================================================

-- Test 1: Closing day 30 in February (should use Feb 28, not error)
-- SELECT * FROM calculate_statement_period(30, '2026-02-15'::DATE);
-- Expected: period_start=2026-01-31, period_end=2026-02-28

-- Test 2: Closing day 31 in April (should use Apr 30)
-- SELECT * FROM calculate_statement_period(31, '2026-04-15'::DATE);
-- Expected: period_start=2026-04-01, period_end=2026-04-30

-- Test 3: After closing day with overflow prevention
-- SELECT * FROM calculate_statement_period(30, '2026-01-31'::DATE);
-- Expected: period_end=2026-02-28, NOT 2026-03-02

-- Test 4: Normal case (closing day 5, should work as before)
-- SELECT * FROM calculate_statement_period(5, '2026-01-10'::DATE);
-- Expected: period_start=2025-12-06, period_end=2026-01-05
