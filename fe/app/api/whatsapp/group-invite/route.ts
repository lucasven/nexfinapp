import { NextRequest, NextResponse } from "next/server"
import { getSupabaseServerClient } from "@/lib/supabase/server"

export async function POST(request: NextRequest) {
  try {
    const supabase = await getSupabaseServerClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Check if user has a primary WhatsApp number
    const { data: primaryNumber, error: primaryError } = await supabase
      .from("authorized_whatsapp_numbers")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_primary", true)
      .single()

    if (primaryError || !primaryNumber) {
      return NextResponse.json({ error: "No primary WhatsApp number found. Please add and set a primary number first." }, { status: 400 })
    }

    // Check if there's already an active invite
    const { data: existingInvite } = await supabase
      .from("whatsapp_group_invites")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    // If there's an existing active invite, return it
    if (existingInvite && existingInvite.invite_link) {
      return NextResponse.json({
        inviteLink: existingInvite.invite_link,
        invite_code: existingInvite.invite_code,
        qrCode: null, // QR code generation would be handled by the bot
      })
    }

    // For now, we'll store a request for the bot to process
    // The bot service should poll this table or we can add an HTTP endpoint to the bot later
    // For now, return a placeholder that indicates the invite is being generated
    // The actual implementation would require the bot service to expose an HTTP endpoint
    // or to process requests from a queue/table

    // Store the invite request (inactive until bot processes it)
    const { data: inviteRequest, error: inviteError } = await supabase
      .from("whatsapp_group_invites")
      .insert({
        user_id: user.id,
        is_active: false,
      })
      .select()
      .single()

    if (inviteError) {
      console.error("Error creating invite request:", inviteError)
      return NextResponse.json({ error: "Failed to create invite request" }, { status: 500 })
    }

    // Try to call the bot service if available
    // This would require the bot to expose an HTTP endpoint
    const botApiUrl = process.env.WHATSAPP_BOT_API_URL || "http://localhost:3001/api/generate-invite"

    try {
      const botResponse = await fetch(botApiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: user.id,
          whatsappNumber: primaryNumber.whatsapp_number,
          inviteId: inviteRequest.id,
        }),
      })

      if (botResponse.ok) {
        const botData = await botResponse.json()

        // Update the invite with the data from bot
        await supabase
          .from("whatsapp_group_invites")
          .update({
            group_jid: botData.groupJid,
            invite_code: botData.inviteCode,
            invite_link: botData.inviteLink,
            is_active: true,
          })
          .eq("id", inviteRequest.id)

        return NextResponse.json({
          inviteLink: botData.inviteLink,
          invite_code: botData.inviteCode,
          qrCode: botData.qrCode || null,
        })
      }
    } catch (botError) {
      console.error("Bot service not available:", botError)
      // If bot service is not available, return a message that it will be processed
      // In production, you might want to use a queue system
    }

    // Return a response indicating the request is being processed
    return NextResponse.json({
      message: "Invite generation request created. The bot will process this request shortly.",
      inviteLink: null,
      pending: true,
    })
  } catch (error: any) {
    console.error("Error in group invite generation:", error)
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 })
  }
}

