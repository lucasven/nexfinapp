-- Enable auto_pay for all existing active recurring transactions
-- so they benefit from the auto-payment cron job without manual editing
UPDATE recurring_transactions SET auto_pay = true WHERE is_active = true;
