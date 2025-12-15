'use client'

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowDownIcon, ArrowUpIcon, WalletIcon } from "lucide-react"
import { useTranslations, useLocale } from 'next-intl'
import { formatCurrency } from '@/lib/localization/format'

interface FinancialOverviewCardProps {
  income: number
  expenses: number
  balance: number
}

export function FinancialOverviewCard({ income, expenses, balance }: FinancialOverviewCardProps) {
  const t = useTranslations()
  const locale = useLocale()

  return (
    <Card className="h-fit">
      <CardHeader>
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <WalletIcon className="h-5 w-5 text-muted-foreground" />
          {t('dashboard.financialOverview')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Total Balance */}
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">{t('balance.totalBalance')}</p>
          <p className="text-2xl font-bold">{formatCurrency(balance, locale as 'pt-br' | 'en')}</p>
        </div>

        {/* Income */}
        <div className="flex items-center justify-between py-2 border-t">
          <div className="flex items-center gap-2">
            <ArrowUpIcon className="h-4 w-4 text-green-600" />
            <span className="text-sm font-medium">{t('balance.income')}</span>
          </div>
          <span className="text-sm font-semibold text-green-600">
            {formatCurrency(income, locale as 'pt-br' | 'en')}
          </span>
        </div>

        {/* Expenses */}
        <div className="flex items-center justify-between py-2 border-t">
          <div className="flex items-center gap-2">
            <ArrowDownIcon className="h-4 w-4 text-red-600" />
            <span className="text-sm font-medium">{t('balance.expenses')}</span>
          </div>
          <span className="text-sm font-semibold text-red-600">
            {formatCurrency(expenses, locale as 'pt-br' | 'en')}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}
