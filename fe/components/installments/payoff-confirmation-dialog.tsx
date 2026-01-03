"use client"

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { usePostHog } from 'posthog-js/react'
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { getPayoffConfirmationData, payOffInstallment } from '@/lib/actions/installments'
import { getPaymentMethods } from '@/lib/actions/payment-methods'
import type { PayoffConfirmationData, PaymentMethod } from '@/lib/types'
import { AnalyticsEvent } from '@/lib/analytics/events'

interface PayoffConfirmationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  planId: string
  onSuccess: () => void
}

type PayoffStep = 'confirm' | 'transaction-handling'
type TransactionOption = 'just-delete' | 'create-transaction'

/**
 * Payoff Confirmation Dialog Component (Phase 2)
 *
 * Story: 2-5-mark-installment-as-paid-off-early (Enhanced)
 *
 * Two-step flow:
 * 1. Payoff Confirmation - Shows summary and what will happen
 * 2. Transaction Handling - Choose to just delete or create payoff transaction
 *
 * Features:
 * - Two-step confirmation process
 * - Optional payoff transaction creation
 * - Editable payoff amount, payment method, date
 * - Full localization (pt-BR and en)
 * - Analytics tracking
 */
export function PayoffConfirmationDialog({
  open,
  onOpenChange,
  planId,
  onSuccess,
}: PayoffConfirmationDialogProps) {
  const t = useTranslations('installments.payoff')
  const posthog = usePostHog()
  const [loading, setLoading] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [confirmData, setConfirmData] = useState<PayoffConfirmationData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [currentStep, setCurrentStep] = useState<PayoffStep>('confirm')

  // Transaction handling state
  const [transactionOption, setTransactionOption] = useState<TransactionOption>('just-delete')
  const [payoffAmount, setPayoffAmount] = useState<string>('')
  const [payoffDate, setPayoffDate] = useState<string>(new Date().toISOString().split('T')[0])
  const [paymentMethodId, setPaymentMethodId] = useState<string>('')
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([])
  const [loadingPaymentMethods, setLoadingPaymentMethods] = useState(false)

  // Format currency helper
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value)
  }

  // Fetch confirmation data when dialog opens
  useEffect(() => {
    if (open && planId) {
      setLoading(true)
      setError(null)
      setCurrentStep('confirm')

      getPayoffConfirmationData(planId)
        .then((result) => {
          if (result.success && result.data) {
            setConfirmData(result.data)
            setPayoffAmount(result.data.amount_remaining.toString())

            // Track dialog opened event
            posthog?.capture(AnalyticsEvent.INSTALLMENT_PAYOFF_DIALOG_OPENED, {
              planId: result.data.plan_id,
              total_amount: result.data.total_amount,
              remaining_amount: result.data.amount_remaining,
              payments_pending: result.data.payments_pending,
            })
          } else {
            setError(result.error || t('errorGeneric'))
          }
        })
        .catch((err) => {
          console.error('[PayoffConfirmationDialog] Error fetching data:', err)
          setError(t('errorGeneric'))
        })
        .finally(() => {
          setLoading(false)
        })
    }
  }, [open, planId, t, posthog])

  // Fetch payment methods when moving to step 2
  useEffect(() => {
    if (currentStep === 'transaction-handling' && paymentMethods.length === 0) {
      setLoadingPaymentMethods(true)

      async function fetchMethods() {
        try {
          const methods = await getPaymentMethods()
          console.log('[PayoffConfirmationDialog] Fetched payment methods:', methods)

          // Filter to only non-credit payment methods (debit, cash, pix, other)
          const nonCreditMethods = methods.filter(m => m.type !== 'credit')
          console.log('[PayoffConfirmationDialog] Filtered non-credit methods:', nonCreditMethods)

          setPaymentMethods(nonCreditMethods)
          if (nonCreditMethods.length > 0 && !paymentMethodId) {
            setPaymentMethodId(nonCreditMethods[0].id)
          }
        } catch (err) {
          console.error('[PayoffConfirmationDialog] Error fetching payment methods:', err)
        } finally {
          setLoadingPaymentMethods(false)
        }
      }

      fetchMethods()
    }
  }, [currentStep, paymentMethods.length, paymentMethodId])

  async function handleStepOneNext() {
    if (!confirmData) return

    // Check if there are transactions to handle
    if (confirmData.pending_transactions_count === 0) {
      // No transactions, skip step 2 and proceed directly
      await handleFinalConfirm()
    } else {
      // Move to step 2
      setCurrentStep('transaction-handling')
    }
  }

  async function handleFinalConfirm() {
    if (!confirmData) return

    setConfirming(true)
    setError(null)

    try {
      const options = transactionOption === 'create-transaction' && confirmData.pending_transactions_count > 0
        ? {
            createPayoffTransaction: true,
            payoffAmount: parseFloat(payoffAmount),
            payoffPaymentMethodId: paymentMethodId,
            payoffDate: payoffDate,
          }
        : undefined

      const result = await payOffInstallment(planId, options)

      if (result.success) {
        // Success! Dialog will close and parent will handle toast
        onOpenChange(false)
        onSuccess()
      } else {
        // Show error in dialog
        setError(result.error || t('errorGeneric'))
      }
    } catch (err) {
      console.error('[PayoffConfirmationDialog] Error paying off:', err)
      setError(t('errorGeneric'))
    } finally {
      setConfirming(false)
    }
  }

  function handleCancel() {
    // Track cancellation event
    posthog?.capture(AnalyticsEvent.INSTALLMENT_PAYOFF_CANCELLED, {
      planId,
      reason: 'user_cancelled',
      step: currentStep,
    })
    onOpenChange(false)
  }

  function handleBack() {
    setCurrentStep('confirm')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[550px] w-[95vw]"
        showCloseButton={true}
      >
        {/* Step 1: Payoff Confirmation */}
        {currentStep === 'confirm' && (
          <>
            {/* Warning Title */}
            <DialogTitle className="flex items-center gap-2 text-xl">
              <AlertTriangle className="w-6 h-6 text-yellow-500" />
              {t('dialogTitle')}
            </DialogTitle>

            {loading && (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                <p className="ml-3 text-muted-foreground">{t('loadingConfirmation')}</p>
              </div>
            )}

            {error && !loading && (
              <div className="bg-destructive/10 text-destructive rounded-lg p-4 text-sm">
                {error}
              </div>
            )}

            {confirmData && !loading && (
              <>
                {/* Plan Summary */}
                <div className="space-y-2 text-sm">
                  <div>
                    <p className="font-semibold text-base">{confirmData.description}</p>
                    <p className="text-muted-foreground">{confirmData.payment_method_name}</p>
                  </div>

                  <div className="pt-2 space-y-1">
                    <p>
                      {t('totalOriginal', {
                        amount: formatCurrency(confirmData.total_amount),
                        count: confirmData.total_installments,
                      })}
                    </p>
                    <p>
                      {t(confirmData.payments_paid === 1 ? 'alreadyPaid_one' : 'alreadyPaid', {
                        amount: formatCurrency(confirmData.amount_paid),
                        count: confirmData.payments_paid,
                      })}
                    </p>
                    <p className="font-semibold text-base">
                      {t(confirmData.payments_pending === 1 ? 'remaining_one' : 'remaining', {
                        amount: formatCurrency(confirmData.amount_remaining),
                        count: confirmData.payments_pending,
                      })}
                    </p>
                  </div>
                </div>

                {/* What Will Happen */}
                <div className="space-y-2 border-t pt-4">
                  <p className="font-semibold text-sm">{t('whatHappens')}</p>
                  <div className="space-y-1.5 text-sm">
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                      <p>{t('markedAsPaidOff')}</p>
                    </div>
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                      <p>
                        {t(
                          confirmData.payments_pending === 1
                            ? 'futurePaymentsCancelled_one'
                            : 'futurePaymentsCancelled',
                          { count: confirmData.payments_pending }
                        )}
                      </p>
                    </div>
                    {confirmData.pending_transactions_count > 0 && (
                      <div className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                        <p>
                          {t(
                            confirmData.pending_transactions_count === 1
                              ? 'transactionsDeletedCount_one'
                              : 'transactionsDeletedCount',
                            { count: confirmData.pending_transactions_count }
                          )}
                        </p>
                      </div>
                    )}
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                      <p>{t('paidPaymentsPreserved')}</p>
                    </div>
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                      <p>{t('commitmentsUpdated')}</p>
                    </div>
                  </div>
                </div>

                {/* Warning */}
                <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-500 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-yellow-800 dark:text-yellow-200 font-medium">
                      {t('warningIrreversible')}
                    </p>
                  </div>
                </div>
              </>
            )}

            {/* Footer Actions */}
            {confirmData && !loading && (
              <DialogFooter className="flex-col sm:flex-row gap-2">
                <Button
                  variant="outline"
                  onClick={handleCancel}
                  disabled={confirming}
                  className="w-full sm:w-auto"
                >
                  {t('buttonCancel')}
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleStepOneNext}
                  disabled={confirming}
                  className="w-full sm:w-auto"
                >
                  {confirmData.pending_transactions_count > 0 ? t('buttonNext') : t('buttonConfirm')}
                </Button>
              </DialogFooter>
            )}
          </>
        )}

        {/* Step 2: Transaction Handling */}
        {currentStep === 'transaction-handling' && confirmData && (
          <>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <AlertTriangle className="w-6 h-6 text-yellow-500" />
              {t('transactionHandlingTitle')}
            </DialogTitle>

            <div className="space-y-4">
              {/* Warning about transactions */}
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
                <p className="text-sm text-yellow-800 dark:text-yellow-200">
                  {t(
                    confirmData.pending_transactions_count === 1
                      ? 'transactionHandlingWarning_one'
                      : 'transactionHandlingWarning',
                    { count: confirmData.pending_transactions_count }
                  )}
                </p>
              </div>

              {/* Question */}
              <p className="font-semibold">{t('transactionHandlingQuestion')}</p>

              {/* Options */}
              <RadioGroup value={transactionOption} onValueChange={(value: TransactionOption) => setTransactionOption(value)}>
                <div className="space-y-3">
                  {/* Option 1: Just Delete */}
                  <div className="flex items-start space-x-3 border rounded-lg p-3 hover:bg-accent cursor-pointer">
                    <RadioGroupItem value="just-delete" id="just-delete" className="mt-1" />
                    <div className="flex-1 cursor-pointer" onClick={() => setTransactionOption('just-delete')}>
                      <Label htmlFor="just-delete" className="font-semibold cursor-pointer">
                        {t('optionJustDelete')}
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        {t('optionJustDeleteDesc')}
                      </p>
                    </div>
                  </div>

                  {/* Option 2: Create Payoff Transaction */}
                  <div className="flex items-start space-x-3 border rounded-lg p-3 hover:bg-accent cursor-pointer">
                    <RadioGroupItem value="create-transaction" id="create-transaction" className="mt-1" />
                    <div className="flex-1 cursor-pointer" onClick={() => setTransactionOption('create-transaction')}>
                      <Label htmlFor="create-transaction" className="font-semibold cursor-pointer">
                        {t('optionCreateTransaction')}
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        {t('optionCreateTransactionDesc')}
                      </p>
                    </div>
                  </div>
                </div>
              </RadioGroup>

              {/* Transaction Creation Form (only if option 2 selected) */}
              {transactionOption === 'create-transaction' && (
                <div className="space-y-3 border-t pt-4">
                  {/* Payoff Amount */}
                  <div className="space-y-2">
                    <Label htmlFor="payoff-amount">{t('payoffAmountLabel')}</Label>
                    <Input
                      id="payoff-amount"
                      type="number"
                      step="0.01"
                      value={payoffAmount}
                      onChange={(e) => setPayoffAmount(e.target.value)}
                      placeholder={t('payoffAmountPlaceholder')}
                    />
                  </div>

                  {/* Payment Method */}
                  <div className="space-y-2">
                    <Label htmlFor="payment-method">{t('paymentMethodLabel')}</Label>
                    {loadingPaymentMethods ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                        Loading...
                      </div>
                    ) : (
                      <Select value={paymentMethodId} onValueChange={setPaymentMethodId}>
                        <SelectTrigger id="payment-method">
                          <SelectValue placeholder={t('paymentMethodPlaceholder')} />
                        </SelectTrigger>
                        <SelectContent>
                          {paymentMethods.map((method) => (
                            <SelectItem key={method.id} value={method.id}>
                              {method.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>

                  {/* Payoff Date */}
                  <div className="space-y-2">
                    <Label htmlFor="payoff-date">{t('payoffDateLabel')}</Label>
                    <Input
                      id="payoff-date"
                      type="date"
                      value={payoffDate}
                      onChange={(e) => setPayoffDate(e.target.value)}
                    />
                  </div>
                </div>
              )}

              {error && (
                <div className="bg-destructive/10 text-destructive rounded-lg p-4 text-sm">
                  {error}
                </div>
              )}
            </div>

            {/* Footer Actions */}
            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button
                variant="outline"
                onClick={handleBack}
                disabled={confirming}
                className="w-full sm:w-auto"
              >
                {t('buttonCancel')}
              </Button>
              <Button
                variant="destructive"
                onClick={handleFinalConfirm}
                disabled={confirming || (transactionOption === 'create-transaction' && (!payoffAmount || !paymentMethodId))}
                className="w-full sm:w-auto"
              >
                {confirming ? t('confirmingPayoff') : t('buttonConfirm')}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
