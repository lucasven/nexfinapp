# Migration 048 Deployment Guide

**Date:** December 8, 2025
**Migration:** `048_fix_statement_period_calculation.sql`
**Epic:** Epic 3 - Credit Card Statement Management
**Priority:** HIGH - Fixes incorrect statement period calculations

## Overview

This migration fixes a critical bug in the `calculate_statement_period()` function where statement periods were off by one day, causing transactions from previous or next periods to be included in the current period calculations.

### Issue
- Statement periods were showing incorrect dates (e.g., "5 dez - 4 jan" instead of "6 dez - 5 jan")
- Transactions from previous/next periods were being included in budget calculations
- Statement summaries showed incorrect totals

### Fix
- Period start is now always (closing_date + 1 day)
- Ensures consistent period lengths across all months

## Pre-Deployment Checklist

- [ ] Verify current database connection
- [ ] Backup database (recommended for production)
- [ ] Review migration script: `fe/scripts/048_fix_statement_period_calculation.sql`

## Deployment Steps

### 1. Connect to Database

```bash
# Get your DATABASE_URL from environment
echo $DATABASE_URL

# Or from .env file
cat fe/.env.local | grep DATABASE_URL
```

### 2. Apply Migration

```bash
psql $DATABASE_URL < fe/scripts/048_fix_statement_period_calculation.sql
```

**Expected Output:**
```
CREATE FUNCTION
COMMENT
```

### 3. Verify Migration

Run the following queries to verify the function works correctly:

```sql
-- Test 1: Today is before closing day (e.g., Dec 3, closing day 5)
-- Expected: period_start = Nov 6, period_end = Dec 5
SELECT * FROM calculate_statement_period(5, '2025-12-03'::DATE);

-- Test 2: Today is on closing day (e.g., Dec 5, closing day 5)
-- Expected: period_start = Nov 6, period_end = Dec 5
SELECT * FROM calculate_statement_period(5, '2025-12-05'::DATE);

-- Test 3: Today is after closing day (e.g., Dec 8, closing day 5)
-- Expected: period_start = Dec 6, period_end = Jan 5
SELECT * FROM calculate_statement_period(5, '2025-12-08'::DATE);
```

### 4. Test with Real Data

```sql
-- Get your payment method ID
SELECT id, name, statement_closing_day
FROM payment_methods
WHERE user_id = auth.uid()
  AND credit_mode = true;

-- Test period calculation with your actual closing day
SELECT * FROM calculate_statement_period(
  <your_closing_day>,
  CURRENT_DATE
);
```

## Impact

### Affected Features
✅ **Statement Summary (Epic 3 Story 3.5)**
- Now shows correct period boundaries
- Excludes transactions from previous/next periods

✅ **Budget Progress Dashboard (Epic 3 Story 3.3)**
- Budget calculations now use correct period
- Spending totals are accurate

✅ **Statement Period Badges (Epic 3 Story 3.6)**
- "Fatura atual" badge shows correct period
- Period boundaries displayed correctly

✅ **Statement Reminders (Epic 3 Story 3.4)**
- Reminders sent for correct statement period
- Budget warnings accurate

✅ **Payment Reminders (Epic 4 Story 4.2)**
- Payment due calculations correct

## Example Before/After

**With Closing Day = 5:**

### Before Migration 048 (WRONG)
```
Today: Dec 8, 2025
Period: Dec 5 - Jan 4  ❌ WRONG
Includes: Dec 3, Dec 5, Dec 7, Dec 8
Total: R$ 765,90 (includes previous period transactions)
```

### After Migration 048 (CORRECT)
```
Today: Dec 8, 2025
Period: Dec 6 - Jan 5  ✅ CORRECT
Includes: Dec 7, Dec 8 only
Total: R$ 345,90 (correct current period total)
```

## Rollback

If issues occur, you can rollback to the previous version:

```sql
-- Restore original function from migration 044
psql $DATABASE_URL < fe/scripts/044_statement_period_calculation.sql
```

**⚠️ Warning:** Rolling back will restore the bug. Only rollback if the new function causes errors.

## Post-Deployment Testing

### 1. Test Statement Summary (WhatsApp)
```
Send to WhatsApp bot: "resumo da fatura"
```

**Expected:**
- Period dates should be (closing_day + 1) to (next_closing_day)
- Total should only include transactions in current period
- No transactions from previous or next period

### 2. Test Budget Dashboard (Web)
```
Navigate to: http://localhost:3000/[locale]/
```

**Expected:**
- Budget widgets show correct period
- Spending totals match transactions in current period

### 3. Verify Statement Badges (Web)
```
Navigate to: http://localhost:3000/[locale]/
```

**Expected:**
- "Fatura atual" badge on correct transactions
- "Próxima fatura" and "Fatura passada" correctly assigned

## Troubleshooting

### Issue: "Function does not exist"
**Solution:** Verify you're connected to the correct database:
```bash
psql $DATABASE_URL -c "SELECT version();"
```

### Issue: "Permission denied"
**Solution:** Ensure you have SUPERUSER or function creation privileges:
```bash
psql $DATABASE_URL -c "SELECT current_user, usesuper FROM pg_user WHERE usename = current_user;"
```

### Issue: Wrong period still showing
**Solution:** Clear application caches:
```bash
# Frontend
cd fe
npm run build

# WhatsApp Bot (restart server)
cd whatsapp-bot
npm run build
# Then restart the server
```

## Notes

- This migration is IMMUTABLE and safe to run multiple times
- No data is modified, only the function logic is updated
- Existing transactions and payment methods are not affected
- Period calculations will be instantly corrected after deployment

## Related Documentation

- Epic 3 Tech Spec: `docs/sprint-artifacts/tech-spec-epic-3.md`
- Budget Calculation: Migration 045
- Statement Period Helpers: `whatsapp-bot/src/utils/statement-period-helpers.ts`

## Questions?

If you encounter issues during deployment, check:
1. Database connection is active
2. User has function creation privileges
3. Migration 044 was previously applied
4. No syntax errors in migration file

---
**Status:** Ready for Deployment
**Tested:** Manual testing completed
**Backwards Compatible:** Yes (fixes bug, no breaking changes)
