"use client"

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts"

interface StrategyPerformanceData {
  strategy: string
  total: number
  successful: number
  successRate: number
  avgConfidence: number
  avgDuration: number
}

interface StrategyPerformanceChartProps {
  data: StrategyPerformanceData[]
}

const STRATEGY_LABELS: Record<string, string> = {
  correction_state: "Correction State",
  duplicate_confirmation: "Duplicate Check",
  correction_intent: "Correction Intent",
  explicit_command: "Explicit Command",
  learned_pattern: "Learned Pattern",
  local_nlp: "Local NLP",
  ai_pattern: "AI Pattern",
  unknown: "Unknown",
}

export function StrategyPerformanceChart({ data }: StrategyPerformanceChartProps) {
  // Add readable labels
  const chartData = data.map((item) => ({
    ...item,
    name: STRATEGY_LABELS[item.strategy] || item.strategy,
  }))

  return (
    <ResponsiveContainer width="100%" height={400}>
      <BarChart data={chartData} layout="horizontal">
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis type="category" dataKey="name" className="text-xs" tick={{ fontSize: 10 }} angle={-45} textAnchor="end" height={80} />
        <YAxis type="number" className="text-xs" tick={{ fontSize: 12 }} label={{ value: "Success Rate (%)", angle: -90, position: "insideLeft" }} />
        <Tooltip
          contentStyle={{
            backgroundColor: "hsl(var(--background))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "6px",
          }}
          formatter={(value: number, name: string) => {
            if (name === "successRate") return [`${value}%`, "Success Rate"]
            if (name === "avgConfidence") return [`${value}%`, "Avg Confidence"]
            if (name === "avgDuration") return [`${value}ms`, "Avg Duration"]
            return [value, name]
          }}
        />
        <Legend />
        <Bar dataKey="successRate" fill="hsl(var(--primary))" name="Success Rate" />
        <Bar dataKey="avgConfidence" fill="hsl(142, 76%, 36%)" name="Avg Confidence" />
      </BarChart>
    </ResponsiveContainer>
  )
}
