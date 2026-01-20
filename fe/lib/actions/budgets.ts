"use server"

import { getSupabaseServerClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { trackServerEvent } from "@/lib/analytics/server-tracker"
import { AnalyticsEvent, AnalyticsProperty } from "@/lib/analytics/events"
import type { Budget, BudgetWithSpending } from "@/lib/types"
import { requireAuthenticatedUser, getAuthenticatedUser } from "./shared"

/**
 * Get monthly budgets for a specific month/year (excludes defaults)
 */
export async function getBudgets(month?: number, year?: number) {
  const supabase = await getSupabaseServerClient()
  const user = await requireAuthenticatedUser()

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
    .eq("is_default", false)
    .order("created_at", { ascending: false })

  if (error) throw error
  return data
}

/**
 * Get all default budgets for the user
 */
export async function getDefaultBudgets(): Promise<Budget[]> {
  const supabase = await getSupabaseServerClient()
  const user = await requireAuthenticatedUser()

  const { data, error } = await supabase
    .from("budgets")
    .select(`
      *,
      category:categories(*)
    `)
    .eq("user_id", user.id)
    .eq("is_default", true)
    .order("created_at", { ascending: false })

  if (error) throw error
  return data || []
}

/**
 * Get effective budgets with spending for a specific month/year
 * Resolves budget precedence: monthly override > default budget
 */
export async function getBudgetWithSpending(month?: number, year?: number): Promise<BudgetWithSpending[]> {
  const supabase = await getSupabaseServerClient()
  const { user } = await getAuthenticatedUser()
  if (!user) return []

  const currentDate = new Date()
  const targetMonth = month ?? currentDate.getMonth() + 1
  const targetYear = year ?? currentDate.getFullYear()

  // Get ALL budgets (both defaults and monthly)
  const { data: allBudgets } = await supabase
    .from("budgets")
    .select(`
      *,
      category:categories(*)
    `)
    .eq("user_id", user.id)

  if (!allBudgets) return []

  // Resolve effective budgets: group by category, override > default
  const categoryBudgets = new Map<string, { budget: Budget; source_type: 'default' | 'override' }>()

  for (const budget of allBudgets) {
    const categoryId = budget.category_id

    if (budget.is_default) {
      // Default budget - only use if no override exists for this category
      if (!categoryBudgets.has(categoryId)) {
        categoryBudgets.set(categoryId, { budget, source_type: 'default' })
      }
    } else if (budget.month === targetMonth && budget.year === targetYear) {
      // Monthly override for target period - takes precedence
      categoryBudgets.set(categoryId, { budget, source_type: 'override' })
    }
  }

  // Get spending for each effective budget
  const startDate = new Date(targetYear, targetMonth - 1, 1).toISOString().split("T")[0]
  const endDate = new Date(targetYear, targetMonth, 0).toISOString().split("T")[0]

  const budgetsWithSpending = await Promise.all(
    Array.from(categoryBudgets.values()).map(async ({ budget, source_type }) => {
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
        source_type,
      } as BudgetWithSpending
    }),
  )

  return budgetsWithSpending
}

/**
 * Create a monthly budget (override) for a specific month/year
 */
export async function createBudget(formData: {
  category_id: string
  amount: number
  month: number
  year: number
}) {
  const supabase = await getSupabaseServerClient()
  const user = await requireAuthenticatedUser()

  const { data, error } = await supabase
    .from("budgets")
    .insert({
      ...formData,
      user_id: user.id,
      is_default: false,
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
    is_default: false,
  })

  revalidatePath("/budgets")
  return data
}

/**
 * Alias for createBudget - for backward compatibility
 */
export const createMonthlyBudget = createBudget

/**
 * Create a default/fixed budget that applies to all months
 */
export async function createDefaultBudget(formData: {
  category_id: string
  amount: number
}) {
  const supabase = await getSupabaseServerClient()
  const user = await requireAuthenticatedUser()

  const { data, error } = await supabase
    .from("budgets")
    .insert({
      category_id: formData.category_id,
      amount: formData.amount,
      user_id: user.id,
      is_default: true,
      month: null,
      year: null,
    })
    .select()
    .single()

  if (error) throw error

  // Track default budget creation event
  await trackServerEvent(user.id, AnalyticsEvent.BUDGET_CREATED, {
    [AnalyticsProperty.BUDGET_AMOUNT]: formData.amount,
    [AnalyticsProperty.CATEGORY_ID]: formData.category_id,
    is_default: true,
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
  const user = await requireAuthenticatedUser()

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
  const user = await requireAuthenticatedUser()

  const { error } = await supabase.from("budgets").delete().eq("id", id).eq("user_id", user.id)

  if (error) throw error

  // Track budget deletion event
  await trackServerEvent(user.id, AnalyticsEvent.BUDGET_DELETED, {
    budget_id: id,
  })

  revalidatePath("/budgets")
}
