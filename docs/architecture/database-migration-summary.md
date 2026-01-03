# Database Migration Summary

## New Tables

```sql
-- Migration 033: Credit Card Installments
CREATE TABLE installment_plans (...);
CREATE TABLE installment_payments (...);

-- Indexes
CREATE INDEX idx_installment_plans_user_status ...;
CREATE INDEX idx_installment_payments_plan ...;
CREATE INDEX idx_installment_payments_due_date_status ...;

-- RLS Policies
CREATE POLICY installment_plans_user_policy ...;
CREATE POLICY installment_payments_user_policy ...;
```

## Table Modifications

```sql
-- Migration 034: Credit Card Management Fields
ALTER TABLE payment_methods
ADD COLUMN credit_mode BOOLEAN DEFAULT FALSE,
ADD COLUMN statement_closing_day INTEGER,
ADD COLUMN payment_due_day INTEGER;

-- Migration 035: AI Helper Cost Tracking
ALTER TABLE user_ai_usage
ADD COLUMN helper_domain TEXT;

CREATE INDEX idx_user_ai_usage_helper_domain ...;
```

## Views

```sql
-- Helper cost analytics
CREATE VIEW helper_costs_today ...;
CREATE VIEW user_daily_ai_costs ...;
```

---
