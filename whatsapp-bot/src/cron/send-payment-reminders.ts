#!/usr/bin/env tsx
/**
 * Payment Reminder Cron Job
 *
 * Runs daily to send WhatsApp reminders for:
 * 1. Payments due tomorrow
 * 2. Overdue payments (past due date)
 *
 * Schedule: 0 8 * * * (08:00 every day)
 */

import { createClient } from "@supabase/supabase-js"
import { sendMessage } from "../services/whatsapp/whatsapp-service.js"
import { getUserLocale } from "../services/user/user-service.js"
import { getLocalizedMessage } from "../localization/index.js"

const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing required environment variables: SUPABASE_URL or SUPABASE_SERVICE_KEY")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

interface RecurringPayment {
  id: string
  due_date: string
  user_id: string
  recurring_transaction: {
    amount: number
    type: "income" | "expense"
    description: string | null
    auto_pay: boolean
    category: {
      name: string
      icon: string
    }
  }
}

/**
 * Group payments by user
 */
function groupPaymentsByUser(payments: RecurringPayment[]): Map<string, RecurringPayment[]> {
  const grouped = new Map<string, RecurringPayment[]>()

  for (const payment of payments) {
    const userId = payment.user_id
    if (!grouped.has(userId)) {
      grouped.set(userId, [])
    }
    grouped.get(userId)!.push(payment)
  }

  return grouped
}

/**
 * Format payment info for message
 */
function formatPayment(payment: RecurringPayment, locale: string): string {
  const category = payment.recurring_transaction.category
  const amount = payment.recurring_transaction.amount.toFixed(2)
  const type = payment.recurring_transaction.type
  const typeEmoji = type === "expense" ? "💸" : "💰"

  return `${typeEmoji} ${category.icon} ${category.name}: R$ ${amount}${payment.recurring_transaction.description ? ` - ${payment.recurring_transaction.description}` : ""}`
}

/**
 * Send reminder to a user
 */
async function sendReminderToUser(
  userId: string,
  upcomingPayments: RecurringPayment[],
  overduePayments: RecurringPayment[]
) {
  try {
    // Get user's WhatsApp number
    const { data: userProfile } = await supabase
      .from("user_profiles")
      .select("whatsapp_number")
      .eq("user_id", userId)
      .single()

    if (!userProfile?.whatsapp_number) {
      console.log(`No WhatsApp number found for user ${userId}`)
      return false
    }

    const locale = await getUserLocale(userId)
    const messageParts: string[] = []

    // Add overdue payments
    if (overduePayments.length > 0) {
      messageParts.push("⚠️ *Pagamentos atrasados:*\n")
      for (const payment of overduePayments) {
        const daysPast = Math.floor(
          (new Date().getTime() - new Date(payment.due_date).getTime()) / (1000 * 60 * 60 * 24)
        )
        messageParts.push(
          `${formatPayment(payment, locale)} (${daysPast} ${daysPast === 1 ? "dia" : "dias"} atrasado)`
        )
      }
      messageParts.push("")
    }

    // Add upcoming payments
    if (upcomingPayments.length > 0) {
      messageParts.push("📅 *Pagamentos para amanhã:*\n")
      for (const payment of upcomingPayments) {
        messageParts.push(formatPayment(payment, locale))

        // Add note if auto-pay is enabled
        if (payment.recurring_transaction.auto_pay) {
          messageParts.push("  ↳ _Pagamento automático ativado_")
        }
      }
      messageParts.push("")
    }

    // Add action prompt
    if (overduePayments.length > 0 || upcomingPayments.length > 0) {
      messageParts.push(
        "\n💡 _Acesse /recorrentes para marcar como pago ou visite o painel web para gerenciar._"
      )
    }

    const message = messageParts.join("\n")

    await sendMessage(userProfile.whatsapp_number, message)
    console.log(
      `  ✓ Reminder sent to ${userProfile.whatsapp_number} (${upcomingPayments.length} upcoming, ${overduePayments.length} overdue)`
    )

    return true
  } catch (error) {
    console.error(`Error sending reminder to user ${userId}:`, error)
    return false
  }
}

/**
 * Main cron job function
 */
async function sendPaymentReminders() {
  console.log("⏰ Starting payment reminder job...")
  console.log(`📅 Run date: ${new Date().toISOString()}`)

  const today = new Date()
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  const todayStr = today.toISOString().split("T")[0]
  const tomorrowStr = tomorrow.toISOString().split("T")[0]

  try {
    // Find payments due tomorrow (not auto-pay)
    const { data: upcomingPayments, error: upcomingError } = await supabase
      .from("recurring_payments")
      .select(
        `
        id,
        due_date,
        user_id,
        recurring_transaction:recurring_transactions(
          amount,
          type,
          description,
          auto_pay,
          category:categories(
            name,
            icon
          )
        )
      `
      )
      .eq("due_date", tomorrowStr)
      .eq("is_paid", false)

    if (upcomingError) throw upcomingError

    // Find overdue payments (not auto-pay)
    const { data: overduePayments, error: overdueError } = await supabase
      .from("recurring_payments")
      .select(
        `
        id,
        due_date,
        user_id,
        recurring_transaction:recurring_transactions(
          amount,
          type,
          description,
          auto_pay,
          category:categories(
            name,
            icon
          )
        )
      `
      )
      .lt("due_date", todayStr)
      .eq("is_paid", false)

    if (overdueError) throw overdueError

    // Filter out auto-pay payments (they'll be handled automatically)
    const filteredUpcoming = (upcomingPayments as RecurringPayment[] || []).filter(
      (p) => !p.recurring_transaction?.auto_pay
    )
    const filteredOverdue = (overduePayments as RecurringPayment[] || []).filter(
      (p) => !p.recurring_transaction?.auto_pay
    )

    if (filteredUpcoming.length === 0 && filteredOverdue.length === 0) {
      console.log("✅ No reminders to send")
      return
    }

    console.log(`📊 Found ${filteredUpcoming.length} upcoming and ${filteredOverdue.length} overdue payments`)

    // Group by user
    const upcomingByUser = groupPaymentsByUser(filteredUpcoming)
    const overdueByUser = groupPaymentsByUser(filteredOverdue)

    // Get all unique users
    const allUsers = new Set([...upcomingByUser.keys(), ...overdueByUser.keys()])

    console.log(`👥 Sending reminders to ${allUsers.size} users...`)

    let successCount = 0
    let failCount = 0

    // Send reminders to each user
    for (const userId of allUsers) {
      const upcoming = upcomingByUser.get(userId) || []
      const overdue = overdueByUser.get(userId) || []

      const success = await sendReminderToUser(userId, upcoming, overdue)

      if (success) {
        successCount++
      } else {
        failCount++
      }
    }

    console.log(`\n✅ Reminder job complete!`)
    console.log(`📧 Sent: ${successCount} | Failed: ${failCount}`)
  } catch (error) {
    console.error("❌ Error sending payment reminders:", error)
    process.exit(1)
  }
}

// Run the cron job
sendPaymentReminders()
  .then(() => {
    console.log("\n🏁 Cron job completed successfully")
    process.exit(0)
  })
  .catch((error) => {
    console.error("\n❌ Cron job failed:", error)
    process.exit(1)
  })
