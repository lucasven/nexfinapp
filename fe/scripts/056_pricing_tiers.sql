-- 056_pricing_tiers.sql
-- Adds subscription tables and get_user_tier() helper function for pricing tiers

-- Add subscriptions table
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tier TEXT NOT NULL CHECK (tier IN ('free', 'whatsapp', 'couples', 'openfinance')),
  type TEXT NOT NULL CHECK (type IN ('monthly', 'lifetime')),
  status TEXT NOT NULL CHECK (status IN ('active', 'cancelled', 'past_due', 'expired')),
  mercado_pago_subscription_id TEXT,
  started_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);

-- Add lifetime purchases table (tracks the first-50 limit)
CREATE TABLE IF NOT EXISTS lifetime_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tier TEXT NOT NULL CHECK (tier IN ('whatsapp', 'couples', 'openfinance')),
  purchase_number INT NOT NULL,
  amount_paid DECIMAL(10,2) NOT NULL,
  purchased_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(purchase_number)
);

-- RLS: users can only see their own subscriptions
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'subscriptions' AND policyname = 'Users can view own subscriptions'
  ) THEN
    CREATE POLICY "Users can view own subscriptions"
      ON subscriptions FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

ALTER TABLE lifetime_purchases ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'lifetime_purchases' AND policyname = 'Users can view own lifetime purchases'
  ) THEN
    CREATE POLICY "Users can view own lifetime purchases"
      ON lifetime_purchases FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- Helper function: returns user's active tier (highest tier wins)
CREATE OR REPLACE FUNCTION get_user_tier(p_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tier TEXT;
BEGIN
  SELECT tier INTO v_tier
  FROM subscriptions
  WHERE user_id = p_user_id
    AND status = 'active'
  ORDER BY
    CASE tier
      WHEN 'openfinance' THEN 4
      WHEN 'couples' THEN 3
      WHEN 'whatsapp' THEN 2
      WHEN 'free' THEN 1
    END DESC
  LIMIT 1;

  RETURN COALESCE(v_tier, 'free');
END;
$$;
