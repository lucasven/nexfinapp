# Epic Technical Specification: Statement-Aware Budgets

Date: 2025-12-03
Author: Lucas
Epic ID: 3
Status: Draft

---

## Overview

Epic 3 (Statement-Aware Budgets) delivers a critical user experience improvement for Credit Mode users by aligning budget tracking with credit card billing cycles rather than arbitrary calendar months. This epic recognizes that credit card users think in terms of statement periods ("what am I paying this month?") rather than calendar boundaries.

The core innovation is enabling users to set **personal monthly budgets** separate from bank credit limits, tracked against **statement period spending** (e.g., closing day 5th = budget period from 6th of previous month to 5th of current month). Combined with pre-closing reminders and awareness-first language, this creates clarity on credit card usage without judgment or pressure.

## Objectives and Scope

**In Scope:**
- Set and store statement closing date per credit card (1-31, with edge case handling for Feb 31 → Feb 28/29)
- Set and modify user-defined monthly budget per credit card (separate from bank credit limit)
- Calculate and display budget progress for current statement period (spent, remaining, percentage)
- Send WhatsApp reminders 3 days before statement closing with current total
- Generate pre-statement category breakdown summaries
- Distinguish transactions as "current statement" vs "next statement" in UI
- Use awareness-first language when budget exceeded ("R$ 200 acima do planejado" not "OVERSPENT!")
- Apply budgets only to Credit Mode payment methods (Simple Mode uses calendar month budgets)

**Out of Scope:**
- Multi-card consolidated budgets (single-card focus for MVP)
- Predictive spending projections ("at this pace, you'll spend R$ X")
- Budget alerts mid-period (only pre-closing reminders in this epic)
- Category-level budgets within credit cards (tracked globally, not per-category)
- Historical budget vs actual analysis (post-MVP analytics feature)
- Integration with bank credit limit APIs (manual budget entry only)

## System Architecture Alignment

This epic extends the existing NexFinApp multi-service architecture established in Epic 1 (Credit Mode Foundation):

**Frontend (Next.js 15):**
- Extends payment method settings UI with statement/budget configuration
- Adds dashboard widgets for statement-period budget tracking
- Implements statement badge components for transaction lists
- Server actions handle budget/statement date updates with RLS enforcement

**WhatsApp Bot (Node.js):**
- Scheduler service for daily statement reminder job (9 AM local time)
- Conversational handlers for "resumo da fatura" and budget queries
- Leverages existing multi-identifier authorization system

**Database (Supabase PostgreSQL):**
- Uses `payment_methods` columns added in Epic 1: `statement_closing_day`, `monthly_budget`
- Statement period calculation as PostgreSQL function for consistency
- Budget queries leverage existing RLS policies (user_id filtering)

**Constraints Respected:**
- Brownfield integration: No breaking changes to existing expense tracking
- Simple Mode backward compatibility: Statement features only for `credit_mode = true`
- Shared category system: Budget breakdowns use existing categories table
- PostHog analytics: Track budget adoption, statement reminder engagement

## Detailed Design

### Services and Modules

| Service/Module | Responsibility | Inputs | Outputs | Owner |
|----------------|----------------|--------|---------|-------|
| **StatementService** | Calculate statement periods, validate closing dates | `payment_method_id`, `closing_day`, `reference_date` | Statement period boundaries (start_date, end_date), next closing date | Backend (shared) |
| **BudgetService** | Calculate budget progress, compare spent vs budget | `payment_method_id`, `statement_period` | Spent amount, remaining, percentage, status (on-track/exceeded) | Backend (shared) |
| **StatementReminderScheduler** | Daily job to send WhatsApp reminders 3 days before closing | None (cron trigger) | WhatsApp messages to eligible users | WhatsApp Bot |
| **StatementSettingsUI** | Frontend component for setting closing date and budget | User input (closing_day, monthly_budget) | Updated payment_method record | Frontend |
| **BudgetDashboardWidget** | Real-time budget progress visualization | `payment_method_id` | Budget widget with progress bar, spent/remaining amounts | Frontend |
| **StatementBadgeComponent** | Display "current statement" vs "next statement" labels | `transaction.date`, `statement_period` | Badge UI element | Frontend |
| **StatementSummaryHandler** | WhatsApp conversational handler for "resumo da fatura" | User message, user_id | Category breakdown for current statement | WhatsApp Bot |
| **BudgetCalculationFunction** | PostgreSQL function for consistent budget queries | `user_id`, `payment_method_id`, `start_date`, `end_date` | Total spent in statement period | Database |

### Data Models and Contracts

**Extended Payment Methods Schema (from Epic 1):**

```sql
-- Already exists from Story 1.1, used by Epic 3
ALTER TABLE payment_methods
  ADD COLUMN statement_closing_day INTEGER CHECK (statement_closing_day BETWEEN 1 AND 31),
  ADD COLUMN monthly_budget DECIMAL(10,2);
```

**Statement Period Calculation Function:**

```sql
CREATE OR REPLACE FUNCTION calculate_statement_period(
  p_closing_day INTEGER,
  p_reference_date DATE DEFAULT CURRENT_DATE
) RETURNS TABLE(period_start DATE, period_end DATE, next_closing DATE) AS $$
DECLARE
  current_month_closing DATE;
  prev_month_closing DATE;
BEGIN
  -- Handle edge case: Feb 31 → Feb 28/29
  current_month_closing := make_date(
    EXTRACT(YEAR FROM p_reference_date)::INTEGER,
    EXTRACT(MONTH FROM p_reference_date)::INTEGER,
    LEAST(p_closing_day, EXTRACT(DAY FROM (date_trunc('month', p_reference_date) + INTERVAL '1 month' - INTERVAL '1 day'))::INTEGER)
  );

  -- Calculate previous month closing
  prev_month_closing := make_date(
    EXTRACT(YEAR FROM (p_reference_date - INTERVAL '1 month'))::INTEGER,
    EXTRACT(MONTH FROM (p_reference_date - INTERVAL '1 month'))::INTEGER,
    LEAST(p_closing_day, EXTRACT(DAY FROM (date_trunc('month', p_reference_date - INTERVAL '1 month') + INTERVAL '1 month' - INTERVAL '1 day'))::INTEGER)
  );

  -- Determine period boundaries
  IF p_reference_date <= current_month_closing THEN
    -- Current period: prev_month_closing+1 to current_month_closing
    RETURN QUERY SELECT
      (prev_month_closing + INTERVAL '1 day')::DATE,
      current_month_closing,
      current_month_closing;
  ELSE
    -- Next period: current_month_closing+1 to next_month_closing
    RETURN QUERY SELECT
      (current_month_closing + INTERVAL '1 day')::DATE,
      (current_month_closing + INTERVAL '1 month')::DATE,
      (current_month_closing + INTERVAL '1 month')::DATE;
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;
```

**Budget Progress View:**

```typescript
// TypeScript interface for budget data
interface BudgetProgress {
  paymentMethodId: string
  paymentMethodName: string
  monthlyBudget: number
  spentAmount: number
  remainingAmount: number
  percentageUsed: number
  status: 'on-track' | 'near-limit' | 'exceeded'
  periodStart: Date
  periodEnd: Date
  daysUntilClosing: number
}
```

**Statement Summary Response:**

```typescript
interface StatementSummary {
  paymentMethodName: string
  periodStart: Date
  periodEnd: Date
  totalSpent: number
  monthlyBudget: number | null
  budgetPercentage: number | null
  categoryBreakdown: Array<{
    categoryName: string
    categoryIcon: string
    amount: number
    percentage: number
    transactionCount: number
    includesInstallments: boolean
    installmentDetails?: Array<{
      description: string
      currentInstallment: number
      totalInstallments: number
      amount: number
    }>
  }>
}
```

### APIs and Interfaces

**Frontend Server Actions:**

```typescript
// fe/lib/actions/payment-methods.ts

export async function updateStatementSettings(
  paymentMethodId: string,
  closingDay: number
): Promise<{ success: boolean; error?: string }>

export async function setMonthlyBudget(
  paymentMethodId: string,
  budget: number | null
): Promise<{ success: boolean; error?: string }>

export async function getBudgetProgress(
  paymentMethodId: string
): Promise<BudgetProgress | null>

export async function getStatementSummary(
  paymentMethodId: string
): Promise<StatementSummary | null>
```

**WhatsApp Bot Handlers:**

```typescript
// whatsapp-bot/src/handlers/credit-card/statement-summary.ts

export async function handleStatementSummaryRequest(
  userId: string,
  paymentMethodId: string | null,
  locale: string
): Promise<string> // Returns formatted message

// whatsapp-bot/src/handlers/credit-card/budget-status.ts

export async function handleBudgetStatusRequest(
  userId: string,
  paymentMethodId: string | null,
  locale: string
): Promise<string> // Returns budget progress message
```

**Database RPC Functions:**

```sql
-- Get statement period for payment method
CREATE OR REPLACE FUNCTION get_statement_period(
  p_payment_method_id UUID,
  p_reference_date DATE DEFAULT CURRENT_DATE
) RETURNS TABLE(period_start DATE, period_end DATE) AS $$
  SELECT
    (calculate_statement_period(pm.statement_closing_day, p_reference_date)).period_start,
    (calculate_statement_period(pm.statement_closing_day, p_reference_date)).period_end
  FROM payment_methods pm
  WHERE pm.id = p_payment_method_id;
$$ LANGUAGE SQL;

-- Calculate budget spent for statement period
CREATE OR REPLACE FUNCTION calculate_statement_budget_spent(
  p_payment_method_id UUID,
  p_user_id UUID,
  p_start_date DATE,
  p_end_date DATE
) RETURNS DECIMAL(10,2) AS $$
  SELECT COALESCE(SUM(t.amount), 0)
  FROM transactions t
  WHERE t.user_id = p_user_id
    AND t.payment_method_id = p_payment_method_id
    AND t.date >= p_start_date
    AND t.date <= p_end_date
    AND t.type = 'expense';
$$ LANGUAGE SQL;
```

**REST Endpoints (for mobile app future):**

```
GET  /api/payment-methods/:id/budget-progress
GET  /api/payment-methods/:id/statement-summary
POST /api/payment-methods/:id/statement-settings
POST /api/payment-methods/:id/budget
```

### Workflows and Sequencing

**Workflow 1: Set Statement Closing Date (Story 3.1)**

```
User → Frontend Settings Page → Server Action
  1. User navigates to credit card settings
  2. User selects closing day (1-31 dropdown)
  3. Frontend shows preview: "Current period: Nov 16 - Dec 15"
  4. User clicks Save
  5. Server Action validates closing_day (1-31)
  6. Update payment_methods.statement_closing_day
  7. Return success + calculated next closing date
  8. Frontend shows toast: "Statement closing date set to day 15"
```

**Workflow 2: Set Monthly Budget (Story 3.2)**

```
User → Budget Settings → Database
  1. User enters budget amount (e.g., R$ 2,000)
  2. System validates amount > 0
  3. Update payment_methods.monthly_budget
  4. Immediately recalculate budget progress for current period
  5. Dashboard widget updates in real-time
  6. PostHog event: budget_set (amount, payment_method_id)
```

**Workflow 3: View Budget Progress (Story 3.3)**

```
Dashboard Load → BudgetService → Display
  1. Frontend requests budget progress for all Credit Mode cards
  2. For each card:
     a. Get statement_closing_day and monthly_budget
     b. Calculate current statement period (via calculate_statement_period)
     c. Query transactions WHERE date IN period AND payment_method_id = card.id
     d. Sum transaction amounts = spent
     e. Calculate remaining = budget - spent
     f. Calculate percentage = (spent / budget) * 100
     g. Determine status: on-track (<80%), near-limit (80-100%), exceeded (>100%)
  3. Return BudgetProgress object
  4. Frontend renders widget with progress bar
  5. Apply awareness-first language based on status
```

**Workflow 4: Daily Statement Reminder Job (Story 3.4)**

```
Cron (9 AM daily) → Scheduler → WhatsApp Delivery
  1. Query: SELECT users + payment_methods WHERE credit_mode = true AND statement_closing_day IS NOT NULL
  2. For each payment method:
     a. Calculate days_until_closing = closing_date - CURRENT_DATE
     b. IF days_until_closing = 3:
        i.   Get user WhatsApp identifiers (JID/LID/phone)
        ii.  Calculate statement period
        iii. Query spent amount for current period
        iv.  Get monthly_budget (if set)
        v.   Format reminder message (localized pt-BR or en)
        vi.  Send via Baileys WhatsApp client
        vii. Log reminder delivery (success/failure)
        viii. PostHog event: statement_reminder_sent
  3. Handle failures with exponential backoff retry (max 3 attempts)
  4. Alert if delivery success rate < 99%
```

**Workflow 5: Statement Summary Request (Story 3.5)**

```
User WhatsApp Message → Handler → Response
  1. User sends "resumo da fatura" or "statement summary"
  2. AI/NLP detects intent: view_statement_summary
  3. If multiple credit cards: Ask "Qual cartão?"
  4. Identify payment_method_id
  5. Calculate current statement period
  6. Query transactions in period, group by category
  7. Join with installment_payments to show "Celular 3/12" context
  8. Calculate category percentages
  9. Format message:
     - Period dates
     - Total spent
     - Budget status (if set)
     - Category breakdown with percentages
     - Installment payment details
  10. Send formatted message
  11. PostHog event: statement_summary_viewed (source=whatsapp)
```

**Workflow 6: Transaction Badge Display (Story 3.6)**

```
Transaction List Render → Badge Calculation → UI Display
  1. For each transaction with credit card payment method:
     a. Get statement_closing_day from payment_method
     b. Calculate current statement period
     c. IF transaction.date IN current_period:
        - Badge: "Fatura atual" (blue)
     d. ELSE IF transaction.date IN next_period:
        - Badge: "Próxima fatura" (gray)
     e. ELSE:
        - Badge: "Fatura passada" (light gray)
  2. Render badge next to transaction amount
  3. On mobile: Abbreviated badge to save space
```

## Non-Functional Requirements

### Performance

| ID | Requirement | Target | Rationale |
|----|-------------|--------|-----------|
| **NFR5** | Budget progress calculation time | < 200ms | Displayed on every expense add—critical path operation (from PRD) |
| **NFR6** | Statement reminder job execution | < 30 seconds for all users | Daily cron job must complete reliably (from PRD) |
| **Epic3-P1** | Statement period calculation | < 50ms | Called frequently for badge rendering, must be instantaneous |
| **Epic3-P2** | Statement summary query | < 500ms | Complex aggregation with category grouping, acceptable for on-demand request |
| **Epic3-P3** | Dashboard budget widget load | < 300ms | Multiple widgets may load concurrently, must not block UI |
| **Epic3-P4** | Transaction badge rendering | < 100ms for 50 transactions | Badge calculation must not slow down transaction list rendering |

### Security

| ID | Requirement | Implementation | Rationale |
|----|-------------|----------------|-----------|
| **Epic3-S1** | Budget data access control | RLS policies filter by `user_id = auth.uid()` | Users must only see their own budget data |
| **Epic3-S2** | Statement settings modification | Server actions verify ownership before update | Prevent unauthorized budget/closing date changes |
| **Epic3-S3** | WhatsApp reminder authorization | Use multi-identifier lookup system from Epic 1 | Only send reminders to authorized WhatsApp numbers |
| **Epic3-S4** | Budget amount validation | Enforce `monthly_budget >= 0`, no upper limit | Prevent negative budgets, allow any positive amount |
| **Epic3-S5** | Closing day validation | CHECK constraint: `1 <= statement_closing_day <= 31` | Prevent invalid dates at database level |

### Reliability/Availability

| ID | Requirement | Target | Implementation |
|----|-------------|--------|----------------|
| **NFR8** | Reminder delivery success rate | 99.5% | Missed reminders damage trust (from PRD) |
| **Epic3-R1** | Statement period calculation accuracy | 100% correct for all edge cases | Feb 31 → Feb 28/29, leap years, month boundaries |
| **Epic3-R2** | Budget calculation consistency | Same result across web and WhatsApp | Shared PostgreSQL function ensures consistency |
| **Epic3-R3** | Reminder job failure handling | Retry with exponential backoff (max 3 attempts) | Transient WhatsApp API failures should not lose reminders |
| **Epic3-R4** | Budget widget failover | Show "Unable to load" message, don't crash page | Budget calculation errors should not break dashboard |
| **Epic3-R5** | Closing date edge case handling | Gracefully handle Feb 31, day 30/31 in shorter months | Application logic adjusts to last valid day of month |

### Observability

| ID | Requirement | Signals | Rationale |
|----|-------------|---------|-----------|
| **NFR27** | Reminder delivery logging | Success/failure per user (from PRD) | Identify WhatsApp delivery issues |
| **Epic3-O1** | Budget calculation performance tracking | Log execution time for budget queries > 200ms | Detect performance degradation as transaction volume grows |
| **Epic3-O2** | Statement reminder job metrics | Count: sent, failed, retried, skipped (opted-out) | Monitor job health, delivery success rate |
| **Epic3-O3** | Budget adoption tracking | PostHog events: `budget_set`, `budget_viewed`, `budget_exceeded` | Measure feature adoption and user behavior |
| **Epic3-O4** | Statement summary usage | PostHog event: `statement_summary_viewed` (source: web/whatsapp) | Track feature usage across platforms |
| **Epic3-O5** | Budget status alerts | Alert if > 5% of budget calculations fail | Early warning for database or query issues |
| **Epic3-O6** | Reminder opt-out rate tracking | Track users who disable statement reminders | Understand if reminders are too frequent or unwanted |

## Dependencies and Integrations

**Epic 3 leverages existing dependencies from the brownfield codebase and Epic 1. No new external dependencies required.**

### Frontend Dependencies (fe/package.json)

| Dependency | Version | Purpose in Epic 3 |
|------------|---------|-------------------|
| `next` | 15.x | Server actions for budget/statement settings updates |
| `react` | 19.x | Budget widget components, statement badge components |
| `@supabase/supabase-js` | latest | Database queries for budget calculations, RLS enforcement |
| `next-intl` | latest | Localization for budget messages (pt-BR/en) |
| `react-hook-form` | latest | Statement settings form validation |
| `zod` | latest | Budget amount validation schemas |
| `posthog-js` | latest | Track budget adoption, statement reminder engagement |
| `@radix-ui/react-*` | latest | UI components for budget widgets, settings dialogs |
| `tailwindcss` | 4.x | Styling for budget progress bars, status badges |

### WhatsApp Bot Dependencies (whatsapp-bot/package.json)

| Dependency | Version | Purpose in Epic 3 |
|------------|---------|-------------------|
| `@supabase/supabase-js` | latest | Budget queries, statement period calculations |
| `node-cron` | latest | **NEW USAGE**: Daily statement reminder scheduler (9 AM job) |
| `@whiskeysockets/baileys` | latest | Send WhatsApp reminder messages |
| Localization files | N/A | Statement reminder message templates (pt-BR/en) |

**Note:** `node-cron` already exists in dependencies (used for recurring transactions), Epic 3 adds new cron job for statement reminders.

### Database Dependencies

| Component | Purpose |
|-----------|---------|
| PostgreSQL 15+ | Statement period calculation functions, budget queries |
| Supabase RLS | User-level budget data isolation |
| Existing indexes | `transactions(user_id, payment_method_id, date)` supports budget queries |

### Integration Points

**From Epic 1 (Credit Mode Foundation):**
- Uses `payment_methods.statement_closing_day` and `monthly_budget` columns
- Respects `credit_mode = true` filter for all statement/budget features
- Leverages multi-identifier WhatsApp authorization for reminders

**From Epic 2 (Parcelamento Intelligence):**
- Budget calculations include installment payment amounts
- Statement summary shows installment context ("Celular 3/12")
- Installment payments counted in statement period totals

**External Services:**
- PostHog: Budget adoption analytics, statement reminder engagement tracking
- Supabase Auth: User authentication for budget data access
- WhatsApp API (Baileys): Statement reminder delivery

**No New External APIs or Services Required**

## Acceptance Criteria (Authoritative)

These acceptance criteria define the complete scope of Epic 3. All must pass for epic completion.

### AC1: Statement Closing Date Configuration (Story 3.1)

**Given** a Credit Mode user
**When** they access credit card settings
**Then** they can set statement closing day (1-31)
**And** system handles edge cases (Feb 31 → Feb 28/29, months with < 31 days)
**And** displays preview of current statement period
**And** stores `payment_methods.statement_closing_day`

### AC2: Monthly Budget Configuration (Story 3.2)

**Given** a Credit Mode user with statement closing date set
**When** they set monthly budget amount
**Then** budget amount stored in `payment_methods.monthly_budget`
**And** budget amount validates >= 0 (no upper limit)
**And** budget applies to statement period (not calendar month)
**And** user can update budget at any time with immediate effect

### AC3: Budget Progress Display (Story 3.3)

**Given** Credit Mode user with budget set
**When** viewing dashboard
**Then** budget widget displays:
- Current statement period dates
- Spent amount vs budget amount
- Remaining amount or overage
- Percentage used
- Progress bar visualization
- Days until statement closing
- Awareness-first language ("acima do planejado" not "OVERSPENT!")
**And** calculations complete in < 200ms
**And** includes installment payments in total
**And** colors are neutral (no red for overspending)

### AC4: Statement Closing Reminders (Story 3.4)

**Given** Credit Mode user with `statement_closing_day` set
**When** 3 days before closing date
**Then** WhatsApp reminder sent at 9 AM local time
**And** message includes:
- Statement closing date
- Current statement total
- Budget status (if budget set)
- Awareness-first tone
**And** delivery success rate >= 99.5%
**And** retry logic handles failures (max 3 attempts)
**And** PostHog event logged: `statement_reminder_sent`

### AC5: Pre-Statement Category Summary (Story 3.5)

**Given** Credit Mode user
**When** user requests "resumo da fatura" (WhatsApp) OR clicks "Statement Summary" (web)
**Then** system displays:
- Statement period dates
- Total spent
- Budget status
- Category breakdown with amounts and percentages
- Installment context ("Celular 3/12 - R$ 200")
- Transaction count per category
**And** query completes in < 500ms
**And** localized in user's language (pt-BR or en)

### AC6: Current vs Next Statement Distinction (Story 3.6)

**Given** transactions on credit card
**When** viewing transaction list
**Then** each transaction displays badge:
- "Fatura atual" (blue) if date in current statement period
- "Próxima fatura" (gray) if date in next statement period
- "Fatura passada" (light gray) if date in past statement
**And** badge calculation completes in < 100ms for 50 transactions
**And** mobile view shows abbreviated badges

### AC7: Awareness-First Language (Cross-Cutting, FR37-42)

**Given** any Epic 3 feature
**When** displaying budget status or messages
**Then** language is neutral and non-judgmental:
- "R$ 200 acima do planejado" NOT "OVERSPENT!"
- "Sobraram R$ 550" NOT "You have R$ 550 left"
- "No caminho certo" NOT "Good job!"
- "Heads up" NOT "WARNING"
**And** no red colors for overspending (use neutral blues/grays)
**And** celebrates on-track status positively without pressure

### AC8: Simple Mode Compatibility (FR6, Story 1.6)

**Given** user with `credit_mode = false` (Simple Mode)
**When** using credit card
**Then** NO statement period features displayed
**And** NO budget aligned to statement periods
**And** existing calendar-month tracking works unchanged
**And** zero impact on Simple Mode performance

## Traceability Mapping

| AC | Spec Section | Components/APIs | Test Idea |
|----|--------------|-----------------|-----------|
| **AC1** | Data Models: Statement Period Function | `StatementSettingsUI`, `updateStatementSettings()`, `calculate_statement_period()` | Unit test edge cases: Feb 31, leap years, day 30 in Feb; E2E test setting closing day 5, verify period calculation |
| **AC2** | APIs: setMonthlyBudget | `BudgetSettingsForm`, `setMonthlyBudget()`, `payment_methods.monthly_budget` | Unit test validation (negative budget rejected); Integration test budget update reflects immediately |
| **AC3** | Services: BudgetService, Workflows: View Budget Progress | `BudgetDashboardWidget`, `getBudgetProgress()`, `calculate_statement_budget_spent()` | Performance test: < 200ms for 1000 transactions; UI test: verify neutral colors, awareness language |
| **AC4** | Services: StatementReminderScheduler, Workflows: Daily Reminder Job | `statement-reminders.ts`, WhatsApp Baileys client, Cron job | Integration test: Mock closing date = today+3, verify reminder sent; Reliability test: 99.5% delivery rate |
| **AC5** | APIs: getStatementSummary, Workflows: Statement Summary Request | `StatementSummaryHandler`, `handleStatementSummaryRequest()` | Integration test: Create transactions across categories, verify breakdown accuracy; Performance test: < 500ms |
| **AC6** | Services: StatementBadgeComponent, Workflows: Transaction Badge Display | `StatementBadge`, `get_statement_period()` | Unit test badge logic: verify "current" vs "next" classification; Performance test: < 100ms for 50 transactions |
| **AC7** | NFR: Awareness-First Language | All components, localization files | Manual review: Audit all Epic 3 messages for judgmental language; User testing: Feedback on tone |
| **AC8** | Architecture: Simple Mode Compatibility | Conditional rendering in all Epic 3 features | Integration test: Verify Simple Mode user sees NO statement features; Regression test: Simple Mode unchanged |

**Functional Requirements Traceability:**

| FR Range | Epic 3 AC Coverage | Implementation Status |
|----------|--------------------|-----------------------|
| FR8-FR12 | AC2, AC3 | Budget configuration and progress display |
| FR24-FR29 | AC1, AC4, AC5, AC6 | Statement closing dates, reminders, summaries, period distinction |
| FR37-FR42 | AC7 | Awareness-first language (cross-cutting quality requirement) |

**Story-to-AC Mapping:**

| Story | Primary AC | Supporting ACs |
|-------|------------|----------------|
| 3.1 | AC1 | AC8 (Simple Mode check) |
| 3.2 | AC2 | AC8 |
| 3.3 | AC3 | AC7 (awareness language), AC8 |
| 3.4 | AC4 | AC7 |
| 3.5 | AC5 | AC7 |
| 3.6 | AC6 | - |

## Risks, Assumptions, Open Questions

### Risks

| ID | Risk | Impact | Likelihood | Mitigation |
|----|------|--------|------------|------------|
| **R1** | Statement period calculation edge cases cause incorrect budget tracking | High | Medium | Comprehensive unit tests for Feb 31, leap years, day 30/31 in shorter months; PostgreSQL function ensures consistency |
| **R2** | WhatsApp reminder delivery failure rate exceeds 99% target | High | Low | Exponential backoff retry (max 3); Monitor delivery metrics daily; Alert if < 99% |
| **R3** | Budget calculation performance degrades with transaction volume | Medium | Medium | Index on (user_id, payment_method_id, date); Performance tests with 10K transactions; Optimize query if needed |
| **R4** | Users confused by statement period vs calendar month | Medium | Medium | Clear UI copy explaining "fatura fecha dia X"; Preview of current period; User testing before launch |
| **R5** | Budget widget causes dashboard slow-down | Medium | Low | Async loading; Cached for 5 minutes; NFR: < 300ms load time |
| **R6** | Awareness-first language perceived as confusing or unclear | Low | Low | User testing on messaging; Iterate on copy based on feedback; PostHog surveys |
| **R7** | Cron job fails to run (Railway infrastructure issue) | High | Low | Monitor cron execution logs; Alert if job doesn't run for 2 consecutive days; Manual execution fallback |

### Assumptions

| ID | Assumption | Validation |
|----|------------|------------|
| **A1** | Users understand their credit card statement closing dates | Confirmed during brainstorming; Common knowledge in Brazil |
| **A2** | 3 days before closing is optimal reminder timing | Based on PRD specification; Can adjust based on user feedback |
| **A3** | Statement period budget tracking is more valuable than calendar month | Hypothesis from PRD; Validate with adoption metrics (target: 40%+ of Credit Mode users set budgets) |
| **A4** | Existing transaction query performance supports statement period filtering | Indexes on (user_id, payment_method_id, date) already exist; Performance tests will confirm |
| **A5** | Users prefer personal budgets over bank credit limits | PRD insight; Measure via budget_set events and user interviews |
| **A6** | Daily cron job at 9 AM local time is acceptable for all users | Single timezone assumed (Brazil); Future: Support multiple timezones if international expansion |
| **A7** | Simple Mode users will not be confused by lack of statement features | Epic 1 established clear mode separation; No statement UI shown to Simple Mode |

### Open Questions

| ID | Question | Impact | Owner | Resolution Plan |
|----|----------|--------|-------|-----------------|
| **Q1** | Should budget widget show comparison to previous statement period? | Low | Product | Defer to post-MVP; Focus on current period for MVP |
| **Q2** | How to handle users who change closing date mid-period? | Medium | Dev | Decision: Allow change, recalculate period immediately, show notice "Period updated for next statement" |
| **Q3** | Should reminders be opt-in or opt-out? | Medium | Product | Assumption: Opt-out (enabled by default), user can disable in settings; Measure opt-out rate |
| **Q4** | Should statement summary include comparison to previous months? | Low | Product | Defer to post-MVP growth features; Keep MVP focused on current period awareness |
| **Q5** | How to handle multiple credit cards with different closing dates? | Low | Dev | Design: Each card independent; Dashboard shows all cards; WhatsApp reminder sent separately per card |
| **Q6** | Should budget exceeded status send immediate alert or only at pre-closing reminder? | Medium | Product | Decision: Only at pre-closing reminder (Story 3.4); Avoid alert fatigue; User can check dashboard anytime |

## Test Strategy Summary

### Test Levels

**Unit Tests (Jest)**
- Statement period calculation function: All edge cases (Feb 31, leap years, day 30/31)
- Budget calculation logic: Spent, remaining, percentage accuracy
- Closing day validation: Reject invalid values (< 1, > 31)
- Badge classification logic: Current vs next statement determination
- Coverage target: 90% for new Epic 3 code

**Integration Tests (Jest + Supabase)**
- Budget setting flow: Update payment_method → Verify budget stored → Query budget progress
- Statement reminder job: Mock closing date → Trigger job → Verify WhatsApp message sent
- Statement summary query: Create transactions → Request summary → Verify category breakdown
- RLS policies: Verify user can only access own budget data
- Coverage: All critical user flows (AC1-AC6)

**Performance Tests**
- Budget calculation: < 200ms for 1000 transactions (NFR5)
- Statement summary query: < 500ms with 20 categories (Epic3-P2)
- Dashboard widget load: < 300ms with 5 credit cards (Epic3-P3)
- Badge rendering: < 100ms for 50 transactions (Epic3-P4)
- Cron job execution: < 30 seconds for 100 users (NFR6)

**E2E Tests (Playwright - Future)**
- Set statement closing date → Add expenses → Verify budget widget updates
- Create transactions across statement periods → Verify badges show correct labels
- Request statement summary via WhatsApp → Verify formatted message
- Defer to post-MVP (focus on unit + integration for Epic 3)

**Manual Testing**
- Awareness-first language audit: Review all messages for judgmental tone (AC7)
- UI review: Verify neutral colors, no red for overspending
- Localization QA: Test pt-BR and English messages
- Mobile responsiveness: Budget widget, statement badges on mobile devices

### Test Data Requirements

**Seed Data for Testing:**
- Credit Mode user with statement_closing_day = 5, monthly_budget = 2000
- Simple Mode user (for compatibility testing)
- Transactions across multiple statement periods
- Installment payments included in budget calculations
- Edge case closing days: 28, 29, 30, 31

**Mock Data:**
- WhatsApp identifiers (JID/LID/phone) for reminder delivery testing
- Statement periods spanning Feb 31 edge cases
- Budget scenarios: on-track (50%), near-limit (85%), exceeded (110%)

### Test Coverage by AC

| AC | Unit | Integration | Performance | Manual |
|----|------|-------------|-------------|--------|
| AC1 | ✓ (edge cases) | ✓ (settings flow) | - | ✓ (UI preview) |
| AC2 | ✓ (validation) | ✓ (update flow) | - | - |
| AC3 | ✓ (calculations) | ✓ (query accuracy) | ✓ (< 200ms) | ✓ (colors, language) |
| AC4 | ✓ (reminder logic) | ✓ (cron + delivery) | ✓ (< 30s job) | ✓ (message tone) |
| AC5 | ✓ (summary logic) | ✓ (category breakdown) | ✓ (< 500ms) | ✓ (formatting) |
| AC6 | ✓ (badge logic) | ✓ (badge display) | ✓ (< 100ms) | ✓ (mobile view) |
| AC7 | - | - | - | ✓ (language audit) |
| AC8 | ✓ (mode checks) | ✓ (Simple Mode regression) | - | - |

### Regression Testing

**Epic 1 (Credit Mode Foundation):**
- Verify mode selection still works
- Verify Simple Mode unaffected by Epic 3 features

**Epic 2 (Parcelamento Intelligence):**
- Verify installment payments included in budget calculations
- Verify statement summary shows installment context

**Existing Features:**
- Calendar month budgets (non-credit cards) still work
- Transaction creation performance unchanged
- Dashboard load time not degraded

### Definition of Done (Testing)

- [ ] All unit tests pass (90%+ coverage)
- [ ] All integration tests pass
- [ ] Performance tests meet NFR targets
- [ ] Manual awareness-first language audit complete (zero judgmental language found)
- [ ] Regression tests pass (Epic 1, Epic 2, existing features)
- [ ] Mobile responsive testing complete
- [ ] Localization QA complete (pt-BR and English)
- [ ] Test data cleanup scripts created
