# Story 3.3: Manual Testing Checklist
## Budget Progress Dashboard Statement Period

**Story Status:** Ready for Review
**Date:** 2025-12-03
**Tester:** [Your Name]

---

## Prerequisites

Before testing, ensure:
- [x] Migration 045 has been deployed (`calculate_statement_budget_spent` function)
- [x] Migration 044 is deployed (`calculate_statement_period` function)
- [x] Story 3.1 is complete (statement closing date)
- [x] Story 3.2 is complete (monthly budget)
- [ ] Test user has at least one Credit Mode credit card
- [ ] Test data includes transactions and installments

---

## Test Environment Setup

### 1. Create Test Credit Cards

Create the following test credit cards in settings:

**Card 1: "Nubank Roxinho"**
- Credit Mode: ✅ Enabled
- Statement Closing Day: 5
- Monthly Budget: R$ 2.000,00
- Purpose: Full feature testing

**Card 2: "Itaú Platinum"**
- Credit Mode: ✅ Enabled
- Statement Closing Day: 15
- Monthly Budget: NOT SET (null)
- Purpose: Test empty state for no budget

**Card 3: "Visa Corporate"**
- Credit Mode: ✅ Enabled
- Statement Closing Day: NOT SET (null)
- Monthly Budget: R$ 5.000,00
- Purpose: Test empty state for no closing date

**Card 4: "Simple Card"**
- Credit Mode: ❌ Disabled (Simple Mode)
- Purpose: Verify no statement widgets appear

### 2. Create Test Transactions

For **Nubank Roxinho** (closing day 5), create:

**Regular Expenses:**
- Transaction 1: R$ 500 - "Supermercado" - Date: Dec 10, 2024
- Transaction 2: R$ 300 - "Restaurante" - Date: Dec 15, 2024
- Transaction 3: R$ 100 - "Uber" - Date: Dec 20, 2024
- **Total Regular: R$ 900**

**Installment Purchases:**
- Installment 1: "TV Samsung" - R$ 1.200 total (6x R$ 200) - Start: Dec 1, 2024
- Installment 2: "iPhone 15" - R$ 3.600 total (12x R$ 300) - Start: Nov 15, 2024
- **Total Installments (Dec): R$ 500 (R$ 200 + R$ 300)**

**Expected Total for Current Period (Dec 6 - Jan 5): R$ 1.400**

---

## AC3.1: Budget Progress Widget Display

### Test Case 1: Credit Mode User with Budget Set

**Test:** Navigate to dashboard as user with Nubank Roxinho (Credit Mode + Budget)

**Expected Results:**
- [ ] Budget Progress Widget visible
- [ ] Payment method name displayed: "Nubank Roxinho"
- [ ] Current statement period dates visible: "6 Dez - 5 Jan" (or "Dec 6 - Jan 5")
- [ ] Spent amount displayed: "R$ 1.400,00"
- [ ] Budget amount displayed: "R$ 2.000,00"
- [ ] Remaining amount: "Sobraram R$ 600,00" (or "R$ 600 remaining")
- [ ] Percentage used: "70%"
- [ ] Progress bar visible and filled to 70%
- [ ] Days until closing: "X dias até fechamento" (calculated from today)

**Screenshot:** [Attach screenshot of working widget]

**Status:** ☐ Pass ☐ Fail
**Notes:**

---

### Test Case 2: Credit Mode User with NO Budget Set

**Test:** View dashboard with Itaú Platinum (Credit Mode, closing day set, NO budget)

**Expected Results:**
- [ ] Spending Summary Widget visible (alternative widget)
- [ ] Payment method name: "Itaú Platinum"
- [ ] Current statement period dates visible
- [ ] Total spent displayed: "R$ XXX"
- [ ] Message: "Sem orçamento definido" (or "No budget set")
- [ ] CTA button: "Definir orçamento" (or "Set budget")
- [ ] Button links to settings page

**Screenshot:** [Attach screenshot]

**Status:** ☐ Pass ☐ Fail
**Notes:**

---

### Test Case 3: Credit Mode User with NO Closing Date Set

**Test:** View dashboard with Visa Corporate (Credit Mode, budget set, NO closing day)

**Expected Results:**
- [ ] Setup Prompt Widget visible
- [ ] Payment method name: "Visa Corporate"
- [ ] Message: "Configure o dia de fechamento para acompanhar orçamento"
- [ ] CTA button: "Configurar" (or "Configure")
- [ ] Button links to settings page

**Screenshot:** [Attach screenshot]

**Status:** ☐ Pass ☐ Fail
**Notes:**

---

### Test Case 4: Simple Mode User

**Test:** View dashboard with Simple Card (credit_mode = false)

**Expected Results:**
- [ ] NO statement budget widgets displayed for Simple Card
- [ ] Existing calendar month tracking unchanged
- [ ] Dashboard loads normally
- [ ] No errors in console

**Screenshot:** [Attach screenshot]

**Status:** ☐ Pass ☐ Fail
**Notes:**

---

### Test Case 5: Multiple Credit Cards

**Test:** User with 3 Credit Mode cards with budgets set

**Expected Results:**
- [ ] Shows 3 separate Budget Progress Widgets
- [ ] Each widget tracks its own statement period
- [ ] Widgets displayed in order of next closing date (soonest first)
- [ ] All widgets load within 1 second (NFR requirement)

**Screenshot:** [Attach screenshot]

**Status:** ☐ Pass ☐ Fail
**Notes:**

---

## AC3.2: Budget Progress Calculation Accuracy

### Test Case 6: Verify Calculation Includes Transactions

**Test:** Check budget calculation for Nubank Roxinho

**Expected Results:**
- [ ] Regular expenses included: R$ 900
- [ ] Installment payments included: R$ 500
- [ ] Total spent: R$ 1.400
- [ ] Remaining: R$ 600 (budget R$ 2.000 - spent R$ 1.400)
- [ ] Percentage: 70%

**Status:** ☐ Pass ☐ Fail
**Notes:**

---

### Test Case 7: Verify Income Transactions Excluded

**Test:** Add income transaction to Nubank Roxinho, verify NOT counted in budget

**Steps:**
1. Note current spent amount: R$ 1.400
2. Add income transaction: R$ 500 - "Salary"
3. Refresh dashboard

**Expected Results:**
- [ ] Spent amount UNCHANGED: R$ 1.400
- [ ] Income NOT included in budget calculation

**Status:** ☐ Pass ☐ Fail
**Notes:**

---

### Test Case 8: Verify Transactions Outside Period Excluded

**Test:** Add expense outside current period, verify NOT counted

**Steps:**
1. Note current period: Dec 6 - Jan 5
2. Add expense dated Dec 4 (before period start): R$ 200
3. Refresh dashboard

**Expected Results:**
- [ ] Spent amount UNCHANGED: R$ 1.400
- [ ] Transaction dated Dec 4 NOT included

**Status:** ☐ Pass ☐ Fail
**Notes:**

---

## AC3.3: Real-Time Budget Updates

### Test Case 9: Add Expense → Budget Updates

**Test:** Add new expense and verify widget updates immediately

**Steps:**
1. Note current spent: R$ 1.400, remaining: R$ 600
2. Add new expense: R$ 100 - "Gas"
3. Observe widget (do NOT refresh page)

**Expected Results:**
- [ ] Widget updates automatically (within 300ms)
- [ ] New spent amount: R$ 1.500
- [ ] New remaining: R$ 500
- [ ] New percentage: 75%
- [ ] Progress bar animates smoothly to 75%
- [ ] Update completes in < 300ms (time it)

**Status:** ☐ Pass ☐ Fail
**Notes:**

---

### Test Case 10: Edit Expense → Budget Updates

**Test:** Edit existing expense, verify update

**Steps:**
1. Edit expense from R$ 100 to R$ 200
2. Observe widget

**Expected Results:**
- [ ] Widget updates automatically
- [ ] Spent increases by R$ 100
- [ ] No page refresh needed

**Status:** ☐ Pass ☐ Fail
**Notes:**

---

### Test Case 11: Delete Expense → Budget Updates

**Test:** Delete expense, verify update

**Steps:**
1. Delete R$ 100 expense
2. Observe widget

**Expected Results:**
- [ ] Widget updates automatically
- [ ] Spent decreases by R$ 100
- [ ] No page refresh needed

**Status:** ☐ Pass ☐ Fail
**Notes:**

---

## AC3.4: Budget Status Determination and Progress Bar

### Test Case 12: On-Track Status (0-79%)

**Test:** Verify on-track status at 70% usage

**Current State:** Nubank Roxinho at R$ 1.400 / R$ 2.000 (70%)

**Expected Results:**
- [ ] Status: "No caminho certo" (or "On track")
- [ ] Progress bar color: Blue (neutral positive)
- [ ] Message: "Sobraram R$ 600" (or "R$ 600 remaining")
- [ ] NO red colors

**Screenshot:** [Attach screenshot]

**Status:** ☐ Pass ☐ Fail
**Notes:**

---

### Test Case 13: Near-Limit Status (80-99%)

**Test:** Add expenses to reach 85% usage

**Steps:**
1. Add expenses totaling R$ 300
2. New total: R$ 1.700 / R$ 2.000 (85%)

**Expected Results:**
- [ ] Status: "Próximo do limite" (or "Near limit")
- [ ] Progress bar color: Yellow/Amber (caution, not alarm)
- [ ] Message: "Restam R$ 300" (or "R$ 300 remaining")
- [ ] NO red colors

**Screenshot:** [Attach screenshot]

**Status:** ☐ Pass ☐ Fail
**Notes:**

---

### Test Case 14: Exceeded Status (>100%)

**Test:** Add expenses to exceed budget

**Steps:**
1. Add expenses totaling R$ 500
2. New total: R$ 2.400 / R$ 2.000 (120%)

**Expected Results:**
- [ ] Status: "Acima do orçamento" (or "Over budget")
- [ ] Progress bar color: Gray/Neutral (NOT red - awareness-first)
- [ ] Progress bar filled to 100% (capped visually)
- [ ] Message: "R$ 400 acima do planejado" (or "R$ 400 over budget")
- [ ] NO red colors, NO "OVERSPENT!" language
- [ ] Neutral, informational tone

**Screenshot:** [Attach screenshot]

**Status:** ☐ Pass ☐ Fail
**Notes:**

---

## AC3.5: Awareness-First Language and Design

### Test Case 15: Audit All Budget Messages

**Test:** Review all budget widget messages for awareness-first language

**Checklist:**
- [ ] NO red colors anywhere (only blue, yellow, amber, gray)
- [ ] NO judgmental language ("OVERSPENT!", "WARNING!", "BAD!")
- [ ] Positive framing: "Sobraram" not "You have left"
- [ ] Informational tone: "acima do planejado" not "EXCEEDED!"
- [ ] No pressure: "No caminho certo" not "Good job! Keep it up!"
- [ ] Neutral icons (not warning symbols)

**Status:** ☐ Pass ☐ Fail
**Notes:**

---

## AC3.6: Days Until Statement Closing

### Test Case 16: Days Until Closing Calculation

**Test:** Verify days until closing is accurate

**Steps:**
1. Note today's date: _______________
2. Note closing day for Nubank Roxinho: 5
3. Calculate expected days until closing: _______________
4. Check widget display

**Expected Results:**
- [ ] Days until closing matches calculation
- [ ] Display format: "X dias até fechamento" (or "X days until closing")
- [ ] No alarm colors (neutral design)

**Status:** ☐ Pass ☐ Fail
**Notes:**

---

### Test Case 17: Closing Day Special Cases

**Test:** Test special day messages

**Scenarios to test:**
- [ ] Closes today: "Fecha hoje" (or "Closes today")
- [ ] Closes tomorrow: "Fecha amanhã" (or "Closes tomorrow")
- [ ] 7+ days: "7 dias até fechamento"

**Status:** ☐ Pass ☐ Fail
**Notes:**

---

## AC3.7: Performance Optimization

### Test Case 18: Budget Calculation Performance

**Test:** Verify budget calculation completes in < 200ms (NFR5 - CRITICAL)

**Steps:**
1. Open browser DevTools → Network tab
2. Clear cache
3. Refresh dashboard
4. Check timing for budget calculation request

**Expected Results:**
- [ ] Budget calculation completes in < 200ms
- [ ] No slow query warnings in console
- [ ] NFR5 met (critical requirement)

**Measured Time:** _________ ms

**Status:** ☐ Pass ☐ Fail
**Notes:**

---

### Test Case 19: Dashboard Load Performance

**Test:** Verify dashboard with 5 widgets loads in < 1 second

**Steps:**
1. Create 5 Credit Mode cards with budgets
2. Open browser DevTools → Network tab
3. Measure total dashboard load time

**Expected Results:**
- [ ] Dashboard fully loads in < 1 second
- [ ] All 5 widgets visible
- [ ] No performance degradation

**Measured Time:** _________ seconds

**Status:** ☐ Pass ☐ Fail
**Notes:**

---

## AC3.8: Empty States and Edge Cases

### Test Case 20: No Transactions in Period

**Test:** Card with budget but no transactions

**Steps:**
1. Create new Credit Mode card with budget: R$ 2.000
2. No transactions added yet

**Expected Results:**
- [ ] Widget displays: "R$ 0 / R$ 2.000"
- [ ] Message: "Sobraram R$ 2.000"
- [ ] Percentage: "0%"
- [ ] Progress bar empty (blue)

**Status:** ☐ Pass ☐ Fail
**Notes:**

---

### Test Case 21: Budget = 0 Edge Case

**Test:** Card with budget set to R$ 0

**Steps:**
1. Set monthly budget to R$ 0
2. View dashboard

**Expected Results:**
- [ ] Widget displays: "R$ XXX / R$ 0"
- [ ] Message: "Sem limite definido"
- [ ] No progress bar (infinite percentage)
- [ ] No errors

**Status:** ☐ Pass ☐ Fail
**Notes:**

---

## AC3.9: Simple Mode Compatibility

### Test Case 22: Simple Mode Regression Test

**Test:** Verify Simple Mode users unaffected

**Steps:**
1. Log in as user with only Simple Mode cards
2. Navigate to dashboard

**Expected Results:**
- [ ] NO statement budget widgets visible
- [ ] Existing calendar month tracking works
- [ ] Dashboard loads normally
- [ ] No performance degradation
- [ ] Zero errors in console

**Status:** ☐ Pass ☐ Fail
**Notes:**

---

## Localization Testing

### Test Case 23: Portuguese (pt-BR) Localization

**Test:** All messages in Portuguese

**Checklist:**
- [ ] Budget widget in Portuguese
- [ ] Dates formatted: "6 Dez - 5 Jan"
- [ ] Currency: "R$ 2.000,00" (comma for decimals)
- [ ] Messages: "Sobraram", "acima do planejado", "dias até fechamento"

**Status:** ☐ Pass ☐ Fail
**Notes:**

---

### Test Case 24: English (en) Localization

**Test:** Switch locale to English

**Steps:**
1. Change app locale to English
2. View dashboard

**Expected Results:**
- [ ] Budget widget in English
- [ ] Dates formatted: "Dec 6 - Jan 5"
- [ ] Currency: "R$ 2,000.00" (period for decimals)
- [ ] Messages: "remaining", "over budget", "days until closing"

**Status:** ☐ Pass ☐ Fail
**Notes:**

---

## Accessibility Testing

### Test Case 25: Screen Reader Support

**Test:** Budget widget accessible to screen readers

**Steps:**
1. Enable screen reader (VoiceOver on Mac, NVDA on Windows)
2. Navigate to budget widget

**Expected Results:**
- [ ] Progress bar has ARIA labels
- [ ] Status announced correctly
- [ ] All text readable by screen reader
- [ ] Semantic HTML used

**Status:** ☐ Pass ☐ Fail
**Notes:**

---

### Test Case 26: Keyboard Navigation

**Test:** Widget accessible via keyboard

**Expected Results:**
- [ ] Can tab to CTA buttons
- [ ] Focus indicators visible
- [ ] No keyboard traps

**Status:** ☐ Pass ☐ Fail
**Notes:**

---

### Test Case 27: Color Contrast (WCAG AA)

**Test:** Verify color contrast meets WCAG AA standards

**Expected Results:**
- [ ] Text on backgrounds meets 4.5:1 ratio
- [ ] Progress bar colors distinguishable
- [ ] Status not conveyed by color alone

**Status:** ☐ Pass ☐ Fail
**Notes:**

---

## Mobile Responsive Testing

### Test Case 28: Mobile View (320px width)

**Test:** Budget widgets on small screens

**Expected Results:**
- [ ] Widgets stack vertically
- [ ] All content visible (no overflow)
- [ ] Text readable
- [ ] Buttons tappable

**Status:** ☐ Pass ☐ Fail
**Notes:**

---

### Test Case 29: Tablet View (768px width)

**Test:** Budget widgets on tablet

**Expected Results:**
- [ ] 2 widgets per row
- [ ] Layout looks good
- [ ] Responsive design works

**Status:** ☐ Pass ☐ Fail
**Notes:**

---

### Test Case 30: Desktop View (1280px+ width)

**Test:** Budget widgets on desktop

**Expected Results:**
- [ ] 3 widgets per row (or full width for single)
- [ ] Proper spacing
- [ ] No layout issues

**Status:** ☐ Pass ☐ Fail
**Notes:**

---

## Analytics Tracking

### Test Case 31: PostHog Event Tracking

**Test:** Verify budget_progress_viewed events tracked

**Steps:**
1. Open PostHog dashboard
2. Navigate to dashboard as test user
3. Check events

**Expected Results:**
- [ ] `budget_progress_viewed` event fired
- [ ] Event properties include:
  - userId
  - paymentMethodId
  - percentageUsed
  - status
  - daysUntilClosing
  - executionTime (ms)

**Status:** ☐ Pass ☐ Fail
**Notes:**

---

## Error Handling

### Test Case 32: Database Function Error

**Test:** Simulate database error

**Steps:**
1. Temporarily break database connection
2. Load dashboard

**Expected Results:**
- [ ] Error widget shown (not crash)
- [ ] Message: "Erro ao carregar orçamento. Tente novamente."
- [ ] Retry button visible
- [ ] Other widgets still work

**Status:** ☐ Pass ☐ Fail
**Notes:**

---

## Browser Compatibility

### Test Case 33: Chrome/Edge

**Browser Version:** _____________

**Status:** ☐ Pass ☐ Fail
**Notes:**

---

### Test Case 34: Firefox

**Browser Version:** _____________

**Status:** ☐ Pass ☐ Fail
**Notes:**

---

### Test Case 35: Safari

**Browser Version:** _____________

**Status:** ☐ Pass ☐ Fail
**Notes:**

---

## Final Checklist

- [ ] All test cases executed
- [ ] All critical tests passed
- [ ] Performance requirements met (< 200ms, NFR5)
- [ ] Awareness-first design verified (no red, no judgment)
- [ ] Localization works (pt-BR and en)
- [ ] Accessibility tests passed
- [ ] Mobile responsive design works
- [ ] No console errors
- [ ] PostHog events tracking
- [ ] Migration 045 deployed successfully

---

## Test Summary

**Total Test Cases:** 35
**Passed:** ______
**Failed:** ______
**Blocked:** ______

**Critical Issues Found:**
1.
2.
3.

**Non-Critical Issues:**
1.
2.
3.

**Ready for Production:** ☐ Yes ☐ No

**Tester Signature:** _________________
**Date:** _________________

---

## Notes for Code Reviewer

- Migration 045 is ready but NOT YET deployed (deployment instructions in `docs/MIGRATION_045_DEPLOYMENT.md`)
- Test runner (Jest) is now configured - run with `npm test`
- All implementation complete, awaiting database migration deployment for full E2E testing
- Performance target NFR5 (< 200ms) is CRITICAL - must be validated in production
- Awareness-first design (no red colors, neutral language) must be verified
