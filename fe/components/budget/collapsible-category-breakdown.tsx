'use client'

/**
 * Collapsible Category Breakdown Component
 *
 * Displays category breakdown with a useful collapsed state:
 * - Collapsed: Shows top 2 categories with progress bars, amounts, percentages
 * - Expanded: Shows all categories with transaction details
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { ChevronDownIcon, ChevronUpIcon, CalendarIcon, CreditCardIcon } from "lucide-react"
import { useTranslations, useLocale } from 'next-intl'
import { formatCurrency } from '@/lib/localization/format'
import { useState } from 'react'
import type { BudgetCategoryBreakdown } from '@/lib/actions/budget'

interface CollapsibleCategoryBreakdownProps {
  categories: BudgetCategoryBreakdown[]
  periodString: string
  totalSpent: number
}

export function CollapsibleCategoryBreakdown({
  categories,
  periodString,
  totalSpent
}: CollapsibleCategoryBreakdownProps) {
  const t = useTranslations()
  const locale = useLocale()
  const [isExpanded, setIsExpanded] = useState(false)

  if (categories.length === 0) {
    return null
  }

  // Sort categories by total amount (descending)
  const sortedCategories = [...categories].sort((a, b) => b.categoryTotal - a.categoryTotal)

  // Top 2 categories for collapsed view
  const topCategories = sortedCategories.slice(0, 2)
  const remainingCount = sortedCategories.length - 2

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <div className="flex-1">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            💰 {t('dashboard.categoryBreakdown')}
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            <CalendarIcon className="inline h-3 w-3 mr-1" />
            {periodString}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsExpanded(!isExpanded)}
          className="gap-1"
        >
          {isExpanded ? (
            <>
              Ocultar
              <ChevronUpIcon className="h-4 w-4" />
            </>
          ) : (
            <>
              {t('dashboard.viewAll')}
              <ChevronDownIcon className="h-4 w-4" />
            </>
          )}
        </Button>
      </CardHeader>
      <CardContent>
        {!isExpanded ? (
          // Collapsed View: Top 2 categories with progress bars
          <div className="space-y-4">
            {topCategories.map((category) => {
              const percentage = totalSpent > 0 ? (category.categoryTotal / totalSpent) * 100 : 0
              const icon = category.categoryEmoji || '📁'
              const name = category.categoryName || t('common.uncategorized')

              return (
                <div key={category.categoryId || 'uncategorized'} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{icon}</span>
                      <span className="text-sm font-medium">{name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold">
                        {formatCurrency(category.categoryTotal, locale as 'pt-br' | 'en')}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        ({percentage.toFixed(0)}%)
                      </span>
                    </div>
                  </div>
                  <Progress value={percentage} className="h-2" />
                </div>
              )
            })}

            {remainingCount > 0 && (
              <p className="text-xs text-muted-foreground text-center pt-2">
                {t('dashboard.moreCategories', { count: remainingCount })}
              </p>
            )}
          </div>
        ) : (
          // Expanded View: All categories with full details
          <div className="space-y-6">
            {sortedCategories.map((category) => {
              const percentage = totalSpent > 0 ? (category.categoryTotal / totalSpent) * 100 : 0
              const icon = category.categoryEmoji || '📁'
              const name = category.categoryName || t('common.uncategorized')
              const transactionCount = category.transactions.length
              const installmentCount = category.transactions.filter(t => t.isInstallment).length

              return (
                <div key={category.categoryId || 'uncategorized'} className="space-y-3">
                  {/* Category Header with Progress Bar */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{icon}</span>
                        <span className="text-sm font-semibold">{name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold">
                          {formatCurrency(category.categoryTotal, locale as 'pt-br' | 'en')}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          ({percentage.toFixed(0)}%)
                        </span>
                      </div>
                    </div>
                    <Progress value={percentage} className="h-2" />
                  </div>

                  {/* Transaction/Installment Count */}
                  <div className="flex items-center gap-3 text-xs text-muted-foreground ml-8">
                    <span>
                      {transactionCount} {transactionCount === 1 ? 'transação' : 'transações'}
                    </span>
                    {installmentCount > 0 && (
                      <>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <CreditCardIcon className="h-3 w-3" />
                          Inclui {installmentCount} {installmentCount === 1 ? 'parcelamento' : 'parcelamentos'}
                        </span>
                      </>
                    )}
                  </div>

                  {/* Transaction Details (optional - only show if expanded) */}
                  {category.transactions.length === 0 && (
                    <p className="text-xs text-muted-foreground ml-8">
                      Nenhuma transação
                    </p>
                  )}
                </div>
              )
            })}

            {/* Total Summary */}
            <div className="pt-4 border-t">
              <div className="flex items-center justify-between text-sm font-semibold">
                <span>Total</span>
                <span>{formatCurrency(totalSpent, locale as 'pt-br' | 'en')} em {sortedCategories.length} categorias</span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
