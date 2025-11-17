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

    // Optional: Check if user is admin (uncomment if needed)
    // const { data: profile } = await supabase
    //   .from('user_profiles')
    //   .select('is_admin')
    //   .eq('user_id', user.id)
    //   .single()
    //
    // if (!profile?.is_admin) {
    //   return NextResponse.json(
    //     { error: 'Admin access required' },
    //     { status: 403 }
    //   )
    // }

    // Get all WhatsApp numbers that haven't received greetings
    const { data: numbers, error: fetchError } = await supabase
      .from('authorized_whatsapp_numbers')
      .select('user_id, whatsapp_number, name')
      .or('greeting_sent.is.null,greeting_sent.is.false')

    if (fetchError) {
      console.error('Error fetching numbers:', fetchError)
      return NextResponse.json(
        { error: 'Failed to fetch WhatsApp numbers' },
        { status: 500 }
      )
    }

    if (!numbers || numbers.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No numbers need greetings',
        count: 0
      })
    }

    // Create greeting messages for each number
    const messages = numbers.map(num => ({
      user_id: num.user_id,
      whatsapp_number: num.whatsapp_number,
      user_name: num.name,
      message_type: 'greeting',
      status: 'pending',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }))

    // Insert all greeting messages into the queue
    const { data: insertedMessages, error: insertError } = await supabase
      .from('onboarding_messages')
      .insert(messages)
      .select()

    if (insertError) {
      console.error('Error creating greeting messages:', insertError)
      return NextResponse.json(
        { error: 'Failed to queue greeting messages' },
        { status: 500 }
      )
    }

    // Update all numbers to mark greetings as sent
    // Create a mapping of whatsapp_number to message_id
    const numberToMessageId: Record<string, string> = {}
    insertedMessages?.forEach(msg => {
      numberToMessageId[msg.whatsapp_number] = msg.id
    })

    // Update each number with its greeting_message_id
    const updatePromises = numbers.map(num =>
      supabase
        .from('authorized_whatsapp_numbers')
        .update({
          greeting_sent: true,
          greeting_message_id: numberToMessageId[num.whatsapp_number],
          updated_at: new Date().toISOString(),
        })
        .eq('whatsapp_number', num.whatsapp_number)
    )

    await Promise.all(updatePromises)

    // Track the batch operation
    await trackServerEvent(user.id, AnalyticsEvent.WHATSAPP_GREETING_SENT, {
      [AnalyticsProperty.WHATSAPP_SETUP_METHOD]: 'batch',
      batch_count: numbers.length,
    })

    return NextResponse.json({
      success: true,
      message: `Queued ${numbers.length} greeting messages`,
      count: numbers.length,
      numbers: numbers.map(n => n.whatsapp_number)
    })
  } catch (error) {
    console.error('Error in batch greeting send:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// GET endpoint to check how many numbers need greetings
export async function GET() {
  try {
    const supabase = await getSupabaseServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Count numbers that need greetings
    const { count, error: countError } = await supabase
      .from('authorized_whatsapp_numbers')
      .select('*', { count: 'exact', head: true })
      .or('greeting_sent.is.null,greeting_sent.is.false')

    if (countError) {
      console.error('Error counting numbers:', countError)
      return NextResponse.json(
        { error: 'Failed to count numbers' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      count: count || 0,
      message: `${count || 0} numbers need greetings`
    })
  } catch (error) {
    console.error('Error checking greeting status:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}