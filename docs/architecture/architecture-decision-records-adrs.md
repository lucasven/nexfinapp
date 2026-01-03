# Architecture Decision Records (ADRs)

## ADR-001: Installment Data Model + Statement-Aware Budget Periods

**Status:** Accepted
**Date:** 2025-12-02
**Context:** Brazilian credit card users commonly use parcelamento (installment payments). NexFinApp must track parent purchase + N monthly payments, calculate "future commitments," support early payoff, and integrate with statement-period budgets.

**Decision:**

### 1. Two-Table Installment Storage

```sql
-- Parent table: Installment plans
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

**Rationale:**
- **Clean separation:** Plan metadata (total amount, description, merchant) vs individual payment records
- **Cultural fit:** Maps to Brazilian "compra parcelada em 12x" mental model (1 purchase = 12 payments)
- **Early payoff:** Atomic operation: `UPDATE plan SET status='paid_off'` + cascade to payments
- **Extensibility:** Add plan-level fields (e.g., interest rate, discount for early payoff) without touching payment records
- **Query efficiency:** Simple aggregation for "future commitments" dashboard

### 2. Payment Methods Extended for Credit Cards

```sql
ALTER TABLE payment_methods ADD COLUMN IF NOT EXISTS statement_closing_day INTEGER CHECK (statement_closing_day BETWEEN 1 AND 31);
ALTER TABLE payment_methods ADD COLUMN IF NOT EXISTS payment_due_day INTEGER CHECK (payment_due_day > 0);
ALTER TABLE payment_methods ADD COLUMN IF NOT EXISTS credit_mode BOOLEAN DEFAULT false;
ALTER TABLE payment_methods ADD COLUMN IF NOT EXISTS monthly_budget DECIMAL(10,2);

COMMENT ON COLUMN payment_methods.statement_closing_day IS 'Day of month when statement closes (1-31). NULL for non-credit cards.';
COMMENT ON COLUMN payment_methods.payment_due_day IS 'Days after closing when payment is due (e.g., 10 = due 10 days after closing).';
COMMENT ON COLUMN payment_methods.credit_mode IS 'TRUE if user opted into Credit Mode (vs Simple Mode). Only applicable for type=credit.';
COMMENT ON COLUMN payment_methods.monthly_budget IS 'User-defined budget per statement period. NULL if not set.';
```

**Rationale:**
- **Statement awareness:** Each credit card has its own closing date (e.g., Card A closes on 5th, Card B on 15th)
- **Opt-in model:** `credit_mode` flag enables credit-specific features (installments, statement tracking)
- **User-defined budgets:** Separate from bank credit limit—user sets personal spending goal per statement

### 3. Budget Period Rules

| Budget Type | Period Basis | Calculation Example |
|-------------|--------------|---------------------|
| **Category budgets** (global) | Calendar month | "Food: R$500" applies to all transactions in category from Jan 1 - Jan 31 (regardless of payment method) |
| **Credit card total budget** | Statement period | "Card A: R$2,000" applies to transactions on Card A from Jan 6 - Feb 5 (if statement_closing_day = 5) |
| **Debit/Cash** | Calendar month | No total budget concept (only category budgets apply) |

**Statement Period Calculation:**
```typescript
// Example: statement_closing_day = 5, reference_date = 2025-02-03
function getStatementPeriod(closingDay: number, referenceDate: Date) {
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth();
  const day = referenceDate.getDate();

  // If today is before or on closing day, statement period is (prev month closing+1) to (this month closing)
  // If today is after closing day, statement period is (this month closing+1) to (next month closing)

  if (day <= closingDay) {
    // Period: (prev_month, closingDay+1) → (this_month, closingDay)
    const start = new Date(year, month - 1, closingDay + 1);
    const end = new Date(year, month, closingDay);
    return { start, end };
  } else {
    // Period: (this_month, closingDay+1) → (next_month, closingDay)
    const start = new Date(year, month, closingDay + 1);
    const end = new Date(year, month + 1, closingDay);
    return { start, end };
  }
}

// Edge case handling: closingDay = 31 in February → use last day of month
```

### 4. Budget Calculation Queries

**Category Budget (Calendar Month):**
```sql
-- Example: "Food" spending in January 2025 (all payment methods)
SELECT SUM(t.amount) as spent
FROM transactions t
WHERE t.user_id = $1
  AND t.category_id = $2
  AND t.date >= '2025-01-01'
  AND t.date < '2025-02-01';
```

**Credit Card Total Budget (Statement Period):**
```sql
-- Example: Card A total spending in current statement
-- statement_closing_day = 5, today = 2025-02-03
-- Period: 2025-01-06 to 2025-02-05
SELECT SUM(t.amount) as spent
FROM transactions t
JOIN payment_methods pm ON t.payment_method_id = pm.id
WHERE t.user_id = $1
  AND t.payment_method_id = $2
  AND pm.credit_mode = true
  AND t.date >= '2025-01-06'
  AND t.date <= '2025-02-05';
```

**Installment Payment Handling:**
- Installment payment with `due_date = 2025-02-10` counts toward the statement period containing Feb 10
- If statement closes Feb 5, then Feb 10 payment is in the NEXT statement (Feb 6 - Mar 5)
- Budget impact: Only monthly installment amount counts, not total purchase amount

**Future Commitments Dashboard Query:**
```sql
-- Show user's upcoming installment obligations by month
SELECT
  date_trunc('month', ip.due_date) as commitment_month,
  SUM(ip.amount) as total_due
FROM installment_payments ip
JOIN installment_plans ipl ON ip.plan_id = ipl.id
WHERE ipl.user_id = $1
  AND ip.status = 'pending'
  AND ip.due_date > CURRENT_DATE
GROUP BY commitment_month
ORDER BY commitment_month;
```

**Consequences:**

**Positive:**
- ✅ Category budgets remain simple (no per-card complexity)
- ✅ Credit card budgets align with user's billing cycle (statement period)
- ✅ Installments integrate naturally (monthly payment counts against statement where due_date falls)
- ✅ Clean data model supports early payoff, plan editing, merchant tracking
- ✅ Future commitments calculation is straightforward aggregation

**Negative:**
- ❌ Two different budget period types add query complexity (frontend must handle both)
- ❌ Statement period calculation has edge cases (31st in February, leap years)
- ❌ Cannot track category budgets per credit card (deferred feature)

**Deferred Decisions:**
- Per-card category budgets (e.g., "Food on Card A: R$300") - too complex, low user value
- Materialized view for future commitments - premature optimization, add if queries are slow
- Multi-currency installments - assume BRL only for MVP

---

## ADR-002: Feature Flag Infrastructure (PostHog)

**Status:** Accepted
**Date:** 2025-12-02
**Context:** Epic B (AI Helper System) requires gradual rollout with instant rollback capability. PRD specifies 5% → 25% → 50% → 100% rollout strategy with A/B testing for quality comparison.

**Decision:** PostHog Feature Flags (pure, no environment variable fallback)

**Implementation:**

```typescript
// services/feature-flags.ts
import { posthog } from '@/lib/posthog'

export async function isHelperSystemEnabled(userId: string): Promise<boolean> {
  return await posthog.isFeatureEnabled('ai-helpers', userId)
}

export async function getHelperVariant(userId: string): Promise<'helpers' | 'control'> {
  const variant = await posthog.getFeatureFlagPayload('ai-helpers-experiment', userId)
  return variant === 'test' ? 'helpers' : 'control'
}
```

**Feature Flag Configuration (PostHog Dashboard):**

| Flag Key | Purpose | Rollout Strategy |
|----------|---------|------------------|
| `ai-helpers` | Master toggle for entire helper system | Percentage-based: 0% → 5% → 25% → 50% → 100% |
| `ai-helpers-credit-card` | Credit Card Helper domain | Enabled if `ai-helpers` true |
| `ai-helpers-transactions` | Transaction Helper domain | Enabled if `ai-helpers` true |
| `ai-helpers-experiment` | A/B test: helpers vs old system | 50/50 split for quality comparison |

**Integration Points:**

**WhatsApp Bot:**
```typescript
// handlers/message-handler.ts
const helpersEnabled = await isHelperSystemEnabled(userId)

if (helpersEnabled && message.startsWith('ajuda')) {
  // Route to helper system
  return await handleHelperIntent(message, userId)
} else {
  // Use existing explicit command system
  return await handleExplicitCommand(message, userId)
}
```

**Frontend:**
```typescript
// components/dashboard.tsx
const { isFeatureEnabled } = usePostHog()
const showHelperCTA = isFeatureEnabled('ai-helpers')

{showHelperCTA && (
  <HelpButton>Try "ajuda cartão" on WhatsApp</HelpButton>
)}
```

**Rollout Plan:**
```
Week 1-2:  Internal (userId filter: Lucas) - 0% general population
Week 3:    5% rollout
Week 4-5:  25% rollout (monitor error rates, conversation quality)
Week 6-7:  50% rollout
Week 8+:   100% if success metrics met:
           - Error rate < 5%
           - Helper usage rate > 30%
           - Positive feedback signals
```

**Rollback Mechanism:**
- PostHog dashboard: Set `ai-helpers` to 0% → instant disable for all users
- Response time: < 1 minute (PostHog flag evaluation cached with 30s TTL)

**Observability: PostHog Dashboard for Helper System**

Create dedicated dashboard with these panels:

**1. Rollout Overview**
- Feature flag status: `ai-helpers` (% enabled)
- Total users in rollout
- Users who invoked helpers (% of enabled)
- Week-over-week growth

**2. Helper Funnel**
```
Users with ai-helpers enabled
    ↓ (invocation rate)
Sent "ajuda" message
    ↓ (conversation depth)
Helper asked clarifying question
    ↓ (execution rate)
Helper executed action
    ↓ (completion rate)
Task completed successfully
```

**3. Quality Metrics**
- Average conversation turns (target: 2-3 for education-first)
- Error rate by helper domain
- Fallback to old system rate
- User satisfaction signals

**4. A/B Test Comparison**
- Side-by-side: `helpers` variant vs `control` variant
- Task completion rate
- Time to completion
- Error rates

**5. Domain Breakdown**
- Credit Card Helper usage vs Transaction Helper usage
- Most common intents per domain

**Analytics Events to Track:**

```typescript
// Event schema for helper system
posthog.capture('ai_helper_enabled', {
  userId,
  rollout_percentage: 25
})

posthog.capture('ai_helper_invoked', {
  userId,
  domain: 'credit-card',
  message_preview: message.substring(0, 50)
})

posthog.capture('ai_helper_clarified', {
  userId,
  domain,
  clarification_question
})

posthog.capture('ai_helper_executed', {
  userId,
  domain,
  action: 'add_installment',
  success: true
})

posthog.capture('ai_helper_completed', {
  userId,
  domain,
  task: 'installment_added',
  duration_ms: 1500,
  conversation_turns: 2
})

posthog.capture('ai_helper_error', {
  userId,
  domain,
  error_type: 'parsing_failed',
  message
})

posthog.capture('ai_helper_fallback', {
  userId,
  domain,
  reason: 'ambiguous_intent'
})
```

**Rationale:**
- **PostHog already integrated:** No new dependencies (see brownfield docs)
- **Native gradual rollout:** Built-in percentage targeting
- **Instant toggle:** Dashboard control for emergency rollback
- **A/B testing ready:** Compare helper quality vs old system
- **Cross-platform:** Works in both frontend (Next.js) and WhatsApp bot (Node.js)
- **Simpler:** No fallback logic complexity

**Consequences:**

**Positive:**
- ✅ Simple implementation (one SDK, no fallback complexity)
- ✅ Real-time rollout control via dashboard
- ✅ Built-in A/B testing and cohort management
- ✅ Rich analytics integration
- ✅ User-level targeting for internal testing

**Negative:**
- ❌ Hard dependency on PostHog availability (mitigated by existing reliability)
- ❌ 30-second cache TTL means rollback not instant (acceptable for this use case)

**Implementation Notes:**
- Dashboard creation: During Epic B development (not blocking)
- Feature flags: Create in PostHog before deployment
- Event tracking: Add to helper handler implementations
- Funnel setup: Configure after first week of 5% rollout (validate event schema)

---

## ADR-003: Helper System Architecture (Class-Based + LLM Routing)

**Status:** Accepted
**Date:** 2025-12-02
**Context:** Epic B (AI Helper System) introduces conversational helpers (Credit Card Helper, Transaction Helper as MVP, eventually 7 domain helpers). Need extensible architecture that shares common logic while keeping domain implementations separate.

**Decision:** Class-based architecture with BaseHelper abstraction + LLM-based domain routing

**Architecture:**

```typescript
// services/helpers/base-helper.ts
abstract class BaseHelper {
  abstract domain: string
  abstract systemPrompt: string
  abstract functions: OpenAIFunction[]

  async handle(message: string, userId: string, locale: string): Promise<HelperResponse> {
    const context = await this.loadUserContext(userId)
    const systemMessage = this.buildSystemPrompt(context, locale)
    const aiResponse = await this.callOpenAI(message, systemMessage, this.functions)
    await this.trackAICost(userId, this.domain, aiResponse.usage)

    if (aiResponse.requiresClarification) {
      return {
        type: 'clarification',
        message: this.formatClarification(aiResponse.question, locale),
        conversationId: aiResponse.id
      }
    }

    const result = await this.executeFunction(aiResponse.functionCall, userId)
    return {
      type: 'success',
      message: this.formatSuccessResponse(result, locale),
      actionTaken: aiResponse.functionCall.name
    }
  }

  // Abstract methods each helper must implement
  abstract loadUserContext(userId: string): Promise<HelperContext>
  abstract executeFunction(call: FunctionCall, userId: string): Promise<any>
  abstract formatSuccessResponse(result: any, locale: string): string
}

// services/helpers/credit-card-helper.ts
class CreditCardHelper extends BaseHelper {
  domain = 'credit-card'

  systemPrompt = `You are a credit card management assistant for a Brazilian expense tracker.
Your goal is to help users understand and manage their credit card spending with awareness, not pressure.

Key concepts:
- Parcelamento: Installment payments (e.g., "comprei em 12x" = bought in 12 installments)
- Fatura: Credit card statement
- Fechamento: Statement closing date

Always:
- Use awareness-first language (celebrate progress, never guilt)
- Ask clarifying questions if details are missing
- Explain what you're doing and why`

  functions = [
    { name: 'add_installment', description: '...' },
    { name: 'set_credit_card_budget', description: '...' },
    { name: 'check_statement_spending', description: '...' },
    { name: 'show_future_commitments', description: '...' }
  ]

  async loadUserContext(userId: string): Promise<CreditCardContext> {
    return {
      creditCards: await getCreditCards(userId),
      currentSpending: await getStatementSpending(userId),
      categories: await getCategories(userId)
    }
  }

  async executeFunction(call: FunctionCall, userId: string): Promise<any> {
    switch (call.name) {
      case 'add_installment':
        return await installmentService.create(userId, call.arguments)
      case 'set_credit_card_budget':
        return await budgetService.setCreditCardBudget(userId, call.arguments)
      // ...
    }
  }
}
```

**LLM-Based Domain Router:**

```typescript
// services/helpers/router.ts
const ROUTING_PROMPT = `Classify the user's message into one of these domains:
- credit-card: Credit card management, installments, statement, budget
- transactions: General transactions, expenses, income
- unclear: Not enough information to classify
- none: Not related to financial tracking

Return JSON: { "domain": "credit-card" | "transactions" | "unclear" | "none", "confidence": 0.0-1.0 }`

export async function routeToHelper(
  message: string,
  userId: string
): Promise<BaseHelper | null> {
  const routing = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: ROUTING_PROMPT },
      { role: 'user', content: message }
    ],
    response_format: { type: 'json_object' }
  })

  const { domain, confidence } = JSON.parse(routing.choices[0].message.content)

  await posthog.capture('ai_helper_routed', { userId, domain, confidence })

  switch (domain) {
    case 'credit-card': return new CreditCardHelper()
    case 'transactions': return new TransactionHelper()
    case 'unclear':
    case 'none': return null
  }
}
```

**Integration:**

```typescript
// handlers/message-handler.ts
const helpersEnabled = await isHelperSystemEnabled(userId)

if (helpersEnabled && message.startsWith('ajuda')) {
  const helper = await routeToHelper(message, userId)

  if (helper) {
    return await helper.handle(message, userId, locale)
  } else {
    return getHelperMenu(locale)
  }
}

// Fall through to existing explicit command system
return await handleExplicitCommand(message, userId)
```

**File Structure:**
```
services/helpers/
├── base-helper.ts          # Abstract base class
├── credit-card-helper.ts   # CreditCardHelper extends BaseHelper
├── transaction-helper.ts   # TransactionHelper extends BaseHelper
├── router.ts               # LLM-based domain routing
└── index.ts                # Export all helpers
```

**Cost Structure:**
- Routing call: ~500 tokens = $0.0003
- Helper call: ~1500 tokens = $0.001
- **Total per interaction: ~$0.0013** (within existing $1/day limit)

**Rationale:**
- **Base class consolidation:** Shared logic (OpenAI calls, cost tracking, error handling, education-first formatting)
- **LLM routing:** More accurate than keywords, helps troubleshooting, aligns with AI-first strategy
- **Extensibility:** Clear pattern for 7 eventual helpers (just extend BaseHelper)
- **Type safety:** Abstract methods enforce implementation contracts
- **Testability:** Mock base class methods for unit tests

**Consequences:**

**Positive:**
- ✅ Accurate domain routing (handles ambiguous cases)
- ✅ Shared logic in base class (DRY principle)
- ✅ Education-first language enforced in system prompts
- ✅ Clear extension pattern for future helpers
- ✅ Better troubleshooting (track routing decisions)

**Negative:**
- ❌ Extra cost (~$0.0003 per routing call)
- ❌ Two sequential OpenAI calls (routing + execution)
- ❌ More complex than keyword-based routing

**Accepted Tradeoffs:**
- Cost acceptable given existing $1/day AI budget
- Latency acceptable for conversational helper (2-3 seconds total)
- Complexity justified by accuracy and troubleshooting benefits

---

## ADR-004: Credit Mode Switch Behavior (Non-Destructive)

**Status:** Accepted
**Date:** 2025-12-02
**Context:** Users can switch a credit card between Credit Mode (installments, statement tracking) and Simple Mode (treated like debit) at any time. Need to decide what happens to existing data when they switch.

**Decision:** Non-destructive mode switching with warning dialogs and optional cleanup

**Behavior:**

**Switching TO Simple Mode (credit_mode: true → false):**
- Existing installment plans: Remain active and visible
- Future installment payments: Still tracked and counted in budgets
- Statement period budget: Remains (with UI warning about statement period)
- NEW transactions: No installment option, budget follows calendar month

**Switching TO Credit Mode (credit_mode: false → true):**
- Historical transactions: Unchanged
- Calendar month budget: User can optionally convert to statement period budget
- Prompt for statement closing day and payment due day
- NEW transactions: Installment option available, budget follows statement period

**Implementation:**

```typescript
// services/credit-mode-switcher.ts
interface SwitchResult {
  success: boolean
  requiresConfirmation?: boolean
  warning?: { pt: string; en: string }
  options?: Array<{ key: string; label: string }>
}

async function switchCreditMode(
  paymentMethodId: string,
  newMode: boolean,  // true = Credit Mode, false = Simple Mode
  userId: string
): Promise<SwitchResult> {

  if (newMode === false) {
    // Switching TO Simple Mode - check for active installments
    const activeInstallments = await supabase
      .from('installment_plans')
      .select('id')
      .eq('payment_method_id', paymentMethodId)
      .eq('status', 'active')

    if (activeInstallments.data && activeInstallments.data.length > 0) {
      return {
        success: false,
        requiresConfirmation: true,
        warning: {
          pt: `Você tem ${activeInstallments.data.length} parcelamento(s) ativo(s). Eles continuarão sendo rastreados mesmo em Modo Simples.`,
          en: `You have ${activeInstallments.data.length} active installment(s). They will continue to be tracked even in Simple Mode.`
        },
        options: [
          { key: 'keep', label: 'Continuar rastreando / Keep tracking' },
          { key: 'pay_off', label: 'Marcar como quitados / Mark as paid off' }
        ]
      }
    }
  }

  if (newMode === true) {
    // Switching TO Credit Mode - prompt for statement details
    return {
      success: false,
      requiresConfirmation: true,
      warning: {
        pt: 'Configure os detalhes do cartão para usar o Modo Crédito',
        en: 'Configure credit card details to use Credit Mode'
      },
      // Frontend will show form for statement_closing_day, payment_due_day, monthly_budget
    }
  }

  // Update mode
  await supabase
    .from('payment_methods')
    .update({ credit_mode: newMode })
    .eq('id', paymentMethodId)
    .eq('user_id', userId)  // Security: only update own cards

  await posthog.capture('credit_mode_switched', {
    userId,
    paymentMethodId,
    newMode,
    direction: newMode ? 'to_credit' : 'to_simple'
  })

  return { success: true }
}

async function markInstallmentsAsPaidOff(
  paymentMethodId: string,
  userId: string
): Promise<void> {
  // Mark all active installment plans as paid_off
  await supabase
    .from('installment_plans')
    .update({ status: 'paid_off' })
    .eq('payment_method_id', paymentMethodId)
    .eq('user_id', userId)
    .eq('status', 'active')

  // Cancel all pending payments
  const { data: plans } = await supabase
    .from('installment_plans')
    .select('id')
    .eq('payment_method_id', paymentMethodId)
    .eq('user_id', userId)

  if (plans) {
    await supabase
      .from('installment_payments')
      .update({ status: 'cancelled' })
      .in('plan_id', plans.map(p => p.id))
      .eq('status', 'pending')
  }
}
```

**Query Behavior (Budget Calculations):**

Budget calculations respect `credit_mode` at query time, NOT at transaction creation time:

```sql
-- Budget query adapts to current credit_mode
CREATE FUNCTION get_card_spending(
  p_payment_method_id UUID,
  p_reference_date DATE
) RETURNS DECIMAL AS $$
DECLARE
  v_credit_mode BOOLEAN;
  v_closing_day INTEGER;
  v_start_date DATE;
  v_end_date DATE;
BEGIN
  -- Get current credit_mode setting
  SELECT credit_mode, statement_closing_day
  INTO v_credit_mode, v_closing_day
  FROM payment_methods
  WHERE id = p_payment_method_id;

  IF v_credit_mode = true THEN
    -- Credit Mode: use statement period
    SELECT * INTO v_start_date, v_end_date
    FROM calculate_statement_period(v_closing_day, p_reference_date);
  ELSE
    -- Simple Mode: use calendar month
    v_start_date := date_trunc('month', p_reference_date);
    v_end_date := (date_trunc('month', p_reference_date) + INTERVAL '1 month')::DATE;
  END IF;

  RETURN (
    SELECT COALESCE(SUM(amount), 0)
    FROM transactions
    WHERE payment_method_id = p_payment_method_id
      AND date >= v_start_date
      AND date < v_end_date
  );
END;
$$ LANGUAGE plpgsql;
```

**Frontend Display:**

```tsx
// components/credit-cards/card-summary.tsx

{creditMode === false && activeInstallments > 0 && (
  <Alert variant="info">
    <Info className="h-4 w-4" />
    <AlertDescription>
      {t('credit_card.simple_mode_with_installments', {
        count: activeInstallments
      })}
      {/* pt-BR: "Este cartão está em Modo Simples, mas ainda tem {count} parcelamento(s) ativo(s)." */}
      <Link href="/installments" className="underline ml-2">
        {t('credit_card.view_installments')}
      </Link>
    </AlertDescription>
  </Alert>
)}

// Mode switch dialog
<AlertDialog>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>{warning.title}</AlertDialogTitle>
      <AlertDialogDescription>{warning.message}</AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancelar / Cancel</AlertDialogCancel>
      <AlertDialogAction onClick={() => handleSwitch('keep')}>
        Continuar rastreando / Keep tracking
      </AlertDialogAction>
      <AlertDialogAction onClick={() => handleSwitch('pay_off')} variant="destructive">
        Marcar como quitados / Mark as paid off
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

**WhatsApp Bot Interaction:**

```typescript
// User: "mudar cartão para modo simples"
// Bot response:

"Você tem 3 parcelamentos ativos neste cartão:
• Notebook - 5 de 12 parcelas (R$350 restante)
• Curso - 2 de 6 parcelas (R$400 restante)
• Celular - 1 de 10 parcelas (R$1.800 restante)

O que você quer fazer?
1️⃣ Continuar rastreando os parcelamentos
2️⃣ Marcar todos como quitados

Responda 1 ou 2."
```

**Rationale:**
- **Data integrity:** Never lose financial history automatically
- **User control:** Explicit choice about what happens to installments
- **Reversible:** Can switch back without data loss
- **Transparent:** Show active installments even in Simple Mode
- **Flexible budgets:** Query-time calculation adapts to current mode

**Consequences:**

**Positive:**
- ✅ No data loss when experimenting with modes
- ✅ User maintains complete financial history
- ✅ Clear warnings prevent confusion
- ✅ Optional cleanup for users who want clean state
- ✅ Budget calculations always accurate (based on current mode)

**Negative:**
- ❌ "Simple Mode" card can show installments (might be confusing)
- ❌ Requires warning dialogs (additional UX complexity)
- ❌ Budget period might be mixed temporarily

**Mitigations:**
- Clear UI messaging: "Este cartão está em Modo Simples, mas tem parcelamentos ativos"
- Prominent "View installments" link
- Optional cleanup action for users who want clean state

**Edge Cases Handled:**
1. Switch to Simple Mode with active installments → Warning + option to keep or pay off
2. Switch to Credit Mode without statement details → Prompt for closing day, due day
3. Switch back and forth multiple times → Data preserved, no corruption
4. Budget display shows correct period based on current mode

---

## ADR-005: Scheduled Jobs Infrastructure (In-Process Scheduler)

**Status:** Accepted
**Date:** 2025-12-02
**Context:** Credit card reminders (statement closing, payment due) need reliable scheduling and access to WhatsApp socket. Project already uses in-process `node-cron` scheduler at `whatsapp-bot/src/scheduler.ts`.

**Decision:** Add credit card reminder job to existing in-process scheduler

**Implementation:**

```typescript
// services/scheduler/credit-card-reminders-job.ts
import { supabase } from '../supabase/client.js'
import { sendWhatsAppMessage } from '../whatsapp/sender.js'
import { logger } from '../monitoring/logger.js'

export async function runCreditCardRemindersJob(): Promise<void> {
  const today = new Date()
  const reminders: ReminderJob[] = []

  // Query credit cards in Credit Mode
  const { data: cards } = await supabase
    .from('payment_methods')
    .select('id, user_id, name, statement_closing_day, payment_due_day')
    .eq('credit_mode', true)
    .eq('type', 'credit')

  for (const card of cards) {
    // Statement closing reminders (3 days, 1 day before)
    const nextClosing = getNextStatementClosing(card.statement_closing_day, today)
    const daysUntilClosing = differenceInDays(nextClosing, today)

    if ([3, 1].includes(daysUntilClosing)) {
      if (!await checkReminderSent(card.user_id, card.id, 'statement_closing', nextClosing, daysUntilClosing)) {
        reminders.push({
          userId: card.user_id,
          cardId: card.id,
          cardName: card.name,
          reminderType: 'statement_closing',
          daysUntil: daysUntilClosing,
          date: nextClosing
        })
      }
    }

    // Payment due reminders (5, 3, 1 day before)
    const nextPayment = getNextPaymentDue(card.statement_closing_day, card.payment_due_day, today)
    const daysUntilPayment = differenceInDays(nextPayment, today)

    if ([5, 3, 1].includes(daysUntilPayment)) {
      if (!await checkReminderSent(card.user_id, card.id, 'payment_due', nextPayment, daysUntilPayment)) {
        reminders.push({
          userId: card.user_id,
          cardId: card.id,
          cardName: card.name,
          reminderType: 'payment_due',
          daysUntil: daysUntilPayment,
          date: nextPayment
        })
      }
    }
  }

  // Send reminders
  for (const reminder of reminders) {
    try {
      await sendReminder(reminder)
      await markReminderSent(reminder)
    } catch (error) {
      logger.error('Failed to send credit card reminder', { reminder }, error as Error)
    }
  }

  logger.info('Credit card reminders completed', { count: reminders.length })
}
```

**Scheduler Registration:**

```typescript
// whatsapp-bot/src/scheduler.ts (update existing file)
import { runCreditCardRemindersJob } from './services/scheduler/credit-card-reminders-job.js'

const jobs: ScheduledJob[] = [
  // ... existing jobs ...
  {
    name: 'credit-card-reminders',
    schedule: '0 10 * * *', // Daily at 10 AM UTC
    handler: runCreditCardRemindersJob,  // In-process for WhatsApp access
    description: 'Daily credit card statement and payment reminders',
  },
]
```

**Idempotency Tracking:**

```sql
CREATE TABLE credit_card_reminders_sent (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  payment_method_id UUID NOT NULL REFERENCES payment_methods(id),
  reminder_type TEXT NOT NULL CHECK (reminder_type IN ('statement_closing', 'payment_due')),
  reminder_date DATE NOT NULL,  -- The actual closing/due date
  days_before INTEGER NOT NULL CHECK (days_before IN (1, 3, 5)),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Idempotency: one reminder per card per type per date per days_before
  UNIQUE(payment_method_id, reminder_type, reminder_date, days_before)
);

CREATE INDEX idx_cc_reminders_user ON credit_card_reminders_sent(user_id);
CREATE INDEX idx_cc_reminders_date ON credit_card_reminders_sent(reminder_date);

-- RLS policies
ALTER TABLE credit_card_reminders_sent ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own reminders" ON credit_card_reminders_sent
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Service role manages reminders" ON credit_card_reminders_sent
  FOR ALL USING (auth.jwt()->>'role' = 'service_role');
```

**Localization:**

```typescript
// localization/pt-br.ts
credit_card: {
  reminder: {
    statement_closes_tomorrow: '🔔 Lembrete: A fatura do seu {{cardName}} fecha amanhã!',
    statement_closes_soon: '🔔 Lembrete: A fatura do seu {{cardName}} fecha em {{daysUntil}} dias ({{date}})',
    payment_due_tomorrow: '💳 Lembrete: O vencimento do {{cardName}} é amanhã!',
    payment_due_soon: '💳 Lembrete: O vencimento do {{cardName}} é em {{daysUntil}} dias ({{date}})'
  }
}

// localization/en.ts
credit_card: {
  reminder: {
    statement_closes_tomorrow: '🔔 Reminder: Your {{cardName}} statement closes tomorrow!',
    statement_closes_soon: '🔔 Reminder: Your {{cardName}} statement closes in {{daysUntil}} days ({{date}})',
    payment_due_tomorrow: '💳 Reminder: Your {{cardName}} payment is due tomorrow!',
    payment_due_soon: '💳 Reminder: Your {{cardName}} payment is due in {{daysUntil}} days ({{date}})'
  }
}
```

**Timezone Handling:**

All date calculations use UTC. Statement dates are day-of-month (not specific time), so timezone doesn't affect reminder logic:

```typescript
function getNextStatementClosing(closingDay: number, referenceDate: Date): Date {
  // If today is before or on closing day, next closing is this month
  // If today is after closing day, next closing is next month
  const year = referenceDate.getUTCFullYear()
  const month = referenceDate.getUTCMonth()
  const day = referenceDate.getUTCDate()

  if (day <= closingDay) {
    return new Date(Date.UTC(year, month, closingDay))
  } else {
    return new Date(Date.UTC(year, month + 1, closingDay))
  }
}

function getNextPaymentDue(closingDay: number, paymentDueDays: number, referenceDate: Date): Date {
  const closingDate = getNextStatementClosing(closingDay, referenceDate)
  // Add payment_due_day days after closing
  return new Date(closingDate.getTime() + paymentDueDays * 24 * 60 * 60 * 1000)
}
```

**Rationale:**
- **In-process execution:** Direct access to WhatsApp socket (no IPC needed)
- **Follows existing pattern:** Same structure as `engagement-daily`, `send-payment-reminders`
- **Simple & reliable:** One daily check, database-backed idempotency
- **No new dependencies:** Uses existing `node-cron` setup
- **Batch resilience:** Errors don't stop other reminders from sending

**Consequences:**

**Positive:**
- ✅ Access to WhatsApp socket for direct message sending
- ✅ Consistent with existing job architecture
- ✅ Idempotent (won't send duplicate reminders)
- ✅ Simple to debug and monitor (same logging pattern)
- ✅ No additional infrastructure cost

**Negative:**
- ❌ Fixed time (10 AM UTC for all users)
- ❌ Daily precision only (not hourly/minute-level)
- ❌ Job failure waits 24h for retry

**Accepted Tradeoffs:**
- Fixed time acceptable: reminders don't need per-user timezone precision (day-level accuracy sufficient)
- Daily precision acceptable: statement/payment dates are day-based, not time-based
- 24h retry acceptable: reminders sent at multiple intervals (5d, 3d, 1d before) so one missed reminder doesn't break UX

**Reminder Schedule:**
- **Statement closing:** 3 days before, 1 day before
- **Payment due:** 5 days before, 3 days before, 1 day before
- **Execution time:** 10 AM UTC daily (consistent with other reminder jobs)

---

## ADR-006: Statement Period Calculation (Edge Case Handling)

**Status:** Accepted
**Date:** 2025-12-02
**Context:** Statement closing dates have edge cases when `statement_closing_day` exceeds the number of days in a month (e.g., closing_day = 31 in February with 28/29 days).

**Decision:** Use last day of month when closing_day exceeds available days (industry standard approach)

**Implementation:**

```typescript
// utils/statement-period.ts

/**
 * Get the actual statement closing date for a given reference date
 * Handles edge cases where closing_day > days in month
 */
export function getStatementClosingDate(
  closingDay: number,
  referenceDate: Date
): Date {
  const year = referenceDate.getUTCFullYear()
  const month = referenceDate.getUTCMonth()
  const day = referenceDate.getUTCDate()

  // Get actual closing day for this month (handles 31 -> 28/29/30)
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const actualClosingDay = Math.min(closingDay, daysInMonth)

  // If we're before or on closing day, this month's closing
  if (day <= actualClosingDay) {
    return new Date(Date.UTC(year, month, actualClosingDay))
  }

  // If we're after closing day, next month's closing
  const nextMonth = month + 1
  const nextYear = nextMonth > 11 ? year + 1 : year
  const nextMonthIndex = nextMonth > 11 ? 0 : nextMonth

  const daysInNextMonth = new Date(nextYear, nextMonthIndex + 1, 0).getDate()
  const nextActualClosingDay = Math.min(closingDay, daysInNextMonth)

  return new Date(Date.UTC(nextYear, nextMonthIndex, nextActualClosingDay))
}

/**
 * Get the statement period (start and end dates)
 * Period: (previous closing + 1 day) to (current closing)
 */
export function getStatementPeriod(
  closingDay: number,
  referenceDate: Date
): { start: Date; end: Date } {
  const closingDate = getStatementClosingDate(closingDay, referenceDate)

  // Find previous closing date
  const twoDaysBefore = new Date(closingDate.getTime() - 2 * 24 * 60 * 60 * 1000)
  const prevClosing = getStatementClosingDate(closingDay, twoDaysBefore)

  // Period: prev closing + 1 day to current closing
  const start = new Date(prevClosing.getTime() + 24 * 60 * 60 * 1000)
  const end = closingDate

  return { start, end }
}

/**
 * Get payment due date (closing date + payment_due_day days)
 */
export function getPaymentDueDate(
  closingDay: number,
  paymentDueDays: number,
  referenceDate: Date
): Date {
  const closingDate = getStatementClosingDate(closingDay, referenceDate)
  return new Date(closingDate.getTime() + paymentDueDays * 24 * 60 * 60 * 1000)
}
```

**Edge Case Behavior:**

| User Input | February 2024 (leap) | February 2025 | April 2025 | January 2025 |
|------------|---------------------|---------------|------------|--------------|
| closing_day = 31 | **Feb 29** | **Feb 28** | **Apr 30** | Jan 31 |
| closing_day = 30 | Feb 29 | **Feb 28** | Apr 30 | Jan 30 |
| closing_day = 29 | Feb 29 | **Feb 28** | Apr 29 | Jan 29 |
| closing_day = 15 | Feb 15 | Feb 15 | Apr 15 | Jan 15 |

**Examples:**

```typescript
// Example 1: Card closes on 31st, checking in February 2025
const closingDate = getStatementClosingDate(31, new Date('2025-02-15'))
// Returns: 2025-02-28 (last day of February)

// Example 2: Card closes on 31st, checking in March 2025 (after Feb 28)
const closingDate = getStatementClosingDate(31, new Date('2025-03-15'))
// Returns: 2025-03-31

// Example 3: Statement period for card closing on 31st in February
const period = getStatementPeriod(31, new Date('2025-02-15'))
// Returns: { start: 2025-01-29, end: 2025-02-28 }
// (Jan has 31 days, so prev closing was Jan 31, period is Feb 1-28)
```

**User-Facing Documentation:**

```typescript
// Frontend: Credit card setup form
<FormField name="statement_closing_day">
  <FormLabel>{t('credit_card.closing_day_label')}</FormLabel>
  <FormDescription>
    {t('credit_card.closing_day_help')}
  </FormDescription>
  <Input type="number" min={1} max={31} />
</FormField>

// Localization
// pt-BR:
credit_card: {
  closing_day_label: 'Dia de fechamento da fatura',
  closing_day_help: 'Entre 1 e 31. Se o dia for 31, usaremos o último dia do mês (28, 29 ou 30 quando aplicável).'
}

// en:
credit_card: {
  closing_day_label: 'Statement closing day',
  closing_day_help: 'Between 1 and 31. If day is 31, we\'ll use the last day of the month (28, 29, or 30 when applicable).'
}
```

**Database Validation:**

```sql
-- Allow closing_day 1-31 (no artificial constraint)
ALTER TABLE payment_methods
  ADD CONSTRAINT valid_closing_day CHECK (statement_closing_day BETWEEN 1 AND 31);

-- Comment explains edge case handling
COMMENT ON COLUMN payment_methods.statement_closing_day IS
  'Day of month when statement closes (1-31). If day exceeds month length, uses last day of month.';
```

**Testing Edge Cases:**

```typescript
// Unit tests for edge cases
describe('getStatementClosingDate', () => {
  it('handles closing_day 31 in February (non-leap)', () => {
    const result = getStatementClosingDate(31, new Date('2025-02-15'))
    expect(result.getUTCDate()).toBe(28)
  })

  it('handles closing_day 31 in February (leap year)', () => {
    const result = getStatementClosingDate(31, new Date('2024-02-15'))
    expect(result.getUTCDate()).toBe(29)
  })

  it('handles closing_day 31 in April (30 days)', () => {
    const result = getStatementClosingDate(31, new Date('2025-04-15'))
    expect(result.getUTCDate()).toBe(30)
  })

  it('handles closing_day 29 in February non-leap', () => {
    const result = getStatementClosingDate(29, new Date('2025-02-15'))
    expect(result.getUTCDate()).toBe(28)
  })

  it('handles normal case (closing_day 15)', () => {
    const result = getStatementClosingDate(15, new Date('2025-02-10'))
    expect(result.getUTCDate()).toBe(15)
  })
})
```

**Rationale:**
- **Matches industry standard:** Credit card issuers use "last day of month" approach
- **User intuition:** "My card closes on 31st" = last day of every month
- **No artificial constraints:** User can set their actual closing day (1-31)
- **Predictable behavior:** Clear rules for edge cases

**Consequences:**

**Positive:**
- ✅ Matches real-world credit card behavior
- ✅ Intuitive for users ("last day of month")
- ✅ No artificial day-of-month restrictions
- ✅ Well-documented edge cases
- ✅ Handles leap years correctly

**Negative:**
- ❌ Statement closing day varies by month (28/29/30/31 for closing_day=31)
- ❌ Requires user documentation

**Mitigations:**
- Clear help text in form: "Se o dia for 31, usaremos o último dia do mês"
- Display actual closing date in UI: "Próximo fechamento: 28 de fevereiro"
- Budget widget shows period: "Período: 1 fev - 28 fev"

**Implementation Notes:**
- All date calculations use UTC to avoid timezone issues
- Helper functions exported from shared utility module
- Unit tests cover all edge cases (leap year, 30-day months, February)
- Frontend displays actual closing dates (not just user's input)

---

## ADR-007: Budget Calculation Performance (Real-Time Aggregation)

**Status:** Accepted
**Date:** 2025-12-02
**Context:** Budget calculations aggregate transactions over periods (calendar month or statement period). Need to balance performance vs complexity for personal finance app scale.

**Decision:** Real-time aggregation with optimized indexes (defer caching until proven need)

**Implementation:**

```typescript
// utils/budget-calculations.ts

/**
 * Get spending for a category in calendar month
 * Uses index: idx_transactions_user_category_date
 */
export async function getCategorySpending(
  userId: string,
  categoryId: string,
  month: Date
): Promise<number> {
  const start = startOfMonth(month)
  const end = endOfMonth(month)

  const { data, error } = await supabase
    .from('transactions')
    .select('amount')
    .eq('user_id', userId)
    .eq('category_id', categoryId)
    .gte('date', start.toISOString())
    .lte('date', end.toISOString())

  if (error) throw error

  return data.reduce((sum, t) => sum + t.amount, 0)
}

/**
 * Get spending for credit card in statement period
 * Uses index: idx_transactions_user_payment_date
 */
export async function getCardSpending(
  userId: string,
  paymentMethodId: string,
  referenceDate: Date
): Promise<number> {
  // Get card's statement closing day
  const { data: card } = await supabase
    .from('payment_methods')
    .select('statement_closing_day')
    .eq('id', paymentMethodId)
    .single()

  if (!card) throw new Error('Payment method not found')

  // Calculate statement period
  const { start, end } = getStatementPeriod(card.statement_closing_day, referenceDate)

  const { data, error } = await supabase
    .from('transactions')
    .select('amount')
    .eq('user_id', userId)
    .eq('payment_method_id', paymentMethodId)
    .gte('date', start.toISOString())
    .lte('date', end.toISOString())

  if (error) throw error

  return data.reduce((sum, t) => sum + t.amount, 0)
}

/**
 * Get budget progress for a category
 */
export async function getCategoryBudgetProgress(
  userId: string,
  categoryId: string,
  month: Date
): Promise<{ spent: number; budget: number; remaining: number; percentage: number }> {
  // Get spending (real-time)
  const spent = await getCategorySpending(userId, categoryId, month)

  // Get budget limit
  const { data: budget } = await supabase
    .from('budgets')
    .select('amount')
    .eq('user_id', userId)
    .eq('category_id', categoryId)
    .eq('month', month.toISOString().slice(0, 7)) // YYYY-MM
    .maybeSingle()

  const budgetAmount = budget?.amount || 0
  const remaining = budgetAmount - spent
  const percentage = budgetAmount > 0 ? (spent / budgetAmount) * 100 : 0

  return { spent, budget: budgetAmount, remaining, percentage }
}
```

**Required Indexes:**

```sql
-- Verify/create indexes for optimal query performance

-- Category budget queries (calendar month)
CREATE INDEX IF NOT EXISTS idx_transactions_user_category_date
  ON transactions(user_id, category_id, date);

-- Credit card budget queries (statement period)
CREATE INDEX IF NOT EXISTS idx_transactions_user_payment_date
  ON transactions(user_id, payment_method_id, date);

-- User's all transactions (for dashboard)
CREATE INDEX IF NOT EXISTS idx_transactions_user_date
  ON transactions(user_id, date DESC);

-- Budget lookups
CREATE INDEX IF NOT EXISTS idx_budgets_user_category_month
  ON budgets(user_id, category_id, month);
```

**Query Performance Analysis:**

```sql
-- Explain plan for category spending query
EXPLAIN ANALYZE
SELECT SUM(amount) FROM transactions
WHERE user_id = 'uuid'
  AND category_id = 'uuid'
  AND date >= '2025-01-01'
  AND date <= '2025-01-31';

-- Expected: Index Scan on idx_transactions_user_category_date
-- Cost: ~10ms for 10k transactions per user
```

**Performance Expectations:**

| Transaction Count | Expected Query Time | Status |
|-------------------|---------------------|--------|
| 1,000 | <10ms | ✅ Excellent |
| 10,000 | <50ms | ✅ Good |
| 100,000 | <200ms | ✅ Acceptable |
| 1,000,000 | ~1s | ⚠️ Consider caching |

**Typical User Scale:**
- Average user: ~300 transactions/year
- Heavy user: ~3,000 transactions/year
- 10 years of data: ~30,000 transactions
- **Conclusion:** Real-time is sufficient

**Client-Side Caching (Optional Enhancement):**

```typescript
// Frontend: Use React Query for client-side caching
import { useQuery } from '@tanstack/react-query'

function useCategoryBudget(categoryId: string, month: Date) {
  return useQuery({
    queryKey: ['category-budget', categoryId, month.toISOString()],
    queryFn: () => getCategoryBudgetProgress(userId, categoryId, month),
    staleTime: 60000, // Cache for 1 minute
    refetchOnMount: false
  })
}

// Invalidate on transaction create/update/delete
const queryClient = useQueryClient()
await createTransaction(...)
queryClient.invalidateQueries(['category-budget'])
```

**Future Optimization Path (if needed):**

If performance becomes an issue (unlikely), add caching without changing architecture:

1. **Phase 1:** Client-side caching (React Query) - free, no infra
2. **Phase 2:** Database function with temp tables - stays in PostgreSQL
3. **Phase 3:** Redis caching - only if Phases 1-2 insufficient

**Rationale:**
- **YAGNI principle:** Don't build caching until there's proven need
- **PostgreSQL is fast:** Modern PostgreSQL handles aggregation easily at this scale
- **Simplicity:** No cache invalidation logic, no stale data issues
- **Proper indexes:** With correct indexes, queries are <50ms even with 100k rows
- **Easy to add later:** Can add caching without architecture changes

**Consequences:**

**Positive:**
- ✅ Simple implementation (no caching complexity)
- ✅ Always accurate (no stale data)
- ✅ No additional infrastructure (no Redis)
- ✅ Easy to debug (straightforward SQL queries)
- ✅ Fast enough for personal finance scale

**Negative:**
- ❌ Query on every page load/component render
- ❌ Could be slow at extreme scale (>100k transactions)
- ❌ No pre-aggregation for historical reports

**Accepted Tradeoffs:**
- Query-per-load acceptable: Personal finance apps have low traffic
- Extreme scale unlikely: Users rarely have >100k transactions
- Historical reports: Can optimize separately if needed

**Monitoring Plan:**

```typescript
// Log slow queries for monitoring
async function getCategorySpending(...) {
  const start = Date.now()

  const result = await supabase.from('transactions')...

  const duration = Date.now() - start
  if (duration > 200) {
    logger.warn('Slow budget query', { userId, categoryId, duration })
  }

  return result
}
```

**Migration Path:**

If caching becomes necessary:
1. Monitor query times via logging
2. Identify slow queries (>200ms)
3. Add client-side caching first (React Query)
4. Only add server-side caching if client-side insufficient

---

## ADR-008: Helper Rollout & Testing Strategy (Manual + Metrics-Driven)

**Status:** Accepted
**Date:** 2025-12-02
**Context:** Epic B (AI Helper System) requires testing before rollout and success metrics for phased deployment (5% → 25% → 50% → 100%). WhatsApp integration testing cannot be fully automated in CI.

**Decision:** Manual testing with metrics-driven gradual rollout

**Testing Approach:**

**Unit Tests (Automated in CI):**
```typescript
// __tests__/helpers/credit-card-helper.test.ts
describe('CreditCardHelper', () => {
  let helper: CreditCardHelper

  beforeEach(() => {
    helper = new CreditCardHelper()
  })

  it('parses installment intent correctly', async () => {
    const mockContext = {
      creditCards: [{ id: 'card1', name: 'Nubank' }],
      categories: [{ id: 'cat1', name: 'Eletrônicos' }]
    }

    jest.spyOn(helper, 'loadUserContext').mockResolvedValue(mockContext)
    jest.spyOn(helper, 'callOpenAI').mockResolvedValue({
      functionCall: {
        name: 'add_installment',
        arguments: {
          description: 'Notebook',
          total_amount: 3600,
          installments: 12,
          credit_card_id: 'card1'
        }
      }
    })

    const result = await helper.handle(
      'comprei notebook em 12x de 300',
      'user-123',
      'pt-BR'
    )

    expect(result.actionTaken).toBe('add_installment')
  })

  it('handles missing context gracefully', async () => {
    jest.spyOn(helper, 'loadUserContext').mockResolvedValue({
      creditCards: [],
      categories: []
    })

    const result = await helper.handle('ajuda cartão', 'user-123', 'pt-BR')

    expect(result.type).toBe('clarification')
    expect(result.message).toContain('cadastrar um cartão')
  })
})

// __tests__/helpers/router.test.ts
describe('Helper Router', () => {
  it('routes to credit card helper', async () => {
    const helper = await routeToHelper('ajuda cartão', 'user-123')
    expect(helper).toBeInstanceOf(CreditCardHelper)
  })

  it('routes to transaction helper', async () => {
    const helper = await routeToHelper('ajuda gastos', 'user-123')
    expect(helper).toBeInstanceOf(TransactionHelper)
  })

  it('returns null for unclear intent', async () => {
    const helper = await routeToHelper('não sei', 'user-123')
    expect(helper).toBeNull()
  })
})
```

**Manual Test Script (Not in CI):**
```typescript
// scripts/test-helpers.ts
/**
 * Manual test script for helpers
 * Usage: npm run test:helpers
 *
 * This script simulates helper conversations for manual QA
 * Cannot be automated due to WhatsApp API limitations
 */

interface TestScenario {
  name: string
  messages: string[]
  expectedOutcome: string
}

const TEST_SCENARIOS: TestScenario[] = [
  {
    name: 'Add installment - happy path',
    messages: [
      'ajuda cartão',
      'comprei notebook em 12x de 300'
    ],
    expectedOutcome: 'Creates installment plan with 12 monthly payments of R$300'
  },
  {
    name: 'Add installment - missing info',
    messages: [
      'ajuda cartão',
      'comprei algo parcelado'
    ],
    expectedOutcome: 'Helper asks clarifying questions (what, how many installments, amount)'
  },
  {
    name: 'Check statement spending',
    messages: [
      'ajuda cartão',
      'quanto gastei no cartão esse mês?'
    ],
    expectedOutcome: 'Shows current statement spending, budget, days until closing'
  },
  {
    name: 'Set credit card budget',
    messages: [
      'ajuda cartão',
      'quero limitar meus gastos em 2000'
    ],
    expectedOutcome: 'Sets monthly budget for credit card'
  },
  {
    name: 'Future commitments',
    messages: [
      'ajuda cartão',
      'quais são meus compromissos futuros?'
    ],
    expectedOutcome: 'Shows upcoming installment payments by month'
  },
  {
    name: 'Error handling - no credit cards',
    messages: [
      'ajuda cartão',
      'quanto gastei?'
    ],
    expectedOutcome: 'Explains user needs to add credit card first, shows how'
  },
  {
    name: 'Ambiguous intent',
    messages: [
      'ajuda',
      'não sei'
    ],
    expectedOutcome: 'Shows helper menu or asks clarifying question'
  }
]

async function runManualTests() {
  console.log('🧪 Manual Helper Test Suite\n')
  console.log('Instructions:')
  console.log('1. Read each scenario')
  console.log('2. Simulate the conversation on WhatsApp')
  console.log('3. Verify the outcome matches expectations')
  console.log('4. Mark pass/fail\n')
  console.log('━'.repeat(60))

  const results: { name: string; passed: boolean }[] = []

  for (const scenario of TEST_SCENARIOS) {
    console.log(`\n📝 Test: ${scenario.name}`)
    console.log(`\nMessages to send:`)
    scenario.messages.forEach((msg, i) => {
      console.log(`  ${i + 1}. "${msg}"`)
    })
    console.log(`\nExpected outcome:\n  ${scenario.expectedOutcome}`)
    console.log('\n' + '─'.repeat(60))

    const result = prompt('✅ Pass / ❌ Fail / ⏭️  Skip? (p/f/s): ')

    if (result?.toLowerCase() === 'p') {
      results.push({ name: scenario.name, passed: true })
      console.log('✅ PASS\n')
    } else if (result?.toLowerCase() === 'f') {
      results.push({ name: scenario.name, passed: false })
      const notes = prompt('Notes (optional): ')
      console.log(`❌ FAIL${notes ? ': ' + notes : ''}\n`)
    } else {
      console.log('⏭️  SKIPPED\n')
    }
  }

  console.log('\n' + '━'.repeat(60))
  console.log('\n📊 Test Results Summary\n')

  const passed = results.filter(r => r.passed).length
  const failed = results.filter(r => !r.passed).length
  const total = results.length

  console.log(`Total: ${total}`)
  console.log(`✅ Passed: ${passed}`)
  console.log(`❌ Failed: ${failed}`)
  console.log(`Pass rate: ${((passed / total) * 100).toFixed(1)}%\n`)

  if (failed > 0) {
    console.log('Failed tests:')
    results.filter(r => !r.passed).forEach(r => {
      console.log(`  - ${r.name}`)
    })
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runManualTests()
}
```

**Rollout Plan:**

| Phase | Rollout % | Duration | Success Criteria | Rollback Trigger |
|-------|-----------|----------|------------------|------------------|
| **Phase 0: Internal** | 0% (Lucas only) | Week 1-2 | All manual tests pass | N/A |
| **Phase 1: Pilot** | 5% | Week 3 | Error <10%, Completion >70%, Turns <4 | Error >15% or critical bug |
| **Phase 2: Early** | 25% | Week 4-5 | Same as Phase 1 | Same as Phase 1 |
| **Phase 3: Majority** | 50% | Week 6-7 | Same as Phase 1 | Same as Phase 1 |
| **Phase 4: Full** | 100% | Week 8+ | Same as Phase 1 | Same as Phase 1 |

**Success Metrics (from ADR-002 PostHog Dashboard):**

| Metric | Calculation | Target |
|--------|-------------|--------|
| **Error rate** | `ai_helper_error` / `ai_helper_invoked` | <10% |
| **Task completion rate** | `ai_helper_completed` / `ai_helper_invoked` | >70% |
| **Avg conversation turns** | Average of turns per completed task | <4 turns |
| **Routing accuracy** | Correct domain classification confidence | >90% |
| **User satisfaction** | Optional feedback (1-3 scale) | >2.0 avg |

**Decision Criteria Between Phases:**

```typescript
// utils/rollout-decision.ts
interface PhaseMetrics {
  errorRate: number
  completionRate: number
  avgTurns: number
  routingAccuracy: number
}

function shouldProceedToNextPhase(metrics: PhaseMetrics): boolean {
  return (
    metrics.errorRate < 0.10 &&
    metrics.completionRate > 0.70 &&
    metrics.avgTurns < 4 &&
    metrics.routingAccuracy > 0.90
  )
}

// Query PostHog for phase metrics
async function getPhaseMetrics(startDate: Date, endDate: Date): Promise<PhaseMetrics> {
  // Query PostHog events: ai_helper_invoked, ai_helper_completed, ai_helper_error
  // Calculate metrics
  // Return PhaseMetrics
}
```

**Rollback Procedure:**

If error rate >15% or critical bug discovered:
```typescript
// Immediate rollback
1. Set PostHog flag 'ai-helpers' to 0%
2. Notify team via Slack/email
3. Investigate error logs
4. Fix issue
5. Re-test manually
6. Resume rollout from previous phase
```

**Package.json Scripts:**

```json
{
  "scripts": {
    "test:helpers": "tsx scripts/test-helpers.ts",
    "test:helpers:ci": "jest --testPathPattern=helpers",
    "rollout:phase1": "echo 'Set PostHog ai-helpers to 5%'",
    "rollout:phase2": "echo 'Set PostHog ai-helpers to 25%'",
    "rollout:phase3": "echo 'Set PostHog ai-helpers to 50%'",
    "rollout:phase4": "echo 'Set PostHog ai-helpers to 100%'",
    "rollout:rollback": "echo 'Set PostHog ai-helpers to 0%'"
  }
}
```

**Rationale:**
- **Manual testing:** Catches UX/tone issues automation misses
- **Metrics-driven:** Objective criteria for phase progression
- **Low risk:** Gradual rollout with clear rollback triggers
- **Realistic:** Doesn't require automation of WhatsApp integration (impossible)
- **Fast iteration:** No beta recruitment or complex test infrastructure

**Consequences:**

**Positive:**
- ✅ Realistic for small team (manual testing feasible)
- ✅ Objective success criteria (PostHog metrics)
- ✅ Low risk (gradual rollout)
- ✅ Quality focus (manual testing catches UX issues)
- ✅ Fast rollback (PostHog toggle)

**Negative:**
- ❌ Manual testing time-consuming (~2 hours per phase)
- ❌ No automated E2E coverage for WhatsApp flow
- ❌ Relies on PostHog metric accuracy

**Accepted Tradeoffs:**
- Manual testing time acceptable: 2 hours per phase = 10 hours total (reasonable)
- No E2E automation acceptable: WhatsApp API limitations make this impossible
- Metric accuracy acceptable: PostHog is reliable, manual validation backstop

**Testing Timeline:**

```
Week 1: Write unit tests (CI), manual test script
Week 2: Internal testing (Lucas), iterate on prompts
Week 3: Phase 1 (5%), monitor daily
Week 4-5: Phase 2 (25%), monitor daily
Week 6-7: Phase 3 (50%), monitor daily
Week 8+: Phase 4 (100%), monitor weekly
```

---

## ADR-009: AI Cost Management for Helpers (Per-Helper Domain Tracking)

**Status:** Accepted
**Date:** 2025-12-02
**Context:** Each helper conversation uses GPT-4o-mini (avg 3-4 turns = ~$0.006 per session). With 7 eventual helpers and potential high engagement, need granular cost tracking + limits + graceful degradation.

**Decision:** Per-Helper Domain Tracking with Shared Daily Limit

**Implementation:**

### 1. Extend Existing `user_ai_usage` Table

```sql
-- Add helper domain tracking
ALTER TABLE user_ai_usage
ADD COLUMN helper_domain TEXT; -- 'budgets', 'installments', 'categories', etc.

-- Add index for helper cost queries
CREATE INDEX idx_user_ai_usage_helper_domain
ON user_ai_usage(user_id, date, helper_domain);

-- View for daily helper costs by domain
CREATE VIEW helper_costs_today AS
SELECT
  user_id,
  helper_domain,
  SUM(cost) as domain_cost,
  COUNT(*) as call_count,
  MAX(created_at) as last_used
FROM user_ai_usage
WHERE date = CURRENT_DATE
GROUP BY user_id, helper_domain;

-- View for total daily costs
CREATE VIEW user_daily_ai_costs AS
SELECT
  user_id,
  date,
  SUM(cost) as total_cost,
  COUNT(*) as total_calls
FROM user_ai_usage
GROUP BY user_id, date;
```

### 2. Cost Enforcement Function

```typescript
// services/ai/cost-manager.ts
import { supabase } from '../supabase/client.js'
import { logger } from '../monitoring/logger.js'

export interface BudgetStatus {
  allowed: boolean
  remaining: number
  usedToday: number
  limit: number
}

export async function checkHelperBudget(
  userId: string,
  domain: string
): Promise<BudgetStatus> {
  // Get user's daily AI cost limit
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('daily_ai_cost_limit')
    .eq('id', userId)
    .single()

  const limit = profile?.daily_ai_cost_limit || 1.00 // $1 default per NFR3

  // Calculate today's usage
  const { data: usage } = await supabase
    .from('user_ai_usage')
    .select('cost')
    .eq('user_id', userId)
    .eq('date', new Date().toISOString().split('T')[0])

  const usedToday = usage?.reduce((sum, row) => sum + row.cost, 0) || 0
  const remaining = limit - usedToday

  logger.info('Helper budget check', {
    userId,
    domain,
    usedToday,
    remaining,
    limit
  })

  return {
    allowed: remaining > 0.001, // Allow if >$0.001 remaining (~2 tokens)
    remaining,
    usedToday,
    limit
  }
}

export async function trackHelperCost(
  userId: string,
  domain: string,
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
): Promise<void> {
  // GPT-4o-mini pricing: $0.15/1M input, $0.60/1M output
  const inputCost = (usage.prompt_tokens / 1_000_000) * 0.15
  const outputCost = (usage.completion_tokens / 1_000_000) * 0.60
  const totalCost = inputCost + outputCost

  await supabase
    .from('user_ai_usage')
    .insert({
      user_id: userId,
      date: new Date().toISOString().split('T')[0],
      cost: totalCost,
      tokens_used: usage.total_tokens,
      helper_domain: domain
    })

  logger.info('Helper cost tracked', {
    userId,
    domain,
    cost: totalCost,
    tokens: usage.total_tokens
  })
}
```

### 3. Graceful Degradation in BaseHelper

```typescript
// services/helpers/base-helper.ts
import { checkHelperBudget, trackHelperCost } from '../ai/cost-manager.js'

abstract class BaseHelper {
  abstract domain: string
  abstract systemPrompt: string
  abstract functions: OpenAIFunction[]

  async handle(message: string, userId: string, locale: string): Promise<HelperResponse> {
    // Check budget BEFORE AI call
    const budget = await checkHelperBudget(userId, this.domain)

    if (!budget.allowed) {
      return {
        type: 'limit_reached',
        message: locale === 'pt-BR'
          ? `Você atingiu seu limite diário de IA ($${budget.usedToday.toFixed(2)} usado de $${budget.limit.toFixed(2)}). Volte amanhã ou use comandos manuais como /add, /budget, /list.`
          : `You've reached your daily AI limit ($${budget.usedToday.toFixed(2)} of $${budget.limit.toFixed(2)} used). Come back tomorrow or use manual commands like /add, /budget, /list.`,
        fallbackCommands: this.getFallbackCommands()
      }
    }

    // Load user context
    const context = await this.loadUserContext(userId)

    // Call OpenAI
    const aiResponse = await this.callOpenAI(message, context, this.systemPrompt, this.functions)

    // Track cost with helper domain
    await trackHelperCost(userId, this.domain, aiResponse.usage)

    return {
      type: 'success',
      message: aiResponse.message,
      actions: aiResponse.function_calls || []
    }
  }

  // Each helper defines its fallback commands
  protected abstract getFallbackCommands(): string[]
}

// Example: BudgetHelper
class BudgetHelper extends BaseHelper {
  domain = 'budgets'
  systemPrompt = '...' // From ADR-003
  functions = [...] // From ADR-003

  protected getFallbackCommands(): string[] {
    return ['/budget', '/budget ver', '/budget categoria']
  }
}
```

### 4. Admin Cost Analytics

```typescript
// Admin dashboard view for helper costs
// fe/lib/actions/admin.ts

export async function getHelperCostAnalytics(startDate: Date, endDate: Date) {
  const { data } = await supabase
    .from('user_ai_usage')
    .select('user_id, helper_domain, cost, date')
    .gte('date', startDate.toISOString())
    .lte('date', endDate.toISOString())
    .not('helper_domain', 'is', null)

  return {
    totalCost: data.reduce((sum, row) => sum + row.cost, 0),
    byDomain: groupBy(data, 'helper_domain'),
    byUser: groupBy(data, 'user_id'),
    avgCostPerConversation: calculateAvg(data, 'cost')
  }
}
```

**Rationale:**
- **Granular visibility:** Track which helpers cost most (optimize prompts for expensive ones)
- **Reuses existing table:** No new infrastructure, just add `helper_domain` column
- **Graceful degradation:** User sees helpful message + manual command alternatives
- **Per-user limits:** Respects individual `daily_ai_cost_limit` in user profile
- **Admin control:** Limits adjustable only by admin (not user-facing setting)
- **Realistic budget:** 7 helpers × 2 convos/day × $0.006 = $0.084/day (far under $1 limit)

**Consequences:**

**Positive:**
- ✅ Meets FR64 (enforce AI cost limits)
- ✅ Granular analytics for cost optimization
- ✅ No service degradation for normal usage
- ✅ Clear user communication when limit reached
- ✅ Fallback to manual commands preserves core functionality
- ✅ Simple implementation (extend existing table)

**Negative:**
- ❌ Shared limit across all helpers (can't allocate per-helper budgets)
- ❌ User can't self-adjust limits (admin-only)

**Accepted Tradeoffs:**
- Shared limit acceptable: Realistic usage ($0.084/day) far below limit ($1/day)
- Admin-only limit acceptable: Prevents abuse, aligns with cost control goals
- No per-helper budgets: Solves non-existent problem (no single helper will dominate costs)

**Example Scenarios:**

**Scenario 1: Normal Usage**
```
User: "quanto gastei em comida este mês?"
→ Budget check: $0.12 used / $1.00 limit → allowed ✅
→ Call BudgetHelper ($0.006)
→ Track cost: helper_domain='budgets', cost=$0.006
→ Response: "Você gastou R$450 em Alimentação este mês..."
```

**Scenario 2: Limit Reached**
```
User: "me ajuda com parcelamento"
→ Budget check: $1.003 used / $1.00 limit → denied ❌
→ Response (pt-BR): "Você atingiu seu limite diário de IA ($1.00 usado de $1.00).
   Volte amanhã ou use comandos manuais como /add, /budget, /list."
→ No AI call made
```

**Scenario 3: Admin Analytics**
```
Admin dashboard shows:
- Total helper costs last 7 days: $12.50
- Cost by domain:
  - budgets: $5.20 (41.6%)
  - installments: $3.80 (30.4%)
  - categories: $2.10 (16.8%)
  - recurring: $1.40 (11.2%)
- Top 5 users by AI cost
- Avg cost per conversation: $0.0058
```

---

## ADR-010: Auto-Payment Category Design (Saved Category)

**Status:** Accepted
**Date:** 2025-12-02
**Context:** When auto-pay executes recurring payments (FR47-FR50), need to determine which category to assign to the created transaction. Recurring payment has optional `category_id` field set at creation time.

**Decision:** Use Recurring Payment's Saved Category (Simple)

**Implementation:**

```typescript
// services/scheduler/auto-payments-job.ts
import { supabase } from '../supabase/client.js'
import { logger } from '../monitoring/logger.js'

export async function runAutoPaymentsJob(): Promise<void> {
  logger.info('Starting auto-payments job')

  // Get all active recurring payments due today
  const today = new Date().toISOString().split('T')[0]

  const { data: duePayments } = await supabase
    .from('recurring_payments')
    .select('*')
    .eq('auto_pay', true)
    .eq('status', 'active')
    .lte('next_due_date', today)

  logger.info(`Found ${duePayments?.length || 0} payments due for auto-pay`)

  for (const payment of duePayments || []) {
    try {
      await executeAutoPayment(payment)
    } catch (error) {
      logger.error(`Failed to execute auto-payment: ${payment.id}`, error as Error)
      // Continue with other payments even if one fails
    }
  }
}

async function executeAutoPayment(recurringPayment: RecurringPayment): Promise<void> {
  // Create transaction with saved category
  const { data: transaction, error } = await supabase
    .from('transactions')
    .insert({
      user_id: recurringPayment.user_id,
      amount: recurringPayment.amount,
      type: 'expense',
      description: recurringPayment.description,
      category_id: recurringPayment.category_id, // Use saved category from recurring payment
      payment_method_id: recurringPayment.payment_method_id,
      date: new Date().toISOString(),
      recurring_payment_id: recurringPayment.id,
      created_via: 'auto_payment'
    })
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to create auto-payment transaction: ${error.message}`)
  }

  // Update recurring payment's next_due_date
  const nextDueDate = calculateNextDueDate(
    recurringPayment.next_due_date,
    recurringPayment.frequency
  )

  await supabase
    .from('recurring_payments')
    .update({ next_due_date: nextDueDate, updated_at: new Date().toISOString() })
    .eq('id', recurringPayment.id)

  // Send WhatsApp notification
  await sendAutoPaymentNotification(recurringPayment.user_id, transaction)

  logger.info('Auto-payment executed successfully', {
    recurringPaymentId: recurringPayment.id,
    transactionId: transaction.id,
    amount: recurringPayment.amount,
    category: recurringPayment.category_id,
    nextDueDate
  })
}

function calculateNextDueDate(currentDueDate: string, frequency: string): string {
  const current = new Date(currentDueDate)

  switch (frequency) {
    case 'monthly':
      current.setMonth(current.getMonth() + 1)
      break
    case 'weekly':
      current.setDate(current.getDate() + 7)
      break
    case 'yearly':
      current.setFullYear(current.getFullYear() + 1)
      break
  }

  return current.toISOString().split('T')[0]
}

async function sendAutoPaymentNotification(userId: string, transaction: Transaction): Promise<void> {
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('whatsapp_jid, locale')
    .eq('id', userId)
    .single()

  if (!profile?.whatsapp_jid) return

  const message = profile.locale === 'pt-BR'
    ? `💳 Pagamento automático executado:\n${transaction.description}\nValor: R$ ${transaction.amount.toFixed(2)}\nData: ${new Date(transaction.date).toLocaleDateString('pt-BR')}`
    : `💳 Auto-payment executed:\n${transaction.description}\nAmount: R$ ${transaction.amount.toFixed(2)}\nDate: ${new Date(transaction.date).toLocaleDateString('en-US')}`

  await sendWhatsAppMessage(profile.whatsapp_jid, message)
}
```

**Scheduler Integration:**

```typescript
// whatsapp-bot/src/scheduler.ts (add to existing jobs array)
const jobs: ScheduledJob[] = [
  // ... existing jobs ...
  {
    name: 'execute-auto-payments',
    schedule: '0 6 * * *', // Daily at 6 AM UTC (already exists)
    handler: runAutoPaymentsJob,
    description: 'Daily execution of auto-pay recurring payments',
  },
]
```

**Rationale:**
- **Simplicity:** No additional logic or AI calls needed
- **Predictability:** User set category at recurring payment creation, it stays consistent
- **Performance:** Zero latency, no AI cost
- **User control:** User can always edit the transaction after auto-pay if category is wrong
- **Consistency:** Matches user's original intent when setting up recurring payment

**Consequences:**

**Positive:**
- ✅ Simple implementation (minimal code)
- ✅ Fast execution (no AI calls, no merchant matching)
- ✅ Zero AI cost for auto-payments
- ✅ Predictable behavior (always uses saved category)
- ✅ User can correct manually if needed

**Negative:**
- ❌ Doesn't adapt to user's evolving category preferences
- ❌ Misses learned merchant mappings and category corrections
- ❌ May assign outdated categories for long-running recurring payments

**Accepted Tradeoffs:**
- Stale categories acceptable: User set it intentionally, can update recurring payment if preferences change
- No intelligence acceptable: Simplicity and performance outweigh adaptive categorization for automated payments
- Manual correction acceptable: User can edit transaction post-creation if category is wrong

**Example Scenarios:**

**Scenario 1: Netflix Auto-Payment**
```
Recurring Payment Setup (3 months ago):
- Description: "Netflix"
- Category: "Entretenimento"
- Auto-pay: ON

Today (auto-pay executes):
→ Transaction created with category "Entretenimento"
→ WhatsApp notification sent
→ Next due date updated (+1 month)
```

**Scenario 2: User Changed Category Preferences**
```
Original: Spotify → "Entretenimento"
User later creates custom category "Assinaturas" and prefers it for subscriptions

Auto-pay still uses "Entretenimento" (saved category)

User's options:
1. Manually edit transaction after auto-pay
2. Update recurring payment's category for future auto-pays
3. Accept "Entretenimento" (still valid)
```

**Scenario 3: No Category Set**
```
Recurring Payment:
- Description: "Aluguel"
- Category: NULL (user didn't set)
- Auto-pay: ON

Auto-pay executes:
→ Transaction created with category_id = NULL (uncategorized)
→ User can categorize later via WhatsApp or web
```

---

## ADR-011: Performance Optimization Strategy (Defer Until Proven Need)

**Status:** Accepted
**Date:** 2025-12-02
**Context:** New features add complex queries (installment aggregations, statement period calculations, future commitment projections). Need to ensure NFR1 (Dashboard load <2s) without over-engineering.

**Decision:** Start with Real-Time Queries + Proper Indexes, Optimize Only If Performance Degrades

**Implementation:**

### 1. Index Strategy (Sufficient for Expected Load)

All indexes already defined in previous ADRs:

```sql
-- Installments (ADR-001)
CREATE INDEX idx_installment_plans_user_status ON installment_plans(user_id, status);
CREATE INDEX idx_installment_payments_plan ON installment_payments(plan_id);
CREATE INDEX idx_installment_payments_due_date_status ON installment_payments(due_date, status);

-- Transactions (existing + ADR-006 additions)
CREATE INDEX idx_transactions_user_date ON transactions(user_id, date);
CREATE INDEX idx_transactions_payment_method_date ON transactions(payment_method_id, date);
CREATE INDEX idx_transactions_category ON transactions(category_id);

-- Payment Methods (existing)
CREATE INDEX idx_payment_methods_user ON payment_methods(user_id);
```

### 2. Performance Monitoring

```typescript
// lib/analytics/performance.ts
import { posthog } from './client'

export function trackDashboardLoad(durationMs: number, userId: string): void {
  posthog.capture('dashboard_load', {
    duration_ms: durationMs,
    user_id: userId,
    threshold_exceeded: durationMs > 2000
  })
}

// Usage in dashboard page
export default async function DashboardPage() {
  const startTime = Date.now()

  const [transactions, budgets, installments] = await Promise.all([
    getTransactions(),
    getBudgets(),
    getInstallmentSummary()
  ])

  const duration = Date.now() - startTime
  trackDashboardLoad(duration, userId)

  return <Dashboard data={...} />
}
```

### 3. Query Optimization Guidelines

**Real-time queries acceptable for:**
- User-scoped data (single user's transactions, installments, budgets)
- Proper indexes on filter columns (user_id, date, status)
- Typical workload: <1000 transactions, <50 installments per user

**Example: Future Commitments Query (Performant as-is)**

```typescript
// services/installments/future-commitments.ts
export async function getFutureCommitments(userId: string, months: number = 12) {
  const endDate = new Date()
  endDate.setMonth(endDate.getMonth() + months)

  // Single query with proper indexes = <100ms
  const { data } = await supabase
    .from('installment_payments')
    .select(`
      id,
      installment_number,
      amount,
      due_date,
      status,
      plan:installment_plans (
        description,
        total_installments,
        payment_method_id
      )
    `)
    .eq('plan.user_id', userId) // Uses idx_installment_plans_user_status
    .eq('status', 'pending')
    .lte('due_date', endDate.toISOString()) // Uses idx_installment_payments_due_date_status
    .order('due_date', { ascending: true })

  return data
}
```

**Performance Characteristics:**
- 50 pending installments × 1 JOIN = ~50-100ms with indexes
- Dashboard parallel queries: all <200ms each
- Total dashboard load: <1s (well under 2s threshold)

### 4. Optimization Decision Tree

```
Dashboard load time > 2s?
  ├─ NO → Continue with current approach ✅
  └─ YES → Investigate bottleneck
      ├─ Slow query identified?
      │   ├─ Missing index? → Add index
      │   ├─ N+1 queries? → Add batch loading
      │   └─ Complex aggregation? → Consider materialized view
      └─ Network latency? → Review data fetching strategy
```

**Future Optimization Options (If Needed):**

```sql
-- Option A: Materialized view for installment summary (if aggregation slow)
CREATE MATERIALIZED VIEW user_installment_summary AS
SELECT
  user_id,
  COUNT(*) as active_plans,
  SUM(total_amount) as total_committed,
  SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END) as pending_amount
FROM installment_plans
JOIN installment_payments ON installment_plans.id = installment_payments.plan_id
WHERE installment_plans.status = 'active'
GROUP BY user_id;

-- Refresh daily via cron job
-- Only implement if real-time queries exceed 2s threshold
```

**Rationale:**
- **YAGNI Principle:** Don't optimize prematurely
- **Measurable:** PostHog tracking identifies actual bottlenecks
- **Simple:** Indexes sufficient for expected workload
- **Realistic Load:** Hundreds of transactions, dozens of installments won't challenge PostgreSQL with proper indexes
- **Fast Iteration:** No premature optimization complexity

**Consequences:**

**Positive:**
- ✅ Simple implementation (no caching layer)
- ✅ Always fresh data (no stale cache issues)
- ✅ Measurable performance (PostHog metrics)
- ✅ Optimize based on evidence, not speculation
- ✅ Proper indexes handle realistic workload (<1000 transactions per user)

**Negative:**
- ❌ Risk: Might need urgent optimization if usage exceeds expectations
- ❌ No proactive guarantee of <2s (though indexes make it highly likely)

**Accepted Tradeoffs:**
- Reactive optimization acceptable: PostHog alerts enable quick response
- Risk acceptable: Realistic workload + proper indexes = <1s load time (validated by existing similar queries in codebase)

**Expected Performance (Based on Existing Queries):**

| Query | Expected Duration | Index Used |
|-------|------------------|------------|
| Get transactions (last 30 days) | 50-100ms | idx_transactions_user_date |
| Get budgets (current month) | 30-50ms | idx_budgets_user |
| Get installment summary | 50-100ms | idx_installment_plans_user_status |
| Get future commitments (12 months) | 80-150ms | idx_installment_payments_due_date_status |
| **Total Dashboard Load** | **<500ms** | Parallel queries |

**Monitoring & Alerts:**

```typescript
// PostHog dashboard: "Dashboard Performance"
// Alert: Email if p95 > 2000ms for 24 hours
// Metrics:
// - dashboard_load (duration_ms)
// - Breakdown by query type
// - p50, p95, p99 latencies
```

---

## ADR-012: Analytics Event Design (Extend Existing PostHog Pattern)

**Status:** Accepted
**Date:** 2025-12-02
**Context:** Need to track user behavior for helper system rollout (ADR-008), credit card feature adoption, and product analytics. PostHog already integrated in frontend and needs extension to WhatsApp bot.

**Decision:** Extend Existing PostHog Event Pattern

**Implementation:**

### 1. Frontend Events (Extend Existing Pattern)

```typescript
// fe/lib/analytics/events.ts (extend existing file)

// ============================================
// Credit Card Management Events
// ============================================

export const trackCreditCardCreated = (userId: string, creditMode: boolean) => {
  posthog.capture('credit_card_created', {
    user_id: userId,
    credit_mode: creditMode,
    feature_flag: 'credit-card-management'
  })
}

export const trackCreditModeToggled = (
  userId: string,
  from: 'simple' | 'credit',
  to: 'simple' | 'credit',
  hasActiveInstallments: boolean
) => {
  posthog.capture('credit_mode_toggled', {
    user_id: userId,
    from_mode: from,
    to_mode: to,
    had_active_installments: hasActiveInstallments,
    feature_flag: 'credit-card-management'
  })
}

export const trackInstallmentCreated = (
  userId: string,
  installments: number,
  totalAmount: number,
  method: 'web' | 'whatsapp'
) => {
  posthog.capture('installment_created', {
    user_id: userId,
    installment_count: installments,
    total_amount: totalAmount,
    created_via: method,
    feature_flag: 'credit-card-management'
  })
}

export const trackStatementPeriodViewed = (userId: string, cardId: string) => {
  posthog.capture('statement_period_viewed', {
    user_id: userId,
    card_id: cardId,
    feature_flag: 'credit-card-management'
  })
}

// ============================================
// AI Helper Events (from ADR-008)
// ============================================

export const trackHelperInvoked = (
  userId: string,
  domain: string,
  channel: 'web' | 'whatsapp'
) => {
  posthog.capture('ai_helper_invoked', {
    user_id: userId,
    helper_domain: domain,
    channel: channel,
    feature_flag: 'ai-helpers'
  })
}

export const trackHelperCompleted = (
  userId: string,
  domain: string,
  turns: number,
  success: boolean,
  channel: 'web' | 'whatsapp'
) => {
  posthog.capture('ai_helper_completed', {
    user_id: userId,
    helper_domain: domain,
    turn_count: turns,
    success: success,
    channel: channel,
    feature_flag: 'ai-helpers'
  })
}

export const trackHelperError = (
  userId: string,
  domain: string,
  errorType: string,
  channel: 'web' | 'whatsapp'
) => {
  posthog.capture('ai_helper_error', {
    user_id: userId,
    helper_domain: domain,
    error_type: errorType,
    channel: channel,
    feature_flag: 'ai-helpers'
  })
}

export const trackHelperLimitReached = (
  userId: string,
  domain: string,
  usedToday: number,
  limit: number
) => {
  posthog.capture('ai_helper_limit_reached', {
    user_id: userId,
    helper_domain: domain,
    used_today: usedToday,
    daily_limit: limit,
    feature_flag: 'ai-helpers'
  })
}
```

### 2. WhatsApp Bot Events (New Integration)

```typescript
// whatsapp-bot/src/services/analytics/posthog.ts (NEW FILE)
import { PostHog } from 'posthog-node'
import { logger } from '../monitoring/logger.js'

const posthog = new PostHog(
  process.env.POSTHOG_API_KEY!,
  { host: process.env.POSTHOG_HOST || 'https://app.posthog.com' }
)

export const trackWhatsAppEvent = (
  userId: string,
  event: string,
  properties: Record<string, any>
) => {
  try {
    posthog.capture({
      distinctId: userId,
      event,
      properties: {
        ...properties,
        channel: 'whatsapp'
      }
    })
  } catch (error) {
    logger.error('Failed to track PostHog event', { event, userId }, error as Error)
    // Don't throw - analytics failure shouldn't break app
  }
}

// Helper-specific tracking functions
export const trackHelperInvoked = (userId: string, domain: string) => {
  trackWhatsAppEvent(userId, 'ai_helper_invoked', {
    helper_domain: domain,
    feature_flag: 'ai-helpers'
  })
}

export const trackHelperCompleted = (
  userId: string,
  domain: string,
  turns: number,
  success: boolean
) => {
  trackWhatsAppEvent(userId, 'ai_helper_completed', {
    helper_domain: domain,
    turn_count: turns,
    success: success,
    feature_flag: 'ai-helpers'
  })
}

export const trackHelperError = (userId: string, domain: string, errorType: string) => {
  trackWhatsAppEvent(userId, 'ai_helper_error', {
    helper_domain: domain,
    error_type: errorType,
    feature_flag: 'ai-helpers'
  })
}

export const trackInstallmentCreated = (
  userId: string,
  installments: number,
  totalAmount: number
) => {
  trackWhatsAppEvent(userId, 'installment_created', {
    installment_count: installments,
    total_amount: totalAmount,
    created_via: 'whatsapp',
    feature_flag: 'credit-card-management'
  })
}

// Graceful shutdown
export const shutdownPostHog = async () => {
  await posthog.shutdown()
}
```

**Package.json Addition:**

```json
{
  "dependencies": {
    "posthog-node": "^4.0.0"
  }
}
```

**Env Var Addition (.env):**

```bash
POSTHOG_API_KEY=phc_xxxxx
POSTHOG_HOST=https://app.posthog.com
```

### 3. Usage Examples

**Frontend:**

```typescript
// fe/components/credit-cards/create-card-dialog.tsx
import { trackCreditCardCreated } from '@/lib/analytics/events'

async function handleCreateCard(data: CardFormData) {
  const card = await createPaymentMethod(data)

  trackCreditCardCreated(userId, data.creditMode)

  toast.success('Cartão criado com sucesso!')
}
```

**WhatsApp Bot:**

```typescript
// whatsapp-bot/src/services/helpers/budget-helper.ts
import { trackHelperInvoked, trackHelperCompleted } from '../analytics/posthog.js'

class BudgetHelper extends BaseHelper {
  async handle(message: string, userId: string, locale: string): Promise<HelperResponse> {
    trackHelperInvoked(userId, this.domain)

    try {
      const result = await super.handle(message, userId, locale)
      trackHelperCompleted(userId, this.domain, result.turns, true)
      return result
    } catch (error) {
      trackHelperError(userId, this.domain, (error as Error).message)
      throw error
    }
  }
}
```

### 4. PostHog Dashboards

**Dashboard 1: Credit Card Management Adoption**

Metrics:
- `credit_card_created` count (by `credit_mode`)
- `credit_mode_toggled` funnel
- `installment_created` count (by `installment_count` histogram)
- `statement_period_viewed` unique users

**Dashboard 2: AI Helper Performance (from ADR-008)**

Metrics:
- `ai_helper_invoked` count (by `helper_domain`)
- `ai_helper_completed` rate (by `helper_domain`)
- `ai_helper_error` rate (by `error_type`)
- `ai_helper_limit_reached` count
- Avg `turn_count` per conversation

**Dashboard 3: Feature Flag Rollout**

Metrics:
- Users with `ai-helpers` enabled (%)
- Users with `credit-card-management` enabled (%)
- Adoption rate by cohort

**Rationale:**
- **Consistency:** Extends existing PostHog pattern in frontend
- **Simple:** No complex event taxonomy, just ad-hoc events as needed
- **Integrated:** PostHog already configured in frontend, easy to add to bot
- **Sufficient:** Covers all metrics needed for ADR-008 rollout + product analytics

**Consequences:**

**Positive:**
- ✅ Consistent with existing analytics implementation
- ✅ Simple to implement (extend existing file + add bot integration)
- ✅ PostHog already configured (no new infrastructure)
- ✅ Supports feature flag analysis (ADR-002)
- ✅ Enables rollout metrics (ADR-008)
- ✅ Non-blocking (analytics failures don't break app)

**Negative:**
- ❌ No structured event taxonomy (could become messy at scale)
- ❌ No event schema validation (typos possible)

**Accepted Tradeoffs:**
- Unstructured events acceptable: Current scale doesn't justify complex taxonomy
- No validation acceptable: TypeScript function signatures provide basic safety
- Manual dashboard creation acceptable: Small number of dashboards needed

**Event Inventory:**

| Event | Properties | Purpose |
|-------|-----------|---------|
| `credit_card_created` | user_id, credit_mode, feature_flag | Track credit card adoption |
| `credit_mode_toggled` | user_id, from_mode, to_mode, had_active_installments, feature_flag | Track mode switching behavior |
| `installment_created` | user_id, installment_count, total_amount, created_via, feature_flag | Track parcelamento usage |
| `statement_period_viewed` | user_id, card_id, feature_flag | Track statement period feature usage |
| `ai_helper_invoked` | user_id, helper_domain, channel, feature_flag | Track helper invocations (ADR-008) |
| `ai_helper_completed` | user_id, helper_domain, turn_count, success, channel, feature_flag | Track helper success rate (ADR-008) |
| `ai_helper_error` | user_id, helper_domain, error_type, channel, feature_flag | Track helper errors (ADR-008) |
| `ai_helper_limit_reached` | user_id, helper_domain, used_today, daily_limit, feature_flag | Track AI cost limit hits (ADR-009) |

---
