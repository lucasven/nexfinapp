"use client"

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { AlertTriangle } from 'lucide-react'
import { usePostHog } from 'posthog-js/react'
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface ModeSwitchWarningDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  paymentMethodId: string
  paymentMethodName: string
  activeInstallments: number
  onConfirm: (cleanupInstallments: boolean) => Promise<void>
}

/**
 * Mode Switch Warning Dialog Component
 *
 * Story: 1-5-mode-switching-with-data-implications-warning
 * Acceptance Criteria: AC5.4, AC5.5, AC5.6, AC5.12
 *
 * Displays a warning dialog when user attempts to switch from Credit Mode
 * to Simple Mode while having active installments. Presents three options:
 * 1. Keep installments active
 * 2. Pay off all installments
 * 3. Cancel the mode switch
 *
 * Features:
 * - Clear warning with installment count
 * - Three action buttons with descriptions
 * - Keyboard navigation (accessible)
 * - Mobile-responsive layout
 * - Localized (pt-BR and en)
 * - Analytics tracking for cancellation
 */
export function ModeSwitchWarningDialog({
  open,
  onOpenChange,
  paymentMethodId,
  paymentMethodName,
  activeInstallments,
  onConfirm,
}: ModeSwitchWarningDialogProps) {
  const t = useTranslations('credit_mode')
  const posthog = usePostHog()
  const [loading, setLoading] = useState(false)
  const [selectedOption, setSelectedOption] = useState<'keep' | 'payoff' | null>(null)

  async function handleConfirm(cleanupInstallments: boolean) {
    setLoading(true)
    setSelectedOption(cleanupInstallments ? 'payoff' : 'keep')

    try {
      await onConfirm(cleanupInstallments)
      setLoading(false)
      setSelectedOption(null)
    } catch (error) {
      console.error('[ModeSwitchWarningDialog] Error confirming:', error)
      setLoading(false)
      setSelectedOption(null)
    }
  }

  function handleCancel() {
    // Track cancellation event (AC5.9)
    posthog?.capture('mode_switch_cancelled', {
      paymentMethodId,
      reason: 'installment_warning',
      activeInstallments,
    })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[600px] w-[95vw]"
        showCloseButton={true}
      >
        {/* Warning Title */}
        <DialogTitle className="flex items-center gap-2 text-xl">
          <AlertTriangle className="w-6 h-6 text-yellow-500" />
          {t('switch_warning_title')}
        </DialogTitle>

        {/* Warning Message */}
        <DialogDescription className="text-base">
          {t('switch_warning_message', { count: activeInstallments })}
        </DialogDescription>

        {/* Options */}
        <div className="space-y-3 mt-4">
          {/* Option 1: Keep Installments Active */}
          <div
            className={cn(
              "border-2 rounded-lg p-4 transition-all cursor-pointer hover:bg-accent/50",
              selectedOption === 'keep' && "border-primary bg-accent"
            )}
            onClick={() => !loading && handleConfirm(false)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                if (!loading) handleConfirm(false)
              }
            }}
            aria-label={t('option_keep_installments')}
          >
            <div className="flex items-start gap-3">
              <div className="text-2xl">1️⃣</div>
              <div className="flex-1">
                <p className="font-semibold mb-1">{t('option_keep_installments')}</p>
                <p className="text-sm text-muted-foreground">
                  {t('option_keep_description')}
                </p>
              </div>
            </div>
          </div>

          {/* Option 2: Pay Off All Installments */}
          <div
            className={cn(
              "border-2 rounded-lg p-4 transition-all cursor-pointer hover:bg-accent/50",
              selectedOption === 'payoff' && "border-primary bg-accent"
            )}
            onClick={() => !loading && handleConfirm(true)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                if (!loading) handleConfirm(true)
              }
            }}
            aria-label={t('option_pay_off')}
          >
            <div className="flex items-start gap-3">
              <div className="text-2xl">2️⃣</div>
              <div className="flex-1">
                <p className="font-semibold mb-1">{t('option_pay_off')}</p>
                <p className="text-sm text-muted-foreground">
                  {t('option_pay_off_description')}
                </p>
              </div>
            </div>
          </div>

          {/* Option 3: Cancel */}
          <div
            className={cn(
              "border-2 rounded-lg p-4 transition-all cursor-pointer hover:bg-accent/50"
            )}
            onClick={() => !loading && handleCancel()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                if (!loading) handleCancel()
              }
            }}
            aria-label={t('option_cancel')}
          >
            <div className="flex items-start gap-3">
              <div className="text-2xl">3️⃣</div>
              <div className="flex-1">
                <p className="font-semibold mb-1">{t('option_cancel')}</p>
                <p className="text-sm text-muted-foreground">
                  {t('option_cancel_description')}
                </p>
              </div>
            </div>
          </div>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
