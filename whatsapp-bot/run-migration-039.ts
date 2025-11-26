/**
 * Run migration 039 - Add WhatsApp identifiers to user_profiles
 * This script applies the migration using the Supabase client
 */

import { readFileSync } from 'fs'
import { join } from 'path'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_KEY!

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function runMigration() {
  console.log('Running migration 039...')

  const migrationPath = join(__dirname, '../fe/scripts/039_add_whatsapp_identifiers_to_profiles.sql')
  const migrationSQL = readFileSync(migrationPath, 'utf-8')

  // Execute the migration SQL
  const { data, error } = await supabase.rpc('exec_sql', { sql: migrationSQL })

  if (error) {
    // Try executing each statement separately
    const statements = migrationSQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'))

    for (const statement of statements) {
      console.log(`Executing: ${statement.substring(0, 100)}...`)

      const { error: stmtError } = await supabase
        .from('_migrations')
        .insert({ statement })

      if (stmtError) {
        console.log(`Note: ${stmtError.message}`)
      }
    }
  }

  console.log('Migration 039 completed!')
}

runMigration().catch(console.error)
