import type { WASocket } from '@whiskeysockets/baileys'
import { getSupabaseClient } from '../database/supabase-client.js'

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
 */
export async function sendOnboardingGreeting(
  sock: WASocket,
  whatsappNumber: string,
  userName: string | null
): Promise<void> {
  const jid = `${whatsappNumber}@s.whatsapp.net`

  const greeting = `👋 Olá${userName ? ' ' + userName : ''}! Bem-vindo ao NexFinApp!

Eu sou seu assistente financeiro pelo WhatsApp. Vamos começar?

📋 *Primeiros Passos:*
1. Criar sua primeira categoria de despesa
2. Adicionar uma despesa
3. Configurar orçamentos

👥 *Se quiser usar em um grupo (para casais ou famílias)*
1. Crie um grupo com quem você deseja usar o bot
2. Clique no nome do grupo
3. Clique em Convidar via link do grupo
4. Clique em Enviar link via WhatsApp
5. Envie o link para o bot e ele entrará no grupo automaticamente

💬 *Como usar:*
Você pode me falar naturalmente! Por exemplo:
• "Gastei 50 reais em comida"
• "Adiciona despesa de 30 em transporte"
• "Mostrar minhas despesas"
• "Recebi salário de 3000"

📸 *Dica Especial:*
Você também pode me enviar fotos de SMS bancários que eu extraio os dados automaticamente usando OCR!

💰 *Recursos Avançados:*
• Configure orçamentos mensais para categorias
• Receba alertas quando estiver perto do limite
• Visualize relatórios detalhados das suas finanças

Digite "ajuda" a qualquer momento para ver tudo que posso fazer.

Vamos começar? 🚀`

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
    // Fetch pending messages
    const { data: messages, error: fetchError } = await supabase
      .from('onboarding_messages')
      .select('*')
      .eq('status', 'pending')
      .lt('retry_count', 3) // Max 3 retries
      .order('created_at', { ascending: true })
      .limit(10)

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
          await sendOnboardingGreeting(sock, msg.whatsapp_number, msg.user_name)

          // Mark as sent
          await supabase
            .from('onboarding_messages')
            .update({
              status: 'sent',
              sent_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', msg.id)

          console.log(`[Onboarding] Greeting sent to ${msg.whatsapp_number}`)
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
