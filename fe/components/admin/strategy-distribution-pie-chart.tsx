"use client"

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts"

interface StrategyDistributionData {
  strategy: string
  count: number
  percentage: number
}

interface StrategyDistributionPieChartProps {
  data: StrategyDistributionData[]
}

const COLORS = {
  correction_state: "hsl(340, 82%, 52%)",     // Pink
  duplicate_confirmation: "hsl(280, 67%, 60%)", // Purple
  correction_intent: "hsl(48, 96%, 53%)",     // Yellow
  explicit_command: "hsl(142, 76%, 36%)",     // Green
  learned_pattern: "hsl(221, 83%, 53%)",      // Blue
  local_nlp: "hsl(20, 95%, 55%)",             // Orange
  ai_pattern: "hsl(190, 95%, 45%)",           // Cyan
  ai_function_calling: "hsl(270, 50%, 50%)",  // Purple-blue
  semantic_cache: "hsl(160, 60%, 45%)",       // Teal
  unknown: "hsl(0, 0%, 50%)",                 // Gray
}

const STRATEGY_LABELS: Record<string, string> = {
  correction_state: "Correction State",
  duplicate_confirmation: "Duplicate Check",
  correction_intent: "Correction Intent",
  explicit_command: "Explicit Command",
  learned_pattern: "Learned Pattern",
  local_nlp: "Local NLP",
  ai_pattern: "AI Pattern",
  ai_function_calling: "AI Function",
  semantic_cache: "Cache Hit",
  unknown: "Unknown",
}

export function StrategyDistributionPieChart({ data }: StrategyDistributionPieChartProps) {
  // Sort by count descending
  const chartData = data
    .map((item) => ({
      ...item,
      name: STRATEGY_LABELS[item.strategy] || item.strategy,
      fill: COLORS[item.strategy as keyof typeof COLORS] || COLORS.unknown,
    }))
    .sort((a, b) => b.count - a.count)

  return (
    <ResponsiveContainer width="100%" height={400}>
      <BarChart data={chartData} layout="horizontal">
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis
          type="category"
          dataKey="name"
          className="text-xs"
          tick={{ fontSize: 11 }}
          angle={-45}
          textAnchor="end"
          height={100}
        />
        <YAxis
          type="number"
          className="text-xs"
          tick={{ fontSize: 12 }}
          label={{ value: "Message Count", angle: -90, position: "insideLeft" }}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "hsl(var(--background))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "6px",
          }}
          formatter={(value: number, name: string, props: any) => [
            `${value} messages (${props.payload.percentage}%)`,
            name,
          ]}
        />
        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
          {chartData.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.fill} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
