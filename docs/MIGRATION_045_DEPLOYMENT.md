# Migration 045 Deployment Instructions

**Story:** 3.3 - Budget Progress Dashboard Statement Period
**Epic:** 3 - Statement-Aware Budgets
**Date:** 2025-12-03

## Overview

This migration creates the `calculate_statement_budget_spent()` PostgreSQL function required for Story 3.3 budget progress calculations.

## Prerequisites

- Stories 3.1 (statement closing date) and 3.2 (monthly budget) must be deployed
- Migrations 044 (statement period calculation) must be applied
- Supabase project connection string available

## Migration File

- **File:** `fe/scripts/045_budget_calculation_function.sql`
- **Type:** PostgreSQL function creation (no schema changes)
- **Rollback:** Function can be dropped with `DROP FUNCTION IF EXISTS calculate_statement_budget_spent(UUID, UUID, DATE, DATE);`

## Deployment Steps

### Option 1: Supabase Dashboard (Recommended for Production)

1. Log in to Supabase Dashboard: https://app.supabase.com
2. Navigate to project → SQL Editor
3. Open new query
4. Copy contents of `fe/scripts/045_budget_calculation_function.sql`
5. Paste and execute
6. Verify function created:
   ```sql
   SELECT routine_name, routine_type
   FROM information_schema.routines
   WHERE routine_name = 'calculate_statement_budget_spent';
   ```

### Option 2: psql Command Line

```bash
# Set environment variable (from .env file)
export SUPABASE_DB_URL="postgresql://..."

# Run migration
psql $SUPABASE_DB_URL < fe/scripts/045_budget_calculation_function.sql

# Verify
psql $SUPABASE_DB_URL -c "SELECT routine_name FROM information_schema.routines WHERE routine_name = 'calculate_statement_budget_spent';"
```

### Option 3: Supabase CLI (Local Development)

```bash
# Start local Supabase
supabase start

# Apply migration
supabase db push

# Or apply specific file
psql $(supabase status -o env | grep DATABASE_URL | cut -d'=' -f2) < fe/scripts/045_budget_calculation_function.sql
```

## Verification

After deployment, verify the function works:

```sql
-- Test with sample data (replace with real payment method and user IDs)
SELECT calculate_statement_budget_spent(
  'your-payment-method-uuid'::UUID,
  'your-user-uuid'::UUID,
  '2025-12-01'::DATE,
  '2025-12-31'::DATE
);

-- Expected: Returns DECIMAL(10,2) with total spent in period
```

## Performance Validation

The function MUST complete in < 200ms (NFR5 - critical path requirement).

Test with production-like data:

```sql
-- Enable timing
\timing on

-- Run with realistic date range
SELECT calculate_statement_budget_spent(
  'payment-method-uuid'::UUID,
  'user-uuid'::UUID,
  CURRENT_DATE - INTERVAL '30 days',
  CURRENT_DATE
);

-- Expected: < 200ms execution time
```

If performance is slow:
1. Verify indexes exist on `transactions(user_id, payment_method_id, date)`
2. Verify indexes exist on `installment_plans(user_id, payment_method_id)`
3. Run `ANALYZE transactions;` and `ANALYZE installment_plans;`

## Frontend Deployment

After database migration is applied:

1. Deploy frontend code with budget progress widgets
2. Clear CDN cache if using one
3. Verify no errors in browser console
4. Monitor PostHog for `budget_progress_viewed` events

## Rollback Plan

If issues arise:

```sql
-- Remove the function
DROP FUNCTION IF EXISTS calculate_statement_budget_spent(UUID, UUID, DATE, DATE);

-- Redeploy previous frontend version that doesn't call this function
```

## Post-Deployment Validation

1. **Feature Check:**
   - Log in as user with Credit Mode card
   - Verify budget progress widgets visible on dashboard
   - Verify spent amount matches transactions + installments
   - Verify progress bar displays correctly

2. **Performance Check:**
   - Check server logs for budget calculation warnings (> 200ms)
   - Monitor PostHog `budget_query_slow` events
   - Should see < 1% slow queries

3. **Simple Mode Check:**
   - Log in as Simple Mode user
   - Verify NO budget widgets displayed
   - Verify dashboard loads normally

## Monitoring

After deployment, monitor:

- `budget_progress_viewed` events in PostHog
- `budget_query_slow` events (should be rare)
- Error rates on `/` dashboard route
- Database function execution times

## Estimated Deployment Time

- Database migration: 1 minute
- Frontend deployment: 5-10 minutes
- Verification: 5 minutes
- **Total: ~15 minutes**

## Dependencies

**Requires:**
- Migration 044 (`calculate_statement_period` function)
- Story 3.1 (`payment_methods.statement_closing_day`)
- Story 3.2 (`payment_methods.monthly_budget`)

**Enables:**
- Story 3.3 (Budget Progress Dashboard)
- Future: Story 3.4 (Statement Closing Reminder)
- Future: Story 3.5 (Pre-Statement Summary)

## Contact

If issues arise during deployment, check:
- Database logs for function errors
- Browser console for React Query errors
- Server logs for performance warnings
- PostHog for event tracking issues
