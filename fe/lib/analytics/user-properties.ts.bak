'use server'

import { getSupabaseServerClient } from "@/lib/supabase/server"

/**
 * Enhanced user properties for analytics
 */
export interface EnhancedUserProperties {
  // Basic profile
  email?: string
  display_name?: string
  locale?: string
  is_admin?: boolean
  account_created_at?: string

  // WhatsApp integration
  has_whatsapp_connected?: boolean
  whatsapp_number_count?: number
  primary_whatsapp_number?: string

  // Activity metrics
  total_transactions?: number
  total_categories?: number
  total_expenses?: number
  total_income?: number

  // Usage patterns
  has_recurring_transactions?: boolean
  recurring_transaction_count?: number
  authorized_group_count?: number

  // Engagement
  days_since_signup?: number
  days_since_last_transaction?: number
  first_transaction_date?: string
  last_transaction_date?: string
}

/**
 * Fetch comprehensive user properties for analytics identification
 * This should be called during login/signup and periodically updated
 */
export async function getEnhancedUserProperties(userId: string): Promise<EnhancedUserProperties> {
  const supabase = await getSupabaseServerClient()

  // Get user profile
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("display_name, locale, is_admin, created_at")
    .eq("user_id", userId)
    .single()

  // Get user email from auth
  const { data: { user } } = await supabase.auth.getUser()

  // Get WhatsApp numbers
  const { data: whatsappNumbers } = await supabase
    .from("authorized_whatsapp_numbers")
    .select("whatsapp_number, is_primary")
    .eq("user_id", userId)

  const primaryNumber = whatsappNumbers?.find(n => n.is_primary)

  // Get transaction stats
  const { data: transactions } = await supabase
    .from("transactions")
    .select("type, amount, date")
    .eq("user_id", userId)

  const totalExpenses = transactions?.filter(t => t.type === 'expense').reduce((sum, t) => sum + Number(t.amount), 0) || 0
  const totalIncome = transactions?.filter(t => t.type === 'income').reduce((sum, t) => sum + Number(t.amount), 0) || 0

  // Get transaction dates for engagement metrics
  const transactionDates = transactions?.map(t => new Date(t.date)).sort((a, b) => a.getTime() - b.getTime())
  const firstTransactionDate = transactionDates?.[0]
  const lastTransactionDate = transactionDates?.[transactionDates.length - 1]

  // Get category count
  const { count: categoryCount } = await supabase
    .from("categories")
    .select("*", { count: 'exact', head: true })
    .eq("user_id", userId)

  // Get recurring transactions
  const { data: recurringTransactions } = await supabase
    .from("recurring_transactions")
    .select("id")
    .eq("user_id", userId)

  // Get authorized groups
  const { count: groupCount } = await supabase
    .from("authorized_groups")
    .select("*", { count: 'exact', head: true })
    .eq("user_id", userId)

  // Calculate days since signup
  const daysSinceSignup = profile?.created_at
    ? Math.floor((Date.now() - new Date(profile.created_at).getTime()) / (1000 * 60 * 60 * 24))
    : undefined

  // Calculate days since last transaction
  const daysSinceLastTransaction = lastTransactionDate
    ? Math.floor((Date.now() - lastTransactionDate.getTime()) / (1000 * 60 * 60 * 24))
    : undefined

  return {
    email: user?.email,
    display_name: profile?.display_name || undefined,
    locale: profile?.locale || undefined,
    is_admin: profile?.is_admin || false,
    account_created_at: profile?.created_at || undefined,

    has_whatsapp_connected: (whatsappNumbers?.length || 0) > 0,
    whatsapp_number_count: whatsappNumbers?.length || 0,
    primary_whatsapp_number: primaryNumber?.whatsapp_number,

    total_transactions: transactions?.length || 0,
    total_categories: categoryCount || 0,
    total_expenses: totalExpenses,
    total_income: totalIncome,

    has_recurring_transactions: (recurringTransactions?.length || 0) > 0,
    recurring_transaction_count: recurringTransactions?.length || 0,
    authorized_group_count: groupCount || 0,

    days_since_signup: daysSinceSignup,
    days_since_last_transaction: daysSinceLastTransaction,
    first_transaction_date: firstTransactionDate?.toISOString().split('T')[0],
    last_transaction_date: lastTransactionDate?.toISOString().split('T')[0],
  }
}

/**
 * Update user properties in PostHog
 * This can be called periodically or after significant user actions
 */
export async function updateUserPropertiesInAnalytics(userId: string): Promise<void> {
  const properties = await getEnhancedUserProperties(userId)

  // Import dynamically to avoid circular dependencies
  const { identifyServerUser } = await import('./server-tracker')
  await identifyServerUser(userId, properties)
}
