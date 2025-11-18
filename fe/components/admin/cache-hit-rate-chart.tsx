"use client"

import { Card, CardContent } from "@/components/ui/card"

interface CacheHitRateProps {
  cacheHitRate: number
  totalCacheHits: number
  totalLLMCalls: number
  estimatedSavings: number
}

export function CacheHitRateChart({ cacheHitRate, totalCacheHits, totalLLMCalls, estimatedSavings }: CacheHitRateProps) {
  const totalCalls = totalCacheHits + totalLLMCalls

  return (
    <div className="space-y-4">
      {/* Main gauge */}
      <div className="flex items-center justify-center">
        <div className="relative w-48 h-48">
          <svg className="w-full h-full transform -rotate-90">
            {/* Background circle */}
            <circle
              cx="96"
              cy="96"
              r="80"
              stroke="hsl(var(--muted))"
              strokeWidth="16"
              fill="none"
            />
            {/* Progress circle */}
            <circle
              cx="96"
              cy="96"
              r="80"
              stroke="hsl(var(--primary))"
              strokeWidth="16"
              fill="none"
              strokeDasharray={`${(cacheHitRate / 100) * 502.4} 502.4`}
              strokeLinecap="round"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-4xl font-bold">{cacheHitRate}%</span>
            <span className="text-sm text-muted-foreground">Cache Hit Rate</span>
          </div>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-4 text-center">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-primary">{totalCacheHits.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">Cache Hits</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{totalLLMCalls.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">LLM Calls</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-green-600">${estimatedSavings.toFixed(2)}</div>
            <div className="text-xs text-muted-foreground">Est. Savings</div>
          </CardContent>
        </Card>
      </div>

      {/* Calculation note */}
      <p className="text-xs text-center text-muted-foreground">
        Cache Hit Rate = {totalCacheHits.toLocaleString()} / {totalCalls.toLocaleString()} = {cacheHitRate}%
      </p>
    </div>
  )
}
