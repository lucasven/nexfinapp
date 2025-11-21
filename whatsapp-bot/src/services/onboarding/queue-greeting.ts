import { getSupabaseClient } from '../database/supabase-client.js'
import type { UserIdentifiers } from '../../utils/user-identifiers.js'

/**
 * Queue a greeting message for a new user
 * This will be picked up by the greeting-sender service that polls every 30 seconds
 *
 * @param userId - The user's UUID
 * @param identifiers - WhatsApp identifiers (JID, LID, phone number)
 * @returns Promise<boolean> - true if greeting was queued successfully
 */
export async function queueGreetingForNewUser(
  userId: string,
  identifiers: UserIdentifiers
): Promise<boolean> {
  try {
    const supabase = getSupabaseClient()

    console.log('[QueueGreeting] Checking if user needs greeting...', userId)

    // Check if greeting was already sent
    const { data: existingGreeting, error: checkError } = await supabase
      .from('onboarding_messages')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle()

    if (checkError) {
      console.error('[QueueGreeting] Error checking existing greeting:', checkError)
      return false
    }

    if (existingGreeting) {
      console.log('[QueueGreeting] Greeting already queued/sent for user', userId)
      return false
    }

    // Use phone number if available, otherwise use JID as fallback
    const whatsappNumber = identifiers.phoneNumber || identifiers.jid

    // Queue the greeting message
    const { error: insertError } = await supabase
      .from('onboarding_messages')
      .insert({
        user_id: userId,
        whatsapp_number: whatsappNumber,
        message_type: 'greeting',
        status: 'pending',
        retry_count: 0
      })

    if (insertError) {
      console.error('[QueueGreeting] Error queuing greeting:', insertError)
      return false
    }

    console.log('[QueueGreeting] ✅ Greeting queued successfully for user', userId)

    // Update user profile to mark WhatsApp setup as completed
    const { error: profileError } = await supabase
      .from('user_profiles')
      .update({
        whatsapp_setup_completed: true,
        onboarding_step: 'whatsapp_setup'
      })
      .eq('user_id', userId)

    if (profileError) {
      console.error('[QueueGreeting] Error updating profile (non-critical):', profileError)
    }

    return true
  } catch (error) {
    console.error('[QueueGreeting] Unexpected error queuing greeting:', error)
    return false
  }
}

/**
 * Check if a user should receive a greeting
 * Returns true if the user exists but hasn't received a greeting yet
 */
export async function shouldReceiveGreeting(userId: string): Promise<boolean> {
  try {
    const supabase = getSupabaseClient()

    // Check if greeting was already sent
    const { data: existingGreeting, error } = await supabase
      .from('onboarding_messages')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle()

    if (error) {
      console.error('[ShouldReceiveGreeting] Error checking greeting:', error)
      return false
    }

    // If no greeting exists, user should receive one
    return !existingGreeting
  } catch (error) {
    console.error('[ShouldReceiveGreeting] Unexpected error:', error)
    return false
  }
}
