import { Suspense } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  getCategoryMatchingStats,
  getCorrectionsByCategory,
  getCorrectionFlows,
  getLowConfidenceMatches,
  getMerchantMappings,
  getCategorySynonyms,
  getCorrectionRateTrend,
  getMatchTypeDistribution,
} from "@/lib/actions/admin"
import { CorrectionRateChart } from "@/components/admin/correction-rate-chart"
import { CategoryCorrectionsBarChart } from "@/components/admin/category-corrections-bar-chart"
import { MatchTypePieChart } from "@/components/admin/match-type-pie-chart"
import { MerchantCoverageChart } from "@/components/admin/merchant-coverage-chart"
import { LowConfidenceMatchesTable } from "@/components/admin/low-confidence-matches-table"
import { MerchantMappingTable } from "@/components/admin/merchant-mapping-table"
import { SynonymManagement } from "@/components/admin/synonym-management"
import { getSupabaseServerClient } from "@/lib/supabase/server"

// Overview Tab Component
async function OverviewTab() {
  const [stats, correctionsByCategory, trendData, matchTypeData] = await Promise.all([
    getCategoryMatchingStats(),
    getCorrectionsByCategory(),
    getCorrectionRateTrend(),
    getMatchTypeDistribution(),
  ])

  return (
    <div className="space-y-6">
      {/* Stat Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Corrections</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalCorrections}</div>
            <p className="text-xs text-muted-foreground">
              Correction Rate: {stats.correctionRate}%
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Merchant Coverage</CardTitle>
          </CardHeader>
          <CardContent>
            <MerchantCoverageChart merchantCoverage={stats.merchantCoverage} />
            <p className="text-xs text-muted-foreground mt-2 text-center">
              {stats.totalMerchantMappings} merchant mappings
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Category Synonyms</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalSynonyms}</div>
            <p className="text-xs text-muted-foreground">
              Total keyword mappings
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Section - Row 1 */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Correction Rate Trend */}
        <Card>
          <CardHeader>
            <CardTitle>Correction Rate Trend</CardTitle>
            <CardDescription>Last 30 days</CardDescription>
          </CardHeader>
          <CardContent>
            {trendData.length > 0 ? (
              <CorrectionRateChart data={trendData} />
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">
                No trend data available
              </p>
            )}
          </CardContent>
        </Card>

        {/* Match Type Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Match Type Distribution</CardTitle>
            <CardDescription>How categories are being matched</CardDescription>
          </CardHeader>
          <CardContent>
            {matchTypeData.length > 0 ? (
              <MatchTypePieChart data={matchTypeData} />
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">
                No match type data available
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Charts Section - Row 2 */}
      <div className="grid gap-6 md:grid-cols-1">
        {/* Most Corrected Categories - Now with Bar Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Most Corrected Categories</CardTitle>
            <CardDescription>Top 10 categories requiring manual correction</CardDescription>
          </CardHeader>
          <CardContent>
            {correctionsByCategory.length > 0 ? (
              <CategoryCorrectionsBarChart data={correctionsByCategory} />
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">
                No correction data available
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// Low Confidence Matches Tab
async function LowConfidenceTab() {
  const supabase = await getSupabaseServerClient()

  const [matches, categoriesResult] = await Promise.all([
    getLowConfidenceMatches(50, 0),
    supabase
      .from("categories")
      .select("id, name")
      .is("user_id", null)
      .eq("type", "expense")
      .order("name")
  ])

  const categories = categoriesResult.data || []

  return (
    <Card>
      <CardHeader>
        <CardTitle>Low Confidence Matches</CardTitle>
        <CardDescription>
          Transactions that may need category review - Approve correct matches or select the right category
        </CardDescription>
      </CardHeader>
      <CardContent>
        <LowConfidenceMatchesTable matches={matches} categories={categories} />
      </CardContent>
    </Card>
  )
}

// Merchant Mappings Tab
async function MerchantMappingsTab() {
  const supabase = await getSupabaseServerClient()

  const [mappings, categoriesResult] = await Promise.all([
    getMerchantMappings(),
    supabase
      .from("categories")
      .select("id, name")
      .is("user_id", null)
      .eq("type", "expense")
      .order("name")
  ])

  const categories = categoriesResult.data || []

  return (
    <Card>
      <CardHeader>
        <CardTitle>Merchant Category Mappings</CardTitle>
        <CardDescription>
          Manage merchant-to-category mappings for automatic matching
        </CardDescription>
      </CardHeader>
      <CardContent>
        <MerchantMappingTable mappings={mappings} categories={categories} />
      </CardContent>
    </Card>
  )
}

// Synonyms Tab
async function SynonymsTab() {
  const supabase = await getSupabaseServerClient()

  const [synonyms, categoriesResult] = await Promise.all([
    getCategorySynonyms(),
    supabase
      .from("categories")
      .select("id, name")
      .is("user_id", null)
      .order("name")
  ])

  const categories = categoriesResult.data || []

  return (
    <Card>
      <CardHeader>
        <CardTitle>Category Synonyms</CardTitle>
        <CardDescription>
          Manage alternative keywords and names for category matching
        </CardDescription>
      </CardHeader>
      <CardContent>
        <SynonymManagement synonyms={synonyms} categories={categories} />
      </CardContent>
    </Card>
  )
}

// Loading skeletons
function StatsLoadingSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {[1, 2, 3].map((i) => (
        <Card key={i}>
          <CardHeader>
            <Skeleton className="h-4 w-32" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-8 w-24 mb-2" />
            <Skeleton className="h-3 w-40" />
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
        <Skeleton className="h-6 w-48 mb-2" />
        <Skeleton className="h-4 w-64" />
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

// Main page component
export default function CategoryAnalyticsPage() {
  return (
    <div className="container mx-auto py-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Category Analytics</h1>
        <p className="text-muted-foreground">
          Monitor and improve category matching accuracy
        </p>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="low-confidence">Low Confidence</TabsTrigger>
          <TabsTrigger value="merchants">Merchants</TabsTrigger>
          <TabsTrigger value="synonyms">Synonyms</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <Suspense fallback={<StatsLoadingSkeleton />}>
            <OverviewTab />
          </Suspense>
        </TabsContent>

        <TabsContent value="low-confidence">
          <Suspense fallback={<TableLoadingSkeleton />}>
            <LowConfidenceTab />
          </Suspense>
        </TabsContent>

        <TabsContent value="merchants">
          <Suspense fallback={<TableLoadingSkeleton />}>
            <MerchantMappingsTab />
          </Suspense>
        </TabsContent>

        <TabsContent value="synonyms">
          <Suspense fallback={<TableLoadingSkeleton />}>
            <SynonymsTab />
          </Suspense>
        </TabsContent>
      </Tabs>
    </div>
  )
}
