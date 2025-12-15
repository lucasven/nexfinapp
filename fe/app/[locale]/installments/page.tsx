import { getSupabaseServerClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { getInstallmentPlans, getInstallmentCounts } from "@/lib/actions/installments"
import { trackServerEvent } from "@/lib/analytics/server-tracker"
import { AnalyticsEvent } from "@/lib/analytics/events"
import InstallmentsClient from "./installments-client"
import { Header } from "@/components/header"
import { getPaymentMethods } from "@/lib/actions/payment-methods"
import { getCategories } from "@/lib/actions/categories"
import { checkIsAdmin } from "@/lib/actions/admin"

/**
 * Story 2.4: View All Installments (Active & History)
 *
 * Server Component: Fetches data and passes to client component
 *
 * This page allows users to:
 * - View all installment plans across three tabs (Active, Paid Off, Cancelled)
 * - See payment progress with visual indicators
 * - Access detailed payment schedules
 * - Navigate through paginated results
 */

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>

export default async function InstallmentsPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const supabase = await getSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/auth/login")
  }

  // Get search params
  const params = await searchParams
  const tab = (params.tab as string) || 'active'
  const page = parseInt((params.page as string) || '1', 10)

  // Validate tab parameter
  const validTabs = ['active', 'paid_off']
  const currentTab = validTabs.includes(tab) ? (tab as 'active' | 'paid_off') : 'active'

  // Validate page parameter
  const currentPage = page > 0 ? page : 1

  // Fetch installment counts for tab badges
  const countsResult = await getInstallmentCounts(user.id)
  const counts = countsResult.success ? countsResult.data! : { active: 0, paid_off: 0, cancelled: 0 }

  // Fetch installments for current tab and page
  const queryStartTime = performance.now()
  const installmentsResult = await getInstallmentPlans(user.id, currentTab, currentPage, 20)
  const queryExecutionTime = performance.now() - queryStartTime

  const installments = installmentsResult.success ? installmentsResult.installments! : []
  const total = installmentsResult.success ? installmentsResult.total! : 0

  // Fetch data needed for header and edit dialog
  const [allCategories, paymentMethods, isAdmin] = await Promise.all([
    getCategories(),
    getPaymentMethods(),
    checkIsAdmin()
  ])

  // Track analytics event
  await trackServerEvent(user.id, AnalyticsEvent.INSTALLMENTS_PAGE_VIEWED, {
    userId: user.id,
    tab: currentTab,
    page: currentPage,
    installmentCount: installments.length,
    totalInstallments: total,
    queryExecutionTime: Math.round(queryExecutionTime),
    timestamp: new Date().toISOString()
  })

  // Track empty state if no installments
  if (installments.length === 0) {
    await trackServerEvent(user.id, AnalyticsEvent.INSTALLMENTS_EMPTY_STATE_VIEWED, {
      userId: user.id,
      tab: currentTab,
      channel: 'web',
      timestamp: new Date().toISOString()
    })
  }

  const t = await getTranslations('installments')

  return (
    <div className="min-h-screen bg-background">
      <Header
        userEmail={user?.email}
        displayName={user?.user_metadata?.display_name}
        isAdmin={isAdmin}
        categories={allCategories}
        paymentMethods={paymentMethods}
      />

      <div className="container mx-auto py-8 px-4 max-w-7xl">
        <div className="mb-6">
          <h1 className="text-3xl font-bold">{t('pageTitle')}</h1>
        </div>

        <InstallmentsClient
          initialInstallments={installments}
          initialTab={currentTab}
          initialPage={currentPage}
          counts={counts}
          total={total}
          userId={user.id}
          categories={allCategories || []}
          paymentMethods={paymentMethods || []}
        />
      </div>
    </div>
  )
}
