-- Migration: Add learned patterns and payment method preferences
-- This enables the self-learning AI system for WhatsApp bot

-- Learned patterns table for storing AI-generated regex patterns
CREATE TABLE IF NOT EXISTS learned_patterns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  pattern_type TEXT NOT NULL, -- 'expense', 'budget', 'recurring', 'report'
  
  -- Pattern matching
  regex_pattern TEXT NOT NULL,
  example_input TEXT NOT NULL,
  
  -- Expected output
  parsed_output JSONB NOT NULL,
  
  -- Performance tracking
  confidence_score FLOAT DEFAULT 1.0,
  usage_count INTEGER DEFAULT 0,
  success_count INTEGER DEFAULT 0,
  failure_count INTEGER DEFAULT 0,
  
  -- Metadata
  last_used_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_active BOOLEAN DEFAULT true,
  
  -- Constraints
  UNIQUE(user_id, regex_pattern)
);

-- Payment method preferences table for learning user's payment habits
CREATE TABLE IF NOT EXISTS payment_method_preferences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  category_id UUID REFERENCES categories(id) ON DELETE CASCADE,
  payment_method TEXT NOT NULL,
  usage_count INTEGER DEFAULT 1,
  last_used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, category_id, payment_method)
);

-- Enable RLS
ALTER TABLE learned_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_method_preferences ENABLE ROW LEVEL SECURITY;

-- RLS Policies for learned_patterns
CREATE POLICY "Users can view their own learned patterns" ON learned_patterns
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own learned patterns" ON learned_patterns
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own learned patterns" ON learned_patterns
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own learned patterns" ON learned_patterns
  FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for payment_method_preferences
CREATE POLICY "Users can view their own payment preferences" ON payment_method_preferences
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own payment preferences" ON payment_method_preferences
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own payment preferences" ON payment_method_preferences
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own payment preferences" ON payment_method_preferences
  FOR DELETE USING (auth.uid() = user_id);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_learned_patterns_user ON learned_patterns(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_learned_patterns_usage ON learned_patterns(usage_count DESC);
CREATE INDEX IF NOT EXISTS idx_learned_patterns_success_rate
ON learned_patterns (
  (CASE WHEN usage_count > 0
        THEN success_count::float / usage_count
        ELSE 0 END) DESC
);
CREATE INDEX IF NOT EXISTS idx_payment_preferences ON payment_method_preferences(user_id, category_id, usage_count DESC);
CREATE INDEX IF NOT EXISTS idx_learned_patterns_type ON learned_patterns(pattern_type, is_active);
CREATE INDEX IF NOT EXISTS idx_learned_patterns_last_used ON learned_patterns(last_used_at DESC);

-- Add payment_method column to transactions table if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'transactions' AND column_name = 'payment_method') THEN
        ALTER TABLE transactions ADD COLUMN payment_method TEXT;
    END IF;
END $$;
