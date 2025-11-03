import { BalanceCard } from "@/components/balance-card"
import { TransactionDialog } from "@/components/transaction-dialog"
import { TransactionList } from "@/components/transaction-list"
import { UserMenu } from "@/components/user-menu"
import { getBalance, getCategories, getTransactions } from "@/lib/actions/transactions"
import { getSupabaseServerClient } from "@/lib/supabase/server"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { BarChart3Icon, RepeatIcon, TargetIcon } from "lucide-react"

export default async function HomePage() {
  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const [balance, categories, transactions] = await Promise.all([getBalance(), getCategories(), getTransactions()])

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto py-8 px-4">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Expense Tracker</h1>
            <p className="text-muted-foreground mt-1">Manage your finances with ease</p>
          </div>
          <div className="flex gap-2 items-center">
            <Button variant="outline" asChild>
              <Link href="/reports">
                <BarChart3Icon className="h-4 w-4 mr-2" />
                Reports
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/budgets">
                <TargetIcon className="h-4 w-4 mr-2" />
                Budgets
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/recurring">
                <RepeatIcon className="h-4 w-4 mr-2" />
                Recurring
              </Link>
            </Button>
            <TransactionDialog categories={categories} />
            <UserMenu userEmail={user?.email} displayName={user?.user_metadata?.display_name} />
          </div>
        </div>

        <div className="space-y-6">
          <BalanceCard income={balance.income} expenses={balance.expenses} balance={balance.balance} />

          <TransactionList transactions={transactions} categories={categories} />
        </div>
      </div>
    </div>
  )
}
