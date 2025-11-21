#!/usr/bin/env tsx
/**
 * Auto-Pay Execution Cron Job
 *
 * Runs daily to automatically create transactions for recurring payments
 * that are due today and have auto_pay enabled.
 *
 * Also sends WhatsApp notifications to users about the auto-created expenses.
 *
 * Schedule: 0 6 * * * (06:00 every day)
 */

import { createClient } from "@supabase/supabase-js"
import { sendMessage } from "../services/whatsapp/whatsapp-service.js"
import { getUserLocale } from "../services/user/user-service.js"

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
    id: string
    user_id: string
    amount: number
    type: "income" | "expense"
    category_id: string
    description: string | null
    payment_method: string | null
    auto_pay: boolean
    category: {
      name: string
      icon: string
    }
  }
}

/**
 * Create a transaction from a recurring payment
 */
async function createTransactionFromPayment(payment: RecurringPayment) {
  try {
    // Generate user-readable ID
    const { data: readableIdData, error: idError } = await supabase.rpc("generate_transaction_id")

    if (idError) {
      throw idError
    }

    // Create the transaction
    const { data: transaction, error: transactionError } = await supabase
      .from("transactions")
      .insert({
        user_id: payment.user_id,
        amount: payment.recurring_transaction.amount,
        type: payment.recurring_transaction.type,
        category_id: payment.recurring_transaction.category_id,
        description: payment.recurring_transaction.description,
        payment_method: payment.recurring_transaction.payment_method,
        date: payment.due_date,
        user_readable_id: readableIdData,
      })
      .select()
      .single()

    if (transactionError) {
      throw transactionError
    }

    // Update the recurring payment as paid
    const { error: updateError } = await supabase
      .from("recurring_payments")
      .update({
        is_paid: true,
        paid_date: new Date().toISOString().split("T")[0],
        transaction_id: transaction.id,
      })
      .eq("id", payment.id)

    if (updateError) {
      throw updateError
    }

    return transaction
  } catch (error) {
    console.error(`Error creating transaction for payment ${payment.id}:`, error)
    throw error
  }
}

/**
 * Send WhatsApp notification about auto-created expense
 */
async function sendAutoPayNotification(
  userId: string,
  payment: RecurringPayment,
  transactionId: string
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
      return
    }

    const locale = await getUserLocale(userId)
    const category = payment.recurring_transaction.category
    const amount = payment.recurring_transaction.amount.toFixed(2)
    const type = payment.recurring_transaction.type

    // Get localized messages
    const messages = await import(`../localization/${locale}.js`)

    // Build notification message using localized function
    const message = messages.messages.recurringAutoPayNotification({
      type: type === "expense" ? "💸" : "💰",
      typeLabel: type === "expense" ? (locale === "pt-br" ? "Despesa" : "Expense") : (locale === "pt-br" ? "Receita" : "Income"),
      amount: `R$ ${amount}`,
      category: `${category.icon} ${category.name}`,
      description: payment.recurring_transaction.description || "",
      date: payment.due_date,
      transactionId: transactionId,
    })

    await sendMessage(userProfile.whatsapp_number, message)
    console.log(`  ✓ Notification sent to ${userProfile.whatsapp_number}`)
  } catch (error) {
    console.error(`Error sending notification to user ${userId}:`, error)
    // Don't throw - notification failure shouldn't stop the cron job
  }
}

/**
 * Main cron job function
 */
async function executeAutoPayments() {
  console.log("💳 Starting auto-pay execution...")
  console.log(`📅 Run date: ${new Date().toISOString()}`)

  const today = new Date().toISOString().split("T")[0]

  try {
    // Find all recurring payments due today with auto_pay enabled
    const { data: payments, error } = await supabase
      .from("recurring_payments")
      .select(
        `
        id,
        due_date,
        user_id,
        recurring_transaction:recurring_transactions(
          id,
          user_id,
          amount,
          type,
          category_id,
          description,
          payment_method,
          auto_pay,
          category:categories(
            name,
            icon
          )
        )
      `
      )
      .eq("due_date", today)
      .eq("is_paid", false)

    if (error) {
      throw error
    }

    if (!payments || payments.length === 0) {
      console.log("✅ No payments due today")
      return
    }

    // Filter for auto_pay enabled
    const autoPayPayments = (payments as RecurringPayment[]).filter(
      (p) => p.recurring_transaction?.auto_pay === true
    )

    if (autoPayPayments.length === 0) {
      console.log(`📊 ${payments.length} payments due today, but none have auto_pay enabled`)
      return
    }

    console.log(`📊 Processing ${autoPayPayments.length} auto-pay payments...`)

    let successCount = 0
    let failCount = 0
    const results: { [userId: string]: number } = {}

    // Process each payment
    for (const payment of autoPayPayments) {
      try {
        const transaction = await createTransactionFromPayment(payment)

        // Send WhatsApp notification
        await sendAutoPayNotification(payment.user_id, payment, transaction.user_readable_id)

        successCount++
        results[payment.user_id] = (results[payment.user_id] || 0) + 1

        console.log(
          `  ✓ Created transaction ${transaction.user_readable_id} for user ${payment.user_id} (${payment.recurring_transaction.category.name})`
        )
      } catch (error) {
        failCount++
        console.error(`  ✗ Failed to process payment ${payment.id}:`, error)
      }
    }

    console.log(`\n✅ Auto-pay execution complete!`)
    console.log(`📈 Success: ${successCount} | Failed: ${failCount}`)
    console.log(`👥 Users affected: ${Object.keys(results).length}`)

    if (Object.keys(results).length > 0) {
      console.log(`📝 Payments by user:`, results)
    }
  } catch (error) {
    console.error("❌ Error executing auto-pay:", error)
    process.exit(1)
  }
}

// Run the cron job
executeAutoPayments()
  .then(() => {
    console.log("\n🏁 Cron job completed successfully")
    process.exit(0)
  })
  .catch((error) => {
    console.error("\n❌ Cron job failed:", error)
    process.exit(1)
  })
