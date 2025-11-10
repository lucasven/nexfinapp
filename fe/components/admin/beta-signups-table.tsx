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
import { approveBetaSignup, rejectBetaSignup, resendBetaInvitation } from "@/lib/actions/admin"
import { useRouter } from "next/navigation"
import { trackEvent } from "@/lib/analytics/tracker"
import { AnalyticsEvent } from "@/lib/analytics/events"
import { MailIcon, AlertCircleIcon, CheckCircleIcon, SendIcon } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

interface BetaSignup {
  id: string
  email: string
  status: string
  created_at: string
  approved_at: string | null
  invitation_sent: boolean | null
  invitation_sent_at: string | null
  invitation_error: string | null
}

interface BetaSignupsTableProps {
  data: BetaSignup[]
}

export function BetaSignupsTable({ data }: BetaSignupsTableProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [resendingEmail, setResendingEmail] = useState<string | null>(null)
  const [confirmAction, setConfirmAction] = useState<{ type: "approve" | "reject", email: string } | null>(null)
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "rejected">("all")

  const handleApprove = async () => {
    if (!confirmAction) return
    
    setLoading(true)
    try {
      await approveBetaSignup(confirmAction.email)
      
      // Track approval event
      trackEvent(AnalyticsEvent.ADMIN_BETA_APPROVED, {
        email: confirmAction.email,
      })
      
      setConfirmAction(null)
      router.refresh()
    } catch (error) {
      console.error("Failed to approve signup:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleReject = async () => {
    if (!confirmAction) return
    
    setLoading(true)
    try {
      await rejectBetaSignup(confirmAction.email)
      
      // Track rejection event
      trackEvent(AnalyticsEvent.ADMIN_BETA_REJECTED, {
        email: confirmAction.email,
      })
      
      setConfirmAction(null)
      router.refresh()
    } catch (error) {
      console.error("Failed to reject signup:", error)
      alert("Failed to reject signup. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async (email: string) => {
    setResendingEmail(email)
    try {
      await resendBetaInvitation(email)
      alert("Invitation resent successfully!")
      router.refresh()
    } catch (error) {
      console.error("Failed to resend invitation:", error)
      alert("Failed to resend invitation. Please try again.")
    } finally {
      setResendingEmail(null)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="default" className="bg-yellow-600">Pending</Badge>
      case "approved":
        return <Badge variant="default" className="bg-green-600">Approved</Badge>
      case "rejected":
        return <Badge variant="destructive">Rejected</Badge>
      default:
        return <Badge variant="secondary">{status}</Badge>
    }
  }

  const getInvitationBadge = (signup: BetaSignup) => {
    if (signup.status !== "approved") return null
    
    if (signup.invitation_error) {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger>
              <Badge variant="destructive" className="flex items-center gap-1">
                <AlertCircleIcon className="h-3 w-3" />
                Failed
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs max-w-xs">{signup.invitation_error}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )
    }
    
    if (signup.invitation_sent) {
      return (
        <Badge variant="default" className="bg-blue-600 flex items-center gap-1">
          <CheckCircleIcon className="h-3 w-3" />
          Sent
        </Badge>
      )
    }
    
    return (
      <Badge variant="secondary" className="flex items-center gap-1">
        <MailIcon className="h-3 w-3" />
        Pending
      </Badge>
    )
  }

  const filteredData = filter === "all" ? data : data.filter(s => s.status === filter)

  return (
    <>
      <div className="mb-4 flex gap-2">
        <Button
          size="sm"
          variant={filter === "all" ? "default" : "outline"}
          onClick={() => setFilter("all")}
        >
          All ({data.length})
        </Button>
        <Button
          size="sm"
          variant={filter === "pending" ? "default" : "outline"}
          onClick={() => setFilter("pending")}
        >
          Pending ({data.filter(s => s.status === "pending").length})
        </Button>
        <Button
          size="sm"
          variant={filter === "approved" ? "default" : "outline"}
          onClick={() => setFilter("approved")}
        >
          Approved ({data.filter(s => s.status === "approved").length})
        </Button>
        <Button
          size="sm"
          variant={filter === "rejected" ? "default" : "outline"}
          onClick={() => setFilter("rejected")}
        >
          Rejected ({data.filter(s => s.status === "rejected").length})
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Invitation</TableHead>
              <TableHead>Signed Up</TableHead>
              <TableHead>Approved</TableHead>
              <TableHead>Invitation Sent</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredData.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  No signups found
                </TableCell>
              </TableRow>
            ) : (
              filteredData.map((signup) => (
                <TableRow key={signup.id}>
                  <TableCell className="font-medium">{signup.email}</TableCell>
                  <TableCell>{getStatusBadge(signup.status)}</TableCell>
                  <TableCell>{getInvitationBadge(signup)}</TableCell>
                  <TableCell>
                    {new Date(signup.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    {signup.approved_at
                      ? new Date(signup.approved_at).toLocaleDateString()
                      : "-"}
                  </TableCell>
                  <TableCell>
                    {signup.invitation_sent_at
                      ? new Date(signup.invitation_sent_at).toLocaleDateString()
                      : "-"}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      {signup.status === "pending" && (
                        <>
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => setConfirmAction({ type: "approve", email: signup.email })}
                            disabled={loading}
                          >
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => setConfirmAction({ type: "reject", email: signup.email })}
                            disabled={loading}
                          >
                            Reject
                          </Button>
                        </>
                      )}
                      {signup.status === "approved" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleResend(signup.email)}
                          disabled={resendingEmail === signup.email}
                        >
                          {resendingEmail === signup.email ? (
                            "Sending..."
                          ) : (
                            <>
                              <SendIcon className="h-3 w-3 mr-1" />
                              Resend
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!confirmAction} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmAction?.type === "approve" ? "Approve" : "Reject"} Beta Signup
            </DialogTitle>
            <DialogDescription>
              {confirmAction?.type === "approve" ? (
                <>
                  Are you sure you want to approve access for{" "}
                  <strong>{confirmAction?.email}</strong>?
                  <br />
                  <br />
                  An invitation email will be sent automatically.
                </>
              ) : (
                <>
                  Are you sure you want to reject access for{" "}
                  <strong>{confirmAction?.email}</strong>?
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmAction(null)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              variant={confirmAction?.type === "approve" ? "default" : "destructive"}
              onClick={confirmAction?.type === "approve" ? handleApprove : handleReject}
              disabled={loading}
            >
              {loading ? "Processing..." : confirmAction?.type === "approve" ? "Approve" : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

