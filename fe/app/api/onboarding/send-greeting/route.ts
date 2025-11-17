import { NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { trackServerEvent } from '@/lib/analytics/server-tracker'
import { AnalyticsEvent, AnalyticsProperty } from '@/lib/analytics/events'

export async function POST(request: Request) {
  try {
    const supabase = await getSupabaseServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { whatsappNumber, userName } = body

    if (!whatsappNumber) {
      return NextResponse.json(
        { error: 'WhatsApp number is required' },
        { status: 400 }
      )
    }

    // Check if greeting was already sent to this number
    const { data: existingNumber } = await supabase
      .from('authorized_whatsapp_numbers')
      .select('greeting_sent, greeting_message_id')
      .eq('whatsapp_number', whatsappNumber)
      .single()

    if (existingNumber?.greeting_sent) {
      // Greeting already sent, skip
      return NextResponse.json({
        success: true,
        message: 'Greeting already sent',
        greeting_message_id: existingNumber.greeting_message_id
      })
    }

    // Insert greeting message into queue for bot to process
    const { data: messageData, error: insertError } = await supabase
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
      console.error('Error creating onboarding message:', insertError)

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

    // Update authorized_whatsapp_numbers to mark greeting as sent
    await supabase
      .from('authorized_whatsapp_numbers')
      .update({
        greeting_sent: true,
        greeting_message_id: messageData.id,
        updated_at: new Date().toISOString(),
      })
      .eq('whatsapp_number', whatsappNumber)

    // Update user profile to mark WhatsApp setup as completed (for onboarding)
    await supabase
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
