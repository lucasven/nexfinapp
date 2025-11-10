-- Migration: Beta Invitation Tracking
-- Description: Add invitation tracking columns to beta_signups table
-- Date: 2025-11-10

-- Add invitation tracking columns to beta_signups
ALTER TABLE beta_signups 
ADD COLUMN IF NOT EXISTS invitation_sent BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS invitation_sent_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS invitation_error TEXT;

-- Create index for invitation tracking
CREATE INDEX IF NOT EXISTS idx_beta_signups_invitation_sent 
ON beta_signups(invitation_sent, status);

-- Add comment for documentation
COMMENT ON COLUMN beta_signups.invitation_sent IS 'Whether invitation email was successfully sent';
COMMENT ON COLUMN beta_signups.invitation_sent_at IS 'Timestamp when invitation was sent';
COMMENT ON COLUMN beta_signups.invitation_error IS 'Error message if invitation failed to send';

