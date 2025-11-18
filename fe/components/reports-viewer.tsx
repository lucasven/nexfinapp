"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { CategoryChart } from "@/components/category-chart"
import { TrendChart } from "@/components/trend-chart"
import { YearlyChart } from "@/components/yearly-chart"
import { getMonthlyReport, getYearlyComparison } from "@/lib/actions/reports"
import { TrendingDownIcon, TrendingUpIcon } from "lucide-react"
import { formatCurrency, getMonthName } from '@/lib/localization/format'

// Type definitions for report data
interface PaymentMethod {
  method: string
  total: number
  count: number
}

interface CategoryData {
  name: string
  icon: string
  type: string
  total: number
  count: number
}

interface TrendData {
  date: string
  income: number
  expenses: number
}

interface MonthlyReport {
  income: number
  expenses: number
  balance: number
  transactionCount: number
  categories: CategoryData[]
  paymentMethods: PaymentMethod[]
  trend: TrendData[]
}

interface YearlyData {
  month: string
  income: number
  expenses: number
}

interface ReportsViewerProps {
  locale: string
  translations: {
    (key: string): string
  }
}

export function ReportsViewer({ locale, translations: t }: ReportsViewerProps) {
  const currentDate = new Date()
  const [month, setMonth] = useState(currentDate.getMonth() + 1)
  const [year, setYear] = useState(currentDate.getFullYear())
  const [report, setReport] = useState<MonthlyReport | null>(null)
  const [yearlyData, setYearlyData] = useState<YearlyData[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadData() {
      setLoading(true)
      try {
        const [monthlyReport, yearly] = await Promise.all([getMonthlyReport(month, year), getYearlyComparison(year)])
        setReport(monthlyReport)
        setYearlyData(yearly)
      } catch (error) {
        console.error("Error loading reports:", error)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [month, year])

  const monthName = `${getMonthName(month, locale as 'pt-br' | 'en')} ${year}`

  return (
    <>
      <div className="flex gap-4 mb-6">
        <Select value={month.toString()} onValueChange={(value) => setMonth(Number.parseInt(value))}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <SelectItem key={m} value={m.toString()}>
                {getMonthName(m, locale as 'pt-br' | 'en')}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={year.toString()} onValueChange={(value) => setYear(Number.parseInt(value))}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Array.from({ length: 5 }, (_, i) => currentDate.getFullYear() - 2 + i).map((y) => (
              <SelectItem key={y} value={y.toString()}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">{t('common.loading')}</p>
        </div>
      ) : !report ? (
        <Card>
          <CardContent className="py-12">
            <p className="text-center text-muted-foreground">No data available for this period</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{t('balance.income')}</CardTitle>
                <TrendingUpIcon className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{formatCurrency(report.income, locale as 'pt-br' | 'en')}</div>
                <p className="text-xs text-muted-foreground mt-1">{monthName}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{t('balance.expenses')}</CardTitle>
                <TrendingDownIcon className="h-4 w-4 text-red-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">{formatCurrency(report.expenses, locale as 'pt-br' | 'en')}</div>
                <p className="text-xs text-muted-foreground mt-1">{monthName}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{t('balance.totalBalance')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${report.balance >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {formatCurrency(report.balance, locale as 'pt-br' | 'en')}
                </div>
                <p className="text-xs text-muted-foreground mt-1">{monthName}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Transactions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{report.transactionCount}</div>
                <p className="text-xs text-muted-foreground mt-1">{monthName}</p>
              </CardContent>
            </Card>
          </div>

          {/* Charts */}
          <div className="grid gap-6 lg:grid-cols-2">
            <CategoryChart data={report.categories} type="expense" />
            <CategoryChart data={report.categories} type="income" />
          </div>

          <TrendChart data={report.trend} />

          <YearlyChart data={yearlyData} />

          {/* Payment Methods */}
          {report.paymentMethods.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Payment Methods</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {report.paymentMethods.map((method) => (
                    <div key={method.method} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="capitalize">{method.method.replace("_", " ")}</span>
                        <span className="text-muted-foreground text-sm">({method.count} transactions)</span>
                      </div>
                      <span className="font-semibold">{formatCurrency(method.total, locale as 'pt-br' | 'en')}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </>
  )
}
