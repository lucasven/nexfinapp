-- Migration: Add user profiles, authorized WhatsApp numbers, and group invites
-- This enables profile management and multi-user WhatsApp bot access with permissions

-- Create user_profiles table
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create authorized_whatsapp_numbers table
CREATE TABLE IF NOT EXISTS authorized_whatsapp_numbers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  whatsapp_number TEXT NOT NULL,
  name TEXT NOT NULL, -- e.g., "Spouse", "John", "Me"
  is_primary BOOLEAN DEFAULT false,
  permissions JSONB NOT NULL DEFAULT '{
    "can_view": true,
    "can_add": false,
    "can_edit": false,
    "can_delete": false,
    "can_manage_budgets": false,
    "can_view_reports": false
  }'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, whatsapp_number)
);

-- Create whatsapp_group_invites table
CREATE TABLE IF NOT EXISTS whatsapp_group_invites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  group_jid TEXT,
  invite_code TEXT,
  invite_link TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create function to ensure only one primary number per user
CREATE OR REPLACE FUNCTION ensure_single_primary_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_primary = true THEN
    -- Unset other primary numbers for this user
    UPDATE authorized_whatsapp_numbers
    SET is_primary = false, updated_at = NOW()
    WHERE user_id = NEW.user_id
      AND id != NEW.id
      AND is_primary = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for primary number constraint
CREATE TRIGGER enforce_single_primary_number
  BEFORE INSERT OR UPDATE ON authorized_whatsapp_numbers
  FOR EACH ROW
  EXECUTE FUNCTION ensure_single_primary_number();

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER update_user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_authorized_whatsapp_numbers_updated_at
  BEFORE UPDATE ON authorized_whatsapp_numbers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_whatsapp_group_invites_updated_at
  BEFORE UPDATE ON whatsapp_group_invites
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE authorized_whatsapp_numbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_group_invites ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_profiles
CREATE POLICY "Users can view their own profile" ON user_profiles
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own profile" ON user_profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile" ON user_profiles
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own profile" ON user_profiles
  FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for authorized_whatsapp_numbers
CREATE POLICY "Users can view their own authorized numbers" ON authorized_whatsapp_numbers
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own authorized numbers" ON authorized_whatsapp_numbers
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own authorized numbers" ON authorized_whatsapp_numbers
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own authorized numbers" ON authorized_whatsapp_numbers
  FOR DELETE USING (auth.uid() = user_id);

-- Service role can manage all authorized numbers (for bot operations)
CREATE POLICY "Service role can manage all authorized numbers" ON authorized_whatsapp_numbers
  FOR ALL USING (auth.jwt()->>'role' = 'service_role');

-- RLS Policies for whatsapp_group_invites
CREATE POLICY "Users can view their own group invites" ON whatsapp_group_invites
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own group invites" ON whatsapp_group_invites
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own group invites" ON whatsapp_group_invites
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own group invites" ON whatsapp_group_invites
  FOR DELETE USING (auth.uid() = user_id);

-- Service role can manage all group invites (for bot operations)
CREATE POLICY "Service role can manage all group invites" ON whatsapp_group_invites
  FOR ALL USING (auth.jwt()->>'role' = 'service_role');

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id ON user_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_authorized_whatsapp_numbers_user_id ON authorized_whatsapp_numbers(user_id);
CREATE INDEX IF NOT EXISTS idx_authorized_whatsapp_numbers_whatsapp_number ON authorized_whatsapp_numbers(whatsapp_number);
CREATE INDEX IF NOT EXISTS idx_authorized_whatsapp_numbers_is_primary ON authorized_whatsapp_numbers(user_id, is_primary) WHERE is_primary = true;
CREATE INDEX IF NOT EXISTS idx_whatsapp_group_invites_user_id ON whatsapp_group_invites(user_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_group_invites_is_active ON whatsapp_group_invites(user_id, is_active) WHERE is_active = true;

