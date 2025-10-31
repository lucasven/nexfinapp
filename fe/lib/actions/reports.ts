"use server"

import { getSupabaseServerClient } from "@/lib/supabase/server"

export async function getMonthlyReport(month: number, year: number) {
  const supabase = await getSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")

  const startDate = new Date(year, month - 1, 1).toISOString().split("T")[0]
  const endDate = new Date(year, month, 0).toISOString().split("T")[0]

  // Get all transactions for the month
  const { data: transactions } = await supabase
    .from("transactions")
    .select(`
      *,
      category:categories(*)
    `)
    .eq("user_id", user.id)
    .gte("date", startDate)
    .lte("date", endDate)

  if (!transactions) return null

  // Calculate totals
  const income = transactions.filter((t) => t.type === "income").reduce((sum, t) => sum + Number(t.amount), 0)

  const expenses = transactions.filter((t) => t.type === "expense").reduce((sum, t) => sum + Number(t.amount), 0)

  // Group by category
  const categoryBreakdown = transactions.reduce(
    (acc, transaction) => {
      const categoryName = transaction.category?.name || "Uncategorized"
      const categoryIcon = transaction.category?.icon || "📊"

      if (!acc[categoryName]) {
        acc[categoryName] = {
          name: categoryName,
          icon: categoryIcon,
          type: transaction.type,
          total: 0,
          count: 0,
        }
      }

      acc[categoryName].total += Number(transaction.amount)
      acc[categoryName].count += 1

      return acc
    },
    {} as Record<string, { name: string; icon: string; type: string; total: number; count: number }>,
  )

  const categories = Object.values(categoryBreakdown).sort((a, b) => b.total - a.total)

  // Group by payment method
  const paymentMethodBreakdown = transactions.reduce(
    (acc, transaction) => {
      const method = transaction.payment_method || "Not specified"

      if (!acc[method]) {
        acc[method] = {
          method,
          total: 0,
          count: 0,
        }
      }

      acc[method].total += Number(transaction.amount)
      acc[method].count += 1

      return acc
    },
    {} as Record<string, { method: string; total: number; count: number }>,
  )

  const paymentMethods = Object.values(paymentMethodBreakdown).sort((a, b) => b.total - a.total)

  // Daily spending trend
  const dailyTrend = transactions.reduce(
    (acc, transaction) => {
      const date = transaction.date

      if (!acc[date]) {
        acc[date] = {
          date,
          income: 0,
          expenses: 0,
        }
      }

      if (transaction.type === "income") {
        acc[date].income += Number(transaction.amount)
      } else {
        acc[date].expenses += Number(transaction.amount)
      }

      return acc
    },
    {} as Record<string, { date: string; income: number; expenses: number }>,
  )

  const trend = Object.values(dailyTrend).sort((a, b) => a.date.localeCompare(b.date))

  return {
    income,
    expenses,
    balance: income - expenses,
    transactionCount: transactions.length,
    categories,
    paymentMethods,
    trend,
  }
}

export async function getYearlyComparison(year: number) {
  const supabase = await getSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  const monthlyData = await Promise.all(
    Array.from({ length: 12 }, async (_, i) => {
      const month = i + 1
      const startDate = new Date(year, i, 1).toISOString().split("T")[0]
      const endDate = new Date(year, i + 1, 0).toISOString().split("T")[0]

      const { data: transactions } = await supabase
        .from("transactions")
        .select("amount, type")
        .eq("user_id", user.id)
        .gte("date", startDate)
        .lte("date", endDate)

      const income = transactions?.filter((t) => t.type === "income").reduce((sum, t) => sum + Number(t.amount), 0) || 0
      const expenses =
        transactions?.filter((t) => t.type === "expense").reduce((sum, t) => sum + Number(t.amount), 0) || 0

      return {
        month: new Date(year, i).toLocaleString("en-US", { month: "short" }),
        income,
        expenses,
      }
    }),
  )

  return monthlyData
}
