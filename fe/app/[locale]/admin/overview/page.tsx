import { getSystemOverview } from "@/lib/actions/admin"
import { StatCard } from "@/components/admin/stat-card"
import { 
  UsersIcon, 
  ActivityIcon, 
  DollarSignIcon, 
  TrendingUpIcon,
  MailCheckIcon,
  ReceiptIcon,
  ZapIcon
} from "lucide-react"

export default async function AdminOverviewPage() {
  const overview = await getSystemOverview()

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">System Overview</h2>
        <p className="text-muted-foreground">
          Quick glance at key metrics and system health
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Users"
          value={overview.totalUsers}
          icon={UsersIcon}
          description="Registered accounts"
        />
        
        <StatCard
          title="Active Users (24h)"
          value={overview.activeUsers}
          icon={ActivityIcon}
          description="Bot usage or transactions"
        />
        
        <StatCard
          title="Pending Beta Signups"
          value={overview.pendingSignups}
          icon={MailCheckIcon}
          description="Awaiting approval"
        />
        
        <StatCard
          title="Total Transactions"
          value={overview.totalTransactions.toLocaleString()}
          icon={ReceiptIcon}
          description="All-time transactions"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <StatCard
          title="Total AI Spend"
          value={`$${overview.totalAISpend}`}
          icon={DollarSignIcon}
          description="All-time API costs"
        />
        
        <StatCard
          title="AI Spend Today"
          value={`$${overview.todayAISpend}`}
          icon={TrendingUpIcon}
          description="Today's API costs"
        />
        
        <StatCard
          title="Cache Hit Rate (All-Time)"
          value={`${overview.avgCacheHitRate}%`}
          icon={ZapIcon}
          description="Semantic cache efficiency"
        />
      </div>

      <div className="rounded-lg border bg-card p-6">
        <h3 className="text-lg font-semibold mb-2">Quick Actions</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <a
            href="/admin/ai-usage"
            className="block p-4 rounded-md bg-muted hover:bg-accent transition-colors"
          >
            <DollarSignIcon className="h-5 w-5 mb-2" />
            <div className="font-medium">Manage AI Costs</div>
            <div className="text-sm text-muted-foreground">Adjust user limits</div>
          </a>
          
          <a
            href="/admin/beta-signups"
            className="block p-4 rounded-md bg-muted hover:bg-accent transition-colors"
          >
            <MailCheckIcon className="h-5 w-5 mb-2" />
            <div className="font-medium">Review Signups</div>
            <div className="text-sm text-muted-foreground">Approve beta users</div>
          </a>
          
          <a
            href="/admin/users"
            className="block p-4 rounded-md bg-muted hover:bg-accent transition-colors"
          >
            <UsersIcon className="h-5 w-5 mb-2" />
            <div className="font-medium">User Management</div>
            <div className="text-sm text-muted-foreground">View user details</div>
          </a>
          
          <a
            href="/"
            className="block p-4 rounded-md bg-muted hover:bg-accent transition-colors"
          >
            <ActivityIcon className="h-5 w-5 mb-2" />
            <div className="font-medium">View App</div>
            <div className="text-sm text-muted-foreground">Return to main app</div>
          </a>
        </div>
      </div>
    </div>
  )
}

