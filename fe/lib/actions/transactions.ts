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
  payment_method?: string
}) {
  const supabase = await getSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")

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

  // Check if this is the user's first transaction
  const { count: transactionCount } = await supabase
    .from("transactions")
    .select("*", { count: 'exact', head: true })
    .eq("user_id", user.id)

  const isFirstTransaction = transactionCount === 1

  // Track transaction creation event
  await trackServerEvent(user.id, AnalyticsEvent.TRANSACTION_CREATED, {
    [AnalyticsProperty.TRANSACTION_ID]: data.id,
    [AnalyticsProperty.TRANSACTION_AMOUNT]: formData.amount,
    [AnalyticsProperty.TRANSACTION_TYPE]: formData.type,
    [AnalyticsProperty.CATEGORY_ID]: formData.category_id,
    is_first_transaction: isFirstTransaction,
  })

  // Refresh user properties in analytics after first transaction (key milestone)
  if (isFirstTransaction) {
    await updateUserPropertiesInAnalytics(user.id)
  }

  revalidatePath("/")
  return data
}

export async function updateTransaction(
  id: string,
  formData: {
    amount?: number
    type?: "income" | "expense"
    category_id?: string
    description?: string
    date?: string
    payment_method?: string
  },
) {
  const supabase = await getSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")

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

  revalidatePath("/")
  return data
}

export async function deleteTransaction(id: string) {
  const supabase = await getSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")

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

  const { data: transactions } = await supabase.from("transactions").select("amount, type").eq("user_id", user.id)

  if (!transactions) return { income: 0, expenses: 0, balance: 0 }

  const income = transactions.filter((t) => t.type === "income").reduce((sum, t) => sum + Number(t.amount), 0)

  const expenses = transactions.filter((t) => t.type === "expense").reduce((sum, t) => sum + Number(t.amount), 0)

  return {
    income,
    expenses,
    balance: income - expenses,
  }
}
