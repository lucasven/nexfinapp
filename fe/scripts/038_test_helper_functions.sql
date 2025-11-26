-- Migration: 038_test_helper_functions.sql
-- Purpose: Add helper functions for test database operations
-- This allows tests to create users with specific UUIDs in auth.users

-- Function to create a test user with a specific UUID
-- This is ONLY for test databases - do not run in production!
CREATE OR REPLACE FUNCTION create_test_user_with_id(
  user_id UUID,
  user_email TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER  -- Run with elevated privileges
AS $$
BEGIN
  -- Insert into auth.users with specific ID
  -- This bypasses the normal auth.admin API which generates random UUIDs
  INSERT INTO auth.users (
    id,
    instance_id,
    email,
    encrypted_password,
    email_confirmed_at,
    created_at,
    updated_at,
    aud,
    role
  )
  VALUES (
    user_id,
    '00000000-0000-0000-0000-000000000000',  -- Default instance ID
    user_email,
    crypt('test-password-123', gen_salt('bf')),  -- Hashed password
    NOW(),  -- Email confirmed
    NOW(),
    NOW(),
    'authenticated',
    'authenticated'
  )
  ON CONFLICT (id) DO NOTHING;  -- Ignore if user already exists

EXCEPTION
  WHEN unique_violation THEN
    -- User already exists, that's okay
    NULL;
END;
$$;

-- Comment for documentation
COMMENT ON FUNCTION create_test_user_with_id IS
'Test helper function to create users with specific UUIDs in auth.users. ONLY use in test databases!';

-- Grant execute permission to service role
GRANT EXECUTE ON FUNCTION create_test_user_with_id TO service_role;
GRANT EXECUTE ON FUNCTION create_test_user_with_id TO anon;
GRANT EXECUTE ON FUNCTION create_test_user_with_id TO authenticated;
