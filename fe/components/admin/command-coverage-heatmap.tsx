"use client"

import { Badge } from "@/components/ui/badge"

interface CommandCoverageData {
  intent: string
  usageCount: number
  isUsed: boolean
}

interface CommandCoverageHeatmapProps {
  data: CommandCoverageData[]
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

const COMMAND_CATEGORIES = {
  "Transactions": ["add_expense", "add_income", "show_expenses", "edit_transaction", "delete_transaction", "change_category", "show_transaction_details"],
  "Budgets": ["set_budget", "show_budget", "delete_budget"],
  "Recurring": ["add_recurring", "show_recurring", "delete_recurring", "edit_recurring", "make_expense_recurring"],
  "Reports": ["show_report", "search_transactions", "quick_stats", "analyze_spending"],
  "Categories": ["list_categories", "add_category", "remove_category"],
  "Auth": ["login", "logout"],
  "Utility": ["help", "show_help", "undo_last", "unknown"],
}

function getUsageColor(usageCount: number): string {
  if (usageCount === 0) return "bg-gray-200 dark:bg-gray-800"
  if (usageCount < 10) return "bg-blue-200 dark:bg-blue-900"
  if (usageCount < 50) return "bg-blue-400 dark:bg-blue-700"
  if (usageCount < 100) return "bg-blue-600 dark:bg-blue-500"
  return "bg-blue-800 dark:bg-blue-300"
}

export function CommandCoverageHeatmap({ data }: CommandCoverageHeatmapProps) {
  // Create map for quick lookup
  const usageMap = new Map(data.map(d => [d.intent, d.usageCount]))

  return (
    <div className="space-y-6">
      {Object.entries(COMMAND_CATEGORIES).map(([category, commands]) => (
        <div key={category} className="space-y-2">
          <h4 className="text-sm font-semibold text-muted-foreground">{category}</h4>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {commands.map((intent) => {
              const usageCount = usageMap.get(intent) || 0
              const isUsed = usageCount > 0

              return (
                <div
                  key={intent}
                  className={`
                    p-3 rounded-lg border transition-all
                    ${getUsageColor(usageCount)}
                    ${isUsed ? "border-primary/50" : "border-border"}
                  `}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium truncate">
                      {INTENT_LABELS[intent] || intent}
                    </span>
                    {!isUsed && (
                      <Badge variant="outline" className="text-xs">
                        Unused
                      </Badge>
                    )}
                  </div>
                  <div className="text-lg font-bold">
                    {usageCount.toLocaleString()}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {isUsed ? "uses" : "never used"}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}

      {/* Legend */}
      <div className="mt-6 p-4 bg-muted rounded-lg">
        <div className="text-sm font-medium mb-2">Usage Scale:</div>
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-gray-200 dark:bg-gray-800 border" />
            <span className="text-xs">Not used</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-blue-200 dark:bg-blue-900 border" />
            <span className="text-xs">1-9</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-blue-400 dark:bg-blue-700 border" />
            <span className="text-xs">10-49</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-blue-600 dark:bg-blue-500 border" />
            <span className="text-xs">50-99</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-blue-800 dark:bg-blue-300 border" />
            <span className="text-xs">100+</span>
          </div>
        </div>
      </div>
    </div>
  )
}
