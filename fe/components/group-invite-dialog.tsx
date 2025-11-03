"use client"

import type React from "react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { CopyIcon, Loader2Icon, CheckIcon } from "lucide-react"
import type { AuthorizedWhatsAppNumber } from "@/lib/types"

interface GroupInviteDialogProps {
  primaryNumber: AuthorizedWhatsAppNumber | undefined
  children: React.ReactNode
}

export function GroupInviteDialog({ primaryNumber, children }: GroupInviteDialogProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [inviteLink, setInviteLink] = useState<string | null>(null)
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleGenerateInvite = async () => {
    if (!primaryNumber) {
      setError("No primary WhatsApp number found")
      return
    }

    setLoading(true)
    setError(null)

    try {
      const response = await fetch("/api/whatsapp/group-invite", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to generate invite")
      }

      const data = await response.json()
      
      // Handle pending response
      if (data.pending) {
        setError(data.message || "Request is being processed. Please wait and try again in a minute.")
        return
      }
      
      setInviteLink(data.inviteLink || data.invite_link)
      setQrCode(data.qrCode || data.qr_code)
    } catch (err: any) {
      console.error("Error generating invite:", err)
      setError(err.message || "Failed to generate group invite")
    } finally {
      setLoading(false)
    }
  }

  const handleCopyLink = async () => {
    if (!inviteLink) return

    try {
      await navigator.clipboard.writeText(inviteLink)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error("Failed to copy:", err)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>WhatsApp Group Invite</DialogTitle>
          <DialogDescription>
            Generate an invite link to create a WhatsApp group with the bot. You can use this group for communication.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {!inviteLink ? (
            <>
              {error && (
                <div className="p-3 text-sm text-red-600 bg-red-50 dark:bg-red-900/20 rounded-md">{error}</div>
              )}

              {loading ? (
                <div className="flex flex-col items-center justify-center py-8 space-y-4">
                  <Loader2Icon className="h-8 w-8 animate-spin text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Generating invite link...</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    This will create a WhatsApp group invite link. After joining, you and the bot can communicate in the
                    group.
                  </p>
                  {primaryNumber && (
                    <div className="p-3 bg-muted rounded-md">
                      <p className="text-sm font-medium">Primary Number:</p>
                      <p className="text-sm text-muted-foreground">{primaryNumber.whatsapp_number}</p>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="space-y-4">
              {qrCode && (
                <div className="flex flex-col items-center space-y-2">
                  <p className="text-sm font-medium">Scan QR Code:</p>
                  <div className="p-4 bg-white rounded-lg">
                    <img src={qrCode} alt="QR Code" className="w-48 h-48" />
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium">Invite Link:</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value={inviteLink}
                    className="flex-1 px-3 py-2 text-sm border rounded-md bg-muted"
                  />
                  <Button type="button" variant="outline" size="icon" onClick={handleCopyLink}>
                    {copied ? (
                      <CheckIcon className="h-4 w-4 text-green-600" />
                    ) : (
                      <CopyIcon className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-md">
                <p className="text-sm text-blue-900 dark:text-blue-200">
                  <strong>Instructions:</strong>
                </p>
                <ol className="text-sm text-blue-800 dark:text-blue-300 mt-2 space-y-1 list-decimal list-inside">
                  <li>Copy the invite link above</li>
                  <li>Share it with your WhatsApp contacts or open it in WhatsApp</li>
                  <li>Join the group that will be created</li>
                  <li>The bot will be automatically added to the group</li>
                </ol>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          {inviteLink ? (
            <Button onClick={() => setOpen(false)}>Close</Button>
          ) : (
            <>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleGenerateInvite} disabled={loading || !primaryNumber}>
                {loading ? (
                  <>
                    <Loader2Icon className="h-4 w-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  "Generate Invite"
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

