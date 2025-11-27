import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.test' })

const client = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

async function verifySchema() {
  console.log('Checking user_engagement_states table...\n')
  
  // Try to query the table
  const { data, error } = await client
    .from('user_engagement_states')
    .select('*')
    .limit(1)
  
  if (error) {
    console.error('❌ Error:', error.message)
    console.error('\nPossible causes:')
    console.error('1. Table does not exist - need to run migration 034_engagement_system.sql')
    console.error('2. Wrong database credentials in .env.test')
    console.error('3. RLS policies blocking service role (unlikely)')
  } else {
    console.log('✅ Table exists and is accessible')
    console.log('Sample data:', data)
  }
  
  process.exit(0)
}

verifySchema()
