"use client"

import { useEffect, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { getUserDetails } from "@/lib/actions/admin"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { trackEvent } from "@/lib/analytics/tracker"
import { AnalyticsEvent, AnalyticsProperty } from "@/lib/analytics/events"

interface UserDetailsDialogProps {
  userId: string
  open: boolean
  onClose: () => void
}

export function UserDetailsDialog({ userId, open, onClose }: UserDetailsDialogProps) {
  const [details, setDetails] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (open && userId) {
      setLoading(true)
      getUserDetails(userId)
        .then((data) => {
          setDetails(data)
          
          // Track user details view
          trackEvent(AnalyticsEvent.ADMIN_USER_DETAILS_VIEWED, {
            [AnalyticsProperty.TARGET_USER_ID]: userId,
          })
        })
        .catch((error) => {
          console.error("Failed to load user details:", error)
        })
        .finally(() => {
          setLoading(false)
        })
    }
  }, [userId, open])

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>User Details</DialogTitle>
          <DialogDescription>
            Comprehensive information about this user
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-8 text-center text-muted-foreground">
            Loading user details...
          </div>
        ) : details ? (
          <Tabs defaultValue="profile" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="profile">Profile</TabsTrigger>
              <TabsTrigger value="whatsapp">WhatsApp</TabsTrigger>
              <TabsTrigger value="transactions">Transactions</TabsTrigger>
              <TabsTrigger value="ai">AI Usage</TabsTrigger>
            </TabsList>

            <TabsContent value="profile" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Profile Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div>
                    <div className="text-sm font-medium text-muted-foreground">Email</div>
                    <div>{details.profile.email}</div>
                  </div>
                  {details.profile.displayName && (
                    <div>
                      <div className="text-sm font-medium text-muted-foreground">Display Name</div>
                      <div>{details.profile.displayName}</div>
                    </div>
                  )}
                  <div>
                    <div className="text-sm font-medium text-muted-foreground">User ID</div>
                    <div className="font-mono text-sm">{details.profile.userId}</div>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-muted-foreground">Locale</div>
                    <div>{details.profile.locale || "Not set"}</div>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-muted-foreground">Joined</div>
                    <div>{new Date(details.profile.createdAt).toLocaleString()}</div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="whatsapp" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Authorized WhatsApp Numbers</CardTitle>
                </CardHeader>
                <CardContent>
                  {details.whatsappNumbers.length === 0 ? (
                    <div className="text-muted-foreground">No WhatsApp numbers registered</div>
                  ) : (
                    <div className="space-y-3">
                      {details.whatsappNumbers.map((number: any) => (
                        <div key={number.id} className="border rounded-lg p-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="font-medium">{number.name}</div>
                              <div className="text-sm text-muted-foreground">{number.whatsapp_number}</div>
                            </div>
                            {number.is_primary && (
                              <Badge>Primary</Badge>
                            )}
                          </div>
                          <div className="mt-2 text-sm">
                            <div className="text-muted-foreground">Permissions:</div>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {number.permissions.can_view && <Badge variant="secondary">View</Badge>}
                              {number.permissions.can_add && <Badge variant="secondary">Add</Badge>}
                              {number.permissions.can_edit && <Badge variant="secondary">Edit</Badge>}
                              {number.permissions.can_delete && <Badge variant="secondary">Delete</Badge>}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Authorized Groups</CardTitle>
                </CardHeader>
                <CardContent>
                  {details.authorizedGroups.length === 0 ? (
                    <div className="text-muted-foreground">No authorized groups</div>
                  ) : (
                    <div className="space-y-2">
                      {details.authorizedGroups.map((group: any) => (
                        <div key={group.id} className="border rounded-lg p-3">
                          <div className="font-medium">{group.group_name || "Unnamed Group"}</div>
                          <div className="text-sm text-muted-foreground font-mono">{group.group_jid}</div>
                          {group.is_active && <Badge className="mt-1" variant="default">Active</Badge>}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="transactions" className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <Card>
                  <CardHeader>
                    <CardTitle>Total Transactions</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{details.transactionSummary.count}</div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader>
                    <CardTitle>Total Income</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-green-600">
                      ${details.transactionSummary.totalIncome.toFixed(2)}
                    </div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader>
                    <CardTitle>Total Expenses</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-red-600">
                      ${details.transactionSummary.totalExpenses.toFixed(2)}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="ai" className="space-y-4">
              {details.aiUsage ? (
                <>
                  <div className="grid gap-4 md:grid-cols-2">
                    <Card>
                      <CardHeader>
                        <CardTitle>Costs</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <div>
                          <div className="text-sm text-muted-foreground">Total Cost</div>
                          <div className="text-xl font-bold">${details.aiUsage.totalCost.toFixed(6)}</div>
                        </div>
                        <div>
                          <div className="text-sm text-muted-foreground">Daily Cost</div>
                          <div className="text-xl font-bold">${details.aiUsage.dailyCost.toFixed(6)}</div>
                        </div>
                        <div>
                          <div className="text-sm text-muted-foreground">Daily Limit</div>
                          <div className="text-xl font-bold">${details.aiUsage.dailyLimit.toFixed(2)}</div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle>API Calls</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <div>
                          <div className="text-sm text-muted-foreground">LLM Calls (Total)</div>
                          <div className="text-xl font-bold">{details.aiUsage.llmCallsCount}</div>
                        </div>
                        <div>
                          <div className="text-sm text-muted-foreground">LLM Calls (Today)</div>
                          <div className="text-xl font-bold">{details.aiUsage.llmCallsToday}</div>
                        </div>
                        <div>
                          <div className="text-sm text-muted-foreground">Cache Hits (Today)</div>
                          <div className="text-xl font-bold">{details.aiUsage.cacheHitsToday}</div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  <Card>
                    <CardHeader>
                      <CardTitle>Settings</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span>Limit Enabled</span>
                        <Badge variant={details.aiUsage.isLimitEnabled ? "default" : "secondary"}>
                          {details.aiUsage.isLimitEnabled ? "Yes" : "No"}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Admin Override</span>
                        <Badge variant={details.aiUsage.isAdminOverride ? "default" : "secondary"}>
                          {details.aiUsage.isAdminOverride ? "Yes" : "No"}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                </>
              ) : (
                <div className="text-muted-foreground">No AI usage data available</div>
              )}
            </TabsContent>
          </Tabs>
        ) : (
          <div className="py-8 text-center text-destructive">
            Failed to load user details
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

