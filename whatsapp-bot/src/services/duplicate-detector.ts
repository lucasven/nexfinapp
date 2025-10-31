import { getSupabaseClient } from './supabase-client'
import { ExpenseData } from '../types'

interface DuplicateCheck {
  isDuplicate: boolean
  confidence: number
  similarTransaction?: any
  reason?: string
}

interface DuplicateConfig {
  timeWindowHours: number
  amountTolerancePercent: number
  descriptionSimilarityThreshold: number
  autoBlockThreshold: number
}

const DEFAULT_CONFIG: DuplicateConfig = {
  timeWindowHours: 24, // Check last 24 hours
  amountTolerancePercent: 5, // 5% tolerance for amount differences
  descriptionSimilarityThreshold: 0.8, // 80% similarity for descriptions
  autoBlockThreshold: 0.95 // Auto-block if 95%+ confidence
}

/**
 * Check if a transaction is a potential duplicate
 */
export async function checkForDuplicate(
  userId: string,
  expenseData: ExpenseData,
  config: Partial<DuplicateConfig> = {}
): Promise<DuplicateCheck> {
  const finalConfig = { ...DEFAULT_CONFIG, ...config }
  const supabase = getSupabaseClient()

  // Calculate time window
  const timeWindow = new Date()
  timeWindow.setHours(timeWindow.getHours() - finalConfig.timeWindowHours)

  // Get recent transactions
  const { data: recentTransactions, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .eq('type', expenseData.type || 'expense')
    .gte('created_at', timeWindow.toISOString())
    .order('created_at', { ascending: false })
    .limit(50) // Check last 50 transactions

  if (error) {
    console.error('Error fetching recent transactions:', error)
    return { isDuplicate: false, confidence: 0 }
  }

  if (!recentTransactions || recentTransactions.length === 0) {
    return { isDuplicate: false, confidence: 0 }
  }

  // Check each recent transaction for similarity
  for (const transaction of recentTransactions) {
    const similarity = calculateSimilarity(expenseData, transaction, finalConfig)
    
    if (similarity.confidence >= finalConfig.autoBlockThreshold) {
      return {
        isDuplicate: true,
        confidence: similarity.confidence,
        similarTransaction: transaction,
        reason: `Transação muito similar encontrada: ${formatTransaction(transaction)}`
      }
    }
    
    if (similarity.confidence >= 0.7) {
      return {
        isDuplicate: true,
        confidence: similarity.confidence,
        similarTransaction: transaction,
        reason: `Possível duplicata: ${formatTransaction(transaction)}`
      }
    }
  }

  return { isDuplicate: false, confidence: 0 }
}

/**
 * Calculate similarity between two transactions
 */
function calculateSimilarity(
  newExpense: ExpenseData,
  existingTransaction: any,
  config: DuplicateConfig
): { confidence: number; factors: string[] } {
  const factors: string[] = []
  let totalScore = 0
  let maxScore = 0

  // 1. Amount similarity (40% weight)
  const amountScore = calculateAmountSimilarity(
    newExpense.amount,
    existingTransaction.amount,
    config.amountTolerancePercent
  )
  totalScore += amountScore * 0.4
  maxScore += 0.4
  if (amountScore > 0.8) factors.push('valor similar')

  // 2. Description similarity (30% weight)
  const descriptionScore = calculateDescriptionSimilarity(
    newExpense.description || '',
    existingTransaction.description || '',
    config.descriptionSimilarityThreshold
  )
  totalScore += descriptionScore * 0.3
  maxScore += 0.3
  if (descriptionScore > 0.8) factors.push('descrição similar')

  // 3. Category similarity (20% weight) - simplified for now
  const categoryScore = newExpense.category && existingTransaction.category_id ? 
    (newExpense.category.toLowerCase() === existingTransaction.category_id.toLowerCase() ? 1.0 : 0) : 0
  totalScore += categoryScore * 0.2
  maxScore += 0.2
  if (categoryScore > 0.8) factors.push('categoria similar')

  // 4. Payment method similarity (10% weight)
  const paymentMethodScore = calculatePaymentMethodSimilarity(
    newExpense.paymentMethod,
    existingTransaction.payment_method
  )
  totalScore += paymentMethodScore * 0.1
  maxScore += 0.1
  if (paymentMethodScore > 0.8) factors.push('método de pagamento similar')

  const confidence = maxScore > 0 ? totalScore / maxScore : 0

  return { confidence, factors }
}

/**
 * Calculate amount similarity with tolerance
 */
function calculateAmountSimilarity(
  amount1: number,
  amount2: number,
  tolerancePercent: number
): number {
  if (amount1 === amount2) return 1.0
  
  const tolerance = (tolerancePercent / 100) * Math.max(amount1, amount2)
  const difference = Math.abs(amount1 - amount2)
  
  if (difference <= tolerance) {
    return 1.0 - (difference / tolerance) * 0.2 // Still high score within tolerance
  }
  
  return 0
}

/**
 * Calculate description similarity using simple string comparison
 */
function calculateDescriptionSimilarity(
  desc1: string,
  desc2: string,
  threshold: number
): number {
  if (!desc1 || !desc2) return 0
  
  const normalized1 = normalizeString(desc1)
  const normalized2 = normalizeString(desc2)
  
  if (normalized1 === normalized2) return 1.0
  
  // Simple similarity based on common words
  const words1 = normalized1.split(' ')
  const words2 = normalized2.split(' ')
  
  const commonWords = words1.filter(word => words2.includes(word))
  const totalWords = new Set([...words1, ...words2]).size
  
  return commonWords.length / totalWords
}


/**
 * Calculate payment method similarity
 */
function calculatePaymentMethodSimilarity(
  method1?: string,
  method2?: string
): number {
  if (!method1 || !method2) return 0
  
  const normalized1 = normalizeString(method1)
  const normalized2 = normalizeString(method2)
  
  return normalized1 === normalized2 ? 1.0 : 0
}

/**
 * Normalize string for comparison
 */
function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, '') // Remove special characters
    .replace(/\s+/g, ' ') // Normalize spaces
}

/**
 * Format transaction for display
 */
function formatTransaction(transaction: any): string {
  const amount = `R$ ${transaction.amount.toFixed(2)}`
  const description = transaction.description || 'Sem descrição'
  const date = new Date(transaction.created_at).toLocaleDateString('pt-BR')
  
  return `${amount} - ${description} (${date})`
}

/**
 * Get duplicate detection configuration for user
 */
export async function getDuplicateConfig(userId: string): Promise<DuplicateConfig> {
  // For now, return default config
  // In the future, this could be user-configurable
  return DEFAULT_CONFIG
}

/**
 * Update duplicate detection configuration for user
 */
export async function updateDuplicateConfig(
  userId: string,
  config: Partial<DuplicateConfig>
): Promise<void> {
  // For now, just log the update
  // In the future, this could be stored in user preferences
  console.log(`User ${userId} updated duplicate config:`, config)
}
