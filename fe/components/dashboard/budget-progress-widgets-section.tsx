/**
 * Budget Progress Widgets Section
 * Story 3.3: Budget Progress Dashboard Statement Period
 *
 * Client component that fetches and displays budget progress widgets
 * for all Credit Mode credit cards with budgets set.
 *
 * Features:
 * - React Query for data fetching and caching (5-minute cache)
 * - Loading skeletons during fetch
 * - Error handling with retry
 * - Empty states for no budget / no closing date
 * - Sorted by next closing date (soonest first)
 */

'use client'

import { useAllBudgetProgress } from '@/lib/hooks/useBudgetProgress'
import { BudgetProgressWidget } from '@/components/budget/budget-progress-widget'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useLocale } from 'next-intl'

interface BudgetProgressWidgetsSectionProps {
  userId?: string
}

/**
 * Loading skeleton for budget progress widget
 */
function BudgetProgressSkeleton() {
  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-24" />
          </div>
          <Skeleton className="h-6 w-20" />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <div className="flex items-baseline justify-between">
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-4 w-20" />
          </div>
          <Skeleton className="h-4 w-32" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-2 w-full" />
          <Skeleton className="h-3 w-16 ml-auto" />
        </div>
        <div className="pt-2 border-t">
          <Skeleton className="h-3 w-28" />
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * Budget Progress Widgets Section
 *
 * Displays budget progress widgets for all Credit Mode cards with budgets.
 * Only shows this section if user has at least one eligible card.
 */
export function BudgetProgressWidgetsSection({ userId }: BudgetProgressWidgetsSectionProps) {
  const locale = useLocale()
  const { data: budgetProgressList, isLoading, error, refetch } = useAllBudgetProgress(userId)

  // Don't render section if no data and not loading
  if (!isLoading && (!budgetProgressList || budgetProgressList.length === 0)) {
    return null
  }

  return (
    <>
      {/* Loading State */}
      {isLoading && (
        <BudgetProgressSkeleton />
      )}

      {/* Error State */}
      {error && (
        <Card className="w-full border-destructive">
          <CardHeader>
            <div className="text-sm text-destructive">
              Erro ao carregar orçamentos. Tente novamente.
            </div>
          </CardHeader>
          <CardContent>
            <button
              onClick={() => refetch()}
              className="text-sm text-primary hover:underline"
            >
              Tentar novamente
            </button>
          </CardContent>
        </Card>
      )}

      {/* Budget Progress Widgets - Just the cards, no wrapper */}
      {!isLoading && budgetProgressList && budgetProgressList.length > 0 && (
        <>
          {budgetProgressList.map((budgetProgress) => (
            <BudgetProgressWidget
              key={budgetProgress.paymentMethodId}
              budgetProgress={budgetProgress}
              locale={locale}
            />
          ))}
        </>
      )}
    </>
  )
}
