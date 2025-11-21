"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts"
import { useTranslations } from 'next-intl'

interface CategoryChartProps {
  data: Array<{
    name: string
    icon: string
    type: string
    total: number
    count: number
  }>
  type: "income" | "expense"
}

const COLORS = [
  "#ef4444", // red
  "#f59e0b", // orange
  "#10b981", // green
  "#3b82f6", // blue
  "#8b5cf6", // purple
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#f97316", // orange
]

export function CategoryChart({ data, type }: CategoryChartProps) {
  const t = useTranslations()
  const filteredData = data
    .filter((item) => item.type === type)
    .map((item, index) => ({
      name: `${item.icon || "📦"} ${item.name || "Uncategorized"}`,
      value: item.total,
      fill: COLORS[index % COLORS.length],
    }))

  if (filteredData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{type === "income" ? t('reports.incomeByCategory') : t('reports.expensesByCategory')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-center text-muted-foreground py-8">{type === "income" ? t('reports.noIncomeData') : t('reports.noExpenseData')}</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{type === "income" ? t('reports.incomeByCategory') : t('reports.expensesByCategory')}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={filteredData}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
              outerRadius={80}
              fill="#8884d8"
              dataKey="value"
            >
              {filteredData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.fill} />
              ))}
            </Pie>
            <Tooltip formatter={(value: number) => `R$ ${value.toFixed(2)}`} />
          </PieChart>
        </ResponsiveContainer>

        <div className="mt-4 space-y-2">
          {data
            .filter((item) => item.type === type)
            .map((item, index) => (
              <div key={item.name} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                  <span>
                    {item.icon || "📦"} {item.name || "Uncategorized"}
                  </span>
                  <span className="text-muted-foreground">({item.count})</span>
                </div>
                <span className="font-semibold">R$ {item.total.toFixed(2)}</span>
              </div>
            ))}
        </div>
      </CardContent>
    </Card>
  )
}
