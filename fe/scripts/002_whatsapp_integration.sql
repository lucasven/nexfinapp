-- WhatsApp Integration Schema
-- This migration adds support for WhatsApp bot authentication and session management

-- Create whatsapp_sessions table
CREATE TABLE IF NOT EXISTS whatsapp_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  whatsapp_number TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_token TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  last_activity TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '24 hours'),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE whatsapp_sessions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for whatsapp_sessions
CREATE POLICY "Users can view their own WhatsApp sessions" ON whatsapp_sessions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own WhatsApp sessions" ON whatsapp_sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own WhatsApp sessions" ON whatsapp_sessions
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own WhatsApp sessions" ON whatsapp_sessions
  FOR DELETE USING (auth.uid() = user_id);

-- Service role can manage all sessions (for bot operations)
CREATE POLICY "Service role can manage all sessions" ON whatsapp_sessions
  FOR ALL USING (auth.jwt()->>'role' = 'service_role');

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_user_id ON whatsapp_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_whatsapp_number ON whatsapp_sessions(whatsapp_number);
CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_active ON whatsapp_sessions(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_expires_at ON whatsapp_sessions(expires_at);

-- Function to clean up expired sessions
CREATE OR REPLACE FUNCTION cleanup_expired_whatsapp_sessions()
RETURNS void AS $$
BEGIN
  UPDATE whatsapp_sessions
  SET is_active = false
  WHERE expires_at < NOW() AND is_active = true;
END;
$$ LANGUAGE plpgsql;

-- Create a scheduled job to run cleanup (if pg_cron is available)
-- SELECT cron.schedule('cleanup-expired-sessions', '0 * * * *', 'SELECT cleanup_expired_whatsapp_sessions()');

