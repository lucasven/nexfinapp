"use client"

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"

interface MerchantRecognitionData {
  merchantName: string
  usageCount: number
  categoryName: string
}

interface MerchantRecognitionBarChartProps {
  data: MerchantRecognitionData[]
}

export function MerchantRecognitionBarChart({ data }: MerchantRecognitionBarChartProps) {
  // Take top 15 for readability
  const chartData = data.slice(0, 15)

  return (
    <ResponsiveContainer width="100%" height={400}>
      <BarChart data={chartData} layout="vertical" margin={{ left: 100 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis type="number" className="text-xs" tick={{ fontSize: 12 }} />
        <YAxis
          type="category"
          dataKey="merchantName"
          className="text-xs"
          tick={{ fontSize: 10 }}
          width={100}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "hsl(var(--background))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "6px",
          }}
          formatter={(value: number) => [`${value} matches`, "Usage Count"]}
          labelFormatter={(label: string, payload: any) => {
            if (payload && payload[0]) {
              return `${payload[0].payload.merchantName} → ${payload[0].payload.categoryName}`
            }
            return label
          }}
        />
        <Bar dataKey="usageCount" fill="hsl(var(--primary))" name="Recognition Count" />
      </BarChart>
    </ResponsiveContainer>
  )
}
