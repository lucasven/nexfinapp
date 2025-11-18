import { Metadata } from "next"
import { redirect } from "next/navigation"
import { Button } from "@/components/ui/button"
import { ArrowLeftIcon } from "lucide-react"
import { Link } from "@/lib/localization/link"
import { getTranslations, getLocale } from 'next-intl/server'
import { UserMenu } from "@/components/user-menu"
import { getSupabaseServerClient } from "@/lib/supabase/server"
import { ReportsViewer } from "@/components/reports-viewer"

export const metadata: Metadata = {
  title: "Reports | Expense Tracker",
  description: "View your financial reports and analytics",
}

export default async function ReportsPage() {
  const t = await getTranslations()
  const locale = await getLocale()
  const supabase = await getSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/auth/login")
  }

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
            <h1 className="text-3xl font-bold tracking-tight">{t('reports.title')}</h1>
            <p className="text-muted-foreground mt-1">{t('reports.subtitle')}</p>
          </div>
          <UserMenu
            userEmail={user.email ?? undefined}
            displayName={user.user_metadata?.display_name ?? undefined}
          />
        </div>

        <ReportsViewer locale={locale} translations={t} />
      </div>
    </div>
  )
}
