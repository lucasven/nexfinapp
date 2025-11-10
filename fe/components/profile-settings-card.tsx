"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getProfile, updateProfile } from "@/lib/actions/profile"
import type { UserProfile } from "@/lib/types"
import { useState, useEffect } from "react"
import { Loader2Icon } from "lucide-react"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { useTranslations } from 'next-intl'

export function ProfileSettingsCard() {
  const t = useTranslations()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [email, setEmail] = useState<string>("")
  const [displayName, setDisplayName] = useState<string>("")

  useEffect(() => {
    async function loadProfile() {
      try {
        const profileData = await getProfile()
        setProfile(profileData)
        setDisplayName(profileData?.display_name || "")

        // Get email from auth
        const supabase = getSupabaseBrowserClient()
        const {
          data: { user },
        } = await supabase.auth.getUser()
        setEmail(user?.email || "")
      } catch (error) {
        console.error("Error loading profile:", error)
      } finally {
        setLoading(false)
      }
    }
    loadProfile()
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      const updated = await updateProfile({ display_name: displayName || undefined })
      setProfile(updated)
    } catch (error) {
      console.error("Error updating profile:", error)
      alert(t('profile.updateFailed'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('profile.settings')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2Icon className="h-6 w-6 animate-spin" />
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('profile.settings')}</CardTitle>
        <CardDescription>{t('profile.subtitle')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">{t('profile.email')}</Label>
          <Input id="email" type="email" value={email} disabled className="bg-muted" />
          <p className="text-xs text-muted-foreground">{t('profile.emailCannotChange')}</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="display-name">{t('profile.displayName')}</Label>
          <Input
            id="display-name"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={t('profile.displayNamePlaceholder')}
          />
        </div>

        <Button onClick={handleSave} disabled={saving || displayName === profile?.display_name}>
          {saving ? (
            <>
              <Loader2Icon className="h-4 w-4 mr-2 animate-spin" />
              {t('common.saving')}
            </>
          ) : (
            t('profile.saveChanges')
          )}
        </Button>
      </CardContent>
    </Card>
  )
}

