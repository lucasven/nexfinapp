# Migration 046: Payment Due Date - Deployment Instructions

**Story:** 4.1 - Set Payment Due Date
**Migration File:** `fe/scripts/046_payment_due_date.sql`
**Status:** ⚠️ **NOT YET DEPLOYED** - Manual deployment required

## What This Migration Does

This migration adds the `payment_due_day` column to the `payment_methods` table:
- Stores the number of days after statement closing when payment is due (1-60 days)
- Nullable column (users must explicitly set this value)
- CHECK constraint validates range: 1 <= payment_due_day <= 60
- Required for Epic 4 payment reminders and auto-payment features

## Prerequisites

Before deploying this migration, ensure:
- ✅ All previous migrations (001-045) are applied
- ✅ Migration 043: `statement_closing_day` column exists (Epic 3 Story 3.1)
- ✅ Migration 040: `credit_mode` column exists (Epic 1)
- ✅ You have database admin access

## Deployment Steps

### Option 1: Using psql Command Line

```bash
# 1. Navigate to the frontend directory
cd fe

# 2. Set your database connection string
export DATABASE_URL="postgresql://user:password@host:port/database"

# 3. Run the migration
psql $DATABASE_URL < scripts/046_payment_due_date.sql

# 4. Verify the column was created
psql $DATABASE_URL -c "SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'payment_methods' AND column_name = 'payment_due_day';"

# 5. Verify CHECK constraint exists
psql $DATABASE_URL -c "SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'payment_methods'::regclass AND conname LIKE '%payment_due_day%';"
```

### Option 2: Using Supabase Dashboard

1. Log in to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Open the file `fe/scripts/046_payment_due_date.sql`
4. Copy the entire contents
5. Paste into the SQL Editor
6. Click **Run** to execute
7. Verify success message appears

## Verification Queries

After deployment, run these queries to verify:

```sql
-- 1. Check column exists
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'payment_methods'
  AND column_name = 'payment_due_day';

-- Expected: 1 row with data_type = 'integer', is_nullable = 'YES'

-- 2. Check CHECK constraint
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'payment_methods'::regclass
  AND conname LIKE '%payment_due_day%';

-- Expected: 1 row with constraint definition like "CHECK (payment_due_day > 0 AND payment_due_day <= 60)"

-- 3. Verify existing payment methods are unaffected
SELECT id, name, type, credit_mode, statement_closing_day, payment_due_day
FROM payment_methods
LIMIT 10;

-- Expected: All rows have payment_due_day = NULL (new column, not yet set)
```

## Testing the Migration

After deployment, test with these queries:

```sql
-- Test 1: Valid value (should succeed)
-- Replace <test-pm-id> with a real payment method ID
UPDATE payment_methods
SET payment_due_day = 10
WHERE id = '<test-pm-id>';

-- Test 2: Invalid value (should fail with CHECK constraint violation)
UPDATE payment_methods
SET payment_due_day = 0
WHERE id = '<test-pm-id>';
-- Expected error: "violates check constraint"

UPDATE payment_methods
SET payment_due_day = 61
WHERE id = '<test-pm-id>';
-- Expected error: "violates check constraint"

-- Test 3: NULL value (should succeed - removes payment due date)
UPDATE payment_methods
SET payment_due_day = NULL
WHERE id = '<test-pm-id>';
```

## Rollback Instructions

If you need to rollback this migration:

```bash
# Using psql
psql $DATABASE_URL < scripts/046_payment_due_date_rollback.sql

# Verify column is removed
psql $DATABASE_URL -c "SELECT column_name FROM information_schema.columns WHERE table_name = 'payment_methods' AND column_name = 'payment_due_day';"
# Expected: No rows returned
```

⚠️ **WARNING:** Rollback will delete all `payment_due_day` data. Only rollback if:
- Stories 4.2-4.5 are NOT deployed (they depend on this column)
- You need to revert the payment due date feature completely

## Post-Deployment Checklist

- [ ] Migration 046 applied successfully
- [ ] Column `payment_due_day` exists in `payment_methods` table
- [ ] CHECK constraint validates range (1-60)
- [ ] Existing payment methods have `payment_due_day = NULL`
- [ ] Test updates with valid values (1-60) succeed
- [ ] Test updates with invalid values (0, 61) fail
- [ ] RLS policies work correctly (users can only update own payment methods)
- [ ] Frontend code deployed (PaymentDueSettings component)
- [ ] Analytics tracking working (`payment_due_date_set` events)

## Expected Impact

- **Zero breaking changes:** Existing functionality unaffected
- **Performance:** No impact (nullable column, no indexes needed)
- **Data:** All existing payment methods have `payment_due_day = NULL`
- **User Experience:** New settings UI visible for Credit Mode cards with closing day set

## Next Steps

After successful deployment of Migration 046:
1. ✅ Story 4.1 complete - Payment due date configuration available
2. ⏳ Story 4.2 - Implement WhatsApp payment reminders (2 days before due)
3. ⏳ Story 4.3 - Auto-create payment transactions on due date
4. ⏳ Story 4.4 - Edit/delete auto-generated payments
5. ⏳ Story 4.5 - System category for credit card payments

## Troubleshooting

### Issue: "Column already exists" error
**Solution:** Column was already added in a previous deployment. Verify with:
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'payment_methods' AND column_name = 'payment_due_day';
```

### Issue: CHECK constraint violation when setting payment_due_day
**Solution:** Ensure value is between 1 and 60. Frontend validates this, but database enforces it.

### Issue: RLS policy prevents update
**Solution:** Ensure user owns the payment method. RLS automatically enforces `user_id = auth.uid()`.

## Migration Complete! 🎉

Once deployed and verified, mark Story 4.1 as DONE in `sprint-status.yaml`:
```yaml
4-1-set-payment-due-date: done
```
