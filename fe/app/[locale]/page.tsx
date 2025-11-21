import { BalanceCard } from "@/components/balance-card"
import { TransactionList } from "@/components/transaction-list"
import { UserMenu } from "@/components/user-menu"
import { UpcomingRecurringWidget } from "@/components/upcoming-recurring-widget"
import { getBalance, getTransactions } from "@/lib/actions/transactions"
import { getCategories } from "@/lib/actions/categories"
import { getRecurringPayments } from "@/lib/actions/recurring"
import { getSupabaseServerClient } from "@/lib/supabase/server"
import { checkIsAdmin } from "@/lib/actions/admin"
import { Link } from "@/lib/localization/link"
import { Button } from "@/components/ui/button"
import { BarChart3Icon, RepeatIcon, TargetIcon, FolderIcon } from "lucide-react"
import { getTranslations } from 'next-intl/server'
import { HomeOnboardingWrapper } from "./home-client"
import { TransactionDialogWrapper } from "./transaction-dialog-wrapper"

export default async function HomePage() {
  const t = await getTranslations()
  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const [balance, categories, transactions, recurringPayments, isAdmin] = await Promise.all([
    getBalance(),
    getCategories(),
    getTransactions(),
    getRecurringPayments(), // Get current month's recurring payments
    checkIsAdmin()
  ])

  return (
    <HomeOnboardingWrapper>
      <div className="min-h-screen bg-background">
        <div className="container mx-auto py-8 px-4">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">{t('home.title')}</h1>
              <p className="text-muted-foreground mt-1">{t('home.subtitle')}</p>
            </div>
            <div className="flex gap-2 items-center" data-onboarding-features>
              <Button variant="outline" asChild>
                <Link href="/reports">
                  <BarChart3Icon className="h-4 w-4 mr-2" />
                  {t('nav.reports')}
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/budgets">
                  <TargetIcon className="h-4 w-4 mr-2" />
                  {t('nav.budgets')}
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/categories">
                  <FolderIcon className="h-4 w-4 mr-2" />
                  {t('nav.categories')}
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/recurring">
                  <RepeatIcon className="h-4 w-4 mr-2" />
                  {t('nav.recurring')}
                </Link>
              </Button>
              <div data-onboarding-add-transaction>
                <TransactionDialogWrapper categories={categories} />
              </div>
              <UserMenu userEmail={user?.email} displayName={user?.user_metadata?.display_name} isAdmin={isAdmin} />
            </div>
          </div>

          <div className="space-y-6">
            <div className="grid gap-6">
              <BalanceCard income={balance.income} expenses={balance.expenses} balance={balance.balance} />
              <UpcomingRecurringWidget payments={recurringPayments} />
            </div>

            <TransactionList transactions={transactions} categories={categories} />
          </div>
        </div>
      </div>
    </HomeOnboardingWrapper>
  )
}
