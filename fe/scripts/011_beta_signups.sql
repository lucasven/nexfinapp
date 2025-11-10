-- Create beta_signups table for landing page waitlist
CREATE TABLE IF NOT EXISTS beta_signups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  approved_at TIMESTAMP WITH TIME ZONE
);

-- Create index on email for faster lookups
CREATE INDEX IF NOT EXISTS idx_beta_signups_email ON beta_signups(email);

-- Create index on status for filtering
CREATE INDEX IF NOT EXISTS idx_beta_signups_status ON beta_signups(status);

-- Create index on created_at for sorting
CREATE INDEX IF NOT EXISTS idx_beta_signups_created_at ON beta_signups(created_at DESC);

-- Enable Row Level Security
ALTER TABLE beta_signups ENABLE ROW LEVEL SECURITY;

-- Allow inserts from anyone (for public landing page)
CREATE POLICY "Allow public inserts" ON beta_signups
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Only authenticated users can read (for admin dashboard in future)
CREATE POLICY "Allow authenticated reads" ON beta_signups
  FOR SELECT
  TO authenticated
  USING (true);

-- Only authenticated users can update (for admin approval)
CREATE POLICY "Allow authenticated updates" ON beta_signups
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);
