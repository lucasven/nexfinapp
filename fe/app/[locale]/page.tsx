import { TransactionList } from "@/components/transaction-list"
import { Header } from "@/components/header"
import { FinancialOverviewCard } from "@/components/dashboard/financial-overview-card"
import { CommitmentsWidget } from "@/components/dashboard/commitments-widget"
import { CollapsibleCategoryBreakdownWrapper } from "@/components/budget/collapsible-category-breakdown-wrapper"
import { BudgetProgressWidgetsSection } from "@/components/dashboard/budget-progress-widgets-section"
import { getBalance, getDashboardTransactions } from "@/lib/actions/transactions"
import { getCategories } from "@/lib/actions/categories"
import { getRecurringPayments } from "@/lib/actions/recurring"
import { getPaymentMethods } from "@/lib/actions/payment-methods"
import { getSupabaseServerClient } from "@/lib/supabase/server"
import { checkIsAdmin } from "@/lib/actions/admin"
import { HomeOnboardingWrapper } from "./home-client"
import { getStatementPeriod } from "@/lib/utils/statement-period"

export default async function HomePage() {
  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // First fetch payment methods to determine statement period
  const paymentMethods = await getPaymentMethods()

  // Find credit mode card with closing day to calculate statement period (for budget widget)
  const creditModeCard = paymentMethods.find(
    pm => pm.type === 'credit' && pm.credit_mode === true && pm.statement_closing_day
  )

  // Collect ALL credit mode payment method IDs for dashboard transaction filtering
  const creditModePaymentMethodIds = paymentMethods
    .filter(pm => pm.type === 'credit' && pm.credit_mode === true)
    .map(pm => pm.id)

  // Calculate date boundaries for two-query approach:
  // - Credit card transactions: from statement period start (fatura atual)
  // - Non-credit card transactions: from current month start
  const now = new Date()
  const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const calendarMonthStart = firstDayOfMonth.toISOString().split('T')[0]

  // Calculate statement period start (use first credit mode card with closing day)
  let statementPeriodStart = calendarMonthStart
  if (creditModeCard?.statement_closing_day) {
    const period = getStatementPeriod(new Date(), creditModeCard.statement_closing_day)
    statementPeriodStart = period.periodStart.toISOString().split('T')[0]
  }

  const [balance, categories, transactions, isAdmin] = await Promise.all([
    getBalance(),
    getCategories(),
    getDashboardTransactions(creditModePaymentMethodIds, statementPeriodStart, calendarMonthStart),
    checkIsAdmin()
  ])

  return (
    <HomeOnboardingWrapper>
      <div className="min-h-screen bg-background">
        <Header
          userEmail={user?.email}
          displayName={user?.user_metadata?.display_name}
          isAdmin={isAdmin}
          categories={categories}
          paymentMethods={paymentMethods}
        />

        <div className="container mx-auto py-8 px-4">
          <div className="space-y-6">
            {/* 3-Column Responsive Grid: Financial Overview | Budget Widget | Commitments */}
            <div className="grid gap-6 grid-cols-1 lg:grid-cols-[300px_1fr_500px] items-start">
              {/* Column 1: Compact Financial Overview (300px) */}
              <FinancialOverviewCard
                income={balance.income}
                expenses={balance.expenses}
                balance={balance.balance}
              />

              {/* Column 2: Budget Progress Widgets (flexible) - Stacks vertically */}
              <div className="space-y-4">
                <BudgetProgressWidgetsSection userId={user?.id} />
              </div>

              {/* Column 3: Commitments Widget (500px) */}
              <CommitmentsWidget />
            </div>

            {/* Collapsible Category Breakdown: Shows top 2 in collapsed state */}
            {creditModeCard && (
              <CollapsibleCategoryBreakdownWrapper paymentMethodId={creditModeCard.id} />
            )}

            <TransactionList transactions={transactions} categories={categories} paymentMethods={paymentMethods} />
          </div>
        </div>
      </div>
    </HomeOnboardingWrapper>
  )
}
