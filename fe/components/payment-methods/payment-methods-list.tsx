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
import { PlusIcon, WalletIcon, EditIcon, TrashIcon } from "lucide-react"
import { useTranslations, useLocale } from 'next-intl'
import { PaymentMethod } from '@/lib/types'
import { translatePaymentMethodName } from '@/lib/localization/payment-method-translations'
import { useState } from 'react'
import { deletePaymentMethod } from '@/lib/actions/payment-methods'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { AddPaymentMethodDialog } from '@/components/payment-methods/add-payment-method-dialog'
import { EditPaymentMethodDialog } from '@/components/payment-methods/edit-payment-method-dialog'

interface PaymentMethodsListProps {
  paymentMethods: PaymentMethod[]
}

const TYPE_ICONS = {
  cash: '💵',
  pix: '📱',
  other: '🏦',
  credit: '💳',
  debit: '💳',
} as const

export function PaymentMethodsList({ paymentMethods }: PaymentMethodsListProps) {
  const t = useTranslations()
  const locale = useLocale()
  const router = useRouter()
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | null>(null)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [methodToDelete, setMethodToDelete] = useState<PaymentMethod | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const handleDelete = async () => {
    if (!methodToDelete) return

    setIsDeleting(true)
    try {
      const result = await deletePaymentMethod(methodToDelete.id)

      if (result.success) {
        toast.success(t('paymentMethods.deleteSuccess'))
        setDeleteDialogOpen(false)
        setMethodToDelete(null)
        router.refresh()
      } else {
        toast.error(result.error || t('paymentMethods.deleteError'))
      }
    } catch (error) {
      console.error('Error deleting payment method:', error)
      toast.error(t('paymentMethods.deleteError'))
    } finally {
      setIsDeleting(false)
    }
  }

  const handleRefresh = () => {
    router.refresh()
  }

  const getTypeLabel = (type: string) => {
    const key = type as keyof typeof TYPE_ICONS
    return t(`paymentMethods.types.${key}` as any) || type
  }

  const getTypeIcon = (type: string) => {
    const key = type as keyof typeof TYPE_ICONS
    return TYPE_ICONS[key] || TYPE_ICONS.other
  }

  // Empty state
  if (paymentMethods.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('paymentMethods.title')}</h1>
          <p className="text-muted-foreground mt-1">{t('paymentMethods.subtitle')}</p>
        </div>

        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="rounded-full bg-muted p-6 mb-4">
              <WalletIcon className="h-12 w-12 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">{t('paymentMethods.noMethods')}</h3>
            <p className="text-sm text-muted-foreground mb-6 max-w-md">
              {t('paymentMethods.noMethodsHint')}
            </p>
            <AddPaymentMethodDialog
              onSuccess={handleRefresh}
              trigger={
                <Button size="lg">
                  <PlusIcon className="h-5 w-5 mr-2" />
                  {t('paymentMethods.addFirstMethod')}
                </Button>
              }
            />
          </CardContent>
        </Card>

        {/* Help Section */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('paymentMethods.helpTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {t('paymentMethods.helpDescription')}
            </p>
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
          <h1 className="text-3xl font-bold tracking-tight">{t('paymentMethods.title')}</h1>
          <p className="text-muted-foreground mt-1">{t('paymentMethods.subtitle')}</p>
        </div>
        <AddPaymentMethodDialog
          onSuccess={handleRefresh}
          trigger={
            <Button>
              <PlusIcon className="h-4 w-4 mr-2" />
              {t('paymentMethods.addMethod')}
            </Button>
          }
        />
      </div>

      <div className="grid gap-4">
        {paymentMethods.map((method) => (
          <Card key={method.id} className="hover:shadow-md transition-shadow">
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4 flex-1">
                  <div className="rounded-full bg-muted p-3 text-2xl">
                    {getTypeIcon(method.type)}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-lg font-semibold">{translatePaymentMethodName(method.name, locale)}</h3>
                      <Badge variant="secondary">
                        {getTypeLabel(method.type)}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {t('paymentMethods.createdOn')} {new Date(method.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 ml-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSelectedMethod(method)
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
                      setMethodToDelete(method)
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
          <CardTitle className="text-base">{t('paymentMethods.helpTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {t('paymentMethods.helpDescription')}
          </p>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      {selectedMethod && (
        <EditPaymentMethodDialog
          method={selectedMethod}
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
          onSuccess={handleRefresh}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('paymentMethods.deleteMethod')}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="text-sm text-muted-foreground space-y-2">
                <p>{t('paymentMethods.deleteConfirm')}</p>
                <p className="text-sm text-muted-foreground">
                  {t('paymentMethods.deleteWarning')}
                </p>
              </div>
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
