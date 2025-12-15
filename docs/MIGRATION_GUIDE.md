# Migration Guide: Story 2.0 - Epic 2 Foundation & Blockers Resolution

**Date:** 2025-12-03
**Story:** 2-0-epic-2-foundation-blockers
**Status:** Ready for Migration

## Overview

This guide covers applying two critical database migrations for Epic 2 foundation:

1. **Migration 041**: Payment Method ID Refactoring (TEXT → UUID foreign key)
2. **Migration 042**: Atomic Transaction Functions (PostgreSQL RPC functions)

## Prerequisites

- [ ] Backup database before running migrations
- [ ] Test migrations on a copy of production data first
- [ ] Schedule migration during low-traffic window
- [ ] Have rollback scripts ready (`041_rollback.sql` and `042_rollback.sql`)

## Migration Steps

### Step 1: Backup Database

```bash
# Use Supabase dashboard or CLI to create a backup
# Dashboard: Settings → Database → Backups → Create backup
```

### Step 2: Apply Migration 041 (Payment Method ID Refactoring)

**Location:** `fe/scripts/041_payment_method_id_refactoring.sql`

**What it does:**
- Adds `payment_method_id UUID` column to `transactions` table
- Migrates existing TEXT payment_method values to UUID foreign keys
- Handles standard payment method names (Cartão, Débito, Dinheiro, Pix)
- Implements fuzzy matching for custom payment method names
- Creates default payment methods for unmapped transactions (zero data loss)
- Makes `payment_method_id` NOT NULL after migration
- Renames old column to `payment_method_legacy` for audit

**How to apply:**

**Option A: Supabase SQL Editor (Recommended)**
1. Open Supabase Dashboard → SQL Editor
2. Copy contents of `fe/scripts/041_payment_method_id_refactoring.sql`
3. Paste into SQL Editor
4. Review the SQL carefully
5. Click "Run" to execute
6. Check for any error messages
7. Verify all transactions have `payment_method_id` populated:
   ```sql
   SELECT COUNT(*) FROM transactions WHERE payment_method_id IS NULL;
   -- Should return 0
   ```

**Option B: psql Command Line**
```bash
# Get direct database URL from Supabase Dashboard:
# Settings → Database → Connection String → Direct connection
export DATABASE_URL="postgresql://postgres:[password]@[host]:5432/postgres"

# Run migration
psql $DATABASE_URL < fe/scripts/041_payment_method_id_refactoring.sql
```

**Verification:**
```sql
-- Check schema change
\d transactions

-- Verify all transactions mapped
SELECT COUNT(*) as total_transactions FROM transactions;
SELECT COUNT(*) as mapped_transactions FROM transactions WHERE payment_method_id IS NOT NULL;
-- Both counts should match

-- Check for any orphaned transactions
SELECT * FROM transactions WHERE payment_method_id IS NULL LIMIT 10;
-- Should return 0 rows

-- Verify foreign key constraint
SELECT
  constraint_name,
  constraint_type
FROM information_schema.table_constraints
WHERE table_name = 'transactions' AND constraint_type = 'FOREIGN KEY';
-- Should show fk_transactions_payment_method_id
```

**Estimated Time:** 30 seconds - 2 minutes (depends on transaction count)

**Rollback:** If migration fails, run `fe/scripts/041_payment_method_id_refactoring_rollback.sql`

---

### Step 3: Apply Migration 042 (Atomic Transaction Functions)

**Location:** `fe/scripts/042_atomic_transaction_functions.sql`

**What it does:**
- Creates `switch_credit_mode_atomic()` RPC function
- Creates `create_installment_plan_atomic()` RPC function
- Creates `delete_installment_plan_atomic()` RPC function

**How to apply:**

**Option A: Supabase SQL Editor (Recommended)**
1. Open Supabase Dashboard → SQL Editor
2. Copy contents of `fe/scripts/042_atomic_transaction_functions.sql`
3. Paste into SQL Editor
4. Click "Run" to execute

**Option B: psql Command Line**
```bash
psql $DATABASE_URL < fe/scripts/042_atomic_transaction_functions.sql
```

**Verification:**
```sql
-- Check functions created
SELECT
  routine_name,
  routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name LIKE '%atomic%';

-- Should show:
-- switch_credit_mode_atomic | FUNCTION
-- create_installment_plan_atomic | FUNCTION
-- delete_installment_plan_atomic | FUNCTION

-- Test switch_credit_mode_atomic (dry run)
SELECT * FROM switch_credit_mode_atomic(
  'test-user-id'::uuid,
  'test-payment-method-id'::uuid,
  true,
  false
);
-- Should return error about payment method not found (expected)
```

**Estimated Time:** < 10 seconds

**Rollback:** If needed, run `fe/scripts/042_atomic_transaction_functions_rollback.sql`

---

### Step 4: Deploy Code Changes

After migrations are successfully applied:

1. **Deploy frontend code:**
   ```bash
   # The code changes are already merged in the credit-card-management branch
   git status
   # Should show clean state or only doc updates
   ```

2. **Verify deployment:**
   - Test creating a transaction via web UI
   - Verify payment method dropdown shows all payment methods
   - Verify conditional installment fields show/hide correctly
   - Check browser console for errors

---

### Step 5: Post-Migration Verification

**Frontend Tests:**
- [ ] Create transaction with Credit Mode card → installment fields visible
- [ ] Create transaction with Simple Mode card → no installment fields
- [ ] Create transaction with debit/cash → no installment fields
- [ ] Edit existing transaction → payment method dropdown works
- [ ] Verify analytics events tracked (check PostHog)

**Backend Tests:**
- [ ] WhatsApp bot: Send expense message → transaction created with payment_method_id
- [ ] Database: All transactions have valid payment_method_id
- [ ] Database: Foreign key constraint enforced (try deleting payment method with transactions → should fail)

**Performance Tests:**
- [ ] Test `create_installment_plan_atomic()` with 60 installments (< 500ms expected)
- [ ] Test mode switch with active installments (atomic behavior verified)

---

## Rollback Plan

If critical issues are found after deployment:

### Rollback Migration 042 (Functions)
```bash
psql $DATABASE_URL < fe/scripts/042_atomic_transaction_functions_rollback.sql
```

### Rollback Migration 041 (Payment Method ID)
⚠️ **WARNING:** Only rollback within 24 hours of migration, before old column is dropped.

```bash
psql $DATABASE_URL < fe/scripts/041_payment_method_id_refactoring_rollback.sql
```

### Revert Code Changes
```bash
# Checkout previous commit before Story 2.0 changes
git log --oneline | head -20
git checkout <commit-hash-before-story-2.0>
# Redeploy
```

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Data loss during migration | Low | Critical | Backup database, test on staging first |
| Unmapped transactions | Medium | Low | Migration creates default payment methods |
| Breaking changes to transaction form | Low | High | Comprehensive manual testing |
| PostgreSQL functions fail | Low | Medium | Rollback script ready |

---

## Success Criteria

✅ Migration 041 applied successfully
✅ Migration 042 applied successfully
✅ All transactions have valid payment_method_id
✅ Frontend integration working (payment method dropdown)
✅ Conditional installment fields rendering correctly
✅ WhatsApp bot creating transactions with payment_method_id
✅ Analytics tracking payment_method_mode
✅ No errors in logs
✅ Ready to start Epic 2 Story 2.1

---

## Support

If issues arise during migration:
1. Check Supabase logs for errors
2. Run verification queries to diagnose issue
3. Use rollback scripts if needed
4. Document any issues for review

---

**Last Updated:** 2025-12-03
**Reviewed By:** Dev Agent (Claude Code)
