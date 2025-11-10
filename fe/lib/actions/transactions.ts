"use server"

import { getSupabaseServerClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { trackServerEvent } from "@/lib/analytics/server-tracker"
import { AnalyticsEvent, AnalyticsProperty } from "@/lib/analytics/events"

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

  const { data, error } = await supabase
    .from("transactions")
    .insert({
      ...formData,
      user_id: user.id,
    })
    .select()
    .single()

  if (error) throw error

  // Track transaction creation event
  await trackServerEvent(user.id, AnalyticsEvent.TRANSACTION_CREATED, {
    [AnalyticsProperty.TRANSACTION_ID]: data.id,
    [AnalyticsProperty.TRANSACTION_AMOUNT]: formData.amount,
    [AnalyticsProperty.TRANSACTION_TYPE]: formData.type,
    [AnalyticsProperty.CATEGORY_ID]: formData.category_id,
  })

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
