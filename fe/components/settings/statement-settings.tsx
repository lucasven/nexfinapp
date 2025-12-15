"use client"

import { useState, useEffect } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { useRouter } from 'next/navigation'
import { Calendar, Info } from 'lucide-react'
import { updateStatementSettings, getStatementPeriodPreview } from '@/lib/actions/payment-methods'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { format } from 'date-fns'
import { ptBR, enUS } from 'date-fns/locale'

interface PaymentMethod {
  id: string
  name: string
  type: string
  credit_mode: boolean | null
  statement_closing_day?: number | null
}

interface StatementSettingsProps {
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
 * Statement Settings Component
 *
 * Story: 3.1 - Set Statement Closing Date
 * Acceptance Criteria: AC1.1, AC1.2
 *
 * Allows Credit Mode credit card users to set their statement closing day (1-31)
 * with real-time preview of the statement period.
 *
 * Features:
 * - Dropdown for selecting closing day (1-31)
 * - Real-time preview of statement period
 * - Shows days until next closing
 * - Save button with loading state
 * - Toast notifications
 * - Localized (pt-BR and en)
 * - Edge case handling (Feb 31, leap years, etc.)
 */
export function StatementSettings({ paymentMethod, onUpdate }: StatementSettingsProps) {
  const t = useTranslations('statementSettings')
  const tCommon = useTranslations('common')
  const locale = useLocale()
  const router = useRouter()

  const [selectedDay, setSelectedDay] = useState<number | null>(
    paymentMethod.statement_closing_day ?? null
  )
  const [preview, setPreview] = useState<PeriodPreview | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isFetchingPreview, setIsFetchingPreview] = useState(false)

  // Format dates based on locale
  const dateLocale = locale === 'pt-br' ? ptBR : enUS
  const dateFormat = locale === 'pt-br' ? 'd MMM yyyy' : 'MMM d, yyyy'

  // Fetch preview when closing day changes
  useEffect(() => {
    if (selectedDay === null || selectedDay < 1 || selectedDay > 31) {
      setPreview(null)
      return
    }

    const fetchPreview = async () => {
      setIsFetchingPreview(true)
      try {
        const result = await getStatementPeriodPreview(selectedDay)
        setPreview(result)
      } catch (error) {
        console.error('[StatementSettings] Error fetching preview:', error)
        setPreview(null)
      } finally {
        setIsFetchingPreview(false)
      }
    }

    fetchPreview()
  }, [selectedDay])

  const handleSave = async () => {
    if (selectedDay === null || selectedDay < 1 || selectedDay > 31) {
      toast.error(t('validationError'))
      return
    }

    setIsLoading(true)
    try {
      const result = await updateStatementSettings(paymentMethod.id, selectedDay)

      if (result.success) {
        toast.success(t('successToast', { day: selectedDay }))
        onUpdate()
        router.refresh()
      } else {
        toast.error(result.error || t('errorToast'))
      }
    } catch (error) {
      console.error('[StatementSettings] Error saving:', error)
      toast.error(t('errorToast'))
    } finally {
      setIsLoading(false)
    }
  }

  // Only show for Credit Mode credit cards (AC1.1)
  if (paymentMethod.credit_mode !== true || paymentMethod.type !== 'credit') {
    return null
  }

  // Check if there are unsaved changes
  const hasChanges = selectedDay !== paymentMethod.statement_closing_day

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          {t('title')}
        </CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Closing Day Selector */}
        <div className="space-y-2">
          <label className="text-sm font-medium">{t('closingDayLabel')}</label>
          <Select
            value={selectedDay?.toString() || ''}
            onValueChange={(value) => setSelectedDay(parseInt(value))}
          >
            <SelectTrigger>
              <SelectValue placeholder={t('closingDayPlaceholder')}>
                {selectedDay ? `${tCommon('day')} ${selectedDay}` : t('notSet')}
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
          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <Info className="h-3 w-3 mt-0.5 flex-shrink-0" />
            <p>{t('helpText')}</p>
          </div>
        </div>

        {/* Period Preview (AC1.2) */}
        {selectedDay && (
          <div className="rounded-lg border bg-muted/50 p-4 space-y-2">
            {isFetchingPreview ? (
              <p className="text-sm text-muted-foreground">{tCommon('loading')}</p>
            ) : preview ? (
              <>
                <div>
                  <p className="text-sm font-medium">
                    {t('currentPeriod', {
                      start: format(preview.periodStart, dateFormat, { locale: dateLocale }),
                      end: format(preview.periodEnd, dateFormat, { locale: dateLocale })
                    })}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">
                    {t('nextClosing', {
                      date: format(preview.nextClosing, dateFormat, { locale: dateLocale }),
                      days: preview.daysUntilClosing
                    })}
                  </p>
                </div>
              </>
            ) : (
              <p className="text-sm text-destructive">
                {t('errorToast')}
              </p>
            )}
          </div>
        )}

        {/* Save Button */}
        <Button
          onClick={handleSave}
          disabled={!hasChanges || isLoading || isFetchingPreview}
          className="w-full"
        >
          {isLoading ? tCommon('saving') : t('saveButton')}
        </Button>
      </CardContent>
    </Card>
  )
}
