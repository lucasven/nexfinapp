"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { getAuthorizedGroups, toggleGroupAuthorization, deleteAuthorizedGroup } from "@/lib/actions/groups"
import type { AuthorizedGroup } from "@/lib/types"
import { TrashIcon, CheckCircle2Icon, XCircleIcon, UsersIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from 'next-intl'

export function AuthorizedGroupsCard() {
  const t = useTranslations()
  const router = useRouter()
  const [groups, setGroups] = useState<AuthorizedGroup[]>([])
  const [loading, setLoading] = useState(true)

  const formatRelativeTime = (date: string | null): string => {
    if (!date) return t('groups.never')
    
    const now = new Date()
    const then = new Date(date)
    const diffMs = now.getTime() - then.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)
    
    if (diffMins < 1) return t('groups.justNow')
    if (diffMins < 60) return `${diffMins}${t('groups.minutesAgo')}`
    if (diffHours < 24) return `${diffHours}${t('groups.hoursAgo')}`
    if (diffDays < 7) return `${diffDays}${t('groups.daysAgo')}`
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}${t('groups.weeksAgo')}`
    return then.toLocaleDateString()
  }

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
      alert(t('groups.updateFailed'))
    }
  }

  const handleDelete = async (id: string, groupName: string | null) => {
    if (!confirm(`${t('groups.deleteConfirm')} "${groupName || t('groups.unknownGroup')}"?`)) return

    try {
      await deleteAuthorizedGroup(id)
      router.refresh()
      loadGroups()
    } catch (error) {
      console.error("Error deleting authorized group:", error)
      alert(t('groups.deleteFailed'))
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <UsersIcon className="h-5 w-5" />
          <div>
            <CardTitle>{t('groups.title')}</CardTitle>
            <CardDescription>
              {t('groups.subtitle')}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-center py-8 text-muted-foreground">{t('common.loading')}</div>
        ) : groups.length === 0 ? (
          <div className="text-center py-8 space-y-4">
            <p className="text-muted-foreground">{t('groups.noGroups')}</p>
            <p className="text-sm text-muted-foreground">
              {t('groups.noGroupsHelp')}
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
                      {group.group_name || t('groups.unknownGroup')}
                    </span>
                    {group.auto_authorized && (
                      <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">
                        {t('groups.autoAuthorized')}
                      </Badge>
                    )}
                    {group.is_active ? (
                      <Badge variant="default">{t('groups.active')}</Badge>
                    ) : (
                      <Badge variant="outline">{t('groups.inactive')}</Badge>
                    )}
                  </div>
                  
                  <div className="text-sm text-muted-foreground space-y-1">
                    {group.added_by && (
                      <div>{t('groups.addedBy')}: +{group.added_by}</div>
                    )}
                    {group.last_message_at && (
                      <div>{t('groups.lastMessage')}: {formatRelativeTime(group.last_message_at)}</div>
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
                    title={group.is_active ? t('groups.deactivate') : t('groups.activate')}
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

