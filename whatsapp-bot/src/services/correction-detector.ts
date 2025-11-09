import { ParsedIntent } from '../types'

export interface CorrectionIntent {
  action: 'delete' | 'update' | 'unknown'
  transactionId?: string
  updates?: {
    amount?: number
    category?: string
    description?: string
    date?: string
    paymentMethod?: string
  }
  confidence: number
  reason?: string
}

/**
 * Detect if a message is requesting a transaction correction
 */
export function detectCorrectionIntent(message: string): CorrectionIntent {
  const normalizedMessage = message.toLowerCase().trim()
  
  // Correction trigger words
  const correctionWords = [
    'remover', 'remove', 'deletar', 'delete', 'apagar', 'excluir',
    'arrumar', 'arrume', 'corrigir', 'corrige', 'consertar',
    'ta errado', 'está errado', 'erro', 'wrong', 'incorreto',
    'mudar', 'alterar', 'trocar', 'change', 'update',
    'foi', 'era', 'deveria ser', 'should be'
  ]
  
  // Check if message contains correction words
  const hasCorrectionWord = correctionWords.some(word => 
    normalizedMessage.includes(word)
  )
  
  if (!hasCorrectionWord) {
    return { action: 'unknown', confidence: 0 }
  }
  
  // Extract transaction ID (6-character alphanumeric with at least one letter AND one number)
  // This prevents false positives like "comida" or "outros" being detected as transaction IDs
  const transactionIdMatch = normalizedMessage.match(/\b([a-z0-9]{6})\b/i)
  let transactionId: string | undefined
  
  if (transactionIdMatch) {
    const candidate = transactionIdMatch[1].toUpperCase()
    // Validate it has both letters and numbers (real transaction IDs have this format)
    if (/[A-Z]/.test(candidate) && /[0-9]/.test(candidate)) {
      transactionId = candidate
    }
  }
  
  // Determine correction action
  let action: CorrectionIntent['action'] = 'unknown'
  let confidence = 0.3 // Base confidence for having correction words
  
  // Delete/remove patterns
  const deletePatterns = [
    /remover\s+([a-z0-9]{6})/i,
    /remove\s+([a-z0-9]{6})/i,
    /deletar\s+([a-z0-9]{6})/i,
    /apagar\s+([a-z0-9]{6})/i,
    /excluir\s+([a-z0-9]{6})/i,
    /([a-z0-9]{6})\s+(remover|remove|deletar|apagar|excluir)/i
  ]
  
  for (const pattern of deletePatterns) {
    const match = normalizedMessage.match(pattern)
    if (match) {
      action = 'delete'
      confidence = 0.9
      break
    }
  }
  
  // Update patterns
  const updatePatterns = [
    /([a-z0-9]{6})\s+(era|foi|deveria ser|should be)\s+([\d.,]+)/i,
    /([a-z0-9]{6})\s+(era|foi|deveria ser|should be)\s+([a-záàâãéèêíïóôõöúçñ\s]+)/i,
    /arrumar\s+([a-z0-9]{6})/i,
    /corrigir\s+([a-z0-9]{6})/i,
    /([a-z0-9]{6})\s+(arrumar|corrigir|mudar|alterar)/i
  ]
  
  if (action === 'unknown') {
    for (const pattern of updatePatterns) {
      const match = normalizedMessage.match(pattern)
      if (match) {
        action = 'update'
        confidence = 0.8
        break
      }
    }
  }
  
  // If we have a valid transaction ID but no specific action, assume update
  if (action === 'unknown' && transactionId) {
    action = 'update'
    confidence = 0.6
  }
  
  // If we have correction words but no valid transaction ID, return unknown with low confidence
  // This prevents "mudar categoria para outros" or "gastei 50 em comida" from being treated as corrections
  if (action === 'unknown' && !transactionId && hasCorrectionWord) {
    return { 
      action: 'unknown', 
      confidence: 0.2,  // Too low to trigger correction handling (< 0.5 threshold)
      reason: 'Palavra de correção detectada mas ID de transação inválido ou ausente'
    }
  }
  
  // Extract update information
  const updates: CorrectionIntent['updates'] = {}
  
  if (action === 'update') {
    // Extract amount
    const amountMatch = normalizedMessage.match(/(?:era|foi|deveria ser|should be)\s*([\d.,]+)/i)
    if (amountMatch) {
      const amountStr = amountMatch[1].replace(',', '.')
      const amount = parseFloat(amountStr)
      if (!isNaN(amount) && amount > 0) {
        updates.amount = amount
        confidence += 0.1
      }
    }
    
    // Extract category
    const categoryMatch = normalizedMessage.match(/(?:era|foi|deveria ser|should be)\s+([a-záàâãéèêíïóôõöúçñ\s]+?)(?:\s|$)/i)
    if (categoryMatch) {
      const category = categoryMatch[1].trim()
      if (category.length > 2 && !category.match(/^\d+$/)) {
        updates.category = category
        confidence += 0.1
      }
    }
    
    // Extract payment method
    const paymentMethodMatch = normalizedMessage.match(/(?:era|foi|deveria ser|should be)\s+(?:no|em|com)\s+(cartao|cartão|pix|dinheiro|débito|debito)/i)
    if (paymentMethodMatch) {
      const method = paymentMethodMatch[1].toLowerCase()
      if (method.includes('cartao') || method.includes('cartão')) {
        updates.paymentMethod = 'Credit Card'
      } else if (method.includes('pix')) {
        updates.paymentMethod = 'PIX'
      } else if (method.includes('dinheiro')) {
        updates.paymentMethod = 'Cash'
      } else if (method.includes('débito') || method.includes('debito')) {
        updates.paymentMethod = 'Debit Card'
      }
      confidence += 0.1
    }
    
    // Extract date
    const dateMatch = normalizedMessage.match(/(?:era|foi|deveria ser|should be)\s+(?:em|no|na)\s+(\d{1,2}\/\d{1,2}(?:\/\d{4})?)/i)
    if (dateMatch) {
      const dateStr = dateMatch[1]
      const [day, month, year] = dateStr.split('/')
      const fullYear = year ? year : new Date().getFullYear().toString()
      updates.date = `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
      confidence += 0.1
    }
  }
  
  return {
    action,
    transactionId,
    updates: Object.keys(updates).length > 0 ? updates : undefined,
    confidence,
    reason: generateCorrectionReason(action, transactionId, updates)
  }
}

/**
 * Generate a human-readable reason for the correction
 */
function generateCorrectionReason(
  action: CorrectionIntent['action'],
  transactionId?: string,
  updates?: CorrectionIntent['updates']
): string {
  if (!transactionId) {
    return 'ID da transação não encontrado'
  }
  
  if (action === 'delete') {
    return `Remover transação ${transactionId}`
  }
  
  if (action === 'update' && updates) {
    const changes: string[] = []
    
    if (updates.amount) {
      changes.push(`valor para R$ ${updates.amount.toFixed(2)}`)
    }
    if (updates.category) {
      changes.push(`categoria para ${updates.category}`)
    }
    if (updates.paymentMethod) {
      changes.push(`método de pagamento para ${updates.paymentMethod}`)
    }
    if (updates.date) {
      changes.push(`data para ${updates.date}`)
    }
    if (updates.description) {
      changes.push(`descrição para ${updates.description}`)
    }
    
    if (changes.length > 0) {
      return `Atualizar transação ${transactionId}: ${changes.join(', ')}`
    }
  }
  
  return `Corrigir transação ${transactionId}`
}

/**
 * Check if a message contains a transaction ID
 */
export function extractTransactionId(message: string): string | null {
  const match = message.match(/\b([A-Z0-9]{6})\b/)
  return match ? match[1] : null
}

/**
 * Validate transaction ID format
 */
export function isValidTransactionId(id: string): boolean {
  return /^[A-Z0-9]{6}$/.test(id)
}
