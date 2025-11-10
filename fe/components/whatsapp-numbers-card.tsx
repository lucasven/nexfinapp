"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { WhatsAppNumberDialog } from "./whatsapp-number-dialog"
import { getAuthorizedNumbers, deleteAuthorizedNumber } from "@/lib/actions/profile"
import type { AuthorizedWhatsAppNumber } from "@/lib/types"
import { EditIcon, TrashIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from 'next-intl'

export function WhatsAppNumbersCard() {
  const t = useTranslations()
  const router = useRouter()
  const [numbers, setNumbers] = useState<AuthorizedWhatsAppNumber[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadNumbers()
  }, [])

  const loadNumbers = async () => {
    try {
      const data = await getAuthorizedNumbers()
      setNumbers(data)
    } catch (error) {
      console.error("Error loading WhatsApp numbers:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm(t('whatsapp.deleteConfirm'))) return

    try {
      await deleteAuthorizedNumber(id)
      router.refresh()
      loadNumbers()
    } catch (error) {
      console.error("Error deleting WhatsApp number:", error)
      alert(t('whatsapp.deleteFailed'))
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>{t('whatsapp.title')}</CardTitle>
            <CardDescription>{t('whatsapp.subtitle')}</CardDescription>
          </div>
          <WhatsAppNumberDialog onSaved={loadNumbers} />
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-center py-8 text-muted-foreground">{t('common.loading')}</div>
        ) : numbers.length === 0 ? (
          <div className="text-center py-8 space-y-4">
            <p className="text-muted-foreground">{t('whatsapp.noNumbers')}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {numbers.map((number) => (
              <div
                key={number.id}
                className="flex items-center justify-between p-4 border rounded-lg bg-card hover:bg-accent/50 transition-colors"
              >
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{number.name}</span>
                    {number.is_primary && <Badge variant="default">{t('whatsapp.primary')}</Badge>}
                    <span className="text-sm text-muted-foreground">{number.whatsapp_number}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {number.permissions.can_view && <Badge variant="secondary">{t('whatsapp.view')}</Badge>}
                    {number.permissions.can_add && <Badge variant="secondary">{t('whatsapp.add')}</Badge>}
                    {number.permissions.can_edit && <Badge variant="secondary">{t('whatsapp.edit')}</Badge>}
                    {number.permissions.can_delete && <Badge variant="secondary">{t('whatsapp.delete')}</Badge>}
                    {number.permissions.can_manage_budgets && <Badge variant="secondary">{t('whatsapp.budgets')}</Badge>}
                    {number.permissions.can_view_reports && <Badge variant="secondary">{t('whatsapp.reports')}</Badge>}
                  </div>
                </div>
                <div className="flex gap-2">
                  <WhatsAppNumberDialog number={number} onSaved={loadNumbers} trigger={<Button variant="ghost" size="icon"><EditIcon className="h-4 w-4" /></Button>} />
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(number.id)}>
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

