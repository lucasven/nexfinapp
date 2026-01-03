/**
 * Budget Breakdown Component
 *
 * Story 2.8: Installment Impact on Budget Tracking
 *
 * Displays budget breakdown by category including:
 * - Regular transactions
 * - Installment payments due in the statement period
 * - Visual distinction between transaction types
 * - Installment context (e.g., "Parcela 3/12")
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { getTranslations } from 'next-intl/server'
import { getLocale } from 'next-intl/server'
import { getBudgetForPeriod, getCurrentBudget } from '@/lib/actions/budget'
import { getStatementPeriod, formatStatementPeriod } from '@/lib/utils/statement-period'
import { CalendarIcon, TrendingDownIcon, CreditCardIcon } from "lucide-react"
import type { BudgetCategoryBreakdown } from '@/lib/actions/budget'

/**
 * Props for BudgetBreakdown component
 */
interface BudgetBreakdownProps {
  paymentMethodId: string
  periodStart?: Date
  periodEnd?: Date
  showPeriod?: boolean
  showPerformance?: boolean
}

/**
 * Server Component: Budget Breakdown
 *
 * Fetches and displays budget breakdown for a statement period.
 * Shows regular transactions and installment payments grouped by category.
 */
export async function BudgetBreakdown({
  paymentMethodId,
  periodStart,
  periodEnd,
  showPeriod = true,
  showPerformance = false,
}: BudgetBreakdownProps) {
  const t = await getTranslations()
  const locale = await getLocale()

  // Use provided dates or calculate current statement period
  let period
  if (periodStart && periodEnd) {
    period = { periodStart, periodEnd }
  } else {
    period = getStatementPeriod(new Date(), 5) // TODO Epic 3: Read closing day from payment method
  }

  // Fetch budget data
  const result = await getBudgetForPeriod(
    paymentMethodId,
    period.periodStart,
    period.periodEnd
  )

  if (!result.success || !result.data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            💰 {t('budget.breakdown')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {result.error || t('budget.noExpenses')}
          </p>
        </CardContent>
      </Card>
    )
  }

  const { totalSpent, regularTransactions, installmentPayments, categories, executionTime } =
    result.data

  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: 'BRL',
    }).format(amount)
  }

  // Format statement period
  const periodString = formatStatementPeriod(period, locale)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">
          💰 {t('budget.breakdown')}
        </CardTitle>
        {showPeriod && (
          <p className="text-xs text-muted-foreground mt-1">
            <CalendarIcon className="inline h-3 w-3 mr-1" />
            {periodString}
          </p>
        )}
      </CardHeader>
      <CardContent>
        {/* Total Spent Summary */}
        <div className="mb-4 p-4 bg-muted rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">{t('budget.totalSpent')}</span>
            <span className="text-2xl font-bold">{formatCurrency(totalSpent)}</span>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span>
              📝 {regularTransactions} {regularTransactions === 1 ? 'transação' : 'transações'}
            </span>
            <span>
              📊 {installmentPayments} {installmentPayments === 1 ? 'parcela' : 'parcelas'}
            </span>
          </div>
        </div>

        {/* Empty State */}
        {categories.length === 0 && (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <TrendingDownIcon className="h-12 w-12 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">
              {t('budget.noExpenses')}
            </p>
          </div>
        )}

        {/* Category Breakdown */}
        {categories.length > 0 && (
          <div className="space-y-4">
            {categories.map((category, index) => (
              <CategoryBreakdownSection
                key={category.categoryId || 'uncategorized'}
                category={category}
                formatCurrency={formatCurrency}
                locale={locale}
                t={t}
                isLast={index === categories.length - 1}
              />
            ))}
          </div>
        )}

        {/* Performance Note (dev mode only) */}
        {showPerformance && (
          <p className="text-xs text-muted-foreground mt-4 text-center">
            {t('budget.performanceNote', { time: executionTime.toFixed(2) })}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * Category Breakdown Section
 *
 * Displays a single category with its transactions
 */
function CategoryBreakdownSection({
  category,
  formatCurrency,
  locale,
  t,
  isLast,
}: {
  category: BudgetCategoryBreakdown
  formatCurrency: (amount: number) => string
  locale: string
  t: any
  isLast: boolean
}) {
  const categoryIcon = category.categoryEmoji || '📁'
  const categoryName = category.categoryName || t('budget.uncategorized')

  return (
    <div>
      {/* Category Header */}
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-semibold">
          {categoryIcon} {categoryName}
        </h4>
        <span className="text-sm font-bold">{formatCurrency(category.categoryTotal)}</span>
      </div>

      {/* Transaction List */}
      <div className="space-y-2 ml-6">
        {category.transactions.map((transaction, index) => (
          <div key={`${transaction.date}-${index}`} className="flex items-start justify-between text-sm">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                {transaction.isInstallment && (
                  <CreditCardIcon className="h-3 w-3 text-muted-foreground" />
                )}
                <span className="text-muted-foreground">
                  {transaction.isInstallment && transaction.installmentInfo
                    ? `${transaction.description} (${t('common.locale') === 'pt-BR' ? 'Parcela' : 'Payment'} ${transaction.installmentInfo.paymentNumber}/${transaction.installmentInfo.totalInstallments})`
                    : transaction.description}
                </span>
              </div>
              <span className="text-xs text-muted-foreground ml-5">
                {new Date(transaction.date).toLocaleDateString(locale, {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </span>
            </div>
            <span className="font-medium text-right ml-2">
              {formatCurrency(transaction.amount)}
            </span>
          </div>
        ))}
      </div>

      {/* Separator */}
      {!isLast && <Separator className="mt-4" />}
    </div>
  )
}
