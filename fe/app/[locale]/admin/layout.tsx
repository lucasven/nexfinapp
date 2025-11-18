import { redirect } from "next/navigation"
import { checkIsAdmin } from "@/lib/actions/admin"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Link } from "@/lib/localization/link"
import {
  BarChart3Icon,
  DollarSignIcon,
  UsersIcon,
  MailIcon,
  LayoutDashboardIcon,
  TagIcon,
  BrainCircuitIcon
} from "lucide-react"

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const isAdmin = await checkIsAdmin()
  
  if (!isAdmin) {
    redirect("/")
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b">
        <div className="container mx-auto py-4 px-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                <LayoutDashboardIcon className="h-8 w-8" />
                Admin Dashboard
              </h1>
              <p className="text-muted-foreground mt-1">
                Manage system settings, users, and analytics
              </p>
            </div>
            <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
              ← Back to App
            </Link>
          </div>

          <nav className="flex gap-4 overflow-x-auto">
            <Link
              href="/admin/overview"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors hover:bg-accent"
            >
              <BarChart3Icon className="h-4 w-4" />
              Overview
            </Link>
            <Link
              href="/admin/ai-usage"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors hover:bg-accent"
            >
              <DollarSignIcon className="h-4 w-4" />
              AI Usage
            </Link>
            <Link
              href="/admin/category-analytics"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors hover:bg-accent"
            >
              <TagIcon className="h-4 w-4" />
              Category Analytics
            </Link>
            <Link
              href="/admin/parsing-analytics"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors hover:bg-accent"
            >
              <BrainCircuitIcon className="h-4 w-4" />
              Parsing Analytics
            </Link>
            <Link
              href="/admin/beta-signups"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors hover:bg-accent"
            >
              <MailIcon className="h-4 w-4" />
              Beta Signups
            </Link>
            <Link
              href="/admin/users"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors hover:bg-accent"
            >
              <UsersIcon className="h-4 w-4" />
              Users
            </Link>
          </nav>
        </div>
      </div>

      <div className="container mx-auto py-8 px-4">
        {children}
      </div>
    </div>
  )
}

