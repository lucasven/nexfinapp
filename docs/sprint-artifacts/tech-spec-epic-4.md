# Epic Technical Specification: Payment Reminders & Auto-Accounting

Date: 2025-12-03
Author: Lucas
Epic ID: 4
Status: Draft

---

## Overview

Epic 4 delivers **Payment Reminders & Auto-Accounting** for Credit Mode users, ensuring timely awareness of payment due dates while maintaining clean monthly accounting that separates credit card usage from payment transactions. This epic completes the Credit Card Management vision by addressing the final piece of the credit cycle: the payment itself.

Users receive WhatsApp reminders 2 days before payment is due (configurable days after statement closing), preventing late payments and interest charges. The system automatically creates a payment expense transaction in the payment month (not usage month), implementing proper accrual accounting that distinguishes "what I spent on credit" from "when I paid the bank." This separation is critical for users who track monthly cash flow, as credit card usage and payment occur in different periods.

## Objectives and Scope

**In Scope:**
- Payment due date configuration (days after statement closing)
- WhatsApp payment reminders 2 days before due date with statement total
- Automatic payment transaction creation on statement closing
- System category "Pagamento Cartão de Crédito" for payment transactions
- Payment transaction editing and deletion (user control over auto-generated data)
- Reminder opt-out mechanism (respects user preferences)
- Multi-card support (independent reminders per credit card)
- Awareness-first language in all reminder messaging (FR29, FR37-FR42)

**Out of Scope (Deferred):**
- Payment execution/integration with banks (tracking only, not payment processing)
- Recurring payment automation beyond initial transaction creation
- Payment history analysis and insights (post-MVP enhancement)
- Variable payment amounts (e.g., minimum payment vs full payment tracking)
- Interest/fees calculation (assumes user pays statement total)
- Payment confirmation workflows (assumes manual bank payment)

## System Architecture Alignment

Epic 4 aligns with the existing **Multi-Part Application Architecture** (Next.js frontend + Node.js WhatsApp bot + Shared Supabase PostgreSQL):

**Scheduled Jobs Infrastructure (ADR-005):**
- Extends existing Railway cron infrastructure (`railway.cron.yml`)
- Adds two new daily jobs: `payment-reminders.ts` and `auto-payment-transactions.ts`
- In-process scheduler with WhatsApp socket access (required for reminder delivery)
- Leverages existing job patterns from `recurring-payments` scheduler

**Database Extensions:**
- Extends `payment_methods` table (already modified in Epic 1 for `statement_closing_day`)
- Adds `payment_due_day` column (INTEGER, days after closing)
- Creates system category via migration (reuses existing categories table structure)
- No new tables required (reuses transactions, payment_methods, categories)

**WhatsApp Bot Integration:**
- Reminder delivery via existing Baileys WhatsApp client
- Multi-identifier lookup for delivery (JID → LID → phone, established pattern)
- Exponential backoff retry for 99.5% delivery success (NFR8)
- Opt-out handled via `user_preferences` table (existing pattern)

**Frontend Components:**
- Extends Credit Card Settings page (already created in Epic 3 for statement settings)
- Server Actions pattern for payment due date configuration
- Auto-payment transactions visible in existing Transaction List component (no special UI needed)

**Architecture Constraints Respected:**
- **No horizontal scaling complexity:** Single WhatsApp bot instance handles all reminders (Railway deployment)
- **RLS enforcement:** Frontend uses authenticated Supabase client, bot uses service key
- **Localization:** Supports pt-BR/en via existing localization infrastructure
- **Analytics:** PostHog event tracking extends existing patterns from Epics 1-3

## Detailed Design

### Services and Modules

| Module | Responsibility | Owner | Key Inputs | Key Outputs |
|--------|---------------|-------|------------|-------------|
| **Payment Due Settings Component** | UI for configuring payment due date | Frontend | User input (days after closing), payment_method_id | Updated payment_method record |
| **Payment Due Date Server Action** | Validates and persists payment due configuration | Frontend | payment_method_id, payment_due_day | Success/error response |
| **Payment Reminder Scheduler** | Daily job that identifies users needing reminders | WhatsApp Bot | Current date, payment_methods table | List of eligible users + reminder details |
| **Payment Reminder Message Builder** | Constructs localized reminder messages | WhatsApp Bot | User locale, statement total, due date, card name | Formatted WhatsApp message (pt-BR/en) |
| **Payment Reminder Sender** | Delivers reminders via WhatsApp with retry logic | WhatsApp Bot | User identifiers (JID/LID/phone), message content | Delivery success/failure status |
| **Auto-Payment Transaction Creator** | Daily job that creates payment transactions on closing | WhatsApp Bot | Closed statements (closing_date = yesterday) | New transaction records |
| **Statement Total Calculator** | Computes statement total for payment amount | WhatsApp Bot | payment_method_id, statement period dates | Total amount (regular expenses + installments) |
| **System Category Migration** | Creates "Pagamento Cartão de Crédito" category | Database | Migration script execution | System category record |
| **Transaction Edit/Delete Actions** | Standard CRUD for auto-generated payments | Frontend | transaction_id, updates | Modified/deleted transaction |

### Data Models and Contracts

**Payment Methods Table Extension:**
```sql
-- Extends existing payment_methods table (modified in Epic 1)
ALTER TABLE payment_methods
  ADD COLUMN payment_due_day INTEGER CHECK (payment_due_day > 0 AND payment_due_day <= 60);
  -- Stores days AFTER statement closing (e.g., 10 = due 10 days after closing)
  -- Range: 1-60 days (typical credit card cycles)

COMMENT ON COLUMN payment_methods.payment_due_day IS
  'Days after statement_closing_day when payment is due. Example: closing_day=5, payment_due_day=10 → due on 15th';
```

**System Category Record:**
```sql
-- Created via migration 035_payment_reminders.sql
INSERT INTO categories (id, user_id, name, name_en, type, is_system, icon, color)
VALUES (
  gen_random_uuid(),
  NULL,  -- System category (no specific user)
  'Pagamento Cartão de Crédito',
  'Credit Card Payment',
  'expense',
  true,  -- Cannot be deleted by users
  'credit-card',
  '#6B7280'  -- Neutral gray
);
```

**Auto-Generated Payment Transaction:**
```typescript
interface PaymentTransaction extends Transaction {
  // Standard transaction fields:
  user_id: string;
  amount: number;  // Statement total
  description: string;  // "Pagamento Cartão [CardName] - Fatura [MonthYear]"
  date: Date;  // Payment due date
  type: 'expense';
  category_id: string;  // System category ID
  payment_method_id: string;  // User's bank account/default payment source

  // Metadata:
  metadata: {
    auto_generated: true;
    source: 'payment_reminder';
    credit_card_id: string;  // The card being paid
    statement_period_start: Date;
    statement_period_end: Date;
    statement_total: number;  // For audit/validation
  };
}
```

**Payment Reminder Eligibility Query:**
```typescript
interface EligiblePaymentReminder {
  user_id: string;
  payment_method_id: string;
  payment_method_name: string;
  whatsapp_jid: string | null;
  whatsapp_lid: string | null;
  whatsapp_number: string | null;
  user_locale: 'pt-BR' | 'en';
  statement_closing_day: number;
  payment_due_day: number;  // Days after closing
  due_date: Date;  // Calculated due date
  statement_total: number;
  statement_period_start: Date;
  statement_period_end: Date;
  reminders_enabled: boolean;
}
```

**Reminder Delivery Status:**
```typescript
interface ReminderDeliveryResult {
  user_id: string;
  payment_method_id: string;
  delivery_status: 'sent' | 'failed' | 'skipped';
  delivery_attempt_count: number;
  error_message?: string;
  sent_at?: Date;
  whatsapp_identifier_used: 'jid' | 'lid' | 'phone';
}
```

### APIs and Interfaces

**Frontend Server Actions:**

```typescript
// fe/lib/actions/payment-methods.ts

/**
 * Sets payment due date for Credit Mode credit card
 * @param paymentMethodId - Credit card payment method ID
 * @param paymentDueDay - Days after statement closing (1-60)
 * @returns Success response or error
 */
export async function setPaymentDueDate(
  paymentMethodId: string,
  paymentDueDay: number
): Promise<{ success: boolean; error?: string }> {
  // 1. Validate: payment_due_day between 1-60
  // 2. Verify: User owns payment_method (RLS check)
  // 3. Verify: Credit Mode enabled (credit_mode = true)
  // 4. Update: payment_methods.payment_due_day
  // 5. Track: PostHog event 'payment_due_date_set'
  // 6. Revalidate: /settings/payment-methods/[id]
}

/**
 * Calculates next payment due date for preview
 * @param closingDay - Statement closing day (1-31)
 * @param paymentDueDay - Days after closing
 * @returns Calculated due date
 */
export function calculatePaymentDueDate(
  closingDay: number,
  paymentDueDay: number
): Date {
  // Example: closing=5, payment_due_day=10
  // Today=Dec 3 → next closing=Jan 5 → due=Jan 15
}
```

**WhatsApp Bot Scheduler Jobs:**

```typescript
// whatsapp-bot/src/scheduler/payment-reminders.ts

/**
 * Daily job: Sends payment reminders 2 days before due date
 * Runs: 9 AM local time (configured in railway.cron.yml)
 */
export async function processPaymentReminders(): Promise<void> {
  // 1. Query eligible reminders (due_date - 2 = TODAY)
  // 2. For each eligible user:
  //    a. Calculate statement total
  //    b. Build localized reminder message
  //    c. Send via WhatsApp with retry (3 attempts, exponential backoff)
  //    d. Track delivery status (PostHog event)
  //    e. Log success/failure
  // 3. Report job completion metrics
}

/**
 * Query users eligible for payment reminders
 * Eligibility: credit_mode=true, payment_due_day set, due in 2 days, WhatsApp authorized
 */
async function getEligiblePaymentReminders(): Promise<EligiblePaymentReminder[]> {
  // SQL query with JOINs:
  // - payment_methods (credit_mode=true, payment_due_day IS NOT NULL)
  // - authorized_whatsapp_numbers (JID/LID/phone)
  // - user_preferences (reminders_enabled != false)
  // WHERE calculated_due_date = CURRENT_DATE + INTERVAL '2 days'
}
```

```typescript
// whatsapp-bot/src/scheduler/auto-payment-transactions.ts

/**
 * Daily job: Creates payment transactions for closed statements
 * Runs: 1 AM local time (after statement closing)
 */
export async function createAutoPaymentTransactions(): Promise<void> {
  // 1. Find statements that closed YESTERDAY
  //    WHERE statement_closing_day = EXTRACT(DAY FROM CURRENT_DATE - 1)
  // 2. For each closed statement:
  //    a. Calculate statement total (regular + installments)
  //    b. Determine due date (closing_date + payment_due_day)
  //    c. Create transaction with system category
  //    d. Set metadata (auto_generated, statement period)
  //    e. Track PostHog event 'auto_payment_created'
  // 3. Report job completion
}

/**
 * Calculates statement total including installment payments
 */
async function calculateStatementTotal(
  userId: string,
  paymentMethodId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<number> {
  // Reuse Epic 3 calculation logic:
  // SUM(transactions WHERE date IN period AND payment_method_id = X)
  // Includes regular expenses + installment payments in period
}
```

**WhatsApp Message Format (Localized):**

```typescript
// whatsapp-bot/src/localization/pt-br.ts (Portuguese)
payment_reminder: {
  title: '💳 Lembrete: Pagamento do cartão',
  due_in_days: 'Vence em {days} dias ({date})',
  amount: 'Valor: R$ {amount}',
  card_name: 'Cartão {name}',
  period: 'Período: {start} - {end}',
  footer: 'Não esqueça de realizar o pagamento! 😊'
}

// whatsapp-bot/src/localization/en.ts (English)
payment_reminder: {
  title: '💳 Reminder: Credit card payment',
  due_in_days: 'Due in {days} days ({date})',
  amount: 'Amount: R$ {amount}',
  card_name: '{name} card',
  period: 'Period: {start} - {end}',
  footer: 'Don\'t forget to make your payment! 😊'
}
```

**Error Responses:**

| Error Code | HTTP Status | Description | User Message (pt-BR) |
|------------|-------------|-------------|---------------------|
| `INVALID_DUE_DAY` | 400 | payment_due_day not in range 1-60 | "Dias após fechamento deve ser entre 1 e 60" |
| `NOT_CREDIT_MODE` | 400 | Attempting to set due day for Simple Mode | "Apenas para cartões em Modo Crédito" |
| `CLOSING_DAY_REQUIRED` | 400 | Cannot set due day without closing day | "Configure a data de fechamento primeiro" |
| `UNAUTHORIZED` | 403 | User doesn't own payment method | "Você não tem permissão para editar este cartão" |
| `WHATSAPP_DELIVERY_FAILED` | 500 | Reminder failed after retries | (Logged only, user not notified) |

### Workflows and Sequencing

**Workflow 1: User Sets Payment Due Date**

```
[User] → [Frontend: Settings Page]
  1. User navigates to Credit Card Settings
  2. Clicks "Set Payment Due Date"
  3. Form displays:
     - Statement closing day: 5 (read-only, already set)
     - Payment due day: [Input: Days after closing] (1-60)
     - Preview: "Your payment will be due on the 15th of each month"
  4. User enters: 10 days
  5. Clicks "Save"

[Frontend] → [Server Action: setPaymentDueDate]
  6. Validate: 1 ≤ payment_due_day ≤ 60
  7. Verify: User owns payment_method (RLS)
  8. Verify: credit_mode = true
  9. UPDATE payment_methods SET payment_due_day = 10

[Database] → [Frontend]
  10. Success response
  11. Revalidate settings page
  12. Show toast: "Vencimento configurado: 10 dias após fechamento"
  13. Track PostHog: 'payment_due_date_set'
```

**Workflow 2: Daily Payment Reminder Job**

```
[Railway Cron] → [WhatsApp Bot: 9 AM Daily]
  1. Job triggered: processPaymentReminders()

[Scheduler] → [Database Query]
  2. Query eligible users:
     SELECT pm.*, awn.*, up.locale
     FROM payment_methods pm
     JOIN authorized_whatsapp_numbers awn ON pm.user_id = awn.user_id
     LEFT JOIN user_preferences up ON pm.user_id = up.user_id
     WHERE pm.credit_mode = true
       AND pm.payment_due_day IS NOT NULL
       AND (pm.statement_closing_day + pm.payment_due_day - 2) = CURRENT_DAY_OF_MONTH
       AND (up.payment_reminders_enabled IS NULL OR up.payment_reminders_enabled = true)

  3. Results: 12 eligible users

[For each eligible user]:
  4. Calculate statement period:
     - Closing day = 5, today = Jan 13
     - Current period: Dec 6 - Jan 5 (just closed)

  5. Calculate statement total:
     - Query transactions + installment payments in period
     - Total = R$ 1,450

  6. Calculate due date:
     - Closing = Jan 5, payment_due_day = 10
     - Due date = Jan 15 (2 days from today)

  7. Build localized message (pt-BR):
     "💳 Lembrete: Pagamento do cartão

      Vence em 2 dias (15 de Janeiro)
      💰 Valor: R$ 1.450,00

      Cartão Nubank
      Período: 6 Dez - 5 Jan

      Não esqueça de realizar o pagamento! 😊"

  8. Send via WhatsApp:
     - Attempt 1: Try JID
     - If fail: Wait 1s, try LID
     - If fail: Wait 5s, try phone number
     - If fail: Log error, continue to next user

  9. Track delivery:
     - PostHog event: 'payment_reminder_sent' { success: true/false }
     - Log to console with user_id, status

[Job Completion]:
  10. Report metrics:
      - Total eligible: 12
      - Successfully sent: 11
      - Failed: 1 (logged for investigation)
      - Success rate: 91.7% (target: 99.5%)

  11. Track job completion: PostHog 'payment_reminder_job_completed'
```

**Workflow 3: Daily Auto-Payment Transaction Creation**

```
[Railway Cron] → [WhatsApp Bot: 1 AM Daily]
  1. Job triggered: createAutoPaymentTransactions()

[Scheduler] → [Database Query]
  2. Find statements that closed YESTERDAY:
     SELECT pm.*, u.locale
     FROM payment_methods pm
     JOIN users u ON pm.user_id = u.id
     WHERE pm.credit_mode = true
       AND pm.statement_closing_day = EXTRACT(DAY FROM CURRENT_DATE - 1)
       AND pm.payment_due_day IS NOT NULL

  3. Results: 5 closed statements

[For each closed statement]:
  4. Statement details:
     - Card: Nubank (user_id: abc123)
     - Closing day: 5
     - Yesterday: Jan 5 (statement closed)
     - Payment due day: 10
     - Due date: Jan 15

  5. Calculate statement period:
     - Period: Dec 6, 2024 - Jan 5, 2025

  6. Calculate statement total:
     - Regular expenses: R$ 1,200
     - Installment payments: R$ 250
     - Total: R$ 1,450

  7. Get system category:
     - Query: SELECT id FROM categories WHERE is_system = true AND name = 'Pagamento Cartão de Crédito'
     - Result: category_id = xyz789

  8. Determine payment method:
     - User's default bank account (if set)
     - Else: Leave null, user must assign

  9. Create transaction:
     INSERT INTO transactions (
       user_id, amount, description, date, type,
       category_id, payment_method_id, metadata
     ) VALUES (
       'abc123',
       1450.00,
       'Pagamento Cartão Nubank - Fatura Jan/2025',
       '2025-01-15',  -- Due date
       'expense',
       'xyz789',  -- System category
       'user_bank_account_id',
       '{
         "auto_generated": true,
         "source": "payment_reminder",
         "credit_card_id": "nubank_id",
         "statement_period_start": "2024-12-06",
         "statement_period_end": "2025-01-05",
         "statement_total": 1450.00
       }'
     )

  10. Track event: PostHog 'auto_payment_created'

  11. Log success: "Auto-payment created for user abc123, amount R$ 1,450"

[Job Completion]:
  12. Report metrics:
      - Statements closed: 5
      - Transactions created: 5
      - Success rate: 100%

  13. Track job completion: PostHog 'auto_payment_job_completed'
```

**Workflow 4: User Edits Auto-Generated Payment**

```
[User] → [Frontend: Transaction List]
  1. User views transaction:
     "Pagamento Cartão Nubank - Fatura Jan/2025"
     Badge: "Auto-gerado"

  2. User clicks "Edit"

  3. Transaction form opens:
     - Amount: R$ 1,450.00 (user paid R$ 1,500)
     - Date: Jan 15
     - Category: Pagamento Cartão de Crédito
     - All fields editable (no restrictions)

  4. User changes amount to R$ 1,500.00

  5. Clicks "Save"

[Frontend] → [Server Action: updateTransaction]
  6. Validate: User owns transaction (RLS)
  7. UPDATE transactions SET amount = 1500.00, updated_at = NOW()
  8. Track: PostHog 'auto_payment_edited' { amount_changed: true }

[Database] → [Frontend]
  9. Success response
  10. Revalidate transaction list
  11. Toast: "Transação atualizada"

Note: metadata.auto_generated remains true for audit trail, but user can modify freely
```

## Non-Functional Requirements

### Performance

| ID | Requirement | Target | Rationale | Measurement Method |
|----|-------------|--------|-----------|-------------------|
| **NFR6** | Reminder job execution time | < 30 seconds for all users | Daily cron job must complete reliably before business hours | Log job start/end timestamps |
| **NFR-Epic4-P1** | Due date calculation | < 50ms | UI preview calculation must be instant | Performance.now() in frontend |
| **NFR-Epic4-P2** | Statement total query | < 500ms | Same query as Epic 3 budget calculation | Database query logging |
| **NFR-Epic4-P3** | Payment transaction creation | < 200ms per transaction | Batch job creates multiple transactions | Avg time per transaction logged |
| **NFR-Epic4-P4** | Settings page load time | < 1 second | Includes payment due date form | Web Vitals (LCP) |

**Performance Optimization Notes:**
- **Indexed queries:** `payment_methods(statement_closing_day)` index for job eligibility queries
- **Batch processing:** Reminder job processes users in parallel (10 concurrent)
- **Statement total caching:** Reuse Epic 3 calculation function (already optimized)
- **Job scheduling:** Stagger jobs (reminders at 9 AM, auto-payments at 1 AM) to avoid resource contention

### Security

| ID | Requirement | Implementation | Threat Mitigated |
|----|-------------|----------------|------------------|
| **NFR-Epic4-S1** | RLS enforcement on payment_due_day updates | Server Action checks `auth.uid() = payment_method.user_id` | Unauthorized modification of other users' settings |
| **NFR-Epic4-S2** | Service key isolation for scheduler jobs | Bot uses `SUPABASE_SERVICE_KEY` with manual user_id filtering | Bypass RLS only when necessary, explicit user context |
| **NFR-Epic4-S3** | Reminder opt-out respected | Query checks `payment_reminders_enabled != false` | Unwanted notifications (privacy violation) |
| **NFR-Epic4-S4** | WhatsApp identifier validation | Multi-identifier cascade (JID → LID → phone) with existence check | Message delivery to incorrect recipient |
| **NFR-Epic4-S5** | Auto-payment transaction ownership | `user_id` set from payment_method owner, not request parameter | Cross-user transaction injection |
| **NFR-Epic4-S6** | System category protection | `is_system = true` prevents user deletion | Accidental/malicious removal of required category |

**Security Notes:**
- **No PII in reminders:** Messages contain card name (user-defined) and amounts only, no sensitive bank data
- **Idempotency:** Auto-payment creation checks for existing transaction to prevent duplicates
- **Audit trail:** `metadata.auto_generated` flag tracks system-created transactions for forensics

### Reliability/Availability

| ID | Requirement | Target | Implementation | Recovery Strategy |
|----|-------------|--------|----------------|-------------------|
| **NFR8** | Reminder delivery success rate | 99.5% | Exponential backoff retry (3 attempts: 0s, 1s, 5s) | Manual notification for persistent failures |
| **NFR12** | Payment auto-expense creation success | 100% | Database transaction with rollback on error | Retry on next job run if failed |
| **NFR-Epic4-R1** | Job failure tolerance | Continue processing on individual failures | Try-catch per user, log error, continue to next | Alert if failure rate > 5% |
| **NFR-Epic4-R2** | Duplicate payment prevention | No duplicate auto-payments per statement | Check existing transaction with same metadata.credit_card_id + period | Idempotency key prevents duplicates |
| **NFR-Epic4-R3** | Job crash recovery | Job can restart safely | Stateless job design, query-based eligibility | Railway auto-restart on crash |
| **NFR-Epic4-R4** | Timezone consistency | All dates in user's local timezone (BRT) | Railway env TZ=America/Sao_Paulo | Prevents reminder timing issues |

**Reliability Notes:**
- **Cascading identifier fallback:** JID → LID → phone ensures maximum delivery success
- **Transient error classification:** Network failures retry, invalid identifiers skip immediately
- **Job monitoring:** Alert if success rate < 99% or execution time > 30 seconds
- **Data integrity:** Payment transactions use database ACID properties (atomic creation)

### Observability

| ID | Requirement | Logging/Metrics | Alert Threshold | Dashboard |
|----|-------------|-----------------|-----------------|-----------|
| **NFR27** | Reminder delivery logging | Log success/failure per user with identifier used | Failure rate > 1% | PostHog: Reminder Delivery Status |
| **NFR-Epic4-O1** | Job execution metrics | Start time, end time, duration, user count, success count | Duration > 30s | Railway logs + PostHog events |
| **NFR-Epic4-O2** | Payment transaction creation tracking | Log each auto-payment with statement_total, user_id | Creation failure | PostHog: Auto-Payment Created |
| **NFR-Epic4-O3** | Reminder opt-out rate | Track users who disable payment reminders | Opt-out spike (> 10% in 7 days) | PostHog: Feature Usage |
| **NFR-Epic4-O4** | Statement total accuracy validation | Compare calculated total vs actual user expenses | Discrepancy > R$ 1 | Log warning for investigation |
| **NFR-Epic4-O5** | Due date setting patterns | Track payment_due_day distribution (histogram) | None (analytics only) | PostHog: User Preferences |

**PostHog Events:**
```typescript
// Reminder job events
'payment_reminder_sent' { user_id, payment_method_id, success, delivery_attempts, identifier_type }
'payment_reminder_failed' { user_id, payment_method_id, error_type, attempts }
'payment_reminder_job_completed' { eligible_users, sent_count, failed_count, duration_ms }

// Auto-payment events
'auto_payment_created' { user_id, payment_method_id, amount, statement_period }
'auto_payment_job_completed' { statements_closed, transactions_created, duration_ms }

// User actions
'payment_due_date_set' { payment_method_id, payment_due_day }
'auto_payment_edited' { transaction_id, fields_changed }
'auto_payment_deleted' { transaction_id, amount }
```

**Structured Logging:**
```
[2025-01-13 09:00:12] INFO: Payment reminder job started
[2025-01-13 09:00:15] INFO: Found 12 eligible users for reminders
[2025-01-13 09:00:18] INFO: Reminder sent successfully | user_id=abc123 | card=Nubank | amount=R$1450
[2025-01-13 09:00:19] WARN: Reminder delivery failed | user_id=xyz789 | attempts=3 | error=no_whatsapp_identifier
[2025-01-13 09:00:25] INFO: Payment reminder job completed | eligible=12 | sent=11 | failed=1 | duration=13s
```

## Dependencies and Integrations

**External Dependencies (No New Packages):**

Epic 4 reuses existing dependencies from the brownfield codebase:

| Dependency | Version | Purpose | Epic 4 Usage |
|------------|---------|---------|--------------|
| `@supabase/supabase-js` | ^2.39.3 | Database client | Query payment methods, create transactions |
| `@supabase/ssr` | 0.7.0 | Server-side Supabase | Frontend Server Actions RLS enforcement |
| `@whiskeysockets/baileys` | ^6.7.9 | WhatsApp Web API | Send payment reminders |
| `posthog-node` | ^5.11.2 | Analytics (bot) | Track reminder delivery events |
| `@radix-ui/react-dialog` | 1.1.4 | UI dialogs | Payment due date settings form |
| `@tanstack/react-query` | ^5.90.11 | Data fetching | Cache payment method settings |
| `date-fns` | ^4.1.0 | Date manipulation | Calculate due dates, format dates |
| `node-cron` | ^4.2.1 | Scheduler (existing) | Daily reminder/auto-payment jobs |

**No New External Dependencies Required**

**Internal Module Dependencies:**

```
Epic 4 Modules Depend On:
├── Epic 1: Credit Mode flag (payment_methods.credit_mode)
├── Epic 3: Statement Period Calculation (reuse function)
├── Epic 3: Statement Closing Day (payment_methods.statement_closing_day)
└── Existing Infrastructure:
    ├── Multi-identifier WhatsApp lookup (JID/LID/phone)
    ├── Localization system (pt-BR/en)
    ├── PostHog event tracking
    ├── Railway cron infrastructure
    └── Server Actions pattern
```

**Database Schema Dependencies:**

```sql
-- Epic 4 extends these existing tables:
payment_methods (
  -- From Epic 1:
  credit_mode BOOLEAN,
  statement_closing_day INTEGER,
  monthly_budget DECIMAL,
  -- Epic 4 adds:
  payment_due_day INTEGER
)

-- Epic 4 uses these existing tables:
transactions (existing structure, no changes)
categories (existing + new system category)
authorized_whatsapp_numbers (existing multi-identifier support)
user_preferences (existing opt-out mechanism)
```

**Integration Points:**

| Integration | Direction | Data Flow | Epic 4 Usage |
|-------------|-----------|-----------|--------------|
| **Frontend ↔ Supabase** | Bidirectional | RLS-enforced queries | Payment due date CRUD |
| **WhatsApp Bot ↔ Supabase** | Read/Write | Service key (bypass RLS) | Reminder queries, transaction creation |
| **WhatsApp Bot ↔ Baileys** | Outbound | Message delivery | Send payment reminders |
| **WhatsApp Bot ↔ PostHog** | Outbound | Event tracking | Reminder delivery analytics |
| **Railway Cron ↔ Bot** | Trigger | Daily job execution | Schedule reminder/auto-payment jobs |
| **Epic 3 ↔ Epic 4** | Function reuse | Statement total calculation | Reuse `calculateStatementTotal()` |

**Railway Cron Configuration (railway.cron.yml):**

```yaml
# Existing file, Epic 4 adds:
jobs:
  - name: payment-reminders
    schedule: "0 12 * * *"  # 9 AM Brazil time (12 UTC)
    command: "node dist/scheduler/payment-reminders.js"

  - name: auto-payment-transactions
    schedule: "0 4 * * *"   # 1 AM Brazil time (4 UTC)
    command: "node dist/scheduler/auto-payment-transactions.js"
```

**Version Constraints:**

- Node.js: ≥ 18 (existing requirement)
- PostgreSQL: ≥ 15 (existing Supabase version)
- TypeScript: ^5.0 (existing)
- No breaking changes to existing APIs

## Acceptance Criteria (Authoritative)

**Epic 4 implements FR30-FR36 from the PRD. Each AC is testable and maps to specific stories.**

### AC-4.1: Set Payment Due Date (Story 4.1)

**Given** Credit Mode user in credit card settings
**When** user sets payment due date
**Then** form shows:
- Statement closing day (read-only, already set)
- Payment due day input (1-60 days after closing)
- Preview: "Your payment will be due on the [date] of each month"

**And** user enters 10 days
**When** saved
**Then** `payment_methods.payment_due_day = 10`
**And** next due date calculated correctly (closing_day + payment_due_day)
**And** edge cases handled (month boundaries, Feb 31 → last day)

### AC-4.2: WhatsApp Payment Reminder (Story 4.2)

**Given** payment due on Jan 15
**And** today is Jan 13 (2 days before)
**When** daily reminder job runs
**Then** sends WhatsApp message:
```
💳 Lembrete: Pagamento do cartão

Vence em 2 dias (15 de Janeiro)
💰 Valor: R$ 1.450,00

Cartão Nubank
Período: 6 Dez - 5 Jan

Não esqueça de realizar o pagamento! 😊
```

**And** message localized (pt-BR/en based on user preference)
**And** delivery attempted via JID → LID → phone cascade
**And** retry with exponential backoff (1s, 5s) on failure
**And** PostHog event tracked: `payment_reminder_sent`

**Given** user opted out of reminders
**Then** NO reminder sent

**Given** multiple credit cards with different due dates
**Then** each gets separate reminder 2 days before its due date

### AC-4.3: Auto-Create Payment Transaction (Story 4.3)

**Given** statement closes on Jan 5 with total R$ 1,450
**And** payment due on Jan 15
**When** statement closing date passes (Jan 5)
**Then** system auto-creates transaction:
- Date: Jan 15 (due date)
- Amount: R$ 1,450 (statement total)
- Description: "Pagamento Cartão Nubank - Fatura Jan/2025"
- Category: "Pagamento Cartão de Crédito" (system category)
- Type: Expense
- Metadata: `{ auto_generated: true, credit_card_id, statement_period }`

**And** transaction appears in January budget (payment month, NOT usage month)
**And** shows badge: "Auto-gerado"

**Given** user has no bank account payment method
**Then** payment_method_id left NULL (user must assign)

### AC-4.4: Edit Auto-Generated Payment (Story 4.4)

**Given** auto-generated payment transaction R$ 1,450
**And** user actually paid R$ 1,500
**When** user edits amount to R$ 1,500
**Then** transaction updated
**And** retains "Pagamento Cartão" tag
**And** `metadata.auto_generated` remains true for audit

**Given** user edits date or payment method
**Then** changes saved without restrictions
**And** PostHog event: `auto_payment_edited`

**Given** user deletes auto-payment
**Then** confirmation shown: "Deletar pagamento automático?"
**And** on confirm, transaction deleted
**And** next statement closing creates new auto-payment normally

### AC-4.5: System Category Protection (Story 4.5)

**Given** database migration applied
**Then** system category created:
- Name (pt-BR): "Pagamento Cartão de Crédito"
- Name (en): "Credit Card Payment"
- Type: Expense
- `is_system = true` (cannot be deleted)

**Given** user views category list
**Then** system category appears but marked as "Sistema"
**And** delete button grayed out/disabled

**Given** user can customize name/icon
**Then** customization allowed (personalization)
**But** `is_system` flag prevents deletion

### Cross-Functional Acceptance Criteria

**Performance (NFR6, NFR-Epic4-P1-P4):**
- Reminder job execution: < 30 seconds for all users
- Due date calculation: < 50ms (UI preview)
- Statement total query: < 500ms (reuses Epic 3 function)
- Payment transaction creation: < 200ms per transaction

**Reliability (NFR8, NFR12, NFR-Epic4-R1-R4):**
- Reminder delivery success: ≥ 99.5%
- Auto-payment creation success: 100%
- Job failure tolerance: Individual failures don't halt batch
- Duplicate prevention: No duplicate auto-payments per statement

**Security (NFR-Epic4-S1-S6):**
- RLS enforcement on payment_due_day updates
- WhatsApp identifier validation (multi-identifier cascade)
- Reminder opt-out respected
- System category protected from deletion

**Observability (NFR27, NFR-Epic4-O1-O5):**
- Reminder delivery logged per user
- Job execution metrics tracked (duration, success rate)
- PostHog events for all key actions
- Alerts: Failure rate > 1%, duration > 30s

**Localization:**
- All messages support pt-BR and English
- Date/currency formatting locale-specific
- Awareness-first language (no judgment)

## Traceability Mapping

| AC | Spec Section | Component/API | Test Coverage |
|----|--------------|---------------|---------------|
| **AC-4.1** | Payment due date configuration | `fe/components/settings/payment-due-settings.tsx` | Unit: Form validation<br>Integration: Server Action RLS |
| | | `fe/lib/actions/payment-methods.ts::setPaymentDueDate()` | E2E: User flow from settings to save |
| | | `payment_methods.payment_due_day` column | |
| **AC-4.2** | WhatsApp payment reminders | `whatsapp-bot/src/scheduler/payment-reminders.ts` | Unit: Eligibility query logic |
| | | `whatsapp-bot/src/services/reminders/reminder-message-builder.ts` | Unit: Message localization |
| | | `whatsapp-bot/src/services/reminders/reminder-sender.ts` | Integration: Delivery retry logic |
| | | | Manual: Receive reminder on test phone |
| **AC-4.3** | Auto-payment transaction creation | `whatsapp-bot/src/scheduler/auto-payment-transactions.ts` | Unit: Statement total calculation |
| | | `whatsapp-bot/src/services/statement/statement-total-calculator.ts` | Integration: Transaction creation |
| | | `categories` table (system category) | E2E: Verify transaction appears correctly |
| **AC-4.4** | Edit/delete auto-payment | `fe/lib/actions/transactions.ts::updateTransaction()` | Unit: Update validation |
| | | `fe/components/transactions/transaction-form.tsx` | E2E: Edit flow from list to save |
| | | | Unit: Delete confirmation dialog |
| **AC-4.5** | System category protection | Migration `035_payment_reminders.sql` | Unit: Category deletion prevention |
| | | `fe/components/settings/categories-list.tsx` | E2E: Verify system category UI behavior |
| **NFR6** | Reminder job performance | `payment-reminders.ts` job metrics | Performance: Measure job duration with 100+ users |
| **NFR8** | 99.5% delivery success | Retry logic with exponential backoff | Integration: Simulate network failures |
| | | Multi-identifier cascade | |
| **NFR12** | 100% auto-payment success | Database transaction with rollback | Integration: Simulate DB failures |
| | | Idempotency check | Unit: Duplicate prevention logic |

**Requirement → Implementation → Test Traceability:**

```
FR30 (Set payment due date)
  ├──> AC-4.1
  ├──> Story 4.1
  ├──> payment_methods.payment_due_day column
  ├──> setPaymentDueDate() Server Action
  └──> Tests: Unit (validation), Integration (RLS), E2E (user flow)

FR31-FR32 (Payment reminders)
  ├──> AC-4.2
  ├──> Story 4.2
  ├──> payment-reminders.ts scheduler
  ├──> reminder-sender.ts with retry
  └──> Tests: Unit (eligibility), Integration (delivery), Manual (receive message)

FR33-FR35 (Auto-payment transaction)
  ├──> AC-4.3
  ├──> Story 4.3
  ├──> auto-payment-transactions.ts scheduler
  ├──> System category creation
  └──> Tests: Unit (calculation), Integration (creation), E2E (verification)

FR36 (Edit/delete auto-payment)
  ├──> AC-4.4
  ├──> Story 4.4
  ├──> updateTransaction(), deleteTransaction()
  └──> Tests: Unit (validation), E2E (user flow)

FR34 (System category)
  ├──> AC-4.5
  ├──> Story 4.5
  ├──> Migration 035
  └──> Tests: Unit (deletion prevention), E2E (UI behavior)
```

## Risks, Assumptions, Open Questions

### Risks

| ID | Risk | Probability | Impact | Mitigation |
|----|------|-------------|--------|------------|
| **R-Epic4-1** | WhatsApp delivery failures prevent reminders | Medium | High | Multi-identifier cascade (JID→LID→phone), exponential backoff retry, 99.5% target with monitoring alerts |
| **R-Epic4-2** | Job timing issues (timezone, DST) | Low | High | Railway TZ=America/Sao_Paulo env var, use date-fns with timezone awareness, extensive edge case testing |
| **R-Epic4-3** | Statement total calculation mismatch | Low | Medium | Reuse Epic 3 tested function, add validation logging (discrepancy > R$ 1 triggers warning), audit trail |
| **R-Epic4-4** | Duplicate auto-payments created | Low | High | Idempotency check (metadata.credit_card_id + statement_period unique), database transaction atomicity |
| **R-Epic4-5** | User confusion about auto-payment vs manual | Medium | Low | Clear "Auto-gerado" badge, awareness-first messaging, edit/delete freely allowed (user control) |
| **R-Epic4-6** | Railway cron job failures | Low | High | Stateless job design (restartable), Railway auto-restart, alert on consecutive failures |
| **R-Epic4-7** | Localization edge cases (date formats) | Low | Low | Use date-fns with pt-BR/en locales, test both locales thoroughly, fallback to ISO format |

### Assumptions

| ID | Assumption | Validation | Risk if Wrong |
|----|------------|------------|---------------|
| **A-Epic4-1** | Users pay statement total (not partial/minimum payment) | Survey existing users | Auto-payment amount incorrect → User must edit |
| **A-Epic4-2** | 2 days reminder lead time sufficient | Based on Epic 3 statement reminders (3 days) | Users prefer different timing → Add configurable lead time (post-MVP) |
| **A-Epic4-3** | Users have default bank account set | Onboarding flow sets payment method | Payment method NULL → User must assign manually |
| **A-Epic4-4** | Daily cron jobs at 1 AM and 9 AM don't conflict | Staggered timing (8-hour gap) | Resource contention → Monitor Railway metrics |
| **A-Epic4-5** | Exponential backoff (0s, 1s, 5s) sufficient for 99.5% success | Based on existing WhatsApp bot retry patterns | Need longer retries → Adjust backoff timings |
| **A-Epic4-6** | System category name "Pagamento Cartão de Crédito" clear | Brazilian terminology standard | Confusing → Allow user customization |

### Open Questions

| ID | Question | Decision Needed By | Impact | Options |
|----|----------|---------------------|--------|---------|
| **Q-Epic4-1** | Should payment reminder be configurable (1-7 days before)? | Story 4.2 | Medium | **Decided: Fixed 2 days for MVP**, configurable in post-MVP enhancement |
| **Q-Epic4-2** | Should auto-payment default to user's most-used bank account? | Story 4.3 | Low | **Decided: Use default payment method if set**, else NULL (user assigns) |
| **Q-Epic4-3** | How to handle users with multiple bank accounts? | Story 4.3 | Low | **Decided: NULL payment_method**, user must select which account to pay from |
| **Q-Epic4-4** | Should reminder include payment link (PIX, bank app deep link)? | Story 4.2 | Medium | **Deferred to post-MVP** (no payment execution in MVP) |
| **Q-Epic4-5** | Should system category be editable by user (name/icon)? | Story 4.5 | Low | **Decided: Yes, allow customization** (only deletion prevented) |
| **Q-Epic4-6** | What if user changes statement closing day mid-month? | Story 4.1 | Low | **Decision: Existing period unchanged**, new setting applies to next period |

### Dependencies on Other Epics

| Epic | Dependency | Blocker? | Workaround if Delayed |
|------|------------|----------|----------------------|
| **Epic 1** | Credit Mode flag (`credit_mode = true`) | **Yes** | Cannot set payment due date without Credit Mode |
| **Epic 3** | Statement closing day (`statement_closing_day`) | **Yes** | Cannot calculate due date without closing day |
| **Epic 3** | Statement total calculation function | No | Can implement independently, but reuse preferred for consistency |
| **Epic 2** | Installment data for statement total | No | Auto-payment works without installments (just regular expenses) |

## Test Strategy Summary

### Testing Levels

**Epic 4 requires comprehensive testing across all levels due to scheduled jobs and WhatsApp integration.**

#### Unit Tests (70% coverage minimum)

**Frontend:**
```typescript
// fe/lib/actions/__tests__/payment-methods.test.ts
describe('setPaymentDueDate', () => {
  it('validates payment_due_day range (1-60)')
  it('rejects Simple Mode cards')
  it('requires statement_closing_day to be set')
  it('updates payment_methods table')
})

// fe/lib/utils/__tests__/payment-due-calculator.test.ts
describe('calculatePaymentDueDate', () => {
  it('calculates due date correctly (closing + days)')
  it('handles month boundaries (Jan 25 + 10 = Feb 4)')
  it('handles year boundaries (Dec 28 + 10 = Jan 7)')
  it('handles February edge cases (Feb 31 → Feb 28/29)')
})
```

**WhatsApp Bot:**
```typescript
// whatsapp-bot/src/__tests__/scheduler/payment-reminders.test.ts
describe('Payment Reminder Eligibility', () => {
  it('finds users with due date in 2 days')
  it('excludes opted-out users')
  it('excludes Simple Mode cards')
  it('requires WhatsApp authorization')
})

describe('Reminder Message Builder', () => {
  it('formats pt-BR message correctly')
  it('formats English message correctly')
  it('includes statement total')
  it('uses awareness-first language')
})

describe('Reminder Delivery', () => {
  it('tries JID first')
  it('falls back to LID on JID failure')
  it('falls back to phone on LID failure')
  it('retries with exponential backoff')
  it('logs failure after 3 attempts')
})

// whatsapp-bot/src/__tests__/scheduler/auto-payment-transactions.test.ts
describe('Auto-Payment Creation', () => {
  it('finds statements closed yesterday')
  it('calculates statement total correctly')
  it('creates transaction with correct metadata')
  it('uses system category')
  it('prevents duplicate creation (idempotency)')
})
```

#### Integration Tests

**Database + Scheduler Integration:**
```typescript
// whatsapp-bot/src/__tests__/integration/payment-reminders.integration.test.ts
describe('Payment Reminder Job Integration', () => {
  beforeEach('Setup test database with users')

  it('processes eligible users in batch')
  it('isolates individual failures (one fail doesn't halt batch)')
  it('logs metrics (eligible, sent, failed)')
  it('tracks PostHog events')
  it('completes within 30 seconds for 100 users (NFR6)')
})

// whatsapp-bot/src/__tests__/integration/auto-payment.integration.test.ts
describe('Auto-Payment Creation Integration', () => {
  it('creates transactions atomically')
  it('handles database transaction rollback on error')
  it('validates statement total calculation accuracy')
  it('prevents duplicate payments')
})
```

**RLS Enforcement (Frontend):**
```typescript
// fe/__tests__/integration/payment-methods-rls.test.ts
describe('Payment Due Date RLS', () => {
  it('allows user to update own payment method')
  it('blocks user from updating other user payment method')
  it('admin can update any payment method')
})
```

#### End-to-End Tests

**User Workflows:**
```
Test: Set Payment Due Date (Story 4.1)
1. Login as Credit Mode user
2. Navigate to Credit Card Settings
3. Set payment_due_day = 10
4. Verify preview shows correct date
5. Save and verify toast confirmation
6. Refresh page, verify setting persisted

Test: Receive Payment Reminder (Story 4.2)
1. Setup: User with closing_day=5, due_day=10, today=Jan 13
2. Trigger: Run payment-reminders job manually
3. Verify: WhatsApp message received on test phone
4. Verify: Message contains correct amount, date, card name
5. Verify: PostHog event 'payment_reminder_sent' tracked

Test: Auto-Payment Transaction Appears (Story 4.3)
1. Setup: User with statement closing yesterday
2. Trigger: Run auto-payment-transactions job
3. Verify: Transaction appears in transaction list
4. Verify: Badge shows "Auto-gerado"
5. Verify: Amount matches statement total
6. Verify: Date is payment due date
7. Verify: Category is system category

Test: Edit Auto-Payment (Story 4.4)
1. Find auto-generated payment in list
2. Click Edit
3. Change amount from R$ 1,450 to R$ 1,500
4. Save
5. Verify: Amount updated
6. Verify: PostHog event 'auto_payment_edited' tracked
```

#### Performance Tests

**NFR Validation:**
```
Performance Test: Reminder Job Execution (NFR6)
- Load: 100 eligible users
- Target: < 30 seconds total execution
- Method: Time job start to completion
- Pass: All reminders sent, duration < 30s

Performance Test: Due Date Calculation (NFR-Epic4-P1)
- Method: Performance.now() around calculation
- Target: < 50ms per calculation
- Volume: 1000 calculations
- Pass: Average < 50ms, P99 < 100ms

Performance Test: Statement Total Query (NFR-Epic4-P2)
- Setup: User with 100 transactions + 10 installments
- Target: < 500ms query time
- Method: Database query logging
- Pass: Query completes < 500ms

Load Test: Payment Reminder Scaling (NFR16)
- Load: 10,000 users eligible for reminders
- Target: Linear scaling, no degradation
- Method: Measure duration vs user count
- Pass: Duration increases linearly, not exponentially
```

#### Manual Testing

**WhatsApp Delivery:**
```
Manual Test Checklist:
□ Receive reminder on regular WhatsApp account
□ Receive reminder on WhatsApp Business account
□ Verify message formatting (pt-BR)
□ Verify message formatting (en)
□ Test reminder opt-out (no message received)
□ Test multiple cards (separate reminders)
□ Verify delivery retry on airplane mode → online transition
```

**User Experience:**
```
UX Test Checklist:
□ Payment due date form is intuitive
□ Preview calculation shows correct date
□ Auto-payment badge is clear
□ Edit flow works smoothly
□ System category cannot be deleted
□ Awareness-first language throughout
```

### Test Data Requirements

**Test Users:**
- User A: Credit Mode, closing_day=5, payment_due_day=10
- User B: Simple Mode (excluded from reminders)
- User C: Credit Mode, no payment_due_day set (excluded)
- User D: Credit Mode, opted out of reminders
- User E: WhatsApp Business account (LID identifier)
- User F: Multiple credit cards with different due dates

**Test Transactions:**
- Regular expenses across statement periods
- Installment payments in current period
- Edge case: Statement total = R$ 0.00
- Edge case: Statement total > R$ 10,000

### Coverage Targets

| Test Level | Target Coverage | Critical Paths |
|------------|----------------|----------------|
| Unit Tests | 70% | Payment calculation, eligibility logic, message formatting |
| Integration Tests | Key flows | Job execution, RLS enforcement, delivery retry |
| E2E Tests | 5 stories | Set due date, receive reminder, auto-payment, edit, system category |
| Performance Tests | All NFRs | Job duration, query performance, scaling |
| Manual Tests | WhatsApp delivery | Actual message receipt on test devices |

### Regression Testing

**Epic 4 must not break:**
- Existing transaction CRUD operations
- Budget calculations (Epic 3)
- Installment tracking (Epic 2)
- Credit Mode selection (Epic 1)
- WhatsApp bot message delivery
- Scheduled job infrastructure

### Test Automation

**CI/CD Pipeline:**
```yaml
# Run on every PR:
- Unit tests (frontend + backend)
- Integration tests (database + RLS)
- Lint + TypeScript compilation

# Run nightly:
- E2E tests (full user workflows)
- Performance tests (NFR validation)

# Run manually before deployment:
- Manual WhatsApp delivery tests
- Load tests (10,000 user simulation)
```

### Definition of Done (Testing)

**Story 4.1-4.5 complete when:**
✅ All unit tests pass (70% coverage)
✅ Integration tests pass
✅ E2E tests pass for all user workflows
✅ Performance tests meet NFR targets
✅ Manual WhatsApp delivery verified on test devices
✅ RLS policies tested and enforced
✅ No regression in existing features
✅ PostHog events tracked correctly
✅ Documentation updated with test results
