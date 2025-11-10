import { getAIUsagePerUser } from "@/lib/actions/admin"
import { AIUsageTable } from "@/components/admin/ai-usage-table"
import { StatCard } from "@/components/admin/stat-card"
import { DollarSignIcon, TrendingUpIcon, ZapIcon, ActivityIcon } from "lucide-react"

export default async function AIUsagePage() {
  const usageData = await getAIUsagePerUser()

  // Calculate global metrics
  const totalCost = usageData.reduce((sum, u) => sum + u.totalCost, 0)
  const todayCost = usageData.reduce((sum, u) => sum + u.dailyCost, 0)
  
  // Calculate weighted cache hit rate (only for users with calls today)
  const totalLLMCallsToday = usageData.reduce((sum, u) => sum + u.llmCallsToday, 0)
  const totalCacheHitsToday = usageData.reduce((sum, u) => sum + u.cacheHitsToday, 0)
  const totalCallsWithCache = totalLLMCallsToday + totalCacheHitsToday
  const avgCacheHitRate = totalCallsWithCache > 0 
    ? (totalCacheHitsToday / totalCallsWithCache) * 100 
    : 0
  
  const totalCalls = usageData.reduce(
    (sum, u) => sum + u.llmCallsToday + u.embeddingCallsToday + u.cacheHitsToday,
    0
  )

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">AI Usage & Costs</h2>
        <p className="text-muted-foreground">
          Monitor API spending and manage user limits
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total AI Spend"
          value={`$${totalCost.toFixed(6)}`}
          icon={DollarSignIcon}
          description="All-time API costs"
        />
        
        <StatCard
          title="Today's Spend"
          value={`$${todayCost.toFixed(6)}`}
          icon={TrendingUpIcon}
          description="Costs incurred today"
        />
        
        <StatCard
          title="Cache Hit Rate (Today)"
          value={`${avgCacheHitRate.toFixed(2)}%`}
          icon={ZapIcon}
          description="Semantic cache efficiency"
        />
        
        <StatCard
          title="API Calls Today"
          value={totalCalls.toLocaleString()}
          icon={ActivityIcon}
          description="LLM + Embeddings + Cache"
        />
      </div>

      <div className="rounded-lg border bg-card">
        <div className="p-6">
          <h3 className="text-lg font-semibold mb-4">Per-User AI Usage</h3>
          <AIUsageTable data={usageData} />
        </div>
      </div>
    </div>
  )
}

