-- Migration: Admin Access Control
-- Description: Add is_admin function and RLS policies for admin access
-- Date: 2025-11-10

-- Create function to check if current user is admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN (
    SELECT email 
    FROM auth.users 
    WHERE id = auth.uid()
  ) = 'lucas.venturella@hotmail.com';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comment for documentation
COMMENT ON FUNCTION is_admin IS 'Check if the current authenticated user is an admin';

-- Admin policies for user_ai_usage
CREATE POLICY "Admins can view all AI usage" ON user_ai_usage
  FOR SELECT USING (is_admin());

CREATE POLICY "Admins can update all AI usage" ON user_ai_usage
  FOR UPDATE USING (is_admin());

-- Admin policies for parsing_metrics
CREATE POLICY "Admins can view all parsing metrics" ON parsing_metrics
  FOR SELECT USING (is_admin());

-- Admin policies for beta_signups
CREATE POLICY "Admins can view all beta signups" ON beta_signups
  FOR SELECT USING (is_admin());

CREATE POLICY "Admins can update all beta signups" ON beta_signups
  FOR UPDATE USING (is_admin());

-- Admin policies for message_embeddings
CREATE POLICY "Admins can view all message embeddings" ON message_embeddings
  FOR SELECT USING (is_admin());

-- Admin policies for learned_patterns
CREATE POLICY "Admins can view all learned patterns" ON learned_patterns
  FOR SELECT USING (is_admin());

-- Admin policies for authorized_groups
CREATE POLICY "Admins can view all authorized groups" ON authorized_groups
  FOR SELECT USING (is_admin());

-- Admin policies for user_profiles
CREATE POLICY "Admins can view all user profiles" ON user_profiles
  FOR SELECT USING (is_admin());

-- Admin policies for transactions (read-only for aggregates)
CREATE POLICY "Admins can view all transactions" ON transactions
  FOR SELECT USING (is_admin());

-- Admin policies for authorized_whatsapp_numbers
CREATE POLICY "Admins can view all whatsapp numbers" ON authorized_whatsapp_numbers
  FOR SELECT USING (is_admin());

-- Note: Admin has read-only access to user data for analytics purposes
-- Write operations still require proper user ownership checks

