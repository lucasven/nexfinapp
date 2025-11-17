"use server"

import { getSupabaseServerClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { trackServerEvent } from "@/lib/analytics/server-tracker"
import { AnalyticsEvent, AnalyticsProperty } from "@/lib/analytics/events"

export async function getCategories() {
  const supabase = await getSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")

  // Get default categories (user_id is null) and user's custom categories
  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .or(`user_id.is.null,user_id.eq.${user.id}`)
    .order("name")

  if (error) throw error
  return data
}

export async function createCategory(formData: {
  name: string
  type: "income" | "expense"
  icon?: string
  color?: string
}) {
  const supabase = await getSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")

  const { data, error } = await supabase
    .from("categories")
    .insert({
      name: formData.name,
      type: formData.type,
      icon: formData.icon || null,
      color: formData.color || null,
      is_custom: true,
      user_id: user.id,
    })
    .select()
    .single()

  if (error) throw error

  // Track category creation event
  await trackServerEvent(user.id, AnalyticsEvent.CATEGORY_CREATED, {
    [AnalyticsProperty.CATEGORY_ID]: data.id,
    [AnalyticsProperty.CATEGORY_NAME]: formData.name,
    [AnalyticsProperty.CATEGORY_TYPE]: formData.type,
  })

  revalidatePath("/categories")
  revalidatePath("/")
  return data
}

export async function updateCategory(
  id: string,
  formData: {
    name?: string
    type?: "income" | "expense"
    icon?: string
    color?: string
  }
) {
  const supabase = await getSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")

  // Check if user owns this category (for custom categories)
  const { data: category } = await supabase
    .from("categories")
    .select("is_custom, user_id")
    .eq("id", id)
    .single()

  if (!category) throw new Error("Category not found")

  // For custom categories, verify ownership
  if (category.is_custom && category.user_id !== user.id) {
    throw new Error("Not authorized to update this category")
  }

  const { data, error } = await supabase
    .from("categories")
    .update({
      name: formData.name,
      type: formData.type,
      icon: formData.icon,
      color: formData.color,
    })
    .eq("id", id)
    .select()
    .single()

  if (error) throw error

  // Track category update event
  await trackServerEvent(user.id, AnalyticsEvent.CATEGORY_EDITED, {
    [AnalyticsProperty.CATEGORY_ID]: id,
  })

  revalidatePath("/categories")
  revalidatePath("/")
  return data
}

export async function deleteCategory(id: string) {
  const supabase = await getSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")

  // Check if category is custom and owned by user
  const { data: category } = await supabase
    .from("categories")
    .select("is_custom, user_id, name")
    .eq("id", id)
    .single()

  if (!category) throw new Error("Category not found")

  if (!category.is_custom) {
    throw new Error("Cannot delete default categories")
  }

  if (category.user_id !== user.id) {
    throw new Error("Not authorized to delete this category")
  }

  // Check if category is in use
  const usage = await checkCategoryUsage(id)
  if (usage.total > 0) {
    throw new Error(
      `Cannot delete category "${category.name}" because it is used in ${usage.total} ${
        usage.total === 1 ? "item" : "items"
      } (${usage.transactions} transactions, ${usage.budgets} budgets, ${usage.recurring} recurring)`
    )
  }

  const { error } = await supabase.from("categories").delete().eq("id", id).eq("user_id", user.id)

  if (error) throw error

  // Track category deletion event
  await trackServerEvent(user.id, AnalyticsEvent.CATEGORY_DELETED, {
    [AnalyticsProperty.CATEGORY_ID]: id,
    [AnalyticsProperty.CATEGORY_NAME]: category.name,
  })

  revalidatePath("/categories")
  revalidatePath("/")
}

export async function checkCategoryUsage(categoryId: string) {
  const supabase = await getSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")

  // Check transactions
  const { count: transactionCount } = await supabase
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .eq("category_id", categoryId)
    .eq("user_id", user.id)

  // Check budgets
  const { count: budgetCount } = await supabase
    .from("budgets")
    .select("id", { count: "exact", head: true })
    .eq("category_id", categoryId)
    .eq("user_id", user.id)

  // Check recurring transactions
  const { count: recurringCount } = await supabase
    .from("recurring_transactions")
    .select("id", { count: "exact", head: true })
    .eq("category_id", categoryId)
    .eq("user_id", user.id)

  return {
    transactions: transactionCount || 0,
    budgets: budgetCount || 0,
    recurring: recurringCount || 0,
    total: (transactionCount || 0) + (budgetCount || 0) + (recurringCount || 0),
  }
}

