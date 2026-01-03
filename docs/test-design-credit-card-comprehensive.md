# Comprehensive Test Design: Credit Card Features (WhatsApp Bot)

**Scope**: Epics 1-4 Credit Card Management
**Target**: WhatsApp Bot Integration Testing
**Date**: 2025-12-09
**Author**: Murat (Master Test Architect)
**Status**: Draft

---

## Executive Summary

This test design covers **comprehensive testing for credit card features in the WhatsApp bot** across Epics 1-4:
- **Epic 1**: Credit Mode Selection & Foundation
- **Epic 2**: Installment Management (Parcelamento)
- **Epic 3**: Statement-Aware Budgets
- **Epic 4**: Payment Reminders & Auto-Accounting

**Testing Philosophy**: Risk-based, depth scales with impact. The WhatsApp bot is the **primary user interface** for real-time credit card management—failures here directly impact user trust and financial accuracy.

**Risk Profile**:
- **High-risk areas**: Money calculations, automated jobs, date/time logic, multi-identifier auth
- **Critical dependencies**: Baileys WhatsApp API, Supabase database functions, cron scheduling
- **Complexity**: AI intent detection, conversation state, localization, timezone handling

---

## Risk Assessment

### Risk Scoring Matrix (Probability × Impact = Score)

**Legend**:
- Probability: 1=Unlikely, 2=Possible, 3=Likely
- Impact: 1=Minor, 2=Degraded, 3=Critical
- Action: DOCUMENT (1-3), MONITOR (4-5), MITIGATE (6-8), BLOCK (9)

| ID | Risk | Category | Probability | Impact | Score | Action | Priority |
|----|------|----------|-------------|--------|-------|--------|----------|
| **R1** | Incorrect installment payment calculation in statement total | DATA | 2 | 3 | 6 | MITIGATE | P0 |
| **R2** | Statement reminder sent to wrong user (multi-identifier lookup failure) | SEC | 1 | 3 | 3 | DOCUMENT | P1 |
| **R3** | Auto-payment transaction created with wrong amount | DATA | 2 | 3 | 6 | MITIGATE | P0 |
| **R4** | Payment reminder delivery failure >0.5% (violates NFR8: 99.5% target) | OPS | 2 | 2 | 4 | MONITOR | P1 |
| **R5** | Budget calculation excludes installments (Epic 2/3 integration bug) | BUS | 2 | 3 | 6 | MITIGATE | P0 |
| **R6** | Statement period calculation wrong for Feb 31 / leap years | BUS | 2 | 3 | 6 | MITIGATE | P0 |
| **R7** | Cron job fails silently (no execution logging / alerts) | OPS | 2 | 3 | 6 | MITIGATE | P1 |
| **R8** | AI intent detection misses "resumo da fatura" in natural language | PERF | 3 | 2 | 6 | MITIGATE | P1 |
| **R9** | Credit Mode toggle fails mid-month (orphaned data) | BUS | 2 | 2 | 4 | MONITOR | P1 |
| **R10** | Installment payoff calculates wrong refund amount | DATA | 2 | 3 | 6 | MITIGATE | P0 |
| **R11** | WhatsApp Business account (LID) not recognized (auth failure) | SEC | 2 | 3 | 6 | MITIGATE | P1 |
| **R12** | Timezone mismatch causes reminder sent at wrong time | PERF | 2 | 2 | 4 | MONITOR | P2 |
| **R13** | Localization falls back to wrong language (pt-BR vs en) | PERF | 2 | 1 | 2 | DOCUMENT | P3 |
| **R14** | Statement summary query timeout (>500ms NFR) | PERF | 2 | 2 | 4 | MONITOR | P2 |
| **R15** | Duplicate auto-payment created (idempotency failure) | DATA | 1 | 3 | 3 | DOCUMENT | P1 |

**Critical Risks Requiring Mitigation (Score ≥6)**:
- R1, R3, R5, R6, R7, R8, R10, R11 = **8 risks** requiring comprehensive test coverage

**Rationale**:
Money calculations (R1, R3, R5, R10) and date logic (R6) have **high impact** (wrong amounts damage user trust). AI intent detection (R8) has **high probability** (natural language is ambiguous). Multi-identifier auth (R11) and job monitoring (R7) are **infrastructure-critical**.

---

## Test Strategy

### Test Pyramid Distribution

```
         E2E (10%)
      ─────────────
     /             \
    /  Integration  \
   /      (30%)      \
  /─────────────────\
 /                   \
/       Unit          \
\       (60%)         /
 ─────────────────────
```

**Rationale**: WhatsApp bot testing favors **integration tests** over pure E2E because:
1. Full WhatsApp E2E requires real phone number + Baileys socket (slow, brittle)
2. Integration tests can mock WhatsApp delivery while testing DB + job logic
3. Unit tests cover money math, date calculations, message formatting (fast, reliable)

### Test Level Guidelines

| Feature Area | Primary Level | Secondary Level | Rationale |
|--------------|---------------|-----------------|-----------|
| **Money calculations** (installments, budgets, totals) | Unit | Integration (DB queries) | Pure math → unit tests. DB aggregation → integration. |
| **Statement period logic** (Feb 31, leap years) | Unit | Integration (function calls) | Date edge cases → unit tests. PostgreSQL function → integration. |
| **AI intent detection** | Integration | Unit (pattern matching) | OpenAI API mock → integration. Explicit commands → unit. |
| **Cron job scheduling** | Integration | - | Job execution requires DB + time mocking. |
| **WhatsApp delivery** | Integration (mocked) | E2E (manual, limited) | Mock Baileys send in CI. Manual E2E for delivery verification. |
| **Multi-identifier auth** | Integration | Unit (lookup logic) | DB cascade (JID→LID→phone) → integration. |
| **Conversation state** | Integration | Unit (state machine) | Redis/DB state persistence → integration. |
| **Localization** | Unit | Integration (message builder) | Template interpolation → unit. Full message → integration. |

---

## Test Scenarios by Epic

### Epic 1: Credit Mode Selection & Foundation

#### Scenario 1.1: Enable Credit Mode on Credit Card
**Test ID**: E1-S1-INT-001
**Priority**: P0
**Risk Coverage**: R9 (mode toggle mid-month)
**Test Level**: Integration
**Preconditions**: User has existing credit card in Simple Mode
**Steps**:
1. User sends "mudar para modo crédito" via WhatsApp
2. AI detects `switch_credit_mode` intent
3. System queries `payment_methods` WHERE `user_id` = X AND `type` = 'credit_card'
4. Display card selection if multiple cards
5. Call `switch_to_credit_mode(payment_method_id)`
6. Verify `credit_mode = true` in database
7. Verify confirmation message sent: "Cartão [Name] agora está em Modo Crédito"

**Expected Results**:
- `payment_methods.credit_mode = true`
- Confirmation message delivered successfully
- PostHog event `credit_mode_enabled` tracked

**Edge Cases**:
- User has 0 credit cards → Error: "Você não tem cartões de crédito"
- User toggles mid-month with existing transactions → Transactions remain unchanged
- User has Simple Mode expenses this month → Warning message about mixed modes

**Test Data**:
- User with 1 credit card (Simple Mode)
- User with 3 credit cards (test multi-selection flow)

---

#### Scenario 1.2: Multi-Identifier WhatsApp Authorization
**Test ID**: E1-S2-INT-002
**Priority**: P1
**Risk Coverage**: R2, R11 (wrong user delivery, Business account auth)
**Test Level**: Integration
**Preconditions**: User registered with phone number
**Steps**:
1. Simulate WhatsApp message from Business account (LID identifier)
2. Extract identifiers: `{ jid: null, lid: '12345', phone: null }`
3. Call `find_user_by_whatsapp_identifier(jid, lid, phone)`
4. Verify cascade lookup: JID → LID → phone
5. Verify correct user retrieved
6. Sync identifiers: Update `whatsapp_lid` in database

**Expected Results**:
- User found via LID identifier
- Database updated with `whatsapp_lid`
- Message processed for correct user

**Edge Cases**:
- Regular WhatsApp (JID only) → Lookup succeeds via JID
- Unknown identifier (all NULL) → Error: "Número não autorizado"
- Identifier sync updates existing user → No duplicate user created

**Test Data**:
- User with JID only (regular WhatsApp)
- User with LID (Business account)
- User with phone number only (legacy)

---

### Epic 2: Installment Management

#### Scenario 2.1: Create Installment Purchase via WhatsApp
**Test ID**: E2-S1-INT-003
**Priority**: P0
**Risk Coverage**: R1 (installment payment calculation)
**Test Level**: Integration
**Preconditions**: User has Credit Mode credit card with `statement_closing_day` set
**Steps**:
1. User sends "celular 1200 em 12x no nubank"
2. AI detects `add_expense_installment` intent
3. Extract: description="celular", total=1200, installments=12, payment_method="nubank"
4. Confirm with user: "Você quer parcelar R$ 1.200 em 12x de R$ 100?"
5. User confirms: "sim"
6. Call `create_installment_plan(user_id, payment_method_id, total_amount, installment_count, description, first_due_date)`
7. Verify database records:
   - `installment_plans` table: 1 row (total=1200, count=12, status='active')
   - `installment_payments` table: 12 rows (amount=100 each, due dates spread across months)
8. Verify confirmation message includes statement period context

**Expected Results**:
- Installment plan created with 12 payments
- First payment due in current statement period
- Confirmation message: "Parcelamento criado! 12x de R$ 100. Primeira parcela na fatura atual (6 Dez - 5 Jan)."
- PostHog event `installment_plan_created` tracked

**Edge Cases**:
- Installment count > 60 → Error: "Máximo 60 parcelas"
- Total amount NOT divisible by installment count → Handle remainder (e.g., 1201 / 12 = 100.08)
- Credit Mode not enabled → Error: "Parcelamento disponível apenas em Modo Crédito"

**Unit Tests** (supporting):
- `calculateMonthlyPayment(1200, 12)` → 100.00
- `calculateMonthlyPayment(1201, 12)` → 100.08 (handles remainder)
- `generateInstallmentSchedule(12, '2025-01-05')` → Array of 12 dates

---

#### Scenario 2.2: View Future Commitments
**Test ID**: E2-S2-INT-004
**Priority**: P1
**Risk Coverage**: R1 (installment calculation in summary)
**Test Level**: Integration
**Preconditions**: User has 3 active installment plans
**Steps**:
1. User sends "compromissos futuros" or "future commitments"
2. AI detects `view_future_commitments` intent
3. Query active installment plans for user
4. Calculate total remaining balance per card
5. Calculate next 3 months projection
6. Format message with localization (pt-BR or en)

**Expected Results**:
```
💳 Compromissos Futuros - Nubank

Total restante: R$ 2.400 (24 parcelas)

Parcelamentos ativos:
• Celular: 8/12 - R$ 100/mês
• Notebook: 10/24 - R$ 200/mês
• Fone: 6/12 - R$ 50/mês

Próximos meses:
Jan/2025: R$ 350
Fev/2025: R$ 350
Mar/2025: R$ 350
```

**Edge Cases**:
- No active installments → "Você não tem parcelamentos ativos"
- Multiple cards with installments → Show per-card breakdown
- Last payment this month → Show completion message

---

#### Scenario 2.3: Pay Off Installment Early
**Test ID**: E2-S3-INT-005
**Priority**: P0
**Risk Coverage**: R10 (payoff refund calculation)
**Test Level**: Integration
**Preconditions**: User has installment with 8/12 paid (4 remaining)
**Steps**:
1. User sends "quitar parcelamento celular"
2. AI detects `payoff_installment` intent
3. Query installment plan by description match
4. Calculate remaining balance: 4 × R$ 100 = R$ 400
5. Display confirmation: "Quitar 4 parcelas restantes (R$ 400)?"
6. User confirms
7. Call `mark_installment_paid_off(plan_id, payoff_date)`
8. Verify:
   - `installment_plans.status = 'paid_off'`
   - `installment_payments` WHERE `status = 'pending'` → deleted
   - Payoff transaction created for remaining amount

**Expected Results**:
- Plan marked as `paid_off`
- Pending payments deleted
- Confirmation: "Parcelamento quitado! R$ 400 debitados."
- PostHog event `installment_paid_off` tracked

**Edge Cases**:
- Partial payoff (pay 2 of 4 remaining) → NOT supported in MVP
- Payoff on same month as last payment → Handle edge case (avoid duplicate charge)
- Payoff amount mismatch → Recalculate dynamically

**Unit Tests** (supporting):
- `calculateRemainingBalance(plan_id)` → Accurate sum of pending payments
- `generatePayoffTransaction(plan_id, payoff_date)` → Correct metadata

---

### Epic 3: Statement-Aware Budgets

#### Scenario 3.1: Statement Closing Reminder (3 Days Before)
**Test ID**: E3-S1-INT-006
**Priority**: P0
**Risk Coverage**: R4, R7 (reminder delivery failure, job monitoring)
**Test Level**: Integration
**Preconditions**: User has `statement_closing_day = 5`, today = Jan 2
**Steps**:
1. Cron job triggers `statement-reminders-job.ts` at 9 AM (12:00 UTC)
2. Query eligible users: `statement_closing_day = 5` AND `days_until_closing = 3`
3. Calculate statement period: Dec 6 - Jan 5
4. Calculate statement total (regular expenses + installment payments)
5. Build localized message (pt-BR or en)
6. Send via WhatsApp with retry (JID → LID → phone, 3 attempts)
7. Track delivery status (PostHog event)

**Expected Results**:
- Message delivered successfully to WhatsApp
- Message content:
```
📊 Lembrete: Fatura fecha em 3 dias

Cartão Nubank
Vence em: 5 de Janeiro

Total atual: R$ 1.450
Orçamento: R$ 2.000 (27% restante)

Período: 6 Dez - 5 Jan
```

**Edge Cases**:
- Delivery failure → Retry 3 times with exponential backoff (1s, 5s)
- User opted out → Skip reminder (check `statement_reminders_enabled = false`)
- Multiple cards → Send separate reminder per card
- Budget NOT set → Omit budget section from message
- Budget exceeded → Awareness-first language: "R$ 200 acima do planejado" (NOT "OVERSPENT!")

**Performance Requirements**:
- Job completes in < 30 seconds for 100 users (NFR6)
- Delivery success rate ≥ 99.5% (NFR8)

**Monitoring**:
- Alert if job doesn't run for 2 consecutive days
- Alert if delivery success rate < 99%

---

#### Scenario 3.2: Statement Summary with Category Breakdown
**Test ID**: E3-S2-INT-007
**Priority**: P1
**Risk Coverage**: R8 (AI intent detection), R14 (query performance)
**Test Level**: Integration
**Preconditions**: User has transactions across 5 categories in current statement
**Steps**:
1. User sends "resumo da fatura" (natural language)
2. AI detects `view_statement_summary` intent
3. Calculate current statement period (closing_day = 5)
4. Query transactions GROUP BY category
5. Include installment payments with description context ("Celular 3/12")
6. Calculate category percentages
7. Format message with top 5 categories + "Outros"

**Expected Results**:
```
📊 Resumo da Fatura - Nubank

Período: 6 Dez - 5 Jan
Total: R$ 1.450
Orçamento: R$ 2.000 (on-track)

Categorias:
🍔 Alimentação: R$ 600 (41%)
🛒 Supermercado: R$ 350 (24%)
🚗 Transporte: R$ 200 (14%)
📱 Assinaturas: R$ 150 (10%)
  • Netflix: R$ 50
  • Celular parcelado 3/12: R$ 100
💡 Outros: R$ 150 (11%)

Total de transações: 28
```

**Edge Cases**:
- No transactions in period → "Você ainda não tem gastos neste período"
- Only installment payments → Show installment context
- Query timeout (> 500ms) → Alert and retry
- AI fails to detect intent → Fallback to explicit command "/resumo"

**Performance Requirements**:
- Query completes in < 500ms (NFR Epic3-P2)
- Works with 100+ transactions in period

**Unit Tests** (supporting):
- `formatStatementSummaryMessage(summary, locale)` → Correct pt-BR/en format
- `calculateCategoryPercentages(transactions)` → Accurate percentages

---

#### Scenario 3.3: Budget Progress Calculation (with Installments)
**Test ID**: E3-S3-UNIT-001
**Priority**: P0
**Risk Coverage**: R5 (budget excludes installments)
**Test Level**: Unit + Integration
**Preconditions**: User has budget=2000, regular expenses=1200, installment payments=250
**Steps** (Unit):
1. Call `calculateStatementBudgetSpent(payment_method_id, period_start, period_end)`
2. Verify query includes:
   - Regular expenses: `SUM(transactions WHERE type='expense')`
   - Installment payments: `SUM(installment_payments WHERE due_date IN period)`
3. Verify total = 1200 + 250 = 1450

**Steps** (Integration):
1. Seed database:
   - 10 regular transactions (total = 1200)
   - 5 installment payments (total = 250)
2. Call database function `calculate_statement_budget_spent()`
3. Verify returned value = 1450

**Expected Results**:
- Budget spent = 1450
- Remaining = 2000 - 1450 = 550
- Percentage = (1450 / 2000) * 100 = 72.5%
- Status = "on-track" (< 80%)

**Edge Cases**:
- No installments → Only regular expenses counted
- Budget = NULL → Calculation skipped
- Spent > Budget → Status = "exceeded", awareness language used

**Performance Requirements**:
- Calculation < 200ms (NFR5 - critical path)

---

### Epic 4: Payment Reminders & Auto-Accounting

#### Scenario 4.1: Payment Due Reminder (2 Days Before)
**Test ID**: E4-S1-INT-008
**Priority**: P0
**Risk Coverage**: R4, R7 (reminder delivery, job monitoring)
**Test Level**: Integration
**Preconditions**: `statement_closing_day = 5`, `payment_due_day = 10`, today = Jan 13
**Steps**:
1. Cron job triggers `credit-card-payment-reminders-job.ts` at 9 AM
2. Query eligible users: `due_date = TODAY + 2 days`
3. Calculate due date: closing (Jan 5) + payment_due_day (10) = Jan 15
4. Calculate statement total (same as Epic 3 logic)
5. Build reminder message
6. Send via WhatsApp with retry

**Expected Results**:
```
💳 Lembrete: Pagamento do cartão

Vence em 2 dias (15 de Janeiro)
💰 Valor: R$ 1.450,00

Cartão Nubank
Período: 6 Dez - 5 Jan

Não esqueça de realizar o pagamento! 😊
```

**Edge Cases**:
- User opted out → Skip reminder
- Multiple cards with different due dates → Separate reminders
- Delivery failure → Retry 3x with backoff

**Performance Requirements**:
- Job < 30 seconds for 100 users (NFR6)
- Delivery ≥ 99.5% success (NFR8)

---

#### Scenario 4.2: Auto-Payment Transaction Creation
**Test ID**: E4-S2-INT-009
**Priority**: P0
**Risk Coverage**: R3, R15 (wrong amount, duplicate creation)
**Test Level**: Integration
**Preconditions**: Statement closed yesterday (closing_day = 5, today = Jan 6)
**Steps**:
1. Cron job triggers `auto-payment-transactions-job.ts` at 1 AM
2. Query closed statements: `statement_closing_day = EXTRACT(DAY FROM YESTERDAY)`
3. Calculate statement total (Epic 3 logic reused)
4. Get system category: "Pagamento Cartão de Crédito"
5. Create transaction:
   - `date = due_date` (Jan 15)
   - `amount = statement_total` (1450)
   - `description = "Pagamento Cartão Nubank - Fatura Jan/2025"`
   - `category_id = system_category_id`
   - `metadata = { auto_generated: true, credit_card_id, statement_period }`
6. Idempotency check: Prevent duplicate if already exists

**Expected Results**:
- Transaction created with date = Jan 15 (payment month, NOT usage month)
- Amount = R$ 1,450 (matches statement total)
- Badge shows "Auto-gerado" in web UI
- PostHog event `auto_payment_created` tracked

**Edge Cases**:
- Statement total = R$ 0 → Create payment anyway (user might owe fees)
- Duplicate run (job runs twice) → Idempotency check prevents duplicate
- Default bank account NOT set → `payment_method_id = NULL`

**Performance Requirements**:
- Transaction creation < 200ms per statement (NFR-Epic4-P3)
- Job success rate = 100% (NFR12)

**Unit Tests** (supporting):
- `calculatePaymentDueDate(closing_day=5, payment_due_day=10)` → Jan 15
- `formatPaymentDescription(card_name, month)` → "Pagamento Cartão Nubank - Fatura Jan/2025"

---

#### Scenario 4.3: System Category Protection
**Test ID**: E4-S3-INT-010
**Priority**: P1
**Risk Coverage**: R7 (operational failure if category deleted)
**Test Level**: Integration
**Preconditions**: System category "Pagamento Cartão de Crédito" exists
**Steps**:
1. User attempts to delete system category via web UI
2. Server action validates `is_system = false` before deletion
3. Verify deletion blocked with error: "Categorias do sistema não podem ser deletadas"

**Expected Results**:
- Category NOT deleted
- Error message displayed
- Database RLS policy enforces protection

**Edge Cases**:
- User edits category name/icon → Allowed (customization OK)
- Migration rollback → WARNING: Do not rollback after auto-payments created

---

## Cross-Cutting Test Scenarios

### Scenario X.1: Localization (pt-BR vs English)
**Test ID**: X-S1-UNIT-002
**Priority**: P2
**Risk Coverage**: R13 (wrong language)
**Test Level**: Unit
**Steps**:
1. Set user locale = "pt-BR"
2. Build statement reminder message
3. Verify Portuguese templates used
4. Set user locale = "en"
5. Build statement reminder message
6. Verify English templates used

**Expected Results**:
- pt-BR: "Lembrete: Fatura fecha em 3 dias"
- English: "Reminder: Statement closes in 3 days"

**Edge Cases**:
- Invalid locale → Fallback to "pt-BR" (default)

---

### Scenario X.2: Timezone Handling (Brazil Time)
**Test ID**: X-S2-INT-011
**Priority**: P2
**Risk Coverage**: R12 (wrong reminder time)
**Test Level**: Integration
**Steps**:
1. Set Railway env `TZ=America/Sao_Paulo`
2. Schedule cron job `0 12 * * *` (9 AM Brazil = 12:00 UTC)
3. Verify job runs at 9 AM local time
4. Verify due date calculations use Brazil timezone

**Expected Results**:
- Job runs at correct local time
- Dates calculated consistently

**Edge Cases**:
- Daylight Saving Time transition → Verify no job skip/duplicate

---

### Scenario X.3: Conversation State Persistence
**Test ID**: X-S3-INT-012
**Priority**: P1
**Risk Coverage**: R9 (state loss during multi-step flows)
**Test Level**: Integration
**Preconditions**: User has multiple credit cards
**Steps**:
1. User sends "quero ver compromissos"
2. System asks: "Qual cartão?"
3. Store conversation state: `pending_action = 'view_future_commitments'`
4. User responds: "Nubank"
5. Retrieve state, complete action with selected card

**Expected Results**:
- State persisted across messages
- Correct card selected
- Action completed

**Edge Cases**:
- State timeout (5 minutes) → Clear state, ask user to restart
- User sends unrelated message → Clear state

---

## Test Coverage Summary

### Coverage by Priority

| Priority | Scenarios | Unit Tests | Integration Tests | E2E Tests | Manual Tests |
|----------|-----------|------------|-------------------|-----------|--------------|
| **P0**   | 8         | 15         | 8                 | 0         | 2            |
| **P1**   | 6         | 8          | 6                 | 0         | 3            |
| **P2**   | 3         | 4          | 3                 | 0         | 1            |
| **P3**   | 1         | 2          | 1                 | 0         | 0            |
| **Total**| **18**    | **29**     | **18**            | **0**     | **6**        |

**Rationale for 0 E2E**:
- WhatsApp E2E requires real phone + Baileys socket (slow, brittle, complex setup)
- Integration tests with mocked WhatsApp delivery provide 95% confidence
- Manual E2E on staging for critical flows (payment reminder, statement summary)

---

### Coverage by Epic

| Epic | Risk Score Sum | P0 Scenarios | P1 Scenarios | Test Count |
|------|----------------|--------------|--------------|------------|
| Epic 1 (Credit Mode) | 9 | 1 | 2 | 5 |
| Epic 2 (Installments) | 18 | 3 | 1 | 8 |
| Epic 3 (Statement Budgets) | 24 | 2 | 2 | 7 |
| Epic 4 (Payment Reminders) | 15 | 2 | 1 | 6 |
| Cross-Cutting | 8 | 0 | 3 | 5 |

**High-risk epics** (Epic 2, 3) receive **more comprehensive coverage** due to money calculations and date logic.

---

### Coverage by Test Level

```
Unit Tests (29)          ████████████████ 60%
Integration Tests (18)   █████████ 30%
E2E Tests (0)            — 0%
Manual Tests (6)         ███ 10%
```

Aligns with **testing pyramid philosophy**: Heavy unit coverage for business logic, integration for DB/API, minimal E2E.

---

## Non-Functional Testing

### Performance Testing (NFRs)

| NFR | Requirement | Test Approach | Target | Priority |
|-----|-------------|---------------|--------|----------|
| **NFR5** | Budget calculation < 200ms | Load test with 1000 transactions | < 200ms P99 | P0 |
| **NFR6** | Reminder job < 30s for all users | Execute job with 100 users | < 30s total | P0 |
| **NFR8** | Reminder delivery ≥ 99.5% | Simulate 1000 reminders with network failures | ≥ 995 delivered | P0 |
| **Epic3-P2** | Statement summary < 500ms | Query with 100 transactions, 20 categories | < 500ms P95 | P1 |
| **Epic4-P3** | Payment transaction creation < 200ms | Batch create 50 transactions | < 200ms avg | P1 |

**Tools**: Artillery for load testing, Jest with performance timers

---

### Security Testing

| Risk | Test Scenario | Approach | Priority |
|------|---------------|----------|----------|
| **R2** | Message sent to wrong user | Integration test with multiple users, verify isolation | P1 |
| **R11** | WhatsApp identifier lookup failure | Test JID/LID/phone cascade with mocked identifiers | P1 |
| **System category deletion** | Attempt DELETE via API, verify RLS blocks | Integration test with SQL injection attempts | P1 |

---

### Reliability Testing

| Scenario | Test Approach | Target | Priority |
|----------|---------------|--------|----------|
| **Cron job failure** | Simulate Railway restart mid-job | Job restarts safely, no duplicate processing | P1 |
| **WhatsApp API timeout** | Mock Baileys timeout, verify retry logic | 3 retries with exponential backoff | P0 |
| **Database transaction rollback** | Simulate constraint violation during payment creation | Rollback, no orphaned records | P0 |

---

## Test Data Requirements

### Seed Data (Required for All Tests)

**Users**:
- User A: Regular WhatsApp (JID), pt-BR locale, 1 credit card (Credit Mode)
- User B: WhatsApp Business (LID), English locale, 3 credit cards (mixed modes)
- User C: Legacy (phone only), opted out of reminders
- User D: Budget set (R$ 2,000), multiple installments

**Payment Methods**:
- Credit Card 1: Nubank, Credit Mode, `statement_closing_day = 5`, `payment_due_day = 10`, budget = R$ 2,000
- Credit Card 2: Inter, Simple Mode
- Credit Card 3: C6, Credit Mode, no budget set

**Transactions**:
- 50 regular expenses across 5 categories (Dec 6 - Jan 5)
- 5 installment plans (varying stages: 2/12, 8/12, 11/12 paid)

**System Data**:
- System category: "Pagamento Cartão de Crédito" (`is_system = true`)

---

### Mock Data (For Unit Tests)

```typescript
// Example: Mock installment plan
const mockInstallmentPlan = {
  id: 'plan-123',
  user_id: 'user-a',
  payment_method_id: 'nubank',
  total_amount: 1200,
  installment_count: 12,
  monthly_payment: 100,
  current_installment: 3,
  status: 'active'
}

// Example: Mock statement summary
const mockStatementSummary = {
  period_start: new Date('2024-12-06'),
  period_end: new Date('2025-01-05'),
  total_spent: 1450,
  categories: [
    { name: 'Alimentação', amount: 600, percentage: 41 },
    { name: 'Supermercado', amount: 350, percentage: 24 }
  ]
}
```

---

## Gap Analysis (Existing vs Required Tests)

### Existing Test Files (Found via Glob)

**Handlers**:
- ✅ `installment-handler.test.ts` (Epic 2)
- ✅ `future-commitments-handler.test.ts` (Epic 2)
- ⚠️ `mode-selection.test.ts` (Epic 1 - needs expansion)

**Schedulers**:
- ✅ `statement-reminders-job.test.ts` (Epic 3)
- ✅ `auto-payment-transactions-job.test.ts` (Epic 4)
- ✅ `transaction-creator.test.ts` (Epic 4)

**Services**:
- ✅ `reminder-message-builder.test.ts` (Epic 3)
- ✅ `statement-reminder-query.test.ts` (Epic 3)
- ✅ `error-classifier.test.ts` (Epic 3)

### Coverage Gaps (MUST IMPLEMENT)

**High Priority Gaps** (P0/P1):
1. ❌ **Budget calculation with installments** (R5 - Epic 3) - Unit + Integration tests REQUIRED
2. ❌ **Statement period edge cases** (R6 - Epic 3) - Unit tests for Feb 31, leap years REQUIRED
3. ❌ **Multi-identifier auth cascade** (R11 - Epic 1) - Integration test for JID→LID→phone REQUIRED
4. ❌ **Installment payoff calculation** (R10 - Epic 2) - Unit tests for remaining balance REQUIRED
5. ❌ **AI intent detection accuracy** (R8 - Epic 3) - Integration tests for natural language patterns REQUIRED
6. ❌ **Job monitoring/alerts** (R7 - Epic 3/4) - Integration tests for failure scenarios REQUIRED
7. ❌ **Timezone handling** (R12 - Epic 4) - Integration tests for cron execution REQUIRED

**Medium Priority Gaps** (P2):
1. ⚠️ **Localization coverage** (R13) - Unit tests for pt-BR/en messages
2. ⚠️ **Conversation state persistence** (R9) - Integration tests for multi-step flows
3. ⚠️ **Performance tests** (NFR5, NFR6, NFR8) - Load tests for budget/job/delivery

---

## Test Execution Plan

### Phase 1: Critical Path Coverage (Week 1)
**Goal**: Achieve P0 coverage (money, data integrity, auth)

1. **Unit Tests** (Day 1-2):
   - Budget calculation with installments (R5)
   - Statement period edge cases (R6)
   - Installment payoff calculation (R10)
   - Payment due date calculation (Epic 4)

2. **Integration Tests** (Day 3-5):
   - Multi-identifier auth cascade (R11)
   - Installment plan creation end-to-end (R1)
   - Auto-payment transaction creation (R3)
   - Budget progress query with installments (R5)

3. **Manual Tests** (Day 5):
   - WhatsApp reminder delivery (send to real phone)
   - Statement summary formatting verification

### Phase 2: Core Functionality Coverage (Week 2)
**Goal**: Achieve P1 coverage (user experience, job reliability)

1. **Integration Tests** (Day 1-3):
   - Statement reminder job execution (R7)
   - Payment reminder job execution (R7)
   - AI intent detection patterns (R8)
   - Conversation state persistence (R9)

2. **Performance Tests** (Day 4):
   - Budget calculation < 200ms (NFR5)
   - Reminder job < 30s (NFR6)
   - Statement summary < 500ms (Epic3-P2)

3. **Reliability Tests** (Day 5):
   - Cron job failure recovery (R7)
   - WhatsApp delivery retry (R4, NFR8)

### Phase 3: Extended Coverage (Week 3)
**Goal**: Achieve P2 coverage + regression tests

1. **Localization Tests** (Day 1):
   - pt-BR message templates
   - English message templates
   - Date/currency formatting

2. **Edge Cases** (Day 2-3):
   - Timezone transitions
   - System category protection
   - Idempotency checks

3. **Regression Suite** (Day 4-5):
   - Run full test suite
   - Fix failing tests
   - Baseline performance metrics

---

## Success Criteria

### Definition of Done (Test Design)

✅ All P0 scenarios have corresponding tests (100%)
✅ All critical risks (score ≥6) have mitigation tests (100%)
✅ Unit test coverage ≥ 60% for business logic modules
✅ Integration test coverage for all DB functions and jobs
✅ Performance tests meet NFR targets (NFR5, NFR6, NFR8)
✅ Manual E2E verification completed for WhatsApp delivery
✅ Test data seed scripts created
✅ CI/CD pipeline configured to run tests on PR

### Quality Gate (Before Production)

❌ **FAIL** if:
- Any P0 test fails
- Performance tests fail NFR targets
- Reminder delivery success < 99.5%
- Budget calculation includes errors (money accuracy = 100%)

⚠️ **CONCERNS** if:
- Any P1 test fails
- Coverage < 60% (unit) or < 30% (integration)
- Manual tests reveal UX issues

✅ **PASS** if:
- All P0 tests pass
- ≥ 80% P1 tests pass
- NFRs met
- No critical bugs found in manual testing

---

## Maintenance and Evolution

### Test Maintenance Strategy

**Monthly**:
- Review test failure patterns (identify flaky tests)
- Update test data to reflect production usage patterns
- Review risk scores based on production incidents

**Quarterly**:
- Re-assess priorities based on feature usage analytics
- Refactor duplicate tests
- Archive obsolete tests (deprecated features)

**On Incident**:
- Add regression test for root cause
- Increase priority of related tests
- Review coverage gaps in affected area

---

## Appendix

### Test Tagging Strategy

```typescript
// Example test with tags
test('create installment plan via WhatsApp @p0 @epic2 @integration @money', async () => {
  // Test implementation
})
```

**Tag Categories**:
- Priority: `@p0`, `@p1`, `@p2`, `@p3`
- Epic: `@epic1`, `@epic2`, `@epic3`, `@epic4`
- Level: `@unit`, `@integration`, `@e2e`, `@manual`
- Risk: `@money`, `@date`, `@auth`, `@performance`, `@security`

**Run Commands**:
```bash
# P0 only (critical paths)
npm test -- --grep @p0

# Epic 2 integration tests
npm test -- --grep "@epic2.*@integration"

# Money-related tests
npm test -- --grep @money
```

---

### Risk Traceability Matrix

| Risk ID | Risk Description | Test IDs | Coverage Status |
|---------|------------------|----------|-----------------|
| R1 | Incorrect installment calculation | E2-S1-INT-003, E3-S3-UNIT-001 | ✅ COVERED |
| R3 | Wrong auto-payment amount | E4-S2-INT-009 | ✅ COVERED |
| R5 | Budget excludes installments | E3-S3-UNIT-001 | ✅ COVERED |
| R6 | Statement period Feb 31 bug | (Unit tests TBD) | ❌ GAP |
| R7 | Job failure silent | E3-S1-INT-006, E4-S1-INT-008 | ⚠️ PARTIAL |
| R8 | AI intent detection miss | E3-S2-INT-007 | ⚠️ PARTIAL |
| R10 | Payoff refund wrong | E2-S3-INT-005 | ✅ COVERED |
| R11 | Multi-identifier auth fail | E1-S2-INT-002 | ✅ COVERED |

---

**Test Design Complete**: 2025-12-09
**Next Steps**: Execute Phase 1 (Critical Path Coverage)
**Review Cycle**: After Phase 1 completion

---

*Generated by Murat (Master Test Architect) | Risk-based, data-driven, depth scales with impact*
