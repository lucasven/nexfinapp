# Migration 047: System Category for Credit Card Payments

**Story:** 4.5 - System Category for Credit Card Payments
**Epic:** 4 - Payment Reminders & Auto-Accounting
**Date:** 2025-12-03
**Status:** Ready for Deployment

## Purpose

Create a system-managed category "Pagamento Cartão de Crédito" / "Credit Card Payment" that is protected from deletion and used exclusively for auto-generated credit card payment transactions.

This migration is a **dependency for Story 4.3** (Auto-Create Payment Transaction). The auto-payment job cannot run until this migration is deployed.

## Migration Files

- **Migration:** `fe/scripts/047_system_category_payment.sql`
- **Rollback:** `fe/scripts/047_system_category_payment_rollback.sql`

## Pre-Deployment Checklist

- [ ] All tests pass (unit, integration)
- [ ] Migration tested on staging environment
- [ ] Rollback script tested on staging
- [ ] Story 4.3 (Auto-Create Payment Transaction) code deployed but scheduler NOT enabled
- [ ] Frontend code deployed with system category UI changes
- [ ] WhatsApp bot code deployed with cached getSystemCategoryId()

## Deployment Steps

### Step 1: Apply Migration to Production Database

Connect to production Supabase instance:

```bash
psql $DATABASE_URL
```

Apply migration:

```bash
psql $DATABASE_URL < fe/scripts/047_system_category_payment.sql
```

Expected output:
```
DO
CREATE INDEX
INSERT 0 1
INSERT 0 1
DROP POLICY
CREATE POLICY
CREATE POLICY
CREATE POLICY
COMMENT
```

### Step 2: Verify Migration Success

Run verification queries:

```sql
-- 1. Verify system categories exist
SELECT id, name, type, is_system, user_id, created_at
FROM categories
WHERE is_system = true;

-- Expected: 2 rows
-- Row 1: name = 'Pagamento Cartão de Crédito', type = 'expense', is_system = true, user_id = NULL
-- Row 2: name = 'Credit Card Payment', type = 'expense', is_system = true, user_id = NULL

-- 2. Verify is_system column exists
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'categories' AND column_name = 'is_system';

-- Expected: 1 row with data_type = 'boolean', is_nullable = 'NO', column_default = 'false'

-- 3. Verify index created
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'categories' AND indexname = 'idx_categories_is_system';

-- Expected: 1 row with partial index on is_system WHERE is_system = true

-- 4. Verify RLS policies
SELECT policyname, cmd, qual
FROM pg_policies
WHERE tablename = 'categories';

-- Expected policies:
-- - "Users can view their own categories and system categories" (SELECT)
-- - "Users cannot modify system categories" (UPDATE)
-- - "Users cannot delete system categories" (DELETE)
```

### Step 3: Test RLS Policies

Authenticate as a regular user and attempt to delete system category:

```sql
-- This should FAIL with permission denied
DELETE FROM categories WHERE is_system = true;

-- Expected: ERROR: permission denied for table categories
-- OR: No rows deleted (RLS blocks the operation)
```

### Step 4: Verify Frontend Integration

1. Open category list in web app
2. Verify "Sistema" badge appears next to system categories
3. Hover over delete button for system category → Verify tooltip shows
4. Attempt to click delete button → Verify button is disabled

### Step 5: Verify WhatsApp Bot Integration

1. Trigger auto-payment job manually (if safe to do so)
2. Check logs for "System category ID cached" message
3. Verify auto-payment transactions use correct category ID

### Step 6: Enable Auto-Payment Scheduler (Story 4.3)

**ONLY after verifying migration success:**

1. Enable auto-payment scheduler in `whatsapp-bot/src/scheduler.ts`
2. Monitor logs for first run
3. Verify no errors related to missing system category

## Verification Queries

### Check System Category Usage

```sql
-- Count transactions using system category
SELECT COUNT(*) AS transaction_count
FROM transactions t
JOIN categories c ON t.category_id = c.id
WHERE c.is_system = true;

-- Expected: 0 initially, then increases as auto-payments are created
```

### Monitor Auto-Payment Creation

```sql
-- View recent auto-generated payment transactions
SELECT
  t.id,
  t.user_id,
  t.amount,
  t.description,
  t.date,
  c.name AS category_name,
  t.metadata
FROM transactions t
JOIN categories c ON t.category_id = c.id
WHERE c.is_system = true
  AND t.metadata->>'auto_generated' = 'true'
ORDER BY t.created_at DESC
LIMIT 10;
```

## Rollback Procedure

**WARNING:** Do NOT rollback after auto-payment transactions are created. Rollback will orphan category_id foreign keys.

If rollback is necessary before auto-payments exist:

```bash
psql $DATABASE_URL < fe/scripts/047_system_category_payment_rollback.sql
```

If rollback is necessary after auto-payments exist:

1. **First**, update all auto-payment transactions to a different category:

```sql
-- Replace with a valid category ID
UPDATE transactions
SET category_id = '<valid-category-id>'
WHERE category_id IN (
  SELECT id FROM categories WHERE is_system = true
);
```

2. **Then** run rollback script:

```bash
psql $DATABASE_URL < fe/scripts/047_system_category_payment_rollback.sql
```

## Post-Deployment Validation

- [ ] System categories visible in web app category list
- [ ] "Sistema" badge displayed correctly
- [ ] Delete button disabled for system categories
- [ ] Tooltip shows on hover: "Categoria do sistema não pode ser deletada"
- [ ] Auto-payment creation uses correct category ID (Story 4.3)
- [ ] No errors in application logs
- [ ] No errors in WhatsApp bot logs
- [ ] PostHog events tracked correctly

## Dependencies

### Prerequisites (COMPLETE)

- ✅ Categories table with columns: id, name, type, user_id, created_at
- ✅ RLS policies enabled on categories table
- ✅ Frontend category list components
- ✅ WhatsApp bot auto-payment transaction creator

### Blocks (PENDING)

- ⏸️ Story 4.3: Auto-Create Payment Transaction (requires this migration)

## Performance Targets

- **Migration execution time:** < 5 seconds
- **System category query time:** < 50ms (first query), < 1ms (cached)
- **Category list display time:** < 100ms (includes system category)

## Risks and Mitigations

### Risk 1: Migration Fails on Production

**Likelihood:** Low
**Impact:** Medium (Story 4.3 cannot run)
**Mitigation:**
- Test on staging first
- Rollback script available
- Deployment documentation with verification queries

### Risk 2: System Category Accidentally Deleted

**Likelihood:** Very Low (three layers of protection)
**Impact:** High (auto-payment creation breaks)
**Mitigation:**
- Three protection layers: UI disabled + Server action validation + RLS policy
- Monitoring and alerts for missing system category
- Auto-payment job logs error if category not found

### Risk 3: RLS Policy Conflicts

**Likelihood:** Low
**Impact:** Medium (users cannot view system categories)
**Mitigation:**
- Migration drops and recreates SELECT policy
- Verification queries test RLS policies
- Staging environment testing

## Success Criteria

Migration is successful when:

1. ✅ System categories exist in database with `is_system = true`
2. ✅ RLS policies prevent deletion of system categories
3. ✅ Frontend displays system categories with "Sistema" badge
4. ✅ Delete button disabled for system categories
5. ✅ Auto-payment creation uses correct category ID
6. ✅ No errors in application or WhatsApp bot logs
7. ✅ Story 4.3 can now safely run

## Support

If issues arise during deployment:

1. Check application logs for errors
2. Run verification queries to diagnose issue
3. If migration failed partially, run rollback and retry
4. If auto-payments created with wrong category, manually update transactions
5. Contact development team for assistance

## Deployment Checklist Summary

- [ ] Pre-deployment checklist complete
- [ ] Migration applied to production
- [ ] Verification queries confirm success
- [ ] RLS policies tested
- [ ] Frontend integration verified
- [ ] WhatsApp bot integration verified
- [ ] Auto-payment scheduler enabled (Story 4.3)
- [ ] Post-deployment validation complete
- [ ] Sprint status updated: 4-5 → done
