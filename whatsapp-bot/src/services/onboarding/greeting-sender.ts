import type { WASocket } from '@whiskeysockets/baileys'
import { getSupabaseClient, withRetry } from '../database/supabase-client.js'
import { getUserLocale, getMessages } from '../../localization/i18n.js'

export interface OnboardingMessage {
  id: string
  user_id: string
  whatsapp_number: string
  user_name: string | null
  message_type: 'greeting' | 'reminder' | 'celebration'
  status: 'pending' | 'sent' | 'failed'
  sent_at: string | null
  error: string | null
  retry_count: number
  created_at: string
  updated_at: string
}

/**
 * Sends an onboarding greeting message to a new user
 * Now uses localized greeting messages based on user's preferred language
 */
export async function sendOnboardingGreeting(
  sock: WASocket,
  whatsappNumber: string,
  userName: string | null,
  userId: string
): Promise<void> {
  const jid = `${whatsappNumber}@s.whatsapp.net`

  // Get user's preferred locale
  const locale = await getUserLocale(userId)
  const messages = getMessages(locale)

  // Get the localized onboarding greeting
  const greeting = messages.onboardingGreeting(userName)

  await sock.sendMessage(jid, { text: greeting })
}

/**
 * Polls the database for pending onboarding messages and sends them
 */
export async function processOnboardingMessages(sock: WASocket | null): Promise<void> {
  if (!sock) {
    console.log('[Onboarding] No active WhatsApp connection')
    return
  }

  const supabase = getSupabaseClient()

  try {
    // Fetch pending messages with retry for transient network errors
    const { data: messages, error: fetchError } = await withRetry(
      async () =>
        supabase
          .from('onboarding_messages')
          .select('*')
          .eq('status', 'pending')
          .lt('retry_count', 3) // Max 3 retries
          .order('created_at', { ascending: true })
          .limit(10),
      { operationName: 'Onboarding fetch messages' }
    )

    if (fetchError) {
      console.error('[Onboarding] Error fetching messages:', fetchError)
      return
    }

    if (!messages || messages.length === 0) {
      return
    }

    console.log(`[Onboarding] Processing ${messages.length} pending messages`)

    for (const msg of messages) {
      try {
        // First, try to claim this message by updating status to 'processing'
        // This prevents another instance from picking it up
        const { data: claimedMsg, error: claimError } = await supabase
          .from('onboarding_messages')
          .update({
            status: 'processing',
            updated_at: new Date().toISOString(),
          })
          .eq('id', msg.id)
          .eq('status', 'pending') // Only update if still pending
          .select()
          .single()

        // If we couldn't claim it, skip (another instance is processing it)
        if (claimError || !claimedMsg) {
          console.log(`[Onboarding] Message ${msg.id} already being processed`)
          continue
        }

        if (msg.message_type === 'greeting') {
          await sendOnboardingGreeting(sock, msg.whatsapp_number, msg.user_name, msg.user_id)

          // Mark as sent
          await supabase
            .from('onboarding_messages')
            .update({
              status: 'sent',
              sent_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', msg.id)

          console.log(`[Onboarding] Greeting sent to ${msg.whatsapp_number} in user's preferred language`)
        }
      } catch (error: any) {
        console.error(`[Onboarding] Error sending message ${msg.id}:`, error)

        // Mark as failed and increment retry count
        await supabase
          .from('onboarding_messages')
          .update({
            status: msg.retry_count >= 2 ? 'failed' : 'pending',
            error: error.message || 'Unknown error',
            retry_count: msg.retry_count + 1,
            updated_at: new Date().toISOString(),
          })
          .eq('id', msg.id)
      }
    }
  } catch (error) {
    console.error('[Onboarding] Error in processOnboardingMessages:', error)
  }
}
