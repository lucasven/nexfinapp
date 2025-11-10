"use client"

import { useState } from "react"
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { updateUserDailyLimit, setAdminOverride } from "@/lib/actions/admin"
import { Input } from "@/components/ui/input"
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { useRouter } from "next/navigation"
import { trackEvent } from "@/lib/analytics/tracker"
import { AnalyticsEvent, AnalyticsProperty } from "@/lib/analytics/events"

interface AIUsageData {
  userId: string
  email: string
  displayName: string | null
  dailyCost: number
  totalCost: number
  dailyLimit: number
  isLimitEnabled: boolean
  isAdminOverride: boolean
  llmCallsToday: number
  embeddingCallsToday: number
  cacheHitsToday: number
  cacheHitRate: string
  status: string
}

interface AIUsageTableProps {
  data: AIUsageData[]
}

export function AIUsageTable({ data }: AIUsageTableProps) {
  const router = useRouter()
  const [editingUser, setEditingUser] = useState<AIUsageData | null>(null)
  const [newLimit, setNewLimit] = useState("")
  const [loading, setLoading] = useState(false)

  const handleOpenLimitDialog = (user: AIUsageData) => {
    setEditingUser(user)
    setNewLimit(user.dailyLimit.toString())
  }

  const handleSaveLimit = async () => {
    if (!editingUser) return
    
    setLoading(true)
    try {
      await updateUserDailyLimit(editingUser.userId, Number(newLimit))
      
      // Track limit change event
      trackEvent(AnalyticsEvent.ADMIN_USER_LIMIT_CHANGED, {
        [AnalyticsProperty.TARGET_USER_ID]: editingUser.userId,
        [AnalyticsProperty.OLD_VALUE]: editingUser.dailyLimit,
        [AnalyticsProperty.NEW_VALUE]: Number(newLimit),
      })
      
      setEditingUser(null)
      router.refresh()
    } catch (error) {
      console.error("Failed to update limit:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleToggleOverride = async (user: AIUsageData) => {
    setLoading(true)
    try {
      await setAdminOverride(user.userId, !user.isAdminOverride)
      
      // Track override toggle event
      trackEvent(AnalyticsEvent.ADMIN_ADMIN_OVERRIDE_TOGGLED, {
        [AnalyticsProperty.TARGET_USER_ID]: user.userId,
        [AnalyticsProperty.NEW_VALUE]: !user.isAdminOverride,
      })
      
      router.refresh()
    } catch (error) {
      console.error("Failed to toggle override:", error)
    } finally {
      setLoading(false)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "ok":
        return <Badge variant="default" className="bg-green-600">OK</Badge>
      case "near_limit":
        return <Badge variant="default" className="bg-yellow-600">Near Limit</Badge>
      case "over_limit":
        return <Badge variant="destructive">Over Limit</Badge>
      case "unlimited":
        return <Badge variant="secondary">Unlimited</Badge>
      default:
        return <Badge variant="secondary">{status}</Badge>
    }
  }

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead className="text-right">Daily Cost</TableHead>
              <TableHead className="text-right">Total Cost</TableHead>
              <TableHead className="text-right">Daily Limit</TableHead>
              <TableHead className="text-center">Calls Today</TableHead>
              <TableHead className="text-right">Cache Hit %</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground">
                  No AI usage data available
                </TableCell>
              </TableRow>
            ) : (
              data.map((user) => (
                <TableRow key={user.userId}>
                  <TableCell>
                    <div>
                      <div className="font-medium">{user.email}</div>
                      {user.displayName && (
                        <div className="text-sm text-muted-foreground">{user.displayName}</div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    ${user.dailyCost.toFixed(6)}
                  </TableCell>
                  <TableCell className="text-right">
                    ${user.totalCost.toFixed(6)}
                  </TableCell>
                  <TableCell className="text-right">
                    ${user.dailyLimit.toFixed(2)}
                    {user.isAdminOverride && (
                      <Badge variant="secondary" className="ml-2">Override</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-center text-sm">
                    <div>LLM: {user.llmCallsToday}</div>
                    <div>Emb: {user.embeddingCallsToday}</div>
                    <div>Cache: {user.cacheHitsToday}</div>
                  </TableCell>
                  <TableCell className="text-right">
                    {user.cacheHitRate}%
                  </TableCell>
                  <TableCell>{getStatusBadge(user.status)}</TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleOpenLimitDialog(user)}
                        disabled={loading}
                      >
                        Adjust Limit
                      </Button>
                      <Button
                        size="sm"
                        variant={user.isAdminOverride ? "default" : "outline"}
                        onClick={() => handleToggleOverride(user)}
                        disabled={loading}
                      >
                        {user.isAdminOverride ? "Remove Override" : "Override"}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!editingUser} onOpenChange={(open) => !open && setEditingUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adjust Daily Limit</DialogTitle>
            <DialogDescription>
              Set the daily AI spending limit for {editingUser?.email}
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="limit">Daily Limit (USD)</Label>
              <Input
                id="limit"
                type="number"
                step="0.01"
                min="0"
                value={newLimit}
                onChange={(e) => setNewLimit(e.target.value)}
                placeholder="1.00"
              />
              <p className="text-sm text-muted-foreground">
                Current limit: ${editingUser?.dailyLimit.toFixed(2)}
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditingUser(null)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button onClick={handleSaveLimit} disabled={loading}>
              {loading ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

