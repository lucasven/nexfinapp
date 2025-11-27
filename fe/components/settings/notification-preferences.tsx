"use client"

import { useState, useTransition } from "react"
import { useTranslations } from "next-intl"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { updateNotificationPreferences } from "@/lib/actions/engagement"
import { trackEvent } from "@/lib/analytics/tracker"
import { AnalyticsEvent } from "@/lib/analytics/events"

interface NotificationPreferencesProps {
  initialOptOut: boolean
  userId: string
}

export function NotificationPreferences({ initialOptOut, userId }: NotificationPreferencesProps) {
  const t = useTranslations("settings.notifications")

  // Invert for UX: checked = notifications enabled
  const [notificationsEnabled, setNotificationsEnabled] = useState(!initialOptOut)
  const [isPending, startTransition] = useTransition()

  const handleToggle = async (checked: boolean) => {
    // Optimistic UI update
    const previousValue = notificationsEnabled
    setNotificationsEnabled(checked)

    // Start server action in transition
    startTransition(async () => {
      const optOut = !checked // Invert back for database
      const result = await updateNotificationPreferences(optOut)

      if (result.success) {
        // Success: show toast and track analytics
        toast.success(t("success_toast"))

        // Track PostHog event
        try {
          trackEvent(AnalyticsEvent.ENGAGEMENT_PREFERENCE_CHANGED, {
            user_id: userId,
            preference: optOut ? "opted_out" : "opted_in",
            source: "web",
            timestamp: new Date().toISOString(),
          })
        } catch (error) {
          console.warn("Failed to track PostHog event (non-critical)", error)
        }
      } else {
        // Failure: revert to previous state and show error
        setNotificationsEnabled(previousValue)
        toast.error(t("error_toast"))
      }
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("reengagement_description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <Label htmlFor="reengagement-toggle" className="flex flex-col gap-1">
            <span className="font-medium">{t("reengagement_label")}</span>
          </Label>
          <Switch
            id="reengagement-toggle"
            checked={notificationsEnabled}
            onCheckedChange={handleToggle}
            disabled={isPending}
            aria-label={t("reengagement_label")}
          />
        </div>

        <div className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
          ℹ️ {t("info_note")}
        </div>
      </CardContent>
    </Card>
  )
}
