-- Migration 028: Add auto_pay functionality to recurring transactions
-- This allows users to automatically create transactions on due dates

-- Add auto_pay column to recurring_transactions table
ALTER TABLE recurring_transactions
ADD COLUMN IF NOT EXISTS auto_pay BOOLEAN DEFAULT false;

-- Add comment to explain the column
COMMENT ON COLUMN recurring_transactions.auto_pay IS
'When true, automatically creates transaction on due date without manual confirmation';

-- Create index for efficient querying of active auto-pay transactions
-- This helps the cron job find transactions that need automatic processing
CREATE INDEX IF NOT EXISTS idx_recurring_auto_pay
ON recurring_transactions(user_id, is_active, auto_pay)
WHERE is_active = true AND auto_pay = true;

-- Add index on recurring_payments for finding due auto-pay items
CREATE INDEX IF NOT EXISTS idx_recurring_payments_auto_pay_lookup
ON recurring_payments(due_date, is_paid)
WHERE is_paid = false;
