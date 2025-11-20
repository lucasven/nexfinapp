#!/usr/bin/env tsx
/**
 * Monthly Recurring Payment Generation Cron Job
 *
 * Runs on the 1st of each month to generate next month's recurring payment entries.
 * This ensures users always have upcoming payments visible for the next 3 months.
 *
 * Schedule: 0 0 1 * * (00:00 on the 1st of every month)
 */

import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing required environment variables: SUPABASE_URL or SUPABASE_SERVICE_KEY")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

/**
 * Get the last day of a given month
 */
function getLastDayOfMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

/**
 * Generate recurring payments for a specific recurring transaction
 */
async function generatePaymentsForTransaction(recurringTransaction: any) {
  const currentDate = new Date()
  const currentMonth = currentDate.getMonth()
  const currentYear = currentDate.getFullYear()

  const paymentsCreated: string[] = []

  // Generate for next 3 months from current date
  for (let i = 0; i < 3; i++) {
    const targetMonth = currentMonth + i
    const targetYear = currentYear + Math.floor(targetMonth / 12)
    const adjustedMonth = targetMonth % 12

    // Get the last day of the target month
    const lastDayOfMonth = getLastDayOfMonth(targetYear, adjustedMonth)

    // Use the smaller of day_of_month and last day of month
    const actualDay = Math.min(recurringTransaction.day_of_month, lastDayOfMonth)

    const targetDate = new Date(targetYear, adjustedMonth, actualDay)
    const dueDate = targetDate.toISOString().split("T")[0]

    // Check if payment already exists
    const { data: existing } = await supabase
      .from("recurring_payments")
      .select("id")
      .eq("recurring_transaction_id", recurringTransaction.id)
      .eq("due_date", dueDate)
      .single()

    if (!existing) {
      const { error } = await supabase.from("recurring_payments").insert({
        recurring_transaction_id: recurringTransaction.id,
        user_id: recurringTransaction.user_id,
        due_date: dueDate,
        is_paid: false,
      })

      if (error) {
        console.error(
          `Error creating payment for transaction ${recurringTransaction.id} on ${dueDate}:`,
          error
        )
      } else {
        paymentsCreated.push(dueDate)
      }
    }
  }

  return paymentsCreated
}

/**
 * Main cron job function
 */
async function generateRecurringPayments() {
  console.log("🔄 Starting monthly recurring payment generation...")
  console.log(`📅 Run date: ${new Date().toISOString()}`)

  try {
    // Get all active recurring transactions
    const { data: recurringTransactions, error } = await supabase
      .from("recurring_transactions")
      .select("*")
      .eq("is_active", true)

    if (error) {
      throw error
    }

    if (!recurringTransactions || recurringTransactions.length === 0) {
      console.log("✅ No active recurring transactions found")
      return
    }

    console.log(`📊 Found ${recurringTransactions.length} active recurring transactions`)

    let totalPaymentsCreated = 0
    const transactionResults: { [key: string]: number } = {}

    // Process each recurring transaction
    for (const transaction of recurringTransactions) {
      const paymentsCreated = await generatePaymentsForTransaction(transaction)
      totalPaymentsCreated += paymentsCreated.length

      if (paymentsCreated.length > 0) {
        transactionResults[transaction.id] = paymentsCreated.length
        console.log(
          `  ✓ Created ${paymentsCreated.length} payments for transaction ${transaction.id} (day: ${transaction.day_of_month})`
        )
      }
    }

    console.log(`\n✅ Generation complete!`)
    console.log(`📈 Total payments created: ${totalPaymentsCreated}`)
    console.log(`📋 Transactions processed: ${Object.keys(transactionResults).length}`)

    if (Object.keys(transactionResults).length > 0) {
      console.log(`📝 Summary:`, transactionResults)
    }
  } catch (error) {
    console.error("❌ Error generating recurring payments:", error)
    process.exit(1)
  }
}

// Run the cron job
generateRecurringPayments()
  .then(() => {
    console.log("\n🏁 Cron job completed successfully")
    process.exit(0)
  })
  .catch((error) => {
    console.error("\n❌ Cron job failed:", error)
    process.exit(1)
  })
