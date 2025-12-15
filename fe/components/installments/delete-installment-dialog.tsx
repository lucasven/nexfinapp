"use client"

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react'
import { usePostHog } from 'posthog-js/react'
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { getPayoffConfirmationData, deleteInstallment } from '@/lib/actions/installments'
import type { PayoffConfirmationData } from '@/lib/types'
import { AnalyticsEvent } from '@/lib/analytics/events'

interface DeleteInstallmentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  planId: string
  onSuccess: () => void
}

/**
 * Delete Installment Dialog Component
 *
 * Story: 2-7-delete-installment-plan
 * Acceptance Criteria: AC7.1, AC7.2
 *
 * Displays a confirmation dialog when user attempts to delete an installment plan.
 * Shows comprehensive warning with paid/pending counts, explanation of what will happen,
 * and irreversibility warning.
 *
 * Features:
 * - Clear summary of paid/pending amounts
 * - Bullet points explaining the deletion consequences
 * - Warning about irreversible action
 * - Two action buttons: Cancel and Delete Permanently (destructive)
 * - Keyboard navigation (accessible)
 * - Mobile-responsive layout
 * - Localized (pt-BR and en)
 * - Analytics tracking
 */
export function DeleteInstallmentDialog({
  open,
  onOpenChange,
  planId,
  onSuccess,
}: DeleteInstallmentDialogProps) {
  const t = useTranslations('installments.delete')
  const posthog = usePostHog()
  const [loading, setLoading] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmData, setConfirmData] = useState<PayoffConfirmationData | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Format currency helper
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value)
  }

  // Fetch confirmation data when dialog opens (reuse getPayoffConfirmationData)
  useEffect(() => {
    if (open && planId) {
      setLoading(true)
      setError(null)

      getPayoffConfirmationData(planId)
        .then((result) => {
          if (result.success && result.data) {
            setConfirmData(result.data)

            // Track dialog opened event
            posthog?.capture(AnalyticsEvent.INSTALLMENT_DELETE_DIALOG_OPENED, {
              planId: result.data.plan_id,
              paidCount: result.data.payments_paid,
              pendingCount: result.data.payments_pending,
              totalAmount: result.data.total_amount,
            })
          } else {
            setError(result.error || t('errorGeneric'))
          }
        })
        .catch((err) => {
          console.error('[DeleteInstallmentDialog] Error fetching data:', err)
          setError(t('errorGeneric'))
        })
        .finally(() => {
          setLoading(false)
        })
    }
  }, [open, planId, t, posthog])

  async function handleDelete() {
    if (!confirmData) return

    setDeleting(true)
    setError(null)

    try {
      const result = await deleteInstallment(planId)

      if (result.success) {
        // Success! Dialog will close and parent will handle toast
        onOpenChange(false)
        onSuccess()
      } else {
        // Show error in dialog
        setError(result.error || t('errorGeneric'))
      }
    } catch (err) {
      console.error('[DeleteInstallmentDialog] Error deleting:', err)
      setError(t('errorGeneric'))
    } finally {
      setDeleting(false)
    }
  }

  function handleCancel() {
    // Track cancellation event
    posthog?.capture(AnalyticsEvent.INSTALLMENT_DELETE_CANCELLED, {
      planId,
      paidCount: confirmData?.payments_paid || 0,
      pendingCount: confirmData?.payments_pending || 0,
      timestamp: new Date().toISOString(),
    })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[550px] w-[95vw]"
        showCloseButton={true}
      >
        {/* Warning Title */}
        <DialogTitle className="flex items-center gap-2 text-xl">
          <AlertTriangle className="w-6 h-6 text-red-500" />
          {t('dialogTitle')}
        </DialogTitle>

        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            <p className="ml-3 text-muted-foreground">{t('loading')}</p>
          </div>
        )}

        {error && !loading && (
          <div className="bg-destructive/10 text-destructive rounded-lg p-4 text-sm">
            {error}
          </div>
        )}

        {confirmData && !loading && (
          <>
            {/* Warning Intro */}
            <div className="text-sm font-medium text-muted-foreground">
              {t('warningIntro')}
            </div>

            {/* Plan Summary */}
            <div className="space-y-2 text-sm">
              <div>
                <p className="font-semibold text-base">📝 {confirmData.description}</p>
                <p className="text-muted-foreground">💳 {confirmData.payment_method_name}</p>
                <p className="text-muted-foreground">
                  💰 Total: {formatCurrency(confirmData.total_amount)} em {confirmData.total_installments}x de {formatCurrency(confirmData.total_amount / confirmData.total_installments)}
                </p>
              </div>

              {/* Current Status */}
              <div className="pt-2 border-t">
                <p className="font-semibold text-sm mb-1">{t('currentStatus')}</p>
                <div className="space-y-1">
                  <p className="text-green-600 dark:text-green-400">
                    • {t(confirmData.payments_paid === 1 ? 'paidPayments_one' : 'paidPayments', {
                      count: confirmData.payments_paid,
                      amount: formatCurrency(confirmData.amount_paid),
                    })}
                  </p>
                  <p className="text-orange-600 dark:text-orange-400">
                    • {t(confirmData.payments_pending === 1 ? 'pendingPayments_one' : 'pendingPayments', {
                      count: confirmData.payments_pending,
                      amount: formatCurrency(confirmData.amount_remaining),
                    })}
                  </p>
                </div>
              </div>
            </div>

            {/* What Will Happen */}
            <div className="space-y-2 border-t pt-4">
              <p className="font-semibold text-sm">{t('whatHappens')}</p>
              <div className="space-y-1.5 text-sm">
                <div className="flex items-start gap-2">
                  <XCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                  <p>{t('planRemoved')}</p>
                </div>
                <div className="flex items-start gap-2">
                  <XCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                  <p>
                    {t(
                      confirmData.payments_pending === 1
                        ? 'pendingDeleted_one'
                        : 'pendingDeleted',
                      { count: confirmData.payments_pending }
                    )}
                  </p>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <p>
                    {t(
                      confirmData.payments_paid === 1
                        ? 'paidPreserved_one'
                        : 'paidPreserved',
                      { count: confirmData.payments_paid }
                    )}
                  </p>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <p>
                    {t('commitmentsUpdated', {
                      amount: formatCurrency(confirmData.amount_remaining),
                    })}
                  </p>
                </div>
              </div>
            </div>

            {/* Warning */}
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-500 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-red-800 dark:text-red-200 font-medium">
                  {t('irreversible')}
                </p>
              </div>
            </div>

            {/* Confirm Prompt */}
            <div className="text-sm font-medium text-center">
              {t('confirmPrompt')}
            </div>
          </>
        )}

        {/* Footer Actions */}
        {confirmData && !loading && (
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={handleCancel}
              disabled={deleting}
              className="w-full sm:w-auto"
            >
              {t('buttonCancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
              className="w-full sm:w-auto bg-red-600 hover:bg-red-700"
            >
              {deleting ? t('deleting') : t('buttonDelete')}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
