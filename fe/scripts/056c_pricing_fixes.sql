-- 056c_pricing_fixes.sql
-- Security and integrity fixes from QA review of PR #40

-- Issue #2: Add mercado_pago_payment_id for idempotency
ALTER TABLE lifetime_purchases ADD COLUMN IF NOT EXISTS mercado_pago_payment_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_lifetime_mercado_pago_payment_id
  ON lifetime_purchases(mercado_pago_payment_id);

-- Issue #3: Use sequence for purchase_number instead of manual count
CREATE SEQUENCE IF NOT EXISTS lifetime_purchase_number_seq
  START 1 OWNED BY lifetime_purchases.purchase_number;

-- Set sequence to current max value
DO $$
DECLARE
  max_num INT;
BEGIN
  SELECT COALESCE(MAX(purchase_number), 0) INTO max_num FROM lifetime_purchases;
  IF max_num > 0 THEN
    PERFORM setval('lifetime_purchase_number_seq', max_num);
  END IF;
END $$;

ALTER TABLE lifetime_purchases
  ALTER COLUMN purchase_number SET DEFAULT nextval('lifetime_purchase_number_seq');

-- Issue #4: Make mercado_pago_subscription_id UNIQUE for upsert
ALTER TABLE subscriptions
  ADD CONSTRAINT unique_mercado_pago_subscription_id
  UNIQUE (mercado_pago_subscription_id);

-- Issue #8: Index on mercado_pago_subscription_id (covered by UNIQUE above, but explicit)
CREATE INDEX IF NOT EXISTS idx_subscriptions_mercado_pago_id
  ON subscriptions(mercado_pago_subscription_id);

-- Issue #12: Audit trail for subscription events
CREATE TABLE IF NOT EXISTS subscription_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID REFERENCES subscriptions(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('created', 'activated', 'cancelled', 'expired', 'upgraded')),
  previous_status TEXT,
  new_status TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscription_events_subscription_id
  ON subscription_events(subscription_id);

ALTER TABLE subscription_events ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'subscription_events' AND policyname = 'Users can view own subscription events'
  ) THEN
    CREATE POLICY "Users can view own subscription events"
      ON subscription_events FOR SELECT
      USING (subscription_id IN (
        SELECT id FROM subscriptions WHERE user_id = auth.uid()
      ));
  END IF;
END $$;
