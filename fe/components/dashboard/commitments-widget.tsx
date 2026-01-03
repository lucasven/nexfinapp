import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { CalendarIcon, CreditCardIcon, RepeatIcon } from "lucide-react"
import { getTranslations } from 'next-intl/server'
import { getFutureCommitments, getFutureCommitmentsByMonth } from '@/lib/actions/installments'
import { getRecurringPayments } from '@/lib/actions/recurring'
import { formatCurrency } from '@/lib/localization/format'
import { Link } from '@/lib/localization/link'
import { getSupabaseServerClient } from '@/lib/supabase/server'

interface CommitmentItem {
  id: string
  type: 'recurring' | 'installment'
  date: string
  description: string
  amount: number
  icon: string
  categoryName: string
}

/**
 * Server Component: Merged Commitments Widget
 *
 * Displays both upcoming recurring payments and installments in a single unified view.
 * Shows top 3 items sorted by date, with a "View all" link.
 */
export async function CommitmentsWidget() {
  const t = await getTranslations()
  const supabase = await getSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Fetch both data sources
  const [recurringResult, installmentsResult] = await Promise.all([
    getRecurringPayments(),
    getFutureCommitments()
  ])

  const recurringPayments = recurringResult || []
  const futureCommitments = installmentsResult.success ? installmentsResult.data || [] : []

  // Transform recurring payments to commitment items
  const recurringCommitments: CommitmentItem[] = recurringPayments
    .filter(p => !p.is_paid)
    .map(payment => ({
      id: payment.id,
      type: 'recurring' as const,
      date: payment.due_date,
      description: payment.recurring_transaction.description || payment.recurring_transaction.category?.name || 'Recurring Payment',
      amount: payment.recurring_transaction.amount,
      icon: payment.recurring_transaction.category?.icon || '🔄',
      categoryName: payment.recurring_transaction.category?.name || 'Recurring'
    }))

  // Transform installment commitments (fetch first month's details)
  let installmentCommitments: CommitmentItem[] = []

  if (futureCommitments.length > 0) {
    const firstMonth = futureCommitments[0]
    const detailsResult = await getFutureCommitmentsByMonth(firstMonth.month)

    if (detailsResult.success && detailsResult.data) {
      installmentCommitments = detailsResult.data.map(detail => ({
        id: detail.plan_id,
        type: 'installment' as const,
        date: firstMonth.month + '-01', // Use first day of month as date
        description: detail.description || 'Installment',
        amount: detail.amount,
        icon: '💳',
        categoryName: 'Installment'
      }))
    }
  }

  // Merge and sort by date
  const allCommitments = [...recurringCommitments, ...installmentCommitments]
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  // Get top 3
  const topCommitments = allCommitments.slice(0, 3)
  const hasMore = allCommitments.length > 3

  // Empty state
  if (allCommitments.length === 0) {
    return (
      <Card className="h-fit">
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <CalendarIcon className="h-5 w-5 text-muted-foreground" />
            {t('dashboard.commitments')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="rounded-full bg-muted p-3 mb-3">
              <CalendarIcon className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-muted-foreground mb-1">
              {t('dashboard.noCommitments')}
            </p>
            <p className="text-xs text-muted-foreground">
              {t('dashboard.noCommitmentsHint')}
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="h-fit">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <CalendarIcon className="h-5 w-5 text-muted-foreground" />
          {t('dashboard.commitments')}
        </CardTitle>
        {hasMore && (
          <Link href="/installments">
            <Button variant="ghost" size="sm" className="h-8 text-xs">
              {t('dashboard.viewAll')}
            </Button>
          </Link>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {topCommitments.map((commitment) => {
          const date = new Date(commitment.date)
          const locale = user?.user_metadata?.locale || 'pt-br'
          const dateStr = date.toLocaleDateString(locale, {
            month: 'short',
            day: 'numeric'
          })

          return (
            <div
              key={`${commitment.type}-${commitment.id}`}
              className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30"
            >
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-background">
                <span className="text-xl">{commitment.icon}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{commitment.description}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <p className="text-xs text-muted-foreground">{dateStr}</p>
                  <span className="text-xs text-muted-foreground">•</span>
                  <div className="flex items-center gap-1">
                    {commitment.type === 'recurring' ? (
                      <RepeatIcon className="h-3 w-3 text-muted-foreground" />
                    ) : (
                      <CreditCardIcon className="h-3 w-3 text-muted-foreground" />
                    )}
                    <p className="text-xs text-muted-foreground">{commitment.categoryName}</p>
                  </div>
                </div>
              </div>
              <p className="text-sm font-bold text-red-600">
                {formatCurrency(commitment.amount, locale as 'pt-br' | 'en')}
              </p>
            </div>
          )
        })}

        {hasMore && (
          <p className="text-xs text-center text-muted-foreground pt-2">
            {t('dashboard.moreCommitments', { count: allCommitments.length - 3 })}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
