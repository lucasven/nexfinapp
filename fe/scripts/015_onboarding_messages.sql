-- Migration 015: Onboarding Messages Queue
-- Create a queue table for WhatsApp onboarding messages that the bot will poll and send

-- Create onboarding_messages table
CREATE TABLE IF NOT EXISTS onboarding_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  whatsapp_number TEXT NOT NULL,
  user_name TEXT,
  message_type TEXT NOT NULL, -- 'greeting', 'reminder', 'celebration', etc.
  status TEXT DEFAULT 'pending', -- 'pending', 'sent', 'failed'
  sent_at TIMESTAMP WITH TIME ZONE,
  error TEXT,
  retry_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for efficient polling by bot
CREATE INDEX IF NOT EXISTS idx_onboarding_messages_status
ON onboarding_messages(status, created_at);

-- Create index for user lookups
CREATE INDEX IF NOT EXISTS idx_onboarding_messages_user
ON onboarding_messages(user_id);

-- Add RLS policies
ALTER TABLE onboarding_messages ENABLE ROW LEVEL SECURITY;

-- Allow service role to manage all messages (for the bot)
CREATE POLICY "Service role can manage onboarding messages"
ON onboarding_messages
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Users can view their own onboarding messages
CREATE POLICY "Users can view their own onboarding messages"
ON onboarding_messages
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Add comments for documentation
COMMENT ON TABLE onboarding_messages IS 'Queue of WhatsApp onboarding messages to be sent by the bot';
COMMENT ON COLUMN onboarding_messages.message_type IS 'Type of onboarding message: greeting, reminder, celebration';
COMMENT ON COLUMN onboarding_messages.status IS 'Message status: pending, sent, failed';
COMMENT ON COLUMN onboarding_messages.retry_count IS 'Number of times sending this message has been attempted';
