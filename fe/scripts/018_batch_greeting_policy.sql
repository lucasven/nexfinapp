-- Migration 018: Add RLS policy for batch greeting operations
-- Allow authenticated users to insert greeting messages for any user (needed for batch operations)

-- Drop the existing INSERT policy if it exists
DROP POLICY IF EXISTS "Users can insert their own onboarding messages" ON onboarding_messages;

-- Restrict batch operations to admin only (based on email)
CREATE POLICY "Admins can insert any onboarding messages"
ON onboarding_messages
FOR INSERT
TO authenticated
WITH CHECK (
  -- Check if user is admin by email
  auth.jwt() ->> 'email' = 'lucas.venturella@hotmail.com'
);

CREATE POLICY "Users can insert their own onboarding messages"
ON onboarding_messages
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND message_type != 'greeting'
);