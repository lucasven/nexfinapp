"use client"

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { CreditCard, Wallet, ChevronDown, Check } from 'lucide-react'
import { setCreditMode } from '@/lib/actions/payment-methods'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface CreditModeSelectionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  paymentMethodId: string
  onModeSelected: (mode: boolean) => void
}

/**
 * Credit Mode Selection Dialog Component
 *
 * Story: 1-4-credit-mode-selection-web-frontend
 * Acceptance Criteria: AC4.1-AC4.12
 *
 * Displays a modal dialog with two options: Credit Mode (full features)
 * and Simple Mode (basic tracking). User selects their preferred mode
 * when adding their first credit card transaction.
 *
 * Features:
 * - Two-card layout (side-by-side desktop, stacked mobile)
 * - Expandable comparison table
 * - Proper accessibility (WCAG 2.1 AA)
 * - Localized (pt-BR and en)
 * - PostHog analytics tracking
 */
export function CreditModeSelectionDialog({
  open,
  onOpenChange,
  paymentMethodId,
  onModeSelected,
}: CreditModeSelectionDialogProps) {
  const t = useTranslations('credit_mode')
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState(false)

  async function handleSelectMode(creditMode: boolean) {
    setLoading(true)

    try {
      const result = await setCreditMode(paymentMethodId, creditMode)

      if (result.success) {
        toast.success(creditMode ? t('success_credit') : t('success_simple'))
        onModeSelected(creditMode)
        onOpenChange(false)
      } else {
        toast.error(t('error'))
        setLoading(false)
      }
    } catch (error) {
      console.error('[CreditModeSelectionDialog] Error selecting mode:', error)
      toast.error(t('error'))
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[800px] w-[95vw] max-h-[90vh] overflow-y-auto"
        showCloseButton={true}
      >
        <DialogTitle className="text-2xl mb-6">{t('dialog_title')}</DialogTitle>

        {/* Two-card layout */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {/* Credit Mode Card */}
          <div
            className={cn(
              "border-2 rounded-lg p-6 transition-all hover:shadow-lg hover:scale-[1.02]",
              "flex flex-col h-full"
            )}
            role="article"
            aria-label={t('credit_mode_heading')}
          >
            {/* Icon */}
            <div className="mb-4 flex items-center justify-center">
              <div className="relative">
                <CreditCard className="w-12 h-12 text-primary" />
                <div className="absolute -top-1 -right-1">
                  <svg
                    className="w-5 h-5 text-yellow-500"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                    aria-hidden="true"
                  >
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                </div>
              </div>
            </div>

            <h3 className="text-xl font-semibold mb-4 text-center">
              {t('credit_mode_heading')}
            </h3>

            <ul className="mb-6 space-y-2 flex-grow">
              {(t.raw('credit_benefits') as string[]).map((benefit: string, i: number) => (
                <li key={i} className="flex items-start gap-2">
                  <Check className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" aria-hidden="true" />
                  <span className="text-sm">{benefit}</span>
                </li>
              ))}
            </ul>

            <Button
              onClick={() => handleSelectMode(true)}
              disabled={loading}
              className="w-full"
              aria-label={t('choose_credit_button')}
            >
              {t('choose_credit_button')}
            </Button>
          </div>

          {/* Simple Mode Card */}
          <div
            className={cn(
              "border-2 rounded-lg p-6 transition-all hover:shadow-lg hover:scale-[1.02]",
              "flex flex-col h-full"
            )}
            role="article"
            aria-label={t('simple_mode_heading')}
          >
            {/* Icon */}
            <div className="mb-4 flex items-center justify-center">
              <Wallet className="w-12 h-12 text-secondary" />
            </div>

            <h3 className="text-xl font-semibold mb-4 text-center">
              {t('simple_mode_heading')}
            </h3>

            <ul className="mb-6 space-y-2 flex-grow">
              {(t.raw('simple_benefits') as string[]).map((benefit: string, i: number) => (
                <li key={i} className="flex items-start gap-2">
                  <Check className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" aria-hidden="true" />
                  <span className="text-sm">{benefit}</span>
                </li>
              ))}
            </ul>

            <Button
              onClick={() => handleSelectMode(false)}
              disabled={loading}
              variant="secondary"
              className="w-full"
              aria-label={t('choose_simple_button')}
            >
              {t('choose_simple_button')}
            </Button>
          </div>
        </div>

        {/* Expandable comparison table */}
        <div className="border-t pt-4">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center justify-between w-full text-left font-medium hover:text-primary transition-colors"
            aria-expanded={expanded}
            aria-controls="comparison-table"
          >
            <span>{t('whats_difference')}</span>
            <ChevronDown
              className={cn(
                "w-5 h-5 transition-transform",
                expanded && "rotate-180"
              )}
              aria-hidden="true"
            />
          </button>

          {expanded && (
            <div
              id="comparison-table"
              className="mt-4 overflow-x-auto"
              role="table"
              aria-label={t('whats_difference')}
            >
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-2" scope="col">Feature</th>
                    <th className="text-center py-2 px-2" scope="col">{t('credit_mode_heading')}</th>
                    <th className="text-center py-2 px-2" scope="col">{t('simple_mode_heading')}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b">
                    <td className="py-2 px-2">{t('comparison_table.expense_tracking')}</td>
                    <td className="text-center py-2 px-2">{t('comparison_table.yes')}</td>
                    <td className="text-center py-2 px-2">{t('comparison_table.yes')}</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 px-2">{t('comparison_table.installments')}</td>
                    <td className="text-center py-2 px-2">{t('comparison_table.yes')}</td>
                    <td className="text-center py-2 px-2">{t('comparison_table.no')}</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 px-2">{t('comparison_table.statement_budgets')}</td>
                    <td className="text-center py-2 px-2">{t('comparison_table.yes')}</td>
                    <td className="text-center py-2 px-2">{t('comparison_table.no')}</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 px-2">{t('comparison_table.payment_reminders')}</td>
                    <td className="text-center py-2 px-2">{t('comparison_table.yes')}</td>
                    <td className="text-center py-2 px-2">{t('comparison_table.no')}</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-2">{t('comparison_table.simplicity')}</td>
                    <td className="text-center py-2 px-2">{t('comparison_table.advanced')}</td>
                    <td className="text-center py-2 px-2">{t('comparison_table.maximum')}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
