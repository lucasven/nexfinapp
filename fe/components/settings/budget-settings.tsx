"use client"

import { useState, useEffect } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { useRouter } from 'next/navigation'
import { DollarSign, Info, AlertCircle } from 'lucide-react'
import { setMonthlyBudget, getStatementPeriodPreview } from '@/lib/actions/payment-methods'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { format } from 'date-fns'
import { ptBR, enUS } from 'date-fns/locale'

interface PaymentMethod {
  id: string
  name: string
  type: string
  credit_mode: boolean | null
  statement_closing_day?: number | null
  monthly_budget?: number | null
}

interface BudgetSettingsProps {
  paymentMethod: PaymentMethod
  onUpdate: () => void
}

interface PeriodPreview {
  periodStart: Date
  periodEnd: Date
  nextClosing: Date
  daysUntilClosing: number
}

/**
 * Budget Settings Component
 *
 * Story: 3.2 - Set User-Defined Monthly Budget
 * Acceptance Criteria: AC2.1, AC2.2, AC2.4, AC2.5, AC2.6, AC2.7
 *
 * Allows Credit Mode credit card users to set a personal monthly budget
 * separate from their bank credit limit. Budget applies to statement periods
 * (not calendar months).
 *
 * Features:
 * - Currency input for budget amount (R$)
 * - Real-time preview of statement period dates
 * - Save/Remove budget buttons
 * - Toast notifications
 * - Localized (pt-BR and en)
 * - Optional budget (can be NULL)
 * - Validation (>= 0, no negative values)
 * - Confirmation dialogs for edge cases (0, high budget)
 */
export function BudgetSettings({ paymentMethod, onUpdate }: BudgetSettingsProps) {
  const t = useTranslations('budgetSettings')
  const tCommon = useTranslations('common')
  const locale = useLocale()
  const router = useRouter()

  const [budgetInput, setBudgetInput] = useState<string>(
    paymentMethod.monthly_budget?.toString() || ''
  )
  const [preview, setPreview] = useState<PeriodPreview | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isFetchingPreview, setIsFetchingPreview] = useState(false)
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [confirmDialogType, setConfirmDialogType] = useState<'zero' | 'high' | null>(null)

  // Format dates based on locale
  const dateLocale = locale === 'pt-br' ? ptBR : enUS
  const dateFormat = locale === 'pt-br' ? 'd MMM yyyy' : 'MMM d, yyyy'

  // Fetch preview when component mounts (only if closing day is set)
  useEffect(() => {
    if (!paymentMethod.statement_closing_day) {
      return
    }

    const fetchPreview = async () => {
      setIsFetchingPreview(true)
      try {
        const result = await getStatementPeriodPreview(paymentMethod.statement_closing_day!)
        setPreview(result)
      } catch (error) {
        console.error('[BudgetSettings] Error fetching preview:', error)
        setPreview(null)
      } finally {
        setIsFetchingPreview(false)
      }
    }

    fetchPreview()
  }, [paymentMethod.statement_closing_day])

  // Format currency for display (pt-BR: R$ 2.000,00 / en: R$ 2,000.00)
  const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: 'BRL',
    }).format(value)
  }

  // Parse input value to number
  const parseInputToNumber = (input: string): number | null => {
    if (!input || input.trim() === '') {
      return null
    }

    // Remove currency symbols and whitespace
    const cleaned = input.replace(/[R$\s]/g, '')

    // Handle both comma and dot as decimal separator
    let normalized = cleaned
    if (locale === 'pt-br') {
      // pt-BR: 2.000,50 -> 2000.50
      normalized = cleaned.replace(/\./g, '').replace(',', '.')
    } else {
      // en: 2,000.50 -> 2000.50
      normalized = cleaned.replace(/,/g, '')
    }

    const parsed = parseFloat(normalized)
    return isNaN(parsed) ? null : parsed
  }

  const handleSave = async () => {
    const budgetValue = parseInputToNumber(budgetInput)

    // Validation (AC2.2)
    if (budgetValue !== null && budgetValue < 0) {
      toast.error(t('validationErrorNegative'))
      return
    }

    // Edge case confirmations (AC2.2)
    if (budgetValue === 0 && confirmDialogType !== 'zero') {
      setConfirmDialogType('zero')
      setShowConfirmDialog(true)
      return
    }

    if (budgetValue !== null && budgetValue > 100000 && confirmDialogType !== 'high') {
      setConfirmDialogType('high')
      setShowConfirmDialog(true)
      return
    }

    await performSave(budgetValue)
  }

  const performSave = async (budgetValue: number | null) => {
    setIsLoading(true)
    setShowConfirmDialog(false)
    setConfirmDialogType(null)

    try {
      const result = await setMonthlyBudget(paymentMethod.id, budgetValue)

      if (result.success) {
        if (budgetValue === null) {
          toast.success(t('removedToast'))
        } else {
          toast.success(t('successToast', { amount: formatCurrency(budgetValue) }))
        }
        onUpdate()
        router.refresh()
      } else {
        toast.error(result.error || t('errorToast'))
      }
    } catch (error) {
      console.error('[BudgetSettings] Error saving:', error)
      toast.error(t('errorToast'))
    } finally {
      setIsLoading(false)
    }
  }

  const handleRemoveBudget = async () => {
    await performSave(null)
  }

  const handleConfirmDialogConfirm = async () => {
    const budgetValue = parseInputToNumber(budgetInput)
    await performSave(budgetValue)
  }

  // Only show for Credit Mode credit cards (AC2.1)
  if (paymentMethod.credit_mode !== true || paymentMethod.type !== 'credit') {
    return null
  }

  // Check if closing date is set (AC2.1)
  if (!paymentMethod.statement_closing_day) {
    return (
      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            {t('title')}
          </CardTitle>
          <CardDescription>{t('description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-2 p-4 border rounded-lg bg-muted/50">
            <AlertCircle className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
            <p className="text-sm text-muted-foreground">
              {t('setClosingDateFirst')}
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Check if there are unsaved changes
  const currentBudget = paymentMethod.monthly_budget
  const inputBudget = parseInputToNumber(budgetInput)
  const hasChanges = currentBudget !== inputBudget

  return (
    <>
      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            {t('title')}
          </CardTitle>
          <CardDescription>{t('description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Budget Input */}
          <div className="space-y-2">
            <label className="text-sm font-medium">{t('label')}</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                R$
              </span>
              <Input
                type="text"
                placeholder={t('placeholder')}
                value={budgetInput}
                onChange={(e) => setBudgetInput(e.target.value)}
                className="pl-10"
              />
            </div>
            {currentBudget !== null && currentBudget !== undefined ? (
              <p className="text-xs text-muted-foreground">
                {tCommon('locale') === 'pt-BR' ? 'Orçamento atual' : 'Current budget'}: {formatCurrency(currentBudget)}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                {t('notSet')}
              </p>
            )}
          </div>

          {/* Statement Period Preview (AC2.7) */}
          {preview && (
            <div className="rounded-lg border bg-muted/50 p-4 space-y-2">
              <div className="flex items-start gap-2">
                <Info className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                <div className="space-y-1">
                  <p className="text-sm font-medium">
                    {t('helperText', {
                      start: format(preview.periodStart, dateFormat, { locale: dateLocale }),
                      end: format(preview.periodEnd, dateFormat, { locale: dateLocale })
                    })}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Tooltip/Help Text (AC2.7) */}
          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <Info className="h-3 w-3 mt-0.5 flex-shrink-0" />
            <p>{t('tooltipContent')}</p>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2">
            <Button
              onClick={handleSave}
              disabled={!hasChanges || isLoading}
              className="flex-1"
            >
              {isLoading ? tCommon('saving') : t('saveButton')}
            </Button>
            {currentBudget !== null && (
              <Button
                onClick={handleRemoveBudget}
                disabled={isLoading}
                variant="outline"
                className="flex-1"
              >
                {t('removeButton')}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Confirmation Dialog for Edge Cases */}
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmDialogType === 'zero'
                ? t('confirmZeroBudget')
                : t('confirmHighBudget', { amount: formatCurrency(parseInputToNumber(budgetInput) || 0) })
              }
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDialogType === 'zero'
                ? (locale === 'pt-br'
                    ? 'Um orçamento de R$ 0 significa que você não terá um limite de gastos. Deseja continuar?'
                    : 'A budget of R$ 0 means you will not have a spending limit. Do you want to continue?')
                : (locale === 'pt-br'
                    ? 'Este é um orçamento muito alto. Por favor, confirme se o valor está correto.'
                    : 'This is a very high budget. Please confirm the amount is correct.')
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tCommon('cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDialogConfirm}>
              {tCommon('save')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
