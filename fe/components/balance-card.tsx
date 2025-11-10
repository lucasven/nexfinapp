'use client'

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowDownIcon, ArrowUpIcon, WalletIcon } from "lucide-react"
import { useTranslations, useLocale } from 'next-intl'
import { formatCurrency } from '@/lib/localization/format'

interface BalanceCardProps {
  income: number
  expenses: number
  balance: number
}

export function BalanceCard({ income, expenses, balance }: BalanceCardProps) {
  const t = useTranslations()
  const locale = useLocale()

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{t('balance.totalBalance')}</CardTitle>
          <WalletIcon className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatCurrency(balance, locale as 'pt-br' | 'en')}</div>
          <p className="text-xs text-muted-foreground mt-1">{t('balance.currentBalance')}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{t('balance.income')}</CardTitle>
          <ArrowUpIcon className="h-4 w-4 text-green-600" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-green-600">{formatCurrency(income, locale as 'pt-br' | 'en')}</div>
          <p className="text-xs text-muted-foreground mt-1">{t('balance.totalIncome')}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{t('balance.expenses')}</CardTitle>
          <ArrowDownIcon className="h-4 w-4 text-red-600" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-red-600">{formatCurrency(expenses, locale as 'pt-br' | 'en')}</div>
          <p className="text-xs text-muted-foreground mt-1">{t('balance.totalExpenses')}</p>
        </CardContent>
      </Card>
    </div>
  )
}
