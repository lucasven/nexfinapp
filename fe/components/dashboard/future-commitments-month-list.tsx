'use client'

import { useState } from 'react'
import { CalendarIcon, ChevronDownIcon, ChevronUpIcon } from "lucide-react"
import { useTranslations, useLocale } from 'next-intl'
import { formatCurrency } from '@/lib/localization/format'
import { format } from 'date-fns'
import { ptBR, enUS } from 'date-fns/locale'
import type { FutureCommitment, MonthCommitmentDetail } from '@/lib/types'
import { getFutureCommitmentsByMonth } from '@/lib/actions/installments'
import * as Collapsible from '@radix-ui/react-collapsible'

interface FutureCommitmentsMonthListProps {
  commitments: FutureCommitment[]
}

/**
 * Client Component: Interactive month list with expand/collapse
 *
 * Handles client-side state for expanding months and fetching details on demand.
 */
export function FutureCommitmentsMonthList({ commitments }: FutureCommitmentsMonthListProps) {
  const t = useTranslations()
  const locale = useLocale()
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set())
  const [monthDetails, setMonthDetails] = useState<Map<string, MonthCommitmentDetail[]>>(new Map())
  const [loadingMonths, setLoadingMonths] = useState<Set<string>>(new Set())

  const dateLocale = locale === 'pt-br' ? ptBR : enUS

  const toggleMonth = async (month: string) => {
    const isExpanded = expandedMonths.has(month)

    if (isExpanded) {
      // Collapse
      const newExpanded = new Set(expandedMonths)
      newExpanded.delete(month)
      setExpandedMonths(newExpanded)
    } else {
      // Expand - fetch details if not already loaded
      const newExpanded = new Set(expandedMonths)
      newExpanded.add(month)
      setExpandedMonths(newExpanded)

      if (!monthDetails.has(month)) {
        setLoadingMonths(new Set(loadingMonths).add(month))

        const result = await getFutureCommitmentsByMonth(month)

        if (result.success && result.data) {
          const newDetails = new Map(monthDetails)
          newDetails.set(month, result.data)
          setMonthDetails(newDetails)
        }

        const newLoading = new Set(loadingMonths)
        newLoading.delete(month)
        setLoadingMonths(newLoading)
      }
    }
  }

  return (
    <div className="space-y-2">
      {commitments.map((commitment) => {
        const [year, monthNum] = commitment.month.split('-').map(Number)
        const date = new Date(year, monthNum - 1, 1)
        const monthName = format(date, 'MMMM yyyy', { locale: dateLocale })
        const isExpanded = expandedMonths.has(commitment.month)
        const details = monthDetails.get(commitment.month) || []
        const isLoading = loadingMonths.has(commitment.month)

        const paymentCountText = commitment.payment_count === 1
          ? t('futureCommitments.paymentCount_one', { count: commitment.payment_count })
          : t('futureCommitments.paymentCount', { count: commitment.payment_count })

        return (
          <Collapsible.Root
            key={commitment.month}
            open={isExpanded}
            onOpenChange={() => toggleMonth(commitment.month)}
          >
            <Collapsible.Trigger asChild>
              <button
                className="w-full flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <div className="font-medium text-sm">
                      {monthName}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {paymentCountText}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="font-semibold">
                    {formatCurrency(commitment.total_due, locale as 'pt-br' | 'en')}
                  </div>
                  {isExpanded ? (
                    <ChevronUpIcon className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDownIcon className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
              </button>
            </Collapsible.Trigger>

            <Collapsible.Content>
              <div className="mt-2 ml-7 space-y-1">
                {isLoading ? (
                  <div className="text-sm text-muted-foreground py-2">
                    {t('futureCommitments.loading')}
                  </div>
                ) : (
                  details.map((detail, index) => (
                    <div
                      key={`${detail.plan_id}-${index}`}
                      className="flex items-center justify-between p-2 text-sm rounded hover:bg-muted/30"
                    >
                      <div className="flex items-center gap-2">
                        <span>{detail.description}</span>
                        <span className="text-xs text-muted-foreground">
                          {detail.installment_number}/{detail.total_installments}
                        </span>
                      </div>
                      <div className="font-medium">
                        {formatCurrency(detail.amount, locale as 'pt-br' | 'en')}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </Collapsible.Content>
          </Collapsible.Root>
        )
      })}
    </div>
  )
}
