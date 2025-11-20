-- Migration 029: Add performance indexes for recurring payments
-- These indexes optimize common queries for dashboard widgets and cron jobs

-- Index for finding unpaid recurring payments in a date range
-- Used by dashboard widget to show upcoming payments
CREATE INDEX IF NOT EXISTS idx_recurring_payments_due_unpaid
ON recurring_payments(due_date, is_paid)
WHERE is_paid = false;

-- Composite index for user-specific monthly recurring payment queries
-- Optimizes queries that filter by user_id through the recurring_transaction join
CREATE INDEX IF NOT EXISTS idx_recurring_payments_user_lookup
ON recurring_payments(recurring_transaction_id, due_date, is_paid);

-- Index for finding payments by transaction_id
-- Speeds up lookups when unmarking payments as paid
CREATE INDEX IF NOT EXISTS idx_recurring_payments_transaction
ON recurring_payments(transaction_id)
WHERE transaction_id IS NOT NULL;

-- Index for recurring_transactions by user and active status
-- Helps find all active recurring transactions for a user
CREATE INDEX IF NOT EXISTS idx_recurring_transactions_user_active
ON recurring_transactions(user_id, is_active)
WHERE is_active = true;

-- Add user_id column to recurring_payments for direct filtering (denormalization)
-- This avoids the join with recurring_transactions for many queries
ALTER TABLE recurring_payments
ADD COLUMN IF NOT EXISTS user_id UUID;

-- Populate user_id from recurring_transactions
UPDATE recurring_payments rp
SET user_id = rt.user_id
FROM recurring_transactions rt
WHERE rp.recurring_transaction_id = rt.id
AND rp.user_id IS NULL;

-- Add foreign key constraint
ALTER TABLE recurring_payments
ADD CONSTRAINT fk_recurring_payments_user
FOREIGN KEY (user_id)
REFERENCES auth.users(id)
ON DELETE CASCADE;

-- Create index on user_id for direct filtering
CREATE INDEX IF NOT EXISTS idx_recurring_payments_user_id
ON recurring_payments(user_id, due_date, is_paid);

-- Add RLS policy for recurring_payments based on user_id
ALTER TABLE recurring_payments ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view their own recurring payments" ON recurring_payments;
DROP POLICY IF EXISTS "Users can insert their own recurring payments" ON recurring_payments;
DROP POLICY IF EXISTS "Users can update their own recurring payments" ON recurring_payments;
DROP POLICY IF EXISTS "Users can delete their own recurring payments" ON recurring_payments;

-- Create new RLS policies
CREATE POLICY "Users can view their own recurring payments"
ON recurring_payments FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own recurring payments"
ON recurring_payments FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own recurring payments"
ON recurring_payments FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own recurring payments"
ON recurring_payments FOR DELETE
USING (auth.uid() = user_id);

-- Create trigger to automatically set user_id on insert
CREATE OR REPLACE FUNCTION set_recurring_payment_user_id()
RETURNS TRIGGER AS $$
BEGIN
  SELECT user_id INTO NEW.user_id
  FROM recurring_transactions
  WHERE id = NEW.recurring_transaction_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_set_recurring_payment_user_id ON recurring_payments;

CREATE TRIGGER trigger_set_recurring_payment_user_id
BEFORE INSERT ON recurring_payments
FOR EACH ROW
EXECUTE FUNCTION set_recurring_payment_user_id();
