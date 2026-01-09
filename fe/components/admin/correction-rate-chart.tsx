"use client"

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts"
import { format, parseISO } from "date-fns"

interface CorrectionRateData {
  date: string
  corrections: number
  transactions: number
  correctionRate: number
}

interface CorrectionRateChartProps {
  data: CorrectionRateData[]
}

export function CorrectionRateChart({ data }: CorrectionRateChartProps) {
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
          label={{ value: "Correction Rate (%)", angle: -90, position: "insideLeft" }}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "hsl(var(--background))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "6px",
          }}
          formatter={(value: number, name: string) => {
            if (name === "correctionRate") return [`${value}%`, "Correction Rate"]
            return [value, name]
          }}
        />
        <Legend />
        <Line
          type="monotone"
          dataKey="correctionRate"
          stroke="hsl(var(--primary))"
          strokeWidth={2}
          dot={{ r: 3 }}
          activeDot={{ r: 5 }}
          name="Correction Rate"
        />
        <Line
          type="monotone"
          dataKey="corrections"
          stroke="hsl(var(--destructive))"
          strokeWidth={1}
          strokeDasharray="5 5"
          dot={false}
          name="Corrections"
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
