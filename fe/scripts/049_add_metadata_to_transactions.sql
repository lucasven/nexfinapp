-- Migration: Add metadata column to transactions table
-- Date: 2025-12-08
-- Description: Adds JSON metadata column for installment tracking and auto-generated transactions

-- ============================================
-- Add metadata column
-- ============================================

ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- ============================================
-- Add indexes for common metadata queries
-- ============================================

-- Index for installment-sourced transactions
CREATE INDEX IF NOT EXISTS idx_transactions_metadata_installment_source
  ON transactions USING GIN ((metadata -> 'installment_source'))
  WHERE (metadata ->> 'installment_source')::boolean = true;

-- Index for auto-generated transactions
CREATE INDEX IF NOT EXISTS idx_transactions_metadata_auto_generated
  ON transactions USING GIN ((metadata -> 'auto_generated'))
  WHERE (metadata ->> 'auto_generated')::boolean = true;

-- Index for installment plan lookups
CREATE INDEX IF NOT EXISTS idx_transactions_metadata_installment_plan_id
  ON transactions USING GIN ((metadata -> 'installment_plan_id'))
  WHERE metadata ? 'installment_plan_id';

-- ============================================
-- Add comments
-- ============================================

COMMENT ON COLUMN transactions.metadata IS 'JSON metadata for special transaction types: installment_source, installment_plan_id, installment_number, total_installments, auto_generated, credit_card_id, statement_period_start, statement_period_end';

-- ============================================
-- Example metadata structures:
-- ============================================

-- Installment transaction:
-- {
--   "installment_source": true,
--   "installment_plan_id": "uuid",
--   "installment_number": 3,
--   "total_installments": 12
-- }

-- Auto-generated payment transaction:
-- {
--   "auto_generated": true,
--   "source": "payment_reminder",
--   "credit_card_id": "uuid",
--   "statement_period_start": "2025-12-05",
--   "statement_period_end": "2026-01-04",
--   "statement_total": 1500.50
-- }
