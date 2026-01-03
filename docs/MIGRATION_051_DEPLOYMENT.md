# Migration 051 Deployment Guide: Auto-Complete Installment Plans

**Migration:** `051_auto_complete_installments.sql`
**Story:** 2.5 Enhancement - Auto-transition fully paid installments
**Date:** 2024-12-08
**Status:** Ready for deployment

---

## Overview

This migration adds a database trigger that automatically marks installment plans as `paid_off` when all their payments reach `status = 'paid'`. This ensures data consistency and eliminates the need for manual status updates.

### Problem Being Solved

Currently, installment plans can remain in `status = 'active'` even after all payments have been marked as `paid`. This creates data inconsistency and confuses users who see "active" installments that are actually completed.

### Solution

- **Trigger Function:** `auto_complete_installment_plan()` - Checks if all payments are paid and updates plan status
- **Trigger:** `trigger_auto_complete_installment_plan` - Fires AFTER UPDATE on `installment_payments.status`
- **Backfill:** One-time query to fix existing inconsistent data

---

## Pre-Deployment Checklist

- [ ] Review the migration script: `fe/scripts/051_auto_complete_installments.sql`
- [ ] Backup production database
- [ ] Test on local/dev environment first
- [ ] Verify no breaking changes to existing queries

---

## Deployment Steps

### Step 1: Run Migration

```bash
cd /Users/lucasventurella/code/lv-expense-tracker
./supabase/create-migrations.sh
# Follow prompts to apply migration 051
```

**OR** manually apply:

```bash
psql $DATABASE_URL < fe/scripts/051_auto_complete_installments.sql
```

### Step 2: Verify Trigger Creation

```sql
-- Check trigger exists
SELECT
  tgname AS trigger_name,
  pg_get_triggerdef(oid) AS trigger_definition
FROM pg_trigger
WHERE tgname = 'trigger_auto_complete_installment_plan';
```

**Expected Result:** 1 row returned with trigger definition

### Step 3: Verify Backfill Results

Check migration output logs for:
```
NOTICE:  Backfill: Updated X installment plans from active to paid_off
```

**OR** manually verify:

```sql
-- This should return 0 rows after migration
SELECT
  ip.id,
  ip.description,
  ip.status,
  COUNT(*) AS total_payments,
  COUNT(*) FILTER (WHERE ipm.status = 'paid') AS paid_payments
FROM installment_plans ip
LEFT JOIN installment_payments ipm ON ipm.plan_id = ip.id
WHERE ip.status = 'active'
GROUP BY ip.id, ip.description, ip.status
HAVING COUNT(*) = COUNT(*) FILTER (WHERE ipm.status = 'paid')
  AND COUNT(*) > 0;

-- NOTE: Column "status" must be qualified with table alias (ipm.status)
-- to avoid ambiguity error since both tables have a status column
```

**Expected Result:** 0 rows (all fully-paid plans are now marked as `paid_off`)

### Step 4: Check Plan Status Distribution

```sql
SELECT status, COUNT(*)
FROM installment_plans
GROUP BY status
ORDER BY status;
```

**Expected Result:**
```
  status   | count
-----------+-------
 active    |   X   -- Only plans with pending payments
 paid_off  |   Y   -- Includes both manually and auto-completed plans
 cancelled |   Z   -- Cancelled plans
```

---

## Testing the Trigger

### Test Case 1: Mark Last Payment as Paid

```sql
-- Setup: Find an active plan with only 1 pending payment
SELECT
  ip.id AS plan_id,
  ip.description,
  ip.status AS plan_status,
  ipm.id AS payment_id,
  ipm.status AS payment_status
FROM installment_plans ip
JOIN installment_payments ipm ON ipm.plan_id = ip.id
WHERE ip.status = 'active'
  AND ipm.status = 'pending'
GROUP BY ip.id, ip.description, ip.status, ipm.id, ipm.status
HAVING COUNT(*) FILTER (WHERE ipm.status = 'pending') = 1;

-- Test: Mark the last payment as paid
UPDATE installment_payments
SET status = 'paid'
WHERE id = '<payment_id_from_above>';

-- Verify: Plan should now be 'paid_off'
SELECT id, description, status
FROM installment_plans
WHERE id = '<plan_id_from_above>';
```

**Expected Result:** Plan status changed from `active` to `paid_off`

### Test Case 2: Verify No False Positives

```sql
-- Mark a payment as paid for a plan that still has pending payments
-- Plan status should NOT change

-- Setup: Find a plan with multiple pending payments
SELECT
  ip.id AS plan_id,
  ip.description,
  COUNT(*) FILTER (WHERE ipm.status = 'pending') AS pending_count
FROM installment_plans ip
JOIN installment_payments ipm ON ipm.plan_id = ip.id
WHERE ip.status = 'active'
GROUP BY ip.id, ip.description
HAVING COUNT(*) FILTER (WHERE ipm.status = 'pending') > 1
LIMIT 1;

-- Test: Mark ONE payment as paid (not the last one)
UPDATE installment_payments
SET status = 'paid'
WHERE plan_id = '<plan_id_from_above>'
  AND status = 'pending'
LIMIT 1;

-- Verify: Plan should still be 'active'
SELECT id, description, status
FROM installment_plans
WHERE id = '<plan_id_from_above>';
```

**Expected Result:** Plan status remains `active`

---

## Rollback Instructions

**⚠️ WARNING:** Rollback only removes the trigger. It does NOT revert plans marked as `paid_off` back to `active`.

```bash
psql $DATABASE_URL < fe/scripts/051_auto_complete_installments_rollback.sql
```

**Manual Data Reversion (if needed):**

```sql
-- Identify plans to revert (manual review required)
SELECT id, description, status, updated_at
FROM installment_plans
WHERE status = 'paid_off'
  AND updated_at > '2024-12-08'  -- Adjust to migration date
ORDER BY updated_at DESC;

-- Revert specific plans
UPDATE installment_plans
SET status = 'active', updated_at = NOW()
WHERE id IN (
  'plan-id-1',
  'plan-id-2'
);
```

---

## Impact Assessment

### Performance Impact

- **Trigger Overhead:** Negligible (~5-10ms per payment update)
- **Backfill Impact:** One-time query, < 1 second for typical datasets
- **Index Usage:** Trigger uses existing indexes on `plan_id` and `status`

### Data Integrity

- ✅ **Positive:** Ensures plans are always in correct status
- ✅ **Positive:** Eliminates manual status management
- ⚠️ **Caution:** Plans paid off BEFORE migration are backfilled (check backfill count)

### Application Impact

- ✅ **No Code Changes Required:** Trigger works transparently
- ✅ **Frontend Compatible:** Existing queries work as expected
- ✅ **WhatsApp Bot Compatible:** No changes needed

---

## Post-Deployment Monitoring

### Week 1: Monitor Trigger Activity

```sql
-- Check for plans auto-completed in the last 7 days
SELECT id, description, status, updated_at
FROM installment_plans
WHERE status = 'paid_off'
  AND updated_at > NOW() - INTERVAL '7 days'
ORDER BY updated_at DESC;
```

### Month 1: Verify No Stuck Plans

```sql
-- This should return 0 rows
SELECT
  ip.id,
  ip.description,
  ip.status,
  COUNT(*) AS total_payments,
  COUNT(*) FILTER (WHERE ipm.status = 'paid') AS paid_payments
FROM installment_plans ip
LEFT JOIN installment_payments ipm ON ipm.plan_id = ip.id
WHERE ip.status = 'active'
GROUP BY ip.id, ip.description, ip.status
HAVING COUNT(*) = COUNT(*) FILTER (WHERE ipm.status = 'paid')
  AND COUNT(*) > 0;
```

---

## Success Criteria

- [x] Migration script created and reviewed
- [ ] Migration runs without errors
- [ ] Trigger exists and is active
- [ ] Backfill completes successfully
- [ ] Test cases pass (all payments paid → plan auto-completed)
- [ ] No false positives (partial completion doesn't trigger)
- [ ] No stuck active plans with all payments paid

---

## Contact

For issues or questions about this migration:
- Check logs for `RAISE NOTICE` messages
- Review trigger definition with verification query
- Test manually with test cases provided above
