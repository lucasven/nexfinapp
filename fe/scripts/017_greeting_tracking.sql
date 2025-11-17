-- Migration 017: Add greeting tracking to WhatsApp numbers
-- Track which WhatsApp numbers have received greeting messages

-- Add columns to track greeting status
ALTER TABLE authorized_whatsapp_numbers
ADD COLUMN IF NOT EXISTS greeting_sent BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS greeting_sent_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS greeting_message_id UUID REFERENCES onboarding_messages(id);

-- Create index for efficient queries on greeting status
CREATE INDEX IF NOT EXISTS idx_authorized_whatsapp_greeting_sent
ON authorized_whatsapp_numbers(greeting_sent);

-- Create index for finding numbers by greeting message
CREATE INDEX IF NOT EXISTS idx_authorized_whatsapp_greeting_message
ON authorized_whatsapp_numbers(greeting_message_id);

-- Update existing numbers to mark them as not having received greetings
-- (unless they have a sent greeting in onboarding_messages)
UPDATE authorized_whatsapp_numbers awn
SET
  greeting_sent = true,
  greeting_sent_at = om.sent_at,
  greeting_message_id = om.id
FROM onboarding_messages om
WHERE awn.whatsapp_number = om.whatsapp_number
  AND om.message_type = 'greeting'
  AND om.status = 'sent'
  AND awn.greeting_sent IS NOT TRUE;

-- Add comments for documentation
COMMENT ON COLUMN authorized_whatsapp_numbers.greeting_sent IS 'Whether a greeting message has been sent to this WhatsApp number';
COMMENT ON COLUMN authorized_whatsapp_numbers.greeting_sent_at IS 'Timestamp when the greeting message was sent';
COMMENT ON COLUMN authorized_whatsapp_numbers.greeting_message_id IS 'Reference to the greeting message in onboarding_messages table';