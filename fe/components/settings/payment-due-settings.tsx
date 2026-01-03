"use client"

import { useState, useEffect } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { Clock, AlertCircle } from 'lucide-react'
import { setPaymentDueDate, getPaymentDueDatePreview } from '@/lib/actions/payment-methods'
import { formatDueDay } from '@/lib/utils/payment-due-date'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'

interface PaymentMethod {
  id: string
  name: string
  type: string
  credit_mode: boolean | null
  statement_closing_day?: number | null
  payment_due_day?: number | null
}

interface PaymentDueSettingsProps {
  paymentMethod: PaymentMethod
  onUpdate: () => void
}

interface DueDatePreview {
  nextDueDate: Date
  dueDay: number
  formattedDate: string
}

/**
 * Payment Due Settings Component
 *
 * Story: 4.1 - Set Payment Due Date
 * Acceptance Criteria: AC4.1.1, AC4.1.2, AC4.1.5
 *
 * Allows Credit Mode credit card users to set payment due day (1-60 days after closing)
 * with real-time preview of the payment due date.
 *
 * Features:
 * - Number input for payment due day (1-60)
 * - Real-time preview of payment due date
 * - Shows next payment date
 * - Save button with loading state
 * - Toast notifications
 * - Localized (pt-BR and en)
 * - Dependency on statement_closing_day
 */
export function PaymentDueSettings({ paymentMethod, onUpdate }: PaymentDueSettingsProps) {
  const t = useTranslations('paymentDueSettings')
  const tCommon = useTranslations('common')
  const locale = useLocale()

  const [dueDay, setDueDay] = useState<number>(
    paymentMethod.payment_due_day ?? 10
  )
  const [preview, setPreview] = useState<DueDatePreview | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isFetchingPreview, setIsFetchingPreview] = useState(false)

  // Check if prerequisites are met
  const hasClosingDay = paymentMethod.statement_closing_day != null

  // Fetch preview when due day changes
  useEffect(() => {
    if (!hasClosingDay || dueDay < 1 || dueDay > 60) {
      setPreview(null)
      return
    }

    const fetchPreview = async () => {
      setIsFetchingPreview(true)
      try {
        const result = await getPaymentDueDatePreview(paymentMethod.id, dueDay)
        setPreview(result)
      } catch (error) {
        console.error('[PaymentDueSettings] Error fetching preview:', error)
        setPreview(null)
      } finally {
        setIsFetchingPreview(false)
      }
    }

    // Debounce preview fetching
    const timeoutId = setTimeout(fetchPreview, 300)
    return () => clearTimeout(timeoutId)
  }, [dueDay, paymentMethod.id, hasClosingDay])

  const handleSave = async () => {
    if (dueDay < 1 || dueDay > 60) {
      toast.error(t('validationError'))
      return
    }

    if (!hasClosingDay) {
      toast.error(t('closingDayRequired'))
      return
    }

    setIsLoading(true)
    try {
      const result = await setPaymentDueDate(paymentMethod.id, dueDay)

      if (result.success) {
        toast.success(t('successToast', { days: dueDay }))
        onUpdate() // Refresh parent data
      } else {
        toast.error(result.error || t('errorToast'))
      }
    } catch (error) {
      console.error('[PaymentDueSettings] Error saving:', error)
      toast.error(t('errorToast'))
    } finally {
      setIsLoading(false)
    }
  }

  // Don't show settings if closing day isn't set (AC4.1.7)
  if (!hasClosingDay) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            {t('title')}
          </CardTitle>
          <CardDescription>{t('description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {t('closingDayRequired')}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    )
  }

  const hasChanges = dueDay !== (paymentMethod.payment_due_day ?? null)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          {t('title')}
        </CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="payment-due-day">{t('dueAfterClosingLabel')}</Label>
          <Input
            id="payment-due-day"
            type="number"
            min={1}
            max={60}
            value={dueDay}
            onChange={(e) => setDueDay(parseInt(e.target.value) || 1)}
            placeholder={t('dueAfterClosingPlaceholder')}
          />
          <p className="text-sm text-muted-foreground">
            {t('helpText')}
          </p>
        </div>

        {/* Preview Section (AC4.1.2) */}
        {preview && !isFetchingPreview && (
          <div className="rounded-lg bg-muted p-4 space-y-2">
            <p className="text-sm font-medium">
              {t('previewDueDay', {
                day: formatDueDay(preview.dueDay, locale)
              })}
            </p>
            <p className="text-sm text-muted-foreground">
              {t('nextPayment', { date: preview.formattedDate })}
            </p>
          </div>
        )}

        {isFetchingPreview && (
          <div className="rounded-lg bg-muted p-4">
            <p className="text-sm text-muted-foreground">
              {tCommon('loading')}...
            </p>
          </div>
        )}

        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            {paymentMethod.payment_due_day
              ? `${tCommon('current')}: ${paymentMethod.payment_due_day} ${tCommon('days')}`
              : t('notSet')}
          </div>
          <Button
            onClick={handleSave}
            disabled={isLoading || !hasChanges || dueDay < 1 || dueDay > 60}
          >
            {isLoading ? tCommon('saving') : t('saveButton')}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
