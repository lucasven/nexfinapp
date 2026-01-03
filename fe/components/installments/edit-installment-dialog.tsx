"use client"

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useTranslations } from 'next-intl'
import { Pencil } from 'lucide-react'
import { usePostHog } from 'posthog-js/react'
import { toast } from 'sonner'
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
import { getInstallmentDetails, updateInstallment } from '@/lib/actions/installments'
import type { InstallmentPlanDetails, Category } from '@/lib/types'
import { AnalyticsEvent } from '@/lib/analytics/events'

interface EditInstallmentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  planId: string
  onSuccess: () => void
  categories: Category[]
}

/**
 * Edit Installment Dialog Component
 *
 * Story: 2-6-edit-installment-plan
 * Acceptance Criteria: AC6.1, AC6.2, AC6.3, AC6.4
 *
 * Allows users to edit active installment plan details with automatic recalculation.
 *
 * Features:
 * - Editable fields: description, total amount, installments, merchant, category
 * - Real-time monthly payment calculation
 * - Impact preview showing what will change
 * - Preserves paid payment history (only pending payments recalculated)
 * - Validation: description required, amount > 0, installments >= paid count
 * - Localized (pt-BR and en)
 * - Analytics tracking
 */
export function EditInstallmentDialog({
  open,
  onOpenChange,
  planId,
  onSuccess,
  categories,
}: EditInstallmentDialogProps) {
  const t = useTranslations('installments.edit')
  const posthog = usePostHog()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [planDetails, setPlanDetails] = useState<InstallmentPlanDetails | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Format currency helper
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value)
  }

  // Create validation schema dynamically based on paid count
  const createSchema = (paidCount: number) => z.object({
    description: z.string().min(1, t('errorDescriptionRequired')).max(200),
    total_amount: z.number().min(0.01, t('errorAmountInvalid')).max(999999.99),
    total_installments: z.number()
      .int()
      .min(paidCount, t('errorInstallmentsTooLow', { count: paidCount }))
      .max(60, t('errorInstallmentsTooHigh')),
    merchant: z.string().max(100).optional(),
    category_id: z.string().nullable().optional(),
  })

  const form = useForm<{
    description: string
    total_amount: number
    total_installments: number
    merchant?: string
    category_id?: string | null
  }>({
    resolver: zodResolver(createSchema(planDetails?.payments_paid_count || 0)),
  })

  const watchedAmount = form.watch('total_amount')
  const watchedInstallments = form.watch('total_installments')

  // Calculate real-time monthly payment
  const calculateMonthlyPayment = () => {
    if (!planDetails) return 0

    const newAmount = watchedAmount || planDetails.plan.total_amount
    const newInstallments = watchedInstallments || planDetails.plan.total_installments
    const paidCount = planDetails.payments_paid_count
    const paidAmount = planDetails.total_paid

    const pendingCount = newInstallments - paidCount
    if (pendingCount <= 0) return 0

    const remainingAmount = newAmount - paidAmount
    return Math.floor((remainingAmount / pendingCount) * 100) / 100
  }

  // Fetch plan details when dialog opens
  useEffect(() => {
    if (open && planId) {
      setLoading(true)
      setError(null)

      getInstallmentDetails(planId)
        .then((result) => {
          if (result.success && result.data) {
            setPlanDetails(result.data)

            // Pre-fill form with current values
            form.reset({
              description: result.data.plan.description,
              total_amount: result.data.plan.total_amount,
              total_installments: result.data.plan.total_installments,
              merchant: result.data.plan.merchant || undefined,
              category_id: result.data.plan.category_id || null,
            })

            // Track dialog opened event
            posthog?.capture(AnalyticsEvent.INSTALLMENT_EDIT_DIALOG_OPENED, {
              planId: result.data.plan.id,
              currentAmount: result.data.plan.total_amount,
              currentInstallments: result.data.plan.total_installments,
            })
          } else {
            setError(result.error || t('errorGeneric'))
          }
        })
        .catch((err) => {
          console.error('[EditInstallmentDialog] Error fetching details:', err)
          setError(t('errorGeneric'))
        })
        .finally(() => {
          setLoading(false)
        })
    }
  }, [open, planId, form, t, posthog])

  async function handleSubmit(values: any) {
    if (!planDetails) return

    setSaving(true)
    setError(null)

    try {
      // Prepare updates (only send changed fields)
      const updates: any = {}

      if (values.description !== planDetails.plan.description) {
        updates.description = values.description
      }
      if (values.total_amount !== planDetails.plan.total_amount) {
        updates.total_amount = values.total_amount
      }
      if (values.total_installments !== planDetails.plan.total_installments) {
        updates.total_installments = values.total_installments
      }
      if (values.merchant !== (planDetails.plan.merchant || '')) {
        updates.merchant = values.merchant || null
      }
      if (values.category_id !== planDetails.plan.category_id) {
        updates.category_id = values.category_id
      }

      const result = await updateInstallment(planId, updates)

      if (result.success && result.updateData) {
        // Show success toast
        toast.success(t('successTitle'), {
          description: t('successFields', {
            fields: result.updateData.fields_changed.join(', ')
          })
        })

        // Track cancelled event if user clicks cancel
        posthog?.capture(AnalyticsEvent.INSTALLMENT_EDITED, {
          planId: planDetails.plan.id,
          fieldsChanged: result.updateData.fields_changed,
          oldAmount: result.updateData.old_amount,
          newAmount: result.updateData.new_amount,
          oldInstallments: result.updateData.old_installments,
          newInstallments: result.updateData.new_installments,
          paymentsAdded: result.updateData.payments_added,
          paymentsRemoved: result.updateData.payments_removed,
          paymentsRecalculated: result.updateData.payments_recalculated,
        })

        onSuccess()
        onOpenChange(false)
      } else {
        const errorMessage = result.error || t('errorGeneric')
        setError(errorMessage)
        toast.error(t('errorGeneric'), {
          description: errorMessage
        })
      }
    } catch (err) {
      console.error('[EditInstallmentDialog] Error updating installment:', err)
      setError(t('errorGeneric'))
      toast.error(t('errorGeneric'))
    } finally {
      setSaving(false)
    }
  }

  function handleCancel() {
    const isDirty = form.formState.isDirty

    if (isDirty) {
      const confirmed = window.confirm(t('warningUnsavedChanges'))
      if (!confirmed) return

      // Track cancelled event
      posthog?.capture(AnalyticsEvent.INSTALLMENT_EDIT_CANCELLED, {
        planId: planDetails?.plan.id,
        hadChanges: true,
        timestamp: new Date().toISOString()
      })
    }

    onOpenChange(false)
  }

  // Calculate impact preview data
  const getImpactPreview = () => {
    if (!planDetails) return null

    const currentAmount = planDetails.plan.total_amount
    const currentInstallments = planDetails.plan.total_installments
    const newAmount = watchedAmount || currentAmount
    const newInstallments = watchedInstallments || currentInstallments
    const paidCount = planDetails.payments_paid_count
    const pendingCount = currentInstallments - paidCount
    const newPendingCount = newInstallments - paidCount

    const amountChanged = newAmount !== currentAmount
    const installmentsChanged = newInstallments !== currentInstallments
    const needsRecalculation = amountChanged || installmentsChanged

    const paymentsAdded = newInstallments > currentInstallments ? newInstallments - currentInstallments : 0
    const paymentsRemoved = newInstallments < currentInstallments ? currentInstallments - newInstallments : 0

    const oldMonthly = Math.floor((currentAmount / currentInstallments) * 100) / 100
    const newMonthly = calculateMonthlyPayment()

    return {
      needsRecalculation,
      paidCount,
      pendingCount: newPendingCount,
      paymentsAdded,
      paymentsRemoved,
      oldMonthly,
      newMonthly,
      monthlyChanged: oldMonthly !== newMonthly && needsRecalculation
    }
  }

  const impactPreview = getImpactPreview()
  const monthlyPayment = calculateMonthlyPayment()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogTitle className="flex items-center gap-2">
          <Pencil className="h-5 w-5" />
          {t('dialogTitle')}
        </DialogTitle>

        <DialogDescription className="sr-only">
          {t('dialogTitle')}
        </DialogDescription>

        {loading ? (
          <div className="py-8 text-center text-muted-foreground">
            {t('loading')}
          </div>
        ) : error ? (
          <div className="py-8 text-center text-destructive">
            {error}
          </div>
        ) : planDetails ? (
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
            {/* Description Field */}
            <div className="space-y-2">
              <Label htmlFor="description">{t('description')} *</Label>
              <Input
                id="description"
                {...form.register('description')}
                placeholder={t('descriptionPlaceholder')}
                maxLength={200}
              />
              {form.formState.errors.description && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.description.message}
                </p>
              )}
            </div>

            {/* Category Field */}
            <div className="space-y-2">
              <Label htmlFor="category">{t('category')}</Label>
              <Select
                value={form.watch('category_id') || '__none__'}
                onValueChange={(value) => form.setValue('category_id', value === '__none__' ? null : value, { shouldDirty: true })}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('categoryPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">
                    {t('categoryPlaceholder')}
                  </SelectItem>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.icon || ''} {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Merchant Field */}
            <div className="space-y-2">
              <Label htmlFor="merchant">{t('merchant')}</Label>
              <Input
                id="merchant"
                {...form.register('merchant')}
                placeholder={t('merchantPlaceholder')}
                maxLength={100}
              />
            </div>

            <hr className="border-border" />

            {/* Total Amount Field */}
            <div className="space-y-2">
              <Label htmlFor="total_amount">{t('totalAmount')} *</Label>
              <Input
                id="total_amount"
                type="number"
                step="0.01"
                {...form.register('total_amount', { valueAsNumber: true })}
              />
              {form.formState.errors.total_amount && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.total_amount.message}
                </p>
              )}
            </div>

            {/* Total Installments Field */}
            <div className="space-y-2">
              <Label htmlFor="total_installments">{t('totalInstallments')} *</Label>
              <Input
                id="total_installments"
                type="number"
                min={planDetails.payments_paid_count}
                max={60}
                {...form.register('total_installments', { valueAsNumber: true })}
              />
              {form.formState.errors.total_installments && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.total_installments.message}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                {t('minInstallments', { count: planDetails.payments_paid_count })}
              </p>
            </div>

            {/* Monthly Payment (Read-only) */}
            <div className="space-y-2">
              <Label>{t('monthlyPayment')}</Label>
              <div className="text-2xl font-bold">
                {formatCurrency(monthlyPayment)}
              </div>
            </div>

            <hr className="border-border" />

            {/* Impact Preview */}
            {impactPreview && impactPreview.needsRecalculation && (
              <div className="space-y-3 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950/30">
                <div className="text-sm font-semibold text-blue-900 dark:text-blue-100">
                  💡 {t('whatHappens')}
                </div>
                <ul className="space-y-2 text-sm text-blue-800 dark:text-blue-200">
                  {/* Paid unchanged */}
                  {impactPreview.paidCount > 0 && (
                    <li className="flex items-start gap-2">
                      <span>•</span>
                      <span>
                        {t(impactPreview.paidCount === 1 ? 'paidUnchanged_one' : 'paidUnchanged', {
                          count: impactPreview.paidCount
                        })}
                      </span>
                    </li>
                  )}

                  {/* Pending recalculated */}
                  {impactPreview.pendingCount > 0 && (
                    <li className="flex items-start gap-2">
                      <span>•</span>
                      <span>
                        {t(impactPreview.pendingCount === 1 ? 'pendingRecalculated_one' : 'pendingRecalculated', {
                          count: impactPreview.pendingCount
                        })}
                      </span>
                    </li>
                  )}

                  {/* Payments added */}
                  {impactPreview.paymentsAdded > 0 && (
                    <li className="flex items-start gap-2">
                      <span>•</span>
                      <span>
                        {t(impactPreview.paymentsAdded === 1 ? 'paymentsAdded_one' : 'paymentsAdded', {
                          count: impactPreview.paymentsAdded
                        })}
                      </span>
                    </li>
                  )}

                  {/* Payments removed */}
                  {impactPreview.paymentsRemoved > 0 && (
                    <li className="flex items-start gap-2">
                      <span>•</span>
                      <span>
                        {t(impactPreview.paymentsRemoved === 1 ? 'paymentsRemoved_one' : 'paymentsRemoved', {
                          count: impactPreview.paymentsRemoved
                        })}
                      </span>
                    </li>
                  )}

                  {/* Monthly change */}
                  {impactPreview.monthlyChanged && (
                    <li className="flex items-start gap-2">
                      <span>•</span>
                      <span>
                        {t('monthlyChange', {
                          oldAmount: formatCurrency(impactPreview.oldMonthly),
                          newAmount: formatCurrency(impactPreview.newMonthly)
                        })}
                      </span>
                    </li>
                  )}

                  {/* Commitments updated */}
                  <li className="flex items-start gap-2">
                    <span>•</span>
                    <span>{t('commitmentsUpdated')}</span>
                  </li>
                </ul>
              </div>
            )}

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={handleCancel}
                disabled={saving}
              >
                {t('buttonCancel')}
              </Button>
              <Button
                type="submit"
                disabled={saving || !form.formState.isDirty}
              >
                {saving ? t('saving') : t('buttonSave')}
              </Button>
            </DialogFooter>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
