# NexFinApp - Epic Breakdown

**Author:** Lucas
**Date:** 2025-12-02
**Project Level:** Brownfield Enhancement
**Target Scale:** 10,000 users

---

## Overview

This document provides the complete epic and story breakdown for NexFinApp's Credit Card Management & AI Helper System, decomposing the requirements from the [PRD](./prd.md) into implementable stories.

**Living Document Notice:** This is the initial version created from PRD + Architecture. Can be enhanced with UX Design details later.

**Context Incorporated:**
- ✅ PRD requirements (95 FRs)
- ✅ Architecture technical decisions
- ℹ️ No UX Design (basic structure, can enhance later)

---

## Functional Requirements Inventory

### Epic A: Credit Card Management (FR1-FR42)

#### Mental Model & Opt-In (FR1-FR7)
| FR | Description |
|----|-------------|
| FR1 | System detects when user adds first credit card transaction |
| FR2 | System prompts user to choose between Credit Mode and Simple Mode |
| FR3 | System stores user's credit card mode preference (credit/simple) per payment method |
| FR4 | Users can switch between Credit Mode and Simple Mode at any time |
| FR5 | System warns user about data implications when switching modes (installments affected) |
| FR6 | Simple Mode users see credit cards treated as regular expenses (existing behavior) |
| FR7 | Credit Mode users access credit-specific features (budgets, installments, statements) |

#### User-Defined Budgets (FR8-FR12)
| FR | Description |
|----|-------------|
| FR8 | Credit Mode users can set a personal monthly credit card budget (separate from bank limit) |
| FR9 | System tracks spending against user-defined budget, not credit limit |
| FR10 | Users can edit monthly budget at any time |
| FR11 | System displays budget progress: spent amount, remaining, and percentage |
| FR12 | System uses awareness-first language when budget is exceeded (no judgment) |

#### Installment Tracking - Parcelamento (FR13-FR23)
| FR | Description |
|----|-------------|
| FR13 | Users can add expenses with installment information (total amount + number of installments) |
| FR14 | System creates parent installment record with full amount and duration |
| FR15 | System automatically creates monthly expense entries for each installment payment |
| FR16 | System distributes installment payments across correct months from purchase date |
| FR17 | System displays "future commitments" showing total upcoming installment obligations per month |
| FR18 | Only the monthly installment payment counts against monthly budget (not full amount) |
| FR19 | Users can view all active installments with remaining payments |
| FR20 | Users can mark installments as "paid off early" |
| FR21 | Early payoff recalculates future commitment totals |
| FR22 | Users can edit or delete installment records |
| FR23 | Deleting installment removes all future monthly payments |

#### Statement Awareness (FR24-FR29)
| FR | Description |
|----|-------------|
| FR24 | Credit Mode users can set their credit card statement closing date |
| FR25 | System sends WhatsApp reminder 3 days before statement closing date |
| FR26 | Statement reminder includes current statement total |
| FR27 | System distinguishes expenses on current statement vs next statement |
| FR28 | Users can view pre-statement summary with category breakdown |
| FR29 | Statement reminders use neutral, awareness-first tone |

#### Payment Due Date (FR30-FR36)
| FR | Description |
|----|-------------|
| FR30 | Credit Mode users can set credit card payment due date |
| FR31 | System sends WhatsApp reminder 2 days before payment due date |
| FR32 | Payment reminder includes total amount due |
| FR33 | System auto-creates "Credit Card Payment" expense transaction in next month |
| FR34 | Payment expense uses system category "Pagamento Cartão de Crédito" |
| FR35 | Payment transaction separates current month usage from actual payment |
| FR36 | Users can edit or delete auto-generated payment transactions |

#### Awareness-First Language & UX (FR37-FR42)
| FR | Description |
|----|-------------|
| FR37 | All credit card features use awareness-first language (no judgment terminology) |
| FR38 | System replaces "overspent" with "spent more than planned" |
| FR39 | System replaces "warning" with "heads up" |
| FR40 | Budget visualizations use neutral colors (no red for overspending) |
| FR41 | System celebrates staying within budget with positive reinforcement |
| FR42 | All error messages maintain dignity-first tone |

### Epic B: AI Helper System (FR43-FR73)

#### Platform Infrastructure (FR43-FR46)
| FR | Description |
|----|-------------|
| FR43 | System integrates with PostHog feature flags for helper system control |
| FR44 | Feature flags support gradual rollout (5%, 25%, 50%, 100%) |
| FR45 | System supports instant feature flag rollback |
| FR46 | Environment variable fallback enables/disables helper system |

#### Helper Architecture (FR47-FR52)
| FR | Description |
|----|-------------|
| FR47 | System implements base helper architecture with shared conversational logic |
| FR48 | System routes user messages to appropriate domain helper based on keywords |
| FR49 | Helper system coexists with existing 3-layer NLP system |
| FR50 | Helpers can ask clarifying questions before executing actions |
| FR51 | Helpers prioritize education over immediate execution |
| FR52 | Helper conversations support multi-turn interactions |

#### Domain Helpers - MVP (FR53-FR62)
| FR | Description |
|----|-------------|
| FR53 | Credit Card Helper responds to "ajuda cartão" and variations |
| FR54 | Credit Card Helper explains Credit Mode vs Simple Mode |
| FR55 | Credit Card Helper teaches installment tracking syntax |
| FR56 | Credit Card Helper shows user's statement dates and budget status |
| FR57 | Credit Card Helper guides users through first credit card expense |
| FR58 | Transaction Helper responds to "ajuda gastos", "ajuda transações" and variations |
| FR59 | Transaction Helper explains CRUD operations (add, edit, delete) |
| FR60 | Transaction Helper shows recent transactions |
| FR61 | Transaction Helper guides category changes |
| FR62 | Transaction Helper differentiates between income and expenses |

#### Testing & Quality (FR63-FR67)
| FR | Description |
|----|-------------|
| FR63 | System supports AI integration testing with structured scenarios |
| FR64 | Test framework validates conversational quality (not just correctness) |
| FR65 | Tests cover multi-turn conversation flows |
| FR66 | Tests verify education-first behavior (explain before execute) |
| FR67 | Test results prevent regression on prompt/tool changes |

#### Rollout & Monitoring (FR68-FR73)
| FR | Description |
|----|-------------|
| FR68 | System logs all helper interactions with user ID and timestamp |
| FR69 | System tracks helper usage metrics (invocations, conversation depth, success rate) |
| FR70 | System monitors error rates per helper domain |
| FR71 | System supports gradual user rollout with cohort tracking |
| FR72 | Old AI system remains accessible during helper system rollout |
| FR73 | System deprecates old AI system 2 months after 100% rollout |

### Growth Features (FR74-FR86)

#### Catch-Up Mode (FR74-FR76)
| FR | Description |
|----|-------------|
| FR74 | System detects multi-day gaps in expense entry |
| FR75 | System offers guilt-free catch-up flow with "Welcome back" messaging |
| FR76 | Catch-up mode optimizes bulk entry workflow |

#### Enhanced Awareness (FR77-FR81)
| FR | Description |
|----|-------------|
| FR77 | System calculates "real available credit" (limit minus future installments) |
| FR78 | System displays future installment obligations on dashboard |
| FR79 | System sends pre-statement category breakdown summary |
| FR80 | System identifies spending personality patterns (weekend spender, etc.) |
| FR81 | Spending patterns use neutral archetypes (no judgment) |

#### Additional Domain Helpers (FR82-FR86)
| FR | Description |
|----|-------------|
| FR82 | Budget Helper responds to "ajuda orçamento" |
| FR83 | Reports Helper responds to "ajuda relatórios", "ajuda saldo" |
| FR84 | Recurring Helper responds to "ajuda recorrentes", "ajuda assinaturas" |
| FR85 | Category Helper responds to "ajuda categorias" |
| FR86 | Income Helper responds to "ajuda receitas", "ajuda renda" |

### Analytics & Learning (FR87-FR95)
| FR | Description |
|----|-------------|
| FR87 | System tracks Credit Mode vs Simple Mode adoption rates |
| FR88 | System tracks installment creation and editing patterns |
| FR89 | System tracks manual entry frequency before/after credit features |
| FR90 | System tracks helper usage rates per domain |
| FR91 | System tracks conversation depth (single-turn vs multi-turn) |
| FR92 | System tracks mode switching (Credit ↔ Simple) |
| FR93 | System tracks statement reminder open rates |
| FR94 | System tracks budget vs limit preference (user-defined vs bank limit) |
| FR95 | Analytics data accessible via PostHog dashboards |

---

## Epic Summary

| Epic | Title | User Value | FRs Covered |
|------|-------|------------|-------------|
| **1** | Credit Mode Foundation | Users choose their credit card mental model (Credit Mode vs Simple Mode) | FR1-FR7 |
| **2** | Parcelamento Intelligence | Brazilian users track installment purchases and see future commitments | FR13-FR23 |
| **3** | Statement-Aware Budgets | Users track personal budgets aligned with credit card statement periods | FR8-FR12, FR24-FR29 |
| **4** | Payment Reminders & Auto-Accounting | Users receive timely payment reminders and automatic accounting separation | FR30-FR36 |
| **5** | AI Helper Platform Foundation | Users learn credit features through conversation ("ajuda cartão") | FR43-FR57, FR63-FR67, FR68-FR73 |
| **6** | Transaction Helper & Platform Validation | Users get conversational help with all expense operations | FR58-FR62 |

**Note:** FR37-FR42 (Awareness-First Language & UX) are cross-cutting quality requirements applied to ALL epics, not a separate epic. Every story will implement dignity-first tone and neutral language.

**Growth Features:** FR74-FR95 (Catch-Up Mode, Enhanced Awareness, Additional Helpers, Analytics) deferred to post-MVP.

---

## FR Coverage Map

| FR Range | Epic | Coverage Description |
|----------|------|---------------------|
| FR1-FR7 | Epic 1 | Credit Mode opt-in, mode switching, Simple Mode backward compatibility |
| FR8-FR12 | Epic 3 | User-defined monthly budgets (statement period basis) |
| FR13-FR23 | Epic 2 | Parcelamento tracking: plans, payments, future commitments, early payoff |
| FR24-FR29 | Epic 3 | Statement closing dates, reminders, period-aware spending totals |
| FR30-FR36 | Epic 4 | Payment due reminders, auto-generated payment transactions |
| FR37-FR42 | All Epics | Awareness-first language applied across all features (cross-cutting) |
| FR43-FR46 | Epic 5 | PostHog feature flags, gradual rollout infrastructure |
| FR47-FR52 | Epic 5 | BaseHelper architecture, LLM routing, multi-turn conversations |
| FR53-FR57 | Epic 5 | Credit Card Helper domain implementation |
| FR58-FR62 | Epic 6 | Transaction Helper domain implementation |
| FR63-FR67 | Epic 5 | AI integration testing framework |
| FR68-FR73 | Epic 5 | Helper monitoring, logging, rollout management |
| FR74-FR95 | Post-MVP | Growth features deferred (22 FRs) |

**Coverage validation:** All MVP FRs (FR1-FR73, minus FR37-FR42 as cross-cutting) mapped to epics. Growth features (FR74-FR95) explicitly deferred.

---

## Epic 1: Credit Mode Foundation

**Goal:** Enable users to choose their credit card mental model—Credit Mode (installments, statements, budgets) or Simple Mode (treat as debit)—respecting different relationships with credit cards.

**FRs Covered:** FR1-FR7

**User Value:** Users aren't forced into credit-specific features if they pay cards in full monthly. Foundation for all credit features.

---

### Story 1.1: Database Schema Migration for Credit Card Features

**As a** developer,
**I want** the credit card management database schema created,
**So that** all credit features have proper storage and the mode preference system works.

**Acceptance Criteria:**

**Given** the existing NexFinApp database schema
**When** migration `034_credit_card_management.sql` is applied
**Then** the following schema changes are created:

**Payment Methods Extended:**
```sql
ALTER TABLE payment_methods
  ADD COLUMN statement_closing_day INTEGER CHECK (statement_closing_day BETWEEN 1 AND 31),
  ADD COLUMN payment_due_day INTEGER CHECK (payment_due_day > 0),
  ADD COLUMN credit_mode BOOLEAN DEFAULT false,
  ADD COLUMN monthly_budget DECIMAL(10,2);
```

**Installment Plans Table:**
```sql
CREATE TABLE installment_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  description TEXT NOT NULL,
  total_amount DECIMAL(10,2) NOT NULL,
  total_installments INTEGER NOT NULL CHECK (total_installments > 0),
  status TEXT NOT NULL CHECK (status IN ('active', 'paid_off', 'cancelled')),
  merchant TEXT,
  category_id UUID REFERENCES categories(id),
  payment_method_id UUID REFERENCES payment_methods(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Installment Payments Table:**
```sql
CREATE TABLE installment_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES installment_plans(id) ON DELETE CASCADE,
  transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
  installment_number INTEGER NOT NULL CHECK (installment_number > 0),
  amount DECIMAL(10,2) NOT NULL,
  due_date DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'paid', 'cancelled')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**And** proper indexes are created for performance:
- `idx_installment_plans_user_status` on `installment_plans(user_id, status)`
- `idx_installment_payments_plan` on `installment_payments(plan_id)`
- `idx_installment_payments_due_date_status` on `installment_payments(due_date, status)`

**And** RLS policies are enabled for user-level security

**And** migration rolls back cleanly if needed

**Prerequisites:** None (first story)

**Technical Notes:**
- Location: `fe/scripts/034_credit_card_management.sql`
- Reference: Architecture ADR-001 for complete schema
- Edge case handling: `statement_closing_day` validates 1-31, application layer handles Feb 31 → Feb 28/29
- Default `credit_mode = false` ensures backward compatibility for existing credit cards

---

### Story 1.2: First Credit Card Transaction Detection

**As a** system,
**I want** to detect when a user adds their first transaction with a credit card payment method,
**So that** I can trigger the Credit Mode vs Simple Mode choice dialog.

**Acceptance Criteria:**

**Given** a user has a payment method with `type = 'credit'`
**And** the payment method has `credit_mode = NULL` (not yet chosen)
**When** user adds an expense using this credit card for the first time
**Then** transaction is saved but NOT confirmed yet
**And** system sets flag `needs_credit_mode_selection = true`
**And** response includes prompt for mode selection

**Given** user already has `credit_mode` set (true or false)
**When** user adds expense with that credit card
**Then** transaction processes normally with NO mode prompt

**Given** user has multiple credit cards
**When** adding expense with NEW credit card (no mode set)
**Then** mode prompt shown for THAT specific card only

**Prerequisites:** Story 1.1 (database schema)

**Technical Notes:**
- WhatsApp Bot: `handlers/transactions/transactions.ts`
- Frontend: `lib/actions/transactions.ts`
- Check: `payment_method.credit_mode IS NULL AND payment_method.type = 'credit'`
- Detection happens BEFORE transaction confirmation
- Mode selection required to complete transaction

---

### Story 1.3: Credit Mode vs Simple Mode Selection (WhatsApp)

**As a** WhatsApp user adding my first credit card expense,
**I want** to choose between Credit Mode and Simple Mode with clear explanations,
**So that** I understand what each option means before committing.

**Acceptance Criteria:**

**Given** first credit card transaction triggers mode selection
**When** user receives mode choice prompt
**Then** message explains both options:

**Portuguese (pt-BR):**
```
Como você quer acompanhar este cartão?

1️⃣ Modo Crédito
- Acompanhe parcelamentos (3x, 12x, etc)
- Orçamento mensal personalizado
- Lembrete de fechamento da fatura
- Ideal para quem parcela compras

2️⃣ Modo Simples
- Trata como débito
- Sem recursos de cartão de crédito
- Ideal para quem paga a fatura em dia

Responda 1 ou 2
```

**English (en):**
```
How would you like to track this card?

1️⃣ Credit Mode
- Track installments (3x, 12x, etc)
- Personal monthly budget
- Statement closing reminders
- Ideal for installment purchases

2️⃣ Simple Mode
- Treat as debit
- No credit card features
- Ideal if you pay in full monthly

Reply 1 or 2
```

**And** response "1" sets `credit_mode = true`, confirms transaction, welcomes to Credit Mode
**And** response "2" sets `credit_mode = false`, confirms transaction, continues as normal expense
**And** invalid response prompts again with clarification

**Prerequisites:** Story 1.2 (detection)

**Technical Notes:**
- Location: `whatsapp-bot/src/handlers/credit-card/mode-selection.ts`
- Localization: `localization/pt-br.ts`, `localization/en.ts`
- Tone: Awareness-first, neutral (FR37-FR42)
- Store conversation state for follow-up response
- One emoji max per message (FR36 from original PRD)

---

### Story 1.4: Credit Mode Selection (Web Frontend)

**As a** web user adding my first credit card expense,
**I want** to choose my credit card mode through a clear dialog,
**So that** I can select the right tracking approach for my needs.

**Acceptance Criteria:**

**Given** user adding expense via web with new credit card
**When** transaction form is submitted
**Then** modal dialog appears with mode selection

**Given** mode selection modal is displayed
**Then** shows two clear options with icons:
- **Credit Mode**: Icon, benefits list (installments, budgets, statements), "Choose Credit Mode" button
- **Simple Mode**: Icon, benefits list (simple tracking, no extra features), "Choose Simple Mode" button

**And** modal has "What's the difference?" expandable section with detailed comparison

**Given** user clicks "Choose Credit Mode"
**Then** `payment_method.credit_mode = true`, modal closes, transaction confirmed, success toast shown

**Given** user clicks "Choose Simple Mode"
**Then** `payment_method.credit_mode = false`, modal closes, transaction confirmed, success toast shown

**Given** user closes modal without selecting
**Then** transaction NOT saved, returns to form

**Prerequisites:** Story 1.2 (detection)

**Technical Notes:**
- Component: `fe/components/transactions/credit-mode-selection-dialog.tsx`
- Server Action: `fe/lib/actions/payment-methods.ts` → `setCreditMode()`
- UI: Radix Dialog, neutral colors (no pressure), mobile-responsive
- Localization: next-intl for pt-BR/en
- Analytics: Track mode selection with PostHog event

---

### Story 1.5: Mode Switching with Data Implications Warning

**As a** user who wants to change my credit card mode,
**I want** to understand what happens to my existing data,
**So that** I can make an informed decision about switching modes.

**Acceptance Criteria:**

**Given** user with Credit Mode enabled and active installments
**When** user requests to switch to Simple Mode
**Then** system shows warning:

**Portuguese:**
```
⚠️ Atenção: Modo de Mudança

Você tem 3 parcelamentos ativos. O que deseja fazer?

1️⃣ Manter parcelamentos ativos
   - Próximas parcelas continuam aparecendo
   - Pode voltar para Modo Crédito depois

2️⃣ Quitar todos agora
   - Marca todos como "pagos antecipadamente"
   - Remove parcelas futuras

3️⃣ Cancelar mudança
```

**Given** user chooses option 1 (keep installments)
**Then** `credit_mode = false` but installments remain `status = 'active'`
**And** future installment payments still auto-created
**And** confirmation: "Modo alterado. Parcelamentos ativos continuam."

**Given** user chooses option 2 (pay off all)
**Then** `credit_mode = false` AND all active installments set to `status = 'paid_off'`
**And** future pending installment_payments cancelled
**And** confirmation: "Modo alterado. 3 parcelamentos marcados como quitados."

**Given** user chooses option 3
**Then** no changes made, returns to previous screen

**Given** user with NO active installments
**When** switching modes
**Then** simple confirmation dialog (no data implications warning)

**Prerequisites:** Story 1.1 (schema), Story 1.3 (mode set initially)

**Technical Notes:**
- WhatsApp: `handlers/credit-card/mode-switch.ts`
- Frontend: Dialog component with clear options
- ADR-004: Non-destructive mode switching with user choice
- Query active installments: `WHERE status = 'active'`
- Atomic operation: Update payment_method + installments in transaction

---

### Story 1.6: Simple Mode Backward Compatibility

**As a** Simple Mode user,
**I want** my credit card to work exactly like existing expense tracking,
**So that** I'm not forced into credit features I don't need.

**Acceptance Criteria:**

**Given** payment method with `credit_mode = false`
**When** user adds expense with this credit card
**Then** transaction created normally (no installment prompt, no statement period tracking)

**Given** Simple Mode credit card
**When** viewing dashboard or reports
**Then** credit card transactions appear alongside debit/cash (no special treatment)

**Given** Simple Mode credit card
**When** budgets calculated
**Then** uses calendar month (not statement period)

**Given** existing credit card users (pre-migration)
**When** database migrated
**Then** `credit_mode = NULL` (not false) to trigger selection on next transaction

**Given** user never wants to see Credit Mode features
**When** they choose Simple Mode
**Then** no prompts for installments, statements, or credit budgets

**Prerequisites:** Story 1.1 (schema)

**Technical Notes:**
- Conditional rendering: All credit features check `credit_mode = true`
- Existing transaction flow unchanged for Simple Mode
- No performance impact: Feature checks are boolean (fast)
- NFR32: Backward compatibility ensures existing users unaffected

---

## Epic 2: Parcelamento Intelligence

**Goal:** Brazilian users can track installment purchases (parcelamento), see future payment commitments, and manage installment plans—the killer feature generic expense trackers don't offer.

**FRs Covered:** FR13-FR23

**User Value:** Users understand their future credit card obligations across all installment purchases, can track "compra parcelada em 12x" naturally, and see real purchasing power.

---

### Story 2.1: Add Installment Purchase (WhatsApp)

**As a** WhatsApp user,
**I want** to log an installment purchase using natural language,
**So that** I can track "comprei 600 em 3x" without learning complex syntax.

**Acceptance Criteria:**

**Given** Credit Mode enabled user sends message "gastei 600 em 3x no celular"
**When** AI processes the message
**Then** extracts: amount=600, installments=3, description="celular"
**And** prompts for payment method if ambiguous
**And** creates installment plan with confirmation

**Given** installment creation succeeds
**Then** response shows:
```
✅ Parcelamento criado: Celular
💰 Total: R$ 600,00 em 3x de R$ 200,00
📅 Primeira parcela: Hoje
📅 Última parcela: Março 2025

Suas próximas parcelas aparecem automaticamente todo mês.
```

**Given** user specifies "gastei 1200 parcelado em 12 vezes"
**Then** creates 12 monthly installments starting from today

**Given** installment variations in Portuguese:
- "comprei 450 em 9x"
- "gastei 800 parcelado 4x"
- "900 dividido em 6 parcelas"
**Then** all correctly parsed and created

**Prerequisites:** Epic 1 complete (Credit Mode enabled), Story 1.1 (database)

**Technical Notes:**
- Location: `whatsapp-bot/src/handlers/credit-card/installment-handler.ts`
- AI function: `add_installment(amount, installments, description, category, payment_method_id)`
- Installment calculation: `monthly_amount = total_amount / total_installments` (rounded to 2 decimals)
- Due dates: First installment = today, subsequent = same day next months
- Transaction creation: Create monthly transactions for each installment
- NFR3: Installment calculation < 500ms

---

### Story 2.2: Add Installment Purchase (Web Frontend)

**As a** web user,
**I want** to add an installment purchase through a clear form,
**So that** I can enter all installment details accurately.

**Acceptance Criteria:**

**Given** user on transaction form with Credit Mode credit card selected
**When** user clicks "This is an installment purchase" toggle
**Then** form reveals installment fields:
- Total Amount (R$)
- Number of Installments (1-48, dropdown)
- Monthly Payment (auto-calculated, read-only)
- First Payment Date (date picker, defaults to today)

**Given** total amount = R$ 1,200 and installments = 12
**Then** monthly payment displays: R$ 100,00 (auto-calculated)

**Given** user submits installment form
**When** validation passes
**Then** creates `installment_plan` + 12 `installment_payments` + 12 linked `transactions`
**And** shows success message: "Installment created: 12 payments of R$ 100"
**And** redirects to installments dashboard

**Given** user changes number of installments
**Then** monthly payment recalculates in real-time

**Prerequisites:** Epic 1 complete, Story 1.1 (database)

**Technical Notes:**
- Component: `fe/components/transactions/installment-form.tsx`
- Server Action: `fe/lib/actions/installments.ts` → `createInstallment()`
- Validation: Installments 1-48, amount > 0, first payment date required
- Responsive: Mobile-friendly form layout
- Analytics: Track installment creation with PostHog

---

### Story 2.3: Future Commitments Dashboard

**As a** Credit Mode user,
**I want** to see my upcoming installment obligations by month,
**So that** I understand my future credit card commitments.

**Acceptance Criteria:**

**Given** user has 3 active installment plans:
- Plan A: R$ 200/month for 5 more months
- Plan B: R$ 150/month for 3 more months
- Plan C: R$ 100/month for 8 more months

**When** user views Future Commitments dashboard
**Then** displays monthly breakdown:
```
📅 Janeiro 2025: R$ 450 (3 parcelas)
📅 Fevereiro 2025: R$ 450 (3 parcelas)
📅 Março 2025: R$ 300 (2 parcelas)
📅 Abril-Junho 2025: R$ 300/mês (2 parcelas)
📅 Julho-Agosto 2025: R$ 100/mês (1 parcela)
```

**Given** user clicks on month
**Then** expands to show which installments are due:
- "Celular - 3/12 - R$ 200"
- "Sofá - 1/3 - R$ 150"
- "Notebook - 5/8 - R$ 100"

**Given** no active installments
**Then** shows friendly empty state: "Sem parcelamentos ativos"

**Given** user on WhatsApp sends "parcelamentos" or "próximas parcelas"
**Then** receives text summary of future commitments

**Prerequisites:** Story 2.1 or 2.2 (installments created)

**Technical Notes:**
- Frontend: `fe/components/dashboard/future-commitments-widget.tsx`
- Query: Architecture ADR-001 Future Commitments query
- Cache: React Query with 5-minute stale time
- WhatsApp: `handlers/credit-card/view-installments.ts`
- Performance: Indexed query on `due_date`, `status = 'pending'`

---

### Story 2.4: View All Installments (Active & History)

**As a** user,
**I want** to see all my installment plans with payment status,
**So that** I can track progress and review past purchases.

**Acceptance Criteria:**

**Given** user views Installments page
**Then** shows tabs: "Active" (default), "Paid Off", "Cancelled"

**Given** Active tab selected
**Then** lists all plans with `status = 'active'`:
- Plan description
- Total amount
- Monthly payment
- Progress: "3/12 paid" with progress bar
- Remaining amount
- Next payment date
- Actions: View Details, Pay Off Early, Edit, Delete

**Given** user clicks "View Details" on installment
**Then** modal shows:
- Complete payment schedule (all 12 payments)
- Payment status for each (paid/pending)
- Transaction links for each payment
- Total paid vs remaining

**Given** Paid Off tab
**Then** shows completed installments with completion date

**Prerequisites:** Story 2.1 or 2.2

**Technical Notes:**
- Page: `fe/app/[locale]/installments/page.tsx`
- Component: `fe/components/installments/installment-list.tsx`
- Status badges: Active (blue), Paid Off (green), Cancelled (gray)
- Pagination: 20 per page
- Sort: Newest first, then by next payment date

---

### Story 2.5: Mark Installment as Paid Off Early

**As a** user who paid off an installment plan early,
**I want** to mark it as "paid off" and remove future payments,
**So that** my future commitments dashboard stays accurate.

**Acceptance Criteria:**

**Given** active installment with 5 remaining payments
**When** user clicks "Pay Off Early"
**Then** confirmation dialog shows:
```
Quitar parcelamento antecipadamente?

Notebook - 7/12 pagas
💰 Valor restante: R$ 500 (5x de R$ 100)

Isso irá:
✓ Marcar como "quitado"
✓ Remover 5 parcelas futuras
✓ Atualizar seus compromissos futuros

[Confirmar Quitação] [Cancelar]
```

**Given** user confirms payoff
**Then** `installment_plan.status = 'paid_off'`
**And** all `installment_payments` with `status = 'pending'` set to `status = 'cancelled'`
**And** linked future `transactions` deleted
**And** success message: "Parcelamento quitado! 5 parcelas futuras removidas."
**And** future commitments dashboard updates immediately

**Given** user on WhatsApp sends "quitar parcelamento [description]"
**Then** same flow via conversational confirmation

**Prerequisites:** Story 2.1 or 2.2, Story 2.4

**Technical Notes:**
- Action: `fe/lib/actions/installments.ts` → `payOffInstallment(planId)`
- Atomic transaction: Update plan + cancel payments + delete transactions
- NFR21: Early payoff recalculation atomic operation
- Audit: Log event with user_id, plan_id, remaining_amount
- WhatsApp: `handlers/credit-card/payoff-installment.ts`

---

### Story 2.6: Edit Installment Plan

**As a** user who made a mistake or needs to adjust an installment,
**I want** to edit installment details,
**So that** my tracking stays accurate.

**Acceptance Criteria:**

**Given** user clicks "Edit" on active installment
**Then** form pre-populates with current values:
- Description (editable)
- Category (editable)
- Total amount (editable, recalculates monthly)
- Number of installments (editable, recalculates monthly)
- Merchant (editable)

**Given** user changes total amount from R$ 1,200 to R$ 1,320
**And** 12 installments remain
**When** saved
**Then** monthly payment recalculates: R$ 110 per month
**And** all pending installment_payments updated to new amount
**And** linked pending transactions updated

**Given** user changes number of installments from 12 to 10
**Then** warning: "This will add/remove future payments"
**And** on confirm, recalculates schedule

**Given** payments already made
**Then** past payments NOT changed (only pending payments updated)

**Given** user changes description from "Celular" to "iPhone 14"
**Then** updates plan description and all linked transaction descriptions

**Prerequisites:** Story 2.1 or 2.2

**Technical Notes:**
- Component: `fe/components/installments/edit-installment-dialog.tsx`
- Server Action: `updateInstallment(planId, updates)`
- Validation: Cannot edit `status = 'paid_off'` or `status = 'cancelled'`
- Recalculation logic: Only updates `status = 'pending'` payments
- Audit trail: Log edit with old/new values

---

### Story 2.7: Delete Installment Plan

**As a** user who created an installment by mistake,
**I want** to delete the entire installment plan,
**So that** I can remove incorrect data completely.

**Acceptance Criteria:**

**Given** user clicks "Delete" on installment
**Then** confirmation dialog warns:
```
⚠️ Deletar parcelamento?

Isso irá remover permanentemente:
❌ O plano de parcelamento
❌ Todas as 12 parcelas (3 pagas, 9 pendentes)
❌ Transações vinculadas (9 futuras)

✓ As 3 transações já pagas permanecem (mas sem vínculo)

Esta ação não pode ser desfeita.

[Deletar] [Cancelar]
```

**Given** user confirms deletion
**Then** `installment_plan` deleted (CASCADE deletes all `installment_payments`)
**And** future `transactions` with `status = 'pending'` deleted
**And** past `transactions` remain but `transaction.installment_payment_id = NULL`
**And** success: "Parcelamento deletado. 9 parcelas futuras removidas."

**Given** WhatsApp user sends "deletar parcelamento [description]"
**Then** same confirmation flow

**Prerequisites:** Story 2.1 or 2.2

**Technical Notes:**
- Action: `deleteInstallment(planId)`
- ON DELETE CASCADE handles `installment_payments` deletion
- Keep paid transactions: Users need historical record of what they spent
- Orphaned transactions: Set `installment_payment_id = NULL`, keep description with suffix " (parcelamento removido)"
- FR23: Deleting installment removes all future monthly payments

---

### Story 2.8: Installment Impact on Budget Tracking

**As a** Credit Mode user,
**I want** only the monthly installment payment to count against my budget,
**So that** I'm not penalized for the full purchase amount in one month.

**Acceptance Criteria:**

**Given** user has monthly credit card budget of R$ 2,000
**And** user purchases R$ 1,200 item in 12x of R$ 100 each
**When** budget calculated for current statement period
**Then** only R$ 100 counts toward budget (not R$ 1,200)

**Given** statement period with 3 installment payments due:
- R$ 100 (Celular 3/12)
- R$ 150 (Sofá 1/3)
- R$ 200 (Notebook 5/8)
**When** budget progress displayed
**Then** shows R$ 450 from installments toward monthly budget

**Given** user views budget breakdown by category
**Then** installment payments categorized by their plan's category
**And** shows: "Electronics: R$ 100 (Celular 3/12) + R$ 200 (Notebook 5/8) = R$ 300"

**Prerequisites:** Epic 3 (budgets), Story 2.1

**Technical Notes:**
- Budget queries: Include `transactions` linked to `installment_payments` where `due_date` in period
- FR18: Only monthly installment payment counts, not total amount
- Dashboard: Show budget impact clearly: "Parcelas: R$ 450 de R$ 2,000"
- Category budgets: Each installment payment counts toward its category

---

## Epic 3: Statement-Aware Budgets

**Goal:** Users track personal spending budgets aligned with credit card statement periods (not calendar months), see pre-statement summaries, and receive awareness-first reminders.

**FRs Covered:** FR8-FR12, FR24-FR29

**User Value:** Users budget based on billing cycle (what matters for credit cards), not arbitrary calendar months. Clarity on "what's on this statement."

---

### Story 3.1: Set Statement Closing Date

**As a** Credit Mode user,
**I want** to set my credit card statement closing date,
**So that** budgets and spending totals align with my billing cycle.

**Acceptance Criteria:**

**Given** user in Credit Mode settings for a credit card
**When** user clicks "Set Statement Closing Date"
**Then** form shows:
- Closing Day (1-31, dropdown)
- Explanation: "Dia em que sua fatura fecha. Exemplo: Se fecha dia 5, gastos de 6-5 aparecem na mesma fatura."
- Preview: "Período atual: 6 Nov - 5 Dez"

**Given** user selects closing day = 15
**And** today = Dec 3, 2025
**When** saved
**Then** `payment_method.statement_closing_day = 15`
**And** current period calculated: Nov 16 - Dec 15
**And** next closing date: Dec 15

**Given** edge case: closing day = 31 and current month is February
**Then** system uses last day of month (Feb 28 or 29)
**And** shows note: "Como fevereiro não tem 31 dias, usamos o último dia do mês."

**Given** WhatsApp user sends "definir fechamento dia 10"
**Then** updates closing day with confirmation

**Prerequisites:** Epic 1 (Credit Mode enabled)

**Technical Notes:**
- Component: `fe/components/settings/statement-settings.tsx`
- Server Action: `updateStatementSettings(paymentMethodId, closingDay, dueDay)`
- Calculation: Architecture ADR-001 Statement Period Calculation
- ADR-006: Edge case handling for Feb 31 → Feb 28/29
- Validation: 1 ≤ closingDay ≤ 31

---

### Story 3.2: Set User-Defined Monthly Budget

**As a** Credit Mode user,
**I want** to set a personal monthly budget for my credit card,
**So that** I track my intention (not bank's credit limit).

**Acceptance Criteria:**

**Given** user in credit card settings
**When** user clicks "Set Monthly Budget"
**Then** form shows:
- Budget Amount (R$, decimal input)
- Explanation: "Quanto você quer gastar por mês neste cartão (independente do limite do banco)"
- Current limit reference: "Limite do cartão: R$ 10,000" (if known)

**Given** user has R$ 10,000 credit limit
**And** sets budget = R$ 2,000
**When** saved
**Then** `payment_method.monthly_budget = 2000.00`
**And** dashboard tracks against R$ 2,000 (NOT R$ 10,000)

**Given** user changes budget mid-period
**Then** new budget applies immediately to current statement period
**And** shows: "Orçamento atualizado para R$ 2,500"

**Given** WhatsApp user sends "definir orçamento 3000"
**Then** sets budget with confirmation

**Prerequisites:** Story 3.1 (statement period defined)

**Technical Notes:**
- Action: `setMonthlyBudget(paymentMethodId, amount)`
- Budget applies to statement period (not calendar month)
- FR8-FR10: User-defined budget separate from credit limit
- No judgement if exceeded: Awareness-first language

---

### Story 3.3: Budget Progress Dashboard (Statement Period)

**As a** Credit Mode user,
**I want** to see my budget progress for the current statement period,
**So that** I know where I stand before the statement closes.

**Acceptance Criteria:**

**Given** user has:
- Statement closing day: 5th
- Monthly budget: R$ 2,000
- Current period: Dec 6 - Jan 5
- Spent so far: R$ 1,450

**When** user views dashboard
**Then** budget widget shows:
```
💳 Cartão Nubank - Fatura atual
📅 Fecha em 3 dias (5 de Janeiro)

💰 R$ 1,450 de R$ 2,000
72% do orçamento
▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░

✓ Sobraram R$ 550
```

**Given** spent = R$ 2,200 (exceeds budget by R$ 200)
**Then** shows:
```
💰 R$ 2,200 de R$ 2,000
110% do orçamento
▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓

💡 R$ 200 acima do planejado
```

**Note:** Uses awareness language "acima do planejado" NOT "EXCEDEU!" or red colors

**Given** statement period changes
**Then** budget progress resets for new period
**And** previous period moves to history

**Prerequisites:** Story 3.1, Story 3.2

**Technical Notes:**
- Component: `fe/components/dashboard/statement-budget-widget.tsx`
- Query: Sum transactions WHERE `payment_method_id = X` AND `date` in statement period
- Real-time: NFR5 budget calculation < 200ms
- Colors: Neutral blues/grays (FR40), no red
- Progress bar: Linear gradient, not judgmental colors

---

### Story 3.4: Statement Closing Reminder (WhatsApp)

**As a** Credit Mode user,
**I want** a WhatsApp reminder 3 days before my statement closes,
**So that** I'm aware of my current spending before the billing cycle ends.

**Acceptance Criteria:**

**Given** user has statement_closing_day = 5
**And** today = Jan 2 (3 days before closing)
**When** daily reminder job runs
**Then** sends WhatsApp message:
```
📅 Lembrete: Fatura fecha em 3 dias

💳 Cartão Nubank
📊 Total até agora: R$ 1,450
💰 Orçamento: R$ 2,000 (72%)

✓ No caminho certo! Sobraram R$ 550 para os próximos 3 dias.
```

**Given** exceeded budget (R$ 2,200 spent, R$ 2,000 budget)
**Then** message uses awareness language:
```
📊 Total até agora: R$ 2,200
💰 Orçamento: R$ 2,000 (110%)

💡 R$ 200 acima do planejado neste período.
```

**Given** user opted out of reminders OR credit_mode = false
**Then** NO reminder sent

**Given** multiple credit cards with different closing dates
**Then** each gets separate reminder 3 days before its closing date

**Prerequisites:** Story 3.1, Story 3.2, Story 3.3

**Technical Notes:**
- Scheduler: `whatsapp-bot/src/scheduler/statement-reminders.ts`
- Job: Daily at 9 AM local time
- Query: Users WHERE `statement_closing_day - 3 = CURRENT_DAY` AND `credit_mode = true`
- FR25-FR26: Reminder 3 days before with current total
- FR29: Awareness-first tone
- NFR8: 99.5% delivery success rate

---

### Story 3.5: Pre-Statement Summary with Category Breakdown

**As a** Credit Mode user,
**I want** to see a category breakdown before my statement closes,
**So that** I understand where my money went this billing period.

**Acceptance Criteria:**

**Given** user requests "resumo da fatura" via WhatsApp
**Or** clicks "Statement Summary" on dashboard
**When** current statement period has transactions
**Then** shows breakdown:
```
📊 Resumo da Fatura Atual
📅 Período: 6 Dez - 5 Jan
💳 Cartão Nubank

Por categoria:
🍽️ Alimentação: R$ 680 (47%)
🚗 Transporte: R$ 320 (22%)
🎮 Lazer: R$ 280 (19%)
💊 Saúde: R$ 170 (12%)

💰 Total: R$ 1,450
💵 Orçamento: R$ 2,000 (72%)
```

**Given** statement includes installment payments
**Then** installments appear with context:
```
📱 Eletrônicos: R$ 400
  - Celular (3/12): R$ 200
  - Notebook (5/8): R$ 200
```

**Given** no transactions in current period
**Then** shows: "Nenhum gasto nesta fatura ainda."

**Prerequisites:** Story 3.3

**Technical Notes:**
- Component: `fe/components/dashboard/statement-summary.tsx`
- WhatsApp: `handlers/credit-card/statement-summary.ts`
- Query: Group by category, sum amounts, calculate percentages
- Installments: Join with `installment_payments` to show context
- FR28: Pre-statement summary with category breakdown

---

### Story 3.6: Current vs Next Statement Distinction

**As a** Credit Mode user,
**I want** to know which expenses are on the current statement vs next statement,
**So that** I understand what I'm paying this month vs next month.

**Acceptance Criteria:**

**Given** statement closes on Jan 5
**And** today is Jan 3
**And** transactions:
- Dec 28: R$ 50 (on CURRENT statement: Dec 6 - Jan 5)
- Jan 3: R$ 80 (on CURRENT statement)
- Jan 6: R$ 100 (on NEXT statement: Jan 6 - Feb 5)

**When** user views transaction list
**Then** each transaction shows badge:
- "Fatura atual" (blue badge)
- "Próxima fatura" (gray badge)

**Given** user on dashboard
**Then** widget shows split:
```
💳 Cartão Nubank

📊 Fatura atual (fecha em 2 dias)
R$ 1,450

📅 Próxima fatura (6 Jan - 5 Fev)
R$ 230
```

**Given** user adds expense today (Jan 3)
**Then** defaults to current statement
**And** user can manually assign to next statement if needed

**Prerequisites:** Story 3.1, Story 3.3

**Technical Notes:**
- Badge component: `fe/components/transactions/statement-badge.tsx`
- Calculation: Compare `transaction.date` to statement period boundaries
- FR27: System distinguishes current vs next statement
- Mobile: Show badges clearly without clutter

---

## Epic 4: Payment Reminders & Auto-Accounting

**Goal:** Users receive timely payment reminders before due dates and benefit from automatic payment transaction creation that separates usage from payment accounting.

**FRs Covered:** FR30-FR36

**User Value:** Never miss payment due dates; clean monthly accounting that separates "what I spent" from "what I paid."

---

### Story 4.1: Set Payment Due Date

**As a** Credit Mode user,
**I want** to set when my credit card payment is due each month,
**So that** I receive reminders at the right time.

**Acceptance Criteria:**

**Given** user in credit card settings
**When** user sets payment due date
**Then** form shows:
- Due Day (days after closing, e.g., "10 days after closing")
- Or specific day of month (1-31)
- Example: "Se fatura fecha dia 5, e vencimento é 10 dias depois, vence dia 15"

**Given** statement closes on 5th and payment due 10 days later
**When** saved
**Then** `payment_method.payment_due_day = 10` (days after closing)
**And** next due date calculated: Jan 15 (if statement closes Jan 5)

**Given** edge case: closing = 25th, due = +10 days = 5th of next month
**Then** correctly calculates cross-month due dates

**Given** WhatsApp user sends "vencimento 10 dias após fechamento"
**Then** sets due day with confirmation

**Prerequisites:** Story 3.1 (statement closing date set)

**Technical Notes:**
- Component: `fe/components/settings/payment-due-settings.tsx`
- Action: `setPaymentDueDay(paymentMethodId, daysAfterClosing)`
- Calculation: `due_date = closing_date + payment_due_day`
- FR30: Credit Mode users can set payment due date

---

### Story 4.2: Payment Due Reminder (WhatsApp)

**As a** Credit Mode user,
**I want** a WhatsApp reminder 2 days before my payment is due,
**So that** I don't forget to pay my credit card bill.

**Acceptance Criteria:**

**Given** payment due on Jan 15
**And** today is Jan 13 (2 days before)
**When** daily reminder job runs
**Then** sends WhatsApp message:
```
💳 Lembrete: Pagamento do cartão

📅 Vence em 2 dias (15 de Janeiro)
💰 Valor: R$ 1,450

Cartão Nubank
Período: 6 Dez - 5 Jan
```

**Given** user opted out of reminders
**Then** NO reminder sent

**Given** multiple credit cards with different due dates
**Then** each gets separate reminder 2 days before its due date

**Given** user clicks reminder message
**Then** can mark as paid (creates payment transaction) or dismiss

**Prerequisites:** Story 4.1, Story 3.3 (knows statement total)

**Technical Notes:**
- Scheduler: `whatsapp-bot/src/scheduler/payment-reminders.ts`
- Job: Daily at 9 AM local time
- Query: Users WHERE `payment_due_date - 2 = CURRENT_DATE` AND `credit_mode = true`
- Statement total: Sum of current statement period transactions
- FR31-FR32: Reminder 2 days before with total amount
- NFR8: 99.5% delivery success rate

---

### Story 4.3: Auto-Create Payment Transaction

**As a** Credit Mode user,
**I want** the system to automatically create a payment transaction in next month,
**So that** my monthly accounting clearly separates usage from payment.

**Acceptance Criteria:**

**Given** statement closes on Jan 5 with total R$ 1,450
**And** payment due on Jan 15
**When** statement closing date passes (Jan 5)
**Then** system auto-creates transaction:
- Date: Jan 15 (due date)
- Amount: R$ 1,450 (statement total)
- Description: "Pagamento Cartão Nubank - Fatura Jan/2025"
- Category: "Pagamento Cartão de Crédito" (system category)
- Payment Method: Bank account (user's default) or prompt to select
- Type: Expense (outgoing payment)
- Status: Pending (not yet paid)

**Given** payment transaction auto-created
**Then** appears in January budget/reports (payment month)
**And** does NOT appear in December (usage month)
**And** shows badge: "Auto-gerado" or "Pagamento automático"

**Given** user has no bank account payment method
**Then** prompts to select payment source before creating transaction

**Prerequisites:** Story 3.1, Story 4.1

**Technical Notes:**
- Scheduler: `whatsapp-bot/src/scheduler/auto-payment-transactions.ts`
- Job: Daily, checks if `closing_date = YESTERDAY` for any cards
- FR33: Auto-creates payment expense in next month
- FR34: Uses system category "Pagamento Cartão de Crédito"
- FR35: Separates usage month from payment month
- ADR-010: Use recurring payment's saved category (simple approach)

---

### Story 4.4: Edit or Delete Auto-Generated Payment

**As a** user who paid a different amount or wants to adjust,
**I want** to edit or delete the auto-generated payment transaction,
**So that** my records match reality.

**Acceptance Criteria:**

**Given** auto-generated payment transaction R$ 1,450
**And** user actually paid R$ 1,500 (paid extra)
**When** user edits transaction amount to R$ 1,500
**Then** transaction updated, marked as manually edited
**And** retains "Pagamento Cartão" tag

**Given** user paid early or used different method
**When** user edits date or payment method
**Then** changes saved without restrictions

**Given** user clicks "Delete" on auto-payment transaction
**Then** confirmation: "Deletar pagamento automático? Você pode recriá-lo depois se precisar."
**And** on confirm, transaction deleted (no cascade effects)

**Given** user deletes auto-payment
**And** next statement closes
**Then** new auto-payment created normally (deletion doesn't affect future auto-creation)

**Prerequisites:** Story 4.3

**Technical Notes:**
- Edits: Standard transaction edit flow applies
- FR36: Users can edit or delete auto-generated payments
- No special restrictions on auto-generated transactions
- Audit: Track if auto-payment was edited/deleted for analytics

---

### Story 4.5: System Category for Credit Card Payments

**As a** system administrator,
**I want** a dedicated system category for credit card payments,
**So that** payment transactions are properly categorized by default.

**Acceptance Criteria:**

**Given** database migration
**When** credit card features installed
**Then** system category created:
- Name (pt-BR): "Pagamento Cartão de Crédito"
- Name (en): "Credit Card Payment"
- Type: Expense
- System: true (cannot be deleted by users)
- Icon: Credit card icon
- Color: Neutral gray

**Given** user views category list
**Then** system category appears in list but marked as "Sistema" or "System"
**And** cannot be deleted (grayed out delete button)

**Given** user can edit system category name/icon if desired
**Then** customization allowed (helps with personalization)

**Prerequisites:** Story 1.1 (database)

**Technical Notes:**
- Migration: Create in `034_credit_card_management.sql`
- Mark as system: Add `is_system` boolean to categories table
- FR34: System category for payments
- Localization: Support pt-BR and English names

---

## Epic 5: AI Helper Platform Foundation

**Goal:** Users learn credit card features through conversational education ("ajuda cartão") with a fully feature-flagged, gradually rolled-out AI helper platform.

**FRs Covered:** FR43-FR57, FR63-FR67, FR68-FR73

**User Value:** Instead of rigid commands, users ask for help and get patient, educational responses that teach them how to use features.

---

### Story 5.1: PostHog Feature Flag Integration

**As a** developer,
**I want** PostHog feature flags integrated in both frontend and WhatsApp bot,
**So that** helper system can be gradually rolled out with instant rollback capability.

**Acceptance Criteria:**

**Given** PostHog SDK already installed (brownfield)
**When** feature flag code added
**Then** helper system checks flag before routing:

```typescript
const helpersEnabled = await posthog.isFeatureEnabled('ai-helpers', userId)
if (helpersEnabled && message.startsWith('ajuda')) {
  return helperRouter.route(message, userId)
}
```

**Given** feature flag `ai-helpers` set to 0%
**Then** all users see old system only

**Given** flag set to 5%
**Then** 5% of users randomly assigned to helpers
**And** assignment persists (same user always gets same variant)

**Given** flag set to 100%
**Then** all users access helper system

**Given** emergency issues detected
**When** admin sets flag to 0%
**Then** rollback completes within 1 minute (PostHog cache TTL)

**Prerequisites:** None (foundation)

**Technical Notes:**
- Service: `whatsapp-bot/src/services/feature-flags.ts`
- Frontend: Use existing PostHog hook `usePostHog()`
- FR43-FR45: PostHog integration, gradual rollout, instant rollback
- NFR9: Feature flag response < 100ms
- ADR-002: Pure PostHog, no environment variable fallback

---

### Story 5.2: BaseHelper Abstract Class

**As a** developer,
**I want** a reusable BaseHelper class with shared conversational logic,
**So that** all domain helpers benefit from common patterns (clarification, cost tracking, formatting).

**Acceptance Criteria:**

**Given** BaseHelper abstract class implemented
**Then** provides methods:
- `handle(message, userId, locale)`: Main entry point
- `loadUserContext(userId)`: Abstract, each helper implements
- `callOpenAI(message, systemPrompt, functions)`: Shared AI call
- `trackAICost(userId, domain, usage)`: Cost tracking
- `formatClarification(question, locale)`: Format follow-up questions
- `formatSuccessResponse(result, locale)`: Format success messages
- `executeFunction(functionCall, userId)`: Abstract, execute domain actions

**Given** helper needs to ask clarifying question
**When** AI response indicates `requiresClarification = true`
**Then** BaseHelper formats question and stores conversation state

**Given** helper executes action
**Then** BaseHelper tracks tokens used, updates user's daily AI spend

**Prerequisites:** Story 5.1

**Technical Notes:**
- Location: `whatsapp-bot/src/services/helpers/base-helper.ts`
- FR47: Base architecture with shared logic
- FR50-FR52: Clarifying questions, education-first, multi-turn conversations
- Architecture ADR-003: Class-based helper architecture
- TypeScript: Use abstract class with protected methods

---

### Story 5.3: Helper Router (LLM-Based Domain Detection)

**As a** system,
**I want** to route user "ajuda" messages to the appropriate domain helper using LLM,
**So that** routing is flexible and doesn't rely on rigid keywords.

**Acceptance Criteria:**

**Given** user sends "ajuda com parcelamentos"
**When** helper router processes message
**Then** LLM determines domain = "credit-card"
**And** routes to CreditCardHelper

**Given** user sends "ajuda gastos"
**Then** LLM determines domain = "transactions"
**And** routes to TransactionHelper

**Given** user sends "ajuda" (ambiguous)
**Then** LLM asks: "Posso ajudar com: 1) Cartão de crédito, 2) Gastos e transações. Qual você prefere?"

**Given** unsupported domain detected
**Then** responds: "Ainda não tenho um assistente para isso, mas posso ajudar com cartões e gastos."
**And** falls back to old system

**Given** routing LLM call fails
**Then** gracefully degrades to old system
**And** logs error for monitoring

**Prerequisites:** Story 5.2

**Technical Notes:**
- Location: `whatsapp-bot/src/services/helpers/helper-router.ts`
- LLM: GPT-4o-mini with function calling
- Function: `route_to_helper(domain: 'credit-card' | 'transactions' | 'unknown')`
- FR48: Routes based on LLM, not keywords
- NFR10: Graceful degradation to old NLP
- Cost: Routing call ~500 tokens (~$0.0001 per route)

---

### Story 5.4: Credit Card Helper - System Prompt & Functions

**As a** developer,
**I want** the Credit Card Helper with domain-specific prompts and functions,
**So that** users can learn about Credit Mode, installments, budgets, and statements conversationally.

**Acceptance Criteria:**

**Given** CreditCardHelper class extends BaseHelper
**Then** implements system prompt:
```
You are a credit card management assistant for Brazilian expense tracker.
Help users understand and use:
- Credit Mode vs Simple Mode
- Parcelamento (installment tracking)
- Statement-aware budgets
- Payment reminders

Always:
- Use awareness-first language (never judgmental)
- Ask clarifying questions if details missing
- Explain what you're doing and why
- Teach users how features work
```

**And** defines OpenAI functions:
- `explain_credit_mode()`: Explains Credit vs Simple Mode
- `show_installments()`: Lists active installments
- `add_installment(amount, installments, description)`: Creates installment
- `show_statement_summary()`: Shows current statement breakdown
- `set_budget(amount)`: Sets monthly budget
- `explain_parcelamento()`: Teaches installment syntax

**Given** CreditCardHelper instantiated
**Then** passes domain-specific context to OpenAI:
- User's credit cards (name, mode, budget, statement dates)
- Active installments count
- Current statement total

**Prerequisites:** Story 5.2, Story 5.3

**Technical Notes:**
- Location: `whatsapp-bot/src/services/helpers/credit-card-helper.ts`
- FR53-FR57: Credit Card Helper capabilities
- ADR-003: Helper architecture details
- Context: Load user's credit cards, installments for personalized help

---

### Story 5.5: Credit Card Helper - Conversational Examples

**As a** Credit Mode user,
**I want** to ask the helper about credit features and get educational responses,
**So that** I learn how to use installments, budgets, and statements.

**Acceptance Criteria:**

**Given** user sends "ajuda cartão"
**When** CreditCardHelper responds
**Then** message explains:
```
Posso ajudar com seu cartão de crédito! 😊

Você pode:
• Ver seus parcelamentos ativos
• Adicionar uma compra parcelada
• Conferir o resumo da fatura atual
• Definir orçamento mensal
• Entender a diferença entre Modo Crédito e Modo Simples

O que você gostaria de fazer?
```

**Given** user asks "como funciona parcelamento?"
**Then** explains with examples:
```
Parcelamento é quando você divide uma compra em várias vezes.

Exemplo: Você comprou um celular de R$ 1.200 em 12x

Eu crio:
✓ Um plano de 12 parcelas de R$ 100
✓ As parcelas aparecem automaticamente todo mês
✓ Você vê quanto vai pagar nos próximos meses

Quer adicionar um parcelamento agora?
```

**Given** user says "quero adicionar parcelamento"
**Then** asks clarifying questions:
- "Qual foi o valor total da compra?"
- "Em quantas vezes você parcelou?"
- "O que você comprou?"
- (optionally) "Em qual cartão?"

**Given** details collected
**Then** executes `add_installment()` and confirms success

**Prerequisites:** Story 5.4

**Technical Notes:**
- Multi-turn: Store conversation state for follow-ups
- Education-first: Explain before executing
- FR51: Prioritize education over execution
- Localization: Support pt-BR and English

---

### Story 5.6: AI Integration Test Framework

**As a** developer,
**I want** a structured test framework for AI helper quality,
**So that** prompt/tool changes don't regress conversational quality.

**Acceptance Criteria:**

**Given** test framework implemented
**Then** supports test scenarios with:
- Input message
- Expected domain detection
- Expected clarification questions (if any)
- Expected function calls
- Expected response tone/content

**Given** test scenario: "quero ver meus parcelamentos"
**Then** asserts:
- Domain: credit-card ✓
- Function called: `show_installments()` ✓
- Response includes installment list ✓
- Tone: friendly, educational ✓

**Given** test scenario: "adicionar 600 em 3x celular"
**Then** asserts:
- Function: `add_installment(600, 3, "celular")` ✓
- NO clarifying questions (all details provided) ✓
- Confirmation message mentions R$ 200/month ✓

**Given** test scenario: "ajuda parcelamento" (ambiguous)
**Then** asserts:
- Asks clarifying question before executing ✓
- Does NOT execute prematurely ✓

**Prerequisites:** Story 5.4, Story 5.5

**Technical Notes:**
- Location: `whatsapp-bot/src/__tests__/helpers/ai-integration-tests.ts`
- NOT in CI: Manual execution before deployment
- FR63-FR67: AI testing, quality validation, conversation flows
- Test real OpenAI calls (not mocked) for quality validation
- Cost: ~$0.10 per full test suite run

---

### Story 5.7: Helper Usage Logging & Monitoring

**As a** product team,
**I want** complete logging of all helper interactions,
**So that** I can debug issues, improve prompts, and measure success.

**Acceptance Criteria:**

**Given** user invokes helper
**When** interaction completes
**Then** logs to database table `helper_interactions`:
- id, user_id, domain, timestamp
- input_message
- detected_intent
- clarification_questions (array)
- function_calls (array)
- response_message
- conversation_turns (count)
- tokens_used, cost
- success (boolean)
- error_message (if failed)

**Given** helper interaction fails
**Then** logs error with full context for debugging

**Given** PostHog analytics configured
**Then** fires events:
- `ai_helper_invoked`
- `ai_helper_clarified`
- `ai_helper_executed`
- `ai_helper_completed`
- `ai_helper_error`

**Prerequisites:** Story 5.4

**Technical Notes:**
- Table: Create `helper_interactions` in migration
- FR68-FR70: Logging, metrics tracking, error monitoring
- PostHog dashboard: ADR-002 analytics events
- Retention: Keep logs for 90 days
- Privacy: Redact sensitive data (amounts okay, personal info no)

---

### Story 5.8: Gradual Rollout Strategy (4-Phase)

**As a** product team,
**I want** a structured 4-phase rollout plan,
**So that** helper system launches safely with data-driven progression.

**Acceptance Criteria:**

**Phase 0: Internal Testing (Week 1-2)**
- Feature flag: 0% general, user ID filter for Lucas
- Test all scenarios manually
- Validate helper quality, cost per interaction
- Success criteria: No critical bugs, cost < $0.05/interaction

**Phase 1: 5% Rollout (Week 3)**
- Set flag to 5%
- Monitor: Error rate, conversation quality, usage rate
- Success criteria: Error rate < 5%, helper usage > 20% of enabled users

**Phase 2: 25% Rollout (Week 4-5)**
- Set flag to 25%
- A/B test: Compare helpers vs old system (satisfaction, completion rate)
- Success criteria: Error rate < 5%, positive feedback signals

**Phase 3: 50% Rollout (Week 6-7)**
- Set flag to 50%
- Monitor scale: Cost projections, server load
- Success criteria: Performance stable, cost per user acceptable

**Phase 4: 100% Rollout (Week 8+)**
- Set flag to 100% if all metrics healthy
- Maintain old system for 2 months as safety net
- Success criteria: 30%+ helper usage, sustained quality

**Rollback Plan:**
- Any phase: If error rate > 10%, rollback to previous %
- Emergency: Set flag to 0%, instant rollback

**Prerequisites:** Story 5.1, Story 5.7 (monitoring)

**Technical Notes:**
- FR71-FR73: Gradual rollout, old system coexistence, deprecation timeline
- ADR-002: Rollout strategy details
- Monitor PostHog dashboard daily during rollout
- Document lessons learned after each phase

---

## Epic 6: Transaction Helper & Platform Validation

**Goal:** Users get conversational help with all expense operations ("ajuda gastos"), proving the helper platform is extensible and valuable beyond credit cards.

**FRs Covered:** FR58-FR62

**User Value:** Users learn how to add, edit, delete, and categorize expenses through patient conversation instead of memorizing commands.

---

### Story 6.1: Transaction Helper - System Prompt & Functions

**As a** developer,
**I want** the Transaction Helper with CRUD operation support,
**So that** users can manage expenses conversationally.

**Acceptance Criteria:**

**Given** TransactionHelper class extends BaseHelper
**Then** implements system prompt:
```
You are a transaction management assistant for Brazilian expense tracker.
Help users:
- Add expenses and income
- Edit existing transactions
- Delete transactions
- Change categories
- View recent transactions

Always:
- Ask clarifying questions if details missing
- Explain what changes you're making
- Confirm destructive actions (delete)
```

**And** defines OpenAI functions:
- `add_expense(amount, description, category, date, payment_method)`
- `add_income(amount, description, category, date)`
- `show_recent_transactions(limit, type)`
- `edit_transaction(id, updates)`
- `delete_transaction(id)`
- `change_category(transaction_id, new_category)`
- `explain_transaction_operations()`

**Given** TransactionHelper instantiated
**Then** loads user context:
- Recent 20 transactions (for reference)
- User's categories
- Default payment methods

**Prerequisites:** Story 5.2, Story 5.3

**Technical Notes:**
- Location: `whatsapp-bot/src/services/helpers/transaction-helper.ts`
- FR58-FR62: Transaction Helper capabilities
- Reuses BaseHelper infrastructure
- Cost per interaction: ~1000 tokens (~$0.002)

---

### Story 6.2: Transaction Helper - Add Expense Flow

**As a** user,
**I want** to add expenses through conversation,
**So that** I can log spending without memorizing exact syntax.

**Acceptance Criteria:**

**Given** user sends "ajuda adicionar gasto"
**When** TransactionHelper responds
**Then** asks: "Quanto você gastou?"

**Given** user responds "50"
**Then** asks: "O que você comprou?"

**Given** user responds "almoço"
**Then** asks: "Em qual categoria? (Sugestão: Alimentação)"

**Given** user confirms category
**Then** asks: "Qual forma de pagamento?"

**Given** all details collected
**Then** executes `add_expense(50, "almoço", "Alimentação", today, user_default_card)`
**And** confirms: "✅ Gasto adicionado: R$ 50 em Alimentação (Almoço)"

**Given** user provides all details at once: "gastei 50 no almoço com cartão"
**Then** extracts all details, NO clarifying questions needed
**And** immediately creates expense

**Prerequisites:** Story 6.1

**Technical Notes:**
- Multi-turn conversation state management
- FR59: Explains CRUD operations
- Smart defaults: Today's date, user's most recent payment method
- Validation: Amount > 0, category exists

---

### Story 6.3: Transaction Helper - View Recent Transactions

**As a** user,
**I want** to see my recent transactions through conversation,
**So that** I can review what I've spent.

**Acceptance Criteria:**

**Given** user sends "ajuda ver gastos" or "mostrar gastos recentes"
**When** TransactionHelper responds
**Then** shows recent 10 transactions:
```
Seus gastos recentes:

1. Hoje - R$ 50 - Almoço (Alimentação)
2. Hoje - R$ 120 - Uber (Transporte)
3. Ontem - R$ 35 - Café (Alimentação)
4. 28 Nov - R$ 200 - Celular 3/12 (Eletrônicos)
...

Quer editar ou deletar algum? Me diga o número.
```

**Given** user asks "só alimentação"
**Then** filters: `show_recent_transactions(limit=10, category="Alimentação")`

**Given** user asks "gastos de novembro"
**Then** filters by month

**Given** user says "editar número 3"
**Then** loads transaction details and enters edit flow

**Prerequisites:** Story 6.1

**Technical Notes:**
- FR60: Shows recent transactions
- Formatting: Localized dates, currency
- Interactive: User can reference by number for editing

---

### Story 6.4: Transaction Helper - Edit Transaction Flow

**As a** user,
**I want** to edit transactions conversationally,
**So that** I can fix mistakes without complex commands.

**Acceptance Criteria:**

**Given** user says "quero editar o almoço de hoje"
**Then** helper identifies transaction
**And** asks: "O que você quer mudar? (valor, descrição, categoria, data, forma de pagamento)"

**Given** user responds "mudar valor para 55"
**Then** executes `edit_transaction(id, { amount: 55 })`
**And** confirms: "✅ Atualizado: Almoço agora é R$ 55"

**Given** user says "mudar categoria para Lazer"
**Then** executes `change_category(id, "Lazer")`

**Given** user says "editar #EXP-1234" (references expense by ID)
**Then** helper loads that specific transaction

**Given** ambiguous reference
**Then** asks clarifying question: "Encontrei 3 transações com 'almoço'. Qual delas?"

**Prerequisites:** Story 6.1, Story 6.3

**Technical Notes:**
- FR61: Guides category changes
- Smart matching: Fuzzy search on description
- Undo support: Stores previous values for reversal

---

### Story 6.5: Transaction Helper - Delete Transaction

**As a** user,
**I want** to delete transactions with confirmation,
**So that** I can remove mistakes safely.

**Acceptance Criteria:**

**Given** user says "deletar o almoço de hoje"
**When** helper identifies transaction
**Then** asks confirmation:
```
⚠️ Tem certeza que quer deletar?

R$ 50 - Almoço (Alimentação) - Hoje

Essa ação não pode ser desfeita.

Responda "sim" para confirmar ou "não" para cancelar.
```

**Given** user confirms "sim"
**Then** executes `delete_transaction(id)`
**And** confirms: "✅ Transação deletada: Almoço (R$ 50)"

**Given** user cancels "não"
**Then** responds: "Ok, nada foi deletado."

**Given** transaction is part of installment
**Then** warns: "Esta é uma parcela de parcelamento. Deletar só esta parcela ou todo o parcelamento?"

**Prerequisites:** Story 6.1, Story 6.3

**Technical Notes:**
- FR59: Delete operation with confirmation
- Safety: Always confirm destructive actions
- Special handling: Installment payments require extra warning

---

### Story 6.6: Income vs Expense Differentiation

**As a** user,
**I want** the helper to differentiate between income and expenses,
**So that** I can track both types correctly.

**Acceptance Criteria:**

**Given** user says "ajuda adicionar receita"
**Then** helper enters income flow (not expense)

**Given** user says "recebi 3000 de salário"
**Then** executes `add_income(3000, "Salário", "Renda", today)`

**Given** user asks "mostrar receitas do mês"
**Then** filters transactions by `type = 'income'`

**Given** user accidentally logs income as expense
**And** later says "isso era receita, não gasto"
**Then** helper offers to convert: "Quer mudar de despesa para receita?"

**Prerequisites:** Story 6.1

**Technical Notes:**
- FR62: Differentiates income vs expenses
- Type conversion: Edit transaction type field
- Different categories: Income categories vs expense categories

---

## FR Coverage Matrix

| FR | Description | Epic | Story |
|----|-------------|------|-------|
| FR1 | System detects first credit card transaction | Epic 1 | 1.2 |
| FR2 | System prompts Credit Mode vs Simple Mode | Epic 1 | 1.3, 1.4 |
| FR3 | System stores mode preference per payment method | Epic 1 | 1.3, 1.4 |
| FR4 | Users can switch modes | Epic 1 | 1.5 |
| FR5 | System warns about data implications when switching | Epic 1 | 1.5 |
| FR6 | Simple Mode = existing behavior | Epic 1 | 1.6 |
| FR7 | Credit Mode = credit features access | Epic 1 | 1.6 |
| FR8 | Set personal monthly budget | Epic 3 | 3.2 |
| FR9 | Track against user budget (not limit) | Epic 3 | 3.2, 3.3 |
| FR10 | Edit budget anytime | Epic 3 | 3.2 |
| FR11 | Display budget progress | Epic 3 | 3.3 |
| FR12 | Awareness-first language when exceeded | Epic 3 | 3.3 |
| FR13 | Add expenses with installments | Epic 2 | 2.1, 2.2 |
| FR14 | Create parent installment record | Epic 2 | 2.1, 2.2 |
| FR15 | Auto-create monthly payment entries | Epic 2 | 2.1, 2.2 |
| FR16 | Distribute payments across months | Epic 2 | 2.1, 2.2 |
| FR17 | Display future commitments | Epic 2 | 2.3 |
| FR18 | Only monthly payment counts against budget | Epic 2 | 2.8 |
| FR19 | View all active installments | Epic 2 | 2.4 |
| FR20 | Mark installments as paid off early | Epic 2 | 2.5 |
| FR21 | Early payoff recalculates future totals | Epic 2 | 2.5 |
| FR22 | Edit or delete installment records | Epic 2 | 2.6, 2.7 |
| FR23 | Deleting removes all future payments | Epic 2 | 2.7 |
| FR24 | Set statement closing date | Epic 3 | 3.1 |
| FR25 | WhatsApp reminder 3 days before closing | Epic 3 | 3.4 |
| FR26 | Reminder includes statement total | Epic 3 | 3.4 |
| FR27 | Distinguish current vs next statement | Epic 3 | 3.6 |
| FR28 | Pre-statement category summary | Epic 3 | 3.5 |
| FR29 | Neutral reminder tone | Epic 3 | 3.4 |
| FR30 | Set payment due date | Epic 4 | 4.1 |
| FR31 | WhatsApp reminder 2 days before due | Epic 4 | 4.2 |
| FR32 | Reminder includes amount due | Epic 4 | 4.2 |
| FR33 | Auto-create payment transaction | Epic 4 | 4.3 |
| FR34 | System category for payments | Epic 4 | 4.5 |
| FR35 | Separate usage from payment month | Epic 4 | 4.3 |
| FR36 | Edit/delete auto-payment | Epic 4 | 4.4 |
| FR37-42 | Awareness-first language | All Epics | Cross-cutting quality requirement |
| FR43 | PostHog feature flags | Epic 5 | 5.1 |
| FR44 | Gradual rollout support | Epic 5 | 5.1, 5.8 |
| FR45 | Instant rollback | Epic 5 | 5.1 |
| FR46 | Environment variable fallback | Epic 5 | 5.1 (not implemented per ADR-002) |
| FR47 | BaseHelper architecture | Epic 5 | 5.2 |
| FR48 | Route to appropriate helper | Epic 5 | 5.3 |
| FR49 | Coexist with 3-layer NLP | Epic 5 | 5.3 |
| FR50 | Helpers ask clarifying questions | Epic 5 | 5.2, 5.5 |
| FR51 | Education over execution | Epic 5 | 5.5 |
| FR52 | Multi-turn conversations | Epic 5 | 5.2, 5.5 |
| FR53 | Credit Card Helper responds to "ajuda cartão" | Epic 5 | 5.4, 5.5 |
| FR54 | Explains Credit vs Simple Mode | Epic 5 | 5.5 |
| FR55 | Teaches installment syntax | Epic 5 | 5.5 |
| FR56 | Shows statement dates and budget | Epic 5 | 5.4, 5.5 |
| FR57 | Guides first credit expense | Epic 5 | 5.5 |
| FR58 | Transaction Helper responds to "ajuda gastos" | Epic 6 | 6.1 |
| FR59 | Explains CRUD operations | Epic 6 | 6.2, 6.4, 6.5 |
| FR60 | Shows recent transactions | Epic 6 | 6.3 |
| FR61 | Guides category changes | Epic 6 | 6.4 |
| FR62 | Differentiates income vs expenses | Epic 6 | 6.6 |
| FR63 | AI integration testing | Epic 5 | 5.6 |
| FR64 | Test conversational quality | Epic 5 | 5.6 |
| FR65 | Test multi-turn flows | Epic 5 | 5.6 |
| FR66 | Test education-first behavior | Epic 5 | 5.6 |
| FR67 | Prevent prompt regression | Epic 5 | 5.6 |
| FR68 | Log all helper interactions | Epic 5 | 5.7 |
| FR69 | Track usage metrics | Epic 5 | 5.7 |
| FR70 | Monitor error rates | Epic 5 | 5.7 |
| FR71 | Gradual user rollout | Epic 5 | 5.8 |
| FR72 | Old system remains accessible | Epic 5 | 5.8 |
| FR73 | Deprecate old system after 2 months | Epic 5 | 5.8 |

**Coverage validation:** All 73 MVP FRs mapped to specific stories. Growth features (FR74-FR95) explicitly deferred to post-MVP.

---

## Summary

### Epic Breakdown Overview

| Epic | Title | Stories | FRs |
|------|-------|---------|-----|
| 1 | Credit Mode Foundation | 6 | FR1-7 |
| 2 | Parcelamento Intelligence | 8 | FR13-23 |
| 3 | Statement-Aware Budgets | 6 | FR8-12, 24-29 |
| 4 | Payment Reminders & Auto-Accounting | 5 | FR30-36 |
| 5 | AI Helper Platform Foundation | 8 | FR43-57, 63-73 |
| 6 | Transaction Helper & Platform Validation | 6 | FR58-62 |
| **Total** | | **39 stories** | **73 MVP FRs** |

### Implementation Sequence

```
Epic 1 (Foundation) ────────────────────────────────────────┐
    │                                                        │
    ├──→ Epic 2 (Parcelamento) ──┐                          │
    │                             │                          │
    └──→ Epic 3 (Budgets) ────────┤                          │
                                  │                          │
                 Epic 4 (Payments)┘                          │
                                                             │
Epic 5 (AI Platform) ──→ Epic 6 (Transaction Helper) ───────┘
```

**Parallel Development:**
- Tracks A & B can run simultaneously:
  - Track A: Epics 1-4 (Credit Card Management)
  - Track B: Epics 5-6 (AI Helper Platform)
- Epic 5 & 6 depend on Epic 1 for Credit Mode context but are otherwise independent

### Key Deliverables

**User-Facing (Credit Card Management):**
- Opt-in Credit Mode vs Simple Mode choice
- Brazilian parcelamento (installment) tracking with future commitments
- Statement-period budgets (not calendar month)
- Payment reminders with auto-accounting separation
- Awareness-first language throughout (no judgment)

**Platform (AI Helper System):**
- Feature-flagged gradual rollout (0% → 5% → 25% → 50% → 100%)
- BaseHelper architecture (extensible to 7 eventual helpers)
- Credit Card Helper (education-first conversational learning)
- Transaction Helper (proves platform value beyond credit)
- AI integration test framework
- Complete logging & monitoring

**Technical Foundation:**
- Two-table installment model (plans + payments)
- Hybrid budget periods (calendar for categories, statement for credit totals)
- PostHog feature flags (no environment fallback)
- LLM-based helper routing (not keyword-based)
- Non-destructive mode switching

### Innovation Highlights

1. **Brazilian Cultural Intelligence:** Parcelamento tracking as first-class feature (not afterthought)
2. **Mental Model Respect:** Users choose Credit vs Simple Mode (no forced credit features)
3. **Awareness-First Philosophy:** Budget "acima do planejado" not "OVERSPENT!" - dignity preserved
4. **Education-First Helpers:** AI teaches then executes (vs rigid tool calling)
5. **Statement Period Budgets:** Align with billing cycle (what users actually care about)
6. **Feature Flag Discipline:** Safe experimentation with instant rollback

---

_Generated by BMAD Epic & Story Decomposition Workflow_
_Date: 2025-12-02_
_For: Lucas_
_Project: NexFinApp Credit Card Management & AI Helper System_
