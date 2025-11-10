import { getAllUsers } from "@/lib/actions/admin"
import { UsersTable } from "@/components/admin/users-table"
import { StatCard } from "@/components/admin/stat-card"
import { UsersIcon, ActivityIcon, DollarSignIcon } from "lucide-react"

export default async function UsersPage() {
  const users = await getAllUsers()

  const totalUsers = users.length
  const usersWithTransactions = users.filter(u => u.totalTransactions > 0).length
  const avgTransactions = totalUsers > 0 
    ? users.reduce((sum, u) => sum + u.totalTransactions, 0) / totalUsers 
    : 0

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">User Management</h2>
        <p className="text-muted-foreground">
          View and manage user accounts
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          title="Total Users"
          value={totalUsers}
          icon={UsersIcon}
          description="Registered accounts"
        />
        
        <StatCard
          title="Active Users"
          value={usersWithTransactions}
          icon={ActivityIcon}
          description="Users with transactions"
        />
        
        <StatCard
          title="Avg Transactions"
          value={avgTransactions.toFixed(1)}
          icon={DollarSignIcon}
          description="Per user"
        />
      </div>

      <div className="rounded-lg border bg-card">
        <div className="p-6">
          <h3 className="text-lg font-semibold mb-4">All Users</h3>
          <UsersTable data={users} />
        </div>
      </div>
    </div>
  )
}

