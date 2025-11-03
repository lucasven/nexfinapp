"use client"

import type React from "react"
import { useState, useEffect } from "react"
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { addAuthorizedNumber, updateAuthorizedNumber } from "@/lib/actions/profile"
import type { AuthorizedWhatsAppNumber } from "@/lib/types"
import { PlusIcon, EditIcon } from "lucide-react"
import { useRouter } from "next/navigation"

interface WhatsAppNumberDialogProps {
  number?: AuthorizedWhatsAppNumber
  trigger?: React.ReactNode
  onSaved?: () => void
}

export function WhatsAppNumberDialog({ number, trigger, onSaved }: WhatsAppNumberDialogProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    whatsapp_number: number?.whatsapp_number || "",
    name: number?.name || "",
    is_primary: number?.is_primary || false,
    permissions: {
      can_view: number?.permissions.can_view ?? true,
      can_add: number?.permissions.can_add ?? false,
      can_edit: number?.permissions.can_edit ?? false,
      can_delete: number?.permissions.can_delete ?? false,
      can_manage_budgets: number?.permissions.can_manage_budgets ?? false,
      can_view_reports: number?.permissions.can_view_reports ?? false,
    },
  })

  useEffect(() => {
    if (number) {
      setFormData({
        whatsapp_number: number.whatsapp_number,
        name: number.name,
        is_primary: number.is_primary,
        permissions: { ...number.permissions },
      })
    } else {
      setFormData({
        whatsapp_number: "",
        name: "",
        is_primary: false,
        permissions: {
          can_view: true,
          can_add: false,
          can_edit: false,
          can_delete: false,
          can_manage_budgets: false,
          can_view_reports: false,
        },
      })
    }
  }, [number, open])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      // Basic phone number validation (remove non-digits)
      const cleanedNumber = formData.whatsapp_number.replace(/\D/g, "")

      if (cleanedNumber.length < 10) {
        alert("Please enter a valid WhatsApp number")
        setLoading(false)
        return
      }

      const data = {
        whatsapp_number: cleanedNumber,
        name: formData.name || "Unnamed",
        is_primary: formData.is_primary,
        permissions: formData.permissions,
      }

      if (number) {
        await updateAuthorizedNumber(number.id, data)
      } else {
        await addAuthorizedNumber(data)
      }

      setOpen(false)
      router.refresh()
      onSaved?.()
    } catch (error) {
      console.error("Error saving WhatsApp number:", error)
      alert("Failed to save WhatsApp number")
    } finally {
      setLoading(false)
    }
  }

  const togglePermission = (key: keyof typeof formData.permissions) => {
    setFormData({
      ...formData,
      permissions: {
        ...formData.permissions,
        [key]: !formData.permissions[key],
      },
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button>
            <PlusIcon className="h-4 w-4 mr-2" />
            Add Number
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{number ? "Edit WhatsApp Number" : "Add WhatsApp Number"}</DialogTitle>
            <DialogDescription>
              {number
                ? "Update the WhatsApp number and its permissions."
                : "Add a WhatsApp number that can interact with the bot. Set permissions to control what this number can do."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Name / Label</Label>
              <Input
                id="name"
                type="text"
                placeholder="e.g., Spouse, John, Me"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
              <p className="text-xs text-muted-foreground">A label to identify this number</p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="whatsapp_number">WhatsApp Number</Label>
              <Input
                id="whatsapp_number"
                type="tel"
                placeholder="5511999999999"
                value={formData.whatsapp_number}
                onChange={(e) => setFormData({ ...formData, whatsapp_number: e.target.value })}
                required
              />
              <p className="text-xs text-muted-foreground">Enter the full WhatsApp number including country code (e.g., 5511999999999)</p>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="is_primary"
                checked={formData.is_primary}
                onCheckedChange={(checked) => setFormData({ ...formData, is_primary: checked as boolean })}
              />
              <Label htmlFor="is_primary" className="font-normal cursor-pointer">
                Set as primary number
              </Label>
            </div>
            {formData.is_primary && (
              <p className="text-xs text-muted-foreground -mt-3">
                Only one number can be primary.
              </p>
            )}

            <div className="border-t pt-4 space-y-4">
              <Label className="text-base font-semibold">Permissions</Label>
              <div className="space-y-3">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="can_view"
                    checked={formData.permissions.can_view}
                    onCheckedChange={() => togglePermission("can_view")}
                  />
                  <Label htmlFor="can_view" className="font-normal cursor-pointer flex-1">
                    <div>
                      <div className="font-medium">View Transactions</div>
                      <div className="text-xs text-muted-foreground">Can view all transactions and balances</div>
                    </div>
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="can_add"
                    checked={formData.permissions.can_add}
                    onCheckedChange={() => togglePermission("can_add")}
                  />
                  <Label htmlFor="can_add" className="font-normal cursor-pointer flex-1">
                    <div>
                      <div className="font-medium">Add Transactions</div>
                      <div className="text-xs text-muted-foreground">Can add new income and expenses</div>
                    </div>
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="can_edit"
                    checked={formData.permissions.can_edit}
                    onCheckedChange={() => togglePermission("can_edit")}
                  />
                  <Label htmlFor="can_edit" className="font-normal cursor-pointer flex-1">
                    <div>
                      <div className="font-medium">Edit Transactions</div>
                      <div className="text-xs text-muted-foreground">Can modify existing transactions</div>
                    </div>
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="can_delete"
                    checked={formData.permissions.can_delete}
                    onCheckedChange={() => togglePermission("can_delete")}
                  />
                  <Label htmlFor="can_delete" className="font-normal cursor-pointer flex-1">
                    <div>
                      <div className="font-medium">Delete Transactions</div>
                      <div className="text-xs text-muted-foreground">Can delete transactions</div>
                    </div>
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="can_manage_budgets"
                    checked={formData.permissions.can_manage_budgets}
                    onCheckedChange={() => togglePermission("can_manage_budgets")}
                  />
                  <Label htmlFor="can_manage_budgets" className="font-normal cursor-pointer flex-1">
                    <div>
                      <div className="font-medium">Manage Budgets</div>
                      <div className="text-xs text-muted-foreground">Can create, edit, and delete budgets</div>
                    </div>
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="can_view_reports"
                    checked={formData.permissions.can_view_reports}
                    onCheckedChange={() => togglePermission("can_view_reports")}
                  />
                  <Label htmlFor="can_view_reports" className="font-normal cursor-pointer flex-1">
                    <div>
                      <div className="font-medium">View Reports</div>
                      <div className="text-xs text-muted-foreground">Can view financial reports and analytics</div>
                    </div>
                  </Label>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Saving..." : number ? "Update" : "Add"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

