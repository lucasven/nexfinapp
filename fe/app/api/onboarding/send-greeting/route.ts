import { NextResponse } from 'next/server'
import { getSupabaseServerClient, getSupabaseAdminClient } from '@/lib/supabase/server'
import { trackServerEvent } from '@/lib/analytics/server-tracker'
import { AnalyticsEvent, AnalyticsProperty } from '@/lib/analytics/events'

export async function POST(request: Request) {
  try {
    // Use regular client to authenticate user
    const supabase = await getSupabaseServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    console.log('[SendGreeting] API called, user:', user?.id)

    if (authError || !user) {
      console.log('[SendGreeting] Unauthorized - no user')
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { whatsappNumber, userName } = body

    console.log('[SendGreeting] Request body:', { whatsappNumber, userName })

    if (!whatsappNumber) {
      return NextResponse.json(
        { error: 'WhatsApp number is required' },
        { status: 400 }
      )
    }

    // Use admin client for database operations to bypass RLS
    // This is safe because we've already authenticated the user above
    const adminClient = getSupabaseAdminClient()

    // Check if greeting was already sent to this number
    const { data: existingNumber, error: checkError } = await adminClient
      .from('authorized_whatsapp_numbers')
      .select('greeting_sent, greeting_message_id')
      .eq('whatsapp_number', whatsappNumber)
      .single()

    console.log('[SendGreeting] Existing number check:', { existingNumber, checkError })

    if (existingNumber?.greeting_sent) {
      // Check if the message is actually sent or still pending
      const { data: messageStatus } = await adminClient
        .from('onboarding_messages')
        .select('status')
        .eq('id', existingNumber.greeting_message_id)
        .single()

      console.log('[SendGreeting] Previous message status:', messageStatus?.status)

      // If message is still pending, don't skip - let it be sent
      if (messageStatus?.status === 'pending') {
        console.log('[SendGreeting] Message is still pending, returning info to user')
        return NextResponse.json({
          success: true,
          message: 'Greeting queued and waiting to be sent',
          greeting_message_id: existingNumber.greeting_message_id,
          status: 'pending'
        })
      }

      // Greeting actually sent, skip
      console.log('[SendGreeting] Greeting already sent, skipping')
      return NextResponse.json({
        success: true,
        message: 'Greeting already sent',
        greeting_message_id: existingNumber.greeting_message_id,
        status: 'sent'
      })
    }

    // Insert greeting message into queue for bot to process
    console.log('[SendGreeting] Inserting new greeting message...')
    const { data: messageData, error: insertError } = await adminClient
      .from('onboarding_messages')
      .insert({
        user_id: user.id,
        whatsapp_number: whatsappNumber,
        user_name: userName || user.user_metadata?.display_name,
        message_type: 'greeting',
        status: 'pending',
      })
      .select()
      .single()

    if (insertError) {
      console.error('[SendGreeting] Error creating onboarding message:', insertError)

      // Track failure
      await trackServerEvent(user.id, AnalyticsEvent.WHATSAPP_GREETING_FAILED, {
        [AnalyticsProperty.WHATSAPP_NUMBER]: whatsappNumber,
        [AnalyticsProperty.ERROR_MESSAGE]: insertError.message,
      })

      return NextResponse.json(
        { error: 'Failed to queue greeting message' },
        { status: 500 }
      )
    }

    console.log('[SendGreeting] ✅ Message queued successfully:', messageData.id)

    // Update authorized_whatsapp_numbers to mark greeting as queued (not yet sent)
    await adminClient
      .from('authorized_whatsapp_numbers')
      .update({
        greeting_sent: true,
        greeting_message_id: messageData.id,
        updated_at: new Date().toISOString(),
      })
      .eq('whatsapp_number', whatsappNumber)

    // Update user profile to mark WhatsApp setup as completed (for onboarding)
    await adminClient
      .from('user_profiles')
      .update({
        whatsapp_setup_completed: true,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id)

    // Track success (message queued)
    await trackServerEvent(user.id, AnalyticsEvent.WHATSAPP_GREETING_SENT, {
      [AnalyticsProperty.WHATSAPP_NUMBER]: whatsappNumber,
      [AnalyticsProperty.WHATSAPP_SETUP_METHOD]: 'web',
    })

    return NextResponse.json({ success: true, message: messageData })
  } catch (error) {
    console.error('Error sending greeting:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
