"use server"

import { getSupabaseServerClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { trackServerEvent } from "@/lib/analytics/server-tracker"
import { AnalyticsEvent, AnalyticsProperty } from "@/lib/analytics/events"
import { updateUserPropertiesInAnalytics } from "@/lib/analytics/user-properties"

export async function getTransactions(filters?: {
  startDate?: string
  endDate?: string
  categoryId?: string
  type?: "income" | "expense"
  search?: string
}) {
  const supabase = await getSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")

  let query = supabase
    .from("transactions")
    .select(`
      *,
      category:categories(*)
    `)
    .eq("user_id", user.id)
    .order("date", { ascending: false })

  if (filters?.startDate) {
    query = query.gte("date", filters.startDate)
  }
  if (filters?.endDate) {
    query = query.lte("date", filters.endDate)
  }
  if (filters?.categoryId) {
    query = query.eq("category_id", filters.categoryId)
  }
  if (filters?.type) {
    query = query.eq("type", filters.type)
  }
  if (filters?.search) {
    query = query.ilike("description", `%${filters.search}%`)
  }

  const { data, error } = await query

  if (error) throw error
  return data
}

export async function createTransaction(formData: {
  amount: number
  type: "income" | "expense"
  category_id: string
  description?: string
  date: string
  payment_method_id: string
}) {
  const supabase = await getSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")

  // Story 2.0 Part 1: Payment Method ID Validation (AC1.4, AC1.10)
  // Validate payment_method_id is a valid UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!uuidRegex.test(formData.payment_method_id)) {
    throw new Error("Invalid payment method ID format")
  }

  // Verify payment method exists and belongs to authenticated user
  const { data: paymentMethod, error: pmError } = await supabase
    .from("payment_methods")
    .select("id, name, type, credit_mode")
    .eq("id", formData.payment_method_id)
    .eq("user_id", user.id)
    .single()

  if (pmError || !paymentMethod) {
    throw new Error("Payment method not found or unauthorized")
  }

  // Check if this is the user's first transaction BEFORE insertion to avoid race conditions
  const { count: existingTransactionCount } = await supabase
    .from("transactions")
    .select("*", { count: 'exact', head: true })
    .eq("user_id", user.id)

  const isFirstTransaction = existingTransactionCount === 0

  // Generate user-readable ID using the database function
  const { data: readableIdData, error: idError } = await supabase.rpc("generate_transaction_id")

  if (idError) throw idError

  const { data, error } = await supabase
    .from("transactions")
    .insert({
      ...formData,
      user_id: user.id,
      user_readable_id: readableIdData,
    })
    .select()
    .single()

  if (error) throw error

  // Story 2.0 Part 1: Track payment method mode in analytics (AC1.8)
  await trackServerEvent(user.id, AnalyticsEvent.TRANSACTION_CREATED, {
    [AnalyticsProperty.TRANSACTION_ID]: data.id,
    [AnalyticsProperty.TRANSACTION_AMOUNT]: formData.amount,
    [AnalyticsProperty.TRANSACTION_TYPE]: formData.type,
    [AnalyticsProperty.CATEGORY_ID]: formData.category_id,
    [AnalyticsProperty.PAYMENT_METHOD_ID]: formData.payment_method_id,
    payment_method_type: paymentMethod.type,
    payment_method_mode: paymentMethod.type === 'credit'
      ? (paymentMethod.credit_mode === true ? 'credit' : paymentMethod.credit_mode === false ? 'simple' : null)
      : null,
    is_first_transaction: isFirstTransaction,
    channel: 'web',
  })

  // Refresh user properties in analytics after first transaction (key milestone)
  if (isFirstTransaction) {
    await updateUserPropertiesInAnalytics(user.id)
  }

  // NOTE: Auto-linking removed - installments now create transactions upfront
  // All installment transactions are created when the installment plan is created

  revalidatePath("/")
  return data
}

/**
 * Helper function to determine which fields changed between old and new transaction
 * Epic 4 - Story 4.4 (AC4.4.3)
 */
function getChangedFields(
  oldTransaction: any,
  newTransaction: any
): string[] {
  const fields: string[] = []

  if (oldTransaction.amount !== newTransaction.amount) {
    fields.push('amount')
  }
  if (oldTransaction.date !== newTransaction.date) {
    fields.push('date')
  }
  if (oldTransaction.payment_method_id !== newTransaction.payment_method_id) {
    fields.push('payment_method')
  }
  if (oldTransaction.category_id !== newTransaction.category_id) {
    fields.push('category')
  }
  if (oldTransaction.description !== newTransaction.description) {
    fields.push('description')
  }
  if (oldTransaction.type !== newTransaction.type) {
    fields.push('type')
  }

  return fields
}

export async function updateTransaction(
  id: string,
  formData: {
    amount?: number
    type?: "income" | "expense"
    category_id?: string
    description?: string
    date?: string
    payment_method_id?: string
  },
) {
  const supabase = await getSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")

  // Story 4.4: Fetch old transaction before update (for analytics)
  const { data: oldTransaction, error: fetchError } = await supabase
    .from("transactions")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single()

  if (fetchError || !oldTransaction) {
    throw new Error("Transaction not found or unauthorized")
  }

  // Story 2.0 Part 1: Payment Method ID Validation (AC1.4, AC1.10)
  // If payment_method_id is being updated, validate it
  if (formData.payment_method_id) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(formData.payment_method_id)) {
      throw new Error("Invalid payment method ID format")
    }

    // Verify payment method exists and belongs to authenticated user
    const { data: paymentMethod, error: pmError } = await supabase
      .from("payment_methods")
      .select("id")
      .eq("id", formData.payment_method_id)
      .eq("user_id", user.id)
      .single()

    if (pmError || !paymentMethod) {
      throw new Error("Payment method not found or unauthorized")
    }
  }

  const { data, error } = await supabase
    .from("transactions")
    .update({
      ...formData,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single()

  if (error) throw error

  // Track transaction update event
  await trackServerEvent(user.id, AnalyticsEvent.TRANSACTION_EDITED, {
    [AnalyticsProperty.TRANSACTION_ID]: id,
  })

  // Story 4.4 (AC4.4.3): Track auto-payment edit event if this is an auto-generated transaction
  if (oldTransaction.metadata?.auto_generated === true) {
    try {
      const fieldsChanged = getChangedFields(oldTransaction, { ...oldTransaction, ...formData })

      await trackServerEvent(user.id, AnalyticsEvent.AUTO_PAYMENT_EDITED, {
        userId: user.id,
        transactionId: id,
        paymentMethodId: oldTransaction.metadata.credit_card_id || null,
        fieldsChanged,
        oldAmount: oldTransaction.amount,
        newAmount: formData.amount !== undefined ? formData.amount : oldTransaction.amount,
        oldPaymentMethodId: oldTransaction.payment_method_id,
        newPaymentMethodId: formData.payment_method_id !== undefined ? formData.payment_method_id : oldTransaction.payment_method_id,
        locale: 'pt-BR', // TODO: Get from user profile
        timestamp: new Date().toISOString(),
      })
    } catch (analyticsError) {
      // Graceful degradation: Log error but don't block user action
      console.error('Failed to track auto_payment_edited event:', analyticsError)
    }
  }

  // NOTE: Auto-linking removed - installments now create transactions upfront
  // All installment transactions are created when the installment plan is created

  revalidatePath("/")
  return data
}

export async function deleteTransaction(id: string) {
  const supabase = await getSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")

  // Story 4.4 (AC4.4.3): Fetch transaction before deletion (for analytics)
  const { data: transaction, error: fetchError } = await supabase
    .from("transactions")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single()

  if (fetchError || !transaction) {
    throw new Error("Transaction not found or unauthorized")
  }

  // Story 4.4 (AC4.4.3): Track auto-payment deletion event BEFORE deletion
  if (transaction.metadata?.auto_generated === true) {
    try {
      await trackServerEvent(user.id, AnalyticsEvent.AUTO_PAYMENT_DELETED, {
        userId: user.id,
        transactionId: id,
        paymentMethodId: transaction.metadata.credit_card_id || null,
        amount: transaction.amount,
        statementPeriodStart: transaction.metadata.statement_period_start || null,
        statementPeriodEnd: transaction.metadata.statement_period_end || null,
        locale: 'pt-BR', // TODO: Get from user profile
        timestamp: new Date().toISOString(),
      })
    } catch (analyticsError) {
      // Graceful degradation: Log error but don't block user action
      console.error('Failed to track auto_payment_deleted event:', analyticsError)
    }
  }

  const { error } = await supabase.from("transactions").delete().eq("id", id).eq("user_id", user.id)

  if (error) throw error

  // Track transaction deletion event
  await trackServerEvent(user.id, AnalyticsEvent.TRANSACTION_DELETED, {
    [AnalyticsProperty.TRANSACTION_ID]: id,
  })

  revalidatePath("/")
}

export async function getBalance() {
  const supabase = await getSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { income: 0, expenses: 0, balance: 0 }

  // Calculate current month boundaries
  const now = new Date()
  const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)

  const startDate = firstDayOfMonth.toISOString().split('T')[0]
  const endDate = lastDayOfMonth.toISOString().split('T')[0]

  // Filter transactions by current month
  const { data: transactions } = await supabase
    .from("transactions")
    .select("amount, type")
    .eq("user_id", user.id)
    .gte("date", startDate)
    .lte("date", endDate)

  if (!transactions) return { income: 0, expenses: 0, balance: 0 }

  const income = transactions.filter((t) => t.type === "income").reduce((sum, t) => sum + Number(t.amount), 0)

  const expenses = transactions.filter((t) => t.type === "expense").reduce((sum, t) => sum + Number(t.amount), 0)

  return {
    income,
    expenses,
    balance: income - expenses,
  }
}
