"use client"

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts"
import { format, parseISO } from "date-fns"

interface OCRTrendData {
  date: string
  total: number
  successful: number
  successRate: number
  avgConfidence: number
}

interface OCRSuccessRateChartProps {
  data: OCRTrendData[]
}

export function OCRSuccessRateChart({ data }: OCRSuccessRateChartProps) {
  // Format date for display (MMM d)
  const formattedData = data.map((item) => ({
    ...item,
    displayDate: format(parseISO(item.date), "MMM d"),
  }))

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={formattedData}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis
          dataKey="displayDate"
          className="text-xs"
          tick={{ fontSize: 12 }}
          interval="preserveStartEnd"
        />
        <YAxis
          className="text-xs"
          tick={{ fontSize: 12 }}
          label={{ value: "Success Rate (%)", angle: -90, position: "insideLeft" }}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "hsl(var(--background))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "6px",
          }}
          formatter={(value: number, name: string) => {
            if (name === "successRate" || name === "avgConfidence") return [`${value}%`, name]
            return [value, name]
          }}
        />
        <Legend />
        <Line
          type="monotone"
          dataKey="successRate"
          stroke="hsl(var(--primary))"
          strokeWidth={2}
          dot={{ r: 3 }}
          activeDot={{ r: 5 }}
          name="Success Rate"
        />
        <Line
          type="monotone"
          dataKey="avgConfidence"
          stroke="hsl(142, 76%, 36%)"
          strokeWidth={1}
          strokeDasharray="5 5"
          dot={false}
          name="Avg Confidence"
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
