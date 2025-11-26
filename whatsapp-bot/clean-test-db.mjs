import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

// Load environment variables
dotenv.config()

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: Missing SUPABASE_URL or SUPABASE_SERVICE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

console.log('Cleaning test database...')

// Delete all test data in order to respect foreign key constraints
await supabase.from('engagement_state_transitions').delete().not('user_id', 'is', null)
console.log('✓ Deleted engagement_state_transitions')

await supabase.from('engagement_message_queue').delete().not('user_id', 'is', null)
console.log('✓ Deleted engagement_message_queue')

await supabase.from('user_engagement_states').delete().not('user_id', 'is', null)
console.log('✓ Deleted user_engagement_states')

await supabase.from('authorized_groups').delete().not('user_id', 'is', null)
console.log('✓ Deleted authorized_groups')

await supabase.from('authorized_whatsapp_numbers').delete().not('user_id', 'is', null)
console.log('✓ Deleted authorized_whatsapp_numbers')

await supabase.from('user_profiles').delete().not('user_id', 'is', null)
console.log('✓ Deleted user_profiles')

await supabase.from('users').delete().not('id', 'is', null)
console.log('✓ Deleted users')

console.log('\n✅ Test database cleaned!')
