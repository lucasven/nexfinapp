# Credit Mode Selection Dialog

## Overview

This directory contains the Credit Mode Selection Dialog component implemented as part of Story 1-4 (Credit Mode Selection - Web Frontend).

## Component

**`credit-mode-selection-dialog.tsx`**
- Modal dialog for selecting between Credit Mode and Simple Mode
- Displays two option cards side-by-side (desktop) or stacked (mobile)
- Expandable comparison table
- Full accessibility support (WCAG 2.1 AA)
- Localized in pt-BR and English
- PostHog analytics tracking

## Integration Status

### Current Status (Story 1-4 Completion)

✅ **Completed:**
- CreditModeSelectionDialog component created
- setCreditMode server action implemented
- Portuguese and English localizations added
- Analytics events defined
- Credit mode detection utility (frontend) available

⚠️ **Pending Integration:**
The dialog is ready but not yet integrated into the transaction form because:
1. Current transaction form uses `payment_method` as a TEXT field (e.g., "credit_card")
2. Integration requires `payment_method_id` UUID field referencing the `payment_methods` table
3. Database migration (040_credit_card_management.sql) has created the required schema
4. Transaction form needs refactoring to use payment method IDs

### Integration Points

**File:** `fe/components/transaction-dialog.tsx`
**Lines:** 30-33, 75-82

TODO comments have been added showing where integration will occur when payment_method is refactored to payment_method_id.

## Usage (When Integrated)

```tsx
import { CreditModeSelectionDialog } from '@/components/transactions/credit-mode-selection-dialog'
import { needsCreditModeSelection } from '@/lib/utils/credit-mode-detection'

function TransactionForm() {
  const [showModeDialog, setShowModeDialog] = useState(false)
  const [pendingTransaction, setPendingTransaction] = useState(null)

  async function handleSubmit(formData) {
    // Check if credit mode selection is needed
    if (formData.payment_method_id) {
      const needsMode = await needsCreditModeSelection(formData.payment_method_id)

      if (needsMode) {
        // Store form data and show mode selection dialog
        setPendingTransaction(formData)
        setShowModeDialog(true)
        return
      }
    }

    // Normal transaction creation
    await createTransaction(formData)
  }

  function handleModeSelected(creditMode: boolean) {
    // Mode has been set, now create the transaction
    if (pendingTransaction) {
      await createTransaction(pendingTransaction)
      setPendingTransaction(null)
    }
  }

  return (
    <>
      <form onSubmit={handleSubmit}>
        {/* Form fields */}
      </form>

      <CreditModeSelectionDialog
        open={showModeDialog}
        onOpenChange={setShowModeDialog}
        paymentMethodId={pendingTransaction?.payment_method_id}
        onModeSelected={handleModeSelected}
      />
    </>
  )
}
```

## Testing

### Manual Testing Checklist

**AC4.1 - Modal Trigger**
- [ ] Modal opens when `needsCreditModeSelection()` returns true
- [ ] Transaction form data is preserved
- [ ] Modal is blocking (no interaction with underlying page)
- [ ] Focus is trapped within modal

**AC4.2 - Layout**
- [ ] Desktop (≥768px): Cards side-by-side
- [ ] Tablet (640-768px): Cards side-by-side with reduced padding
- [ ] Mobile (<640px): Cards stacked vertically
- [ ] Comparison section collapsed by default

**AC4.6 - Credit Mode Selection**
- [ ] Clicking "Choose Credit Mode" calls setCreditMode(id, true)
- [ ] Database updated: credit_mode = TRUE
- [ ] Success toast displayed (localized)
- [ ] PostHog event tracked with mode='credit'
- [ ] Transaction created with original form data

**AC4.7 - Simple Mode Selection**
- [ ] Clicking "Choose Simple Mode" calls setCreditMode(id, false)
- [ ] Database updated: credit_mode = FALSE
- [ ] Success toast displayed (localized)
- [ ] PostHog event tracked with mode='simple'
- [ ] Transaction created with original form data

**AC4.8 - Modal Dismissal**
- [ ] ESC key closes modal
- [ ] Backdrop click closes modal
- [ ] Transaction NOT saved
- [ ] Form data preserved for retry

**AC4.9 - Portuguese Localization**
- [ ] All text in Brazilian Portuguese
- [ ] Natural, conversational tone
- [ ] Follows awareness-first principles

**AC4.10 - English Localization**
- [ ] All text in English
- [ ] Clear and concise
- [ ] Follows awareness-first principles

**AC4.12 - Accessibility**
- [ ] Modal announced by screen reader
- [ ] Tab cycles through interactive elements
- [ ] ESC closes modal
- [ ] Focus returns to trigger on close
- [ ] Color contrast ≥4.5:1
- [ ] Visible focus indicators
- [ ] Expandable section has proper ARIA

### Browser Testing

- [ ] Chrome (desktop)
- [ ] Firefox (desktop)
- [ ] Safari (desktop)
- [ ] iOS Safari (mobile)
- [ ] Chrome Android (mobile)

### Automated Tests (TODO)

Note: Frontend currently has no test infrastructure (Jest/Vitest).

When test framework is added, implement:

**Unit Tests** (`credit-mode-selection-dialog.test.tsx`):
- Renders with Credit and Simple mode options
- Calls setCreditMode(true) when Credit Mode chosen
- Calls setCreditMode(false) when Simple Mode chosen
- Shows error toast on failure
- Closes on backdrop click
- Renders in Portuguese (pt-BR)
- Renders in English (en)
- Disables buttons during loading

**Integration Tests** (`mode-selection-flow.test.tsx`):
- Full flow: Form submit → Modal open → Select Credit → Transaction saved
- Full flow: Form submit → Modal open → Select Simple → Transaction saved
- Modal dismissal: ESC key → Form preserved
- Error handling: Database errors

## Server Action

**File:** `fe/lib/actions/payment-methods.ts`
**Function:** `setCreditMode(paymentMethodId: string, creditMode: boolean)`

Updates `payment_methods.credit_mode` only if currently NULL (prevents overwrites).

**Returns:**
```typescript
{
  success: boolean
  error?: string
}
```

## Analytics Events

**Event:** `credit_mode_selected`

**Properties:**
- `userId`: string (authenticated user ID)
- `paymentMethodId`: string (payment method UUID)
- `mode`: 'credit' | 'simple'
- `channel`: 'web'

Tracked via PostHog after successful mode selection.

## Localization Keys

**Namespace:** `credit_mode`

**Files:**
- `fe/lib/localization/pt-br.ts`
- `fe/lib/localization/en.ts`

**Keys:**
- `dialog_title`
- `credit_mode_heading`
- `simple_mode_heading`
- `credit_benefits[]` (array of 4 strings)
- `simple_benefits[]` (array of 4 strings)
- `whats_difference`
- `comparison_table.*` (object with multiple keys)
- `choose_credit_button`
- `choose_simple_button`
- `success_credit`
- `success_simple`
- `error`

## Dependencies

- Story 1-1 (Database Migration) - ✅ Complete
- Story 1-2 (Detection Logic) - ✅ Complete
- Payment method refactoring - ⚠️ Pending
- Test framework setup - ❌ Not available

## Related Files

- `fe/lib/utils/credit-mode-detection.ts` - Frontend detection utility
- `fe/lib/actions/payment-methods.ts` - Server actions
- `fe/lib/analytics/events.ts` - Analytics event definitions
- `fe/components/transaction-dialog.tsx` - Integration point (TODO)
- `fe/scripts/040_credit_card_management.sql` - Database migration

## References

- Story: `docs/sprint-artifacts/1-4-credit-mode-selection-web-frontend.md`
- Context: `docs/sprint-artifacts/1-4-credit-mode-selection-web-frontend_context.xml`
- Epic Tech Spec: `docs/sprint-artifacts/tech-spec-epic-1.md` (lines 1243-1285)
