import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import type { Budget, Category } from "@/lib/types"
import { AlertCircleIcon, CheckCircleIcon, EditIcon, TrashIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { BudgetDialog } from "./budget-dialog"
import { deleteBudget } from "@/lib/actions/budgets"

interface BudgetCardProps {
  budget: Budget & {
    spent: number
    remaining: number
    percentage: number
    category?: Category
  }
  categories: Category[]
  currentMonth: number
  currentYear: number
}

export function BudgetCard({ budget, categories, currentMonth, currentYear }: BudgetCardProps) {
  const isOverBudget = budget.spent > Number(budget.amount)
  const isNearLimit = budget.percentage >= 80 && !isOverBudget

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base font-medium">
          <span className="inline-flex items-center gap-2">
            {budget.category?.icon} {budget.category?.name}
          </span>
        </CardTitle>
        <div className="flex gap-1">
          <BudgetDialog
            categories={categories}
            budget={budget}
            currentMonth={currentMonth}
            currentYear={currentYear}
            trigger={
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <EditIcon className="h-4 w-4" />
              </Button>
            }
          />
          <form action={deleteBudget.bind(null, budget.id)}>
            <Button variant="ghost" size="icon" className="h-8 w-8" type="submit">
              <TrashIcon className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Spent</span>
            <span className={`font-semibold ${isOverBudget ? "text-red-600" : ""}`}>R$ {budget.spent.toFixed(2)}</span>
          </div>

          <Progress
            value={Math.min(budget.percentage, 100)}
            className="h-2"
            indicatorClassName={isOverBudget ? "bg-red-600" : isNearLimit ? "bg-yellow-600" : "bg-green-600"}
          />

          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Budget</span>
            <span className="font-semibold">R$ {Number(budget.amount).toFixed(2)}</span>
          </div>

          <div className="flex items-center justify-between pt-2 border-t">
            <div className="flex items-center gap-2">
              {isOverBudget ? (
                <>
                  <AlertCircleIcon className="h-4 w-4 text-red-600" />
                  <span className="text-sm font-medium text-red-600">Over budget</span>
                </>
              ) : isNearLimit ? (
                <>
                  <AlertCircleIcon className="h-4 w-4 text-yellow-600" />
                  <span className="text-sm font-medium text-yellow-600">Near limit</span>
                </>
              ) : (
                <>
                  <CheckCircleIcon className="h-4 w-4 text-green-600" />
                  <span className="text-sm font-medium text-green-600">On track</span>
                </>
              )}
            </div>
            <span className={`text-sm font-semibold ${budget.remaining < 0 ? "text-red-600" : "text-green-600"}`}>
              {budget.remaining < 0 ? "-" : "+"}R$ {Math.abs(budget.remaining).toFixed(2)}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
