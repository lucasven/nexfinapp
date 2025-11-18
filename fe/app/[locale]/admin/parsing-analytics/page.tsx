import { Suspense } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  getOCRMatchingStats,
  getNLPStrategyPerformance,
  getCacheHitRateStats,
  getMerchantRecognitionStats,
  getPatternLearningQuality,
  getOCRProcessingTrend,
  getStrategyDistribution,
  getRecentOCRErrors,
  getIntentDistribution,
  getEntityExtractionPatterns,
  getCommandCoverage,
  getRetryPatterns,
} from "@/lib/actions/admin"
import { OCRSuccessRateChart } from "@/components/admin/ocr-success-rate-chart"
import { StrategyPerformanceChart } from "@/components/admin/strategy-performance-chart"
import { StrategyDistributionPieChart } from "@/components/admin/strategy-distribution-pie-chart"
import { MerchantRecognitionBarChart } from "@/components/admin/merchant-recognition-bar-chart"
import { CacheHitRateChart } from "@/components/admin/cache-hit-rate-chart"
import { PatternQualityTable } from "@/components/admin/pattern-quality-table"
import { IntentDistributionChart } from "@/components/admin/intent-distribution-chart"
import { CommandCoverageHeatmap } from "@/components/admin/command-coverage-heatmap"
import { RetryPatternsTable } from "@/components/admin/retry-patterns-table"
import { EntityExtractionTable } from "@/components/admin/entity-extraction-table"

// Overview Tab Component
async function OverviewTab() {
  const [ocrStats, strategyPerf, cacheStats, strategyDist, ocrTrend] = await Promise.all([
    getOCRMatchingStats(),
    getNLPStrategyPerformance(),
    getCacheHitRateStats(),
    getStrategyDistribution(),
    getOCRProcessingTrend(),
  ])

  // Get top 5 strategies for overview
  const topStrategies = strategyPerf.slice(0, 5)

  return (
    <div className="space-y-6">
      {/* Stat Cards - Row 1: OCR Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">OCR Messages</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{ocrStats.totalOCRMessages}</div>
            <p className="text-xs text-muted-foreground">
              Success Rate: {ocrStats.ocrSuccessRate}%
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">OCR Confidence</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{ocrStats.avgOCRConfidence}%</div>
            <p className="text-xs text-muted-foreground">
              Average confidence score
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Processing Time</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{ocrStats.avgOCRProcessingTime}ms</div>
            <p className="text-xs text-muted-foreground">
              Average OCR processing
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cache Hit Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{cacheStats.cacheHitRate}%</div>
            <p className="text-xs text-muted-foreground">
              ${cacheStats.estimatedSavings.toFixed(2)} saved
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Section - Row 1 */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* OCR Success Rate Trend */}
        <Card>
          <CardHeader>
            <CardTitle>OCR Success Rate Trend</CardTitle>
            <CardDescription>Last 30 days</CardDescription>
          </CardHeader>
          <CardContent>
            {ocrTrend.length > 0 ? (
              <OCRSuccessRateChart data={ocrTrend} />
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">
                No OCR trend data available
              </p>
            )}
          </CardContent>
        </Card>

        {/* Strategy Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Strategy Distribution</CardTitle>
            <CardDescription>Message count by parsing strategy</CardDescription>
          </CardHeader>
          <CardContent>
            {strategyDist.length > 0 ? (
              <StrategyDistributionPieChart data={strategyDist} />
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">
                No strategy data available
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Charts Section - Row 2 */}
      <div className="grid gap-6 md:grid-cols-1">
        {/* Top Strategies Performance */}
        <Card>
          <CardHeader>
            <CardTitle>Top 5 Strategy Performance</CardTitle>
            <CardDescription>Success rate and confidence by parsing strategy</CardDescription>
          </CardHeader>
          <CardContent>
            {topStrategies.length > 0 ? (
              <StrategyPerformanceChart data={topStrategies} />
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">
                No strategy performance data available
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// OCR Performance Tab
async function OCRPerformanceTab() {
  const [ocrStats, merchantStats, ocrErrors] = await Promise.all([
    getOCRMatchingStats(),
    getMerchantRecognitionStats(),
    getRecentOCRErrors(10),
  ])

  return (
    <div className="space-y-6">
      {/* OCR Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Processed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{ocrStats.totalOCRMessages}</div>
            <p className="text-xs text-muted-foreground">
              {ocrStats.successfulOCR} successful
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{ocrStats.ocrSuccessRate}%</div>
            <p className="text-xs text-muted-foreground">
              OCR extraction success
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Confidence</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{ocrStats.avgOCRConfidence}%</div>
            <p className="text-xs text-muted-foreground">
              {ocrStats.avgOCRProcessingTime}ms avg processing
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Merchant Recognition */}
      <Card>
        <CardHeader>
          <CardTitle>Top Recognized Merchants</CardTitle>
          <CardDescription>
            {merchantStats.totalMerchants} total merchants, {merchantStats.totalMerchantMatches} total matches
          </CardDescription>
        </CardHeader>
        <CardContent>
          {merchantStats.topMerchants.length > 0 ? (
            <MerchantRecognitionBarChart data={merchantStats.topMerchants} />
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">
              No merchant recognition data available
            </p>
          )}
        </CardContent>
      </Card>

      {/* Recent Errors */}
      {ocrErrors.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recent OCR Errors</CardTitle>
            <CardDescription>Last 10 OCR processing failures</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {ocrErrors.map((error, index) => (
                <div key={index} className="border-l-2 border-red-500 pl-3 py-2">
                  <p className="text-sm font-medium text-red-600">{error.errorMessage}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(error.createdAt).toLocaleString()} • {error.processingTime}ms
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// NLP Strategy Tab
async function NLPStrategyTab() {
  const [strategyPerf, cacheStats] = await Promise.all([
    getNLPStrategyPerformance(),
    getCacheHitRateStats(),
  ])

  return (
    <div className="space-y-6">
      {/* Cache Efficiency */}
      <Card>
        <CardHeader>
          <CardTitle>Cache Efficiency</CardTitle>
          <CardDescription>
            Semantic cache performance and cost savings
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CacheHitRateChart
            cacheHitRate={cacheStats.cacheHitRate}
            totalCacheHits={cacheStats.totalCacheHits}
            totalLLMCalls={cacheStats.totalLLMCalls}
            estimatedSavings={cacheStats.estimatedSavings}
          />
        </CardContent>
      </Card>

      {/* All Strategies Performance */}
      <Card>
        <CardHeader>
          <CardTitle>Strategy Performance Breakdown</CardTitle>
          <CardDescription>Success rate and confidence by parsing strategy</CardDescription>
        </CardHeader>
        <CardContent>
          {strategyPerf.length > 0 ? (
            <StrategyPerformanceChart data={strategyPerf} />
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">
              No strategy performance data available
            </p>
          )}
        </CardContent>
      </Card>

      {/* Top Cached Patterns */}
      {cacheStats.topCachedPatterns.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Most Cached Messages</CardTitle>
            <CardDescription>Top 10 frequently cached message patterns</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {cacheStats.topCachedPatterns.map((pattern, index) => (
                <div key={index} className="flex justify-between items-center border-b pb-2">
                  <p className="text-sm font-mono flex-1 truncate">{pattern.message}</p>
                  <span className="text-sm font-bold text-primary ml-4">{pattern.hitCount} hits</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// Pattern Learning Tab
async function PatternLearningTab() {
  const patternQuality = await getPatternLearningQuality()

  return (
    <div className="space-y-6">
      {/* Pattern Type Breakdown */}
      <div className="grid gap-4 md:grid-cols-4">
        {patternQuality.typeBreakdown.map((type) => (
          <Card key={type.patternType}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium capitalize">{type.patternType}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{type.patternCount}</div>
              <p className="text-xs text-muted-foreground">
                {type.accuracy}% accuracy • {type.totalUsage} uses
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Pattern Quality Table */}
      <Card>
        <CardHeader>
          <CardTitle>Top 20 Learned Patterns</CardTitle>
          <CardDescription>
            {patternQuality.totalPatterns} total patterns tracked for accuracy
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PatternQualityTable patterns={patternQuality.patterns} />
        </CardContent>
      </Card>
    </div>
  )
}

// Intent Analysis Tab
async function IntentAnalysisTab() {
  const [intentDist, entityPatterns, commandCoverage, retryPatterns] = await Promise.all([
    getIntentDistribution(),
    getEntityExtractionPatterns(),
    getCommandCoverage(),
    getRetryPatterns(),
  ])

  const totalIntents = intentDist.reduce((sum, i) => sum + i.total, 0)
  const unusedCommands = commandCoverage.filter(c => !c.isUsed).length

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Intents</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalIntents}</div>
            <p className="text-xs text-muted-foreground">
              {intentDist.length} different types
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Command Coverage</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {commandCoverage.filter(c => c.isUsed).length}/{commandCoverage.length}
            </div>
            <p className="text-xs text-muted-foreground">
              {unusedCommands} unused commands
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Retry Patterns</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{retryPatterns.length}</div>
            <p className="text-xs text-muted-foreground">
              Users rephrased commands
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Entity Types</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {new Set(entityPatterns.map(e => e.entityType)).size}
            </div>
            <p className="text-xs text-muted-foreground">
              Extracted from messages
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Intent Distribution */}
      <Card>
        <CardHeader>
          <CardTitle>Intent Distribution</CardTitle>
          <CardDescription>Top 15 commands by usage (color-coded by success rate)</CardDescription>
        </CardHeader>
        <CardContent>
          {intentDist.length > 0 ? (
            <IntentDistributionChart data={intentDist} />
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">
              No intent data available yet
            </p>
          )}
        </CardContent>
      </Card>

      {/* Command Coverage Heatmap */}
      <Card>
        <CardHeader>
          <CardTitle>Command Coverage Heatmap</CardTitle>
          <CardDescription>
            All 26 available commands organized by category
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CommandCoverageHeatmap data={commandCoverage} />
        </CardContent>
      </Card>

      {/* Entity Extraction Patterns */}
      {entityPatterns.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Entity Extraction Patterns</CardTitle>
            <CardDescription>
              Which entities are being extracted from user messages
            </CardDescription>
          </CardHeader>
          <CardContent>
            <EntityExtractionTable data={entityPatterns} />
          </CardContent>
        </Card>
      )}

      {/* Retry/Rephrase Patterns */}
      {retryPatterns.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Retry & Rephrase Patterns</CardTitle>
            <CardDescription>
              Messages that failed then succeeded within 2 minutes
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RetryPatternsTable patterns={retryPatterns} />
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// Loading skeletons
function StatsLoadingSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {[...Array(4)].map((_, i) => (
        <Card key={i}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <Skeleton className="h-4 w-24" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-8 w-16 mb-2" />
            <Skeleton className="h-3 w-32" />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function TableLoadingSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-64 mt-2" />
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

// Main Page Component
export default function ParsingAnalyticsPage() {
  return (
    <div className="container mx-auto py-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Parsing Analytics</h1>
        <p className="text-muted-foreground">
          Intent classification, OCR extraction, NLP strategy performance, and pattern learning insights
        </p>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="intents">Intent Analysis</TabsTrigger>
          <TabsTrigger value="ocr">OCR Performance</TabsTrigger>
          <TabsTrigger value="nlp">NLP Strategy</TabsTrigger>
          <TabsTrigger value="patterns">Pattern Learning</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <Suspense fallback={<StatsLoadingSkeleton />}>
            <OverviewTab />
          </Suspense>
        </TabsContent>

        <TabsContent value="intents">
          <Suspense fallback={<TableLoadingSkeleton />}>
            <IntentAnalysisTab />
          </Suspense>
        </TabsContent>

        <TabsContent value="ocr">
          <Suspense fallback={<TableLoadingSkeleton />}>
            <OCRPerformanceTab />
          </Suspense>
        </TabsContent>

        <TabsContent value="nlp">
          <Suspense fallback={<TableLoadingSkeleton />}>
            <NLPStrategyTab />
          </Suspense>
        </TabsContent>

        <TabsContent value="patterns">
          <Suspense fallback={<TableLoadingSkeleton />}>
            <PatternLearningTab />
          </Suspense>
        </TabsContent>
      </Tabs>
    </div>
  )
}
