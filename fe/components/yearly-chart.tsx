"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { useTranslations } from 'next-intl'

interface YearlyChartProps {
  data: Array<{
    month: string
    income: number
    expenses: number
  }>
}

export function YearlyChart({ data }: YearlyChartProps) {
  const t = useTranslations()
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('reports.yearlyOverview')}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" />
            <YAxis />
            <Tooltip formatter={(value: number) => `R$ ${value.toFixed(2)}`} />
            <Legend />
            <Bar dataKey="income" fill="#10b981" name={t('balance.income')} />
            <Bar dataKey="expenses" fill="#ef4444" name={t('balance.expenses')} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
