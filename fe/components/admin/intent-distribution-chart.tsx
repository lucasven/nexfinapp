"use client"

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts"

interface IntentDistributionData {
  intent: string
  total: number
  successful: number
  failed: number
  successRate: number
  percentage: number
}

interface IntentDistributionChartProps {
  data: IntentDistributionData[]
}

const INTENT_LABELS: Record<string, string> = {
  add_expense: "Add Expense",
  add_income: "Add Income",
  show_expenses: "Show Expenses",
  edit_transaction: "Edit Transaction",
  delete_transaction: "Delete Transaction",
  change_category: "Change Category",
  show_transaction_details: "Transaction Details",
  set_budget: "Set Budget",
  show_budget: "Show Budget",
  delete_budget: "Delete Budget",
  add_recurring: "Add Recurring",
  show_recurring: "Show Recurring",
  delete_recurring: "Delete Recurring",
  edit_recurring: "Edit Recurring",
  make_expense_recurring: "Make Recurring",
  show_report: "Show Report",
  search_transactions: "Search",
  quick_stats: "Quick Stats",
  analyze_spending: "Analyze Spending",
  list_categories: "List Categories",
  add_category: "Add Category",
  remove_category: "Remove Category",
  login: "Login",
  logout: "Logout",
  help: "Help",
  show_help: "Show Help",
  undo_last: "Undo",
  unknown: "Unknown",
}

// Color based on success rate
function getColorForSuccessRate(successRate: number): string {
  if (successRate >= 90) return "hsl(142, 76%, 36%)" // Green
  if (successRate >= 75) return "hsl(48, 96%, 53%)" // Yellow
  if (successRate >= 50) return "hsl(20, 95%, 55%)" // Orange
  return "hsl(0, 84%, 60%)" // Red
}

export function IntentDistributionChart({ data }: IntentDistributionChartProps) {
  // Take top 15 for readability
  const chartData = data
    .slice(0, 15)
    .map((item) => ({
      ...item,
      name: INTENT_LABELS[item.intent] || item.intent,
      fill: getColorForSuccessRate(item.successRate),
    }))

  return (
    <ResponsiveContainer width="100%" height={500}>
      <BarChart data={chartData} layout="vertical" margin={{ left: 120 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis type="number" className="text-xs" tick={{ fontSize: 12 }} />
        <YAxis
          type="category"
          dataKey="name"
          className="text-xs"
          tick={{ fontSize: 11 }}
          width={120}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "hsl(var(--background))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "6px",
          }}
          formatter={(value: number, name: string) => {
            if (name === "total") return [`${value} messages`, "Total"]
            if (name === "successful") return [`${value} (${((value / Number(value)) * 100).toFixed(1)}%)`, "Successful"]
            return [value, name]
          }}
          labelFormatter={(label: string, payload: any) => {
            if (payload && payload[0]) {
              return `${label} (${payload[0].payload.successRate}% success)`
            }
            return label
          }}
        />
        <Bar dataKey="total" radius={[0, 4, 4, 0]}>
          {chartData.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.fill} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
