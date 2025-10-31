"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { CategoryChart } from "@/components/category-chart"
import { TrendChart } from "@/components/trend-chart"
import { YearlyChart } from "@/components/yearly-chart"
import { getMonthlyReport, getYearlyComparison } from "@/lib/actions/reports"
import { ArrowLeftIcon, TrendingDownIcon, TrendingUpIcon } from "lucide-react"
import Link from "next/link"

export default function ReportsPage() {
  const currentDate = new Date()
  const [month, setMonth] = useState(currentDate.getMonth() + 1)
  const [year, setYear] = useState(currentDate.getFullYear())
  const [report, setReport] = useState<any>(null)
  const [yearlyData, setYearlyData] = useState<any[]>([])
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

  const monthName = new Date(year, month - 1).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
  })

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto py-8 px-4">
        <div className="flex items-center gap-4 mb-8">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/">
              <ArrowLeftIcon className="h-4 w-4" />
            </Link>
          </Button>
          <div className="flex-1">
            <h1 className="text-3xl font-bold tracking-tight">Reports & Analytics</h1>
            <p className="text-muted-foreground mt-1">View your financial insights and trends</p>
          </div>
        </div>

        <div className="flex gap-4 mb-6">
          <Select value={month.toString()} onValueChange={(value) => setMonth(Number.parseInt(value))}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <SelectItem key={m} value={m.toString()}>
                  {new Date(2000, m - 1).toLocaleString("en-US", { month: "long" })}
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
            <p className="text-muted-foreground">Loading reports...</p>
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
                  <CardTitle className="text-sm font-medium">Total Income</CardTitle>
                  <TrendingUpIcon className="h-4 w-4 text-green-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600">R$ {report.income.toFixed(2)}</div>
                  <p className="text-xs text-muted-foreground mt-1">{monthName}</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Expenses</CardTitle>
                  <TrendingDownIcon className="h-4 w-4 text-red-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-red-600">R$ {report.expenses.toFixed(2)}</div>
                  <p className="text-xs text-muted-foreground mt-1">{monthName}</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Net Balance</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className={`text-2xl font-bold ${report.balance >= 0 ? "text-green-600" : "text-red-600"}`}>
                    R$ {report.balance.toFixed(2)}
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
                    {report.paymentMethods.map((method: any) => (
                      <div key={method.method} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="capitalize">{method.method.replace("_", " ")}</span>
                          <span className="text-muted-foreground text-sm">({method.count} transactions)</span>
                        </div>
                        <span className="font-semibold">R$ {method.total.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
