# Migration 043: Budget with Installments - Deployment Instructions

**Story:** 2.8 - Installment Impact on Budget Tracking
**Migration File:** `fe/scripts/043_budget_with_installments.sql`
**Status:** ⚠️ **NOT YET DEPLOYED** - Manual deployment required

## What This Migration Does

This migration creates the `get_budget_for_period()` database function that:
- Combines regular transactions and installment payments for budget calculation
- Uses UNION ALL for optimal performance
- Filters by statement period (date range)
- Returns category-grouped results with installment context

## Prerequisites

Before deploying this migration, ensure:
- ✅ All previous migrations (001-042) are applied
- ✅ Tables exist: `transactions`, `installment_plans`, `installment_payments`, `categories`
- ✅ Indexes exist from Epic 1 migrations
- ✅ You have database admin access

## Deployment Steps

### Option 1: Using psql Command Line

```bash
# 1. Navigate to the frontend directory
cd fe

# 2. Set your database connection string
export DATABASE_URL="postgresql://user:password@host:port/database"

# 3. Run the migration
psql $DATABASE_URL < scripts/043_budget_with_installments.sql

# 4. Verify the function was created
psql $DATABASE_URL -c "\df get_budget_for_period"
```

### Option 2: Using Supabase Dashboard

1. Log in to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Open the file `fe/scripts/043_budget_with_installments.sql`
4. Copy the entire contents
5. Paste into the SQL Editor
6. Click **Run** to execute
7. Verify success message appears

### Option 3: Using Supabase CLI

```bash
# 1. Make sure you're logged in to Supabase CLI
supabase login

# 2. Link to your project (if not already linked)
supabase link --project-ref your-project-ref

# 3. Run the migration
supabase db push --db-url "postgresql://user:password@host:port/database" \
  --file fe/scripts/043_budget_with_installments.sql
```

## Verification

After deploying, verify the function works correctly:

```sql
-- Test with sample data (replace UUIDs with actual values from your database)
SELECT * FROM get_budget_for_period(
  'your-user-uuid',
  'your-payment-method-uuid',
  '2024-12-06',
  '2025-01-05'
);

-- Expected output:
-- - Rows with regular transactions (is_installment = false)
-- - Rows with installment payments (is_installment = true)
-- - All rows have category_name, category_emoji
-- - Installment rows have installment_number, total_installments, plan_description
```

## Performance Check

Run an EXPLAIN ANALYZE to verify performance:

```sql
EXPLAIN ANALYZE
SELECT * FROM get_budget_for_period(
  'your-user-uuid',
  'your-payment-method-uuid',
  '2024-12-06',
  '2025-01-05'
);

-- Look for:
-- - Execution time < 300ms
-- - Index scans (not sequential scans)
-- - Efficient UNION ALL (no duplicate elimination)
```

## Rollback (If Needed)

If you need to rollback this migration:

```sql
-- Drop the function
DROP FUNCTION IF EXISTS get_budget_for_period(UUID, UUID, DATE, DATE);
```

## Post-Deployment

After successful deployment:

1. ✅ Mark this file as deployed (update this section)
2. ✅ Test the budget calculation in the web app
3. ✅ Verify performance with real user data
4. ✅ Monitor slow query logs for any issues

## Deployment Status

- **Deployed to Production:** ❌ NOT YET DEPLOYED
- **Deployed to Staging:** ❌ NOT YET DEPLOYED
- **Deployed to Development:** ❌ NOT YET DEPLOYED

**Deployment Date:** _Not yet deployed_
**Deployed By:** _Pending_
**Verification:** _Pending_

## Troubleshooting

### Error: "function get_budget_for_period already exists"

The function already exists. Either:
- Drop and recreate: `DROP FUNCTION get_budget_for_period(UUID, UUID, DATE, DATE);` then re-run migration
- Or skip this migration (it's already applied)

### Error: "relation installment_plans does not exist"

Missing prerequisite migrations. Run migrations 001-042 first.

### Error: "permission denied for function get_budget_for_period"

Check the GRANT statement at the end of the migration. Ensure `authenticated` role has EXECUTE permission.

### Slow Query Performance (> 300ms)

Check indexes:
```sql
-- Verify indexes exist
\di idx_transactions_user_method_date
\di idx_installment_payments_due_date_status
\di idx_installment_plans_user_status

-- If missing, create them (from Epic 1 migrations)
```

## Related Files

- Migration script: `fe/scripts/043_budget_with_installments.sql`
- Server action: `fe/lib/actions/budget.ts`
- RPC types: `fe/lib/supabase/rpc-types.ts`
- Component: `fe/components/budget/budget-breakdown.tsx`
- Story file: `docs/sprint-artifacts/2-8-installment-impact-on-budget-tracking.md`

## Notes

- This migration is idempotent (uses `CREATE OR REPLACE FUNCTION`)
- Can be run multiple times safely
- No data migration required (only creates function)
- Compatible with Epic 3 future enhancements (user-defined closing dates)
