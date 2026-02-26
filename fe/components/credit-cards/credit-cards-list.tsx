'use client'

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
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
import { PlusIcon, CreditCardIcon, EditIcon, TrashIcon } from "lucide-react"
import { useTranslations, useLocale } from 'next-intl'
import { formatCurrency } from '@/lib/localization/format'
import { PaymentMethod } from '@/lib/types'
import { calculatePaymentDueDate, formatPaymentDueDate } from '@/lib/utils/payment-due-date'
import { useState } from 'react'
import { AddCreditCardDialog } from '@/components/settings/add-credit-card-dialog'
import { deletePaymentMethod } from '@/lib/actions/payment-methods'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { EditCreditCardDialog } from '@/components/credit-cards/edit-credit-card-dialog'

interface CreditCardsListProps {
  creditCards: PaymentMethod[]
}

export function CreditCardsList({ creditCards }: CreditCardsListProps) {
  const t = useTranslations()
  const locale = useLocale()
  const router = useRouter()
  const [selectedCard, setSelectedCard] = useState<PaymentMethod | null>(null)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [cardToDelete, setCardToDelete] = useState<PaymentMethod | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const handleDelete = async () => {
    if (!cardToDelete) return

    setIsDeleting(true)
    try {
      const result = await deletePaymentMethod(cardToDelete.id)

      if (result.success) {
        toast.success('Cartão excluído com sucesso')
        setDeleteDialogOpen(false)
        setCardToDelete(null)
        router.refresh()
      } else {
        toast.error(result.error || 'Erro ao excluir cartão')
      }
    } catch (error) {
      console.error('Error deleting card:', error)
      toast.error('Erro ao excluir cartão')
    } finally {
      setIsDeleting(false)
    }
  }

  const handleRefresh = () => {
    router.refresh()
  }

  // Empty state
  if (creditCards.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('creditCards.title')}</h1>
          <p className="text-muted-foreground mt-1">{t('creditCards.subtitle')}</p>
        </div>

        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="rounded-full bg-muted p-6 mb-4">
              <CreditCardIcon className="h-12 w-12 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">{t('creditCards.noCreditCards')}</h3>
            <p className="text-sm text-muted-foreground mb-6 max-w-md">
              {t('creditCards.noCreditCardsHint')}
            </p>
            <AddCreditCardDialog
              onSuccess={handleRefresh}
              trigger={
                <Button size="lg">
                  <PlusIcon className="h-5 w-5 mr-2" />
                  {t('creditCards.addFirstCard')}
                </Button>
              }
            />
          </CardContent>
        </Card>

        {/* Help Section */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('creditCards.helpTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="default">{t('creditCards.creditMode')}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {t('creditCards.creditModeDescription')}
              </p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{t('creditCards.simpleMode')}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {t('creditCards.simpleModeDescription')}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // List view
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('creditCards.title')}</h1>
          <p className="text-muted-foreground mt-1">{t('creditCards.subtitle')}</p>
        </div>
        <AddCreditCardDialog
          onSuccess={handleRefresh}
          trigger={
            <Button>
              <PlusIcon className="h-4 w-4 mr-2" />
              {t('creditCards.addCard')}
            </Button>
          }
        />
      </div>

      <div className="grid gap-4">
        {creditCards.map((card) => (
          <Card key={card.id} className="hover:shadow-md transition-shadow">
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4 flex-1">
                  <div className="rounded-full bg-muted p-3">
                    <CreditCardIcon className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <div className="flex-1 space-y-3">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-lg font-semibold">{card.name}</h3>
                        <Badge variant={card.credit_mode ? 'default' : 'secondary'}>
                          {card.credit_mode ? t('creditCards.creditMode') : t('creditCards.simpleMode')}
                        </Badge>
                      </div>
                    </div>

                    {/* Credit Mode Information */}
                    {card.credit_mode && (
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">{t('creditCards.budget')}</p>
                          <p className="text-sm font-medium">
                            {card.monthly_budget
                              ? formatCurrency(card.monthly_budget, locale as 'pt-br' | 'en')
                              : t('creditCards.noBudgetSet')}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">{t('creditCards.closingDay')}</p>
                          <p className="text-sm font-medium">
                            {card.days_before_closing !== null && card.payment_due_day
                              ? (() => {
                                  const today = new Date()
                                  const pDate = new Date(today.getFullYear(), today.getMonth(), card.payment_due_day)
                                  const cDate = new Date(pDate)
                                  cDate.setDate(cDate.getDate() - card.days_before_closing!)
                                  return t('creditCards.day', { day: cDate.getDate() })
                                })()
                              : card.statement_closing_day
                                ? t('creditCards.day', { day: card.statement_closing_day })
                                : t('creditCards.notConfigured')}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">{t('creditCards.dueDay')}</p>
                          <p className="text-sm font-medium">
                            {card.payment_due_day
                              ? t('creditCards.day', { day: card.payment_due_day })
                              : t('creditCards.notConfigured')}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 ml-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSelectedCard(card)
                      setEditDialogOpen(true)
                    }}
                  >
                    <EditIcon className="h-4 w-4 mr-2" />
                    {t('common.edit')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setCardToDelete(card)
                      setDeleteDialogOpen(true)
                    }}
                  >
                    <TrashIcon className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Help Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('creditCards.helpTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant="default">{t('creditCards.creditMode')}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {t('creditCards.creditModeDescription')}
            </p>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{t('creditCards.simpleMode')}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {t('creditCards.simpleModeDescription')}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      {selectedCard && (
        <EditCreditCardDialog
          card={selectedCard}
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
          onSuccess={handleRefresh}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('creditCards.deleteCard')}</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>{t('creditCards.deleteConfirm')}</p>
              <p className="text-sm text-muted-foreground">
                {t('creditCards.deleteWarning')}
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>
              {t('common.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                handleDelete()
              }}
              disabled={isDeleting}
              className="bg-destructive hover:bg-destructive/90"
            >
              {isDeleting ? t('common.deleting') : t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
