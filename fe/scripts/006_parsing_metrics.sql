-- Migration: Add parsing metrics table
-- This enables tracking of parsing strategy success rates and performance

CREATE TABLE IF NOT EXISTS parsing_metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  whatsapp_number TEXT NOT NULL,
  
  -- Message info
  message_text TEXT NOT NULL,
  message_type TEXT NOT NULL, -- 'text', 'image', 'command'
  
  -- Parsing strategy used
  strategy_used TEXT NOT NULL, -- 'correction_state', 'duplicate_confirmation', 'correction_intent', 'explicit_command', 'learned_pattern', 'local_nlp', 'ai_pattern', 'unknown'
  
  -- Results
  intent_action TEXT,
  confidence FLOAT,
  success BOOLEAN NOT NULL,
  error_message TEXT,
  
  -- Performance
  parse_duration_ms INTEGER,
  execution_duration_ms INTEGER,
  
  -- Permission check
  permission_required TEXT,
  permission_granted BOOLEAN,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE parsing_metrics ENABLE ROW LEVEL SECURITY;

-- RLS Policies for parsing_metrics
CREATE POLICY "Users can view their own parsing metrics" ON parsing_metrics
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "System can insert parsing metrics" ON parsing_metrics
  FOR INSERT WITH CHECK (true);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_parsing_metrics_user ON parsing_metrics(user_id);
CREATE INDEX IF NOT EXISTS idx_parsing_metrics_strategy ON parsing_metrics(strategy_used, success);
CREATE INDEX IF NOT EXISTS idx_parsing_metrics_created ON parsing_metrics(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_parsing_metrics_whatsapp ON parsing_metrics(whatsapp_number);
CREATE INDEX IF NOT EXISTS idx_parsing_metrics_action ON parsing_metrics(intent_action);

-- Add locale column to user_profiles if it doesn't exist (for i18n support)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'user_profiles' AND column_name = 'locale') THEN
        ALTER TABLE user_profiles ADD COLUMN locale TEXT DEFAULT 'pt-br';
    END IF;
END $$;

-- Comment on table
COMMENT ON TABLE parsing_metrics IS 'Tracks parsing strategy usage, success rates, and performance metrics for WhatsApp bot messages';


