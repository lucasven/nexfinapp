-- Migration 032: User deletion function and audit logging
-- Provides comprehensive user data deletion for LGPD compliance
-- Includes audit logging for accountability

-- Create audit log table for user deletions
CREATE TABLE IF NOT EXISTS public.user_deletion_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deleted_user_id UUID NOT NULL,
  deleted_user_email TEXT NOT NULL,
  deleted_by_user_id UUID, -- NULL if self-deletion
  deletion_type TEXT NOT NULL CHECK (deletion_type IN ('self', 'admin')),
  deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  data_summary JSONB NOT NULL, -- Summary of deleted records
  ip_address INET,
  user_agent TEXT
);

-- Index for audit queries
CREATE INDEX IF NOT EXISTS idx_user_deletion_audit_deleted_at
  ON public.user_deletion_audit(deleted_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_deletion_audit_deleted_user_id
  ON public.user_deletion_audit(deleted_user_id);

-- Enable RLS on audit table
ALTER TABLE public.user_deletion_audit ENABLE ROW LEVEL SECURITY;

-- Only admins can view deletion audit logs
CREATE POLICY "Admins can view deletion audit logs"
  ON public.user_deletion_audit
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_id = auth.uid() AND is_admin = true
    )
  );

-- Function to completely delete all user data
CREATE OR REPLACE FUNCTION public.delete_user_data(
  p_user_id UUID,
  p_deleted_by_user_id UUID DEFAULT NULL,
  p_deletion_type TEXT DEFAULT 'self'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_email TEXT;
  v_transactions_count INTEGER;
  v_categories_count INTEGER;
  v_budgets_count INTEGER;
  v_recurring_count INTEGER;
  v_whatsapp_count INTEGER;
  v_groups_count INTEGER;
  v_ai_usage_count INTEGER;
  v_patterns_count INTEGER;
  v_corrections_count INTEGER;
  v_metrics_count INTEGER;
  v_onboarding_count INTEGER;
  v_sessions_count INTEGER;
  v_data_summary JSONB;
BEGIN
  -- Get user email before deletion
  SELECT email INTO v_user_email
  FROM auth.users
  WHERE id = p_user_id;

  IF v_user_email IS NULL THEN
    RAISE EXCEPTION 'User not found: %', p_user_id;
  END IF;

  -- Validate deletion type
  IF p_deletion_type NOT IN ('self', 'admin') THEN
    RAISE EXCEPTION 'Invalid deletion type: %', p_deletion_type;
  END IF;

  -- If self-deletion, verify the user is deleting their own account
  IF p_deletion_type = 'self' AND p_deleted_by_user_id != p_user_id THEN
    RAISE EXCEPTION 'Users can only delete their own accounts';
  END IF;

  -- Count records before deletion (for audit)
  SELECT COUNT(*) INTO v_transactions_count
    FROM public.transactions WHERE user_id = p_user_id;

  SELECT COUNT(*) INTO v_categories_count
    FROM public.categories WHERE user_id = p_user_id;

  SELECT COUNT(*) INTO v_budgets_count
    FROM public.budgets WHERE user_id = p_user_id;

  SELECT COUNT(*) INTO v_recurring_count
    FROM public.recurring_transactions WHERE user_id = p_user_id;

  SELECT COUNT(*) INTO v_whatsapp_count
    FROM public.authorized_whatsapp_numbers WHERE user_id = p_user_id;

  SELECT COUNT(*) INTO v_groups_count
    FROM public.authorized_groups WHERE user_id = p_user_id;

  SELECT COUNT(*) INTO v_ai_usage_count
    FROM public.user_ai_usage WHERE user_id = p_user_id;

  SELECT COUNT(*) INTO v_patterns_count
    FROM public.learned_patterns WHERE user_id = p_user_id;

  SELECT COUNT(*) INTO v_corrections_count
    FROM public.category_corrections WHERE user_id = p_user_id;

  SELECT COUNT(*) INTO v_metrics_count
    FROM public.parsing_metrics WHERE user_id = p_user_id;

  SELECT COUNT(*) INTO v_onboarding_count
    FROM public.onboarding_messages WHERE user_id = p_user_id;

  SELECT COUNT(*) INTO v_sessions_count
    FROM public.whatsapp_sessions WHERE user_id = p_user_id;

  -- Delete data in order (respecting foreign keys)

  -- 1. Delete transactions (most important user data)
  DELETE FROM public.transactions WHERE user_id = p_user_id;

  -- 2. Delete recurring transactions
  DELETE FROM public.recurring_transactions WHERE user_id = p_user_id;

  -- 3. Delete budgets
  DELETE FROM public.budgets WHERE user_id = p_user_id;

  -- 4. Delete custom categories (keep shared ones)
  DELETE FROM public.categories WHERE user_id = p_user_id;

  -- 5. Delete AI-related data
  DELETE FROM public.user_ai_usage WHERE user_id = p_user_id;
  DELETE FROM public.learned_patterns WHERE user_id = p_user_id;
  DELETE FROM public.category_corrections WHERE user_id = p_user_id;
  DELETE FROM public.parsing_metrics WHERE user_id = p_user_id;

  -- 6. Delete WhatsApp-related data
  -- First, clear FK references to onboarding_messages to prevent constraint violations
  UPDATE public.authorized_whatsapp_numbers
    SET greeting_message_id = NULL
    WHERE greeting_message_id IN (
      SELECT id FROM public.onboarding_messages WHERE user_id = p_user_id
    );

  -- Now safe to delete onboarding_messages
  DELETE FROM public.onboarding_messages WHERE user_id = p_user_id;

  -- Then delete the rest of WhatsApp-related data
  DELETE FROM public.authorized_whatsapp_numbers WHERE user_id = p_user_id;
  DELETE FROM public.authorized_groups WHERE user_id = p_user_id;
  DELETE FROM public.whatsapp_sessions WHERE user_id = p_user_id;

  -- 7. Delete user profile (this should cascade from auth.users, but explicit is safer)
  DELETE FROM public.user_profiles WHERE user_id = p_user_id;

  -- Build summary for audit log
  v_data_summary := jsonb_build_object(
    'transactions', v_transactions_count,
    'categories', v_categories_count,
    'budgets', v_budgets_count,
    'recurring_transactions', v_recurring_count,
    'whatsapp_numbers', v_whatsapp_count,
    'authorized_groups', v_groups_count,
    'ai_usage_records', v_ai_usage_count,
    'learned_patterns', v_patterns_count,
    'category_corrections', v_corrections_count,
    'parsing_metrics', v_metrics_count,
    'onboarding_messages', v_onboarding_count,
    'whatsapp_sessions', v_sessions_count,
    'total_records_deleted', (
      v_transactions_count + v_categories_count + v_budgets_count +
      v_recurring_count + v_whatsapp_count + v_groups_count +
      v_ai_usage_count + v_patterns_count + v_corrections_count +
      v_metrics_count + v_onboarding_count + v_sessions_count
    )
  );

  -- Create audit log entry
  INSERT INTO public.user_deletion_audit (
    deleted_user_id,
    deleted_user_email,
    deleted_by_user_id,
    deletion_type,
    data_summary
  )
  VALUES (
    p_user_id,
    v_user_email,
    p_deleted_by_user_id,
    p_deletion_type,
    v_data_summary
  );

  -- Return summary
  RETURN jsonb_build_object(
    'success', true,
    'user_id', p_user_id,
    'user_email', v_user_email,
    'deletion_type', p_deletion_type,
    'data_summary', v_data_summary
  );

EXCEPTION
  WHEN OTHERS THEN
    -- Log error and re-raise
    RAISE EXCEPTION 'Error deleting user data: %', SQLERRM;
END;
$$;

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION public.delete_user_data(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_user_data(UUID, UUID, TEXT) TO service_role;

-- Add helpful comments
COMMENT ON TABLE public.user_deletion_audit IS
  'Audit log for user account deletions. Tracks who deleted what and when for LGPD compliance.';

COMMENT ON FUNCTION public.delete_user_data(UUID, UUID, TEXT) IS
  'Completely deletes all user data from the system. Used for LGPD compliance (self-deletion) and admin user management. Does NOT delete the auth.users record - that must be done separately via Supabase Admin API.';
