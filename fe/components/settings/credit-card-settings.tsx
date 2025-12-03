"use client"

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { CreditCard, Settings } from 'lucide-react'
import { switchCreditMode, SwitchResult } from '@/lib/actions/payment-methods'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'
import { ModeSwitchWarningDialog } from './mode-switch-warning-dialog'

interface PaymentMethod {
  id: string
  name: string
  type: string
  credit_mode: boolean | null
}

interface CreditCardSettingsProps {
  paymentMethods: PaymentMethod[]
}

/**
 * Credit Card Settings Component
 *
 * Story: 1-5-mode-switching-with-data-implications-warning
 * Acceptance Criteria: AC5.1, AC5.11
 *
 * Lists all user's credit cards with their current mode and allows
 * switching between Credit Mode and Simple Mode with appropriate warnings.
 *
 * Features:
 * - Displays all credit cards with current mode
 * - Switch mode button for each card
 * - Warning dialog when switching with active installments
 * - Mobile-responsive layout
 * - Localized (pt-BR and en)
 */
export function CreditCardSettings({ paymentMethods }: CreditCardSettingsProps) {
  const t = useTranslations('credit_mode')
  const router = useRouter()
  const [switchingCard, setSwitchingCard] = useState<string | null>(null)
  const [warningDialogData, setWarningDialogData] = useState<{
    open: boolean
    paymentMethodId: string
    paymentMethodName: string
    currentMode: boolean
    targetMode: boolean
    activeInstallments: number
  } | null>(null)
  const [creditConfirmDialogData, setCreditConfirmDialogData] = useState<{
    open: boolean
    paymentMethodId: string
    paymentMethodName: string
  } | null>(null)

  // Filter to only show credit cards
  const creditCards = paymentMethods.filter(pm => pm.type === 'credit')

  async function handleSwitchMode(paymentMethodId: string, paymentMethodName: string, currentMode: boolean | null) {
    // Determine target mode
    const targetMode = !currentMode

    // If switching TO Credit Mode (currentMode is false or null), show confirmation dialog (AC5.10)
    if (currentMode === false) {
      setCreditConfirmDialogData({
        open: true,
        paymentMethodId,
        paymentMethodName
      })
      return
    }

    setSwitchingCard(paymentMethodId)

    try {
      // Call server action without cleanup option to check for installments
      const result: SwitchResult = await switchCreditMode(paymentMethodId, targetMode)

      if (result.success) {
        // Simple switch successful (no installments)
        toast.success(t('mode_switched_success'))
        router.refresh()
        setSwitchingCard(null)
      } else if (result.requiresConfirmation && result.activeInstallments) {
        // Need to show warning dialog
        setWarningDialogData({
          open: true,
          paymentMethodId,
          paymentMethodName,
          currentMode: currentMode || false,
          targetMode,
          activeInstallments: result.activeInstallments
        })
        setSwitchingCard(null)
      } else {
        // Error occurred
        toast.error(result.error || t('error'))
        setSwitchingCard(null)
      }
    } catch (error) {
      console.error('[CreditCardSettings] Error switching mode:', error)
      toast.error(t('error'))
      setSwitchingCard(null)
    }
  }

  function handleWarningDialogClose() {
    setWarningDialogData(null)
  }

  async function handleCreditModeConfirm() {
    if (!creditConfirmDialogData) return

    setSwitchingCard(creditConfirmDialogData.paymentMethodId)
    setCreditConfirmDialogData(null)

    try {
      const result = await switchCreditMode(creditConfirmDialogData.paymentMethodId, true)

      if (result.success) {
        toast.success(t('mode_switched_success'))
        router.refresh()
        setSwitchingCard(null)
      } else {
        toast.error(result.error || t('error'))
        setSwitchingCard(null)
      }
    } catch (error) {
      console.error('[CreditCardSettings] Error confirming credit mode switch:', error)
      toast.error(t('error'))
      setSwitchingCard(null)
    }
  }

  async function handleWarningDialogConfirm(cleanupInstallments: boolean) {
    if (!warningDialogData) return

    try {
      const result = await switchCreditMode(
        warningDialogData.paymentMethodId,
        warningDialogData.targetMode,
        { cleanupInstallments }
      )

      if (result.success) {
        const message = cleanupInstallments
          ? t('mode_switched_payoff', { count: warningDialogData.activeInstallments })
          : t('mode_switched_keep')
        toast.success(message)
        router.refresh()
        setWarningDialogData(null)
      } else {
        toast.error(result.error || t('error'))
      }
    } catch (error) {
      console.error('[CreditCardSettings] Error confirming mode switch:', error)
      toast.error(t('error'))
    }
  }

  if (creditCards.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            {t('settings_title')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-8">{t('no_credit_cards')}</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            {t('settings_title')}
          </CardTitle>
          <CardDescription>
            {t('settings_description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {creditCards.map((card) => {
            const isCurrentlySwitching = switchingCard === card.id
            const currentModeLabel = card.credit_mode
              ? t('credit_mode_label')
              : card.credit_mode === false
                ? t('simple_mode_label')
                : 'Not Set'

            return (
              <div
                key={card.id}
                className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <CreditCard className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">{card.name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-sm text-muted-foreground">
                        {t('current_mode', { mode: '' })}
                      </span>
                      <Badge variant={card.credit_mode ? 'default' : 'secondary'}>
                        {currentModeLabel}
                      </Badge>
                    </div>
                  </div>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleSwitchMode(card.id, card.name, card.credit_mode)}
                  disabled={isCurrentlySwitching || card.credit_mode === null}
                >
                  {isCurrentlySwitching ? (
                    t('switching')
                  ) : card.credit_mode ? (
                    t('switch_to_simple')
                  ) : (
                    t('switch_to_credit')
                  )}
                </Button>
              </div>
            )
          })}
        </CardContent>
      </Card>

      {/* Warning dialog for switching TO Simple Mode with active installments */}
      {warningDialogData && (
        <ModeSwitchWarningDialog
          open={warningDialogData.open}
          onOpenChange={(open) => {
            if (!open) handleWarningDialogClose()
          }}
          paymentMethodId={warningDialogData.paymentMethodId}
          paymentMethodName={warningDialogData.paymentMethodName}
          activeInstallments={warningDialogData.activeInstallments}
          onConfirm={handleWarningDialogConfirm}
        />
      )}

      {/* Confirmation dialog for switching TO Credit Mode (AC5.10) */}
      {creditConfirmDialogData && (
        <AlertDialog open={creditConfirmDialogData.open} onOpenChange={(open) => {
          if (!open) setCreditConfirmDialogData(null)
        }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('credit_switch_title')}</AlertDialogTitle>
              <AlertDialogDescription>
                {t('credit_switch_description')}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('cancel_switch')}</AlertDialogCancel>
              <AlertDialogAction onClick={handleCreditModeConfirm}>
                {t('confirm_switch')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  )
}
