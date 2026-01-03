# Payoff Bug Fix: Delete Future Transactions

## Problem

When a user pays off an installment plan early, the system:
✅ Marks the plan as 'paid_off'
✅ Cancels pending installment_payments
❌ **Does NOT delete the auto-created future transactions**

This causes orphaned transactions to remain visible on the dashboard, confusing users.

## Root Cause

File: `fe/lib/actions/installments.ts:1120`
```typescript
await supabase.rpc('delete_installment_plan_atomic', {
  p_user_id: user.id,
  p_plan_id: planId,
  p_delete_type: 'paid_off'
})
```

The RPC function `delete_installment_plan_atomic` only updates the `installment_payments` table but doesn't touch the `transactions` table.

## Solution

### 1. Update Backend RPC Function

**File:** `fe/scripts/042_3_delete_installment_plan_function.sql` (or create new migration)

Add logic to delete transactions:

```sql
-- Delete transactions linked to pending payments
DELETE FROM transactions
WHERE id IN (
  SELECT transaction_id
  FROM installment_payments
  WHERE plan_id = p_plan_id
    AND status = 'pending'
    AND transaction_id IS NOT NULL
);
```

### 2. Update Frontend Confirmation Dialog

**File:** `fe/components/installments/payoff-confirmation-dialog.tsx`

Add two-step confirmation flow:

#### Step 1: Initial Confirmation
Show current confirmation with payoff details.

#### Step 2: Transaction Handling (NEW)
After user confirms payoff, show new dialog:

```
⚠️ Future Transactions

This installment has X pending transactions that will be deleted.

What would you like to do?

[ ] Just Delete Transactions
    Remove all future transactions. No payment record will be created.

[ ] Create Payoff Transaction
    Delete future transactions AND create a debit transaction
    to record your payoff payment.

    Payoff Amount: R$ XXX.XX [editable]
    Payment Method: [dropdown - debit/cash options]
    Date: [date picker - defaults to today]

[Cancel] [Confirm]
```

### 3. Update Server Action

**File:** `fe/lib/actions/installments.ts`

Modify `payOffInstallment` to accept additional parameters:

```typescript
export async function payOffInstallment(
  planId: string,
  options?: {
    createPayoffTransaction?: boolean
    payoffAmount?: number
    payoffPaymentMethodId?: string
    payoffDate?: string
  }
)
```

If `createPayoffTransaction` is true:
1. Delete future transactions
2. Create a new debit transaction with user-provided details
3. Mark it with metadata: `{ payoff_transaction: true, installment_plan_id: planId }`

### 4. Update WhatsApp Handler

**File:** `whatsapp-bot/src/handlers/credit-card/installment-payoff-handler.ts`

Add similar two-step flow:
1. Confirm payoff
2. Ask if user wants to create payoff transaction
3. If yes, ask for amount (default to remaining) and payment method

## Implementation Checklist

- [x] Update RPC function to delete transactions
- [x] Create new migration (050_payoff_delete_transactions.sql)
- [x] Update `PayoffConfirmationDialog` component to show transaction count
- [x] Add localization keys (pt-BR/en)
- [x] Update analytics to track transactions_deleted count
- [x] Update `getPayoffConfirmationData` to include pending_transactions_count
- [ ] Test payoff flow - verify transactions are removed from dashboard
- [ ] Run migrations: `./supabase/create-migrations.sh` then `supabase db reset`

## Phase 2 (Optional - Advanced UX):
- [ ] Add two-step dialog flow with transaction handling options
- [ ] Add new `createPayoffTransaction` parameter to `payOffInstallment`
- [ ] Add logic to create debit transaction if requested
- [ ] Update WhatsApp payoff handler with two-step flow

## Analytics

Track additional properties on `INSTALLMENT_PAID_OFF_EARLY`:
```typescript
{
  transactions_deleted: number,
  payoff_transaction_created: boolean,
  payoff_amount?: number,
  payoff_payment_method?: string
}
```

## User Experience Flow

### Current (Broken)
1. User clicks "Quitar" (Pay Off)
2. Confirms payoff
3. ❌ Future transactions still visible on dashboard

### Fixed
1. User clicks "Quitar" (Pay Off)
2. Confirms payoff details
3. **NEW:** Choose transaction handling:
   - Option A: Just delete (simple, no record)
   - Option B: Create payoff transaction (better accounting)
4. ✅ Future transactions removed from dashboard
5. ✅ Optional payoff transaction created

## Database Changes

**Migration 050:**
```sql
-- Modify RPC function to delete transactions
CREATE OR REPLACE FUNCTION delete_installment_plan_atomic(
  p_user_id UUID,
  p_plan_id UUID,
  p_delete_type TEXT -- 'paid_off' or 'full_delete'
) RETURNS TABLE(success BOOLEAN, error_message TEXT) AS $$
BEGIN
  -- Existing validation...

  -- NEW: Delete transactions for pending payments
  DELETE FROM transactions
  WHERE id IN (
    SELECT transaction_id
    FROM installment_payments
    WHERE plan_id = p_plan_id
      AND status = 'pending'
      AND transaction_id IS NOT NULL
  );

  -- Existing logic for payments and plan...

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

## Testing Scenarios

1. **Payoff with 4 pending transactions, choose "Just Delete"**
   - Verify all 4 transactions are deleted
   - Verify no payoff transaction is created
   - Verify dashboard no longer shows these transactions

2. **Payoff with 6 pending transactions, choose "Create Payoff Transaction"**
   - Verify all 6 transactions are deleted
   - Verify payoff transaction is created with correct amount
   - Verify payoff transaction has correct metadata
   - Verify dashboard shows payoff transaction

3. **Edit payoff amount before confirming**
   - User changes amount from R$ 1,200 to R$ 1,000
   - Verify transaction is created with R$ 1,000

## Priority

**HIGH** - This is a data integrity issue that affects user trust in the system.

## Estimated Effort

- Backend RPC update: 30 mins
- Frontend dialog update: 2 hours
- Server action update: 1 hour
- WhatsApp handler update: 1 hour
- Testing: 1 hour
- **Total: ~5.5 hours**
