/**
 * Test Database Client
 *
 * Provides real Supabase client for integration tests.
 * Uses separate test database to avoid polluting production data.
 *
 * @module test-database
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'

let testClient: SupabaseClient | null = null

/**
 * Get or create the test Supabase client
 *
 * This client connects to your test database configured in .env.test
 *
 * @returns Supabase client for test database
 */
export function getTestSupabaseClient(): SupabaseClient {
  if (!testClient) {
    const supabaseUrl = process.env.SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY

    if (!supabaseUrl || !supabaseKey) {
      throw new Error(
        'Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in test environment. ' +
        'Please configure .env.test with your test database credentials.'
      )
    }

    testClient = createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      },
      db: {
        schema: 'public'
      },
      global: {
        headers: {
          // Ensure service role bypasses RLS
          apikey: supabaseKey
        }
      }
    })
  }

  return testClient
}

/**
 * Verify test database connection
 *
 * Call this in test setup to ensure database is accessible
 */
export async function verifyTestDatabaseConnection(): Promise<void> {
  const client = getTestSupabaseClient()

  // Simple query to verify connection
  const { error } = await client
    .from('users')
    .select('id')
    .limit(1)

  if (error && error.code !== 'PGRST116') { // PGRST116 = no rows, which is fine
    throw new Error(`Test database connection failed: ${error.message}`)
  }
}

/**
 * Create a test user in auth.users table using raw SQL
 *
 * This is required because user_engagement_states has a foreign key to auth.users.
 * We use raw SQL to insert with a specific UUID (Auth API doesn't support this).
 *
 * @param userId - UUID for the test user (must match the user_id in engagement state)
 * @returns Promise that resolves when user is created
 */
export async function createTestUser(userId: string): Promise<void> {
  const client = getTestSupabaseClient()

  // Use RPC to execute raw SQL insert with specific UUID
  // This bypasses the Auth API and inserts directly into auth.users
  const { error } = await client.rpc('create_test_user_with_id', {
    user_id: userId,
    user_email: `test-${userId.substring(0, 8)}@example.com`
  })

  if (error) {
    // If error is about duplicate key or user exists, that's fine
    if (error.message.includes('duplicate') || error.message.includes('already exists')) {
      return
    }

    // If function doesn't exist, fall back to direct table insert
    if (error.message.includes('function') && error.message.includes('does not exist')) {
      // Fallback: Insert directly into users table (bypasses auth schema)
      // Note: This approach is for test purposes only
      const { error: insertError } = await client
        .from('users')  // Your application's users table
        .insert({
          id: userId,
          email: `test-${userId.substring(0, 8)}@example.com`,
          created_at: new Date().toISOString()
        })
        .select()
        .single()

      if (insertError && !insertError.message.includes('duplicate')) {
        throw new Error(`Failed to create test user: ${insertError.message}`)
      }
      return
    }

    throw new Error(`Failed to create test user: ${error.message}`)
  }
}

/**
 * Clean up test database after tests
 *
 * WARNING: This deletes data! Only use with test database.
 */
export async function cleanupTestDatabase(userIds: string[]): Promise<void> {
  if (userIds.length === 0) return

  const client = getTestSupabaseClient()

  // Clean up in order to respect foreign key constraints
  await client.from('engagement_state_transitions').delete().in('user_id', userIds)
  await client.from('engagement_message_queue').delete().in('user_id', userIds)
  await client.from('user_engagement_states').delete().in('user_id', userIds)

  // Clean up test users from auth.users
  for (const userId of userIds) {
    await client.auth.admin.deleteUser(userId)
  }
}
