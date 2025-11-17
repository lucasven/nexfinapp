-- Migration 016: Add INSERT policy for onboarding_messages
-- Allow authenticated users to insert their own onboarding messages

-- Users can insert their own onboarding messages
CREATE POLICY "Users can insert their own onboarding messages"
ON onboarding_messages
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);
