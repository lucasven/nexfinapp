import { createClient, SupabaseClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config()

let supabase: SupabaseClient | null = null

/**
 * Retry wrapper for transient network failures
 * Implements exponential backoff with jitter
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: { retries?: number; baseDelayMs?: number; operationName?: string } = {}
): Promise<T> {
  const { retries = 3, baseDelayMs = 1000, operationName = 'operation' } = options

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await fn()
    } catch (error: any) {
      const isLastAttempt = attempt === retries - 1
      const isTransientError = isTransientNetworkError(error)

      if (isLastAttempt || !isTransientError) {
        throw error
      }

      // Exponential backoff with jitter
      const delay = baseDelayMs * Math.pow(2, attempt) + Math.random() * 500
      console.warn(
        `[Retry] ${operationName} failed (attempt ${attempt + 1}/${retries}): ${error.message}. Retrying in ${Math.round(delay)}ms...`
      )
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }

  throw new Error(`${operationName} failed after ${retries} attempts`)
}

/**
 * Checks if an error is a transient network error that should be retried
 */
function isTransientNetworkError(error: any): boolean {
  const message = error?.message?.toLowerCase() || ''
  const code = error?.code?.toLowerCase() || ''

  const transientPatterns = [
    'network',
    'connection',
    'timeout',
    'econnreset',
    'econnrefused',
    'enotfound',
    'gateway',
    'socket',
    'etimedout',
    'epipe',
  ]

  return transientPatterns.some(pattern =>
    message.includes(pattern) || code.includes(pattern)
  )
}

export function getSupabaseClient(): SupabaseClient {
  if (!supabase) {
    const supabaseUrl = process.env.SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase configuration. Check SUPABASE_URL and SUPABASE_SERVICE_KEY.')
    }

    supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })
  }

  return supabase
}

export async function authenticateUser(email: string, password: string): Promise<{ userId: string; error?: string }> {
  const supabase = getSupabaseClient()
  
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  })

  if (error || !data.user) {
    return { userId: '', error: error?.message || 'Authentication failed' }
  }

  return { userId: data.user.id }
}

export async function createSession(whatsappNumber: string, userId: string): Promise<string | null> {
  const supabase = getSupabaseClient()
  const sessionToken = generateSessionToken()

  const { data, error } = await supabase
    .from('whatsapp_sessions')
    .upsert({
      whatsapp_number: whatsappNumber,
      user_id: userId,
      session_token: sessionToken,
      is_active: true,
      last_activity: new Date().toISOString(),
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hours
    }, {
      onConflict: 'whatsapp_number'
    })
    .select()
    .single()

  if (error) {
    console.error('Error creating session:', error)
    return null
  }

  return sessionToken
}

export async function getSession(whatsappNumber: string): Promise<any | null> {
  const supabase = getSupabaseClient()

  const { data, error } = await supabase
    .from('whatsapp_sessions')
    .select('*')
    .eq('whatsapp_number', whatsappNumber)
    .eq('is_active', true)
    .gt('expires_at', new Date().toISOString())
    .single()

  if (error || !data) {
    return null
  }

  return data
}

export async function updateSessionActivity(whatsappNumber: string): Promise<void> {
  const supabase = getSupabaseClient()

  await supabase
    .from('whatsapp_sessions')
    .update({
      last_activity: new Date().toISOString(),
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    })
    .eq('whatsapp_number', whatsappNumber)
}

export async function deleteSession(whatsappNumber: string): Promise<void> {
  const supabase = getSupabaseClient()

  await supabase
    .from('whatsapp_sessions')
    .update({ is_active: false })
    .eq('whatsapp_number', whatsappNumber)
}

function generateSessionToken(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36)
}

