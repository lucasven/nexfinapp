import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { CalendarIcon, PlusIcon } from "lucide-react"
import { getTranslations } from 'next-intl/server'
import { getFutureCommitments } from '@/lib/actions/installments'
import { FutureCommitmentsMonthList } from './future-commitments-month-list'
import { trackServerEvent } from '@/lib/analytics/server-tracker'
import { AnalyticsEvent } from '@/lib/analytics/events'
import { Link } from '@/lib/localization/link'
import { getSupabaseServerClient } from '@/lib/supabase/server'

/**
 * Server Component: Future Commitments Dashboard Widget
 *
 * Displays the next 12 months of installment payment obligations.
 * Fetches data server-side for optimal performance and SEO.
 */
export async function FutureCommitmentsWidget() {
  const t = await getTranslations()

  // Get authenticated user for analytics
  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Fetch future commitments data
  const result = await getFutureCommitments()
  const commitments = result.success ? result.data || [] : []

  // Track analytics for empty state
  if (user && commitments.length === 0) {
    await trackServerEvent(user.id, AnalyticsEvent.FUTURE_COMMITMENTS_EMPTY_STATE_VIEWED, {
      channel: 'web',
    })
  } else if (user) {
    // Track analytics for view
    const totalCommitment = commitments.reduce((sum, c) => sum + c.total_due, 0)
    const totalPayments = commitments.reduce((sum, c) => sum + c.payment_count, 0)

    await trackServerEvent(user.id, AnalyticsEvent.FUTURE_COMMITMENTS_VIEWED, {
      monthCount: commitments.length,
      totalCommitment,
      paymentCount: totalPayments,
      channel: 'web',
    })
  }

  // Empty state
  if (commitments.length === 0) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">
            📊 {t('futureCommitments.title')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <CalendarIcon className="h-12 w-12 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground mb-4">
              {t('futureCommitments.emptyState')}
            </p>
            <Button asChild size="sm">
              <Link href="/installments">
                <PlusIcon className="h-4 w-4 mr-2" />
                {t('futureCommitments.createButton')}
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">
          📊 {t('futureCommitments.title')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <FutureCommitmentsMonthList commitments={commitments} />
      </CardContent>
    </Card>
  )
}
