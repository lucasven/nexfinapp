"use server"

import { getSupabaseServerClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

export async function getRecurringTransactions() {
  const supabase = await getSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")

  const { data, error } = await supabase
    .from("recurring_transactions")
    .select(`
      *,
      category:categories(*)
    `)
    .eq("user_id", user.id)
    .order("day_of_month", { ascending: true })

  if (error) throw error
  return data
}

export async function getRecurringPayments(month?: number, year?: number) {
  const supabase = await getSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")

  const currentDate = new Date()
  const targetMonth = month ?? currentDate.getMonth() + 1
  const targetYear = year ?? currentDate.getFullYear()

  const startDate = new Date(targetYear, targetMonth - 1, 1).toISOString().split("T")[0]
  const endDate = new Date(targetYear, targetMonth, 0).toISOString().split("T")[0]

  const { data, error } = await supabase
    .from("recurring_payments")
    .select(`
      *,
      recurring_transaction:recurring_transactions(
        *,
        category:categories(*)
      )
    `)
    .gte("due_date", startDate)
    .lte("due_date", endDate)
    .order("due_date", { ascending: true })

  if (error) throw error

  // Filter by user_id through the recurring_transaction relationship
  return data?.filter((payment) => payment.recurring_transaction?.user_id === user.id) || []
}

export async function createRecurringTransaction(formData: {
  amount: number
  type: "income" | "expense"
  category_id: string
  description?: string
  payment_method?: string
  day_of_month: number
}) {
  const supabase = await getSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")

  const { data, error } = await supabase
    .from("recurring_transactions")
    .insert({
      ...formData,
      user_id: user.id,
      is_active: true,
    })
    .select()
    .single()

  if (error) throw error

  // Generate payments for current and next month
  await generateRecurringPayments(data.id)

  revalidatePath("/recurring")
  return data
}

export async function updateRecurringTransaction(
  id: string,
  formData: {
    amount?: number
    type?: "income" | "expense"
    category_id?: string
    description?: string
    payment_method?: string
    day_of_month?: number
    is_active?: boolean
  },
) {
  const supabase = await getSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")

  const { data, error } = await supabase
    .from("recurring_transactions")
    .update({
      ...formData,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single()

  if (error) throw error

  revalidatePath("/recurring")
  return data
}

export async function deleteRecurringTransaction(id: string) {
  const supabase = await getSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")

  const { error } = await supabase.from("recurring_transactions").delete().eq("id", id).eq("user_id", user.id)

  if (error) throw error

  revalidatePath("/recurring")
}

export async function generateRecurringPayments(recurringTransactionId: string) {
  const supabase = await getSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")

  // Get the recurring transaction
  const { data: recurring } = await supabase
    .from("recurring_transactions")
    .select("*")
    .eq("id", recurringTransactionId)
    .eq("user_id", user.id)
    .single()

  if (!recurring || !recurring.is_active) return

  const currentDate = new Date()
  const currentMonth = currentDate.getMonth()
  const currentYear = currentDate.getFullYear()

  // Generate for current and next 2 months
  for (let i = 0; i < 3; i++) {
    const targetDate = new Date(currentYear, currentMonth + i, recurring.day_of_month)
    const dueDate = targetDate.toISOString().split("T")[0]

    // Check if payment already exists
    const { data: existing } = await supabase
      .from("recurring_payments")
      .select("id")
      .eq("recurring_transaction_id", recurringTransactionId)
      .eq("due_date", dueDate)
      .single()

    if (!existing) {
      await supabase.from("recurring_payments").insert({
        recurring_transaction_id: recurringTransactionId,
        due_date: dueDate,
        is_paid: false,
      })
    }
  }

  revalidatePath("/recurring")
}

export async function markPaymentAsPaid(paymentId: string, paid: boolean) {
  const supabase = await getSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")

  // Get the payment with recurring transaction
  const { data: payment } = await supabase
    .from("recurring_payments")
    .select(`
      *,
      recurring_transaction:recurring_transactions(*)
    `)
    .eq("id", paymentId)
    .single()

  if (!payment || payment.recurring_transaction?.user_id !== user.id) {
    throw new Error("Payment not found")
  }

  if (paid && !payment.transaction_id) {
    // Create actual transaction
    const { data: transaction } = await supabase
      .from("transactions")
      .insert({
        user_id: user.id,
        amount: payment.recurring_transaction.amount,
        type: payment.recurring_transaction.type,
        category_id: payment.recurring_transaction.category_id,
        description: payment.recurring_transaction.description,
        payment_method: payment.recurring_transaction.payment_method,
        date: payment.due_date,
      })
      .select()
      .single()

    // Update payment
    await supabase
      .from("recurring_payments")
      .update({
        is_paid: true,
        paid_date: new Date().toISOString().split("T")[0],
        transaction_id: transaction?.id,
      })
      .eq("id", paymentId)
  } else if (!paid && payment.transaction_id) {
    // Delete the transaction
    await supabase.from("transactions").delete().eq("id", payment.transaction_id)

    // Update payment
    await supabase
      .from("recurring_payments")
      .update({
        is_paid: false,
        paid_date: null,
        transaction_id: null,
      })
      .eq("id", paymentId)
  }

  revalidatePath("/recurring")
  revalidatePath("/")
}
