'use client'

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import type { Budget, Category } from "@/lib/types"
import { AlertCircleIcon, CheckCircleIcon, EditIcon, TrashIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { BudgetDialog } from "./budget-dialog"
import { deleteBudget } from "@/lib/actions/budgets"
import { useTranslations, useLocale } from 'next-intl'
import { formatCurrency } from '@/lib/localization/format'
import { translateCategoryName } from '@/lib/localization/category-translations'

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
  const t = useTranslations()
  const locale = useLocale()
  const isOverBudget = budget.spent > Number(budget.amount)
  const isNearLimit = budget.percentage >= 80 && !isOverBudget

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base font-medium">
          <span className="inline-flex items-center gap-2">
            {budget.category?.icon} {budget.category?.name && translateCategoryName(budget.category.name, locale as 'pt-br' | 'en')}
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
            <span className="text-muted-foreground">{t('budget.spent')}</span>
            <span className={`font-semibold ${isOverBudget ? "text-red-600" : ""}`}>{formatCurrency(budget.spent, locale as 'pt-br' | 'en')}</span>
          </div>

          <Progress
            value={Math.min(budget.percentage, 100)}
            className="h-2"
            indicatorClassName={isOverBudget ? "bg-red-600" : isNearLimit ? "bg-yellow-600" : "bg-green-600"}
          />

          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{t('budget.title')}</span>
            <span className="font-semibold">{formatCurrency(Number(budget.amount), locale as 'pt-br' | 'en')}</span>
          </div>

          <div className="flex items-center justify-between pt-2 border-t">
            <div className="flex items-center gap-2">
              {isOverBudget ? (
                <>
                  <AlertCircleIcon className="h-4 w-4 text-red-600" />
                  <span className="text-sm font-medium text-red-600">{t('budget.overBudget')}</span>
                </>
              ) : isNearLimit ? (
                <>
                  <AlertCircleIcon className="h-4 w-4 text-yellow-600" />
                  <span className="text-sm font-medium text-yellow-600">{t('budget.nearLimit')}</span>
                </>
              ) : (
                <>
                  <CheckCircleIcon className="h-4 w-4 text-green-600" />
                  <span className="text-sm font-medium text-green-600">{t('budget.onTrack')}</span>
                </>
              )}
            </div>
            <span className={`text-sm font-semibold ${budget.remaining < 0 ? "text-red-600" : "text-green-600"}`}>
              {budget.remaining < 0 ? "-" : "+"}{formatCurrency(Math.abs(budget.remaining), locale as 'pt-br' | 'en')}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
