#!/usr/bin/env ts-node
import { getSupabaseClient } from '../src/services/supabase-client'
import { 
  findDuplicatePatterns, 
  archiveLowUsagePatterns, 
  deleteFailedPatterns 
} from '../src/nlp/pattern-storage'

interface CleanupStats {
  activePatterns: number
  newToday: number
  archived: number
  deleted: number
  consolidated: number
  topPerformers: Array<{
    pattern: string
    uses: number
    successRate: number
  }>
  needsReview: Array<{
    pattern: string
    uses: number
    successRate: number
  }>
}

async function cleanupParsers(): Promise<void> {
  const supabase = getSupabaseClient()
  
  console.log('🧹 Starting parser cleanup...')
  console.log(`📅 Date: ${new Date().toLocaleDateString('pt-BR')}`)
  
  try {
    // 1. Remove duplicates (>95% similarity)
    console.log('\n1️⃣ Checking for duplicate patterns...')
    const duplicates = await findDuplicatePatterns()
    let archivedDuplicates = 0
    
    for (const dup of duplicates) {
      const { error } = await supabase
        .from('learned_patterns')
        .update({ is_active: false })
        .eq('id', dup.id)
        
      if (!error) {
        archivedDuplicates++
      }
    }
    console.log(`✅ Archived ${archivedDuplicates} duplicate patterns`)

    // 2. Archive low-usage patterns (< 5 uses in 30 days)
    console.log('\n2️⃣ Archiving low-usage patterns...')
    const archivedCount = await archiveLowUsagePatterns()
    console.log(`📦 Archived ${archivedCount} low-usage patterns`)

    // 3. Remove failed patterns (success rate < 30% and usage > 10)
    console.log('\n3️⃣ Removing failed patterns...')
    const deletedCount = await deleteFailedPatterns()
    console.log(`🗑️  Deleted ${deletedCount} low-performing patterns`)

    // 4. Consolidate similar patterns
    console.log('\n4️⃣ Consolidating similar patterns...')
    const consolidatedCount = await consolidateSimilarPatterns()
    console.log(`🔄 Consolidated ${consolidatedCount} pattern groups`)

    // 5. Generate and display report
    console.log('\n5️⃣ Generating cleanup report...')
    const stats = await getCleanupStats()
    displayCleanupReport(stats)

    console.log('\n✅ Cleanup completed successfully!')
    
  } catch (error) {
    console.error('❌ Error during cleanup:', error)
    process.exit(1)
  }
}

/**
 * Consolidate similar patterns by merging them
 */
async function consolidateSimilarPatterns(): Promise<number> {
  const supabase = getSupabaseClient()
  
  // Get all active patterns
  const { data: patterns, error } = await supabase
    .from('learned_patterns')
    .select('*')
    .eq('is_active', true)
    .order('usage_count', { ascending: false })
    
  if (error || !patterns) return 0
  
  const consolidated = new Set<string>()
  let consolidatedCount = 0
  
  for (let i = 0; i < patterns.length; i++) {
    if (consolidated.has(patterns[i].id)) continue
    
    const currentPattern = patterns[i]
    const similarPatterns: any[] = [currentPattern]
    
    // Find similar patterns
    for (let j = i + 1; j < patterns.length; j++) {
      if (consolidated.has(patterns[j].id)) continue
      
      if (arePatternsSimilar(currentPattern, patterns[j])) {
        similarPatterns.push(patterns[j])
        consolidated.add(patterns[j].id)
      }
    }
    
    // If we found similar patterns, consolidate them
    if (similarPatterns.length > 1) {
      await consolidatePatternGroup(similarPatterns)
      consolidatedCount += similarPatterns.length - 1
    }
  }
  
  return consolidatedCount
}

/**
 * Check if two patterns are similar enough to consolidate
 */
function arePatternsSimilar(pattern1: any, pattern2: any): boolean {
  // Simple similarity check - in production you might want more sophisticated logic
  const regex1 = pattern1.regex_pattern.toLowerCase().replace(/\s+/g, '')
  const regex2 = pattern2.regex_pattern.toLowerCase().replace(/\s+/g, '')
  
  // Check if patterns are very similar (simple approach)
  const similarity = calculateSimilarity(regex1, regex2)
  return similarity > 0.8
}

/**
 * Calculate string similarity using Levenshtein distance
 */
function calculateSimilarity(str1: string, str2: string): number {
  const longer = str1.length > str2.length ? str1 : str2
  const shorter = str1.length > str2.length ? str2 : str1
  
  if (longer.length === 0) return 1.0
  
  const distance = levenshteinDistance(longer, shorter)
  return (longer.length - distance) / longer.length
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(str1: string, str2: string): number {
  const matrix = []
  
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i]
  }
  
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j
  }
  
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        )
      }
    }
  }
  
  return matrix[str2.length][str1.length]
}

/**
 * Consolidate a group of similar patterns
 */
async function consolidatePatternGroup(patterns: any[]): Promise<void> {
  const supabase = getSupabaseClient()
  
  // Keep the most used pattern, archive the others
  const sortedPatterns = patterns.sort((a, b) => b.usage_count - a.usage_count)
  const keepPattern = sortedPatterns[0]
  const archivePatterns = sortedPatterns.slice(1)
  
  // Update the kept pattern with combined stats
  const totalUsage = patterns.reduce((sum, p) => sum + p.usage_count, 0)
  const totalSuccess = patterns.reduce((sum, p) => sum + p.success_count, 0)
  
  await supabase
    .from('learned_patterns')
    .update({
      usage_count: totalUsage,
      success_count: totalSuccess,
      confidence_score: totalSuccess / totalUsage
    })
    .eq('id', keepPattern.id)
  
  // Archive the other patterns
  for (const pattern of archivePatterns) {
    await supabase
      .from('learned_patterns')
      .update({ is_active: false })
      .eq('id', pattern.id)
  }
}

/**
 * Get cleanup statistics
 */
async function getCleanupStats(): Promise<CleanupStats> {
  const supabase = getSupabaseClient()
  
  // Get active patterns count
  const { count: activePatterns } = await supabase
    .from('learned_patterns')
    .select('*', { count: 'exact', head: true })
    .eq('is_active', true)
  
  // Get patterns created today
  const today = new Date().toISOString().split('T')[0]
  const { count: newToday } = await supabase
    .from('learned_patterns')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', today)
  
  // Get top performers
  const { data: topPerformers } = await supabase
    .from('learned_patterns')
    .select('regex_pattern, usage_count, success_count')
    .eq('is_active', true)
    .gt('usage_count', 0)
    .order('usage_count', { ascending: false })
    .limit(5)
  
  // Get patterns that need review
  const { data: needsReview } = await supabase
    .from('learned_patterns')
    .select('regex_pattern, usage_count, success_count')
    .eq('is_active', true)
    .gt('usage_count', 5)
    .lt('success_count', 3)
    .order('usage_count', { ascending: false })
    .limit(3)
  
  return {
    activePatterns: activePatterns || 0,
    newToday: newToday || 0,
    archived: 0, // This would be calculated from the cleanup operations
    deleted: 0,  // This would be calculated from the cleanup operations
    consolidated: 0, // This would be calculated from the cleanup operations
    topPerformers: (topPerformers || []).map(p => ({
      pattern: p.regex_pattern.substring(0, 50) + '...',
      uses: p.usage_count,
      successRate: Math.round((p.success_count / p.usage_count) * 100)
    })),
    needsReview: (needsReview || []).map(p => ({
      pattern: p.regex_pattern.substring(0, 50) + '...',
      uses: p.usage_count,
      successRate: Math.round((p.success_count / p.usage_count) * 100)
    }))
  }
}

/**
 * Display cleanup report
 */
function displayCleanupReport(stats: CleanupStats): void {
  console.log('\n📊 ═══════════════════════════════════════════════')
  console.log('   CLEANUP REPORT')
  console.log('   ═══════════════════════════════════════════════')
  
  console.log(`\n📈 Active Patterns: ${stats.activePatterns}`)
  console.log(`🆕 New Today: ${stats.newToday}`)
  console.log(`📦 Archived: ${stats.archived}`)
  console.log(`🗑️  Deleted: ${stats.deleted}`)
  console.log(`🔄 Consolidated: ${stats.consolidated}`)
  
  if (stats.topPerformers.length > 0) {
    console.log('\n🏆 Top Performers:')
    stats.topPerformers.forEach((performer, index) => {
      console.log(`   ${index + 1}. "${performer.pattern}"`)
      console.log(`      ${performer.uses} uses, ${performer.successRate}% success`)
    })
  }
  
  if (stats.needsReview.length > 0) {
    console.log('\n⚠️  Needs Review:')
    stats.needsReview.forEach((pattern, index) => {
      console.log(`   ${index + 1}. "${pattern.pattern}"`)
      console.log(`      ${pattern.uses} uses, ${pattern.successRate}% success`)
    })
  }
  
  console.log('\n═══════════════════════════════════════════════')
}

// Run cleanup if this script is executed directly
if (require.main === module) {
  cleanupParsers()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Cleanup failed:', error)
      process.exit(1)
    })
}

export { cleanupParsers, getCleanupStats }
