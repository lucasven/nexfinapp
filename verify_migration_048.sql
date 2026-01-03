-- Verify Migration 048 is working correctly
-- Test with closing_day = 3, today = Dec 10, 2025

-- Test 1: Should return Dec 4 - Jan 3
SELECT
  'Test 1: Today Dec 10, Closing 3' as test_name,
  period_start,
  period_end,
  next_closing
FROM calculate_statement_period(3, '2025-12-10'::DATE);

-- Test 2: Today Dec 2, Closing 3 (before closing day)
-- Should return Nov 4 - Dec 3
SELECT
  'Test 2: Today Dec 2, Closing 3' as test_name,
  period_start,
  period_end,
  next_closing
FROM calculate_statement_period(3, '2025-12-02'::DATE);

-- Test 3: Today Dec 3, Closing 3 (on closing day)
-- Should return Nov 4 - Dec 3
SELECT
  'Test 3: Today Dec 3, Closing 3' as test_name,
  period_start,
  period_end,
  next_closing
FROM calculate_statement_period(3, '2025-12-03'::DATE);

-- Show the current function definition to confirm migration 048 was applied
SELECT
  'Function Source Check' as test_name,
  CASE
    WHEN prosrc LIKE '%period_start_date := make_date(ref_year, ref_month, p_closing_day + 1)%'
    THEN '✅ Migration 048 APPLIED (correct formula)'
    ELSE '❌ Migration 048 NOT APPLIED (old formula)'
  END as migration_status
FROM pg_proc
WHERE proname = 'calculate_statement_period';
