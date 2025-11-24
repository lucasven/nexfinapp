"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { deleteMyAccount, getMyDataSummary } from "@/lib/actions/user"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { AlertTriangle, Trash2, Loader2, Shield } from "lucide-react"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import { NotificationPreferences } from "@/components/settings/notification-preferences"

export default function AccountSettingsPage() {
  const t = useTranslations()
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [dataSummary, setDataSummary] = useState<any>(null)
  const [userProfile, setUserProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState("")
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    loadUserAndData()
  }, [])

  const loadUserAndData = async () => {
    try {
      const supabase = getSupabaseBrowserClient()
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser()
      setUser(currentUser)

      // Load user profile (for reengagement_opt_out)
      if (currentUser) {
        const { data: profile } = await supabase
          .from("user_profiles")
          .select("reengagement_opt_out")
          .eq("user_id", currentUser.id)
          .single()
        setUserProfile(profile)
      }

      // Load data summary
      const summary = await getMyDataSummary()
      if (summary.success) {
        setDataSummary(summary.data)
      }
    } catch (error) {
      console.error("Failed to load user data:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== "DELETE MY ACCOUNT") {
      toast.error(
        t("settings.deleteAccount.confirmError.description", {
          defaultValue: 'Please type "DELETE MY ACCOUNT" exactly to confirm.',
        })
      )
      return
    }

    setDeleting(true)
    try {
      const result = await deleteMyAccount()

      if (result.success) {
        toast.success(result.message || t("settings.deleteAccount.success.title", {
          defaultValue: "Account deleted",
        }))

        // Redirect to home page after short delay
        setTimeout(() => {
          router.push("/")
        }, 2000)
      } else {
        toast.error(result.message || t("settings.deleteAccount.error.title", {
          defaultValue: "Deletion failed",
        }))
        setDeleting(false)
      }
    } catch (error: any) {
      toast.error(
        error.message ||
        t("settings.deleteAccount.error.generic", {
          defaultValue: "Failed to delete account",
        })
      )
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="container max-w-4xl py-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          {t("settings.account.title", { defaultValue: "Account Settings" })}
        </h1>
        <p className="text-muted-foreground mt-1">
          {t("settings.account.description", {
            defaultValue: "Manage your account preferences and data",
          })}
        </p>
      </div>

      {/* Account Information */}
      <Card>
        <CardHeader>
          <CardTitle>
            {t("settings.account.info.title", { defaultValue: "Account Information" })}
          </CardTitle>
          <CardDescription>
            {t("settings.account.info.description", {
              defaultValue: "Your account details",
            })}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-sm font-medium text-muted-foreground">
              {t("auth.email", { defaultValue: "Email" })}
            </Label>
            <div className="text-sm mt-1">{user?.email}</div>
          </div>
          <div>
            <Label className="text-sm font-medium text-muted-foreground">
              {t("settings.account.userId", { defaultValue: "User ID" })}
            </Label>
            <div className="font-mono text-xs mt-1 text-muted-foreground">{user?.id}</div>
          </div>
          <div>
            <Label className="text-sm font-medium text-muted-foreground">
              {t("settings.account.joinedDate", { defaultValue: "Member since" })}
            </Label>
            <div className="text-sm mt-1">
              {user?.created_at && new Date(user.created_at).toLocaleDateString()}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Your Data */}
      <Card>
        <CardHeader>
          <CardTitle>
            {t("settings.account.data.title", { defaultValue: "Your Data" })}
          </CardTitle>
          <CardDescription>
            {t("settings.account.data.description", {
              defaultValue: "Summary of your stored data",
            })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {dataSummary ? (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="bg-muted/50 p-3 rounded-lg">
                <div className="text-2xl font-bold">{dataSummary.transactionCount}</div>
                <div className="text-sm text-muted-foreground">
                  {t("settings.account.data.transactions", { defaultValue: "Transactions" })}
                </div>
              </div>
              <div className="bg-muted/50 p-3 rounded-lg">
                <div className="text-2xl font-bold">{dataSummary.categoryCount}</div>
                <div className="text-sm text-muted-foreground">
                  {t("settings.account.data.categories", { defaultValue: "Categories" })}
                </div>
              </div>
              <div className="bg-muted/50 p-3 rounded-lg">
                <div className="text-2xl font-bold">{dataSummary.budgetCount}</div>
                <div className="text-sm text-muted-foreground">
                  {t("settings.account.data.budgets", { defaultValue: "Budgets" })}
                </div>
              </div>
              <div className="bg-muted/50 p-3 rounded-lg">
                <div className="text-2xl font-bold">{dataSummary.recurringCount}</div>
                <div className="text-sm text-muted-foreground">
                  {t("settings.account.data.recurring", { defaultValue: "Recurring Payments" })}
                </div>
              </div>
              <div className="bg-muted/50 p-3 rounded-lg">
                <div className="text-2xl font-bold">{dataSummary.whatsappNumberCount}</div>
                <div className="text-sm text-muted-foreground">
                  {t("settings.account.data.whatsapp", { defaultValue: "WhatsApp Numbers" })}
                </div>
              </div>
              <div className="bg-muted/50 p-3 rounded-lg">
                <div className="text-2xl font-bold">{dataSummary.groupCount}</div>
                <div className="text-sm text-muted-foreground">
                  {t("settings.account.data.groups", { defaultValue: "Groups" })}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-muted-foreground">
              {t("common.loading", { defaultValue: "Loading..." })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Notification Preferences */}
      {user && userProfile !== null && (
        <NotificationPreferences
          initialOptOut={userProfile?.reengagement_opt_out ?? false}
          userId={user.id}
        />
      )}

      {/* LGPD / Data Rights */}
      <Card className="border-blue-200 dark:border-blue-900">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            <CardTitle>
              {t("settings.account.lgpd.title", { defaultValue: "Your Data Rights (LGPD)" })}
            </CardTitle>
          </div>
          <CardDescription>
            {t("settings.account.lgpd.description", {
              defaultValue: "Brazilian data protection law guarantees your rights",
            })}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-start gap-2">
            <div className="font-medium w-32 shrink-0">
              {t("settings.account.lgpd.right1.title", { defaultValue: "Right to Access:" })}
            </div>
            <div className="text-muted-foreground">
              {t("settings.account.lgpd.right1.description", {
                defaultValue: "See all your data above",
              })}
            </div>
          </div>
          <div className="flex items-start gap-2">
            <div className="font-medium w-32 shrink-0">
              {t("settings.account.lgpd.right2.title", { defaultValue: "Right to Delete:" })}
            </div>
            <div className="text-muted-foreground">
              {t("settings.account.lgpd.right2.description", {
                defaultValue: "Use the option below to delete all your data",
              })}
            </div>
          </div>
          <div className="flex items-start gap-2">
            <div className="font-medium w-32 shrink-0">
              {t("settings.account.lgpd.right3.title", { defaultValue: "Right to Portability:" })}
            </div>
            <div className="text-muted-foreground">
              {t("settings.account.lgpd.right3.description", {
                defaultValue: "Export your data from the Reports page",
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-destructive">
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <CardTitle className="text-destructive">
              {t("settings.account.dangerZone.title", { defaultValue: "Danger Zone" })}
            </CardTitle>
          </div>
          <CardDescription>
            {t("settings.account.dangerZone.description", {
              defaultValue: "Irreversible actions that affect your account",
            })}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-destructive/10 p-4 rounded-lg space-y-2">
            <p className="text-sm font-medium">
              {t("settings.account.deleteAccount.title", { defaultValue: "Delete Account" })}
            </p>
            <p className="text-sm text-muted-foreground">
              {t("settings.account.deleteAccount.description", {
                defaultValue:
                  "Permanently delete your account and all associated data. This cannot be undone.",
              })}
            </p>
            <ul className="text-xs text-muted-foreground space-y-1 mt-2">
              <li>
                •{" "}
                {t("settings.account.deleteAccount.warning1", {
                  defaultValue: "All transactions will be permanently deleted",
                })}
              </li>
              <li>
                •{" "}
                {t("settings.account.deleteAccount.warning2", {
                  defaultValue: "All budgets and categories will be removed",
                })}
              </li>
              <li>
                •{" "}
                {t("settings.account.deleteAccount.warning3", {
                  defaultValue: "Your WhatsApp integration will be disconnected",
                })}
              </li>
              <li>
                •{" "}
                {t("settings.account.deleteAccount.warning4", {
                  defaultValue: "You will no longer be able to log in",
                })}
              </li>
              <li>
                •{" "}
                {t("settings.account.deleteAccount.warning5", {
                  defaultValue: "This action is logged for compliance purposes",
                })}
              </li>
            </ul>
          </div>

          <Button
            variant="destructive"
            onClick={() => setShowDeleteDialog(true)}
            className="w-full"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            {t("settings.account.deleteAccount.button", { defaultValue: "Delete My Account" })}
          </Button>
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              {t("settings.account.deleteDialog.title", {
                defaultValue: "Are you absolutely sure?",
              })}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="text-sm text-muted-foreground space-y-4">
                <p>
                  {t("settings.account.deleteDialog.warning", {
                    defaultValue:
                      "This action cannot be undone. This will permanently delete your account and remove all your data from our servers.",
                  })}
                </p>

                {dataSummary && (
                  <div className="bg-muted p-3 rounded-md space-y-1 text-sm">
                    <div>📊 {dataSummary.transactionCount} transactions</div>
                    <div>📁 {dataSummary.categoryCount} custom categories</div>
                    <div>💰 {dataSummary.budgetCount} budgets</div>
                    <div>🔄 {dataSummary.recurringCount} recurring payments</div>
                    <div>💬 {dataSummary.whatsappNumberCount} WhatsApp numbers</div>
                  </div>
                )}

                <div className="space-y-2">
                  <Label>
                    {t("settings.account.deleteDialog.confirmLabel", {
                      defaultValue: 'Type "DELETE MY ACCOUNT" to confirm:',
                    })}
                  </Label>
                  <Input
                    type="text"
                    placeholder="DELETE MY ACCOUNT"
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    disabled={deleting}
                    className="font-mono"
                  />
                </div>

                <p className="text-xs text-muted-foreground">
                  {t("settings.account.deleteDialog.lgpdNote", {
                    defaultValue:
                      "Note: As required by LGPD, a minimal audit log (email, deletion date) will be retained for legal compliance.",
                  })}
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>
              {t("common.cancel", { defaultValue: "Cancel" })}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteAccount}
              disabled={deleting || deleteConfirmText !== "DELETE MY ACCOUNT"}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {deleting
                ? t("settings.account.deleteDialog.deleting", { defaultValue: "Deleting..." })
                : t("settings.account.deleteDialog.confirm", { defaultValue: "Delete Forever" })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
