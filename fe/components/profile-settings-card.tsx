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

export function ProfileSettingsCard() {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [email, setEmail] = useState<string>("")
  const [username, setUsername] = useState<string>("")
  const [displayName, setDisplayName] = useState<string>("")

  useEffect(() => {
    async function loadProfile() {
      try {
        const profileData = await getProfile()
        setProfile(profileData)
        setUsername(profileData?.username || "")
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
      const updated = await updateProfile({ 
        username: username || undefined, 
        display_name: displayName || undefined 
      })
      setProfile(updated)
    } catch (error) {
      console.error("Error updating profile:", error)
      alert("Failed to update profile")
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Profile Settings</CardTitle>
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
        <CardTitle>Profile Settings</CardTitle>
        <CardDescription>Manage your personal information and account settings</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" value={email} disabled className="bg-muted" />
          <p className="text-xs text-muted-foreground">Email cannot be changed. Contact support if needed.</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="username">Username</Label>
          <Input
            id="username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Enter your username"
          />
          <p className="text-xs text-muted-foreground">Unique identifier for your account.</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="display-name">Display Name</Label>
          <Input
            id="display-name"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Enter your display name"
          />
        </div>

        <Button onClick={handleSave} disabled={saving || (username === profile?.username && displayName === profile?.display_name)}>
          {saving ? (
            <>
              <Loader2Icon className="h-4 w-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            "Save Changes"
          )}
        </Button>
      </CardContent>
    </Card>
  )
}

