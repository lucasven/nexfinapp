# Manual E2E WhatsApp Regression Tests
**Focus**: Migration Safety & Backward Compatibility

## Purpose
Validate that system changes, database migrations, and new features do NOT break existing user workflows or corrupt existing data. These tests are critical before production deployments affecting active users.

## Risk Assessment
- **Impact**: CRITICAL - Affects all existing users
- **Probability**: MEDIUM - Migrations and feature additions carry inherent risk
- **Mitigation**: Manual validation before production deployment
- **Rollback**: Required for all migrations (test rollback scripts)

---

## Test Environment Setup

### Prerequisites
1. **Test Database**: Clone production-like data OR use staging with real historical data
2. **Test User Profile**: Create user with existing data from BEFORE current sprint
   - Existing transactions (30+ days history)
   - Existing categories (5+ custom categories)
   - Existing payment methods (2+ payment methods)
   - WhatsApp authorization (linked phone number)
3. **WhatsApp Bot**: Connected to test database
4. **Backup**: Database snapshot before running tests

### Test Data Requirements
Create "legacy user" profile with:
```sql
-- User created 60 days ago
INSERT INTO user_profiles (user_id, whatsapp_number, locale, created_at)
VALUES ('test-legacy-user-id', '+5511999999999', 'pt-BR', NOW() - INTERVAL '60 days');

-- 50+ historical transactions (mix of income/expense)
-- 3 payment methods (1 bank account, 1 credit card simple mode, 1 debit card)
-- 8 categories (mix of system and custom)
-- NO credit_mode data (legacy state)
-- NO installments (legacy state)
-- NO statement_closing_day (legacy state)
```

---

## Migration Safety Tests

### M1: Database Migration Execution
**Risk**: Migration script corruption, data loss, constraint violations

**Steps**:
1. Take database snapshot
2. Run migration script (e.g., `046_payment_due_date.sql`)
3. Check migration logs for errors
4. Run verification queries:
```sql
-- Verify new columns added
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'payment_methods'
  AND column_name IN ('payment_due_day', 'statement_closing_day', 'credit_mode');

-- Verify constraints applied
SELECT constraint_name, constraint_type
FROM information_schema.table_constraints
WHERE table_name = 'payment_methods';

-- Verify RLS policies intact
SELECT policyname, cmd, qual
FROM pg_policies
WHERE tablename = 'payment_methods';
```
5. **Validate existing data NOT modified**:
```sql
-- Compare row counts before/after
SELECT COUNT(*) FROM transactions; -- Should match pre-migration
SELECT COUNT(*) FROM payment_methods; -- Should match pre-migration
SELECT COUNT(*) FROM categories; -- Should match pre-migration

-- Verify existing transaction amounts unchanged
SELECT id, amount, description, date
FROM transactions
WHERE user_id = 'test-legacy-user-id'
ORDER BY date DESC
LIMIT 10;
```

**Expected Result**:
- Migration completes without errors
- All existing records preserved (row counts match)
- New columns added with NULL values (non-destructive)
- Constraints and RLS policies updated correctly

**Rollback Test**:
1. Run rollback script (e.g., `046_payment_due_date_rollback.sql`)
2. Verify columns removed and data restored
3. Re-run forward migration to confirm idempotency

---

### M2: Multi-Identifier Migration (Migration 028)
**Risk**: Existing users lose WhatsApp access, duplicate accounts created

**Setup**:
- User exists with `whatsapp_number` only (pre-028 state)
- No `whatsapp_jid`, `whatsapp_lid`, or `account_type` set

**Steps**:
1. Run migration 028 (`028_multi_identifier_support.sql`)
2. Send WhatsApp message: "oi" from legacy user's phone
3. Check authorization logs
4. Verify identifier sync:
```sql
SELECT whatsapp_number, whatsapp_jid, whatsapp_lid, account_type, push_name
FROM user_profiles
WHERE user_id = 'test-legacy-user-id';
```
5. Send another message: "/saldo"
6. Verify response received (same user session)

**Expected Result**:
- User authorized successfully via phone number (backward compatibility)
- Identifiers auto-synced after first message
- `whatsapp_jid` populated with current JID
- `account_type` detected (regular/business)
- No duplicate user accounts created
- Subsequent messages work normally

**Edge Cases**:
- User with phone number changed (new SIM, same account)
- User with WhatsApp Business migration (regular → business)
- Group messages from existing users

---

### M3: System Category Migration (Migration 047)
**Risk**: User categories corrupted, system category ID conflicts

**Setup**:
- User has 8 custom categories
- User has transactions using these categories

**Steps**:
1. Run migration 047 (`047_system_category_payment.sql`)
2. Query categories:
```sql
SELECT id, name, is_system, user_id
FROM categories
WHERE user_id = 'test-legacy-user-id' OR is_system = true
ORDER BY is_system DESC, name;
```
3. Verify system category visible to user:
```sql
SELECT c.id, c.name, c.is_system
FROM categories c
WHERE (c.user_id = 'test-legacy-user-id' OR c.is_system = true)
  AND c.name ILIKE '%pagamento%cartão%';
```
4. Send WhatsApp message: "/categorias"
5. Verify response includes user categories + system category
6. Verify existing transactions unchanged:
```sql
SELECT t.id, t.description, t.amount, c.name as category_name
FROM transactions t
JOIN categories c ON t.category_id = c.id
WHERE t.user_id = 'test-legacy-user-id'
  AND t.date > NOW() - INTERVAL '30 days'
ORDER BY t.date DESC;
```

**Expected Result**:
- System category created with `is_system = true`, `user_id = NULL`
- User categories intact (8 categories still present)
- User can view system category (RLS policy allows)
- User cannot delete system category (RLS policy blocks)
- Existing transactions still reference correct categories
- Category IDs stable (no orphaned transactions)

---

## Backward Compatibility Tests

### BC1: Legacy Transaction Flows
**Risk**: New features break existing transaction creation patterns

**Steps**:
1. Send WhatsApp message: "gastei 50 reais em supermercado"
2. Verify transaction created with legacy fields only (no installment metadata)
3. Check transaction in database:
```sql
SELECT id, amount, description, type, category_id, payment_method_id, metadata
FROM transactions
WHERE user_id = 'test-legacy-user-id'
  AND description ILIKE '%supermercado%'
ORDER BY created_at DESC
LIMIT 1;
```
4. Verify `metadata` is NULL or empty (no credit card fields)
5. Send message: "recebi 1000 de salário"
6. Verify income transaction created normally
7. View via web frontend: Navigate to `/pt-BR/transactions`
8. Verify transaction displays correctly (no UI errors)

**Expected Result**:
- Legacy transaction flow works identically to pre-Epic 2 behavior
- No forced installment prompts for regular transactions
- No credit card fields in transaction metadata
- Web UI displays legacy transactions without errors
- Transaction list shows all historical + new transactions

---

### BC2: Simple Mode Credit Cards Unchanged
**Risk**: Credit Mode features break existing Simple Mode cards

**Setup**:
- User has 1 credit card in Simple Mode (`credit_mode = false` or NULL)
- User has transactions on this card

**Steps**:
1. Query payment method state:
```sql
SELECT id, name, type, credit_mode, statement_closing_day, payment_due_day, budget_amount
FROM payment_methods
WHERE user_id = 'test-legacy-user-id'
  AND type = 'credit_card';
```
2. Verify `credit_mode = false` or NULL (legacy state preserved)
3. Send WhatsApp message: "gastei 100 no cartão de crédito"
4. Verify transaction created without credit mode metadata
5. Navigate to web frontend: `/pt-BR/payment-methods`
6. Verify credit card settings page does NOT show:
   - Statement closing day settings
   - Payment due day settings
   - Budget settings
   - Installment options in transaction dialog
7. Open transaction dialog for this card
8. Verify NO installment toggle shown

**Expected Result**:
- Simple Mode cards remain in Simple Mode (no auto-migration)
- No Credit Mode UI elements visible for Simple Mode cards
- Transactions work identically to legacy behavior
- No statement period calculations run
- No budget widgets displayed
- User can still upgrade to Credit Mode manually (via settings)

---

### BC3: Existing Categories Unchanged
**Risk**: Category name collisions with system categories

**Setup**:
- User has custom category named "Pagamento" (close to system category name)

**Steps**:
1. Query user categories:
```sql
SELECT id, name, is_system, user_id
FROM categories
WHERE user_id = 'test-legacy-user-id'
ORDER BY name;
```
2. Send WhatsApp message: "/categorias"
3. Verify response shows user's "Pagamento" category + system "Pagamento Cartão de Crédito"
4. Send message: "gastei 50 em pagamento"
5. Verify AI maps to user's custom "Pagamento" category (not system)
6. Create transaction via web: Use "Pagamento" category
7. Verify correct category ID saved
8. Check transaction:
```sql
SELECT t.id, t.description, c.name, c.is_system
FROM transactions t
JOIN categories c ON t.category_id = c.id
WHERE t.user_id = 'test-legacy-user-id'
  AND t.description ILIKE '%pagamento%'
ORDER BY t.created_at DESC
LIMIT 1;
```

**Expected Result**:
- User's custom "Pagamento" category preserved
- System category has distinct name (includes "Cartão de Crédito")
- No category ID conflicts
- User's category used for ambiguous transactions (priority over system)
- Both categories visible in UI
- User can still delete/edit their custom category

---

## Data Integrity Tests

### DI1: Historical Transaction Integrity
**Risk**: Migrations corrupt existing transaction amounts/dates

**Setup**:
- Record checksums of existing transactions before migration:
```sql
SELECT
  COUNT(*) as total_count,
  SUM(amount) as total_amount,
  MIN(date) as earliest_date,
  MAX(date) as latest_date,
  COUNT(DISTINCT category_id) as category_count,
  COUNT(DISTINCT payment_method_id) as payment_method_count
FROM transactions
WHERE user_id = 'test-legacy-user-id';
```

**Steps**:
1. Run all migrations in sequence (043 through 051)
2. Query same checksums post-migration
3. Compare results
4. Query random sample of 10 transactions and verify:
```sql
SELECT id, amount, description, date, type, category_id, payment_method_id
FROM transactions
WHERE user_id = 'test-legacy-user-id'
ORDER BY RANDOM()
LIMIT 10;
```
5. Compare against pre-migration snapshot

**Expected Result**:
- All checksums IDENTICAL (count, sum, min/max dates)
- Transaction amounts unchanged
- Transaction dates unchanged
- Category associations preserved
- Payment method associations preserved
- No orphaned transactions (category_id/payment_method_id still valid)

---

### DI2: Budget Calculation with Legacy Data
**Risk**: New budget logic breaks with historical data

**Setup**:
- User has transactions from 60 days ago
- User sets statement closing day TODAY (first-time setup)
- User sets budget amount

**Steps**:
1. Via web frontend: Set statement closing day = today's day (e.g., 10th)
2. Set budget amount = 3000
3. Trigger budget calculation:
```sql
SELECT calculate_statement_budget_spent(
  'test-payment-method-id',
  'test-legacy-user-id'
);
```
4. Verify calculation includes ONLY current statement period:
```sql
-- Check statement period boundaries
SELECT calculate_statement_period(10, CURRENT_DATE);

-- Query transactions included in budget
SELECT id, date, amount, description
FROM transactions
WHERE user_id = 'test-legacy-user-id'
  AND payment_method_id = 'test-payment-method-id'
  AND type = 'expense'
  AND date >= (SELECT calculate_statement_period(10, CURRENT_DATE)).period_start
  AND date <= (SELECT calculate_statement_period(10, CURRENT_DATE)).period_end;
```
5. View budget widget on web dashboard
6. Verify "Total Gasto" matches query result

**Expected Result**:
- Budget calculation ignores historical transactions (before first closing date)
- Only current statement period transactions included
- Budget widget displays correct spent amount
- No performance degradation with 60+ days of history
- Calculation completes < 200ms (NFR5)

---

### DI3: Installment Creation with Legacy Payment Method
**Risk**: New installment features break when applied to old credit cards

**Setup**:
- Credit card exists from 30 days ago
- Credit Mode just enabled (first-time activation)
- Statement closing day just set

**Steps**:
1. Via web frontend: Enable Credit Mode for existing card
2. Set statement closing day = 15
3. Open transaction dialog
4. Fill installment form:
   - Amount: 1200
   - Description: "Celular parcelado"
   - Installments: 12
   - Date: Today
5. Submit form
6. Verify RPC function call:
```sql
SELECT create_installment_plan(
  'test-legacy-user-id',
  'test-payment-method-id',
  'test-category-id',
  1200,
  'Celular parcelado',
  12,
  CURRENT_DATE
);
```
7. Query created transactions:
```sql
SELECT
  id,
  amount,
  description,
  date,
  metadata->>'installment_plan_id' as plan_id,
  metadata->>'current_installment' as current,
  metadata->>'total_installments' as total
FROM transactions
WHERE user_id = 'test-legacy-user-id'
  AND metadata->>'installment_plan_id' IS NOT NULL
ORDER BY date;
```

**Expected Result**:
- Installment plan created successfully
- 12 transactions created (1 per month)
- Each transaction amount = 100 (1200 / 12)
- Dates spread across 12 months
- Statement period assignments correct
- First installment in current/next statement (depending on closing day)
- No conflicts with historical transactions
- Budget calculations include installment payments

---

## Regression Test Scenarios

### R1: WhatsApp Authorization Flow
**Risk**: Identifier changes break authorization for existing users

**Test Cases**:

#### R1.1: Regular User → WhatsApp Business Migration
1. User authorized with `whatsapp_number` + `whatsapp_jid`
2. User migrates WhatsApp account to Business (server-side)
3. User sends message from Business account (new LID, same JID)
4. **Expected**: User authorized via JID match, LID auto-synced

#### R1.2: Phone Number Change (New SIM)
1. User authorized with `whatsapp_number` = +5511999999999
2. User changes SIM card to +5511888888888 (same WhatsApp account)
3. User sends message from new number (same JID)
4. **Expected**: User authorized via JID match, phone number auto-updated

#### R1.3: WhatsApp Reinstall (New QR Code)
1. User reinstalls WhatsApp on same device
2. New QR code generates new JID (same phone number)
3. User sends message with new JID
4. **Expected**: User authorized via phone number match, JID auto-updated

---

### R2: Transaction Query Commands
**Risk**: New features break existing query commands

**Steps**:
1. User has 50+ transactions (30 from last month, 20 historical)
2. Send WhatsApp messages:
   - "/saldo" → Should show current balance (all transactions)
   - "/resumo" → Should show current month summary
   - "/gastos" → Should list recent expenses
   - "/receitas" → Should list recent income
3. Verify responses include historical data
4. Verify no Credit Mode data shown for Simple Mode cards
5. Verify query performance < 500ms (check logs)

**Expected Result**:
- All legacy commands work identically
- Historical transactions included in balance/summary
- No unexpected Credit Mode sections in responses
- Response times unchanged

---

### R3: Category and Payment Method Queries
**Risk**: System entities break existing queries

**Steps**:
1. Send WhatsApp message: "/categorias"
2. Verify response shows:
   - 8 user custom categories
   - 1 system category ("Pagamento Cartão de Crédito")
   - Clear distinction (e.g., system category marked differently)
3. Send message: "/contas" or "/cartões"
4. Verify payment methods listed correctly
5. Verify Credit Mode status clear (Simple vs Credit)

**Expected Result**:
- User categories displayed prominently
- System category visible but distinct
- No duplicate category names
- Payment method statuses accurate

---

### R4: Statement Period Edge Cases
**Risk**: Boundary calculations corrupt budget for existing users

**Test Cases**:

#### R4.1: Closing Day = Today
1. User sets `statement_closing_day = TODAY's day number`
2. Create transaction today
3. Check statement badge: Should be "Next Statement"
4. Check budget calculation: Should NOT include today's transaction

#### R4.2: Closing Day Just Passed Yesterday
1. User sets `statement_closing_day = YESTERDAY's day number`
2. Create transaction today
3. Check statement badge: Should be "Current Statement"
4. Check budget calculation: Should include today's transaction

#### R4.3: Month Boundary (Jan 31 → Feb Closing)
1. User has `statement_closing_day = 31`
2. Today is Feb 15 (February has no 31st)
3. Check period calculation:
```sql
SELECT calculate_statement_period(31, '2025-02-15'::DATE);
```
4. **Expected**: Period ends on Feb 28/29 (last day of month)

#### R4.4: Leap Year Handling
1. User has `statement_closing_day = 29`
2. Test in non-leap year (2025-02-15)
3. Test in leap year (2024-02-15)
4. **Expected**: Handles Feb 28 vs Feb 29 correctly

---

### R5: Auto-Payment Transaction for Existing Card
**Risk**: First auto-payment corrupts existing transaction history

**Setup**:
- Card exists for 30 days with 20+ transactions
- Credit Mode just enabled
- Statement closing day = 5
- Payment due day = 10
- Today = Jan 6 (day after first statement closing)

**Steps**:
1. Run auto-payment job manually:
```sql
-- Simulate job execution
SELECT * FROM payment_methods
WHERE credit_mode = true
  AND statement_closing_day = 5  -- Yesterday was 5th
  AND payment_due_day IS NOT NULL;
```
2. Verify statement total calculation includes correct transactions:
```sql
SELECT SUM(amount) as total
FROM transactions
WHERE payment_method_id = 'test-legacy-card-id'
  AND type = 'expense'
  AND date >= '2024-12-06'  -- Last month's 6th
  AND date <= '2025-01-05'; -- Yesterday
```
3. Run transaction creator:
```sql
-- Check idempotency
SELECT * FROM transactions
WHERE user_id = 'test-legacy-user-id'
  AND metadata->>'auto_generated' = 'true'
  AND metadata->>'credit_card_id' = 'test-legacy-card-id';
```
4. Verify single payment transaction created
5. Verify amount matches statement total
6. Verify date = Jan 15 (closing + 10 days)
7. Run job again (same day)
8. Verify NO duplicate transaction created (idempotency)

**Expected Result**:
- First auto-payment created correctly
- Statement total includes all transactions in period
- Payment date calculated correctly
- Idempotency works (no duplicates on retry)
- Existing transactions unchanged
- Transaction list shows auto-payment with badge

---

## Performance Regression Tests

### P1: Query Performance with Historical Data
**Risk**: New features slow down queries for users with large transaction history

**Setup**:
- Insert 500 transactions spanning 12 months
- Mix of expense/income, various categories, 3 payment methods

**Steps**:
1. Measure baseline query times:
```sql
EXPLAIN ANALYZE
SELECT * FROM transactions
WHERE user_id = 'test-legacy-user-id'
ORDER BY date DESC
LIMIT 50;
```
2. Enable Credit Mode on 1 card
3. Set statement closing day + budget
4. Re-measure query times for:
   - Transaction list (last 50)
   - Budget calculation
   - Statement summary
   - Category breakdown
5. Compare against baseline

**Expected Result**:
- Transaction list query: < 100ms (no degradation)
- Budget calculation: < 200ms (meets NFR5)
- Statement summary: < 500ms (meets NFR Epic3-P2)
- No query timeout with 500+ transactions
- Indexes utilized (check EXPLAIN ANALYZE)

---

### P2: Dashboard Load with Mixed Data
**Risk**: Budget widgets slow down dashboard for legacy users

**Setup**:
- User has 2 payment methods: 1 Simple Mode, 1 Credit Mode
- 300 transactions across both cards
- Budget set on Credit Mode card only

**Steps**:
1. Navigate to web dashboard: `/pt-BR/`
2. Measure page load time (Chrome DevTools)
3. Check React Query cache hits
4. Verify budget widget loads for Credit Mode card only
5. Verify NO budget widget for Simple Mode card
6. Check console for errors
7. Measure time to interactive (TTI)

**Expected Result**:
- Dashboard load: < 1 second (NFR5 - Dashboard load)
- Budget widget fetch: < 200ms
- No unnecessary queries for Simple Mode card
- Cache hit rate > 80% on second load
- No console errors
- TTI < 1.5 seconds

---

## Rollback Validation Tests

### RB1: Migration Rollback Safety
**Risk**: Rollback scripts corrupt data or fail to execute

**Steps**:
1. Take database snapshot
2. Run forward migration (e.g., 046)
3. Create new data using migrated schema:
   - Set payment_due_day on 1 card
   - Create 2 transactions
4. Run rollback script (e.g., 046_rollback)
5. Verify:
   - Column `payment_due_day` removed
   - Transactions still intact (no cascade deletes)
   - Existing data preserved
6. Re-run forward migration
7. Verify idempotency (no duplicate columns/constraints)

**Expected Result**:
- Rollback completes without errors
- New data preserved (transactions not deleted)
- New columns removed cleanly
- Re-migration succeeds (idempotent)

---

## Localization Regression Tests

### L1: Locale Switching for Existing User
**Risk**: Locale changes break existing queries or displays

**Steps**:
1. User has locale = 'pt-BR' (legacy default)
2. User has 50+ transactions with Portuguese descriptions
3. Change user locale to 'en':
```sql
UPDATE user_profiles
SET locale = 'en'
WHERE user_id = 'test-legacy-user-id';
```
4. Send WhatsApp message: "/balance"
5. Verify response in English
6. Send message: "/categories"
7. Verify categories displayed in English labels (if system) or original names (if custom)
8. Navigate to web frontend with `/en/transactions`
9. Verify UI in English, transaction descriptions unchanged

**Expected Result**:
- System messages switch to English
- User data (descriptions, category names) unchanged
- Date/currency formatting switches to en-US
- Statement period messages in English
- Budget widgets in English
- No translation errors or missing keys

---

## Critical Edge Cases

### E1: User with No Historical Data
**Risk**: Edge case when user has zero transactions before migration

**Steps**:
1. Create new user with NO transactions
2. Run all migrations
3. User enables Credit Mode immediately
4. User creates first transaction as installment
5. Verify budget calculation doesn't error on empty history
6. Verify statement summary handles zero transactions gracefully

**Expected Result**:
- No division by zero errors
- Budget widget shows 0% spent
- Statement summary shows empty message
- First transaction creates correctly

---

### E2: User with Deleted Categories
**Risk**: Transactions reference deleted categories after migration

**Setup**:
- User has transactions with `category_id = 'deleted-category-id'`
- Category was deleted (soft delete or hard delete)

**Steps**:
1. Run migrations
2. Query orphaned transactions:
```sql
SELECT t.id, t.description, t.category_id
FROM transactions t
LEFT JOIN categories c ON t.category_id = c.id
WHERE t.user_id = 'test-legacy-user-id'
  AND c.id IS NULL;
```
3. View transaction list on web frontend
4. Verify orphaned transactions display correctly (fallback label)
5. Verify budget calculations exclude orphaned transactions (or handle gracefully)

**Expected Result**:
- Orphaned transactions display with fallback ("Uncategorized")
- No query errors or crashes
- User can re-assign category
- Budget calculations handle null categories

---

### E3: Concurrent Transaction Creation
**Risk**: Race condition when auto-payment runs during user transaction creation

**Steps**:
1. User creates manual transaction via WhatsApp at 1:00 AM
2. Auto-payment job runs at 1:00 AM (same second)
3. Both transactions target same payment method
4. Verify both transactions created successfully
5. Verify no deadlock or conflict
6. Verify budget calculation includes both

**Expected Result**:
- Both transactions succeed (no lost writes)
- Database handles concurrency (row-level locking)
- Budget calculations eventually consistent
- No duplicate auto-payments

---

## Test Execution Checklist

### Pre-Deployment
- [ ] All migrations tested forward + rollback
- [ ] Legacy user profile created with realistic data
- [ ] All backward compatibility tests pass
- [ ] Data integrity checksums match pre/post migration
- [ ] Performance benchmarks within acceptable range

### During Deployment
- [ ] Database backup taken
- [ ] Migrations run in sequence (001 → 051)
- [ ] Each migration verified before proceeding
- [ ] Rollback script available for each migration
- [ ] Monitor logs for errors during migration

### Post-Deployment
- [ ] Legacy user regression tests executed
- [ ] WhatsApp authorization works for existing users
- [ ] Budget calculations accurate for mixed data
- [ ] Auto-payment job runs successfully
- [ ] No user reports of missing/corrupted data
- [ ] Performance metrics stable (no degradation)

---

## Failure Scenarios & Responses

### Migration Failure
- **Symptom**: Migration script fails with constraint violation
- **Action**: Immediately roll back, investigate conflict, fix migration, retry
- **Prevention**: Test migrations on production-like data clone

### Data Corruption
- **Symptom**: Transaction amounts changed, categories lost
- **Action**: Restore from backup, halt deployment, investigate
- **Prevention**: Checksum validation before/after migration

### Authorization Failure
- **Symptom**: Existing users cannot authorize via WhatsApp
- **Action**: Verify identifier sync logic, check user_profiles data
- **Prevention**: Multi-identifier migration test (M2)

### Performance Degradation
- **Symptom**: Dashboard load > 3 seconds, budget calc > 1 second
- **Action**: Check query plans, add indexes, optimize calculation logic
- **Prevention**: Performance regression tests (P1, P2)

---

## Success Criteria

✅ **Zero data loss**: All pre-migration transactions preserved
✅ **Backward compatibility**: Legacy workflows unchanged
✅ **Migration safety**: All migrations reversible
✅ **Performance maintained**: No degradation for large datasets
✅ **Localization preserved**: User locale and data intact
✅ **Zero user complaints**: No reports of broken features

---

## Notes for Test Execution

1. **Use Staging First**: Run all tests on staging with production data clone
2. **Incremental Migration**: Deploy one epic at a time, validate between
3. **Monitor Logs**: Watch for SQL errors, RLS violations, null pointer exceptions
4. **User Communication**: Inform users of maintenance window if downtime required
5. **Rollback Plan**: Keep rollback scripts ready for each migration
6. **Performance Baseline**: Record metrics before migration for comparison

---

**Document Version**: 1.0
**Created**: 2025-12-10
**Last Updated**: 2025-12-10
**Owner**: QA / Test Architect
**Risk Level**: CRITICAL
