import { BudgetCard } from "@/components/budget-card"
import { BudgetDialog } from "@/components/budget-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { UserMenu } from "@/components/user-menu"
import { getBudgetWithSpending } from "@/lib/actions/budgets"
import { getCategories } from "@/lib/actions/categories"
import { getSupabaseServerClient } from "@/lib/supabase/server"
import { ArrowLeftIcon } from "lucide-react"
import { Link } from "@/lib/localization/link"
import { getTranslations, getLocale } from 'next-intl/server'
import { getMonthName } from '@/lib/localization/format'

export default async function BudgetsPage() {
  const t = await getTranslations()
  const locale = await getLocale()
  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const currentDate = new Date()
  const currentMonth = currentDate.getMonth() + 1
  const currentYear = currentDate.getFullYear()

  const [budgets, categories] = await Promise.all([getBudgetWithSpending(currentMonth, currentYear), getCategories()])

  const monthName = `${getMonthName(currentMonth, locale as 'pt-br' | 'en')} ${currentYear}`

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto py-8 px-4">
        <div className="flex items-center gap-4 mb-8">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/">
              <ArrowLeftIcon className="h-4 w-4" />
            </Link>
          </Button>
          <div className="flex-1">
            <h1 className="text-3xl font-bold tracking-tight">{t('nav.budgets')}</h1>
            <p className="text-muted-foreground mt-1">{t('budget.subtitle')} {monthName}</p>
          </div>
          <BudgetDialog categories={categories} currentMonth={currentMonth} currentYear={currentYear} />
          <UserMenu userEmail={user?.email} displayName={user?.user_metadata?.display_name} />
        </div>

        {budgets.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>{t('budget.noBudgets')}</CardTitle>
              <CardDescription>{t('budget.addFirstBudget')}</CardDescription>
            </CardHeader>
            <CardContent>
              <BudgetDialog
                categories={categories}
                currentMonth={currentMonth}
                currentYear={currentYear}
                trigger={<Button>{t('budget.addTitle')}</Button>}
              />
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {budgets.map((budget) => (
              <BudgetCard
                key={budget.id}
                budget={budget}
                categories={categories}
                currentMonth={currentMonth}
                currentYear={currentYear}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
