"use client"

import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts"

interface MatchTypeData {
  type: string
  count: number
  percentage: number
}

interface MatchTypePieChartProps {
  data: MatchTypeData[]
}

const COLORS = {
  exact: "hsl(142, 76%, 36%)",      // Green
  fuzzy: "hsl(48, 96%, 53%)",       // Yellow
  keyword: "hsl(221, 83%, 53%)",    // Blue
  substring: "hsl(280, 67%, 60%)",  // Purple
  merchant: "hsl(20, 95%, 55%)",    // Orange
  user_preference: "hsl(340, 82%, 52%)", // Pink
  fallback: "hsl(0, 0%, 63%)",      // Gray
  legacy: "hsl(0, 0%, 80%)",        // Light gray
  unknown: "hsl(0, 0%, 50%)",       // Dark gray
}

const MATCH_TYPE_LABELS: Record<string, string> = {
  exact: "Exact Match",
  fuzzy: "Fuzzy Match",
  keyword: "Keyword Match",
  substring: "Substring Match",
  merchant: "Merchant Mapping",
  user_preference: "User Preference",
  fallback: "Fallback",
  legacy: "Legacy (No Data)",
  unknown: "Unknown",
}

export function MatchTypePieChart({ data }: MatchTypePieChartProps) {
  const chartData = data.map((item) => ({
    ...item,
    name: MATCH_TYPE_LABELS[item.type] || item.type,
    fill: COLORS[item.type as keyof typeof COLORS] || COLORS.unknown,
  }))

  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie
          data={chartData}
          cx="50%"
          cy="50%"
          labelLine={false}
          label={({ name, percentage }) => `${name}: ${percentage}%`}
          outerRadius={80}
          fill="#8884d8"
          dataKey="count"
        >
          {chartData.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.fill} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{
            backgroundColor: "hsl(var(--background))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "6px",
          }}
          formatter={(value: number, name: string, props: any) => [
            `${value} (${props.payload.percentage}%)`,
            name,
          ]}
        />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  )
}
