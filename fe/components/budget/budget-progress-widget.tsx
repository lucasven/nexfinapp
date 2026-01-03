/**
 * Budget Progress Widget Component
 * Story 3.3: Budget Progress Dashboard Statement Period
 *
 * Displays budget progress for a Credit Mode credit card with:
 * - Statement period dates
 * - Spent amount vs budget amount
 * - Remaining amount or overage
 * - Percentage used
 * - Progress bar visualization
 * - Days until statement closing
 *
 * Awareness-first design: neutral colors, non-judgmental language
 */

'use client'

import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { format } from 'date-fns'
import { ptBR, enUS } from 'date-fns/locale'
import type { BudgetProgress } from '@/lib/supabase/rpc-types'
import { BudgetProgressBar } from './budget-progress-bar'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface BudgetProgressWidgetProps {
  budgetProgress: BudgetProgress
  locale?: string
}

/**
 * Format currency amount
 */
function formatCurrency(amount: number, locale: string = 'pt-BR'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount)
}

/**
 * Format date range for statement period
 */
function formatPeriod(start: Date, end: Date, locale: string = 'pt-BR'): string {
  const dateLocale = locale === 'pt-BR' ? ptBR : enUS
  const startStr = format(start, 'd MMM', { locale: dateLocale })
  const endStr = format(end, 'd MMM', { locale: dateLocale })
  return `${startStr} - ${endStr}`
}

/**
 * Get status badge styling (awareness-first)
 */
function getStatusBadgeStyle(status: BudgetProgress['status']): string {
  switch (status) {
    case 'on-track':
      return 'bg-blue-100 text-blue-700 border-blue-200'
    case 'near-limit':
      return 'bg-amber-100 text-amber-700 border-amber-200'
    case 'exceeded':
      return 'bg-gray-100 text-gray-700 border-gray-200'
    default:
      return 'bg-blue-100 text-blue-700 border-blue-200'
  }
}

export function BudgetProgressWidget({
  budgetProgress,
  locale = 'pt-BR'
}: BudgetProgressWidgetProps) {
  const t = useTranslations('budgetProgress')

  const {
    paymentMethodName,
    monthlyBudget,
    spentAmount,
    remainingAmount,
    percentageUsed,
    status,
    periodStart,
    periodEnd,
    daysUntilClosing
  } = budgetProgress

  // Format amounts
  const spentFormatted = formatCurrency(spentAmount, locale)
  const budgetFormatted = formatCurrency(monthlyBudget, locale)
  const remainingFormatted = formatCurrency(Math.abs(remainingAmount), locale)

  // Format period
  const periodFormatted = formatPeriod(periodStart, periodEnd, locale)

  // Determine remaining/exceeded message
  const isExceeded = remainingAmount < 0
  const remainingMessage = isExceeded
    ? t('exceededBy', { amount: remainingFormatted })
    : t('remaining', { amount: remainingFormatted })

  // Days until closing message
  let daysMessage: string
  if (daysUntilClosing === 0) {
    daysMessage = t('closesToday')
  } else if (daysUntilClosing === 1) {
    daysMessage = t('closesTomorrow')
  } else {
    daysMessage = t('daysUntilClosing', { days: daysUntilClosing })
  }

  // Status label
  const statusLabels = {
    'on-track': t('statusOnTrack'),
    'near-limit': t('statusNearLimit'),
    'exceeded': t('statusExceeded')
  }

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-lg font-semibold">
              {paymentMethodName}
            </CardTitle>
            <CardDescription className="text-sm text-muted-foreground">
              {periodFormatted}
            </CardDescription>
          </div>
          <div
            className={cn(
              'px-2 py-1 rounded-md text-xs font-medium border',
              getStatusBadgeStyle(status)
            )}
          >
            {statusLabels[status]}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Amounts */}
        <div className="space-y-1">
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold">
              {spentFormatted}
            </span>
            <span className="text-sm text-muted-foreground">
              / {budgetFormatted}
            </span>
          </div>
          <p className={cn(
            "text-sm",
            isExceeded ? "text-gray-600" : "text-muted-foreground"
          )}>
            {remainingMessage}
          </p>
        </div>

        {/* Progress Bar */}
        <div className="space-y-2">
          <BudgetProgressBar
            percentage={percentageUsed}
            status={status}
          />
          <p className="text-xs text-muted-foreground text-right">
            {t('percentageUsed', { percentage: percentageUsed.toFixed(1) })}
          </p>
        </div>

        {/* Days until closing */}
        <div className="pt-2 border-t">
          <p className="text-xs text-muted-foreground">
            {daysMessage}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * Empty State: No Budget Set
 * Shows when Credit Mode card has closing date but no budget
 */
export function BudgetEmptyState({
  paymentMethodName,
  paymentMethodId,
  locale = 'pt-BR'
}: {
  paymentMethodName: string
  paymentMethodId: string
  locale?: string
}) {
  const t = useTranslations('budgetProgress')

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-lg font-semibold">
          {paymentMethodName}
        </CardTitle>
        <CardDescription className="text-sm text-muted-foreground">
          {t('noBudgetSet')}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {t('noClosingDateSet')}
        </p>
        <Link href={`/settings/payment-methods/${paymentMethodId}`}>
          <Button variant="outline" size="sm" className="w-full">
            {t('noBudgetCTA')}
          </Button>
        </Link>
      </CardContent>
    </Card>
  )
}

/**
 * Empty State: No Closing Date Set
 * Shows when Credit Mode card has no closing date configured
 */
export function ClosingDateEmptyState({
  paymentMethodName,
  paymentMethodId,
  locale = 'pt-BR'
}: {
  paymentMethodName: string
  paymentMethodId: string
  locale?: string
}) {
  const t = useTranslations('budgetProgress')

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-lg font-semibold">
          {paymentMethodName}
        </CardTitle>
        <CardDescription className="text-sm text-muted-foreground">
          {t('noClosingDateSet')}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {t('noClosingDateSet')}
        </p>
        <Link href={`/settings/payment-methods/${paymentMethodId}`}>
          <Button variant="outline" size="sm" className="w-full">
            {t('noClosingDateCTA')}
          </Button>
        </Link>
      </CardContent>
    </Card>
  )
}

/**
 * Error State: Failed to Load Budget
 */
export function BudgetErrorState({
  paymentMethodName,
  onRetry
}: {
  paymentMethodName: string
  onRetry?: () => void
}) {
  const t = useTranslations('budgetProgress')

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-lg font-semibold">
          {paymentMethodName}
        </CardTitle>
        <CardDescription className="text-sm text-destructive">
          {t('errorLoading')}
        </CardDescription>
      </CardHeader>

      <CardContent>
        {onRetry && (
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={onRetry}
          >
            {t('retryButton')}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
