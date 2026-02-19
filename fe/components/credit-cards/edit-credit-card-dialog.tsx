"use client"

import { useState, useEffect } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { useRouter } from 'next/navigation'
import { CreditCard, Calendar, Info, DollarSign } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { format } from 'date-fns'
import { ptBR, enUS } from 'date-fns/locale'
import { PaymentMethod } from '@/lib/types'
import { updateCreditCardSettings, getStatementPeriodPreview, switchCreditMode } from '@/lib/actions/payment-methods'
import { ModeSwitchWarningDialog } from '@/components/settings/mode-switch-warning-dialog'

interface EditCreditCardDialogProps {
  card: PaymentMethod
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

interface PeriodPreview {
  periodStart: Date
  periodEnd: Date
  nextClosing: Date
  daysUntilClosing: number
}

export function EditCreditCardDialog({ card, open, onOpenChange, onSuccess }: EditCreditCardDialogProps) {
  const t = useTranslations('credit_mode')
  const tCommon = useTranslations('common')
  const tSettings = useTranslations('statementSettings')
  const tDue = useTranslations('paymentDueSettings')
  const tBudget = useTranslations('budgetSettings')
  const locale = useLocale()
  const router = useRouter()

  const [isSubmitting, setIsSubmitting] = useState(false)

  // Form state
  const [cardName, setCardName] = useState(card.name)
  const [creditMode, setCreditMode] = useState(card.credit_mode || false)
  const [closingDay, setClosingDay] = useState<number | null>(card.statement_closing_day)
  const [paymentDay, setPaymentDay] = useState<number | null>(card.payment_due_day)
  const [daysBeforeClosing, setDaysBeforeClosing] = useState<string>(card.days_before_closing?.toString() || '')
  const [dueDay, setDueDay] = useState<string>(card.payment_due_day?.toString() || '')
  const [monthlyBudget, setMonthlyBudget] = useState<string>(card.monthly_budget?.toString() || '')

  // Warning dialog state for installments
  const [showWarningDialog, setShowWarningDialog] = useState(false)
  const [activeInstallmentsCount, setActiveInstallmentsCount] = useState(0)

  // Previews
  const [periodPreview, setPeriodPreview] = useState<PeriodPreview | null>(null)
  const [dueDatePreview, setDueDatePreview] = useState<Date | null>(null)
  const [isFetchingPreview, setIsFetchingPreview] = useState(false)

  // Error state
  const [nameError, setNameError] = useState('')

  // Format dates based on locale
  const dateLocale = locale === 'pt-br' ? ptBR : enUS
  const dateFormat = locale === 'pt-br' ? 'd MMM yyyy' : 'MMM d, yyyy'

  // Reset form when dialog opens with new card
  useEffect(() => {
    if (open) {
      setCardName(card.name)
      setCreditMode(card.credit_mode || false)
      setClosingDay(card.statement_closing_day)
      setDueDay(card.payment_due_day?.toString() || '')
      setMonthlyBudget(card.monthly_budget?.toString() || '')
      setNameError('')
    }
  }, [open, card])

  // Fetch statement period preview when closing day changes
  useEffect(() => {
    if (!closingDay || closingDay < 1 || closingDay > 31) {
      setPeriodPreview(null)
      return
    }

    const fetchPreview = async () => {
      setIsFetchingPreview(true)
      try {
        const result = await getStatementPeriodPreview(closingDay)
        setPeriodPreview(result)
      } catch (error) {
        console.error('Error fetching period preview:', error)
        setPeriodPreview(null)
      } finally {
        setIsFetchingPreview(false)
      }
    }

    fetchPreview()
  }, [closingDay])

  // Calculate due date preview
  useEffect(() => {
    const dueDayNum = parseInt(dueDay)
    if (!closingDay || isNaN(dueDayNum) || dueDayNum < 1 || dueDayNum > 60 || !periodPreview) {
      setDueDatePreview(null)
      return
    }

    const closingDate = new Date(periodPreview.nextClosing)
    const dueDate = new Date(closingDate)
    dueDate.setDate(dueDate.getDate() + dueDayNum)
    setDueDatePreview(dueDate)
  }, [closingDay, dueDay, periodPreview])

  const handleSubmit = async () => {
    // Validate card name
    const trimmedName = cardName.trim()
    if (!trimmedName) {
      setNameError(t('card_name_required'))
      return
    }
    setNameError('')

    setIsSubmitting(true)
    try {
      // Handle mode switch if changed
      if (creditMode !== card.credit_mode) {
        const switchResult = await switchCreditMode(card.id, creditMode)

        // Check if confirmation is required (has active installments)
        if (switchResult.requiresConfirmation && switchResult.activeInstallments) {
          setActiveInstallmentsCount(switchResult.activeInstallments)
          setShowWarningDialog(true)
          setIsSubmitting(false)
          return
        }

        if (!switchResult.success) {
          toast.error(switchResult.error || 'Error switching mode')
          setIsSubmitting(false)
          return
        }
      }

      // Update other settings
      const dueDayNum = parseInt(dueDay)
      const budgetNum = parseFloat(monthlyBudget)

      const result = await updateCreditCardSettings({
        paymentMethodId: card.id,
        name: trimmedName !== card.name ? trimmedName : undefined,
        statementClosingDay: creditMode && closingDay ? closingDay : undefined,
        paymentDueDay: creditMode && closingDay && !isNaN(dueDayNum) ? dueDayNum : undefined,
        monthlyBudget: creditMode && !isNaN(budgetNum) ? budgetNum : undefined,
      })

      if (result.success) {
        toast.success('Cartão atualizado com sucesso')
        onOpenChange(false)
        router.refresh()
        onSuccess?.()
      } else {
        toast.error(result.error || 'Erro ao atualizar cartão')
      }
    } catch (error) {
      console.error('Error updating card:', error)
      toast.error('Erro ao atualizar cartão')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleWarningConfirm = async (cleanupInstallments: boolean) => {
    try {
      // Call switchCreditMode with the cleanup option
      const switchResult = await switchCreditMode(card.id, creditMode, { cleanupInstallments })

      if (switchResult.success) {
        setShowWarningDialog(false)

        // Update other settings
        const dueDayNum = parseInt(dueDay)
        const budgetNum = parseFloat(monthlyBudget)
        const trimmedName = cardName.trim()

        const result = await updateCreditCardSettings({
          paymentMethodId: card.id,
          name: trimmedName !== card.name ? trimmedName : undefined,
          statementClosingDay: creditMode && closingDay ? closingDay : undefined,
          paymentDueDay: creditMode && closingDay && !isNaN(dueDayNum) ? dueDayNum : undefined,
          monthlyBudget: creditMode && !isNaN(budgetNum) ? budgetNum : undefined,
        })

        if (result.success) {
          const message = cleanupInstallments
            ? 'Modo alterado e parcelamentos finalizados'
            : 'Modo alterado com sucesso'
          toast.success(message)
          onOpenChange(false)
          router.refresh()
          onSuccess?.()
        } else {
          toast.error(result.error || 'Erro ao atualizar cartão')
        }
      } else {
        toast.error(switchResult.error || 'Error switching mode')
      }
    } catch (error) {
      console.error('Error in warning confirm:', error)
      toast.error('Erro ao atualizar cartão')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Editar Cartão
          </DialogTitle>
          <DialogDescription>
            Atualize as configurações do seu cartão
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Card Name */}
          <div className="space-y-2">
            <Label htmlFor="card-name">{t('card_name_label')}</Label>
            <Input
              id="card-name"
              value={cardName}
              onChange={(e) => {
                setCardName(e.target.value)
                setNameError('')
              }}
              placeholder={t('card_name_placeholder')}
              className={nameError ? 'border-destructive' : ''}
            />
            {nameError && (
              <p className="text-sm text-destructive">{nameError}</p>
            )}
          </div>

          {/* Credit Mode Toggle */}
          <div className="flex items-center justify-between space-x-2 p-4 rounded-lg border">
            <div className="space-y-0.5">
              <Label htmlFor="credit-mode">Modo Crédito</Label>
              <p className="text-sm text-muted-foreground">
                Ativar rastreamento de orçamento e faturas
              </p>
            </div>
            <Switch
              id="credit-mode"
              checked={creditMode}
              onCheckedChange={(checked) => {
                setCreditMode(checked)
                if (!checked) {
                  setClosingDay(null)
                  setDueDay('')
                  setMonthlyBudget('')
                }
              }}
            />
          </div>

          {/* Credit Mode Settings */}
          {creditMode && (
            <>
              <Separator />

              {/* Monthly Budget */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />
                  Orçamento Mensal
                </Label>
                <Input
                  type="number"
                  step="0.01"
                  value={monthlyBudget}
                  onChange={(e) => setMonthlyBudget(e.target.value)}
                  placeholder="0.00"
                />
                <p className="text-xs text-muted-foreground">
                  Defina um limite de gastos mensais para este cartão
                </p>
              </div>

              <Separator />

              {/* Statement Settings */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  <Label className="text-base font-medium">Configurações de Fatura</Label>
                </div>

                {/* Closing Day */}
                <div className="space-y-2">
                  <Label>{t('closing_day_label')}</Label>
                  <Select
                    value={closingDay?.toString() || ''}
                    onValueChange={(value) => setClosingDay(parseInt(value))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('closing_day_select_placeholder')}>
                        {closingDay ? `${tCommon('day')} ${closingDay}` : ''}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                        <SelectItem key={day} value={day.toString()}>
                          {tCommon('day')} {day}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {/* Period Preview */}
                  {closingDay && (
                    <div className="rounded-lg border bg-muted/50 p-3 space-y-1">
                      {isFetchingPreview ? (
                        <p className="text-sm text-muted-foreground">{tCommon('loading')}</p>
                      ) : periodPreview ? (
                        <>
                          <p className="text-sm font-medium">
                            {tSettings('currentPeriod', {
                              start: format(periodPreview.periodStart, dateFormat, { locale: dateLocale }),
                              end: format(periodPreview.periodEnd, dateFormat, { locale: dateLocale })
                            })}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {tSettings('nextClosing', {
                              date: format(periodPreview.nextClosing, dateFormat, { locale: dateLocale }),
                              days: periodPreview.daysUntilClosing
                            })}
                          </p>
                        </>
                      ) : null}
                    </div>
                  )}
                </div>

                {/* Due Day */}
                <div className="space-y-2">
                  <Label>{t('due_day_label')}</Label>
                  <Input
                    type="number"
                    min={1}
                    max={60}
                    value={dueDay}
                    onChange={(e) => setDueDay(e.target.value)}
                    placeholder={t('due_day_placeholder')}
                    disabled={!closingDay}
                  />
                  {!closingDay && (
                    <div className="flex items-start gap-2 text-xs text-muted-foreground">
                      <Info className="h-3 w-3 mt-0.5 flex-shrink-0" />
                      <p>{tDue('closingDayRequired')}</p>
                    </div>
                  )}

                  {/* Due Date Preview */}
                  {closingDay && dueDay && dueDatePreview && (
                    <div className="rounded-lg border bg-muted/50 p-3">
                      <p className="text-sm font-medium">
                        {tDue('nextPayment', {
                          date: format(dueDatePreview, dateFormat, { locale: dateLocale })
                        })}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            {tCommon('cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting || !cardName.trim()}>
            {isSubmitting ? tCommon('saving') : tCommon('save')}
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* Warning dialog for active installments */}
      <ModeSwitchWarningDialog
        open={showWarningDialog}
        onOpenChange={setShowWarningDialog}
        paymentMethodId={card.id}
        paymentMethodName={card.name}
        activeInstallments={activeInstallmentsCount}
        onConfirm={handleWarningConfirm}
      />
    </Dialog>
  )
}
