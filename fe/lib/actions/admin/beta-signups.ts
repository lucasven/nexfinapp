"use server"

import { getSupabaseServerClient, getSupabaseAdminClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { trackServerEvent } from "@/lib/analytics/server-tracker"
import { AnalyticsEvent } from "@/lib/analytics/events"
import { verifyAdmin } from "./auth"

/**
 * Get all beta signups
 */
export async function getAllBetaSignups() {
  await verifyAdmin()
  const supabase = await getSupabaseServerClient()

  const { data, error } = await supabase
    .from("beta_signups")
    .select("*")
    .order("created_at", { ascending: false })

  if (error) throw error

  return data || []
}

/**
 * Approve a beta signup and send invitation email
 */
export async function approveBetaSignup(email: string) {
  await verifyAdmin()
  const supabase = await getSupabaseServerClient()
  const adminClient = getSupabaseAdminClient()

  // Update status first
  const { error: updateError } = await supabase
    .from("beta_signups")
    .update({
      status: "approved",
      approved_at: new Date().toISOString(),
    })
    .eq("email", email)

  if (updateError) throw updateError

  // Send invitation email using Supabase Admin API (requires service role)
  const { error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
    email,
    {
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/signup`,
      data: {
        invited_by: "admin",
        invitation_date: new Date().toISOString(),
      }
    }
  )

  if (inviteError) {
    console.error("Failed to send invitation email:", inviteError)

    await supabase
      .from("beta_signups")
      .update({
        invitation_sent: false,
        invitation_error: inviteError.message
      })
      .eq("email", email)

    await trackServerEvent(email, AnalyticsEvent.ADMIN_BETA_INVITATION_FAILED, {
      error: inviteError.message,
    })
  } else {
    await supabase
      .from("beta_signups")
      .update({
        invitation_sent: true,
        invitation_sent_at: new Date().toISOString(),
        invitation_error: null
      })
      .eq("email", email)

    await trackServerEvent(email, AnalyticsEvent.ADMIN_BETA_INVITATION_SENT, {
      email,
    })
  }

  revalidatePath("/admin/beta-signups")
}

/**
 * Reject a beta signup
 */
export async function rejectBetaSignup(email: string) {
  await verifyAdmin()
  const supabase = await getSupabaseServerClient()

  const { error } = await supabase
    .from("beta_signups")
    .update({
      status: "rejected",
    })
    .eq("email", email)

  if (error) throw error

  revalidatePath("/admin/beta-signups")
}

/**
 * Resend beta invitation email
 */
export async function resendBetaInvitation(email: string) {
  await verifyAdmin()
  const supabase = await getSupabaseServerClient()
  const adminClient = getSupabaseAdminClient()

  // Check if auth user already exists
  let existingUser = null
  let page = 1
  const perPage = 1000

  try {
    while (true) {
      const { data: usersData, error: listError } = await adminClient.auth.admin.listUsers({
        page,
        perPage,
      })

      if (listError) {
        console.error("Failed to list users:", listError)
        break
      }

      const found = usersData?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase())
      if (found) {
        existingUser = found
        break
      }

      if (!usersData?.users || usersData.users.length < perPage) {
        break
      }

      page++
    }
  } catch (error) {
    console.error("Error checking for existing user:", error)
  }

  console.log(`Checking for existing user: ${email}`, {
    found: !!existingUser,
    emailConfirmed: existingUser?.email_confirmed_at,
    userId: existingUser?.id
  })

  if (existingUser) {
    if (existingUser.email_confirmed_at) {
      console.log(`User ${email} has confirmed email, generating recovery link instead of invite`)

      const { error: resetError } = await adminClient.auth.resetPasswordForEmail(email, {
        redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/reset-password`,
      })

      if (resetError) {
        console.error("Failed to send password reset email:", resetError)
        await supabase
          .from("beta_signups")
          .update({
            invitation_sent: false,
            invitation_error: `Failed to send recovery email: ${resetError.message}`
          })
          .eq("email", email)
        throw resetError
      }

      console.log(`Recovery email sent successfully to ${email}`)

      await supabase
        .from("beta_signups")
        .update({
          invitation_sent: true,
          invitation_sent_at: new Date().toISOString(),
          invitation_error: null
        })
        .eq("email", email)

      await trackServerEvent(email, AnalyticsEvent.ADMIN_BETA_INVITATION_RESENT, {
        email,
        type: "recovery_email",
      })

      revalidatePath("/admin/beta-signups")
      return { type: "recovery" }
    } else {
      console.log(`Deleting unconfirmed auth user for ${email} (id: ${existingUser.id}) before reinviting`)

      const { error: deleteError } = await adminClient.auth.admin.deleteUser(existingUser.id)
      if (deleteError) {
        console.error("Failed to delete existing unconfirmed user:", deleteError)

        await supabase
          .from("beta_signups")
          .update({
            invitation_sent: false,
            invitation_error: `User exists but could not delete: ${deleteError.message}`
          })
          .eq("email", email)

        throw new Error(`User exists but could not delete before reinviting: ${deleteError.message}`)
      }
    }
  }

  const { error } = await adminClient.auth.admin.inviteUserByEmail(
    email,
    {
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/signup`,
      data: {
        invited_by: "admin",
        invitation_date: new Date().toISOString(),
        resent: true,
      }
    }
  )

  if (error) {
    console.error("Failed to resend invitation email:", error)

    await supabase
      .from("beta_signups")
      .update({
        invitation_sent: false,
        invitation_error: error.message
      })
      .eq("email", email)

    await trackServerEvent(email, AnalyticsEvent.ADMIN_BETA_INVITATION_FAILED, {
      error: error.message,
      is_resend: true,
    })

    throw error
  }

  await supabase
    .from("beta_signups")
    .update({
      invitation_sent: true,
      invitation_sent_at: new Date().toISOString(),
      invitation_error: null
    })
    .eq("email", email)

  await trackServerEvent(email, AnalyticsEvent.ADMIN_BETA_INVITATION_RESENT, {
    email,
  })

  revalidatePath("/admin/beta-signups")
}
