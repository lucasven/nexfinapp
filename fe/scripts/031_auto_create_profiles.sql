-- Migration 031: Auto-create user profiles on signup
-- This ensures every new user gets a profile immediately when their auth account is created
-- Fixes onboarding issues where profile creation was lazy and caused race conditions

-- Create function to auto-create user profile
CREATE OR REPLACE FUNCTION public.create_user_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Insert a new profile for the user with default onboarding state
  -- Note: user_profiles columns are: user_id, display_name, locale, onboarding_completed,
  -- onboarding_step, whatsapp_setup_completed, first_category_added, first_expense_added
  INSERT INTO public.user_profiles (
    user_id,
    display_name,
    locale,
    onboarding_completed,
    onboarding_step,
    whatsapp_setup_completed,
    first_category_added,
    first_expense_added
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    COALESCE(LOWER(NEW.raw_user_meta_data->>'locale'), 'pt-br'), -- Default to pt-br (lowercase per check_locale constraint)
    false,
    'welcome', -- Start at welcome step
    false,
    false,
    false
  )
  ON CONFLICT (user_id) DO NOTHING; -- Prevent duplicates if somehow called twice

  RETURN NEW;
END;
$$;

-- Create trigger on auth.users table to auto-create profile
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.create_user_profile();

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION public.create_user_profile() TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_user_profile() TO service_role;

-- Backfill: Create profiles for any existing users who don't have one
INSERT INTO public.user_profiles (
  user_id,
  display_name,
  locale,
  onboarding_completed,
  onboarding_step,
  whatsapp_setup_completed,
  first_category_added,
  first_expense_added
)
SELECT
  u.id,
  COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', ''),
  COALESCE(LOWER(u.raw_user_meta_data->>'locale'), 'pt-br'),
  false,
  'welcome',
  false,
  false,
  false
FROM auth.users u
LEFT JOIN public.user_profiles p ON p.user_id = u.id
WHERE p.user_id IS NULL;

-- Add comment for documentation
COMMENT ON FUNCTION public.create_user_profile() IS
  'Automatically creates a user profile with default onboarding state when a new auth user is created. Prevents race conditions in onboarding flow.';
