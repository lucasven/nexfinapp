# Story 2.0: Epic 2 Foundation & Blockers Resolution

Status: drafted

## Story

As a developer preparing for Epic 2 (Parcelamento Intelligence),
I want to resolve all Epic 1 technical debt blockers and set up the necessary infrastructure,
So that Epic 2 stories can be implemented safely with proper testing, atomic transactions, and clean payment method handling.

## Context

**Epic 1 Retrospective Findings:**
- TD-1: No atomic transactions for mode switching (PostgreSQL RPC functions needed)
- TD-2: Payment method ID refactoring needed (TEXT field → UUID foreign key)
- TD-3: Test coverage gap (0% for complex flows)

**Why This Story Is Critical:**
- Epic 2 requires creating installment plans with 2-60 monthly payments atomically
- Transaction form must conditionally show installment fields based on payment method's credit_mode
- Installment logic is complex (parent/child relationships) and MUST have test coverage
- Without this foundation, Epic 2 implementation would be unsafe and error-prone

**Blockers This Story Resolves:**
1. Transaction form can't detect selected payment method's credit_mode (TD-2)
2. Multi-table operations have partial state risk (TD-1)
3. No safety net for refactoring or new features (TD-3)

---

## Acceptance Criteria

### Part 1: Payment Method ID Refactoring (TD-2)

**AC1.1: Database Migration for payment_method_id**
- Migration `041_payment_method_id_refactoring.sql` created
- Add `payment_method_id UUID` column to `transactions` table
- Add foreign key constraint: `REFERENCES payment_methods(id) ON DELETE RESTRICT`
- Add index: `CREATE INDEX idx_transactions_payment_method_id ON transactions(payment_method_id)`
- Column is nullable during migration (allows gradual data migration)

**AC1.2: Data Migration for Existing Transactions**
- Migration script includes data migration logic
- Map existing `payment_method` TEXT values to `payment_method_id` UUID
- Mapping strategy:
  - "Cartão de Crédito" → Find user's credit card payment method
  - "Débito" → Find user's debit payment method
  - "Dinheiro" → Find user's cash payment method
  - Custom names → Fuzzy match to user's payment methods
- Log unmapped transactions for manual review
- Verify all transactions have valid payment_method_id before making column NOT NULL

**AC1.3: Make payment_method_id Required**
- After data migration, make column NOT NULL
- Remove old `payment_method` TEXT column (or rename to `payment_method_legacy` for audit)
- Update database schema documentation

**AC1.4: Update Transaction Server Actions (Web)**
- Update `fe/lib/actions/transactions.ts`
- `createTransaction()` server action:
  - Accept `payment_method_id` UUID parameter (not TEXT)
  - Remove `payment_method` TEXT handling
  - Validate payment_method_id exists and belongs to user
- `updateTransaction()` server action:
  - Accept `payment_method_id` UUID parameter
  - Validate ownership before update
- `deleteTransaction()` server action:
  - No changes needed (doesn't touch payment_method)

**AC1.5: Update Transaction Form Component (Web)**
- Update `fe/components/transaction-dialog.tsx`
- Replace TEXT input with SELECT dropdown:
  ```tsx
  <Select
    name="payment_method_id"
    value={selectedPaymentMethodId}
    onChange={handlePaymentMethodChange}
  >
    {paymentMethods.map(pm => (
      <option key={pm.id} value={pm.id}>
        {pm.name} {pm.type === 'credit' && `(${pm.credit_mode ? 'Credit Mode' : 'Simple Mode'})`}
      </option>
    ))}
  </Select>
  ```
- Load user's payment methods in parent component
- Pass full payment method objects to form
- Enable conditional rendering based on selected payment method

**AC1.6: Conditional Installment Fields (Web)**
- Add state: `const selectedPaymentMethod = paymentMethods.find(pm => pm.id === selectedPaymentMethodId)`
- Conditional rendering:
  ```tsx
  const showInstallmentFields =
    selectedPaymentMethod?.type === 'credit' &&
    selectedPaymentMethod?.credit_mode === true

  {showInstallmentFields && (
    <InstallmentFieldsGroup />
  )}
  ```
- Installment fields only visible for Credit Mode credit cards
- Simple Mode and non-credit payment methods: No installment UI

**AC1.7: Update WhatsApp Transaction Handler**
- Update `whatsapp-bot/src/handlers/transactions/expenses.ts`
- Store `payment_method_id` UUID in transaction record (not TEXT)
- Payment method identification remains unchanged (NLP extracts name, lookup finds UUID)
- Verify payment method ownership before creating transaction

**AC1.8: Update Analytics Events**
- Update `fe/lib/analytics/events.ts`
- Add `paymentMethodMode` property to `TRANSACTION_CREATED` event:
  ```typescript
  {
    event: 'transaction_created',
    userId: string,
    paymentMethodId: string,      // UUID
    paymentMethodType: 'credit' | 'debit' | 'cash',
    paymentMethodMode: 'credit' | 'simple' | null,  // NEW
    amount: number,
    category: string,
    hasInstallments: boolean,     // For Epic 2
    channel: 'web' | 'whatsapp',
    timestamp: ISO8601
  }
  ```
- Track payment method mode for Credit Mode adoption analysis

**AC1.9: Backward Compatibility - Legacy Transactions**
- Migration handles all existing transactions
- If unmapped transactions exist, provide admin script for manual resolution
- No data loss during migration
- Transaction history preserved

**AC1.10: Validation & Error Handling**
- Server actions validate payment_method_id is valid UUID format
- Verify payment method exists and belongs to authenticated user
- Return clear error if payment method not found or unauthorized
- Frontend form disables submit if no payment method selected

---

### Part 2: Test Infrastructure Setup (TD-3)

**AC2.1: Frontend Test Setup (Jest + React Testing Library)**
- Install dependencies:
  - `jest@latest`
  - `@testing-library/react@latest`
  - `@testing-library/jest-dom@latest`
  - `@testing-library/user-event@latest`
- Create `jest.config.js` for Next.js 15
- Create `jest.setup.js` for test environment
- Configure TypeScript for test files
- Add test scripts to `fe/package.json`:
  ```json
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage"
  }
  ```

**AC2.2: Supabase Test Client Setup**
- Create `fe/__tests__/helpers/supabase-test-client.ts`
- Mock Supabase client for unit tests:
  ```typescript
  export const createMockSupabaseClient = () => ({
    from: jest.fn(() => ({
      select: jest.fn(),
      insert: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      eq: jest.fn(),
    })),
    auth: {
      getUser: jest.fn(),
    },
  })
  ```
- Use real Supabase test database for integration tests (separate from production)

**AC2.3: Test Database Setup**
- Create separate Supabase test project OR test schema
- Test database environment variables:
  - `TEST_SUPABASE_URL`
  - `TEST_SUPABASE_SERVICE_KEY`
- Seed script for test data (users, payment methods, categories)
- Cleanup script to reset test database between test runs

**AC2.4: Example Unit Tests for Server Actions**
- Create `fe/lib/actions/__tests__/payment-methods.test.ts`
- Test `switchCreditMode()` server action:
  ```typescript
  describe('switchCreditMode', () => {
    it('switches mode directly when no active installments', async () => {
      // Test implementation
    })

    it('requires confirmation when switching with active installments', async () => {
      // Test implementation
    })

    it('pays off installments when cleanupInstallments=true', async () => {
      // Test implementation
    })

    it('returns error when payment method not found', async () => {
      // Test implementation
    })

    it('returns error when user not authenticated', async () => {
      // Test implementation
    })
  })
  ```
- Minimum 70% coverage for `switchCreditMode()` function

**AC2.5: Example Component Tests**
- Create `fe/components/__tests__/transaction-dialog.test.tsx`
- Test transaction form conditional rendering:
  ```typescript
  describe('TransactionDialog', () => {
    it('shows installment fields for Credit Mode credit cards', async () => {
      // Test implementation
    })

    it('hides installment fields for Simple Mode credit cards', async () => {
      // Test implementation
    })

    it('hides installment fields for debit/cash payment methods', async () => {
      // Test implementation
    })

    it('validates payment method selection before submit', async () => {
      // Test implementation
    })
  })
  ```

**AC2.6: WhatsApp Bot Test Infrastructure**
- Verify existing test setup (already exists from Epic 1)
- Ensure tests pass: `npm test` in `whatsapp-bot/` directory
- Current coverage: 16/16 tests passing
- Add test utilities for database setup/teardown

**AC2.7: CI Pipeline Configuration (Optional but Recommended)**
- Create `.github/workflows/test.yml`
- Run tests on pull requests
- Require tests to pass before merge
- Generate coverage reports
- **Note:** Can be deferred if not using GitHub Actions

**AC2.8: Test Coverage Reporting**
- Configure Jest coverage thresholds:
  ```json
  "jest": {
    "coverageThreshold": {
      "global": {
        "branches": 70,
        "functions": 70,
        "lines": 70,
        "statements": 70
      }
    }
  }
  ```
- Generate HTML coverage report: `npm run test:coverage`
- Document how to run tests in `README.md`

**AC2.9: Test Documentation**
- Create `fe/TESTING.md` with testing guidelines
- Explain how to write unit tests for server actions
- Explain how to write component tests
- Explain how to run tests locally
- Explain how to generate coverage reports

**AC2.10: Validate Test Infrastructure Works**
- Run all tests: `npm test` (frontend + WhatsApp bot)
- Verify coverage reports generate correctly
- Verify mock Supabase client works
- Fix any failing tests before marking story complete

---

### Part 3: Atomic Transaction Functions (TD-1)

**AC3.1: PostgreSQL Function for Mode Switching**
- Create migration `042_atomic_transaction_functions.sql`
- Implement `switch_credit_mode_atomic()` function:
  ```sql
  CREATE OR REPLACE FUNCTION switch_credit_mode_atomic(
    p_user_id UUID,
    p_payment_method_id UUID,
    p_new_mode BOOLEAN,
    p_cleanup_installments BOOLEAN DEFAULT FALSE
  ) RETURNS TABLE(success BOOLEAN, error_message TEXT) AS $$
  BEGIN
    -- Validate payment method ownership
    IF NOT EXISTS (
      SELECT 1 FROM payment_methods
      WHERE id = p_payment_method_id AND user_id = p_user_id
    ) THEN
      RETURN QUERY SELECT FALSE, 'Payment method not found or unauthorized';
      RETURN;
    END IF;

    -- If cleanup requested, update installment_plans and installment_payments
    IF p_cleanup_installments AND p_new_mode = FALSE THEN
      -- Mark installment plans as paid_off
      UPDATE installment_plans
      SET status = 'paid_off', updated_at = NOW()
      WHERE payment_method_id = p_payment_method_id
        AND user_id = p_user_id
        AND status = 'active';

      -- Cancel pending installment payments
      UPDATE installment_payments
      SET status = 'cancelled', updated_at = NOW()
      WHERE plan_id IN (
        SELECT id FROM installment_plans
        WHERE payment_method_id = p_payment_method_id AND user_id = p_user_id
      ) AND status = 'pending';
    END IF;

    -- Update credit_mode
    UPDATE payment_methods
    SET credit_mode = p_new_mode, updated_at = NOW()
    WHERE id = p_payment_method_id AND user_id = p_user_id;

    RETURN QUERY SELECT TRUE, NULL::TEXT;

  EXCEPTION WHEN OTHERS THEN
    -- Automatic rollback on error
    RETURN QUERY SELECT FALSE, SQLERRM;
  END;
  $$ LANGUAGE plpgsql;
  ```

**AC3.2: PostgreSQL Function for Installment Plan Creation**
- Implement `create_installment_plan_atomic()` function:
  ```sql
  CREATE OR REPLACE FUNCTION create_installment_plan_atomic(
    p_user_id UUID,
    p_payment_method_id UUID,
    p_description TEXT,
    p_total_amount DECIMAL(10,2),
    p_total_installments INTEGER,
    p_merchant TEXT,
    p_category_id UUID,
    p_first_payment_date DATE
  ) RETURNS TABLE(plan_id UUID, success BOOLEAN, error_message TEXT) AS $$
  DECLARE
    v_plan_id UUID;
    v_payment_amount DECIMAL(10,2);
    v_current_date DATE;
    i INTEGER;
  BEGIN
    -- Validate inputs
    IF p_total_installments < 1 OR p_total_installments > 60 THEN
      RETURN QUERY SELECT NULL::UUID, FALSE, 'Installments must be between 1 and 60';
      RETURN;
    END IF;

    IF p_total_amount <= 0 THEN
      RETURN QUERY SELECT NULL::UUID, FALSE, 'Total amount must be positive';
      RETURN;
    END IF;

    -- Validate payment method ownership and Credit Mode
    IF NOT EXISTS (
      SELECT 1 FROM payment_methods
      WHERE id = p_payment_method_id
        AND user_id = p_user_id
        AND type = 'credit'
        AND credit_mode = TRUE
    ) THEN
      RETURN QUERY SELECT NULL::UUID, FALSE, 'Payment method must be Credit Mode credit card';
      RETURN;
    END IF;

    -- Calculate payment amount per installment
    v_payment_amount := ROUND(p_total_amount / p_total_installments, 2);

    -- Create installment plan
    INSERT INTO installment_plans (
      user_id, payment_method_id, description, total_amount,
      total_installments, status, merchant, category_id
    ) VALUES (
      p_user_id, p_payment_method_id, p_description, p_total_amount,
      p_total_installments, 'active', p_merchant, p_category_id
    ) RETURNING id INTO v_plan_id;

    -- Create monthly installment payments
    v_current_date := p_first_payment_date;
    FOR i IN 1..p_total_installments LOOP
      INSERT INTO installment_payments (
        plan_id, installment_number, due_date, amount, status
      ) VALUES (
        v_plan_id, i, v_current_date, v_payment_amount, 'pending'
      );

      -- Move to next month
      v_current_date := v_current_date + INTERVAL '1 month';
    END LOOP;

    RETURN QUERY SELECT v_plan_id, TRUE, NULL::TEXT;

  EXCEPTION WHEN OTHERS THEN
    -- Automatic rollback on error
    RETURN QUERY SELECT NULL::UUID, FALSE, SQLERRM;
  END;
  $$ LANGUAGE plpgsql;
  ```

**AC3.3: PostgreSQL Function for Installment Plan Deletion**
- Implement `delete_installment_plan_atomic()` function:
  ```sql
  CREATE OR REPLACE FUNCTION delete_installment_plan_atomic(
    p_user_id UUID,
    p_plan_id UUID,
    p_delete_type TEXT -- 'cancel' or 'paid_off'
  ) RETURNS TABLE(success BOOLEAN, error_message TEXT) AS $$
  BEGIN
    -- Validate ownership
    IF NOT EXISTS (
      SELECT 1 FROM installment_plans
      WHERE id = p_plan_id AND user_id = p_user_id
    ) THEN
      RETURN QUERY SELECT FALSE, 'Installment plan not found or unauthorized';
      RETURN;
    END IF;

    -- Update plan status
    IF p_delete_type = 'cancel' THEN
      UPDATE installment_plans
      SET status = 'cancelled', updated_at = NOW()
      WHERE id = p_plan_id;

      -- Cancel all pending payments
      UPDATE installment_payments
      SET status = 'cancelled', updated_at = NOW()
      WHERE plan_id = p_plan_id AND status = 'pending';

    ELSIF p_delete_type = 'paid_off' THEN
      UPDATE installment_plans
      SET status = 'paid_off', updated_at = NOW()
      WHERE id = p_plan_id;

      -- Cancel all pending payments
      UPDATE installment_payments
      SET status = 'cancelled', updated_at = NOW()
      WHERE plan_id = p_plan_id AND status = 'pending';

    ELSE
      RETURN QUERY SELECT FALSE, 'Invalid delete_type (must be cancel or paid_off)';
      RETURN;
    END IF;

    RETURN QUERY SELECT TRUE, NULL::TEXT;

  EXCEPTION WHEN OTHERS THEN
    -- Automatic rollback on error
    RETURN QUERY SELECT FALSE, SQLERRM;
  END;
  $$ LANGUAGE plpgsql;
  ```

**AC3.4: Update switchCreditMode() to Use PostgreSQL Function**
- Update `fe/lib/actions/payment-methods.ts`
- Replace direct Supabase queries with RPC call:
  ```typescript
  export async function switchCreditMode(
    paymentMethodId: string,
    newMode: boolean,
    options?: { cleanupInstallments?: boolean }
  ): Promise<SwitchResult> {
    const supabase = createServerClient()
    const user = await getUser()

    // Check for active installments first (if switching to Simple Mode)
    if (newMode === false && !options?.cleanupInstallments) {
      const { data: installments } = await supabase
        .from('installment_plans')
        .select('id')
        .eq('payment_method_id', paymentMethodId)
        .eq('user_id', user.id)
        .eq('status', 'active')

      if (installments && installments.length > 0) {
        return {
          success: false,
          requiresConfirmation: true,
          activeInstallments: installments.length
        }
      }
    }

    // Call PostgreSQL function for atomic mode switch
    const { data, error } = await supabase.rpc('switch_credit_mode_atomic', {
      p_user_id: user.id,
      p_payment_method_id: paymentMethodId,
      p_new_mode: newMode,
      p_cleanup_installments: options?.cleanupInstallments || false
    })

    if (error || !data[0]?.success) {
      return {
        success: false,
        error: data[0]?.error_message || error?.message || 'Unknown error'
      }
    }

    // Track analytics
    await trackServerEvent(CREDIT_MODE_SWITCHED, {
      userId: user.id,
      paymentMethodId,
      previousMode: !newMode ? 'credit' : 'simple',
      newMode: newMode ? 'credit' : 'simple',
      hadActiveInstallments: !!options?.cleanupInstallments,
      installmentsCleanedUp: options?.cleanupInstallments || false,
      channel: 'web'
    })

    // Revalidate paths
    revalidatePath('/profile')
    revalidatePath('/[locale]/profile')
    revalidatePath('/settings')

    return { success: true }
  }
  ```

**AC3.5: Add Supabase RPC Types**
- Create `fe/lib/supabase/rpc-types.ts`:
  ```typescript
  export interface SwitchCreditModeParams {
    p_user_id: string
    p_payment_method_id: string
    p_new_mode: boolean
    p_cleanup_installments?: boolean
  }

  export interface SwitchCreditModeResult {
    success: boolean
    error_message: string | null
  }

  export interface CreateInstallmentPlanParams {
    p_user_id: string
    p_payment_method_id: string
    p_description: string
    p_total_amount: number
    p_total_installments: number
    p_merchant: string | null
    p_category_id: string | null
    p_first_payment_date: string // ISO date
  }

  export interface CreateInstallmentPlanResult {
    plan_id: string | null
    success: boolean
    error_message: string | null
  }
  ```

**AC3.6: Test Atomic Transaction Functions**
- Create `fe/lib/actions/__tests__/atomic-transactions.test.ts`
- Test mode switch rollback on error:
  ```typescript
  it('rolls back mode switch if installment update fails', async () => {
    // Mock failure scenario
    // Verify payment_methods.credit_mode unchanged
    // Verify installment_plans.status unchanged
  })
  ```
- Test installment creation rollback:
  ```typescript
  it('rolls back installment plan if payment creation fails', async () => {
    // Mock failure after creating plan but before payments
    // Verify installment_plans record not created
    // Verify installment_payments records not created
  })
  ```

**AC3.7: Database Function Documentation**
- Create `docs/database-functions.md`
- Document each PostgreSQL function:
  - Purpose and use case
  - Parameters and return values
  - Error handling behavior
  - Transaction guarantees
- Add examples of calling from TypeScript

**AC3.8: Performance Testing**
- Test `create_installment_plan_atomic()` with max installments (60 payments)
- Verify execution time < 500ms for 60 installments
- Verify rollback works correctly on constraint violations
- Load test: Create 100 installment plans in parallel (simulate multiple users)

**AC3.9: Migration Rollback Script**
- Create rollback migration for PostgreSQL functions
- `042_atomic_transaction_functions_rollback.sql`:
  ```sql
  DROP FUNCTION IF EXISTS switch_credit_mode_atomic;
  DROP FUNCTION IF EXISTS create_installment_plan_atomic;
  DROP FUNCTION IF EXISTS delete_installment_plan_atomic;
  ```

**AC3.10: Epic 1 TD-1 Validation**
- Run mode switch with active installments
- Verify atomic behavior:
  - Both `installment_plans` and `installment_payments` updated together
  - OR both unchanged if error occurs
  - No partial state possible
- Mark TD-1 as RESOLVED

---

## Tasks / Subtasks

### Part 1: Payment Method ID Refactoring

- [ ] **Task 1.1: Database Migration**
  - [ ] Create `041_payment_method_id_refactoring.sql`
  - [ ] Add `payment_method_id UUID` column to `transactions`
  - [ ] Add foreign key constraint with ON DELETE RESTRICT
  - [ ] Add index on `payment_method_id`
  - [ ] Test migration on local database
  - [ ] Document rollback script

- [ ] **Task 1.2: Data Migration Script**
  - [ ] Write logic to map TEXT values to UUIDs
  - [ ] Handle standard payment method names (Cartão, Débito, Dinheiro)
  - [ ] Implement fuzzy matching for custom names
  - [ ] Log unmapped transactions for manual review
  - [ ] Test on copy of production data
  - [ ] Verify 100% of transactions mapped

- [ ] **Task 1.3: Make payment_method_id NOT NULL**
  - [ ] After data migration, add NOT NULL constraint
  - [ ] Rename or drop old `payment_method` TEXT column
  - [ ] Update schema documentation
  - [ ] Verify database enforces constraint

- [ ] **Task 1.4: Update Server Actions**
  - [ ] Update `createTransaction()` in `fe/lib/actions/transactions.ts`
  - [ ] Update `updateTransaction()` in `fe/lib/actions/transactions.ts`
  - [ ] Add validation for payment_method_id ownership
  - [ ] Add error handling for invalid UUIDs
  - [ ] Test server actions with Postman/curl

- [ ] **Task 1.5: Update Transaction Form**
  - [ ] Replace TEXT input with SELECT dropdown in `transaction-dialog.tsx`
  - [ ] Load user's payment methods
  - [ ] Add onChange handler for payment method selection
  - [ ] Test form in browser (all payment method types)

- [ ] **Task 1.6: Add Conditional Installment Fields**
  - [ ] Add state for selected payment method object
  - [ ] Add conditional rendering: `showInstallmentFields`
  - [ ] Create placeholder `<InstallmentFieldsGroup />` component (Epic 2 will implement)
  - [ ] Test: Credit Mode card shows fields, Simple Mode hides fields

- [ ] **Task 1.7: Update WhatsApp Handler**
  - [ ] Update `expenses.ts` to store `payment_method_id` UUID
  - [ ] Verify payment method lookup works
  - [ ] Test WhatsApp transaction creation flow
  - [ ] Verify database stores UUID, not TEXT

- [ ] **Task 1.8: Update Analytics**
  - [ ] Add `paymentMethodMode` property to `TRANSACTION_CREATED` event
  - [ ] Update analytics tracking in `createTransaction()`
  - [ ] Update analytics tracking in WhatsApp handler
  - [ ] Verify PostHog receives new property

- [ ] **Task 1.9: Manual Testing**
  - [ ] Test transaction creation (web) with each payment method type
  - [ ] Test transaction creation (WhatsApp)
  - [ ] Test transaction editing
  - [ ] Verify analytics events in PostHog
  - [ ] Test error cases (invalid payment method, unauthorized)

- [ ] **Task 1.10: Mark TD-2 as RESOLVED**
  - [ ] Verify transaction form shows conditional fields
  - [ ] Verify analytics track payment_method_mode
  - [ ] Update Epic 1 retrospective: TD-2 status = RESOLVED

---

### Part 2: Test Infrastructure Setup

- [ ] **Task 2.1: Install Test Dependencies**
  - [ ] Install Jest, React Testing Library, jest-dom, user-event
  - [ ] Create `jest.config.js` for Next.js 15
  - [ ] Create `jest.setup.js`
  - [ ] Add test scripts to `package.json`
  - [ ] Run `npm test` to verify setup

- [ ] **Task 2.2: Supabase Test Client**
  - [ ] Create `fe/__tests__/helpers/supabase-test-client.ts`
  - [ ] Implement mock Supabase client
  - [ ] Set up test database credentials (separate project/schema)
  - [ ] Create seed script for test data
  - [ ] Create cleanup script

- [ ] **Task 2.3: Test Database Setup**
  - [ ] Create separate Supabase test project OR schema
  - [ ] Add test environment variables to `.env.test`
  - [ ] Run all migrations on test database
  - [ ] Seed test users, payment methods, categories
  - [ ] Document test database setup in `TESTING.md`

- [ ] **Task 2.4: Write Example Unit Tests (Server Actions)**
  - [ ] Create `fe/lib/actions/__tests__/payment-methods.test.ts`
  - [ ] Write 5 tests for `switchCreditMode()` (AC2.4)
  - [ ] Achieve 70%+ coverage for switchCreditMode function
  - [ ] Run tests: `npm test`
  - [ ] Verify all tests pass

- [ ] **Task 2.5: Write Example Component Tests**
  - [ ] Create `fe/components/__tests__/transaction-dialog.test.tsx`
  - [ ] Write 4 tests for conditional installment fields (AC2.5)
  - [ ] Test Credit Mode shows fields, Simple Mode hides fields
  - [ ] Test validation (payment method required)
  - [ ] Verify all tests pass

- [ ] **Task 2.6: WhatsApp Bot Test Validation**
  - [ ] Run `npm test` in `whatsapp-bot/` directory
  - [ ] Verify 16/16 tests still passing
  - [ ] Add test utilities for database setup/teardown (if needed)
  - [ ] Document WhatsApp testing in `TESTING.md`

- [ ] **Task 2.7: Configure Coverage Thresholds**
  - [ ] Set Jest coverage thresholds to 70%
  - [ ] Run `npm run test:coverage`
  - [ ] Generate HTML coverage report
  - [ ] Verify thresholds enforced

- [ ] **Task 2.8: Write Test Documentation**
  - [ ] Create `fe/TESTING.md`
  - [ ] Document how to run tests locally
  - [ ] Document how to write unit tests for server actions
  - [ ] Document how to write component tests
  - [ ] Document test database setup

- [ ] **Task 2.9: Optional - CI Pipeline Setup**
  - [ ] Create `.github/workflows/test.yml` (if using GitHub Actions)
  - [ ] Configure tests to run on pull requests
  - [ ] Require tests to pass before merge
  - [ ] Add coverage report comments to PRs

- [ ] **Task 2.10: Mark TD-3 as RESOLVED**
  - [ ] Verify test infrastructure working
  - [ ] Verify example tests passing
  - [ ] Verify coverage reports generate
  - [ ] Update Epic 1 retrospective: TD-3 status = RESOLVED

---

### Part 3: Atomic Transaction Functions

- [ ] **Task 3.1: Create PostgreSQL Functions Migration**
  - [ ] Create `042_atomic_transaction_functions.sql`
  - [ ] Implement `switch_credit_mode_atomic()` function (AC3.1)
  - [ ] Add input validation and error handling
  - [ ] Test function manually in Supabase SQL editor
  - [ ] Verify rollback on error

- [ ] **Task 3.2: Implement Installment Plan Creation Function**
  - [ ] Implement `create_installment_plan_atomic()` function (AC3.2)
  - [ ] Add validation: installments 1-60, amount > 0, Credit Mode only
  - [ ] Create parent plan + child payments in single transaction
  - [ ] Test with various installment counts (1, 12, 60)
  - [ ] Verify rollback on constraint violations

- [ ] **Task 3.3: Implement Installment Plan Deletion Function**
  - [ ] Implement `delete_installment_plan_atomic()` function (AC3.3)
  - [ ] Support 'cancel' and 'paid_off' delete types
  - [ ] Update plan status and cancel pending payments atomically
  - [ ] Test both delete types
  - [ ] Verify ownership validation works

- [ ] **Task 3.4: Update switchCreditMode() Server Action**
  - [ ] Update `fe/lib/actions/payment-methods.ts` to use RPC call (AC3.4)
  - [ ] Replace direct Supabase queries with `supabase.rpc('switch_credit_mode_atomic', ...)`
  - [ ] Keep confirmation check (first phase)
  - [ ] Use RPC for execution (second phase)
  - [ ] Test mode switch flow end-to-end

- [ ] **Task 3.5: Create RPC Type Definitions**
  - [ ] Create `fe/lib/supabase/rpc-types.ts` (AC3.5)
  - [ ] Define interfaces for all RPC function params and results
  - [ ] Export types for use in server actions
  - [ ] Add JSDoc comments for each type

- [ ] **Task 3.6: Write Atomic Transaction Tests**
  - [ ] Create `fe/lib/actions/__tests__/atomic-transactions.test.ts`
  - [ ] Test rollback scenarios (AC3.6)
  - [ ] Mock failures to verify rollback behavior
  - [ ] Verify database consistency after errors
  - [ ] Achieve 80%+ coverage for atomic functions

- [ ] **Task 3.7: Document Database Functions**
  - [ ] Create `docs/database-functions.md` (AC3.7)
  - [ ] Document each function: purpose, params, returns, errors
  - [ ] Add TypeScript usage examples
  - [ ] Document transaction guarantees

- [ ] **Task 3.8: Performance Testing**
  - [ ] Test `create_installment_plan_atomic()` with 60 installments (AC3.8)
  - [ ] Measure execution time (target < 500ms)
  - [ ] Load test: 100 parallel plan creations
  - [ ] Verify no deadlocks or race conditions

- [ ] **Task 3.9: Create Rollback Migration**
  - [ ] Create `042_atomic_transaction_functions_rollback.sql`
  - [ ] Drop all created functions
  - [ ] Test rollback on local database
  - [ ] Document when to use rollback

- [ ] **Task 3.10: Mark TD-1 as RESOLVED**
  - [ ] Run end-to-end mode switch with installments
  - [ ] Verify atomic behavior (all-or-nothing)
  - [ ] Verify no partial state possible
  - [ ] Update Epic 1 retrospective: TD-1 status = RESOLVED

---

### Final Validation

- [ ] **Task 4.1: Integration Testing**
  - [ ] Create transaction (web) with Credit Mode card → installment fields visible
  - [ ] Create transaction (web) with Simple Mode card → no installment fields
  - [ ] Create transaction (WhatsApp) with Credit Mode card
  - [ ] Switch credit mode with installments → atomic operation
  - [ ] Verify all analytics events tracked

- [ ] **Task 4.2: Run All Tests**
  - [ ] Frontend: `npm test` (all tests pass)
  - [ ] Frontend: `npm run test:coverage` (70%+ coverage)
  - [ ] WhatsApp bot: `npm test` (all tests pass)
  - [ ] Fix any failing tests

- [ ] **Task 4.3: Code Review**
  - [ ] Self-review all code changes
  - [ ] Run AI Senior Developer Review
  - [ ] Address all review findings
  - [ ] Document review outcomes

- [ ] **Task 4.4: Documentation Updates**
  - [ ] Update `TESTING.md` with all test instructions
  - [ ] Update `docs/database-functions.md` with RPC functions
  - [ ] Update Epic 1 retrospective (mark all 3 TDs as RESOLVED)
  - [ ] Create migration runbook for production deployment

- [ ] **Task 4.5: Mark Story Complete**
  - [ ] Verify all ACs implemented (30 ACs total)
  - [ ] Verify all tasks complete (40+ tasks)
  - [ ] Mark story status: review → done
  - [ ] Ready to start Epic 2 Story 2.1

---

## Dev Notes

### Why This Story Exists

Epic 1 retrospective identified 3 critical technical debt items that BLOCK Epic 2 implementation:

1. **TD-1 (Atomic Transactions):** Creating installment plans with 2-60 monthly payments MUST be atomic. Partial state (plan created, payments failed) would corrupt user data.

2. **TD-2 (Payment Method ID):** Transaction form can't conditionally show installment fields without knowing the selected payment method's `credit_mode`. Current TEXT field doesn't provide this information.

3. **TD-3 (Test Coverage):** Installment logic is complex (parent/child relationships, cascade deletes). Without test infrastructure, we'd be implementing blind.

**This story de-risks Epic 2** by solving these issues upfront. Epic 2 stories can focus on feature logic, not infrastructure.

---

### Architecture Decisions

**Decision 1: PostgreSQL Functions for Atomic Transactions**
- **Why:** Supabase client in Next.js doesn't support database transactions
- **Alternative Considered:** Sequential updates with manual rollback (rejected - error-prone)
- **Benefit:** Database guarantees atomicity, no partial state possible
- **Trade-off:** More complex testing (need to test RPC calls)

**Decision 2: Payment Method ID as UUID Foreign Key**
- **Why:** Need full payment method object for conditional rendering
- **Alternative Considered:** Keep TEXT field, fetch payment method separately (rejected - extra query)
- **Benefit:** Single query gets transaction + payment method data
- **Trade-off:** Data migration required for existing transactions

**Decision 3: Test Infrastructure Before Features**
- **Why:** Complex features (installments) need safety net
- **Alternative Considered:** Add tests later (rejected - Epic 1 lesson learned)
- **Benefit:** Catch bugs early, enable safe refactoring
- **Trade-off:** Upfront time investment (1-2 days)

---

### Migration Strategy

**Phase 1: Add payment_method_id (Nullable)**
```sql
ALTER TABLE transactions ADD COLUMN payment_method_id UUID REFERENCES payment_methods(id);
CREATE INDEX idx_transactions_payment_method_id ON transactions(payment_method_id);
```

**Phase 2: Data Migration (Map TEXT → UUID)**
```sql
-- Standard mappings
UPDATE transactions SET payment_method_id = (
  SELECT id FROM payment_methods
  WHERE user_id = transactions.user_id
    AND type = 'credit'
    AND name = 'Cartão de Crédito'
  LIMIT 1
) WHERE payment_method = 'Cartão de Crédito';

-- Fuzzy matching for custom names
-- (Script handles edge cases)
```

**Phase 3: Make NOT NULL**
```sql
ALTER TABLE transactions ALTER COLUMN payment_method_id SET NOT NULL;
ALTER TABLE transactions DROP COLUMN payment_method; -- OR RENAME to payment_method_legacy
```

---

### Test Coverage Targets

**Minimum Viable Coverage (70%):**
- Server actions: `switchCreditMode()`, `createTransaction()`, `updateTransaction()`
- Components: `TransactionDialog` (conditional rendering)
- PostgreSQL functions: Atomic transaction behavior

**Aspirational Coverage (90%+):**
- All server actions (create, update, delete)
- All components with business logic
- Edge cases: rollback, validation errors, unauthorized access

**Coverage Gaps Allowed:**
- Trivial getters/setters
- Third-party library wrappers (Supabase client)
- UI components with no logic (pure presentation)

---

### PostgreSQL Function Testing Strategy

**Unit Tests (TypeScript):**
```typescript
describe('Atomic Transaction Functions', () => {
  it('creates installment plan with all payments atomically', async () => {
    const result = await supabase.rpc('create_installment_plan_atomic', {
      p_user_id: testUser.id,
      p_payment_method_id: creditCard.id,
      p_description: 'Test purchase',
      p_total_amount: 600,
      p_total_installments: 3,
      p_merchant: 'Test Store',
      p_category_id: category.id,
      p_first_payment_date: '2025-01-01'
    })

    expect(result.data[0].success).toBe(true)
    expect(result.data[0].plan_id).toBeDefined()

    // Verify plan created
    const plan = await getPlan(result.data[0].plan_id)
    expect(plan.total_installments).toBe(3)

    // Verify payments created
    const payments = await getPayments(result.data[0].plan_id)
    expect(payments).toHaveLength(3)
    expect(payments[0].amount).toBe(200) // 600 / 3
  })

  it('rolls back installment plan creation on error', async () => {
    // Mock constraint violation (invalid category_id)
    const result = await supabase.rpc('create_installment_plan_atomic', {
      p_category_id: 'invalid-uuid',
      // ... other params
    })

    expect(result.data[0].success).toBe(false)
    expect(result.data[0].error_message).toContain('foreign key')

    // Verify NO plan created
    const plans = await getPlansForUser(testUser.id)
    expect(plans).toHaveLength(0)

    // Verify NO payments created
    const payments = await getAllPaymentsForUser(testUser.id)
    expect(payments).toHaveLength(0)
  })
})
```

**Manual Tests (Supabase SQL Editor):**
```sql
-- Test 1: Valid installment plan creation
SELECT * FROM create_installment_plan_atomic(
  'user-uuid',
  'payment-method-uuid',
  'Macbook Pro',
  12000.00,
  12,
  'Apple Store',
  'category-uuid',
  '2025-01-01'
);

-- Verify plan + payments created
SELECT * FROM installment_plans WHERE description = 'Macbook Pro';
SELECT * FROM installment_payments WHERE plan_id = 'plan-uuid';

-- Test 2: Rollback on invalid installments
SELECT * FROM create_installment_plan_atomic(
  'user-uuid',
  'payment-method-uuid',
  'Test',
  1000.00,
  100, -- Invalid (> 60)
  NULL,
  NULL,
  '2025-01-01'
);

-- Verify error returned, no records created
```

---

### Performance Considerations

**Installment Plan Creation:**
- Target: < 500ms for 60 installments
- Expected: ~200-300ms (1 INSERT for plan + 60 INSERTs for payments)
- Optimization: Bulk INSERT for payments (if needed)

**Mode Switch:**
- Target: < 1000ms with 10 active installments
- Expected: ~300-500ms (2 UPDATEs: installment_plans + installment_payments)
- Optimization: Index on `payment_method_id` and `status`

**Data Migration:**
- Existing transactions: ~1000-10000 (estimated)
- Migration time: < 5 minutes for 10k transactions
- Strategy: Run during low-traffic window, test on staging first

---

### Dependencies on Future Epics

**Epic 2 (Parcelamento Intelligence) Depends On:**
- ✅ Payment method ID refactoring (Task 1)
- ✅ Test infrastructure (Task 2)
- ✅ Atomic transaction functions (Task 3)

**Epic 3 (Statement-Aware Budgets) May Use:**
- Test infrastructure patterns
- PostgreSQL function patterns (if budget calculations complex)

**Epic 4 (Payment Reminders) May Use:**
- PostgreSQL function patterns for auto-expense creation

---

### Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Data migration loses transactions | Low | Critical | Extensive testing on staging, manual review of unmapped transactions |
| PostgreSQL functions too slow | Low | Medium | Performance testing with 60 installments, optimization if needed |
| Test setup takes longer than expected | Medium | Medium | Timebox to 1 day, defer CI setup if needed |
| Breaking changes to transaction form | Medium | High | Thorough manual testing, rollback plan ready |
| Unmapped payment methods in legacy data | Medium | Low | Provide admin script for manual resolution |

---

### Rollback Plan

**If migration fails in production:**

1. **Rollback database migrations:**
   ```bash
   psql $DATABASE_URL < 042_atomic_transaction_functions_rollback.sql
   psql $DATABASE_URL < 041_payment_method_id_refactoring_rollback.sql
   ```

2. **Revert code changes:**
   - Restore previous `transaction-dialog.tsx` (TEXT field)
   - Restore previous `transactions.ts` server actions
   - Restore previous `switchCreditMode()` (direct Supabase queries)

3. **Verify application works:**
   - Test transaction creation (web + WhatsApp)
   - Test mode switching
   - Check error logs

**Rollback window:** Migrations are reversible within 24 hours (before old `payment_method` column dropped).

---

### Success Criteria

**This story is DONE when:**

1. ✅ Payment method ID refactoring complete:
   - Transaction form uses UUID dropdown
   - Installment fields render conditionally
   - Analytics track `paymentMethodMode`

2. ✅ Test infrastructure working:
   - Frontend tests run: `npm test`
   - Coverage reports generate: `npm run test:coverage`
   - Example tests pass (70%+ coverage)

3. ✅ Atomic transactions implemented:
   - Mode switch uses PostgreSQL function
   - Installment plan creation function ready (Epic 2 will use)
   - Rollback behavior verified

4. ✅ All 3 Epic 1 technical debts marked RESOLVED:
   - TD-1: Atomic transactions ✅
   - TD-2: Payment method ID ✅
   - TD-3: Test coverage ✅

5. ✅ Documentation complete:
   - `TESTING.md` created
   - `database-functions.md` created
   - Migration runbook ready

6. ✅ Ready to start Epic 2:
   - No blockers remaining
   - Infrastructure solid
   - Team confident

---

## Dev Agent Record

### Story Creation

- **Agent:** Bob (Scrum Master AI)
- **Date:** 2025-12-02
- **Context:** Epic 1 retrospective identified 3 blockers for Epic 2
- **Story Type:** Foundation / Technical Debt Resolution
- **Complexity:** High (3 major refactorings)
- **Estimated Effort:** 3-5 days
- **Criticality:** BLOCKER for Epic 2

### Story Status

- **Status:** drafted (ready for dev-story workflow)
- **Blockers:** None (this story resolves blockers for Epic 2)
- **Dependencies:** Epic 1 complete

### Key Design Decisions

1. **PostgreSQL functions for atomicity:** Database-level transactions prevent partial state
2. **Payment method ID as foreign key:** Enables conditional UI rendering
3. **Test infrastructure upfront:** De-risks Epic 2 implementation
4. **All 3 TDs in one story:** Related refactorings, efficient to do together

### Implementation Notes

- This is a foundation story, not a user-facing feature
- Success measured by: Epic 2 stories can start without blockers
- High test coverage required (70%+) - this sets the standard for Epic 2
- Migration strategy must preserve all existing data (zero loss tolerance)

---

**Story ready for implementation!** 🚀
