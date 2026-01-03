"use client"

import { useState, useEffect } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { useRouter } from 'next/navigation'
import { Plus, CreditCard, Calendar, Info } from 'lucide-react'
import { createCreditCard, getStatementPeriodPreview, getPaymentDueDatePreview } from '@/lib/actions/payment-methods'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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

interface AddCreditCardDialogProps {
  onSuccess?: () => void
  trigger?: React.ReactNode
}

interface PeriodPreview {
  periodStart: Date
  periodEnd: Date
  nextClosing: Date
  daysUntilClosing: number
}

interface DueDatePreview {
  nextDueDate: Date
}

/**
 * Add Credit Card Dialog Component
 *
 * Comprehensive dialog for creating a new credit card with all settings:
 * - Card name
 * - Credit Mode selection with explanations
 * - Statement closing day (conditional, Credit Mode only)
 * - Payment due day (conditional, Credit Mode with closing day)
 *
 * Features:
 * - Real-time preview of statement period and due date
 * - Validation with clear error messages
 * - Toast notifications on success/error
 * - Localized (pt-BR and en)
 */
export function AddCreditCardDialog({ onSuccess, trigger }: AddCreditCardDialogProps) {
  const t = useTranslations('credit_mode')
  const tCommon = useTranslations('common')
  const tSettings = useTranslations('statementSettings')
  const tDue = useTranslations('paymentDueSettings')
  const locale = useLocale()
  const router = useRouter()

  const [open, setOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Form state
  const [cardName, setCardName] = useState('')
  const [creditMode, setCreditMode] = useState<boolean | null>(null)
  const [closingDay, setClosingDay] = useState<number | null>(null)
  const [dueDay, setDueDay] = useState<string>('')

  // Previews
  const [periodPreview, setPeriodPreview] = useState<PeriodPreview | null>(null)
  const [dueDatePreview, setDueDatePreview] = useState<DueDatePreview | null>(null)
  const [isFetchingPreview, setIsFetchingPreview] = useState(false)

  // Error state
  const [nameError, setNameError] = useState('')

  // Format dates based on locale
  const dateLocale = locale === 'pt-br' ? ptBR : enUS
  const dateFormat = locale === 'pt-br' ? 'd MMM yyyy' : 'MMM d, yyyy'

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      setCardName('')
      setCreditMode(null)
      setClosingDay(null)
      setDueDay('')
      setPeriodPreview(null)
      setDueDatePreview(null)
      setNameError('')
    }
  }, [open])

  // Fetch statement period preview when closing day changes
  useEffect(() => {
    if (closingDay === null || closingDay < 1 || closingDay > 31) {
      setPeriodPreview(null)
      return
    }

    const fetchPreview = async () => {
      setIsFetchingPreview(true)
      try {
        const result = await getStatementPeriodPreview(closingDay)
        setPeriodPreview(result)
      } catch (error) {
        console.error('[AddCreditCardDialog] Error fetching period preview:', error)
        setPeriodPreview(null)
      } finally {
        setIsFetchingPreview(false)
      }
    }

    fetchPreview()
  }, [closingDay])

  // Fetch due date preview when closing day and due day are set
  useEffect(() => {
    const dueDayNum = parseInt(dueDay)
    if (!closingDay || isNaN(dueDayNum) || dueDayNum < 1 || dueDayNum > 60) {
      setDueDatePreview(null)
      return
    }

    const fetchDueDatePreview = async () => {
      try {
        // We need to create a temporary payment method ID to get preview
        // For now, we'll calculate it client-side based on period preview
        if (periodPreview) {
          const closingDate = new Date(periodPreview.nextClosing)
          const dueDate = new Date(closingDate)
          dueDate.setDate(dueDate.getDate() + dueDayNum)
          setDueDatePreview({ nextDueDate: dueDate })
        }
      } catch (error) {
        console.error('[AddCreditCardDialog] Error fetching due date preview:', error)
        setDueDatePreview(null)
      }
    }

    fetchDueDatePreview()
  }, [closingDay, dueDay, periodPreview])

  const handleSubmit = async () => {
    // Validate card name
    const trimmedName = cardName.trim()
    if (!trimmedName) {
      setNameError(t('card_name_required'))
      return
    }
    setNameError('')

    // Validate mode selection
    if (creditMode === null) {
      toast.error(t('card_mode_required'))
      return
    }

    setIsSubmitting(true)
    try {
      const dueDayNum = parseInt(dueDay)
      const result = await createCreditCard({
        name: trimmedName,
        creditMode: creditMode,
        statementClosingDay: creditMode && closingDay ? closingDay : undefined,
        paymentDueDay: creditMode && closingDay && !isNaN(dueDayNum) ? dueDayNum : undefined,
      })

      if (result.success) {
        toast.success(t('card_created_success'))
        setOpen(false)
        router.refresh()
        onSuccess?.()
      } else {
        // Map error messages to localized versions
        if (result.error?.includes('already exists')) {
          toast.error(t('card_name_duplicate'))
        } else {
          toast.error(result.error || t('error'))
        }
      }
    } catch (error) {
      console.error('[AddCreditCardDialog] Error creating card:', error)
      toast.error(t('error'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm">
            <Plus className="h-4 w-4 mr-2" />
            {t('add_card')}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            {t('add_card_title')}
          </DialogTitle>
          <DialogDescription>
            {t('add_card_description')}
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

          {/* Mode Selection */}
          <div className="space-y-3">
            <Label>{t('select_mode_label')}</Label>
            <RadioGroup
              value={creditMode === true ? 'credit' : creditMode === false ? 'simple' : ''}
              onValueChange={(value) => {
                setCreditMode(value === 'credit')
                // Reset closing day and due day when switching to Simple Mode
                if (value === 'simple') {
                  setClosingDay(null)
                  setDueDay('')
                }
              }}
              className="space-y-3"
            >
              {/* Credit Mode Option */}
              <div className={`flex items-start space-x-3 p-4 rounded-lg border transition-colors ${
                creditMode === true ? 'border-primary bg-primary/5' : 'border-border'
              }`}>
                <RadioGroupItem value="credit" id="credit-mode" className="mt-1" />
                <div className="space-y-1">
                  <Label htmlFor="credit-mode" className="font-medium cursor-pointer">
                    {t('credit_mode_option')}
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    {t('credit_mode_explanation')}
                  </p>
                </div>
              </div>

              {/* Simple Mode Option */}
              <div className={`flex items-start space-x-3 p-4 rounded-lg border transition-colors ${
                creditMode === false ? 'border-primary bg-primary/5' : 'border-border'
              }`}>
                <RadioGroupItem value="simple" id="simple-mode" className="mt-1" />
                <div className="space-y-1">
                  <Label htmlFor="simple-mode" className="font-medium cursor-pointer">
                    {t('simple_mode_option')}
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    {t('simple_mode_explanation')}
                  </p>
                </div>
              </div>
            </RadioGroup>
          </div>

          {/* Statement Settings (Credit Mode only) */}
          {creditMode === true && (
            <>
              <Separator />
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  <Label className="text-base font-medium">{t('statement_settings_section')}</Label>
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
                          date: format(dueDatePreview.nextDueDate, dateFormat, { locale: dateLocale })
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
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isSubmitting}>
            {tCommon('cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting || !cardName.trim() || creditMode === null}>
            {isSubmitting ? t('creating_card') : t('create_card')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
