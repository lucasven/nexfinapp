"use client"

import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts"

interface MerchantCoverageChartProps {
  merchantCoverage: number
}

export function MerchantCoverageChart({ merchantCoverage }: MerchantCoverageChartProps) {
  const data = [
    { name: "Covered", value: merchantCoverage, fill: "hsl(142, 76%, 36%)" },
    { name: "Not Covered", value: 100 - merchantCoverage, fill: "hsl(0, 0%, 85%)" },
  ]

  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={80}
            paddingAngle={2}
            dataKey="value"
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.fill} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-center">
          <div className="text-3xl font-bold">{merchantCoverage.toFixed(1)}%</div>
          <div className="text-xs text-muted-foreground">Covered</div>
        </div>
      </div>
    </div>
  )
}
