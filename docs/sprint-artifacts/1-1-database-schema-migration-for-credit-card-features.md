# Story 1.1: Database Schema Migration for Credit Card Features

Status: review

## Story

As a backend developer,
I want to create and execute a database migration that extends the schema with credit card management capabilities,
so that the foundation tables and columns exist to support Credit Mode features including installments, statement tracking, and user mode preferences.

## Acceptance Criteria

**AC1.1: Payment Methods Table Extended**
- Column `statement_closing_day` added (INTEGER, CHECK 1-31, nullable)
- Column `payment_due_day` added (INTEGER, CHECK > 0, nullable)
- Column `credit_mode` added (BOOLEAN, default NULL)
- Column `monthly_budget` added (DECIMAL(10,2), nullable)
- All columns have appropriate constraints and comments

**AC1.2: Installment Plans Table Created**
- Primary key `id` (UUID)
- Foreign keys: `user_id`, `category_id`, `payment_method_id`
- Status constraint: 'active', 'paid_off', 'cancelled'
- Index `idx_installment_plans_user_status` exists
- All required columns present per tech spec schema

**AC1.3: Installment Payments Table Created**
- Primary key `id` (UUID)
- Foreign key `plan_id` with ON DELETE CASCADE
- Foreign key `transaction_id` with ON DELETE SET NULL
- Status constraint: 'pending', 'paid', 'cancelled'
- Indexes on `plan_id`, `due_date`, `status` exist

**AC1.4: RLS Policies Enabled**
- `installment_plans`: User can only access own plans (user_id = auth.uid())
- `installment_payments`: User can only access payments for own plans
- Policies verified with test queries

**AC1.5: Migration is Reversible**
- Rollback script exists and restores original schema
- Rollback tested on staging environment

**AC1.6: Post-Migration Validation**
- Verification queries confirm all columns, tables, and indexes exist
- RLS enabled on new tables (rowsecurity = true)
- Migration completes in < 30 seconds (NFR from tech spec)

## Tasks / Subtasks

- [x] **Task 1: Create migration script file** (AC: 1.1-1.5)
  - [x] Create `fe/scripts/034_credit_card_management.sql`
  - [x] Add file header with description, version, and date
  - [x] Structure script with clear section comments

- [x] **Task 2: Implement payment_methods extensions** (AC: 1.1)
  - [x] Write ALTER TABLE statements for 4 new columns
  - [x] Add CHECK constraints for statement_closing_day (1-31) and payment_due_day (> 0)
  - [x] Add COMMENT statements explaining each column's purpose
  - [x] Verify NULL defaults for backward compatibility

- [x] **Task 3: Create installment_plans table** (AC: 1.2)
  - [x] Define table schema with all columns from tech spec (lines 247-259)
  - [x] Add primary key constraint
  - [x] Add foreign key constraints with appropriate cascade rules
  - [x] Add status CHECK constraint
  - [x] Create index: `idx_installment_plans_user_status`
  - [x] Add table comment describing purpose

- [x] **Task 4: Create installment_payments table** (AC: 1.3)
  - [x] Define table schema with all columns from tech spec (lines 262-272)
  - [x] Add primary key constraint
  - [x] Add foreign key `plan_id` with ON DELETE CASCADE
  - [x] Add foreign key `transaction_id` with ON DELETE SET NULL
  - [x] Add status CHECK constraint
  - [x] Create indexes: `idx_installment_payments_plan`, `idx_installment_payments_transaction`, `idx_installment_payments_due_date_status`

- [x] **Task 5: Enable RLS policies** (AC: 1.4)
  - [x] Enable RLS on installment_plans table
  - [x] Create policy: installment_plans_user_policy (user_id = auth.uid())
  - [x] Enable RLS on installment_payments table
  - [x] Create policy: installment_payments_user_policy (via plan ownership)
  - [x] Write test queries to verify policies block cross-user access

- [x] **Task 6: Create rollback script** (AC: 1.5)
  - [x] Create `fe/scripts/rollback_034_credit_card_management.sql`
  - [x] Drop tables in reverse dependency order
  - [x] Remove columns from payment_methods
  - [x] Document rollback procedure

- [x] **Task 7: Write validation queries** (AC: 1.6)
  - [x] Write SQL to verify columns exist (information_schema.columns)
  - [x] Write SQL to verify tables created
  - [x] Write SQL to verify RLS enabled (pg_tables.rowsecurity)
  - [x] Write SQL to verify indexes created
  - [x] Document expected output for each query

- [ ] **Task 8: Test migration on staging** (AC: 1.5, 1.6)
  - [ ] Run migration on staging database
  - [ ] Execute all validation queries
  - [ ] Measure execution time (should be < 30s)
  - [ ] Test rollback script
  - [ ] Verify database state restored after rollback
  - [ ] Re-run migration to confirm idempotency

## Dev Notes

### Architecture Alignment

**Database Pattern (Existing)**
- Location: `fe/scripts/` for all database migrations
- Naming: `{number}_{descriptive_name}.sql` (last was 028, this is 034)
- Technology: Supabase PostgreSQL with Row Level Security
- Security: All user-scoped tables require RLS policies

**Schema Design (from tech-spec-epic-1.md lines 226-291)**
- `payment_methods` extensions: 4 new nullable columns to preserve backward compatibility
- `installment_plans`: Parent table for installment tracking (Epic 2 implementation)
- `installment_payments`: Child table with CASCADE delete and SET NULL on transaction delete
- Indexes optimized for common queries: user+status lookups, due date filtering

**Non-Functional Requirements**
- Performance: Migration must complete in < 30 seconds (NFR from tech spec line 833)
- Reliability: 100% reversible via rollback script (NFR line 886)
- Security: RLS policies enforce user_id = auth.uid() pattern (NFR line 851)

### Testing Standards

**Migration Testing Approach**
1. Staging deployment test (required before production)
2. Post-migration validation queries (AC 1.6)
3. RLS policy enforcement test (cross-user access blocked)
4. Rollback test (restore original schema)
5. Performance test (execution time < 30s)

**Validation Script Pattern (from tech spec lines 1164-1174)**
```sql
-- Verify columns added
SELECT COUNT(*) = 4 FROM information_schema.columns
WHERE table_name = 'payment_methods'
  AND column_name IN ('credit_mode', 'statement_closing_day', 'payment_due_day', 'monthly_budget');

-- Verify RLS enabled
SELECT COUNT(*) = 2 FROM pg_tables
WHERE tablename IN ('installment_plans', 'installment_payments')
  AND rowsecurity = true;
```

### Database Integration Notes

**Foreign Key Cascade Behavior (tech spec lines 1031-1034)**
- `installment_plans.payment_method_id` → NO ACTION (plans persist if card deleted)
- `installment_payments.plan_id` → CASCADE (payments deleted when plan deleted)
- `installment_payments.transaction_id` → SET NULL (payment record kept if transaction deleted)

**Existing Schema Dependencies**
- Requires: `users` table (Supabase Auth)
- Requires: `payment_methods` table (existing)
- Requires: `transactions` table (existing, for installment linking)
- Requires: `categories` table (existing, for installment categorization)

### Project Structure Notes

**File Locations**
- Migration: `fe/scripts/034_credit_card_management.sql` (NEW)
- Rollback: `fe/scripts/rollback_034_credit_card_management.sql` (NEW)
- Validation: Include validation queries in migration script comments

**Alignment with Existing Patterns**
- Follows migration numbering convention (last was 028)
- Uses same RLS policy patterns as existing tables
- Maintains Supabase timestamp columns (created_at, updated_at)
- UUID primary keys (gen_random_uuid()) per existing standard

### References

- [Source: docs/sprint-artifacts/tech-spec-epic-1.md#Acceptance-Criteria-AC1-Database-Schema-Migration]
- [Source: docs/sprint-artifacts/tech-spec-epic-1.md#Data-Models-and-Contracts] (lines 224-291)
- [Source: docs/sprint-artifacts/tech-spec-epic-1.md#Dependencies-and-Integrations] (lines 1036-1068)
- [Source: docs/sprint-artifacts/tech-spec-epic-1.md#Non-Functional-Requirements] (lines 826-880)
- [Source: CLAUDE.md#Database-Migrations] (migration location and numbering)

## Dev Agent Record

### Context Reference

<!-- Path(s) to story context XML will be added here by context workflow -->

### Agent Model Used

Claude Sonnet 4.5 (claude-sonnet-4-5-20250929)

### Debug Log References

N/A - No debugging required

### Completion Notes List

**Implementation Summary:**
- Created migration script `fe/scripts/034_credit_card_management.sql` with complete schema changes
- All acceptance criteria AC1.1 through AC1.6 implemented (except staging testing AC 1.6)
- Migration structured in 6 logical sections with comprehensive documentation
- Rollback script created for full reversibility

**Key Implementation Details:**

1. **Payment Methods Extensions (AC1.1):**
   - Added 4 nullable columns: `statement_closing_day`, `payment_due_day`, `credit_mode`, `monthly_budget`
   - CHECK constraints enforce data integrity (closing day 1-31, due day > 0)
   - Column comments document purpose and usage
   - NULL defaults ensure backward compatibility

2. **Installment Plans Table (AC1.2):**
   - Complete schema per tech spec with all required columns
   - Foreign key references: `user_id`, `category_id`, `payment_method_id`
   - Status constraint: 'active', 'paid_off', 'cancelled'
   - Composite index on `(user_id, status)` for performance

3. **Installment Payments Table (AC1.3):**
   - Foreign key `plan_id` with CASCADE delete (payments deleted when plan deleted)
   - Foreign key `transaction_id` with SET NULL (payment record preserved if transaction deleted)
   - Status constraint: 'pending', 'paid', 'cancelled'
   - Three indexes for optimal query performance

4. **RLS Policies (AC1.4):**
   - `installment_plans_user_policy`: Direct user_id check
   - `installment_payments_user_policy`: Indirect check via plan ownership
   - Policies enforce auth.uid() = user_id pattern per security requirements

5. **Rollback Script (AC1.5):**
   - File: `fe/scripts/rollback_034_credit_card_management.sql`
   - Drops resources in reverse dependency order (policies → indexes → tables → columns)
   - Includes verification queries to confirm rollback success

6. **Validation Queries (AC1.6):**
   - Embedded in migration script as commented SQL
   - Verifies: columns added, tables created, RLS enabled, indexes created, constraints present
   - Includes expected counts for automated validation

**What Remains:**
- Task 8: Staging deployment and testing (requires database access)
- Performance validation (< 30s execution time)
- RLS policy testing with actual user contexts
- Rollback testing on staging environment

**Notes:**
- Migration follows existing project patterns (UUID primary keys, timestamptz columns)
- Consistent with migration numbering (034 is next after 033)
- IF NOT EXISTS clauses ensure idempotency
- All foreign key cascade behaviors match tech spec requirements

### File List

**Created:**
- `fe/scripts/034_credit_card_management.sql` - Main migration script
- `fe/scripts/rollback_034_credit_card_management.sql` - Rollback script

**Modified:**
- `docs/sprint-artifacts/sprint-status.yaml` - Updated story status to review
- `docs/sprint-artifacts/1-1-database-schema-migration-for-credit-card-features.md` - Marked tasks complete and added completion notes
