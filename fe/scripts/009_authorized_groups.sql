-- Authorized WhatsApp Groups
-- Groups where all messages are processed without individual user authorization

CREATE TABLE IF NOT EXISTS authorized_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_jid TEXT NOT NULL UNIQUE, -- e.g., "120363401668506548@g.us"
  group_name TEXT, -- Human-readable name
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, -- Owner who authorized this group
  added_by TEXT, -- WhatsApp number of person who added bot to group
  auto_authorized BOOLEAN DEFAULT false, -- True if auto-authorized when bot was added
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_message_at TIMESTAMPTZ
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_authorized_groups_jid ON authorized_groups(group_jid);
CREATE INDEX IF NOT EXISTS idx_authorized_groups_user ON authorized_groups(user_id);
CREATE INDEX IF NOT EXISTS idx_authorized_groups_active ON authorized_groups(is_active) WHERE is_active = true;

-- RLS Policies
ALTER TABLE authorized_groups ENABLE ROW LEVEL SECURITY;

-- Users can view their own authorized groups
CREATE POLICY "Users can view own authorized groups" ON authorized_groups
  FOR SELECT USING (auth.uid() = user_id);

-- Users can update their own authorized groups
CREATE POLICY "Users can update own authorized groups" ON authorized_groups
  FOR UPDATE USING (auth.uid() = user_id);

-- Users can delete their own authorized groups
CREATE POLICY "Users can delete own authorized groups" ON authorized_groups
  FOR DELETE USING (auth.uid() = user_id);

-- Service role can manage all authorized groups
CREATE POLICY "Service role can manage authorized groups" ON authorized_groups
  FOR ALL USING (true);

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_authorized_groups_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_authorized_groups_timestamp
  BEFORE UPDATE ON authorized_groups
  FOR EACH ROW
  EXECUTE FUNCTION update_authorized_groups_timestamp();

-- Comments for documentation
COMMENT ON TABLE authorized_groups IS 'WhatsApp groups where all messages are automatically processed. Auto-authorized when bot is added by an authorized user.';
COMMENT ON COLUMN authorized_groups.group_jid IS 'WhatsApp group JID (e.g., 120363401668506548@g.us)';
COMMENT ON COLUMN authorized_groups.group_name IS 'Human-readable group name from WhatsApp';
COMMENT ON COLUMN authorized_groups.added_by IS 'WhatsApp number of the person who added the bot to the group';
COMMENT ON COLUMN authorized_groups.auto_authorized IS 'True if automatically authorized when bot was added by authorized user';

