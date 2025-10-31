"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { format } from "date-fns"

interface TrendChartProps {
  data: Array<{
    date: string
    income: number
    expenses: number
  }>
}

export function TrendChart({ data }: TrendChartProps) {
  const chartData = data.map((item) => ({
    ...item,
    date: format(new Date(item.date), "MMM dd"),
  }))

  return (
    <Card>
      <CardHeader>
        <CardTitle>Daily Trend</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" />
            <YAxis />
            <Tooltip formatter={(value: number) => `R$ ${value.toFixed(2)}`} />
            <Area
              type="monotone"
              dataKey="income"
              stackId="1"
              stroke="#10b981"
              fill="#10b981"
              fillOpacity={0.6}
              name="Income"
            />
            <Area
              type="monotone"
              dataKey="expenses"
              stackId="2"
              stroke="#ef4444"
              fill="#ef4444"
              fillOpacity={0.6}
              name="Expenses"
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
