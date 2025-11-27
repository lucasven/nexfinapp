import { getTestSupabaseClient } from './src/__tests__/utils/test-database.js'

async function checkDatabase() {
  const supabase = getTestSupabaseClient()

  // Check for opted-out users
  const { data: optedOut } = await supabase
    .from('user_profiles')
    .select('user_id, reengagement_opt_out')
    .eq('reengagement_opt_out', true)

  console.log('=== OPTED-OUT USERS ===')
  console.log('Count:', optedOut?.length || 0)
  if (optedOut && optedOut.length > 0) {
    console.log('Users:', optedOut)
  }

  // Check for all user profiles
  const { data: allProfiles } = await supabase
    .from('user_profiles')
    .select('user_id, reengagement_opt_out')

  console.log('\n=== ALL USER PROFILES ===')
  console.log('Total count:', allProfiles?.length || 0)

  // Check for engagement states
  const { data: states } = await supabase
    .from('user_engagement_states')
    .select('user_id, current_state')

  console.log('\n=== ENGAGEMENT STATES ===')
  console.log('Total count:', states?.length || 0)
}

checkDatabase().catch(console.error)
