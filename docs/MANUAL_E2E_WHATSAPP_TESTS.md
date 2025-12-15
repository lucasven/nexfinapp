# Manual E2E WhatsApp Testing Checklist
## Credit Card Features (Epics 1-4)

**Date**: 2025-12-09
**Tester**: Lucas
**Environment**: Production/Staging
**WhatsApp Number**: _________________

---

## Pre-Test Setup

### Required Test Data
- [ ] **User account** with WhatsApp authorized
- [ ] **Credit card** added to account (type: credit card)
- [ ] **Default bank account** for payment transactions (optional but recommended)
- [ ] Clear any existing test data or note current state

### Test Phone Setup
- [ ] WhatsApp connected and active
- [ ] Delete conversation history with bot (fresh start)
- [ ] Note current time for testing scheduled jobs (if applicable)

---

## 🔴 P0 Tests (CRITICAL - Must Pass)

### Test 1: Enable Credit Mode on Credit Card
**Epic**: 1 (Credit Mode Foundation)
**Risk**: R9 (Mode toggle mid-month)
**Time**: 2 minutes

#### Steps:
1. Send: `mudar para modo crédito`
   - **Alternative**: `switch to credit mode` (English)

2. **Expected**: Bot asks which card (if multiple) OR confirms directly

3. If asked for card selection, respond with card name (e.g., `Nubank`)

4. **Expected Response**:
   ```
   ✅ Cartão [Name] agora está em Modo Crédito!

   Agora você pode:
   • Fazer parcelamentos
   • Acompanhar gastos por fatura
   • Receber lembretes de fechamento
   ```

#### Verification:
- [ ] Confirmation message received
- [ ] Web app shows `credit_mode = true` (check in settings)
- [ ] No errors or crashes

#### Pass/Fail: PASS

---

### Test 2: Create Installment Purchase
**Epic**: 2 (Installment Management)
**Risk**: R1 (Incorrect calculation)
**Time**: 3 minutes

#### Steps:
1. Send: `celular 1200 em 12x no [CardName]`
   - Replace `[CardName]` with your credit card name
   - **Alternative**: `phone 1200 in 12 installments on [CardName]` (English)

2. **Expected**: Bot confirms with calculation:
   ```
   📱 Parcelamento

   Descrição: celular
   Valor total: R$ 1.200,00
   Parcelas: 12x de R$ 100,00
   Cartão: [CardName]

   Primeira parcela na fatura atual (6 Dez - 5 Jan)

   Confirmar? (sim/não)
   ```

3. Send: `sim`

4. **Expected Response**:
   ```
   ✅ Parcelamento criado!

   12x de R$ 100,00
   Primeira parcela: [Current statement period]

   Use /compromissos para ver todos os parcelamentos
   ```

#### Verification:
- [x] Confirmation received
- [x] Monthly payment = Total / Installments (1200 / 12 = 100)
- [x] Web app shows installment plan with 12 payments
- [x] First payment date in current statement period

#### Pass/Fail: PASS

---

### Test 3: View Future Commitments
**Epic**: 2 (Installment Management)
**Risk**: R1 (Calculation in summary)
**Time**: 1 minute

#### Steps:
1. Send: `compromissos futuros`
   - **Alternative**: `future commitments` (English)

2. **Expected Response**:
   ```
   💳 Compromissos Futuros - [CardName]

   Total restante: R$ 1.200 (12 parcelas)

   Parcelamentos ativos:
   • Celular: 1/12 - R$ 100/mês

   Próximos meses:
   Jan/2025: R$ 100
   Fev/2025: R$ 100
   Mar/2025: R$ 100
   ```

#### Verification:
- [x] Shows correct installment plan
- [x] Monthly amount correct (R$ 100)
- [x] Next 3 months projection displayed
- [x] Remaining balance correct (R$ 1,200 for new plan)

#### Pass/Fail: PASS

---

### Test 4: Statement Summary with Installments
**Epic**: 3 (Statement-Aware Budgets)
**Risk**: R5 (Budget excludes installments), R8 (AI intent detection)
**Time**: 2 minutes

#### Steps:
1. Send: `resumo da fatura`
   - **Alternative**: Try natural language: `quero ver o resumo` or `statement summary`

2. **Expected**: Bot detects intent and shows summary:
   ```
   📊 Resumo da Fatura - [CardName]

   Período: [Period Start] - [Period End]
   Total: R$ [Amount]

   Categorias:
   📱 Assinaturas: R$ 100 (XX%)
     • Celular parcelado 1/12: R$ 100

   [Other categories if exist]

   Total de transações: X
   ```

#### Verification:
- [ ] AI detected intent from natural language
- [ ] Statement period displayed correctly
- [ ] **Installment payment included** in total
- [ ] Installment shows context: "Celular parcelado 1/12"
- [ ] Category breakdown accurate

#### Pass/Fail: PASS

---

### Test 5: Set Payment Due Date
**Epic**: 4 (Payment Reminders)
**Risk**: R3 (Auto-payment wrong date)
**Time**: 2 minutes

**Prerequisite**: Statement closing day must be set first

#### Steps:
1. **First, set statement closing day** (if not set):
   - Go to web app → Credit Card Settings
   - Set closing day (e.g., day 5)

2. **Then set payment due date**:
   - Web app → Credit Card Settings → Payment Due Date
   - Enter days after closing (e.g., 10 days)
   - **Expected Preview**: "Your payment will be due on the 15th of each month"
   - Click Save

3. **Verify**:
   - Toast confirmation: "Vencimento configurado: 10 dias após fechamento"

#### Verification:
- [ ] Settings saved successfully
- [ ] Preview calculation correct (closing day + due days)
- [ ] No errors

#### Pass/Fail: ___________

---

## 🟡 P1 Tests (High Priority - Should Pass)

### Test 6: AI Intent Detection Variations
**Epic**: 3 (Statement Budgets)
**Risk**: R8 (AI misses natural language)
**Time**: 3 minutes

#### Steps - Try Different Phrasings:

1. **Statement Summary**:
   - Send: `quero ver o resumo da minha fatura`
   - **Expected**: Statement summary displayed ✅

2. **Future Commitments**:
   - Send: `quais são meus compromissos futuros?`
   - **Expected**: Commitment list displayed ✅

3. **Create Installment**:
   - Send: `parcelar notebook 2400 em 24x`
   - **Expected**: Confirmation dialog ✅

#### Verification:
- [x] All 3 intents detected correctly
- [x] No fallback to "Não entendi" messages
- [x] Responses contextually correct

#### Pass/Fail: PASS

---

### Test 7: Multi-Step Conversation Flow
**Epic**: 1, 2 (Foundation + Installments)
**Risk**: R9 (State persistence)
**Time**: 2 minutes

#### Steps:
1. Send: `quero ver compromissos`

2. **Expected**: Bot asks for card selection:
   ```
   Qual cartão você quer consultar?

   1. Nubank
   2. Inter

   Responda com o número ou nome do cartão.
   ```

3. Send: `1` OR card name

4. **Expected**: Shows commitments for selected card

#### Verification:
- [ ] Conversation state preserved across messages
- [ ] Card selection works correctly
- [ ] Correct card data displayed
- [ ] State timeout works (wait 5+ minutes, try again → should restart)

#### Pass/Fail: FAIL - probably will keep it this way, all future installments together is better than separate

---

### Test 8: Installment Payoff Calculation
**Epic**: 2 (Installment Management)
**Risk**: R10 (Payoff refund wrong)
**Time**: 3 minutes

**Prerequisite**: Existing installment plan (from Test 2)

#### Steps:
1. Send: `quitar parcelamento celular`
   - **Alternative**: `pay off celular` (English)

2. **Expected Confirmation**:
   ```
   💰 Quitar Parcelamento

   Descrição: Celular
   Parcelas pagas: 1/12
   Parcelas restantes: 11
   Valor restante: R$ 1.100,00

   Deseja quitar? (sim/não)
   ```

3. **Verify Calculation**:
   - Remaining = (12 - 1) × 100 = R$ 1,100 ✅

4. Send: `sim`

5. **Expected Response**:
   ```
   ✅ Parcelamento quitado!

   R$ 1.100,00 serão debitados na próxima fatura.
   ```

#### Verification:
- [ ] Remaining calculation correct
- [ ] Confirmation message clear
- [ ] Web app shows plan as `paid_off`
- [ ] Pending installment payments deleted

#### Pass/Fail: PASS

---

## 🟢 P2 Tests (Medium Priority - Nice to Have)

### Test 9: Localization (if bilingual user)
**Epic**: Cross-cutting
**Risk**: R13 (Wrong language)
**Time**: 2 minutes

**Skip if user locale is fixed**

#### Steps:
1. Change user locale in web app (Settings → Language)

2. Send WhatsApp message: `resumo da fatura`

3. **Expected**: Response in selected language
   - pt-BR: "Resumo da Fatura"
   - English: "Statement Summary"

#### Verification:
- [ ] Messages in correct language
- [ ] Date formatting localized
- [ ] Currency formatting localized (R$ vs $)

#### Pass/Fail: ___________

---

### Test 10: Error Handling - Invalid Input
**Epic**: Cross-cutting
**Risk**: General robustness
**Time**: 3 minutes

#### Steps:

1. **Invalid installment count**:
   - Send: `celular 1200 em 100x`
   - **Expected**: Error: "Máximo 60 parcelas"

2. **Credit Mode not enabled**:
   - Switch card back to Simple Mode (web app)
   - Send: `celular 500 em 6x`
   - **Expected**: Error: "Parcelamento disponível apenas em Modo Crédito"

3. **Empty statement period**:
   - Send: `resumo da fatura` (on new card with no transactions)
   - **Expected**: "Você ainda não tem gastos neste período"

#### Verification:
- [ ] All error messages clear and helpful
- [ ] No crashes or unexpected behavior
- [ ] Error messages localized

#### Pass/Fail: ___________

---

## 🔵 P3 Tests (Optional - Time Permitting)

### Test 11: Awareness-First Language Validation
**Epic**: 3, 4 (Statement Budgets, Payment Reminders)
**Risk**: User experience tone
**Time**: 2 minutes

**Manual Review**: Read all bot messages for tone

#### Check for:
- [ ] ❌ NO red color language: "OVERSPENT!", "WARNING!", "LATE!"
- [ ] ✅ Neutral phrasing: "acima do planejado", "lembrete", "heads up"
- [ ] ✅ Non-judgmental: "Sobraram R$ X" NOT "You have R$ X left"
- [ ] ✅ Positive framing: "No caminho certo" for on-track budgets

#### Pass/Fail: ___________

---

## Scheduled Jobs (Manual Verification)

### Test 12: Statement Reminder (3 Days Before Closing)
**Epic**: 3 (Statement Budgets)
**Risk**: R4, R7 (Delivery failure, job monitoring)
**Time**: Dependent on statement closing date

**Only run if closing date is 3 days away**

#### Steps:
1. Set `statement_closing_day` to 3 days from today (web app)
   - Example: Today = Dec 9 → Set closing day = 12

2. **Next day at 9 AM Brazil time**:
   - Check WhatsApp for reminder message

3. **Expected Message**:
   ```
   📊 Lembrete: Fatura fecha em 3 dias

   Cartão [Name]
   Vence em: 12 de Dezembro

   Total atual: R$ [Amount]
   Orçamento: R$ [Budget] (XX% restante)

   Período: [Start] - [End]
   ```

#### Verification:
- [ ] Message received at 9 AM Brazil time
- [ ] Total includes regular expenses + installments
- [ ] Budget percentage correct
- [ ] Statement period dates correct

#### Pass/Fail: ___________

---

### Test 13: Payment Due Reminder (2 Days Before)
**Epic**: 4 (Payment Reminders)
**Risk**: R4, R7 (Delivery failure)
**Time**: Dependent on payment due date

**Only run if payment due date is 2 days away**

#### Setup:
1. Set `statement_closing_day` and `payment_due_day` so due date = TODAY + 2
   - Example: Today = Dec 9 → closing = 5, due_day = 6 → due date = Dec 11

2. **Next day at 9 AM Brazil time**:
   - Check WhatsApp for payment reminder

3. **Expected Message**:
   ```
   💳 Lembrete: Pagamento do cartão

   Vence em 2 dias (11 de Dezembro)
   💰 Valor: R$ [Statement Total]

   Cartão [Name]
   Período: [Start] - [End]

   Não esqueça de realizar o pagamento! 😊
   ```

#### Verification:
- [ ] Message received at 9 AM Brazil time
- [ ] Amount matches statement total
- [ ] Due date correct
- [ ] Tone is friendly, not urgent/alarming

#### Pass/Fail: ___________

---

### Test 14: Auto-Payment Transaction Creation
**Epic**: 4 (Auto-Accounting)
**Risk**: R3, R15 (Wrong amount, duplicates)
**Time**: Dependent on statement closing

**Only run if statement closes today or tomorrow**

#### Setup:
1. Set `statement_closing_day` to tomorrow's day
2. Set `payment_due_day` (e.g., 10 days after)

3. **Day after closing**:
   - Check web app transactions

4. **Expected Transaction**:
   - **Description**: "Pagamento Cartão [Name] - Fatura [MonthYear]"
   - **Date**: Due date (closing + due_day)
   - **Amount**: Statement total (expenses + installments)
   - **Category**: "Pagamento Cartão de Crédito" (system category)
   - **Badge**: "Auto-gerado"

#### Verification:
- [ ] Transaction created automatically
- [ ] Amount = statement total (100% accurate)
- [ ] Date = payment due date (NOT closing date)
- [ ] Category is system category (cannot be deleted)
- [ ] Badge shows "Auto-gerado"
- [ ] Only ONE transaction created (no duplicates)

#### Pass/Fail: ___________

---

## Test Summary

### Results

| Test ID | Test Name | Priority | Result | Notes |
|---------|-----------|----------|--------|-------|
| Test 1 | Enable Credit Mode | P0 | ☐ Pass ☐ Fail | |
| Test 2 | Create Installment | P0 | ☐ Pass ☐ Fail | |
| Test 3 | Future Commitments | P0 | ☐ Pass ☐ Fail | |
| Test 4 | Statement Summary | P0 | ☐ Pass ☐ Fail | |
| Test 5 | Set Payment Due Date | P0 | ☐ Pass ☐ Fail | |
| Test 6 | AI Intent Variations | P1 | ☐ Pass ☐ Fail | |
| Test 7 | Conversation Flow | P1 | ☐ Pass ☐ Fail | |
| Test 8 | Installment Payoff | P1 | ☐ Pass ☐ Fail | |
| Test 9 | Localization | P2 | ☐ Pass ☐ Fail | |
| Test 10 | Error Handling | P2 | ☐ Pass ☐ Fail | |
| Test 11 | Awareness Language | P3 | ☐ Pass ☐ Fail | |
| Test 12 | Statement Reminder | P0 | ☐ Pass ☐ Fail ☐ N/A | |
| Test 13 | Payment Reminder | P0 | ☐ Pass ☐ Fail ☐ N/A | |
| Test 14 | Auto-Payment Creation | P0 | ☐ Pass ☐ Fail ☐ N/A | |

### Quality Gate Decision

**P0 Pass Rate**: _____ / _____ (Target: 100%)
**P1 Pass Rate**: _____ / _____ (Target: ≥80%)

**Decision**:
- [ ] ✅ **PASS** - All P0 tests pass, ready for production
- [ ] ⚠️ **CONCERNS** - Some P1 failures, review before release
- [ ] ❌ **FAIL** - P0 failures, do not deploy

---

## Critical Bugs Found

| Test ID | Bug Description | Severity | Action Required |
|---------|----------------|----------|-----------------|
| | | | |
| | | | |

---

## Notes and Observations

**Date**: _________________
**Tester**: _________________
**Environment**: _________________

---

**Next Steps After Testing**:
1. If PASS → Proceed with deployment
2. If CONCERNS → Fix P1 issues, re-test affected areas
3. If FAIL → Fix P0 blockers immediately, full regression test

---

*Generated by Murat (Master Test Architect) | Manual E2E Validation Checklist*
