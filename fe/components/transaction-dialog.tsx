"use client"

import type React from "react"

import { useState, useEffect, useMemo } from "react"
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { createTransaction, updateTransaction } from "@/lib/actions/transactions"
import { createInstallment } from "@/lib/actions/installments"
import { findOrCreatePaymentMethod } from "@/lib/actions/payment-methods"
import { DEFAULT_PAYMENT_METHODS } from "@/lib/constants/payment-methods"
import type { Category, Transaction, PaymentMethod } from "@/lib/types"
import { PlusIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations, useLocale } from 'next-intl'
import { translateCategoryName } from '@/lib/localization/category-translations'
import { trackEvent } from '@/lib/analytics/tracker'
import { AnalyticsEvent } from '@/lib/analytics/events'
import { advanceOnboardingStep } from "@/lib/actions/onboarding"
import type { OnboardingStep } from "@/hooks/use-onboarding"
import { toast } from "sonner"
import { useInvalidateBudgetProgress } from '@/lib/hooks/useBudgetProgress'

interface TransactionDialogProps {
  categories: Category[]
  paymentMethods: PaymentMethod[]
  transaction?: Transaction
  trigger?: React.ReactNode
  currentStep?: OnboardingStep
}

export function TransactionDialog({ categories, paymentMethods, transaction, trigger, currentStep }: TransactionDialogProps) {
  const t = useTranslations()
  const locale = useLocale()
  const router = useRouter()
  const { invalidateAll: invalidateBudgetProgress } = useInvalidateBudgetProgress()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    amount: transaction?.amount.toString() || "",
    type: transaction?.type || ("expense" as "income" | "expense"),
    category_id: transaction?.category_id || "",
    description: transaction?.description || "",
    date: transaction?.date || new Date().toISOString().split("T")[0],
    payment_method_id: transaction?.payment_method_id || "",
  })

  // Story 2.2: Installment fields state
  const [isInstallment, setIsInstallment] = useState(false)
  const [installmentData, setInstallmentData] = useState({
    totalAmount: "",
    totalInstallments: "1",
    firstPaymentDate: new Date().toISOString().split("T")[0],
    merchant: "",
  })

  // Get current locale for default payment method names

  // Combine existing payment methods with default suggestions
  // Filter out defaults that already exist (by name match)
  const existingNames = new Set(paymentMethods.map(pm => pm.name.toLowerCase()))
  const defaultSuggestions = DEFAULT_PAYMENT_METHODS
    .filter(def => !existingNames.has(def.name.toLowerCase()) && !existingNames.has(def.nameEn.toLowerCase()))
    .map(def => ({
      id: `suggestion:${def.type}:${def.name}`, // Special ID format to identify suggestions
      name: locale === 'pt-BR' ? def.name : def.nameEn,
      type: def.type,
      icon: def.icon,
      isSuggestion: true as const,
    }))

  // Combined list: existing payment methods first, then suggestions
  const allPaymentOptions = [
    ...paymentMethods.map(pm => ({ ...pm, isSuggestion: false as const })),
    ...defaultSuggestions,
  ]

  // Story 2.0 Part 1: Get selected payment method for conditional rendering (AC1.6)
  const selectedPaymentMethod = paymentMethods.find(pm => pm.id === formData.payment_method_id)

  // Story 2.0 Part 1: Conditional installment fields (AC1.6)
  // Show installment fields ONLY for Credit Mode credit cards
  const showInstallmentFields =
    selectedPaymentMethod?.type === 'credit' &&
    selectedPaymentMethod?.credit_mode === true

  // Story 2.2: Real-time monthly payment calculation
  const monthlyPayment = useMemo(() => {
    const total = Number.parseFloat(installmentData.totalAmount)
    const installments = Number.parseInt(installmentData.totalInstallments)

    if (isNaN(total) || isNaN(installments) || installments === 0) {
      return null
    }

    return Math.round((total / installments) * 100) / 100
  }, [installmentData.totalAmount, installmentData.totalInstallments])

  // Story 2.2: Calculate rounding difference for last payment
  const lastPaymentDifference = useMemo(() => {
    if (!monthlyPayment) return null

    const total = Number.parseFloat(installmentData.totalAmount)
    const installments = Number.parseInt(installmentData.totalInstallments)
    const expectedTotal = monthlyPayment * installments
    const difference = total - expectedTotal

    if (Math.abs(difference) > 0.01) {
      return monthlyPayment + difference
    }

    return null
  }, [monthlyPayment, installmentData.totalAmount, installmentData.totalInstallments])

  // Format currency for display
  const formatCurrency = (value: number) => {
    return value.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  }

  // Track when dialog opens
  useEffect(() => {
    if (open) {
      trackEvent(AnalyticsEvent.TRANSACTION_DIALOG_OPENED, {
        is_edit: !!transaction,
      })
    }
  }, [open, transaction])

  // Reset installment toggle when payment method changes
  useEffect(() => {
    if (!showInstallmentFields) {
      setIsInstallment(false)
    }
  }, [showInstallmentFields])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      // Check if selected payment method is a suggestion that needs to be created
      let actualPaymentMethodId = formData.payment_method_id
      if (formData.payment_method_id.startsWith('suggestion:')) {
        // Parse suggestion format: "suggestion:type:name"
        const parts = formData.payment_method_id.split(':')
        const type = parts[1] as 'credit' | 'debit' | 'cash' | 'pix' | 'other'
        const name = locale === 'pt-BR'
          ? DEFAULT_PAYMENT_METHODS.find(d => d.type === type)?.name
          : DEFAULT_PAYMENT_METHODS.find(d => d.type === type)?.nameEn

        if (!name) {
          toast.error(t('transaction.paymentMethodError'))
          setLoading(false)
          return
        }

        // Create the payment method on-the-fly
        const result = await findOrCreatePaymentMethod(name, type)
        if (!result.success || !result.paymentMethod) {
          toast.error(result.error || t('transaction.paymentMethodError'))
          setLoading(false)
          return
        }

        actualPaymentMethodId = result.paymentMethod.id
        // Update form data with the real ID for subsequent operations
        setFormData(prev => ({ ...prev, payment_method_id: actualPaymentMethodId }))
      }

      // Story 2.2: Check if this is an installment creation
      if (isInstallment && !transaction) {
        // Validate installment fields
        const totalAmount = Number.parseFloat(installmentData.totalAmount)
        const totalInstallments = Number.parseInt(installmentData.totalInstallments)

        if (isNaN(totalAmount) || totalAmount <= 0) {
          toast.error(t('transaction.installment.validationAmountPositive'))
          setLoading(false)
          return
        }

        if (isNaN(totalInstallments) || totalInstallments < 1 || totalInstallments > 60) {
          toast.error(t('transaction.installment.validationInstallmentsMin'))
          setLoading(false)
          return
        }

        // Call createInstallment server action
        const result = await createInstallment({
          payment_method_id: actualPaymentMethodId,
          description: formData.description || 'Compra parcelada',
          total_amount: totalAmount,
          total_installments: totalInstallments,
          merchant: installmentData.merchant || undefined,
          category_id: formData.category_id || undefined,
          first_payment_date: installmentData.firstPaymentDate,
        })

        if (result.success) {
          // Show success toast with details
          const monthlyAmt = Math.round((totalAmount / totalInstallments) * 100) / 100
          toast.success(t('transaction.installment.createSuccess'), {
            description: t('transaction.installment.createSuccessDetails', {
              description: formData.description || 'Compra parcelada',
              totalAmount: formatCurrency(totalAmount),
              installments: totalInstallments,
              monthlyAmount: formatCurrency(monthlyAmt),
            })
          })

          // Close dialog and navigate to installments page
          setOpen(false)
          // Story 3.3: Invalidate budget progress cache after installment creation
          invalidateBudgetProgress()
          router.push('/installments')
          router.refresh()
        } else {
          toast.error(t('transaction.installment.createError', { error: result.error || 'Unknown error' }))
        }

        setLoading(false)
        return
      }

      // Regular transaction creation/update
      const data = {
        ...formData,
        amount: Number.parseFloat(formData.amount),
        payment_method_id: actualPaymentMethodId,
      }

      if (transaction) {
        await updateTransaction(transaction.id, data)
        setOpen(false)
        // Story 3.3: Invalidate budget progress cache after transaction update
        invalidateBudgetProgress()
        router.refresh()
      } else {
        await createTransaction(data)

        // If creating a new transaction during onboarding, advance to next step
        if (currentStep === 'add_expense') {
          await advanceOnboardingStep('add_expense')
          setOpen(false)
          // Story 3.3: Invalidate budget progress cache before page reload
          invalidateBudgetProgress()
          // Force full page reload to ensure onboarding state refreshes
          window.location.href = '/'
        } else {
          setOpen(false)
          // Story 3.3: Invalidate budget progress cache after transaction creation
          invalidateBudgetProgress()
          router.refresh()
        }
      }
    } catch (error) {
      console.error("Error saving transaction:", error)
      toast.error("Error saving transaction. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const filteredCategories = categories.filter((c) => c.type === formData.type)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button>
            <PlusIcon className="h-4 w-4 mr-2" />
            {t('home.addTransaction')}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{transaction ? t('transaction.editTitle') : t('transaction.addTitle')}</DialogTitle>
            <DialogDescription>
              {transaction ? t('transaction.editDescription') : t('transaction.addDescription')}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="type">{t('transaction.type')}</Label>
              <Select
                value={formData.type}
                onValueChange={(value: "income" | "expense") => {
                  setFormData({ ...formData, type: value, category_id: "" })
                }}
              >
                <SelectTrigger id="type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="income">{t('transaction.income')}</SelectItem>
                  <SelectItem value="expense">{t('transaction.expense')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Story 2.2: Show standard amount field only if NOT in installment mode */}
            {!isInstallment && (
              <div className="grid gap-2">
                <Label htmlFor="amount">{t('transaction.amount')}</Label>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  required
                />
              </div>
            )}

            <div className="grid gap-2">
              <Label htmlFor="category">{t('transaction.category')}</Label>
              <Select
                value={formData.category_id}
                onValueChange={(value) => setFormData({ ...formData, category_id: value })}
                required
              >
                <SelectTrigger id="category">
                  <SelectValue placeholder={t('transaction.selectCategory')} />
                </SelectTrigger>
                <SelectContent>
                  {filteredCategories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.icon} {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Story 2.2: Show date field only if NOT in installment mode */}
            {!isInstallment && (
              <div className="grid gap-2">
                <Label htmlFor="date">{t('transaction.date')}</Label>
                <Input
                  id="date"
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  required
                />
              </div>
            )}

            <div className="grid gap-2">
              <Label htmlFor="payment_method_id">{t('transaction.paymentMethod')}</Label>
              <Select
                value={formData.payment_method_id}
                onValueChange={(value) => setFormData({ ...formData, payment_method_id: value })}
                required
              >
                <SelectTrigger id="payment_method_id">
                  <SelectValue placeholder={t('transaction.selectPaymentMethod')} />
                </SelectTrigger>
                <SelectContent>
                  {/* Existing payment methods */}
                  {paymentMethods.map((pm) => (
                    <SelectItem key={pm.id} value={pm.id}>
                      {pm.name}
                      {pm.type === 'credit' && pm.credit_mode !== null && (
                        <span className="text-xs text-muted-foreground ml-1">
                          ({pm.credit_mode ? t('paymentMethodTypes.creditMode') : t('paymentMethodTypes.simpleMode')})
                        </span>
                      )}
                    </SelectItem>
                  ))}
                  {/* Default suggestions (shown when not already existing) */}
                  {defaultSuggestions.length > 0 && paymentMethods.length > 0 && (
                    <div className="px-2 py-1.5 text-xs text-muted-foreground border-t mt-1 pt-2">
                      {t('transaction.suggestedPaymentMethods')}
                    </div>
                  )}
                  {defaultSuggestions.map((suggestion) => (
                    <SelectItem key={suggestion.id} value={suggestion.id} className="text-muted-foreground">
                      <span className="flex items-center gap-2">
                        <span>{suggestion.icon}</span>
                        <span>{suggestion.name}</span>
                        <span className="text-xs opacity-60">({t('transaction.willBeCreated')})</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Story 2.2: Installment toggle and fields (AC2.1, AC2.2) */}
            {showInstallmentFields && !transaction && (
              <div className="grid gap-4 p-4 border rounded-md bg-muted/30">
                {/* Installment Toggle */}
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="installment-toggle"
                    checked={isInstallment}
                    onCheckedChange={(checked) => setIsInstallment(checked as boolean)}
                  />
                  <Label
                    htmlFor="installment-toggle"
                    className="text-sm font-medium cursor-pointer"
                  >
                    {t('transaction.installment.toggleLabel')}
                  </Label>
                </div>

                {/* Installment Fields (shown when toggle is checked) */}
                {isInstallment && (
                  <div className="grid gap-4 mt-2">
                    {/* Total Amount */}
                    <div className="grid gap-2">
                      <Label htmlFor="total-amount">{t('transaction.installment.totalAmountLabel')}</Label>
                      <Input
                        id="total-amount"
                        type="number"
                        step="0.01"
                        placeholder={t('transaction.installment.totalAmountPlaceholder')}
                        value={installmentData.totalAmount}
                        onChange={(e) => setInstallmentData({ ...installmentData, totalAmount: e.target.value })}
                        required
                      />
                    </div>

                    {/* Number of Installments */}
                    <div className="grid gap-2">
                      <Label htmlFor="installments">{t('transaction.installment.installmentsLabel')}</Label>
                      <Select
                        value={installmentData.totalInstallments}
                        onValueChange={(value) => setInstallmentData({ ...installmentData, totalInstallments: value })}
                      >
                        <SelectTrigger id="installments">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="max-h-[200px]">
                          {[...Array(60)].map((_, i) => {
                            const num = i + 1
                            return (
                              <SelectItem key={num} value={num.toString()}>
                                {num}x
                              </SelectItem>
                            )
                          })}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Monthly Payment (read-only, auto-calculated) */}
                    {monthlyPayment !== null && (
                      <div className="grid gap-2">
                        <Label>{t('transaction.installment.monthlyPaymentLabel')}</Label>
                        <div className="text-2xl font-bold text-primary">
                          R$ {formatCurrency(monthlyPayment)} / {t('common.locale') === 'pt-BR' ? 'mês' : 'month'}
                        </div>
                        {lastPaymentDifference !== null && (
                          <p className="text-xs text-muted-foreground">
                            {t('transaction.installment.lastPaymentNote', {
                              amount: formatCurrency(lastPaymentDifference)
                            })}
                          </p>
                        )}
                      </div>
                    )}

                    {/* First Payment Date */}
                    <div className="grid gap-2">
                      <Label htmlFor="first-payment-date">{t('transaction.installment.firstPaymentLabel')}</Label>
                      <Input
                        id="first-payment-date"
                        type="date"
                        value={installmentData.firstPaymentDate}
                        onChange={(e) => setInstallmentData({ ...installmentData, firstPaymentDate: e.target.value })}
                        required
                      />
                    </div>

                    {/* Merchant (optional) */}
                    <div className="grid gap-2">
                      <Label htmlFor="merchant">{t('transaction.installment.merchantLabel')} ({t('common.optional')})</Label>
                      <Input
                        id="merchant"
                        type="text"
                        placeholder={t('transaction.installment.merchantPlaceholder')}
                        value={installmentData.merchant}
                        onChange={(e) => setInstallmentData({ ...installmentData, merchant: e.target.value })}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="grid gap-2">
              <Label htmlFor="description">{t('transaction.description')}</Label>
              <Textarea
                id="description"
                placeholder={t('transaction.optionalDescription')}
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              type="submit"
              disabled={loading || !formData.payment_method_id}
            >
              {loading ? t('common.saving') : transaction ? t('common.update') : t('common.add')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
