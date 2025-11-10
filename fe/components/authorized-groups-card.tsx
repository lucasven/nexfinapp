"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { getAuthorizedGroups, toggleGroupAuthorization, deleteAuthorizedGroup } from "@/lib/actions/groups"
import type { AuthorizedGroup } from "@/lib/types"
import { TrashIcon, CheckCircle2Icon, XCircleIcon, UsersIcon } from "lucide-react"
import { useRouter } from "next/navigation"

function formatRelativeTime(date: string | null): string {
  if (!date) return "Never"
  
  const now = new Date()
  const then = new Date(date)
  const diffMs = now.getTime() - then.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)
  
  if (diffMins < 1) return "Just now"
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`
  return then.toLocaleDateString()
}

export function AuthorizedGroupsCard() {
  const router = useRouter()
  const [groups, setGroups] = useState<AuthorizedGroup[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadGroups()
  }, [])

  const loadGroups = async () => {
    try {
      const data = await getAuthorizedGroups()
      setGroups(data)
    } catch (error) {
      console.error("Error loading authorized groups:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleToggle = async (groupId: string, currentStatus: boolean) => {
    try {
      await toggleGroupAuthorization(groupId, !currentStatus)
      router.refresh()
      loadGroups()
    } catch (error) {
      console.error("Error toggling group authorization:", error)
      alert("Failed to update group status")
    }
  }

  const handleDelete = async (id: string, groupName: string | null) => {
    if (!confirm(`Are you sure you want to remove authorization for "${groupName || 'this group'}"?`)) return

    try {
      await deleteAuthorizedGroup(id)
      router.refresh()
      loadGroups()
    } catch (error) {
      console.error("Error deleting authorized group:", error)
      alert("Failed to delete authorized group")
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <UsersIcon className="h-5 w-5" />
          <div>
            <CardTitle>Authorized Groups</CardTitle>
            <CardDescription>
              WhatsApp groups where the bot is authorized to respond to messages
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-center py-8 text-muted-foreground">Loading...</div>
        ) : groups.length === 0 ? (
          <div className="text-center py-8 space-y-4">
            <p className="text-muted-foreground">No authorized groups yet.</p>
            <p className="text-sm text-muted-foreground">
              Add the bot to a group to see it here. Groups are automatically authorized when added by you.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {groups.map((group) => (
              <div
                key={group.id}
                className={`flex items-start justify-between p-4 border rounded-lg transition-colors ${
                  group.is_active
                    ? "bg-card hover:bg-accent/50"
                    : "bg-muted/50 hover:bg-muted"
                }`}
              >
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`font-medium ${!group.is_active && "text-muted-foreground"}`}>
                      {group.group_name || "Unknown Group"}
                    </span>
                    {group.auto_authorized && (
                      <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">
                        Auto-authorized
                      </Badge>
                    )}
                    {group.is_active ? (
                      <Badge variant="default">Active</Badge>
                    ) : (
                      <Badge variant="outline">Inactive</Badge>
                    )}
                  </div>
                  
                  <div className="text-sm text-muted-foreground space-y-1">
                    {group.added_by && (
                      <div>Added by: +{group.added_by}</div>
                    )}
                    {group.last_message_at && (
                      <div>Last message: {formatRelativeTime(group.last_message_at)}</div>
                    )}
                    <div className="text-xs font-mono text-muted-foreground/60">
                      {group.group_jid}
                    </div>
                  </div>
                </div>
                
                <div className="flex gap-2 ml-4">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleToggle(group.id, group.is_active)}
                    title={group.is_active ? "Deactivate" : "Activate"}
                  >
                    {group.is_active ? (
                      <XCircleIcon className="h-4 w-4 text-red-500" />
                    ) : (
                      <CheckCircle2Icon className="h-4 w-4 text-green-500" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(group.id, group.group_name)}
                  >
                    <TrashIcon className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

