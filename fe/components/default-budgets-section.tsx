'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { BudgetDialog } from "./budget-dialog"
import { deleteBudget } from "@/lib/actions/budgets"
import type { Budget, Category } from "@/lib/types"
import { EditIcon, PlusIcon, RepeatIcon, TrashIcon } from "lucide-react"
import { useTranslations, useLocale } from 'next-intl'
import { formatCurrency } from '@/lib/localization/format'
import { translateCategoryName } from '@/lib/localization/category-translations'

interface DefaultBudgetsSectionProps {
  defaultBudgets: Budget[]
  categories: Category[]
}

export function DefaultBudgetsSection({ defaultBudgets, categories }: DefaultBudgetsSectionProps) {
  const t = useTranslations()
  const locale = useLocale()
  const currentDate = new Date()
  const currentMonth = currentDate.getMonth() + 1
  const currentYear = currentDate.getFullYear()

  return (
    <Card className="mb-8">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <RepeatIcon className="h-5 w-5 text-muted-foreground" />
            <div>
              <CardTitle className="text-lg">{t('budget.defaultBudgetsTitle')}</CardTitle>
              <CardDescription>
                {t('budget.defaultBudgetsDescription')}
              </CardDescription>
            </div>
          </div>
          <BudgetDialog
            categories={categories}
            defaultMode={true}
            currentMonth={currentMonth}
            currentYear={currentYear}
            trigger={
              <Button size="sm">
                <PlusIcon className="h-4 w-4 mr-2" />
                {t('budget.addDefaultBudget')}
              </Button>
            }
          />
        </div>
      </CardHeader>
      <CardContent>
        {defaultBudgets.length === 0 ? (
          <p className="text-muted-foreground text-sm py-4 text-center">
            {t('budget.noDefaultBudgets')}
          </p>
        ) : (
          <div className="space-y-2">
            {defaultBudgets.map((budget) => (
              <div
                key={budget.id}
                className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">{budget.category?.icon}</span>
                  <span className="font-medium">
                    {budget.category?.name && translateCategoryName(budget.category.name, locale as 'pt-br' | 'en')}
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="font-semibold text-lg">
                    {formatCurrency(Number(budget.amount), locale as 'pt-br' | 'en')}
                  </span>
                  <div className="flex gap-1">
                    <BudgetDialog
                      budget={budget}
                      categories={categories}
                      defaultMode={true}
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
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
