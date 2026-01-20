"use server"

import { getSupabaseServerClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { trackServerEvent } from "@/lib/analytics/server-tracker"
import { AnalyticsEvent, AnalyticsProperty } from "@/lib/analytics/events"
import { updateUserPropertiesInAnalytics } from "@/lib/analytics/user-properties"
import { requireAuthenticatedUser, getAuthenticatedUser, isValidUUID } from "./shared"

export async function getTransactions(filters?: {
  startDate?: string
  endDate?: string
  categoryId?: string
  type?: "income" | "expense"
  search?: string
}) {
  const supabase = await getSupabaseServerClient()
  const user = await requireAuthenticatedUser()

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

/**
 * Get transactions for dashboard display
 *
 * Two-query approach to show:
 * 1. Credit card transactions from current statement period (fatura atual + future)
 * 2. Non-credit card transactions from current calendar month + future
 *
 * This ensures:
 * - Credit card "fatura atual" transactions are shown (even if before current month)
 * - Non-credit card transactions only show current month (not past months)
 * - No duplicates
 */
export async function getDashboardTransactions(
  creditModePaymentMethodIds: string[],
  statementPeriodStart: string,
  calendarMonthStart: string
) {
  const supabase = await getSupabaseServerClient()
  const user = await requireAuthenticatedUser()

  // Query 1: Credit card transactions from statement period start
  let creditCardTransactions: any[] = []
  if (creditModePaymentMethodIds.length > 0) {
    const { data: ccData, error: ccError } = await supabase
      .from("transactions")
      .select(`
        *,
        category:categories(*)
      `)
      .eq("user_id", user.id)
      .in("payment_method_id", creditModePaymentMethodIds)
      .gte("date", statementPeriodStart)
      .order("date", { ascending: false })

    if (ccError) throw ccError
    creditCardTransactions = ccData || []
  }

  // Query 2: Non-credit card transactions from current month start
  let nonCreditCardTransactions: any[] = []

  // Build query for non-credit card transactions
  let nonCcQuery = supabase
    .from("transactions")
    .select(`
      *,
      category:categories(*)
    `)
    .eq("user_id", user.id)
    .gte("date", calendarMonthStart)
    .order("date", { ascending: false })

  // Exclude credit card payment methods if there are any
  if (creditModePaymentMethodIds.length > 0) {
    // Use NOT IN by filtering out credit card payment method IDs
    nonCcQuery = nonCcQuery.not("payment_method_id", "in", `(${creditModePaymentMethodIds.join(",")})`)
  }

  const { data: nonCcData, error: nonCcError } = await nonCcQuery
  if (nonCcError) throw nonCcError
  nonCreditCardTransactions = nonCcData || []

  // Merge and sort by date descending
  const allTransactions = [...creditCardTransactions, ...nonCreditCardTransactions]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  return allTransactions
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
  const user = await requireAuthenticatedUser()

  // Story 2.0 Part 1: Payment Method ID Validation (AC1.4, AC1.10)
  if (!isValidUUID(formData.payment_method_id)) {
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
  const user = await requireAuthenticatedUser()

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
    if (!isValidUUID(formData.payment_method_id)) {
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
  const user = await requireAuthenticatedUser()

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
  const { user } = await getAuthenticatedUser()
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
