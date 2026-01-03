# Epic Technical Specification: Parcelamento Intelligence

Date: 2025-12-02
Author: Liam (Architect AI)
Epic ID: 2
Status: Draft
Version: 1.0

---

## Overview

Epic 2 delivers the killer feature that differentiates NexFinApp from generic expense trackers: **parcelamento (installment) intelligence**. Brazilian users commonly purchase items "parcelado em 12x" (split into 12 monthly payments), and no mainstream tracker handles this culturally-specific pattern properly. This epic enables users to:

1. Log installment purchases using natural language ("gastei 600 em 3x no celular")
2. See "future commitments" across all active installments (total obligations per month)
3. Manage installment plans (edit, early payoff, delete)
4. Understand budget impact (only monthly payment counts, not full purchase amount)

Epic 2 builds on Epic 1's Credit Mode foundation, implementing functional requirements FR13-FR23 from the PRD. The two-table data model (`installment_plans` + `installment_payments`) was established in Epic 1 Story 1.1 and is ready for use.

**Key Innovation:** While credit trackers show "you spent R$1,200," NexFinApp shows "you'll pay R$100/month for the next 12 months"—the information users actually need for budgeting.

---

## Objectives and Scope

### In Scope (Epic 2 - FR13-FR23)

**Core Installment Features:**
- ✅ Add installment purchases (WhatsApp natural language + Web form)
- ✅ Auto-create parent plan + N monthly payment records
- ✅ Future commitments dashboard (total obligations by month)
- ✅ View all active installments with payment progress
- ✅ Mark installments as "paid off early"
- ✅ Edit installment plans (description, amount, installment count)
- ✅ Delete installment plans (with cascade to payments)
- ✅ Budget integration (only monthly payment counts against statement budget)

**Cross-Channel Support:**
- ✅ WhatsApp bot: Natural language installment creation ("600 em 3x")
- ✅ Web frontend: Form-based installment creation with validation
- ✅ Both channels share same backend logic (server actions)

**Credit Mode Gating:**
- ✅ Simple Mode users never see installment prompts (Epic 1 Story 1.6)
- ✅ Credit Mode detection before showing installment UI

**Technical Debt Resolution (Story 2.0):**
- ✅ Payment method ID refactoring (TEXT → UUID foreign key)
- ✅ Test infrastructure setup (Jest, React Testing Library)
- ✅ Atomic transaction functions (PostgreSQL RPC for multi-table operations)

### Out of Scope (Deferred to Epic 3/4/Post-MVP)

**Epic 3 Dependencies:**
- ❌ Statement-period budget calculations (Epic 3 defines statement periods)
- ❌ Pre-statement summaries showing installment breakdowns (Epic 3)
- ❌ "Real available credit" widget (limit - future commitments) - Growth feature

**Epic 4 Dependencies:**
- ❌ Auto-payment transaction creation for installments (Epic 4)

**Growth Features (FR74-FR95):**
- ❌ Multi-card installment tracking (requires multi-card support)
- ❌ Interest rate tracking for installments (not in MVP)
- ❌ Installment refinancing / early payoff discount calculator

**Technical Scope Boundaries:**
- ❌ No OCR for installment detection from receipts (deferred)
- ❌ No automatic installment import from bank APIs (manual entry only)
- ❌ No installment plan templates (each purchase is unique)

---

## System Architecture Alignment

### Architecture Decision Records (ADRs) Applied

**ADR-001: Installment Data Model + Statement-Aware Budget Periods**
- **Status:** Accepted, implemented in Epic 1 Story 1.1
- **Epic 2 Implementation:** Use existing two-table model (`installment_plans`, `installment_payments`)
- **Key Constraints:**
  - Total installments: 1-60 (database CHECK constraint)
  - Status values: 'active', 'paid_off', 'cancelled' (enum)
  - Cascade delete: Deleting plan removes all child payments
  - RLS policies: User-level security enforced

**ADR-004: Credit Mode Switch Behavior (Non-Destructive)**
- **Epic 2 Impact:** Mode switching with active installments handled by Epic 1 Story 1.5
- **Epic 2 Assumption:** Users in Credit Mode can create installments; mode checks already implemented

**ADR-007: Budget Calculation Performance (Real-Time Aggregation)**
- **Epic 2 Implementation:** Future commitments query uses indexed aggregation (no materialized views for MVP)
- **Performance Target:** < 500ms for 60 active installments across 12 months

**ADR-011: Performance Optimization Strategy (Defer Until Proven Need)**
- **Epic 2 Approach:** Start with simple aggregation queries, add indexes if slow
- **Monitoring:** Track query performance in Epic 2 Story 2.8 (budget integration)

### Components Referenced

**Frontend (Next.js 15):**
- `fe/app/[locale]/installments/page.tsx` - Installments list page (Story 2.4)
- `fe/components/transactions/installment-form.tsx` - Add installment form (Story 2.2)
- `fe/components/dashboard/future-commitments-widget.tsx` - Future commitments (Story 2.3)
- `fe/lib/actions/installments.ts` - Server actions for CRUD operations

**WhatsApp Bot (Node.js + Baileys):**
- `whatsapp-bot/src/handlers/credit-card/installment-handler.ts` - NLP installment creation (Story 2.1)
- `whatsapp-bot/src/services/ai/ai-pattern-generator.ts` - AI-powered intent extraction (Epic 8 integration)

**Database (Supabase PostgreSQL):**
- Tables: `installment_plans`, `installment_payments` (already exist from Epic 1)
- RPC Functions: `create_installment_plan_atomic()`, `delete_installment_plan_atomic()` (Story 2.0)

**Shared:**
- `fe/lib/localization/{pt-br,en}.ts` - Installment messages (pt-BR primary)
- `fe/lib/analytics/events.ts` - PostHog event tracking

### Architecture Constraints

1. **Database Transactions:** Multi-table operations (plan + payments) MUST be atomic (Story 2.0 requirement)
2. **Credit Mode Gating:** All installment features check `payment_method.credit_mode = true`
3. **Localization:** All messages support pt-BR (primary) and English (secondary)
4. **Brazilian Cultural Fit:** Use "parcelamento" terminology, support 1-60 installments
5. **Backward Compatibility:** Simple Mode users see zero changes (no installment UI)

---

## Detailed Design

### Services and Modules

| Module | Responsibility | Inputs | Outputs | Owner |
|--------|---------------|--------|---------|-------|
| **InstallmentService** | Core business logic for installment CRUD | Plan details (amount, installments, etc.) | Plan ID, validation errors | Backend |
| **InstallmentHandler (WhatsApp)** | NLP-based installment creation from natural language | User message, user ID, locale | Confirmation message, plan ID | WhatsApp Bot |
| **InstallmentForm (Web)** | Form-based installment creation with validation | Form inputs (amount, installments, date) | Server action call, success/error | Frontend |
| **FutureCommitmentsCalculator** | Aggregate upcoming installment obligations by month | User ID | Monthly commitment totals | Backend |
| **InstallmentPaymentManager** | Handle early payoff, deletion, editing of payment schedules | Plan ID, action type | Updated plan + payments | Backend |
| **BudgetIntegrator** | Include installment payments in budget calculations | Payment method ID, statement period | Total spent (including installments) | Backend (Epic 3 integration) |

### Data Models and Contracts

**Already Implemented in Epic 1 Story 1.1:**

```sql
-- Parent table: Installment plans
CREATE TABLE installment_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  description TEXT NOT NULL,
  total_amount DECIMAL(10,2) NOT NULL,
  total_installments INTEGER NOT NULL CHECK (total_installments > 0 AND total_installments <= 60),
  status TEXT NOT NULL CHECK (status IN ('active', 'paid_off', 'cancelled')),
  merchant TEXT,
  category_id UUID REFERENCES categories(id),
  payment_method_id UUID REFERENCES payment_methods(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Child table: Individual monthly payments
CREATE TABLE installment_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES installment_plans(id) ON DELETE CASCADE,
  transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
  installment_number INTEGER NOT NULL CHECK (installment_number > 0),
  amount DECIMAL(10,2) NOT NULL,
  due_date DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'paid', 'cancelled')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(plan_id, installment_number)
);

-- Indexes (already created)
CREATE INDEX idx_installment_plans_user_status ON installment_plans(user_id, status);
CREATE INDEX idx_installment_payments_plan ON installment_payments(plan_id);
CREATE INDEX idx_installment_payments_due_date_status ON installment_payments(due_date, status);
```

**Epic 2 Adds: Atomic Transaction Functions (Story 2.0)**

```sql
-- Function: Create installment plan with all payments atomically
CREATE OR REPLACE FUNCTION create_installment_plan_atomic(
  p_user_id UUID,
  p_payment_method_id UUID,
  p_description TEXT,
  p_total_amount DECIMAL(10,2),
  p_total_installments INTEGER,
  p_merchant TEXT,
  p_category_id UUID,
  p_first_payment_date DATE
) RETURNS TABLE(plan_id UUID, success BOOLEAN, error_message TEXT);

-- Function: Delete installment plan atomically (cancel or paid_off)
CREATE OR REPLACE FUNCTION delete_installment_plan_atomic(
  p_user_id UUID,
  p_plan_id UUID,
  p_delete_type TEXT -- 'cancel' or 'paid_off'
) RETURNS TABLE(success BOOLEAN, error_message TEXT);
```

**TypeScript Interfaces (Epic 2 Contracts):**

```typescript
// Installment Plan Interface
interface InstallmentPlan {
  id: string
  user_id: string
  description: string
  total_amount: number
  total_installments: number
  status: 'active' | 'paid_off' | 'cancelled'
  merchant: string | null
  category_id: string | null
  payment_method_id: string
  created_at: string
  updated_at: string
}

// Installment Payment Interface
interface InstallmentPayment {
  id: string
  plan_id: string
  transaction_id: string | null
  installment_number: number
  amount: number
  due_date: string
  status: 'pending' | 'paid' | 'cancelled'
  created_at: string
  updated_at: string
}

// Create Installment Request
interface CreateInstallmentRequest {
  payment_method_id: string
  description: string
  total_amount: number
  total_installments: number
  merchant?: string
  category_id?: string
  first_payment_date: string // ISO date
}

// Future Commitments Response
interface FutureCommitments {
  month: string // YYYY-MM
  total_due: number
  payment_count: number
  plans: Array<{
    plan_id: string
    description: string
    payment_number: number
    total_installments: number
    amount: number
  }>
}
```

### APIs and Interfaces

**Server Actions (Frontend - Story 2.2, 2.4, 2.5, 2.6, 2.7):**

```typescript
// fe/lib/actions/installments.ts

/**
 * Create a new installment plan with monthly payments
 * Uses PostgreSQL RPC function for atomicity (Story 2.0)
 */
export async function createInstallment(
  data: CreateInstallmentRequest
): Promise<{ success: boolean; planId?: string; error?: string }>

/**
 * Get all installment plans for user (filtered by status)
 */
export async function getInstallmentPlans(
  userId: string,
  status?: 'active' | 'paid_off' | 'cancelled'
): Promise<InstallmentPlan[]>

/**
 * Get future commitments (upcoming installment obligations by month)
 */
export async function getFutureCommitments(
  userId: string,
  monthsAhead?: number // default 12
): Promise<FutureCommitments[]>

/**
 * Mark installment as paid off early
 * Atomically updates plan status and cancels pending payments
 */
export async function payOffInstallment(
  planId: string
): Promise<{ success: boolean; error?: string }>

/**
 * Update installment plan details
 * Recalculates monthly payments if amount or installment count changed
 */
export async function updateInstallment(
  planId: string,
  updates: Partial<Pick<InstallmentPlan, 'description' | 'total_amount' | 'total_installments' | 'merchant' | 'category_id'>>
): Promise<{ success: boolean; error?: string }>

/**
 * Delete installment plan (with cascade to payments)
 * Uses PostgreSQL RPC function for atomicity
 */
export async function deleteInstallment(
  planId: string,
  deleteType: 'cancel' | 'paid_off'
): Promise<{ success: boolean; error?: string }>
```

**WhatsApp Bot Handlers (Story 2.1):**

```typescript
// whatsapp-bot/src/handlers/credit-card/installment-handler.ts

/**
 * Handle natural language installment creation
 * Examples: "gastei 600 em 3x", "comprei 1200 parcelado em 12 vezes"
 */
export async function handleInstallmentMessage(
  message: string,
  userId: string,
  locale: 'pt-br' | 'en'
): Promise<string> // Returns confirmation message

/**
 * AI function: Extract installment details from natural language
 * Used by OpenAI function calling (Epic 8 integration)
 */
export async function extractInstallmentDetails(
  message: string
): Promise<{
  amount: number | null
  installments: number | null
  description: string | null
  merchant: string | null
}>
```

**Database Query Patterns (Story 2.3, 2.8):**

```sql
-- Future Commitments Query (Story 2.3)
-- Returns total installment obligations by month
SELECT
  date_trunc('month', ip.due_date) as commitment_month,
  SUM(ip.amount) as total_due,
  COUNT(*) as payment_count
FROM installment_payments ip
JOIN installment_plans ipl ON ip.plan_id = ipl.id
WHERE ipl.user_id = $1
  AND ip.status = 'pending'
  AND ip.due_date > CURRENT_DATE
GROUP BY commitment_month
ORDER BY commitment_month
LIMIT 12; -- Next 12 months

-- Budget Integration Query (Story 2.8)
-- Include installment payments in statement period budget calculation
SELECT SUM(amount) as total_spent
FROM (
  -- Regular transactions
  SELECT t.amount
  FROM transactions t
  WHERE t.user_id = $1
    AND t.payment_method_id = $2
    AND t.date >= $3 -- statement_period_start
    AND t.date <= $4 -- statement_period_end

  UNION ALL

  -- Installment payments due in statement period
  SELECT ip.amount
  FROM installment_payments ip
  JOIN installment_plans ipl ON ip.plan_id = ipl.id
  WHERE ipl.user_id = $1
    AND ipl.payment_method_id = $2
    AND ip.due_date >= $3
    AND ip.due_date <= $4
    AND ip.status = 'pending'
) combined;
```

### Workflows and Sequencing

**Workflow 1: Create Installment (WhatsApp - Story 2.1)**

```
1. User sends: "gastei 600 em 3x no celular"
2. WhatsApp Bot receives message
3. AI extracts: amount=600, installments=3, description="celular"
4. Check: User has credit_mode=true credit card?
   - If NO: Respond "Ative o Modo Crédito primeiro"
   - If YES: Continue
5. Prompt for payment method (if ambiguous)
6. Call createInstallment() server action
7. Server action calls create_installment_plan_atomic() PostgreSQL function
   a. Validate: installments 1-60, amount > 0, credit_mode=true
   b. Create installment_plan record (status='active')
   c. FOR i=1 to 3: Create installment_payment record
      - installment_number = i
      - amount = 600 / 3 = 200
      - due_date = first_payment_date + (i-1) months
      - status = 'pending'
   d. COMMIT transaction (all-or-nothing)
8. Return plan_id to WhatsApp handler
9. Send confirmation message:
   "✅ Parcelamento criado: Celular
    💰 Total: R$ 600,00 em 3x de R$ 200,00
    📅 Primeira parcela: Hoje
    📅 Última parcela: Março 2025"
```

**Workflow 2: Create Installment (Web - Story 2.2)**

```
1. User clicks "Add Installment" in transaction form
2. Form reveals installment fields:
   - Total Amount (R$)
   - Number of Installments (dropdown 1-60)
   - Monthly Payment (auto-calculated, read-only)
   - First Payment Date (date picker)
3. User enters: amount=1200, installments=12
4. Form calculates: monthly_payment = 1200 / 12 = 100 (displayed)
5. User submits form
6. Frontend calls createInstallment() server action
7. Same PostgreSQL RPC flow as Workflow 1
8. Success: Redirect to /installments with success toast
9. Failure: Show inline error message
```

**Workflow 3: View Future Commitments (Story 2.3)**

```
1. User navigates to Dashboard
2. FutureCommitmentsWidget component loads
3. Call getFutureCommitments(userId, 12) server action
4. Server executes future commitments query (see above)
5. Returns monthly breakdown:
   [
     { month: '2025-01', total_due: 450, payment_count: 3 },
     { month: '2025-02', total_due: 450, payment_count: 3 },
     { month: '2025-03', total_due: 300, payment_count: 2 },
     ...
   ]
6. Widget renders:
   "📅 Janeiro 2025: R$ 450 (3 parcelas)"
   "📅 Fevereiro 2025: R$ 450 (3 parcelas)"
   "📅 Março 2025: R$ 300 (2 parcelas)"
7. User clicks month → Expand to show individual installments
```

**Workflow 4: Pay Off Installment Early (Story 2.5)**

```
1. User clicks "Pay Off Early" on installment (5 payments remaining)
2. Confirmation dialog shows:
   - Plan description
   - Remaining amount (5 × 200 = R$ 1,000)
   - What will happen (cancel future payments)
3. User confirms
4. Call payOffInstallment(planId) server action
5. Server calls delete_installment_plan_atomic(userId, planId, 'paid_off')
   a. Verify ownership (user_id match)
   b. UPDATE installment_plans SET status='paid_off'
   c. UPDATE installment_payments SET status='cancelled' WHERE status='pending'
   d. COMMIT transaction
6. Success toast: "Parcelamento quitado! 5 parcelas futuras removidas."
7. Future commitments dashboard updates (5 × 200 removed from totals)
```

**Workflow 5: Delete Installment (Story 2.7)**

```
1. User clicks "Delete" on installment
2. Confirmation dialog warns:
   "⚠️ Deletar parcelamento?
    - Remove o plano permanentemente
    - Cancela 9 parcelas futuras
    - 3 transações pagas permanecem (sem vínculo)
    Esta ação não pode ser desfeita."
3. User confirms deletion
4. Call deleteInstallment(planId, 'cancel') server action
5. Server calls delete_installment_plan_atomic(userId, planId, 'cancel')
   a. Similar to payoff flow
   b. CASCADE DELETE removes installment_payments (ON DELETE CASCADE)
   c. Paid transactions remain (transaction_id set to NULL)
6. Success: "Parcelamento deletado. 9 parcelas futuras removidas."
7. Installments list updates (removes deleted plan)
```

---

## Non-Functional Requirements

### Performance

**NFR-P1: Installment Creation Speed**
- **Target:** < 500ms for creating installment plan + 60 monthly payments
- **Measurement:** Time from server action call to database commit
- **Rationale:** Users expect instant confirmation after entering installment details
- **Implementation:** PostgreSQL RPC function with bulk INSERT for payments

**NFR-P2: Future Commitments Query**
- **Target:** < 200ms for 12-month future commitments aggregation
- **Measurement:** Query execution time for user with 20 active installments
- **Rationale:** Dashboard widget should load quickly (Epic 1 lesson: sub-200ms budget queries)
- **Implementation:** Indexed query on `due_date`, `status` (already created in Epic 1)

**NFR-P3: Budget Calculation with Installments**
- **Target:** < 300ms for budget total including installment payments
- **Measurement:** Combined query time (transactions + installment_payments)
- **Rationale:** Budget widget is high-traffic; Epic 1 established 200ms baseline
- **Implementation:** UNION ALL query with indexed WHERE clauses (Story 2.8)

**NFR-P4: Installments List Page Load**
- **Target:** < 1 second for 100 active + 200 historical installments
- **Measurement:** Time to first render (including pagination)
- **Rationale:** Users may have many completed installments; pagination prevents slowdowns
- **Implementation:** Paginated query (20 per page), sorted by next_payment_date

### Security

**SEC-1: Row-Level Security (RLS) Enforcement**
- **Requirement:** Users can ONLY access their own installment plans and payments
- **Implementation:** RLS policies already enabled in Epic 1 Story 1.1
- **Validation:** Test cross-user access attempts (should return 403 or empty results)

```sql
-- Existing RLS policies (Epic 1)
CREATE POLICY installment_plans_user_policy ON installment_plans
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY installment_payments_user_policy ON installment_payments
  FOR ALL USING (
    plan_id IN (SELECT id FROM installment_plans WHERE user_id = auth.uid())
  );
```

**SEC-2: Input Validation**
- **Requirement:** Prevent invalid installment data (negative amounts, 0 installments, etc.)
- **Implementation:**
  - Database CHECK constraints (Epic 1): `total_installments > 0 AND total_installments <= 60`
  - Frontend validation (Story 2.2): Zod schema with range checks
  - Server action validation (Story 2.0): Reject invalid requests before database call
- **Examples:**
  - ❌ `total_amount = -500` → Reject with error "Amount must be positive"
  - ❌ `total_installments = 0` → Reject with error "At least 1 installment required"
  - ❌ `total_installments = 100` → Reject with error "Maximum 60 installments"

**SEC-3: Payment Method Ownership Verification**
- **Requirement:** Users can ONLY create installments on their own credit cards
- **Implementation:** Server action checks `payment_methods.user_id = auth.uid()` before creating plan
- **Rationale:** Prevent user A from creating installments on user B's card

**SEC-4: Atomic Operations Prevent Partial State**
- **Requirement:** Plan creation/deletion is all-or-nothing (no orphaned records)
- **Implementation:** PostgreSQL RPC functions wrap operations in transactions (Story 2.0)
- **Validation:** Test rollback scenarios (simulate constraint violations)

### Reliability/Availability

**REL-1: Graceful Degradation**
- **Scenario:** PostgreSQL RPC function fails during installment creation
- **Expected Behavior:** User sees clear error message, no partial data created
- **Implementation:** Try-catch in server actions, transaction rollback on error
- **User Message:** "Erro ao criar parcelamento. Tente novamente." (not cryptic DB error)

**REL-2: Data Consistency**
- **Requirement:** Deleting plan MUST remove all child payments (no orphans)
- **Implementation:** `ON DELETE CASCADE` foreign key (Epic 1 schema)
- **Validation:** Test plan deletion, verify installment_payments records removed

**REL-3: Installment Payment Integrity**
- **Requirement:** Payment amounts MUST sum to plan total_amount (within rounding tolerance)
- **Implementation:** Payment amount = `ROUND(total_amount / total_installments, 2)`
- **Edge Case:** R$ 100 / 3 = R$ 33.33, R$ 33.33, R$ 33.34 (last payment absorbs rounding difference)
- **Validation:** Test with amounts that don't divide evenly (e.g., 100 / 3, 1000 / 7)

**REL-4: WhatsApp Bot Error Handling**
- **Scenario:** User sends malformed installment message ("gastei xyz em abc")
- **Expected Behavior:** Bot asks clarifying question, doesn't crash
- **Implementation:** AI extraction with fallback prompts (Story 2.1)
- **User Message:** "Não entendi. Qual foi o valor total da compra?"

### Observability

**OBS-1: Installment Creation Logging**
- **Log Events:**
  - `installment_created` - userId, planId, amount, installments, channel (web/whatsapp)
  - `installment_creation_failed` - userId, error, amount, installments
- **Destination:** PostHog events (fe/lib/analytics/events.ts)
- **Purpose:** Track adoption (how many users create installments), debug failures

**OBS-2: Future Commitments Query Performance**
- **Metrics:** Query execution time, result count, user ID
- **Destination:** PostHog (custom property on `dashboard_viewed` event)
- **Purpose:** Identify slow queries for users with many installments
- **Alert Threshold:** > 500ms for 95th percentile

**OBS-3: Early Payoff Usage Tracking**
- **Log Events:**
  - `installment_paid_off_early` - userId, planId, remaining_amount, remaining_payments
- **Destination:** PostHog
- **Purpose:** Measure feature usage (PRD success metric: early payoff adoption)

**OBS-4: Installment Edit/Delete Patterns**
- **Log Events:**
  - `installment_edited` - userId, planId, fields_changed (description, amount, installments)
  - `installment_deleted` - userId, planId, delete_type (cancel/paid_off), payment_count
- **Purpose:** Understand why users edit/delete (mistakes? changed plans? UX issues?)

**OBS-5: Error Rate Monitoring**
- **Critical Errors to Track:**
  - RPC function failures (atomic transaction errors)
  - Invalid payment method errors (user trying to use non-credit-mode card)
  - Query timeout errors (future commitments taking > 1s)
- **Alert Threshold:** Error rate > 5% of installment creation attempts
- **Destination:** PostHog error tracking + console logs

---

## Dependencies and Integrations

### Internal Dependencies (NexFinApp Components)

**Epic 1 (Credit Mode Foundation) - REQUIRED:**
- ✅ `installment_plans` and `installment_payments` tables (Story 1.1)
- ✅ `payment_methods.credit_mode` flag (Story 1.1)
- ✅ Credit Mode detection in transaction flow (Story 1.2)
- ✅ Simple Mode gating (Story 1.6) - prevents installment prompts for Simple Mode users

**Story 2.0 (Epic 2 Foundation) - BLOCKER for Stories 2.1-2.8:**
- ⚠️ Payment method ID refactoring (transaction form uses UUID, not TEXT)
- ⚠️ Test infrastructure (Jest, React Testing Library)
- ⚠️ Atomic transaction functions (`create_installment_plan_atomic`, `delete_installment_plan_atomic`)

**Epic 3 (Statement-Aware Budgets) - SOFT DEPENDENCY:**
- Story 2.8 (Budget Integration) needs statement period calculation from Epic 3 Story 3.1
- **Workaround:** Story 2.8 can use placeholder statement period logic, refined in Epic 3

### External Dependencies (Third-Party Libraries)

**Frontend (`fe/package.json`):**
```json
{
  "dependencies": {
    "next": "^15.0.0",
    "react": "^19.0.0",
    "react-hook-form": "^7.45.0",
    "zod": "^3.22.0",
    "@radix-ui/react-dialog": "^1.0.5",
    "@radix-ui/react-select": "^2.0.0",
    "date-fns": "^2.30.0",
    "posthog-js": "^1.96.0"
  },
  "devDependencies": {
    "jest": "^29.7.0",
    "@testing-library/react": "^14.0.0",
    "@testing-library/jest-dom": "^6.1.4",
    "@testing-library/user-event": "^14.5.1"
  }
}
```

**WhatsApp Bot (`whatsapp-bot/package.json`):**
```json
{
  "dependencies": {
    "@whiskeysockets/baileys": "^6.5.0",
    "openai": "^4.20.0",
    "date-fns": "^2.30.0"
  },
  "devDependencies": {
    "jest": "^29.7.0",
    "@types/jest": "^29.5.0"
  }
}
```

**Database (`fe/scripts/` migrations):**
- PostgreSQL 14+ (Supabase managed)
- Extensions: `pgvector` (for AI features in Epic 8)

### Integration Points

**Supabase Client (Database Access):**
- Frontend: `createBrowserClient()` for client-side queries
- Server Actions: `createServerClient()` for server-side mutations
- WhatsApp Bot: `createClient()` with service key for full access

**PostHog (Analytics):**
- Frontend: `posthog.capture(event, properties)`
- WhatsApp Bot: Server-side PostHog client
- Events: `installment_created`, `installment_edited`, `installment_deleted`, `installment_paid_off_early`

**OpenAI API (WhatsApp NLP - Story 2.1):**
- Model: GPT-4o-mini
- Function: `extract_installment_details(message)` - parse natural language
- Cost: ~$0.002 per installment creation (500 tokens average)
- Fallback: If AI fails, prompt user for clarification (no blocking error)

**Next-Intl (Localization):**
- Keys: `fe/lib/localization/{pt-br,en}.ts`
- WhatsApp: `whatsapp-bot/src/localization/{pt-br,en}.ts`
- Pattern: All installment messages localized (pt-BR primary, English secondary)

---

## Acceptance Criteria (Authoritative)

Epic 2 delivers 9 stories (2.0 through 2.8). Below are the **authoritative acceptance criteria** extracted from epic definitions and PRD requirements FR13-FR23.

### Story 2.0: Epic 2 Foundation & Blockers

**AC0.1:** Payment method ID refactoring complete
- ✅ `transactions.payment_method_id` is UUID foreign key (not TEXT)
- ✅ Transaction form uses SELECT dropdown with payment method objects
- ✅ Installment fields render conditionally for Credit Mode cards only

**AC0.2:** Test infrastructure set up
- ✅ Jest + React Testing Library configured for frontend
- ✅ Supabase test client (mocks + real test database)
- ✅ Example unit tests passing (70%+ coverage target)

**AC0.3:** Atomic transaction functions implemented
- ✅ `create_installment_plan_atomic()` PostgreSQL function exists
- ✅ `delete_installment_plan_atomic()` PostgreSQL function exists
- ✅ Rollback behavior tested (simulate failures, verify no partial state)

### Story 2.1: Add Installment Purchase (WhatsApp)

**AC1.1:** Natural language parsing
- ✅ "gastei 600 em 3x no celular" → amount=600, installments=3, description="celular"
- ✅ Variations: "comprei 450 em 9x", "800 parcelado 4x", "900 dividido em 6 parcelas"

**AC1.2:** Credit Mode gating
- ✅ Simple Mode users receive message "Ative o Modo Crédito para usar parcelamentos"
- ✅ Credit Mode users proceed to installment creation

**AC1.3:** Installment plan creation
- ✅ Creates `installment_plan` record (status='active')
- ✅ Creates N `installment_payment` records (status='pending')
- ✅ Monthly payment = total_amount / total_installments (rounded to 2 decimals)

**AC1.4:** Confirmation message
- ✅ Shows: Total amount, monthly payment, first and last payment dates
- ✅ Portuguese: "✅ Parcelamento criado: Celular\n💰 Total: R$ 600,00 em 3x de R$ 200,00\n📅 Primeira parcela: Hoje\n📅 Última parcela: Março 2025"

### Story 2.2: Add Installment Purchase (Web Frontend)

**AC2.1:** Form conditional rendering
- ✅ Installment fields visible ONLY when Credit Mode credit card selected
- ✅ Simple Mode cards: No installment toggle shown

**AC2.2:** Form fields
- ✅ Total Amount (R$, required)
- ✅ Number of Installments (1-60 dropdown, required)
- ✅ Monthly Payment (auto-calculated, read-only)
- ✅ First Payment Date (date picker, defaults to today)

**AC2.3:** Real-time calculation
- ✅ Changing installment count updates monthly payment instantly

**AC2.4:** Validation
- ✅ Amount > 0
- ✅ Installments 1-60
- ✅ First payment date required

**AC2.5:** Submission success
- ✅ Creates installment plan + payments atomically
- ✅ Redirects to /installments with success toast
- ✅ Analytics event: `installment_created` with properties

### Story 2.3: Future Commitments Dashboard

**AC3.1:** Monthly breakdown display
- ✅ Shows next 12 months of installment obligations
- ✅ Format: "📅 Janeiro 2025: R$ 450 (3 parcelas)"
- ✅ Sorted chronologically

**AC3.2:** Expandable details
- ✅ Clicking month expands to show individual installments
- ✅ Shows: Description, payment number (3/12), amount

**AC3.3:** Empty state
- ✅ No active installments: "Sem parcelamentos ativos"

**AC3.4:** WhatsApp support
- ✅ User sends "parcelamentos" or "próximas parcelas"
- ✅ Receives text summary of future commitments

### Story 2.4: View All Installments (Active & History)

**AC4.1:** Tabs
- ✅ Active (default), Paid Off, Cancelled

**AC4.2:** Active tab content
- ✅ Description, total amount, monthly payment
- ✅ Progress: "3/12 paid" with progress bar
- ✅ Remaining amount, next payment date
- ✅ Actions: View Details, Pay Off Early, Edit, Delete

**AC4.3:** Details modal
- ✅ Complete payment schedule (all 12 payments)
- ✅ Payment status for each (paid/pending)
- ✅ Transaction links for paid payments
- ✅ Total paid vs remaining

**AC4.4:** Pagination
- ✅ 20 installments per page
- ✅ Load time < 1s for 100 active + 200 historical

### Story 2.5: Mark Installment as Paid Off Early

**AC5.1:** Confirmation dialog
- ✅ Shows remaining amount (5 × 200 = R$ 1,000)
- ✅ Explains: "Marca como quitado, remove 5 parcelas futuras"
- ✅ Buttons: Confirmar Quitação, Cancelar

**AC5.2:** Payoff execution
- ✅ `installment_plan.status = 'paid_off'`
- ✅ `installment_payments` with `status = 'pending'` → `status = 'cancelled'`
- ✅ Atomic operation (all-or-nothing)

**AC5.3:** Success feedback
- ✅ Toast: "Parcelamento quitado! 5 parcelas futuras removidas."
- ✅ Future commitments dashboard updates immediately

**AC5.4:** WhatsApp support
- ✅ User sends "quitar parcelamento [description]"
- ✅ Same confirmation flow via conversational prompts

### Story 2.6: Edit Installment Plan

**AC6.1:** Editable fields
- ✅ Description, category, total amount, installment count, merchant

**AC6.2:** Recalculation
- ✅ Changing amount: Monthly payment recalculates, pending payments updated
- ✅ Changing installment count: Warning "This will add/remove future payments"

**AC6.3:** Past payments unchanged
- ✅ Only `status = 'pending'` payments updated
- ✅ Paid payments remain unchanged

**AC6.4:** Description propagation
- ✅ Updating description updates plan + all linked transaction descriptions

### Story 2.7: Delete Installment Plan

**AC7.1:** Confirmation warning
- ✅ Shows: Plan details, payment counts (paid vs pending)
- ✅ Explains: Removes plan, cancels pending payments, keeps paid transactions
- ✅ "Esta ação não pode ser desfeita."

**AC7.2:** Deletion execution
- ✅ Deletes `installment_plan` (CASCADE deletes `installment_payments`)
- ✅ Paid `transactions` remain, `transaction.installment_payment_id = NULL`

**AC7.3:** Success feedback
- ✅ "Parcelamento deletado. 9 parcelas futuras removidas."
- ✅ Installments list updates (removes deleted plan)

**AC7.4:** WhatsApp support
- ✅ User sends "deletar parcelamento [description]"
- ✅ Same confirmation flow

### Story 2.8: Installment Impact on Budget Tracking

**AC8.1:** Monthly payment counts (not total)
- ✅ User purchases R$ 1,200 in 12x (R$ 100/month)
- ✅ Budget shows R$ 100 spent this month (not R$ 1,200)

**AC8.2:** Statement period integration
- ✅ Budget calculated for statement period (e.g., Dec 6 - Jan 5)
- ✅ Installment payment with `due_date` in period counts toward budget

**AC8.3:** Budget breakdown by category
- ✅ Installment payments categorized by plan's category
- ✅ Shows: "Electronics: R$ 100 (Celular 3/12) + R$ 200 (Notebook 5/8) = R$ 300"

**AC8.4:** Performance
- ✅ Budget calculation (transactions + installments) < 300ms

---

## Traceability Mapping

| AC | Spec Section | Component/API | Test Idea | Epic 1 Lesson Applied |
|----|--------------|---------------|-----------|----------------------|
| **Story 2.0** | | | | |
| AC0.1 | Detailed Design → Data Models | `fe/components/transaction-dialog.tsx`, `fe/lib/actions/transactions.ts` | Test form renders installment fields for Credit Mode only | TD-2 resolution: Form can detect payment method mode |
| AC0.2 | NFR → Observability | `fe/__tests__/`, `jest.config.js` | Run test suite, verify 70%+ coverage | TD-3 resolution: Test infrastructure prevents regression |
| AC0.3 | Detailed Design → APIs | `create_installment_plan_atomic()`, `delete_installment_plan_atomic()` | Test rollback (simulate constraint violation) | TD-1 resolution: Atomic operations prevent partial state |
| **Story 2.1** | | | | |
| AC1.1 | Detailed Design → Workflows | `whatsapp-bot/src/handlers/credit-card/installment-handler.ts` | Test variations: "600 em 3x", "450 parcelado 9 vezes" | Conversation state pattern from Story 1.3 |
| AC1.2 | System Arch → Constraints | Credit Mode gating in handler | Test Simple Mode user receives redirect message | Story 1.6: Simple Mode skips credit features |
| AC1.3 | Detailed Design → APIs | `createInstallment()` server action | Test plan + 12 payments created atomically | Story 1.1: Two-table model ready |
| AC1.4 | NFR → Observability | Localization keys, confirmation message | Verify pt-BR message includes all details | Story 1.3: Localization pattern established |
| **Story 2.2** | | | | |
| AC2.1 | Detailed Design → Workflows | `fe/components/transactions/installment-form.tsx` | Test conditional rendering based on payment method mode | Story 2.0: Payment method object available |
| AC2.2 | Detailed Design → Data Models | Form fields with validation | Test form validation (amount > 0, installments 1-60) | Story 1.4: Form pattern with Radix components |
| AC2.3 | NFR → Performance | Real-time calculation hook | Test monthly payment updates on installment count change | React Hook Form pattern from Story 1.4 |
| AC2.4 | Detailed Design → APIs | Zod schema validation | Test invalid inputs rejected (amount=0, installments=100) | Story 1.4: Server action validation pattern |
| AC2.5 | NFR → Observability | PostHog event tracking | Verify `installment_created` event fires with correct properties | Story 1.4: Analytics pattern established |
| **Story 2.3** | | | | |
| AC3.1 | Detailed Design → APIs | `getFutureCommitments()` server action | Test query returns 12 months of commitments | ADR-001: Future commitments query pattern |
| AC3.2 | Detailed Design → Workflows | `fe/components/dashboard/future-commitments-widget.tsx` | Test expand/collapse behavior | Story 1.4: Interactive UI patterns |
| AC3.3 | NFR → Reliability | Empty state rendering | Test user with no active installments | Story 1.4: Empty state pattern |
| AC3.4 | Detailed Design → APIs | WhatsApp handler for "parcelamentos" message | Test WhatsApp text summary format | Story 1.3: WhatsApp message patterns |
| **Story 2.4** | | | | |
| AC4.1 | Detailed Design → Workflows | Tab navigation component | Test Active/Paid Off/Cancelled tabs | Radix Tabs pattern |
| AC4.2 | Detailed Design → Data Models | `getInstallmentPlans()` query | Test pagination (20 per page), verify < 1s load | NFR-P4: Performance target |
| AC4.3 | Detailed Design → APIs | Details modal with payment schedule | Test modal shows all payments with status | Story 1.5: Dialog pattern with Radix |
| AC4.4 | NFR → Performance | Pagination implementation | Test 100 active + 200 historical loads < 1s | ADR-011: Defer optimization until proven need |
| **Story 2.5** | | | | |
| AC5.1 | Detailed Design → Workflows | Confirmation dialog component | Test dialog shows remaining amount, explains action | Story 1.5: Three-option dialog pattern |
| AC5.2 | Detailed Design → APIs | `payOffInstallment()` → `delete_installment_plan_atomic('paid_off')` | Test atomic update (plan + payments) | Story 2.0: Atomic transaction pattern |
| AC5.3 | NFR → Observability | Success toast, dashboard refresh | Verify future commitments update immediately | PostHog event: `installment_paid_off_early` |
| AC5.4 | Detailed Design → Workflows | WhatsApp conversational payoff flow | Test multi-turn confirmation in WhatsApp | Story 1.3: Conversation state management |
| **Story 2.6** | | | | |
| AC6.1 | Detailed Design → APIs | `updateInstallment()` server action | Test editable fields update correctly | CRUD pattern from Story 1.4 |
| AC6.2 | Detailed Design → Workflows | Recalculation logic | Test amount change: monthly payments recalculated | Frontend real-time calculation pattern |
| AC6.3 | NFR → Reliability | Edit logic constraints | Test paid payments unchanged, only pending updated | Data integrity validation |
| AC6.4 | Detailed Design → Data Models | Description propagation | Test description change updates plan + transactions | Cascade update pattern |
| **Story 2.7** | | | | |
| AC7.1 | Detailed Design → Workflows | Confirmation warning dialog | Test warning shows payment counts, non-reversible notice | Story 1.5: Awareness-first warning pattern |
| AC7.2 | Detailed Design → APIs | `deleteInstallment()` → `delete_installment_plan_atomic('cancel')` | Test CASCADE DELETE removes payments | Story 1.1: ON DELETE CASCADE schema |
| AC7.3 | NFR → Observability | Success feedback | Verify installments list updates, PostHog event fires | `installment_deleted` event tracking |
| AC7.4 | Detailed Design → Workflows | WhatsApp deletion flow | Test conversational confirmation | Story 1.3: Multi-turn conversation pattern |
| **Story 2.8** | | | | |
| AC8.1 | Detailed Design → Workflows | Budget calculation logic | Test R$ 1,200 in 12x → R$ 100 counts this month | ADR-001: Budget period rules |
| AC8.2 | Detailed Design → APIs | Budget integration query (UNION ALL) | Test statement period includes installment payments | Epic 3 Story 3.1: Statement period calculation |
| AC8.3 | NFR → Observability | Budget breakdown UI | Test category shows installment payments with context | Story 3.3: Budget dashboard pattern |
| AC8.4 | NFR → Performance | Query performance | Measure query time < 300ms with 20 installments | NFR-P3: Performance target |

---

## Risks, Assumptions, Open Questions

### Risks

**RISK-1: Epic 3 Dependency for Story 2.8**
- **Description:** Story 2.8 (Budget Integration) needs statement period calculation from Epic 3 Story 3.1
- **Impact:** Story 2.8 cannot be fully completed until Epic 3 starts
- **Likelihood:** High (Epic 3 not started yet)
- **Mitigation:** Implement Story 2.8 with placeholder statement period logic (calendar month), refine in Epic 3
- **Acceptance:** Story 2.8 marked "done" when installment payments appear in budget queries, even if period calculation simplified

**RISK-2: Payment Method ID Refactoring Complexity (Story 2.0)**
- **Description:** Migrating existing transactions from TEXT to UUID is data-heavy operation
- **Impact:** Migration could take hours for 10,000+ transactions, requires downtime
- **Likelihood:** Medium (depending on transaction count)
- **Mitigation:**
  - Run migration during low-traffic window (late night)
  - Test migration on staging database copy first
  - Create rollback script (migration 041_rollback.sql)
- **Acceptance:** Migration completes with zero data loss, all transactions mapped

**RISK-3: Atomic Transaction Performance**
- **Description:** Creating 60 installment payments in single transaction could timeout
- **Impact:** Users cannot create long-term installments (e.g., car purchase in 60x)
- **Likelihood:** Low (PostgreSQL handles 60 INSERTs efficiently)
- **Mitigation:** Test with 60 installments before Story 2.1 release, add timeout monitoring
- **Acceptance:** 60-installment creation completes < 500ms (NFR-P1)

**RISK-4: Test Infrastructure Setup Delays Story 2.0**
- **Description:** Jest + React Testing Library configuration can be tricky with Next.js 15
- **Impact:** Story 2.0 takes longer than estimated (3-5 days → 5-7 days)
- **Likelihood:** Medium (brownfield project, existing config may conflict)
- **Mitigation:**
  - Timebox test setup to 1 day
  - Use Next.js 15 official testing docs
  - Defer CI pipeline setup if needed (Story 2.0 AC focuses on local tests)
- **Acceptance:** Example tests run locally, 70%+ coverage achieved

**RISK-5: WhatsApp NLP Installment Parsing Accuracy**
- **Description:** AI may misinterpret natural language (e.g., "gastei 600 em 3x" vs "gastei 600 e 3 reais")
- **Impact:** Incorrect installments created, user frustration
- **Likelihood:** Low (GPT-4o-mini is robust, Epic 8 AI testing framework validates)
- **Mitigation:**
  - AI asks clarifying questions when uncertain (Epic 8 pattern)
  - Show preview before confirming: "Vou criar 3x de R$ 200. Confirma?"
  - Easy edit/delete (Stories 2.6, 2.7)
- **Acceptance:** 95%+ accuracy on common installment phrases (validated in Epic 8 tests)

### Assumptions

**ASSUME-1: Epic 1 Complete and Stable**
- **Assumption:** All Epic 1 stories (1.1-1.6) are done, database schema exists, Credit Mode works
- **Validation:** Sprint status shows Epic 1 stories marked "done" ✅
- **Impact if False:** Epic 2 cannot start (blocker dependency)

**ASSUME-2: Users Understand Parcelamento Concept**
- **Assumption:** Brazilian users are familiar with "compra parcelada" and installment payments
- **Validation:** PRD user research (cultural knowledge)
- **Impact if False:** Need more onboarding/education (Epic 5: AI Helper can teach)

**ASSUME-3: Simple Mode Users Don't Want Installments**
- **Assumption:** Users who chose Simple Mode explicitly don't want installment tracking
- **Validation:** Epic 1 Story 1.3 design decision (opt-in model)
- **Impact if False:** Some Simple Mode users may switch to Credit Mode to use installments

**ASSUME-4: Monthly Budget Calculation Can Use Placeholder Period**
- **Assumption:** Story 2.8 can use calendar month as budget period until Epic 3 delivers statement periods
- **Validation:** Story 2.8 AC8.2 notes Epic 3 dependency
- **Impact if False:** Story 2.8 must wait for Epic 3 (delays Epic 2 completion)

**ASSUME-5: 60 Installments is Sufficient Maximum**
- **Assumption:** No real-world purchase requires > 60 monthly payments (5 years)
- **Validation:** Database CHECK constraint: `total_installments <= 60`
- **Impact if False:** Users request higher limit (can adjust constraint, but rare)

### Open Questions

**QUESTION-1: How to Handle Installment Rounding Edge Cases?**
- **Question:** R$ 100 / 3 = R$ 33.33 × 3 = R$ 99.99. Last payment R$ 33.33 or R$ 33.34?
- **Options:**
  - A) Last payment absorbs rounding difference (R$ 33.34)
  - B) Distribute rounding across payments (R$ 33.34, R$ 33.33, R$ 33.33)
- **Recommendation:** Option A (simpler, matches credit card bill behavior)
- **Decision Needed:** Story 2.1 implementation (before creating payment logic)

**QUESTION-2: Should Deleting Installment Remove Paid Transactions?**
- **Question:** User deletes installment plan with 3 payments already made. Keep or delete those transactions?
- **Current Design:** Keep paid transactions (orphaned), set `installment_payment_id = NULL`
- **Rationale:** Users need historical record of what they spent
- **Validation Needed:** UX test with real users (can revisit in Epic 2 retrospective)

**QUESTION-3: Future Commitments Dashboard - Show Paid Installments?**
- **Question:** Future commitments shows only `status = 'pending'`. Should it also show completed plans for context?
- **Options:**
  - A) Only pending (current design) - "what I owe"
  - B) Include paid (last 3 months) for context - "what I paid recently"
- **Recommendation:** Option A for MVP (Story 2.3), Option B as enhancement if users request
- **Decision Needed:** Story 2.3 implementation

**QUESTION-4: WhatsApp Installment Creation - Require Category?**
- **Question:** Web form has category dropdown. Should WhatsApp also require category before creating?
- **Current Design:** Category is optional (can add later via edit)
- **Trade-off:** Friction (multi-turn conversation) vs data completeness
- **Recommendation:** Make optional for MVP, suggest category if AI can infer (e.g., "celular" → Eletrônicos)
- **Decision Needed:** Story 2.1 implementation

**QUESTION-5: Test Coverage Target - 70% or 90%?**
- **Question:** Story 2.0 sets 70% coverage target. Is this enough for complex installment logic?
- **Epic 1 Lesson:** Story 1.5 had 0% coverage, required significant fixes
- **Recommendation:** 80% target for Epic 2 (stricter than Story 2.0 baseline)
- **Decision Needed:** Story 2.0 completion criteria

---

## Test Strategy Summary

### Test Levels

**Unit Tests (70-80% coverage target):**
- **Scope:** Individual functions, server actions, utility logic
- **Framework:** Jest (frontend + WhatsApp bot)
- **Focus Areas:**
  - Installment calculation logic (amount / installments, rounding)
  - Payment date generation (first payment + N months)
  - Validation logic (installments 1-60, amount > 0)
  - Budget query logic (transactions + installment payments)

**Component Tests (Frontend):**
- **Scope:** React components with user interactions
- **Framework:** React Testing Library + Jest
- **Focus Areas:**
  - InstallmentForm conditional rendering (Credit Mode vs Simple Mode)
  - FutureCommitmentsWidget data display
  - Installment details modal
  - Edit/Delete confirmation dialogs

**Integration Tests:**
- **Scope:** End-to-end flows (form submit → database → UI update)
- **Framework:** Playwright or Cypress (TBD in Story 2.0)
- **Focus Areas:**
  - Create installment (web) → verify plan + payments in database
  - Pay off installment → verify status updates, future commitments refresh
  - Delete installment → verify CASCADE delete, paid transactions preserved

**API Tests (Server Actions):**
- **Scope:** Server actions with real Supabase test database
- **Framework:** Jest with Supabase test client
- **Focus Areas:**
  - `createInstallment()` atomic behavior (rollback on error)
  - `getFutureCommitments()` query correctness
  - `payOffInstallment()` cascade updates
  - RLS policy enforcement (cross-user access denied)

**WhatsApp Bot Tests:**
- **Scope:** Message handlers, NLP extraction
- **Framework:** Jest (existing test suite from Epic 1)
- **Focus Areas:**
  - Natural language parsing ("600 em 3x" → {amount: 600, installments: 3})
  - Conversation state management (multi-turn prompts)
  - AI fallback behavior (malformed messages)

### Test Coverage by Story

| Story | Unit Tests | Component Tests | Integration Tests | API Tests | Coverage Target |
|-------|-----------|----------------|-------------------|-----------|-----------------|
| 2.0 | ✅ Payment method ID, atomic functions | ✅ Transaction form conditional rendering | ✅ Form submit → database | ✅ Server actions | 70% |
| 2.1 | ✅ NLP extraction, calculation logic | N/A (WhatsApp) | ✅ WhatsApp message → database | ✅ Installment handler | 75% |
| 2.2 | ✅ Validation, calculation | ✅ InstallmentForm | ✅ Form submit → redirect | ✅ createInstallment() | 80% |
| 2.3 | ✅ Future commitments query | ✅ FutureCommitmentsWidget | ✅ Dashboard load → data | ✅ getFutureCommitments() | 75% |
| 2.4 | ✅ Pagination logic | ✅ InstallmentsList | ✅ Tab navigation | ✅ getInstallmentPlans() | 75% |
| 2.5 | ✅ Payoff logic | ✅ Payoff confirmation dialog | ✅ Payoff → database update | ✅ payOffInstallment() | 80% |
| 2.6 | ✅ Recalculation logic | ✅ Edit form | ✅ Edit → payments updated | ✅ updateInstallment() | 75% |
| 2.7 | ✅ Deletion logic | ✅ Delete confirmation dialog | ✅ Delete → cascade verified | ✅ deleteInstallment() | 80% |
| 2.8 | ✅ Budget query logic | ✅ Budget widget with installments | ✅ Budget calculation correctness | ✅ Budget query | 75% |

**Average Coverage Target:** 77% (exceeds Story 2.0 baseline of 70%)

### Edge Cases to Test

**Installment Creation:**
- ✅ Amount that doesn't divide evenly (R$ 100 / 3 = R$ 33.33, R$ 33.33, R$ 33.34)
- ✅ Maximum installments (60) - performance test
- ✅ Minimum installments (1) - should still create plan
- ✅ First payment date in past (should warn or adjust)
- ✅ Credit card with credit_mode = false (should reject)

**Future Commitments:**
- ✅ User with 0 active installments (empty state)
- ✅ User with 20 active installments (performance test)
- ✅ Installment spanning 12+ months (should show all future months)
- ✅ Multiple installments due same month (aggregation correctness)

**Early Payoff:**
- ✅ Pay off with 1 payment remaining (edge case)
- ✅ Pay off with all payments pending (new installment)
- ✅ Pay off with all payments paid (invalid - should reject)

**Deletion:**
- ✅ Delete with 0 paid payments (simple delete)
- ✅ Delete with some paid, some pending (orphan transactions)
- ✅ Delete with all paid (historical record preserved)

**Budget Integration:**
- ✅ Installment payment on statement boundary (which period?)
- ✅ Multiple installments in same statement period (sum correctly)
- ✅ User with mix of regular transactions + installment payments (combined total)

### Performance Tests

**Load Time Targets:**
- ✅ Create 60-installment plan < 500ms (NFR-P1)
- ✅ Future commitments query (20 installments) < 200ms (NFR-P2)
- ✅ Budget calculation with installments < 300ms (NFR-P3)
- ✅ Installments list page (100 active) < 1s (NFR-P4)

### Regression Prevention

**Epic 1 Lessons Applied:**
- ✅ Code review required before merge (Story 1.5 lesson)
- ✅ Test coverage enforced (Story 1.5 had 0% coverage)
- ✅ Atomic operations tested (Story 1.5 TD-1)
- ✅ Cross-channel consistency validated (Stories 1.3 & 1.4)

**Test Automation:**
- ✅ Jest runs on every commit (local development)
- ✅ CI pipeline (optional in Story 2.0, recommended for Epic 2)
- ✅ Coverage reports generated (`npm run test:coverage`)
- ✅ Failed tests block merge (if CI enabled)

---

**End of Technical Specification - Epic 2: Parcelamento Intelligence**

**Next Steps:**
1. ✅ Mark Epic 2 as "contexted" in sprint-status.yaml
2. Create Story 2.0 context (run `story-context` workflow)
3. Implement Story 2.0 (Foundation & Blockers)
4. Draft Story 2.1 after Story 2.0 completes

**Architect Sign-Off:** Liam (Architect AI)
**Date:** 2025-12-02
**Status:** Ready for Implementation
