import { getAllBetaSignups } from "@/lib/actions/admin"
import { BetaSignupsTable } from "@/components/admin/beta-signups-table"
import { StatCard } from "@/components/admin/stat-card"
import { MailIcon, ClockIcon, CheckCircleIcon, XCircleIcon } from "lucide-react"

export default async function BetaSignupsPage() {
  const signups = await getAllBetaSignups()

  const pending = signups.filter(s => s.status === "pending").length
  const approved = signups.filter(s => s.status === "approved").length
  const rejected = signups.filter(s => s.status === "rejected").length
  const total = signups.length

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Beta Signups</h2>
        <p className="text-muted-foreground">
          Manage waitlist and approve new users
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Signups"
          value={total}
          icon={MailIcon}
          description="All waitlist entries"
        />
        
        <StatCard
          title="Pending"
          value={pending}
          icon={ClockIcon}
          description="Awaiting review"
        />
        
        <StatCard
          title="Approved"
          value={approved}
          icon={CheckCircleIcon}
          description="Granted access"
        />
        
        <StatCard
          title="Rejected"
          value={rejected}
          icon={XCircleIcon}
          description="Denied access"
        />
      </div>

      <div className="rounded-lg border bg-card">
        <div className="p-6">
          <h3 className="text-lg font-semibold mb-4">Waitlist Management</h3>
          <BetaSignupsTable data={signups} />
        </div>
      </div>
    </div>
  )
}

