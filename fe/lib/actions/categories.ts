"use server"

import { getSupabaseServerClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { trackServerEvent } from "@/lib/analytics/server-tracker"
import { AnalyticsEvent, AnalyticsProperty } from "@/lib/analytics/events"
import { requireAuthenticatedUser } from "./shared"

export async function getCategories() {
  const supabase = await getSupabaseServerClient()
  const user = await requireAuthenticatedUser()

  // Get visible categories for user (excludes hidden defaults)
  const { data, error } = await supabase
    .rpc('get_visible_categories', { p_user_id: user.id })

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
  const user = await requireAuthenticatedUser()

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

/**
 * Hide a default category for the current user (soft delete)
 * Transactions using this category are preserved.
 */
export async function hideDefaultCategory(categoryId: string) {
  const supabase = await getSupabaseServerClient()
  const user = await requireAuthenticatedUser()

  const { data: category } = await supabase
    .from("categories")
    .select("name, is_custom, is_system, user_id")
    .eq("id", categoryId)
    .single()

  if (!category) throw new Error("Category not found")
  if (category.is_system) throw new Error("System categories cannot be hidden")
  if (category.is_custom || category.user_id !== null) {
    throw new Error("Use deleteCategory for custom categories")
  }

  const { error } = await supabase
    .from("user_hidden_categories")
    .insert({ user_id: user.id, category_id: categoryId, reason: 'removed' })

  if (error?.code === '23505') throw new Error("Category is already hidden")
  if (error) throw error

  await trackServerEvent(user.id, AnalyticsEvent.DEFAULT_CATEGORY_HIDDEN, {
    [AnalyticsProperty.CATEGORY_ID]: categoryId,
    [AnalyticsProperty.CATEGORY_NAME]: category.name,
  })

  revalidatePath("/categories")
  revalidatePath("/")
}

/**
 * Edit a default category by creating a personal copy (copy-on-write).
 * Migrates user's transactions, budgets, and recurring transactions to the new copy.
 * Hides the original default category for this user.
 */
export async function editDefaultCategory(
  defaultCategoryId: string,
  formData: { name?: string; type?: "income" | "expense"; icon?: string; color?: string }
) {
  const supabase = await getSupabaseServerClient()
  const user = await requireAuthenticatedUser()

  // 1. Verify default category
  const { data: original } = await supabase
    .from("categories")
    .select("*")
    .eq("id", defaultCategoryId)
    .is("user_id", null)
    .eq("is_system", false)
    .single()

  if (!original) throw new Error("Category not found or is not a default category")

  // 2. Check for existing copy
  const { data: existingCopy } = await supabase
    .from("categories")
    .select("id")
    .eq("copied_from_id", defaultCategoryId)
    .eq("user_id", user.id)
    .single()

  if (existingCopy) {
    // Update existing copy
    const { data, error } = await supabase
      .from("categories")
      .update({ name: formData.name, type: formData.type, icon: formData.icon, color: formData.color })
      .eq("id", existingCopy.id)
      .select()
      .single()
    if (error) throw error

    await trackServerEvent(user.id, AnalyticsEvent.CATEGORY_EDITED, {
      [AnalyticsProperty.CATEGORY_ID]: existingCopy.id,
    })

    revalidatePath("/categories")
    revalidatePath("/")
    return data
  }

  // 3. Create personal copy
  const { data: newCategory, error: insertError } = await supabase
    .from("categories")
    .insert({
      name: formData.name ?? original.name,
      type: formData.type ?? original.type,
      icon: formData.icon ?? original.icon,
      color: formData.color ?? original.color,
      is_custom: true,
      user_id: user.id,
      copied_from_id: defaultCategoryId,
    })
    .select()
    .single()

  if (insertError) throw insertError

  // 4. Migrate transactions, budgets, recurring
  await supabase.from("transactions")
    .update({ category_id: newCategory.id })
    .eq("category_id", defaultCategoryId)
    .eq("user_id", user.id)

  await supabase.from("budgets")
    .update({ category_id: newCategory.id })
    .eq("category_id", defaultCategoryId)
    .eq("user_id", user.id)

  await supabase.from("recurring_transactions")
    .update({ category_id: newCategory.id })
    .eq("category_id", defaultCategoryId)
    .eq("user_id", user.id)

  // 5. Hide original
  await supabase.from("user_hidden_categories")
    .insert({ user_id: user.id, category_id: defaultCategoryId, reason: 'edited' })

  await trackServerEvent(user.id, AnalyticsEvent.DEFAULT_CATEGORY_EDITED, {
    [AnalyticsProperty.CATEGORY_ID]: newCategory.id,
    original_category_id: defaultCategoryId,
  })

  revalidatePath("/categories")
  revalidatePath("/")
  return newCategory
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
  const user = await requireAuthenticatedUser()

  // Check if user owns this category (for custom categories)
  const { data: category } = await supabase
    .from("categories")
    .select("is_custom, is_system, user_id")
    .eq("id", id)
    .single()

  if (!category) throw new Error("Category not found")

  // Default categories use copy-on-write
  if (!category.is_custom && category.user_id === null && !category.is_system) {
    return editDefaultCategory(id, formData)
  }

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
  const user = await requireAuthenticatedUser()

  // Check if category is custom and owned by user
  const { data: category } = await supabase
    .from("categories")
    .select("is_custom, is_system, user_id, name")
    .eq("id", id)
    .single()

  if (!category) throw new Error("Category not found")

  if (category.is_system) {
    throw new Error("System categories cannot be deleted")
  }

  // Default categories: hide instead of delete
  if (!category.is_custom && category.user_id === null) {
    return hideDefaultCategory(id)
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
  const user = await requireAuthenticatedUser()

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

