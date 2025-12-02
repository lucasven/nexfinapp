# Epic Technical Specification: Credit Mode Foundation

Date: 2025-12-02
Author: Lucas
Epic ID: 1
Status: Draft

---

## Overview

Epic 1 establishes the foundation for NexFinApp's Credit Card Management System by introducing an opt-in mental model that respects different user relationships with credit cards. The core innovation is allowing users to choose between **Credit Mode** (full credit-specific features: installments, statement tracking, credit budgets) and **Simple Mode** (treat credit cards like debit, existing expense tracking behavior).

This epic directly addresses PRD Feature 1 and implements the architectural groundwork defined in ADR-004 (Non-Destructive Mode Switching). The system detects when a user adds their first credit card transaction and prompts them to select their preferred mode, ensuring users aren't forced into credit features they don't need—particularly important for users who pay credit cards in full monthly and prefer simple expense tracking.

**Key Deliverable:** A flexible, user-controlled credit card tracking system that adapts to individual mental models rather than imposing a one-size-fits-all approach.

## Objectives and Scope

### Primary Objectives

1. **Enable User Choice:** Implement Credit Mode vs Simple Mode selection at first credit card transaction
2. **Database Foundation:** Create schema extensions to support credit-specific features (statement dates, budgets, mode preference)
3. **Mode Switching:** Allow users to change modes later with non-destructive data handling
4. **Backward Compatibility:** Ensure existing Simple Mode users (pre-migration) are unaffected
5. **Cross-Platform Consistency:** Implement mode selection in both WhatsApp bot and web frontend

### In Scope

**Database & Data Model:**
- Extend `payment_methods` table with credit card columns (FR3):
  - `credit_mode` (boolean): User's mode preference
  - `statement_closing_day` (integer): Day of month statement closes
  - `payment_due_day` (integer): Days after closing when payment is due
  - `monthly_budget` (decimal): User-defined budget per statement
- Create `installment_plans` and `installment_payments` tables (foundation for Epic 2)
- RLS policies for user-level security

**Detection & Prompting (FR1-FR2):**
- WhatsApp: Detect first credit card transaction, trigger mode selection dialog
- Web: Modal dialog on first credit card expense with clear mode explanations
- Localized messaging (pt-BR/en) with awareness-first tone

**Mode Selection (FR3):**
- Store preference per payment method (not global)
- Immediate effect on transaction flow and UI features
- Analytics tracking via PostHog

**Mode Switching (FR4-FR5):**
- Non-destructive switching with warning dialogs
- Handle active installments gracefully (keep or pay off - user choice)
- Prompt for credit card details when switching TO Credit Mode

**Simple Mode Guarantee (FR6-FR7):**
- Credit Mode disabled: No installment prompts, no statement tracking
- Budget calculations use calendar month (not statement period)
- Existing transaction flow completely unchanged

### Out of Scope (Deferred to Future Epics)

- **Installment tracking UI:** Epic 2 (Parcelamento Intelligence)
- **Statement-aware budgets:** Epic 3 (Statement-Aware Budgets)
- **Payment reminders:** Epic 4 (Payment Reminders & Auto-Accounting)
- **Credit Card Helper AI:** Epic 5 (AI Helper Platform Foundation)
- **Multiple credit cards per user:** MVP supports multiple cards, but complex multi-card scenarios deferred
- **Auto-sync with banks:** Manual entry only (aligns with "manual entry as mindfulness" philosophy)

## System Architecture Alignment

**Architecture Decisions Referenced:**

- **ADR-001 (Data Model):** Epic 1 creates the `payment_methods` extensions and foundational installment tables defined in this ADR, though installment logic is implemented in Epic 2.
- **ADR-004 (Mode Switching):** Implements non-destructive switching with user choice for handling active installments. No automatic data deletion.
- **ADR-002 (Feature Flags):** Credit Mode features themselves do not require feature flags (opt-in model provides natural rollout). Feature flags reserved for Epic 5 (AI Helpers).

**Technology Stack:**

| Component | Technology | Notes |
|-----------|-----------|-------|
| Frontend | Next.js 15 (App Router) | Server components + server actions pattern |
| Database | PostgreSQL (Supabase) | Existing schema + new credit card extensions |
| WhatsApp Bot | Node.js (Baileys library) | Conversational flow for mode selection |
| Localization | next-intl (frontend), custom (bot) | pt-BR and English support |
| Analytics | PostHog | Track mode selection, switching events |

**Components Affected:**

**Frontend:**
- `fe/components/transactions/credit-mode-selection-dialog.tsx` (NEW)
- `fe/components/settings/credit-card-settings.tsx` (NEW)
- `fe/lib/actions/payment-methods.ts` (UPDATE - add `setCreditMode()`)
- `fe/app/[locale]/settings/account/page.tsx` (UPDATE - add credit card settings section)

**WhatsApp Bot:**
- `whatsapp-bot/src/handlers/credit-card/mode-selection.ts` (NEW)
- `whatsapp-bot/src/handlers/credit-card/mode-switch.ts` (NEW)
- `whatsapp-bot/src/handlers/transactions/transactions.ts` (UPDATE - detect first credit card usage)
- `whatsapp-bot/src/localization/pt-br.ts` + `en.ts` (UPDATE - add mode selection messages)

**Database:**
- `fe/scripts/034_credit_card_management.sql` (NEW - complete migration)

**Constraints Respected:**

- **Backward compatibility (NFR32):** Existing credit card users see no changes until they add a new transaction
- **User data sovereignty:** Mode preference stored per payment method, user has full control
- **Localization:** All user-facing text supports pt-BR and English
- **RLS policies:** All new tables/columns follow existing security model

## Detailed Design

### Services and Modules

**Module Structure:**

```
Frontend (Next.js 15):
├── components/
│   ├── transactions/
│   │   └── credit-mode-selection-dialog.tsx    [NEW] - Modal for mode selection
│   └── settings/
│       └── credit-card-settings.tsx            [NEW] - Credit card configuration
├── lib/
│   └── actions/
│       └── payment-methods.ts                  [UPDATE] - Add setCreditMode(), switchCreditMode()
└── app/[locale]/
    └── settings/account/page.tsx               [UPDATE] - Integrate credit card settings

WhatsApp Bot (Node.js):
├── handlers/
│   ├── credit-card/
│   │   ├── mode-selection.ts                   [NEW] - Handle mode choice dialog
│   │   └── mode-switch.ts                      [NEW] - Handle mode switching with warnings
│   └── transactions/
│       └── transactions.ts                     [UPDATE] - Detect first credit card transaction
├── services/
│   └── credit-card/
│       └── mode-manager.ts                     [NEW] - Business logic for mode operations
└── localization/
    ├── pt-br.ts                               [UPDATE] - Add mode selection messages
    └── en.ts                                  [UPDATE] - Add mode selection messages

Database:
└── fe/scripts/
    └── 034_credit_card_management.sql          [NEW] - Complete schema migration
```

**Service Responsibilities:**

| Service | Module | Responsibility | Owner |
|---------|--------|----------------|-------|
| **CreditModeManager** | `services/credit-card/mode-manager.ts` | Orchestrates mode selection/switching logic, validates state transitions, handles installment cleanup | Backend (WhatsApp Bot) |
| **PaymentMethodActions** | `lib/actions/payment-methods.ts` | Server actions for mode CRUD operations, Supabase integration | Frontend |
| **ModeSelectionHandler** | `handlers/credit-card/mode-selection.ts` | Conversational flow for mode selection on WhatsApp | WhatsApp Bot |
| **ModeSwitchHandler** | `handlers/credit-card/mode-switch.ts` | Warning dialogs and confirmation flow for mode switching | WhatsApp Bot |
| **TransactionDetector** | `handlers/transactions/transactions.ts` | Detects first credit card usage, triggers mode selection prompt | WhatsApp Bot |

**Key Algorithms:**

**1. First Transaction Detection:**
```typescript
// Input: Transaction being created with payment_method_id
// Output: Boolean indicating if mode selection is needed

async function needsCreditModeSelection(
  paymentMethodId: string
): Promise<boolean> {
  const paymentMethod = await supabase
    .from('payment_methods')
    .select('type, credit_mode')
    .eq('id', paymentMethodId)
    .single()

  // Mode selection needed if:
  // 1. Payment method is credit card (type = 'credit')
  // 2. User hasn't chosen mode yet (credit_mode IS NULL)
  return paymentMethod.type === 'credit' && paymentMethod.credit_mode === null
}
```

**2. Mode Switching with Installment Check:**
```typescript
// Input: Payment method ID, new mode (true/false), user ID
// Output: SwitchResult with warnings/options

async function switchCreditMode(
  paymentMethodId: string,
  newMode: boolean,
  userId: string
): Promise<SwitchResult> {

  // Check for active installments if switching TO Simple Mode
  if (newMode === false) {
    const activeInstallments = await supabase
      .from('installment_plans')
      .select('id, description, total_amount')
      .eq('payment_method_id', paymentMethodId)
      .eq('status', 'active')

    if (activeInstallments.data.length > 0) {
      return {
        requiresConfirmation: true,
        warning: {
          pt: `Você tem ${activeInstallments.data.length} parcelamento(s) ativo(s).`,
          en: `You have ${activeInstallments.data.length} active installment(s).`
        },
        options: ['keep', 'pay_off']
      }
    }
  }

  // Update mode
  await supabase
    .from('payment_methods')
    .update({ credit_mode: newMode })
    .eq('id', paymentMethodId)
    .eq('user_id', userId)

  return { success: true }
}
```

### Data Models and Contracts

**Database Schema (Migration 034):**

```sql
-- Extend payment_methods table for credit card features
ALTER TABLE payment_methods
  ADD COLUMN IF NOT EXISTS statement_closing_day INTEGER
    CHECK (statement_closing_day BETWEEN 1 AND 31),
  ADD COLUMN IF NOT EXISTS payment_due_day INTEGER
    CHECK (payment_due_day > 0),
  ADD COLUMN IF NOT EXISTS credit_mode BOOLEAN DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS monthly_budget DECIMAL(10,2);

COMMENT ON COLUMN payment_methods.statement_closing_day IS
  'Day of month when statement closes (1-31). NULL for non-credit cards.';
COMMENT ON COLUMN payment_methods.payment_due_day IS
  'Days after closing when payment is due (e.g., 10 = due 10 days after closing).';
COMMENT ON COLUMN payment_methods.credit_mode IS
  'TRUE if user opted into Credit Mode (vs Simple Mode). NULL = not yet chosen. Only for type=credit.';
COMMENT ON COLUMN payment_methods.monthly_budget IS
  'User-defined budget per statement period. NULL if not set.';

-- Installment plans (parent table - foundation for Epic 2)
CREATE TABLE installment_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  description TEXT NOT NULL,
  total_amount DECIMAL(10,2) NOT NULL,
  total_installments INTEGER NOT NULL CHECK (total_installments > 0),
  status TEXT NOT NULL CHECK (status IN ('active', 'paid_off', 'cancelled')) DEFAULT 'active',
  merchant TEXT,
  category_id UUID REFERENCES categories(id),
  payment_method_id UUID REFERENCES payment_methods(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Installment payments (child table - foundation for Epic 2)
CREATE TABLE installment_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES installment_plans(id) ON DELETE CASCADE,
  transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
  installment_number INTEGER NOT NULL CHECK (installment_number > 0),
  amount DECIMAL(10,2) NOT NULL,
  due_date DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'paid', 'cancelled')) DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_installment_plans_user_status ON installment_plans(user_id, status);
CREATE INDEX idx_installment_payments_plan ON installment_payments(plan_id);
CREATE INDEX idx_installment_payments_transaction ON installment_payments(transaction_id);
CREATE INDEX idx_installment_payments_due_date_status ON installment_payments(due_date, status);

-- RLS Policies
ALTER TABLE installment_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE installment_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY installment_plans_user_policy ON installment_plans
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY installment_payments_user_policy ON installment_payments
  FOR ALL USING (
    plan_id IN (SELECT id FROM installment_plans WHERE user_id = auth.uid())
  );
```

**TypeScript Types:**

```typescript
// Payment Method with Credit Card Extensions
interface PaymentMethod {
  id: string
  user_id: string
  name: string
  type: 'credit' | 'debit' | 'cash'
  statement_closing_day?: number  // 1-31
  payment_due_day?: number         // Days after closing
  credit_mode?: boolean            // true = Credit Mode, false = Simple Mode, null = not chosen
  monthly_budget?: number          // User-defined budget
  created_at: string
  updated_at: string
}

// Mode Switch Result
interface SwitchResult {
  success: boolean
  requiresConfirmation?: boolean
  warning?: {
    pt: string
    en: string
  }
  options?: Array<'keep' | 'pay_off'>
}

// Installment Plan (for mode switching logic)
interface InstallmentPlan {
  id: string
  user_id: string
  description: string
  total_amount: number
  total_installments: number
  status: 'active' | 'paid_off' | 'cancelled'
  merchant?: string
  category_id?: string
  payment_method_id: string
  created_at: string
  updated_at: string
}

// Installment Payment
interface InstallmentPayment {
  id: string
  plan_id: string
  transaction_id?: string
  installment_number: number
  amount: number
  due_date: string  // ISO date
  status: 'pending' | 'paid' | 'cancelled'
  created_at: string
  updated_at: string
}
```

**State Transitions:**

```
Payment Method Credit Mode States:
┌────────────────────────────────────────────────────────────┐
│ NULL (not chosen)                                          │
│   ├─→ TRUE (Credit Mode)    [user selects Credit Mode]    │
│   └─→ FALSE (Simple Mode)   [user selects Simple Mode]    │
│                                                            │
│ TRUE (Credit Mode)                                         │
│   └─→ FALSE (Simple Mode)   [user switches, with warning] │
│                                                            │
│ FALSE (Simple Mode)                                        │
│   └─→ TRUE (Credit Mode)    [user switches, prompt setup] │
└────────────────────────────────────────────────────────────┘

Installment Plan States (context for mode switching):
┌────────────────────────────────────────────────────────────┐
│ ACTIVE                                                      │
│   ├─→ PAID_OFF   [user marks as paid off early]           │
│   └─→ CANCELLED  [user deletes installment plan]          │
└────────────────────────────────────────────────────────────┘
```

### APIs and Interfaces

**Frontend Server Actions:**

```typescript
// fe/lib/actions/payment-methods.ts

/**
 * Set credit mode for a payment method (first-time selection)
 */
export async function setCreditMode(
  paymentMethodId: string,
  creditMode: boolean
): Promise<{ success: boolean; error?: string }> {
  const supabase = createServerClient()
  const user = await getUser()

  const { error } = await supabase
    .from('payment_methods')
    .update({ credit_mode: creditMode })
    .eq('id', paymentMethodId)
    .eq('user_id', user.id)
    .is('credit_mode', null)  // Only update if not yet set

  if (error) {
    return { success: false, error: error.message }
  }

  // Track analytics
  await posthog.capture('credit_mode_selected', {
    userId: user.id,
    paymentMethodId,
    mode: creditMode ? 'credit' : 'simple'
  })

  revalidatePath('/transactions')
  return { success: true }
}

/**
 * Switch credit mode (with warnings if needed)
 */
export async function switchCreditMode(
  paymentMethodId: string,
  newMode: boolean,
  options?: { cleanupInstallments?: boolean }
): Promise<SwitchResult> {
  const supabase = createServerClient()
  const user = await getUser()

  // Check for active installments if switching to Simple Mode
  if (newMode === false) {
    const { data: installments } = await supabase
      .from('installment_plans')
      .select('id')
      .eq('payment_method_id', paymentMethodId)
      .eq('user_id', user.id)
      .eq('status', 'active')

    if (installments && installments.length > 0) {
      if (!options?.cleanupInstallments) {
        return {
          success: false,
          requiresConfirmation: true,
          activeInstallments: installments.length
        }
      }

      // User chose to mark installments as paid off
      await supabase
        .from('installment_plans')
        .update({ status: 'paid_off' })
        .eq('payment_method_id', paymentMethodId)
        .eq('user_id', user.id)
        .eq('status', 'active')
    }
  }

  // Update mode
  const { error } = await supabase
    .from('payment_methods')
    .update({ credit_mode: newMode })
    .eq('id', paymentMethodId)
    .eq('user_id', user.id)

  if (error) {
    return { success: false, error: error.message }
  }

  await posthog.capture('credit_mode_switched', {
    userId: user.id,
    paymentMethodId,
    newMode: newMode ? 'credit' : 'simple',
    hadInstallments: !!options?.cleanupInstallments
  })

  revalidatePath('/settings/account')
  return { success: true }
}

/**
 * Update credit card settings (statement dates, budget)
 */
export async function updateCreditCardSettings(
  paymentMethodId: string,
  settings: {
    statementClosingDay?: number
    paymentDueDay?: number
    monthlyBudget?: number
  }
): Promise<{ success: boolean; error?: string }> {
  const supabase = createServerClient()
  const user = await getUser()

  const updates: Partial<PaymentMethod> = {}
  if (settings.statementClosingDay !== undefined) {
    updates.statement_closing_day = settings.statementClosingDay
  }
  if (settings.paymentDueDay !== undefined) {
    updates.payment_due_day = settings.paymentDueDay
  }
  if (settings.monthlyBudget !== undefined) {
    updates.monthly_budget = settings.monthlyBudget
  }

  const { error } = await supabase
    .from('payment_methods')
    .update(updates)
    .eq('id', paymentMethodId)
    .eq('user_id', user.id)

  if (error) {
    return { success: false, error: error.message }
  }

  revalidatePath('/settings/account')
  return { success: true }
}
```

**WhatsApp Bot Handler APIs:**

```typescript
// whatsapp-bot/src/handlers/credit-card/mode-selection.ts

/**
 * Handle credit mode selection flow
 */
export async function handleModeSelection(
  message: string,
  userId: string,
  paymentMethodId: string,
  locale: string
): Promise<WhatsAppMessage> {
  const conversationState = await getConversationState(userId, 'mode_selection')

  // First message: Show options
  if (!conversationState) {
    await setConversationState(userId, 'mode_selection', { paymentMethodId })

    return {
      text: locale === 'pt-BR'
        ? getModeSelectionMessage_PT()
        : getModeSelectionMessage_EN(),
      buttons: [
        { id: 'credit', text: '1️⃣ Modo Crédito' },
        { id: 'simple', text: '2️⃣ Modo Simples' }
      ]
    }
  }

  // User responded: Parse choice
  const choice = message.trim() === '1' || message.toLowerCase().includes('crédito')
    ? 'credit'
    : 'simple'

  // Set mode
  await supabase
    .from('payment_methods')
    .update({ credit_mode: choice === 'credit' })
    .eq('id', conversationState.paymentMethodId)
    .eq('user_id', userId)

  await clearConversationState(userId, 'mode_selection')

  // Track analytics
  await posthog.capture('credit_mode_selected', {
    userId,
    paymentMethodId: conversationState.paymentMethodId,
    mode: choice,
    channel: 'whatsapp'
  })

  return {
    text: locale === 'pt-BR'
      ? getConfirmationMessage_PT(choice)
      : getConfirmationMessage_EN(choice)
  }
}

/**
 * Handle mode switching with warnings
 */
export async function handleModeSwitch(
  userId: string,
  paymentMethodId: string,
  newMode: boolean,
  locale: string
): Promise<WhatsAppMessage> {
  // Check for active installments
  const { data: installments } = await supabase
    .from('installment_plans')
    .select('id, description')
    .eq('payment_method_id', paymentMethodId)
    .eq('user_id', userId)
    .eq('status', 'active')

  if (!newMode && installments && installments.length > 0) {
    // Switching to Simple Mode with active installments
    await setConversationState(userId, 'mode_switch_confirm', {
      paymentMethodId,
      newMode,
      installmentsCount: installments.length
    })

    return {
      text: locale === 'pt-BR'
        ? getInstallmentWarning_PT(installments.length)
        : getInstallmentWarning_EN(installments.length),
      buttons: [
        { id: 'keep', text: '1️⃣ Continuar rastreando' },
        { id: 'pay_off', text: '2️⃣ Marcar como quitados' },
        { id: 'cancel', text: '3️⃣ Cancelar' }
      ]
    }
  }

  // No warnings needed, proceed with switch
  await supabase
    .from('payment_methods')
    .update({ credit_mode: newMode })
    .eq('id', paymentMethodId)
    .eq('user_id', userId)

  return {
    text: locale === 'pt-BR'
      ? 'Modo alterado com sucesso!'
      : 'Mode changed successfully!'
  }
}
```

**Database Query Interfaces:**

```sql
-- Check if mode selection is needed
CREATE OR REPLACE FUNCTION needs_credit_mode_selection(p_payment_method_id UUID)
RETURNS BOOLEAN AS $$
  SELECT type = 'credit' AND credit_mode IS NULL
  FROM payment_methods
  WHERE id = p_payment_method_id;
$$ LANGUAGE SQL STABLE;

-- Get active installments for a payment method
CREATE OR REPLACE FUNCTION get_active_installments_count(p_payment_method_id UUID)
RETURNS INTEGER AS $$
  SELECT COUNT(*)::INTEGER
  FROM installment_plans
  WHERE payment_method_id = p_payment_method_id
    AND status = 'active';
$$ LANGUAGE SQL STABLE;
```

### Workflows and Sequencing

**Workflow 1: First Credit Card Transaction (WhatsApp)**

```
User adds first credit card expense
        │
        ▼
┌──────────────────────┐
│ Transaction Handler  │──→ Detect payment_method.type = 'credit'
│                      │    AND credit_mode IS NULL
└──────┬───────────────┘
       │
       ▼ YES
┌──────────────────────┐
│ Mode Selection Flow  │
│                      │
│ 1. Store pending tx  │──→ Transaction saved but not confirmed
│ 2. Send prompt msg   │──→ Show Credit/Simple Mode explanation
│ 3. Wait for response │
└──────┬───────────────┘
       │
       ▼ User responds "1" or "2"
┌──────────────────────┐
│ Parse Choice         │
│                      │
│ "1" → credit_mode=T  │
│ "2" → credit_mode=F  │
└──────┬───────────────┘
       │
       ▼
┌──────────────────────┐
│ Update Database      │──→ SET credit_mode = choice
│                      │    WHERE id = payment_method_id
└──────┬───────────────┘
       │
       ▼
┌──────────────────────┐
│ Confirm Transaction  │──→ Complete pending transaction
│                      │    Send confirmation message
│                      │    Track analytics event
└──────────────────────┘
```

**Workflow 2: Mode Switching (Web Frontend)**

```
User clicks "Switch Mode" button
        │
        ▼
┌──────────────────────────────┐
│ Check Active Installments    │
│                              │
│ Query installment_plans      │
│ WHERE status = 'active'      │
└──────┬───────────────────────┘
       │
       ├─→ NO installments
       │   │
       │   ▼
       │ ┌────────────────────┐
       │ │ Direct Switch      │──→ Update credit_mode
       │ │                    │    Show success toast
       │ └────────────────────┘
       │
       └─→ HAS installments (switching TO Simple)
           │
           ▼
         ┌────────────────────────────┐
         │ Show Warning Dialog        │
         │                            │
         │ "You have 3 installments.  │
         │  What do you want to do?"  │
         │                            │
         │ [Keep Tracking]            │
         │ [Mark as Paid Off]         │
         │ [Cancel]                   │
         └──────┬─────────────────────┘
                │
                ├─→ Keep Tracking
                │   │
                │   ▼
                │ ┌──────────────────────┐
                │ │ Update credit_mode   │──→ Installments stay active
                │ │ Leave installments   │    Show info message
                │ └──────────────────────┘
                │
                ├─→ Mark as Paid Off
                │   │
                │   ▼
                │ ┌──────────────────────┐
                │ │ Update plans         │──→ SET status = 'paid_off'
                │ │ Cancel payments      │    Cancel pending payments
                │ │ Update credit_mode   │    Show success message
                │ └──────────────────────┘
                │
                └─→ Cancel
                    │
                    ▼
                  ┌──────────────────────┐
                  │ No Changes           │──→ Close dialog
                  └──────────────────────┘
```

**Workflow 3: Database Migration (Deployment)**

```
Migration 034 Execution
        │
        ▼
┌────────────────────────────┐
│ 1. ALTER payment_methods   │──→ Add credit card columns
│    - statement_closing_day │    (nullable, defaults)
│    - payment_due_day       │
│    - credit_mode           │
│    - monthly_budget        │
└──────┬─────────────────────┘
       │
       ▼
┌────────────────────────────┐
│ 2. CREATE installment      │──→ Create parent table
│    tables                  │    with RLS policies
│    - installment_plans     │
│    - installment_payments  │
└──────┬─────────────────────┘
       │
       ▼
┌────────────────────────────┐
│ 3. CREATE indexes          │──→ Optimize queries
│    - user_status           │
│    - plan_id               │
│    - due_date_status       │
└──────┬─────────────────────┘
       │
       ▼
┌────────────────────────────┐
│ 4. Enable RLS policies     │──→ Secure access
│    - User owns plans       │
│    - User owns payments    │
└──────┬─────────────────────┘
       │
       ▼
┌────────────────────────────┐
│ 5. Verify migration        │──→ Run test queries
│    - Check columns exist   │    Confirm policies active
│    - Test RLS policies     │
└────────────────────────────┘
```

**Sequence Diagram: Mode Selection (WhatsApp)**

```
User          WhatsApp Bot       Database        PostHog
  │                │                 │               │
  │ Add expense    │                 │               │
  ├───────────────>│                 │               │
  │                │ Check mode      │               │
  │                ├────────────────>│               │
  │                │<────────────────┤               │
  │                │ (credit_mode=NULL)              │
  │                │                 │               │
  │<───────────────┤                 │               │
  │ Mode prompt    │                 │               │
  │                │                 │               │
  │ "1" (Credit)   │                 │               │
  ├───────────────>│                 │               │
  │                │ Update mode     │               │
  │                ├────────────────>│               │
  │                │<────────────────┤               │
  │                │                 │               │
  │                │ Track event     │               │
  │                ├────────────────────────────────>│
  │                │                 │               │
  │<───────────────┤                 │               │
  │ Confirmation   │                 │               │
  │                │                 │               │
```

## Non-Functional Requirements

### Performance

| Requirement | Target | Measurement | Priority |
|-------------|--------|-------------|----------|
| **Mode selection dialog load** | < 200ms | Time from transaction creation to modal/message display | CRITICAL |
| **Mode switching operation** | < 1 second | End-to-end mode update with installment check (NFR4) | CRITICAL |
| **Database migration execution** | < 30 seconds | Total time for migration 034 to complete | IMPORTANT |
| **First transaction detection** | < 100ms | Query time for `needs_credit_mode_selection()` | IMPORTANT |
| **RLS policy evaluation** | < 50ms | Policy check overhead per query | NICE-TO-HAVE |

**Rationale:**
- Mode selection is on critical path for first transaction—must be instant
- Migration runs once during deployment—30s acceptable for brownfield schema changes
- Detection happens on every credit card transaction—must not add noticeable latency

**Performance Testing:**
```typescript
// Test mode selection query performance
const start = performance.now()
const needsSelection = await needsCreditModeSelection(paymentMethodId)
const duration = performance.now() - start
expect(duration).toBeLessThan(100) // < 100ms target
```

### Security

| Requirement | Implementation | Validation |
|-------------|----------------|------------|
| **RLS policies enforce user ownership** | All installment tables use `user_id = auth.uid()` policies | Automated test: User A cannot query User B's plans |
| **Mode preference is per-user, per-card** | `payment_methods` update requires `user_id = auth.uid()` in WHERE clause | Server action includes user check before update |
| **No SQL injection** | All queries use parameterized Supabase client methods | Code review + Supabase client guarantees |
| **Analytics data privacy** | PostHog events exclude PII (no transaction descriptions, only IDs) | Event schema review |
| **LGPD compliance inherited** | Mode preference covered by existing user data export/deletion | No new privacy requirements |

**Security Testing:**
```typescript
// Test RLS policy enforcement
const userAClient = createClient(userAToken)
const userBClient = createClient(userBToken)

// User A creates installment plan
const { data: plan } = await userAClient
  .from('installment_plans')
  .insert({ ... })

// User B attempts to query User A's plan (should fail)
const { data, error } = await userBClient
  .from('installment_plans')
  .select()
  .eq('id', plan.id)

expect(data).toBeNull() // RLS blocks cross-user access
expect(error).toBeDefined()
```

### Reliability/Availability

| Requirement | Target | Mitigation |
|-------------|--------|------------|
| **Migration rollback safety** | 100% reversible | Include rollback script in migration comments |
| **Mode switching data integrity** | Zero data loss on mode switch (NFR11) | Atomic transactions + non-destructive approach |
| **Backward compatibility** | Existing Simple Mode users unaffected (NFR32) | `credit_mode = NULL` default, no forced prompts |
| **Graceful degradation** | Transaction flow works even if mode detection fails | Fallback: Save transaction, prompt mode later |
| **Installment orphan prevention** | No orphaned payments after plan deletion | ON DELETE CASCADE enforced at database level |

**Reliability Scenarios:**

| Scenario | Expected Behavior | Verification |
|----------|-------------------|--------------|
| User closes dialog mid-selection | Transaction remains pending, can retry | Test: Close dialog, verify transaction not confirmed |
| Mode switch interrupted (network fail) | No partial state, transaction rolls back | Test: Simulate network error, verify mode unchanged |
| Migration fails mid-execution | Database state unchanged | Test rollback script restores original schema |
| Existing credit cards (pre-migration) | No mode prompt until new transaction | Test: Verify `credit_mode = NULL` after migration |

### Observability

| Requirement | Implementation | Purpose |
|-------------|----------------|---------|
| **Mode selection tracking** | PostHog event: `credit_mode_selected` | Measure adoption rate, Credit vs Simple preference |
| **Mode switching tracking** | PostHog event: `credit_mode_switched` | Understand mode churn, installment cleanup patterns |
| **Detection failure logging** | Log when `needsCreditModeSelection()` throws error | Debug production issues |
| **Migration success logging** | Log migration execution time + row counts | Verify deployment success |
| **RLS policy performance** | Supabase slow query monitoring (> 1s queries) | Identify policy bottlenecks |

**Analytics Events Schema:**

```typescript
// Event: credit_mode_selected
{
  event: 'credit_mode_selected',
  userId: string,
  paymentMethodId: string,
  mode: 'credit' | 'simple',
  channel: 'web' | 'whatsapp',
  timestamp: ISO8601
}

// Event: credit_mode_switched
{
  event: 'credit_mode_switched',
  userId: string,
  paymentMethodId: string,
  previousMode: 'credit' | 'simple',
  newMode: 'credit' | 'simple',
  hadActiveInstallments: boolean,
  installmentsCleanedUp: boolean,
  timestamp: ISO8601
}

// Event: mode_switch_cancelled
{
  event: 'mode_switch_cancelled',
  userId: string,
  paymentMethodId: string,
  reason: 'installment_warning' | 'user_abort',
  timestamp: ISO8601
}
```

**Monitoring Dashboard (PostHog):**

| Panel | Metric | Alert Threshold |
|-------|--------|----------------|
| Mode Selection Rate | % of new credit card users selecting Credit Mode | < 20% (indicates unclear value prop) |
| Mode Switch Events | Count per day | Sudden spike (> 10x baseline = confusion) |
| Detection Errors | Error rate for `needsCreditModeSelection()` | > 1% (implementation bug) |
| Migration Success | Boolean flag per deployment | Failure (critical) |

## Dependencies and Integrations

### External Dependencies

| Dependency | Version | Purpose | Update Risk |
|------------|---------|---------|-------------|
| **PostgreSQL** | 15+ | Database with RLS support | LOW (Supabase managed) |
| **Supabase SDK** | ^2.38.0 | Database client, RLS enforcement | MEDIUM (breaking changes possible) |
| **PostHog SDK** | ^3.0.0 | Analytics tracking | LOW (stable API) |
| **Next.js** | 15.x | Frontend framework | MEDIUM (App Router breaking changes) |
| **Baileys** | ^6.5.0 | WhatsApp bot library | HIGH (frequent API changes) |

**Dependency Management:**
- All dependencies already present in existing codebase (brownfield)
- No new external services required
- PostHog already configured for frontend and WhatsApp bot
- Supabase connection pooling sufficient for new queries

### Internal Integrations

**Frontend → Database:**
```
Next.js Server Actions
    ↓ (Supabase client)
PostgreSQL payment_methods table
    ↓ (RLS policies)
User-specific credit mode data
```

**WhatsApp Bot → Database:**
```
Message Handler
    ↓ (mode-selection.ts)
Supabase Service Client
    ↓ (service key, bypasses RLS)
PostgreSQL payment_methods table
```

**Database → Analytics:**
```
Server Action / Handler
    ↓ (after successful update)
PostHog.capture('credit_mode_selected')
    ↓
PostHog Dashboard
```

### Integration Points

| Source | Target | Interface | Data Flow |
|--------|--------|-----------|-----------|
| **Transaction Form (Web)** | Mode Selection Dialog | Component props | Triggered when `needsCreditModeSelection() = true` |
| **Transaction Handler (WhatsApp)** | Mode Selection Handler | Function call | Conversational state machine |
| **Mode Selection Dialog** | `setCreditMode()` server action | TypeScript function | User choice → database update |
| **Settings Page** | `switchCreditMode()` server action | TypeScript function | Mode switch → warning → update |
| **Migration Script** | PostgreSQL | SQL DDL | Schema changes on deployment |
| **All handlers** | PostHog | Event tracking | Analytics after state changes |

### Database Schema Relationships

```
users (existing)
  ↓ (1:N)
payment_methods (extended)
  ├─ credit_mode: BOOLEAN
  ├─ statement_closing_day: INTEGER
  ├─ payment_due_day: INTEGER
  └─ monthly_budget: DECIMAL
  ↓ (1:N)
installment_plans (new)
  ↓ (1:N)
installment_payments (new)
  ↓ (N:1, optional)
transactions (existing)
```

**Cascade Behavior:**
- `installment_plans.payment_method_id` → `payment_methods.id`: NO ACTION (plans persist if card deleted—user choice)
- `installment_payments.plan_id` → `installment_plans.id`: CASCADE (payments deleted when plan deleted)
- `installment_payments.transaction_id` → `transactions.id`: SET NULL (payment record kept if transaction deleted)

### Migration Dependencies

**Migration 034 Prerequisites:**
- Existing `payment_methods` table (present in brownfield)
- Existing `users` table via Supabase Auth
- Existing `transactions` table (for installment linking)
- Existing `categories` table (for installment categorization)

**Migration 034 Creates:**
- 4 new columns on `payment_methods`
- 2 new tables (`installment_plans`, `installment_payments`)
- 4 new indexes
- 2 new RLS policies
- 2 new database functions (optional helpers)

**Post-Migration Validation:**
```sql
-- Verify columns added
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'payment_methods'
  AND column_name IN ('credit_mode', 'statement_closing_day', 'payment_due_day', 'monthly_budget');

-- Verify tables created
SELECT table_name
FROM information_schema.tables
WHERE table_name IN ('installment_plans', 'installment_payments');

-- Verify RLS enabled
SELECT tablename, rowsecurity
FROM pg_tables
WHERE tablename IN ('installment_plans', 'installment_payments');
```

### Component Dependencies (Frontend)

**New Components:**
- `credit-mode-selection-dialog.tsx` depends on:
  - Radix UI Dialog primitive (existing)
  - `setCreditMode()` server action (new)
  - Localization keys (new)

- `credit-card-settings.tsx` depends on:
  - `switchCreditMode()` server action (new)
  - `updateCreditCardSettings()` server action (new)
  - Existing form components (Input, Button, Card)

**Updated Components:**
- Transaction form: Add mode detection logic
- Settings page: Integrate credit card settings section

### Localization Dependencies

**New Translation Keys Required:**

**Frontend (`fe/messages/pt-BR.json` and `en.json`):**
```json
{
  "credit_mode": {
    "title": "Credit Card Mode",
    "credit_mode_label": "Credit Mode",
    "simple_mode_label": "Simple Mode",
    "credit_description": "Track installments, statement periods, and credit-specific budgets",
    "simple_description": "Treat credit card like debit—simple expense tracking",
    "switch_mode": "Switch Mode",
    "switch_warning": "You have {count} active installment(s). What do you want to do?",
    "keep_tracking": "Keep tracking installments",
    "mark_paid_off": "Mark all as paid off",
    "mode_switched": "Mode changed successfully"
  }
}
```

**WhatsApp Bot (`whatsapp-bot/src/localization/pt-br.ts` and `en.ts`):**
```typescript
credit_mode: {
  selection_prompt: {
    pt: 'Como você quer acompanhar este cartão?\n\n1️⃣ Modo Crédito\n- Acompanhe parcelamentos (3x, 12x, etc)\n- Orçamento mensal personalizado\n- Lembrete de fechamento da fatura\n\n2️⃣ Modo Simples\n- Trata como débito\n- Sem recursos de cartão de crédito\n\nResponda 1 ou 2',
    en: 'How would you like to track this card?\n\n1️⃣ Credit Mode\n- Track installments (3x, 12x, etc)\n- Personal monthly budget\n- Statement closing reminders\n\n2️⃣ Simple Mode\n- Treat as debit\n- No credit card features\n\nReply 1 or 2'
  },
  confirmation_credit: {
    pt: '✅ Modo Crédito ativado! Você pode adicionar parcelamentos e acompanhar sua fatura.',
    en: '✅ Credit Mode enabled! You can now add installments and track your statement.'
  },
  confirmation_simple: {
    pt: '✅ Modo Simples ativado! Este cartão será tratado como débito.',
    en: '✅ Simple Mode enabled! This card will be treated like debit.'
  }
}
```

## Acceptance Criteria (Authoritative)

These acceptance criteria are derived from Epic 1 stories in the epics document and map to functional requirements FR1-FR7.

### AC1: Database Schema Migration (Story 1.1)

**Given** the NexFinApp database exists with existing tables
**When** migration `034_credit_card_management.sql` is executed
**Then** the following changes are applied successfully:

1. **Payment Methods Extended:**
   - Column `statement_closing_day` added (INTEGER, CHECK 1-31, nullable)
   - Column `payment_due_day` added (INTEGER, CHECK > 0, nullable)
   - Column `credit_mode` added (BOOLEAN, default NULL)
   - Column `monthly_budget` added (DECIMAL(10,2), nullable)

2. **Installment Plans Table Created:**
   - Primary key `id` (UUID)
   - Foreign keys: `user_id`, `category_id`, `payment_method_id`
   - Status constraint: 'active', 'paid_off', 'cancelled'
   - Index `idx_installment_plans_user_status` exists

3. **Installment Payments Table Created:**
   - Primary key `id` (UUID)
   - Foreign key `plan_id` with ON DELETE CASCADE
   - Foreign key `transaction_id` with ON DELETE SET NULL
   - Status constraint: 'pending', 'paid', 'cancelled'
   - Indexes on `plan_id`, `due_date`, `status` exist

4. **RLS Policies Enabled:**
   - `installment_plans`: User can only access own plans
   - `installment_payments`: User can only access payments for own plans

5. **Migration is reversible:**
   - Rollback script exists and restores original schema

**Verification:**
```sql
-- Verify all columns exist
SELECT COUNT(*) = 4 FROM information_schema.columns
WHERE table_name = 'payment_methods'
  AND column_name IN ('credit_mode', 'statement_closing_day', 'payment_due_day', 'monthly_budget');

-- Verify RLS enabled
SELECT COUNT(*) = 2 FROM pg_tables
WHERE tablename IN ('installment_plans', 'installment_payments')
  AND rowsecurity = true;
```

### AC2: First Credit Card Transaction Detection (Story 1.2)

**Given** a user has a payment method with `type = 'credit'` and `credit_mode = NULL`
**When** the user adds their first transaction using this credit card
**Then** the system detects mode selection is needed

**And** the transaction is saved but marked as pending (not confirmed)
**And** the mode selection prompt is triggered (web: modal dialog, WhatsApp: message)

**Given** a user has a payment method with `credit_mode` already set (TRUE or FALSE)
**When** the user adds a transaction using this credit card
**Then** the transaction processes normally with NO mode selection prompt

**Given** a user has multiple credit cards, some with mode set, some without
**When** the user adds a transaction with a NEW credit card (no mode set)
**Then** mode selection prompt appears ONLY for that specific card

**Verification:**
- Test: Create payment_method with credit_mode=NULL, add transaction → prompt triggered
- Test: Set credit_mode=TRUE, add transaction → no prompt
- Test: Multiple cards, mode set for Card A, not for Card B → prompt only for Card B

### AC3: Credit Mode Selection (WhatsApp) (Story 1.3)

**Given** first credit card transaction triggers mode selection
**When** WhatsApp user receives the prompt
**Then** the message explains both options in user's locale (pt-BR or en):

**Portuguese:**
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

**When** user responds "1"
**Then** `payment_methods.credit_mode = TRUE`
**And** transaction is confirmed
**And** confirmation message sent: "✅ Modo Crédito ativado!"
**And** PostHog event `credit_mode_selected` tracked with mode='credit', channel='whatsapp'

**When** user responds "2"
**Then** `payment_methods.credit_mode = FALSE`
**And** transaction is confirmed
**And** confirmation message sent: "✅ Modo Simples ativado!"
**And** PostHog event `credit_mode_selected` tracked with mode='simple', channel='whatsapp'

**When** user responds with invalid input (e.g., "yes", "maybe")
**Then** clarification prompt sent: "Por favor, responda 1 para Modo Crédito ou 2 para Modo Simples"

**Verification:**
- Test: Send message, verify prompt contains correct localized text
- Test: Reply "1", verify credit_mode=TRUE, transaction confirmed
- Test: Reply "2", verify credit_mode=FALSE, transaction confirmed
- Test: Invalid reply, verify clarification sent

### AC4: Credit Mode Selection (Web Frontend) (Story 1.4)

**Given** user adding expense via web with new credit card
**When** transaction form is submitted
**Then** modal dialog appears with mode selection UI

**The dialog displays:**
- Title: "Choose Your Credit Card Mode"
- Two option cards side-by-side (mobile: stacked)
- **Credit Mode card:**
  - Icon (credit card with sparkles)
  - Benefits list (installments, budgets, statements)
  - Primary button: "Choose Credit Mode"
- **Simple Mode card:**
  - Icon (simple card)
  - Benefits list (simple tracking, no extra features)
  - Secondary button: "Choose Simple Mode"
- Expandable section: "What's the difference?" with comparison table

**When** user clicks "Choose Credit Mode"
**Then** `payment_methods.credit_mode = TRUE`
**And** modal closes
**And** transaction is confirmed
**And** success toast displayed: "Credit Mode enabled!"
**And** PostHog event tracked

**When** user clicks "Choose Simple Mode"
**Then** `payment_methods.credit_mode = FALSE`
**And** modal closes
**And** transaction is confirmed
**And** success toast displayed: "Simple Mode enabled!"
**And** PostHog event tracked

**When** user clicks outside modal or presses ESC without selecting
**Then** modal closes WITHOUT saving transaction
**And** user returns to transaction form (data preserved)

**Verification:**
- Test: Submit form with new card, verify modal appears
- Test: Click Credit Mode, verify mode=TRUE, transaction saved
- Test: Click Simple Mode, verify mode=FALSE, transaction saved
- Test: Close modal, verify transaction NOT saved
- Test: Mobile layout, verify cards stack vertically

### AC5: Mode Switching with Data Implications Warning (Story 1.5)

**Given** user with Credit Mode enabled (`credit_mode = TRUE`) has 3 active installments
**When** user requests to switch to Simple Mode
**Then** warning dialog displays:

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

**When** user chooses option 1 (keep installments)
**Then** `credit_mode = FALSE`
**And** installments remain `status = 'active'`
**And** future installment payments still auto-created
**And** confirmation: "Modo alterado. Parcelamentos ativos continuam."

**When** user chooses option 2 (pay off all)
**Then** `credit_mode = FALSE`
**And** all active installment plans set to `status = 'paid_off'`
**And** all pending installment_payments set to `status = 'cancelled'`
**And** confirmation: "Modo alterado. 3 parcelamentos marcados como quitados."

**When** user chooses option 3 (cancel)
**Then** no changes made
**And** returns to previous screen

**Given** user with NO active installments
**When** switching modes
**Then** simple confirmation dialog (no installment warning)
**And** mode updates immediately

**Verification:**
- Test: Switch with installments, verify warning shows count
- Test: Choose "keep", verify mode changed, installments active
- Test: Choose "pay off", verify mode changed, installments paid_off
- Test: Choose "cancel", verify no changes
- Test: Switch with no installments, verify immediate switch

### AC6: Simple Mode Backward Compatibility (Story 1.6)

**Given** payment method with `credit_mode = FALSE` (Simple Mode)
**When** user adds expense with this credit card
**Then** transaction created normally (no installment prompt, no statement period tracking)

**Given** Simple Mode credit card
**When** viewing dashboard or reports
**Then** credit card transactions appear alongside debit/cash
**And** no special credit card UI elements shown

**Given** Simple Mode credit card
**When** budgets calculated
**Then** uses calendar month (not statement period)
**And** category budgets apply normally

**Given** existing credit card users (pre-migration) with `credit_mode = NULL`
**When** database is migrated
**Then** all existing credit cards have `credit_mode = NULL`
**And** no mode selection prompts appear until user adds new transaction

**Given** user never wants Credit Mode features
**When** they choose Simple Mode
**Then** no prompts for installments, statements, or credit budgets appear
**And** experience identical to debit card tracking

**Verification:**
- Test: Create transaction with Simple Mode card, verify no credit features
- Test: Dashboard with Simple Mode card, verify no statement widgets
- Test: Budget calculation uses calendar month, not statement period
- Test: After migration, verify existing cards have credit_mode=NULL
- Test: Simple Mode user flow identical to debit card flow

## Traceability Mapping

This table maps each functional requirement to the implementing components, database entities, and test coverage.

| FR | Requirement | Epic 1 Story | Database | Frontend Component | Backend Handler | Test Coverage |
|----|-------------|--------------|----------|-------------------|-----------------|---------------|
| **FR1** | System detects first credit card transaction | 1.2 | payment_methods.credit_mode | Transaction form detection | transactions.ts | Unit: `needsCreditModeSelection()` |
| **FR2** | System prompts Credit/Simple Mode choice | 1.3, 1.4 | - | credit-mode-selection-dialog.tsx | mode-selection.ts | Integration: Mode selection flow |
| **FR3** | System stores mode preference per payment method | 1.3, 1.4 | payment_methods.credit_mode | - | setCreditMode() | Unit: Mode persistence |
| **FR4** | Users can switch modes | 1.5 | payment_methods.credit_mode | credit-card-settings.tsx | mode-switch.ts | Integration: Mode switching |
| **FR5** | System warns about data implications when switching | 1.5 | installment_plans (check active) | Warning dialog | switchCreditMode() | Unit: Installment check logic |
| **FR6** | Simple Mode = existing behavior | 1.6 | credit_mode = FALSE | - | All handlers check mode | Integration: Simple Mode flow |
| **FR7** | Credit Mode = credit features access | 1.6 | credit_mode = TRUE | Credit-specific UI | Credit handlers enabled | Integration: Credit Mode flow |

**Database Entities:**

| Entity | Purpose | Stories | Test Coverage |
|--------|---------|---------|---------------|
| `payment_methods.credit_mode` | Store user's mode choice | 1.1, 1.2, 1.3, 1.4, 1.5, 1.6 | Migration test, RLS test |
| `payment_methods.statement_closing_day` | Statement period basis | 1.1 (foundation for Epic 3) | Migration test |
| `payment_methods.payment_due_day` | Payment reminders | 1.1 (foundation for Epic 4) | Migration test |
| `payment_methods.monthly_budget` | User-defined budget | 1.1 (foundation for Epic 3) | Migration test |
| `installment_plans` | Installment metadata | 1.1 (foundation for Epic 2) | Migration test, RLS test |
| `installment_payments` | Monthly payments | 1.1 (foundation for Epic 2) | Migration test, CASCADE test |

**Component Mapping:**

| Component | Stories Implemented | Test Type | Coverage |
|-----------|---------------------|-----------|----------|
| `credit-mode-selection-dialog.tsx` | 1.4 | Component test | Mode selection UI, a11y |
| `credit-card-settings.tsx` | 1.5 | Component test | Mode switching UI |
| `mode-selection.ts` (handler) | 1.3 | Unit test | Conversational flow |
| `mode-switch.ts` (handler) | 1.5 | Unit test | Warning logic |
| `setCreditMode()` (action) | 1.3, 1.4 | Integration test | Database update |
| `switchCreditMode()` (action) | 1.5 | Integration test | Mode switch with warnings |
| Migration 034 | 1.1 | Migration test | Schema validation |

**Test Coverage by FR:**

| FR | Unit Tests | Integration Tests | E2E Tests | Manual Tests |
|----|-----------|-------------------|-----------|--------------|
| FR1 | `needsCreditModeSelection()` | First transaction detection | - | WhatsApp flow |
| FR2 | Message formatting | Mode selection dialog | - | WhatsApp + Web |
| FR3 | Database update | Mode persistence | - | - |
| FR4 | Switch validation | Mode switch flow | - | - |
| FR5 | Installment check | Warning dialog | - | WhatsApp warnings |
| FR6 | Simple Mode checks | Simple Mode transaction flow | Transaction creation | - |
| FR7 | Credit Mode checks | Credit Mode UI rendering | - | - |

**Acceptance Criteria Traceability:**

| AC | Stories | Components | Test Files |
|----|---------|-----------|------------|
| AC1 (Migration) | 1.1 | Migration 034 | `034_credit_card_management.test.sql` |
| AC2 (Detection) | 1.2 | transactions.ts | `transaction-detection.test.ts` |
| AC3 (WhatsApp Selection) | 1.3 | mode-selection.ts | `mode-selection.test.ts` |
| AC4 (Web Selection) | 1.4 | credit-mode-selection-dialog.tsx | `mode-selection-dialog.test.tsx` |
| AC5 (Mode Switch Warnings) | 1.5 | mode-switch.ts, credit-card-settings.tsx | `mode-switch.test.ts` |
| AC6 (Backward Compatibility) | 1.6 | All handlers | `backward-compatibility.test.ts` |

## Risks, Assumptions, Open Questions

### Risks

| ID | Risk | Impact | Probability | Mitigation | Owner |
|----|------|--------|-------------|------------|-------|
| **R1** | Existing credit card users confused by new mode prompt | MEDIUM | MEDIUM | Clear messaging: "This is a one-time choice, you can change it later." Default to Simple Mode matches existing behavior. | UX |
| **R2** | Migration fails on large existing payment_methods table | HIGH | LOW | Test migration on staging with realistic data volume. Include rollback script. Monitor execution time. | Backend |
| **R3** | Users accidentally choose wrong mode and don't know how to switch | MEDIUM | MEDIUM | Add prominent "Switch Mode" button in settings. Document switch flow in help/onboarding. | Product |
| **R4** | Mode switching with active installments causes data inconsistency | HIGH | LOW | Atomic transactions + non-destructive approach per ADR-004. Warning dialogs prevent accidental data loss. | Backend |
| **R5** | RLS policies have performance impact on queries | MEDIUM | LOW | Proper indexes (see migration). Monitor slow queries via Supabase. ADR-007 defer caching until proven need. | Backend |
| **R6** | Localization keys missing or incorrect for mode selection | LOW | MEDIUM | Comprehensive translation review before deployment. Test both pt-BR and en flows. | Frontend |
| **R7** | PostHog analytics not tracking mode selection events | MEDIUM | LOW | Add integration tests for analytics events. Monitor dashboard after deployment. | Backend |

**Risk Mitigation Timeline:**
- **Pre-deployment:** Test migration on staging (R2), translation review (R6), RLS performance tests (R5)
- **Deployment day:** Monitor migration logs (R2), verify analytics events (R7)
- **Post-deployment (Week 1):** Monitor mode selection rate (R1, R3), watch for support tickets about confusion

### Assumptions

| ID | Assumption | Validation | Impact if Wrong |
|----|------------|------------|-----------------|
| **A1** | Users understand "Credit Mode" vs "Simple Mode" terminology | User testing of mode selection dialog | Need to revise terminology, delay deployment |
| **A2** | Existing credit card users (pre-migration) have `credit_mode = NULL` and won't be prompted until next transaction | Migration script sets NULL by default | Immediate prompts for all users = support flood |
| **A3** | Credit cards are identified by `payment_methods.type = 'credit'` in existing schema | Code review confirms existing type field | Detection logic fails, no mode prompts |
| **A4** | Supabase RLS policies handle user_id checks correctly | RLS already used in existing codebase | Security vulnerability, cross-user data access |
| **A5** | PostHog SDK supports both frontend and WhatsApp bot environments | PostHog already integrated in brownfield | Analytics tracking incomplete |
| **A6** | Users won't create hundreds of installments per card | Typical user behavior analysis | Performance degradation on installment queries |
| **A7** | Mode selection doesn't require multi-card coordination (each card is independent) | Product decision confirms | Complex multi-card logic needed |
| **A8** | "Simple Mode" users will never need statement period budgets | Product vision aligns | Feature parity issues between modes |

**Assumption Validation Plan:**
- **A1:** User testing before deployment (1-2 weeks before)
- **A2:** Staging migration test confirms NULL default
- **A3:** Code review of existing payment_methods schema
- **A4:** RLS test suite (already exists for other tables)
- **A5:** Verify PostHog in both environments (already working)
- **A6:** Monitor query performance in production (first 2 weeks)
- **A7, A8:** Product confirmation (blocking for Epic 1)

### Open Questions

| ID | Question | Blocking? | Resolution Needed By | Owner |
|----|----------|-----------|---------------------|-------|
| **Q1** | Should mode selection be skippable with a "Decide later" option? | NO | Before Story 1.3 implementation | Product |
| **Q2** | Do we need a "Learn more" link in mode selection dialog pointing to documentation? | NO | Before Story 1.4 implementation | UX |
| **Q3** | Should we send a follow-up message after mode selection explaining next steps? | NO | Before Story 1.3 implementation | Product |
| **Q4** | Is there a maximum number of installments we should support per card? | NO | Before Epic 2 (foundation only in Epic 1) | Product |
| **Q5** | Should we allow users to have multiple credit cards with different modes? | NO (YES assumed) | Before Story 1.2 implementation | Product |
| **Q6** | Do we track which user creates installment plans (for households)? | NO | Epic 2 (out of scope for Epic 1) | Product |
| **Q7** | Should migration create sample data for testing? | NO | Before Story 1.1 implementation | Backend |

**Resolution Plan:**
- **Q1, Q2, Q3:** Product team to decide during Sprint Planning (non-blocking)
- **Q5:** Confirm with Product that YES is correct (assumed in spec)
- **Q7:** Decide: No sample data in production migration (testing uses separate script)

**Parking Lot (Deferred to Future Epics):**
- How do installments interact with recurring transactions? (Epic 2)
- Should statement period budgets override category budgets? (Epic 3)
- Do we support partial installment payoffs? (Epic 2 enhancement)
- Multi-currency credit cards? (Future, not MVP)

## Test Strategy Summary

### Testing Approach

Epic 1 testing follows a **pyramid strategy** with emphasis on unit and integration tests, minimal E2E tests due to WhatsApp bot limitations (per ADR-008).

```
         ┌─────────────┐
         │  Manual     │ ← WhatsApp flows, UX validation
         │  Testing    │
         ├─────────────┤
         │ Integration │ ← Database + Server Actions
         │  Tests      │
         ├─────────────┤
         │   Unit      │ ← Business logic, utilities
         │   Tests     │
         └─────────────┘
```

### Test Coverage by Story

| Story | Unit Tests | Integration Tests | Manual Tests | Coverage Target |
|-------|-----------|-------------------|--------------|-----------------|
| **1.1 Migration** | Schema validation script | Post-migration verification queries | Staging deployment | 100% schema |
| **1.2 Detection** | `needsCreditModeSelection()` logic | First transaction flow (web + bot) | - | 90% logic |
| **1.3 WhatsApp Selection** | Message formatting, choice parsing | Conversational state machine | Full WhatsApp flow | 80% handler |
| **1.4 Web Selection** | Component rendering, event handlers | Server action + modal flow | - | 90% component |
| **1.5 Mode Switching** | Installment check logic, warnings | Switch flow with/without installments | WhatsApp warnings | 85% handler |
| **1.6 Backward Compat** | Simple Mode checks in all handlers | Transaction flow (Simple Mode card) | - | 100% critical paths |

**Overall Coverage Target:** 85% line coverage, 90% branch coverage for critical paths (mode selection, switching logic)

### Unit Tests

**Scope:** Business logic, utilities, helpers

**Key Test Files:**
```
whatsapp-bot/src/__tests__/
├── handlers/
│   ├── credit-card/
│   │   ├── mode-selection.test.ts
│   │   └── mode-switch.test.ts
│   └── transactions/
│       └── transaction-detection.test.ts
└── utils/
    └── credit-mode-detection.test.ts

fe/__tests__/
├── lib/
│   └── actions/
│       └── payment-methods.test.ts
└── components/
    ├── transactions/
    │   └── credit-mode-selection-dialog.test.tsx
    └── settings/
        └── credit-card-settings.test.tsx
```

**Sample Unit Test:**
```typescript
// Test: First transaction detection
describe('needsCreditModeSelection', () => {
  it('returns true for credit card with NULL credit_mode', async () => {
    const paymentMethod = { type: 'credit', credit_mode: null }
    mockSupabase.from('payment_methods').select.mockResolvedValue({ data: paymentMethod })

    const result = await needsCreditModeSelection('pm-123')
    expect(result).toBe(true)
  })

  it('returns false for credit card with credit_mode set', async () => {
    const paymentMethod = { type: 'credit', credit_mode: true }
    mockSupabase.from('payment_methods').select.mockResolvedValue({ data: paymentMethod })

    const result = await needsCreditModeSelection('pm-123')
    expect(result).toBe(false)
  })

  it('returns false for debit card', async () => {
    const paymentMethod = { type: 'debit', credit_mode: null }
    mockSupabase.from('payment_methods').select.mockResolvedValue({ data: paymentMethod })

    const result = await needsCreditModeSelection('pm-123')
    expect(result).toBe(false)
  })
})
```

### Integration Tests

**Scope:** Database interactions, server actions, multi-component flows

**Key Integration Tests:**

**1. Mode Selection Flow (Web):**
```typescript
// Test: Full mode selection flow from transaction form to database
describe('Mode Selection Integration', () => {
  it('triggers modal on first credit transaction and saves choice', async () => {
    // Setup: User with credit card (credit_mode=NULL)
    const user = await createTestUser()
    const card = await createCreditCard(user.id, { credit_mode: null })

    // Action: Submit transaction form
    const { getByText, getByRole } = render(<TransactionForm userId={user.id} />)
    await user.type(getByRole('textbox', { name: 'Amount' }), '100')
    await user.selectOptions(getByRole('combobox', { name: 'Payment Method' }), card.id)
    await user.click(getByRole('button', { name: 'Save' }))

    // Assert: Mode selection modal appears
    expect(getByText('Choose Your Credit Card Mode')).toBeInTheDocument()

    // Action: Select Credit Mode
    await user.click(getByRole('button', { name: 'Choose Credit Mode' }))

    // Assert: Database updated, transaction confirmed
    const updatedCard = await getPaymentMethod(card.id)
    expect(updatedCard.credit_mode).toBe(true)

    const transactions = await getTransactions(user.id)
    expect(transactions).toHaveLength(1)
    expect(transactions[0].amount).toBe(100)
  })
})
```

**2. Mode Switching with Installments:**
```typescript
// Test: Mode switch with active installments shows warning
describe('Mode Switching Integration', () => {
  it('shows warning when switching to Simple Mode with active installments', async () => {
    // Setup: User with Credit Mode card and 2 active installments
    const user = await createTestUser()
    const card = await createCreditCard(user.id, { credit_mode: true })
    await createInstallmentPlan(user.id, card.id, { total: 1200, installments: 12 })
    await createInstallmentPlan(user.id, card.id, { total: 600, installments: 6 })

    // Action: Attempt to switch to Simple Mode
    const result = await switchCreditMode(card.id, false, user.id)

    // Assert: Returns warning with installment count
    expect(result.success).toBe(false)
    expect(result.requiresConfirmation).toBe(true)
    expect(result.warning).toContain('2')

    // Action: Confirm with "keep" option
    const finalResult = await switchCreditMode(card.id, false, user.id, { cleanupInstallments: false })

    // Assert: Mode switched, installments still active
    expect(finalResult.success).toBe(true)
    const updatedCard = await getPaymentMethod(card.id)
    expect(updatedCard.credit_mode).toBe(false)

    const plans = await getInstallmentPlans(user.id, card.id)
    expect(plans.filter(p => p.status === 'active')).toHaveLength(2)
  })
})
```

**3. RLS Policy Enforcement:**
```typescript
// Test: RLS prevents cross-user access
describe('RLS Policy Integration', () => {
  it('prevents User A from accessing User B installment plans', async () => {
    // Setup: Two users, each with installment plan
    const userA = await createTestUser()
    const userB = await createTestUser()
    const cardA = await createCreditCard(userA.id, { credit_mode: true })
    const cardB = await createCreditCard(userB.id, { credit_mode: true })
    const planA = await createInstallmentPlan(userA.id, cardA.id, { total: 1000, installments: 10 })
    const planB = await createInstallmentPlan(userB.id, cardB.id, { total: 500, installments: 5 })

    // Action: User A attempts to query User B's plan
    const clientA = createSupabaseClient(userA.authToken)
    const { data, error } = await clientA
      .from('installment_plans')
      .select()
      .eq('id', planB.id)

    // Assert: Query returns empty (RLS blocks)
    expect(data).toEqual([])
  })
})
```

### Manual Testing

**Scope:** WhatsApp conversational flows, UX validation, cross-platform consistency

**Manual Test Scenarios:**

**Scenario 1: WhatsApp Mode Selection (Happy Path)**
1. **Setup:** New user with credit card, first transaction
2. **Action:** Send message: "gastei 100 no cartão"
3. **Verify:** Receive mode selection prompt in Portuguese
4. **Action:** Reply "1" (Credit Mode)
5. **Verify:** Confirmation message received
6. **Verify:** Database shows `credit_mode = TRUE`
7. **Verify:** Transaction confirmed

**Scenario 2: Web Mode Selection (Happy Path)**
1. **Setup:** Log in as new user with credit card
2. **Action:** Navigate to Add Transaction form
3. **Action:** Enter amount, select credit card, submit
4. **Verify:** Modal appears with mode selection
5. **Action:** Click "Choose Simple Mode"
6. **Verify:** Modal closes, success toast appears
7. **Verify:** Dashboard shows transaction
8. **Verify:** No credit-specific UI elements

**Scenario 3: Mode Switching with Installments (WhatsApp)**
1. **Setup:** User with Credit Mode, 3 active installments
2. **Action:** Send "mudar cartão para modo simples"
3. **Verify:** Warning message lists 3 installments
4. **Action:** Reply "1" (keep tracking)
5. **Verify:** Confirmation, installments still active
6. **Action:** Add new transaction
7. **Verify:** No installment prompt (Simple Mode active)

**Scenario 4: Backward Compatibility**
1. **Setup:** Existing user with credit card (pre-migration)
2. **Action:** Log in after deployment
3. **Verify:** Dashboard unchanged, no new prompts
4. **Action:** Add transaction with existing card
5. **Verify:** Mode selection prompt appears (first time)
6. **Action:** Choose Simple Mode
7. **Verify:** Experience identical to pre-migration

**Manual Testing Checklist:**
- [ ] WhatsApp mode selection (pt-BR)
- [ ] WhatsApp mode selection (en)
- [ ] Web mode selection (pt-BR)
- [ ] Web mode selection (en)
- [ ] Mode switching with installments
- [ ] Mode switching without installments
- [ ] Backward compatibility (existing users)
- [ ] Multiple credit cards (mixed modes)
- [ ] RLS policy (cannot see other user's data)
- [ ] Analytics events tracked in PostHog

### Regression Testing

**Scope:** Ensure new credit features don't break existing functionality

**Regression Test Suite:**
- [ ] Debit card transactions work unchanged
- [ ] Cash transactions work unchanged
- [ ] Category budgets work unchanged (calendar month)
- [ ] Existing transaction list displays correctly
- [ ] Dashboard loads without errors
- [ ] Settings page includes new credit card section
- [ ] Localization works for pt-BR and en
- [ ] PostHog analytics events fire correctly

### Performance Testing

**Scope:** Verify NFRs met (see Performance section)

**Performance Test Cases:**
1. **Mode detection query:** Measure `needsCreditModeSelection()` < 100ms
2. **Mode switching:** Measure full flow < 1 second
3. **Migration execution:** Measure on staging with realistic data < 30 seconds
4. **RLS policy overhead:** Compare query times with/without RLS < 50ms overhead

**Load Testing:**
- Simulate 100 concurrent users adding transactions
- Measure mode selection dialog load time under load
- Monitor Supabase connection pool usage

### Test Data Management

**Seed Data (Development/Staging):**
```sql
-- Test user with various scenarios
INSERT INTO auth.users (id, email) VALUES
  ('user-1', 'test-simple@example.com'),    -- Simple Mode tester
  ('user-2', 'test-credit@example.com'),    -- Credit Mode tester
  ('user-3', 'test-mixed@example.com');     -- Multiple cards

-- Test payment methods
INSERT INTO payment_methods (id, user_id, name, type, credit_mode) VALUES
  ('pm-1', 'user-1', 'Nubank', 'credit', false),           -- Simple Mode
  ('pm-2', 'user-2', 'Inter', 'credit', true),             -- Credit Mode
  ('pm-3', 'user-3', 'C6', 'credit', null),                -- Not yet chosen
  ('pm-4', 'user-3', 'Itaú', 'credit', true);              -- Credit Mode

-- Test installment plans (for mode switching tests)
INSERT INTO installment_plans (id, user_id, description, total_amount, total_installments, payment_method_id) VALUES
  ('plan-1', 'user-2', 'Notebook', 2400, 12, 'pm-2'),
  ('plan-2', 'user-3', 'Celular', 1200, 10, 'pm-4');
```

### Acceptance Testing

**Definition of Done (Epic 1):**
- [ ] All 6 stories completed (1.1 - 1.6)
- [ ] All acceptance criteria validated (AC1-AC6)
- [ ] Unit test coverage ≥ 85% (critical paths ≥ 90%)
- [ ] Integration tests pass (mode selection, switching, RLS)
- [ ] Manual test scenarios completed (WhatsApp + Web)
- [ ] Regression tests pass (existing features unchanged)
- [ ] Performance NFRs met (mode detection < 100ms, switching < 1s)
- [ ] Security validated (RLS policies, no cross-user access)
- [ ] Localization verified (pt-BR and en)
- [ ] Analytics events tracked (PostHog dashboard shows data)
- [ ] Migration tested on staging (rollback works)
- [ ] Documentation updated (README, API docs)
- [ ] Product Owner approval

**Validation Method:**
- Developer: Self-test using checklist above
- QA: Manual testing on staging environment
- Product Owner: Review mode selection UX on both channels
- Architect: Code review for ADR compliance

---

**Tech Spec Complete**

This technical specification provides comprehensive guidance for implementing Epic 1: Credit Mode Foundation. All stories (1.1-1.6) are detailed with database schemas, API interfaces, workflows, NFRs, acceptance criteria, and traceability mapping.

**Next Steps:**
1. Review tech spec with team
2. Begin Story 1.1 (Database Migration)
3. Parallel development: Web (Stories 1.2, 1.4) + WhatsApp (Stories 1.2, 1.3)
4. Integration testing after Story 1.4 complete
5. Deploy to staging for manual testing
