-- Migration: Smart Onboarding & Engagement System
-- Purpose: Create database schema for user engagement state tracking, transition logging, and proactive message queue
-- Date: 2025-11-21
-- Epic: 1 - Foundation & Message Infrastructure
-- Story: 1.1 - Database Schema Migration

-- ============================================================================
-- TABLE: user_engagement_states
-- Purpose: Tracks the current engagement state for each user (5-state machine)
-- States: active, goodbye_sent, help_flow, remind_later, dormant
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_engagement_states (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  state TEXT NOT NULL DEFAULT 'active'
    CHECK (state IN ('active', 'goodbye_sent', 'help_flow', 'remind_later', 'dormant')),
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  goodbye_sent_at TIMESTAMPTZ,
  goodbye_expires_at TIMESTAMPTZ,
  remind_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for scheduler queries
CREATE INDEX IF NOT EXISTS idx_engagement_state ON user_engagement_states(state);
CREATE INDEX IF NOT EXISTS idx_engagement_last_activity ON user_engagement_states(last_activity_at);
CREATE INDEX IF NOT EXISTS idx_engagement_goodbye_expires ON user_engagement_states(goodbye_expires_at)
  WHERE goodbye_expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_engagement_remind_at ON user_engagement_states(remind_at)
  WHERE remind_at IS NOT NULL;

-- Comments for documentation
COMMENT ON TABLE user_engagement_states IS 'Tracks user engagement state for the 5-state engagement machine (active, goodbye_sent, help_flow, remind_later, dormant)';
COMMENT ON COLUMN user_engagement_states.state IS 'Current engagement state: active (default), goodbye_sent (awaiting response), help_flow (needs assistance), remind_later (user requested delay), dormant (inactive)';
COMMENT ON COLUMN user_engagement_states.last_activity_at IS 'Timestamp of last user activity (message, action). Used for 14-day inactivity detection.';
COMMENT ON COLUMN user_engagement_states.goodbye_sent_at IS 'When the goodbye/self-select message was sent. NULL if never sent.';
COMMENT ON COLUMN user_engagement_states.goodbye_expires_at IS 'When the 48h response window expires. NULL if not in goodbye_sent state.';
COMMENT ON COLUMN user_engagement_states.remind_at IS 'When to send reminder (for remind_later state). NULL otherwise.';

-- ============================================================================
-- TABLE: engagement_state_transitions
-- Purpose: Audit log of all state transitions for debugging and analytics
-- ============================================================================

CREATE TABLE IF NOT EXISTS engagement_state_transitions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  from_state TEXT NOT NULL,
  to_state TEXT NOT NULL,
  trigger TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for querying transition history
CREATE INDEX IF NOT EXISTS idx_transitions_user ON engagement_state_transitions(user_id);
CREATE INDEX IF NOT EXISTS idx_transitions_created ON engagement_state_transitions(created_at);

-- Comments for documentation
COMMENT ON TABLE engagement_state_transitions IS 'Audit log of engagement state transitions. Each row represents one state change.';
COMMENT ON COLUMN engagement_state_transitions.from_state IS 'State before transition';
COMMENT ON COLUMN engagement_state_transitions.to_state IS 'State after transition';
COMMENT ON COLUMN engagement_state_transitions.trigger IS 'What caused the transition: user_message, inactivity_14d, goodbye_response_1/2/3, goodbye_timeout, reminder_due';
COMMENT ON COLUMN engagement_state_transitions.metadata IS 'Additional context about the transition (message content, user response option, etc.)';

-- ============================================================================
-- TABLE: engagement_message_queue
-- Purpose: Queue for proactive messages with idempotency, retry logic, and audit trail
-- ============================================================================

CREATE TABLE IF NOT EXISTS engagement_message_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message_type TEXT NOT NULL
    CHECK (message_type IN ('welcome', 'tier_unlock', 'goodbye', 'weekly_review', 'reminder', 'help_restart')),
  message_key TEXT NOT NULL,
  message_params JSONB,
  destination TEXT NOT NULL CHECK (destination IN ('individual', 'group')),
  destination_jid TEXT NOT NULL,
  scheduled_for TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
  retry_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for scheduler queries (only pending messages)
CREATE INDEX IF NOT EXISTS idx_queue_status ON engagement_message_queue(status)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_queue_scheduled ON engagement_message_queue(scheduled_for)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_queue_user ON engagement_message_queue(user_id);

-- Comments for documentation
COMMENT ON TABLE engagement_message_queue IS 'Queue for proactive engagement messages. Supports idempotency, retry logic, and delivery tracking.';
COMMENT ON COLUMN engagement_message_queue.message_type IS 'Type of message: welcome, tier_unlock, goodbye, weekly_review, reminder, help_restart';
COMMENT ON COLUMN engagement_message_queue.message_key IS 'Localization key for the message template';
COMMENT ON COLUMN engagement_message_queue.message_params IS 'Parameters to interpolate into the message template';
COMMENT ON COLUMN engagement_message_queue.destination IS 'Where to send: individual (DM) or group';
COMMENT ON COLUMN engagement_message_queue.destination_jid IS 'WhatsApp JID to send the message to';
COMMENT ON COLUMN engagement_message_queue.scheduled_for IS 'When to send the message (supports delayed delivery)';
COMMENT ON COLUMN engagement_message_queue.sent_at IS 'When the message was actually sent. NULL if not sent yet.';
COMMENT ON COLUMN engagement_message_queue.status IS 'Delivery status: pending, sent, failed, cancelled';
COMMENT ON COLUMN engagement_message_queue.retry_count IS 'Number of delivery attempts. Max 3 before marking failed.';
COMMENT ON COLUMN engagement_message_queue.error_message IS 'Error details if delivery failed';
COMMENT ON COLUMN engagement_message_queue.idempotency_key IS 'Unique key to prevent duplicate messages. Format: {userId}:{eventType}:{YYYY-MM-DD}';

-- ============================================================================
-- TABLE EXTENSIONS: user_profiles
-- Purpose: Add engagement-related columns to existing user_profiles table
-- ============================================================================

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS preferred_destination TEXT DEFAULT 'individual'
    CHECK (preferred_destination IN ('individual', 'group')),
  ADD COLUMN IF NOT EXISTS reengagement_opt_out BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS onboarding_tier INTEGER DEFAULT 0
    CHECK (onboarding_tier >= 0 AND onboarding_tier <= 3),
  ADD COLUMN IF NOT EXISTS onboarding_tier_progress JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS magic_moment_at TIMESTAMPTZ;

-- Comments for new columns
COMMENT ON COLUMN user_profiles.preferred_destination IS 'Where to send proactive messages: individual (DM) or group. Auto-detected from first message location.';
COMMENT ON COLUMN user_profiles.reengagement_opt_out IS 'If true, user has opted out of re-engagement messages (goodbye, weekly review). Onboarding tips still allowed.';
COMMENT ON COLUMN user_profiles.onboarding_tier IS 'Current onboarding tier progress (0=new, 1=basics, 2=power, 3=complete). No hard gating.';
COMMENT ON COLUMN user_profiles.onboarding_tier_progress IS 'JSON tracking which actions completed per tier. Schema: {tier1: {add_expense: true, ...}, ...}';
COMMENT ON COLUMN user_profiles.magic_moment_at IS 'Timestamp when user experienced magic moment (first successful expense add). NULL if not yet.';

-- ============================================================================
-- ROW LEVEL SECURITY: user_engagement_states
-- ============================================================================

ALTER TABLE user_engagement_states ENABLE ROW LEVEL SECURITY;

-- Users can view their own engagement state
CREATE POLICY "Users can view own engagement state" ON user_engagement_states
  FOR SELECT USING (auth.uid() = user_id);

-- Service role can manage all engagement states (for scheduler operations)
CREATE POLICY "Service role manages engagement states" ON user_engagement_states
  FOR ALL USING (auth.jwt()->>'role' = 'service_role');

-- ============================================================================
-- ROW LEVEL SECURITY: engagement_state_transitions
-- ============================================================================

ALTER TABLE engagement_state_transitions ENABLE ROW LEVEL SECURITY;

-- Users can view their own transitions (read-only audit access)
CREATE POLICY "Users can view own transitions" ON engagement_state_transitions
  FOR SELECT USING (auth.uid() = user_id);

-- Service role can manage all transitions
CREATE POLICY "Service role manages transitions" ON engagement_state_transitions
  FOR ALL USING (auth.jwt()->>'role' = 'service_role');

-- ============================================================================
-- ROW LEVEL SECURITY: engagement_message_queue
-- Service role only - users should not have direct access to the queue
-- ============================================================================

ALTER TABLE engagement_message_queue ENABLE ROW LEVEL SECURITY;

-- Service role can manage all queue entries
CREATE POLICY "Service role manages message queue" ON engagement_message_queue
  FOR ALL USING (auth.jwt()->>'role' = 'service_role');

-- ============================================================================
-- TRIGGER: Auto-update updated_at on user_engagement_states
-- Reuses existing update_updated_at_column() function from 005_user_profiles_and_permissions.sql
-- ============================================================================

CREATE TRIGGER update_engagement_states_updated_at
  BEFORE UPDATE ON user_engagement_states
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- GRANTS: Ensure service role has execute permissions
-- ============================================================================

-- Service role already has full access via RLS policies
-- No additional grants needed for table operations

-- ============================================================================
-- VERIFICATION QUERIES (commented out, for manual testing)
-- ============================================================================

-- Verify tables created:
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'engagement%' OR table_name = 'user_engagement_states';

-- Verify indexes:
-- SELECT indexname, indexdef FROM pg_indexes WHERE tablename IN ('user_engagement_states', 'engagement_state_transitions', 'engagement_message_queue');

-- Verify RLS enabled:
-- SELECT tablename, rowsecurity FROM pg_tables WHERE tablename IN ('user_engagement_states', 'engagement_state_transitions', 'engagement_message_queue');

-- Verify user_profiles columns added:
-- SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_name = 'user_profiles' AND column_name IN ('preferred_destination', 'reengagement_opt_out', 'onboarding_tier', 'onboarding_tier_progress', 'magic_moment_at');
