import { getSupabaseClient } from '../services/supabase-client.js'

export interface LearnedPattern {
  id: string
  user_id: string
  pattern_type: string
  regex_pattern: string
  example_input: string
  parsed_output: any
  confidence_score: number
  usage_count: number
  success_count: number
  failure_count: number
  last_used_at: string | null
  created_at: string
  is_active: boolean
}

export interface PaymentMethodPreference {
  id: string
  user_id: string
  category_id: string
  payment_method: string
  usage_count: number
  last_used_at: string
  created_at: string
}

export interface ParsedIntent {
  action: string
  confidence: number
  entities: {
    amount?: number
    category?: string
    description?: string
    date?: string
    payment_method?: string
    transactions?: Array<{
      amount: number
      category: string
      description: string
      date?: string
      payment_method?: string
    }>
  }
}

/**
 * Load user's learned patterns ordered by usage (most used first)
 */
export async function getUserPatterns(userId: string): Promise<LearnedPattern[]> {
  const supabase = getSupabaseClient()
  
  const { data, error } = await supabase
    .from('learned_patterns')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('usage_count', { ascending: false })
    
  if (error) {
    console.error('Error loading user patterns:', error)
    return []
  }
  
  return data || []
}

/**
 * Try to match message against learned patterns
 */
export function matchLearnedPattern(
  message: string, 
  patterns: LearnedPattern[]
): ParsedIntent | null {
  for (const pattern of patterns) {
    try {
      const regex = new RegExp(pattern.regex_pattern, 'i')
      const match = message.match(regex)
      
      if (match) {
        // Update usage stats
        updatePatternUsage(pattern.id)
        
        // Extract entities from regex groups
        const entities = { ...pattern.parsed_output }
        
        // Replace placeholders with actual matched values
        if (match.groups) {
          Object.keys(match.groups).forEach(key => {
            if (match.groups![key]) {
              entities[key] = match.groups![key]
            }
          })
        }
        
        // Return parsed intent
        return {
          action: pattern.pattern_type,
          confidence: pattern.confidence_score,
          entities
        }
      }
    } catch (error) {
      console.error(`Error matching pattern ${pattern.id}:`, error)
      // Mark pattern as failed
      updatePatternFailure(pattern.id)
    }
  }
  return null
}

/**
 * Update pattern usage statistics
 */
export async function updatePatternUsage(patternId: string): Promise<void> {
  const supabase = getSupabaseClient()
  
  // Get current usage count and increment
  const { data: current } = await supabase
    .from('learned_patterns')
    .select('usage_count')
    .eq('id', patternId)
    .single()
    
  if (current) {
    await supabase
      .from('learned_patterns')
      .update({ 
        usage_count: current.usage_count + 1,
        last_used_at: new Date().toISOString()
      })
      .eq('id', patternId)
  }
}

/**
 * Update pattern success statistics
 */
export async function updatePatternSuccess(patternId: string): Promise<void> {
  const supabase = getSupabaseClient()
  
  // Get current success count and increment
  const { data: current } = await supabase
    .from('learned_patterns')
    .select('success_count')
    .eq('id', patternId)
    .single()
    
  if (current) {
    await supabase
      .from('learned_patterns')
      .update({ 
        success_count: current.success_count + 1
      })
      .eq('id', patternId)
  }
}

/**
 * Update pattern failure statistics
 */
export async function updatePatternFailure(patternId: string): Promise<void> {
  const supabase = getSupabaseClient()
  
  // Get current failure count and increment
  const { data: current } = await supabase
    .from('learned_patterns')
    .select('failure_count')
    .eq('id', patternId)
    .single()
    
  if (current) {
    await supabase
      .from('learned_patterns')
      .update({ 
        failure_count: current.failure_count + 1
      })
      .eq('id', patternId)
  }
}

/**
 * Save a new learned pattern
 */
export async function savePattern(
  userId: string,
  patternType: string,
  regexPattern: string,
  exampleInput: string,
  parsedOutput: any,
  confidenceScore: number = 1.0
): Promise<string | null> {
  const supabase = getSupabaseClient()
  
  const { data, error } = await supabase
    .from('learned_patterns')
    .insert({
      user_id: userId,
      pattern_type: patternType,
      regex_pattern: regexPattern,
      example_input: exampleInput,
      parsed_output: parsedOutput,
      confidence_score: confidenceScore
    })
    .select('id')
    .single()
    
  if (error) {
    console.error('Error saving pattern:', error)
    return null
  }
  
  return data.id
}

/**
 * Get user's payment method preferences for a category
 */
export async function getPaymentMethodPreferences(
  userId: string, 
  categoryId: string
): Promise<PaymentMethodPreference[]> {
  const supabase = getSupabaseClient()
  
  const { data, error } = await supabase
    .from('payment_method_preferences')
    .select('*')
    .eq('user_id', userId)
    .eq('category_id', categoryId)
    .order('usage_count', { ascending: false })
    
  if (error) {
    console.error('Error loading payment preferences:', error)
    return []
  }
  
  return data || []
}

/**
 * Update payment method preference
 */
export async function updatePaymentMethodPreference(
  userId: string,
  categoryId: string,
  paymentMethod: string
): Promise<void> {
  const supabase = getSupabaseClient()
  
  // Try to update existing preference
  const { data: existing } = await supabase
    .from('payment_method_preferences')
    .select('id')
    .eq('user_id', userId)
    .eq('category_id', categoryId)
    .eq('payment_method', paymentMethod)
    .single()
    
  if (existing) {
    // Update existing
    // Get current usage count and increment
    const { data: currentUsage } = await supabase
      .from('payment_method_preferences')
      .select('usage_count')
      .eq('id', existing.id)
      .single()
      
    if (currentUsage) {
      await supabase
        .from('payment_method_preferences')
        .update({
          usage_count: currentUsage.usage_count + 1,
          last_used_at: new Date().toISOString()
        })
        .eq('id', existing.id)
    }
  } else {
    // Create new
    await supabase
      .from('payment_method_preferences')
      .insert({
        user_id: userId,
        category_id: categoryId,
        payment_method: paymentMethod,
        usage_count: 1,
        last_used_at: new Date().toISOString()
      })
  }
}

/**
 * Get suggested payment method for a category
 */
export async function getSuggestedPaymentMethod(
  userId: string,
  categoryId: string
): Promise<string | null> {
  const preferences = await getPaymentMethodPreferences(userId, categoryId)
  
  if (preferences.length > 0) {
    return preferences[0].payment_method
  }
  
  return null
}

/**
 * Find duplicate patterns (for cleanup)
 */
export async function findDuplicatePatterns(): Promise<LearnedPattern[]> {
  const supabase = getSupabaseClient()
  
  // This is a simplified approach - in production you might want more sophisticated similarity detection
  const { data, error } = await supabase
    .from('learned_patterns')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    
  if (error || !data) return []
  
  const duplicates: LearnedPattern[] = []
  const seen = new Set<string>()
  
  for (const pattern of data) {
    const normalized = pattern.regex_pattern.toLowerCase().replace(/\s+/g, '')
    if (seen.has(normalized)) {
      duplicates.push(pattern)
    } else {
      seen.add(normalized)
    }
  }
  
  return duplicates
}

/**
 * Archive low-usage patterns
 */
export async function archiveLowUsagePatterns(): Promise<number> {
  const supabase = getSupabaseClient()
  
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  
  const { data, error } = await supabase
    .from('learned_patterns')
    .update({ is_active: false })
    .lt('usage_count', 5)
    .lt('created_at', thirtyDaysAgo)
    .eq('is_active', true)
    .select('id')
    
  if (error) {
    console.error('Error archiving low-usage patterns:', error)
    return 0
  }
  
  return data?.length || 0
}

/**
 * Delete failed patterns
 */
export async function deleteFailedPatterns(): Promise<number> {
  const supabase = getSupabaseClient()
  
  const { data: patterns, error: fetchError } = await supabase
    .from('learned_patterns')
    .select('*')
    .gt('usage_count', 10)
    .eq('is_active', true)
    
  if (fetchError || !patterns) return 0
  
  let deletedCount = 0
  
  for (const pattern of patterns) {
    const successRate = pattern.success_count / pattern.usage_count
    if (successRate < 0.3) {
      const { error } = await supabase
        .from('learned_patterns')
        .delete()
        .eq('id', pattern.id)
        
      if (!error) {
        deletedCount++
      }
    }
  }
  
  return deletedCount
}
