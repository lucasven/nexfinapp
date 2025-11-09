-- Migration: AI Usage Tracking and Daily Limits
-- Description: Track per-user API costs with configurable daily limits
-- Date: 2025-01-07

-- Create AI usage tracking table
CREATE TABLE IF NOT EXISTS user_ai_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE, -- References auth.users (no explicit FK in Supabase pattern)
  
  -- Cost tracking
  total_cost_usd DECIMAL(10, 6) DEFAULT 0.0, -- Lifetime total
  daily_cost_usd DECIMAL(10, 6) DEFAULT 0.0,
  usage_date DATE DEFAULT CURRENT_DATE, -- Renamed from current_date (reserved keyword)
  
  -- Limits and controls
  daily_limit_usd DECIMAL(10, 6) DEFAULT 1.00, -- $1 per day default
  is_limit_enabled BOOLEAN DEFAULT TRUE,
  is_admin_override BOOLEAN DEFAULT FALSE, -- Admin can bypass limits
  
  -- Usage statistics
  llm_calls_count INTEGER DEFAULT 0,
  llm_calls_today INTEGER DEFAULT 0,
  embedding_calls_count INTEGER DEFAULT 0,
  embedding_calls_today INTEGER DEFAULT 0,
  cache_hits_count INTEGER DEFAULT 0,
  cache_hits_today INTEGER DEFAULT 0,
  
  -- Token usage
  total_input_tokens BIGINT DEFAULT 0,
  total_output_tokens BIGINT DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_reset_date DATE DEFAULT CURRENT_DATE
);

-- Create indexes
CREATE INDEX IF NOT EXISTS user_ai_usage_user_id_idx ON user_ai_usage(user_id);
CREATE INDEX IF NOT EXISTS user_ai_usage_daily_cost_idx ON user_ai_usage(daily_cost_usd DESC);
CREATE INDEX IF NOT EXISTS user_ai_usage_usage_date_idx ON user_ai_usage(usage_date);

-- Function to check if user has exceeded daily limit
CREATE OR REPLACE FUNCTION check_daily_limit(p_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_usage RECORD;
  v_today DATE;
BEGIN
  v_today := CURRENT_DATE;
  
  -- Get or create usage record
  SELECT * INTO v_usage
  FROM user_ai_usage
  WHERE user_id = p_user_id;
  
  -- If no record exists, create one
  IF NOT FOUND THEN
    INSERT INTO user_ai_usage (user_id, usage_date)
    VALUES (p_user_id, v_today);
    RETURN TRUE;
  END IF;
  
  -- Reset daily counters if date changed
  IF v_usage.usage_date < v_today THEN
    UPDATE user_ai_usage
    SET 
      daily_cost_usd = 0.0,
      llm_calls_today = 0,
      embedding_calls_today = 0,
      cache_hits_today = 0,
      usage_date = v_today,
      last_reset_date = v_today,
      last_updated = NOW()
    WHERE user_id = p_user_id;
    RETURN TRUE;
  END IF;
  
  -- Check if limit is enabled and not overridden by admin
  IF NOT v_usage.is_limit_enabled OR v_usage.is_admin_override THEN
    RETURN TRUE;
  END IF;
  
  -- Check if daily limit exceeded
  RETURN v_usage.daily_cost_usd < v_usage.daily_limit_usd;
END;
$$ LANGUAGE plpgsql;

-- Function to record AI usage
CREATE OR REPLACE FUNCTION record_ai_usage(
  p_user_id UUID,
  p_cost_usd DECIMAL,
  p_call_type TEXT, -- 'llm', 'embedding', or 'cache_hit'
  p_input_tokens INTEGER DEFAULT 0,
  p_output_tokens INTEGER DEFAULT 0
)
RETURNS VOID AS $$
DECLARE
  v_today DATE;
BEGIN
  v_today := CURRENT_DATE;
  
  -- Insert or update usage record
  INSERT INTO user_ai_usage (
    user_id,
    total_cost_usd,
    daily_cost_usd,
    usage_date,
    llm_calls_count,
    llm_calls_today,
    embedding_calls_count,
    embedding_calls_today,
    cache_hits_count,
    cache_hits_today,
    total_input_tokens,
    total_output_tokens,
    last_updated
  )
  VALUES (
    p_user_id,
    p_cost_usd,
    p_cost_usd,
    v_today,
    CASE WHEN p_call_type = 'llm' THEN 1 ELSE 0 END,
    CASE WHEN p_call_type = 'llm' THEN 1 ELSE 0 END,
    CASE WHEN p_call_type = 'embedding' THEN 1 ELSE 0 END,
    CASE WHEN p_call_type = 'embedding' THEN 1 ELSE 0 END,
    CASE WHEN p_call_type = 'cache_hit' THEN 1 ELSE 0 END,
    CASE WHEN p_call_type = 'cache_hit' THEN 1 ELSE 0 END,
    p_input_tokens,
    p_output_tokens,
    NOW()
  )
  ON CONFLICT (user_id) 
  DO UPDATE SET
    total_cost_usd = user_ai_usage.total_cost_usd + p_cost_usd,
    daily_cost_usd = CASE 
      WHEN user_ai_usage.usage_date = v_today THEN user_ai_usage.daily_cost_usd + p_cost_usd
      ELSE p_cost_usd
    END,
    usage_date = v_today,
    llm_calls_count = CASE WHEN p_call_type = 'llm' THEN user_ai_usage.llm_calls_count + 1 ELSE user_ai_usage.llm_calls_count END,
    llm_calls_today = CASE 
      WHEN p_call_type = 'llm' AND user_ai_usage.usage_date = v_today THEN user_ai_usage.llm_calls_today + 1
      WHEN p_call_type = 'llm' THEN 1
      ELSE CASE WHEN user_ai_usage.usage_date = v_today THEN user_ai_usage.llm_calls_today ELSE 0 END
    END,
    embedding_calls_count = CASE WHEN p_call_type = 'embedding' THEN user_ai_usage.embedding_calls_count + 1 ELSE user_ai_usage.embedding_calls_count END,
    embedding_calls_today = CASE 
      WHEN p_call_type = 'embedding' AND user_ai_usage.usage_date = v_today THEN user_ai_usage.embedding_calls_today + 1
      WHEN p_call_type = 'embedding' THEN 1
      ELSE CASE WHEN user_ai_usage.usage_date = v_today THEN user_ai_usage.embedding_calls_today ELSE 0 END
    END,
    cache_hits_count = CASE WHEN p_call_type = 'cache_hit' THEN user_ai_usage.cache_hits_count + 1 ELSE user_ai_usage.cache_hits_count END,
    cache_hits_today = CASE 
      WHEN p_call_type = 'cache_hit' AND user_ai_usage.usage_date = v_today THEN user_ai_usage.cache_hits_today + 1
      WHEN p_call_type = 'cache_hit' THEN 1
      ELSE CASE WHEN user_ai_usage.usage_date = v_today THEN user_ai_usage.cache_hits_today ELSE 0 END
    END,
    total_input_tokens = user_ai_usage.total_input_tokens + p_input_tokens,
    total_output_tokens = user_ai_usage.total_output_tokens + p_output_tokens,
    last_updated = NOW();
END;
$$ LANGUAGE plpgsql;

-- Function to get user usage statistics
CREATE OR REPLACE FUNCTION get_user_usage_stats(p_user_id UUID)
RETURNS TABLE (
  daily_cost_usd DECIMAL,
  daily_limit_usd DECIMAL,
  remaining_budget_usd DECIMAL,
  llm_calls_today INTEGER,
  embedding_calls_today INTEGER,
  cache_hits_today INTEGER,
  cache_hit_rate DECIMAL,
  is_limit_exceeded BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    uau.daily_cost_usd,
    uau.daily_limit_usd,
    GREATEST(0, uau.daily_limit_usd - uau.daily_cost_usd) AS remaining_budget_usd,
    uau.llm_calls_today,
    uau.embedding_calls_today,
    uau.cache_hits_today,
    CASE 
      WHEN (uau.llm_calls_today + uau.cache_hits_today) > 0 
      THEN ROUND(uau.cache_hits_today::DECIMAL / (uau.llm_calls_today + uau.cache_hits_today), 2)
      ELSE 0
    END AS cache_hit_rate,
    (uau.is_limit_enabled AND NOT uau.is_admin_override AND uau.daily_cost_usd >= uau.daily_limit_usd) AS is_limit_exceeded
  FROM user_ai_usage uau
  WHERE uau.user_id = p_user_id;
END;
$$ LANGUAGE plpgsql;

-- Enable RLS for security
ALTER TABLE user_ai_usage ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS "Users can view their own AI usage" ON user_ai_usage;
DROP POLICY IF EXISTS "Users can insert their own AI usage" ON user_ai_usage;
DROP POLICY IF EXISTS "Users can update their own AI usage" ON user_ai_usage;

-- RLS Policies for user_ai_usage
CREATE POLICY "Users can view their own AI usage" ON user_ai_usage
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own AI usage" ON user_ai_usage
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own AI usage" ON user_ai_usage
  FOR UPDATE USING (auth.uid() = user_id);

-- Note: Service role can access all rows for admin purposes

-- Add comments for documentation
COMMENT ON TABLE user_ai_usage IS 'Tracks per-user AI API usage and enforces daily spending limits';
COMMENT ON FUNCTION check_daily_limit IS 'Check if user can make AI API call without exceeding daily limit';
COMMENT ON FUNCTION record_ai_usage IS 'Record AI API usage and update cost/usage counters';
COMMENT ON FUNCTION get_user_usage_stats IS 'Get detailed usage statistics for a user';

