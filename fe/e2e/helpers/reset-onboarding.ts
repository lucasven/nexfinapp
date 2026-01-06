/**
 * Helper script to reset onboarding status for the fresh test user.
 * Run this before onboarding E2E tests to ensure a clean state.
 *
 * Usage: npx ts-node e2e/helpers/reset-onboarding.ts
 *
 * This script:
 * 1. Connects to local Supabase database
 * 2. Resets onboarding_completed, onboarding_step, and related flags
 * 3. Outputs the current state after reset
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321'
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

const FRESH_USER_ID = '00000000-0000-0000-0000-000000000002'

async function resetOnboarding() {
  console.log('Connecting to Supabase...')

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  console.log(`Resetting onboarding for user: ${FRESH_USER_ID}`)

  const { data, error } = await supabase
    .from('user_profiles')
    .update({
      onboarding_completed: false,
      onboarding_step: null,
      whatsapp_setup_completed: false,
      first_category_added: false,
      first_expense_added: false,
    })
    .eq('user_id', FRESH_USER_ID)
    .select('user_id, onboarding_completed, onboarding_step, whatsapp_setup_completed')
    .single()

  if (error) {
    console.error('Error resetting onboarding:', error.message)
    process.exit(1)
  }

  console.log('Onboarding reset successfully!')
  console.log('Current state:', data)
}

resetOnboarding().catch(console.error)
