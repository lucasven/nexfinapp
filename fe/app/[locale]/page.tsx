import { TransactionList } from "@/components/transaction-list"
import { Header } from "@/components/header"
import { FinancialOverviewCard } from "@/components/dashboard/financial-overview-card"
import { CommitmentsWidget } from "@/components/dashboard/commitments-widget"
import { CollapsibleCategoryBreakdownWrapper } from "@/components/budget/collapsible-category-breakdown-wrapper"
import { BudgetProgressWidgetsSection } from "@/components/dashboard/budget-progress-widgets-section"
import { getBalance, getTransactions } from "@/lib/actions/transactions"
import { getCategories } from "@/lib/actions/categories"
import { getRecurringPayments } from "@/lib/actions/recurring"
import { getPaymentMethods } from "@/lib/actions/payment-methods"
import { getSupabaseServerClient } from "@/lib/supabase/server"
import { checkIsAdmin } from "@/lib/actions/admin"
import { HomeOnboardingWrapper } from "./home-client"

export default async function HomePage() {
  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const [balance, categories, transactions, paymentMethods, isAdmin] = await Promise.all([
    getBalance(),
    getCategories(),
    getTransactions(),
    getPaymentMethods(),
    checkIsAdmin()
  ])

  // Find first credit card with credit mode enabled for budget breakdown
  const creditModeCard = paymentMethods.find(pm => pm.type === 'credit' && pm.credit_mode === true)

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
