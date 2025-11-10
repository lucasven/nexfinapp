"use server"

import { getSupabaseServerClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { trackServerEvent } from "@/lib/analytics/server-tracker"
import { AnalyticsEvent, AnalyticsProperty } from "@/lib/analytics/events"

export async function getBudgets(month?: number, year?: number) {
  const supabase = await getSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")

  const currentDate = new Date()
  const targetMonth = month ?? currentDate.getMonth() + 1
  const targetYear = year ?? currentDate.getFullYear()

  const { data, error } = await supabase
    .from("budgets")
    .select(`
      *,
      category:categories(*)
    `)
    .eq("user_id", user.id)
    .eq("month", targetMonth)
    .eq("year", targetYear)
    .order("created_at", { ascending: false })

  if (error) throw error
  return data
}

export async function getBudgetWithSpending(month?: number, year?: number) {
  const supabase = await getSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  const currentDate = new Date()
  const targetMonth = month ?? currentDate.getMonth() + 1
  const targetYear = year ?? currentDate.getFullYear()

  // Get budgets
  const { data: budgets } = await supabase
    .from("budgets")
    .select(`
      *,
      category:categories(*)
    `)
    .eq("user_id", user.id)
    .eq("month", targetMonth)
    .eq("year", targetYear)

  if (!budgets) return []

  // Get spending for each budget category
  const startDate = new Date(targetYear, targetMonth - 1, 1).toISOString().split("T")[0]
  const endDate = new Date(targetYear, targetMonth, 0).toISOString().split("T")[0]

  const budgetsWithSpending = await Promise.all(
    budgets.map(async (budget) => {
      const { data: transactions } = await supabase
        .from("transactions")
        .select("amount")
        .eq("user_id", user.id)
        .eq("category_id", budget.category_id)
        .eq("type", "expense")
        .gte("date", startDate)
        .lte("date", endDate)

      const spent = transactions?.reduce((sum, t) => sum + Number(t.amount), 0) || 0

      return {
        ...budget,
        spent,
        remaining: Number(budget.amount) - spent,
        percentage: (spent / Number(budget.amount)) * 100,
      }
    }),
  )

  return budgetsWithSpending
}

export async function createBudget(formData: {
  category_id: string
  amount: number
  month: number
  year: number
}) {
  const supabase = await getSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")

  const { data, error } = await supabase
    .from("budgets")
    .insert({
      ...formData,
      user_id: user.id,
    })
    .select()
    .single()

  if (error) throw error

  // Track budget creation event
  await trackServerEvent(user.id, AnalyticsEvent.BUDGET_CREATED, {
    [AnalyticsProperty.BUDGET_AMOUNT]: formData.amount,
    [AnalyticsProperty.BUDGET_MONTH]: formData.month,
    [AnalyticsProperty.BUDGET_YEAR]: formData.year,
    [AnalyticsProperty.CATEGORY_ID]: formData.category_id,
  })

  revalidatePath("/budgets")
  return data
}

export async function updateBudget(
  id: string,
  formData: {
    category_id?: string
    amount?: number
    month?: number
    year?: number
  },
) {
  const supabase = await getSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")

  const { data, error } = await supabase
    .from("budgets")
    .update({
      ...formData,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single()

  if (error) throw error

  // Track budget update event
  await trackServerEvent(user.id, AnalyticsEvent.BUDGET_UPDATED, {
    budget_id: id,
  })

  revalidatePath("/budgets")
  return data
}

export async function deleteBudget(id: string) {
  const supabase = await getSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")

  const { error } = await supabase.from("budgets").delete().eq("id", id).eq("user_id", user.id)

  if (error) throw error

  // Track budget deletion event
  await trackServerEvent(user.id, AnalyticsEvent.BUDGET_DELETED, {
    budget_id: id,
  })

  revalidatePath("/budgets")
}
