/**
 * Transaction ID Extractor Service
 * 
 * Extracts transaction IDs from quoted bot messages to enable
 * quick reply-based editing and corrections.
 * 
 * Expected format in bot messages: "🆔 ID: ABC123" or "ID: ABC123"
 */

/**
 * Extract transaction ID from bot's quoted message
 * Looks for pattern: "🆔 ID: ABC123" or "ID: ABC123"
 * 
 * @param quotedMessage - The text of the quoted message
 * @returns The extracted transaction ID (uppercase) or null if not found
 */
export function extractTransactionIdFromQuote(quotedMessage: string): string | null {
  if (!quotedMessage) {
    return null
  }

  // Match: 🆔 ID: ABC123 or ID: ABC123
  // Transaction IDs are 6 alphanumeric characters
  const match = quotedMessage.match(/(?:🆔\s*)?ID:\s*([A-Z0-9]{6})/i)
  
  return match ? match[1].toUpperCase() : null
}

/**
 * Check if user is replying to a bot message about a transaction
 * 
 * @param quotedMessage - The text of the quoted message
 * @returns True if the quoted message contains a transaction ID
 */
export function isTransactionReply(quotedMessage?: string): boolean {
  if (!quotedMessage) {
    return false
  }

  // Check for transaction ID pattern
  return /(?:🆔\s*)?ID:\s*[A-Z0-9]{6}/i.test(quotedMessage)
}

/**
 * Extract all transaction IDs from a message
 * Useful for batch operations or messages mentioning multiple transactions
 * 
 * @param message - The message text to search
 * @returns Array of extracted transaction IDs (uppercase, deduplicated)
 */
export function extractAllTransactionIds(message: string): string[] {
  if (!message) {
    return []
  }

  // Find all matches
  const matches = message.matchAll(/(?:🆔\s*)?ID:\s*([A-Z0-9]{6})/gi)
  
  // Extract, normalize, and deduplicate
  const ids = Array.from(matches, match => match[1].toUpperCase())
  return [...new Set(ids)]
}

/**
 * Create an enhanced message with injected transaction ID for LLM context
 * Format: "user message [transaction_id: ABC123]"
 * 
 * @param message - The original user message
 * @param transactionId - The transaction ID to inject
 * @returns Enhanced message with transaction ID context
 */
export function injectTransactionIdContext(message: string, transactionId: string): string {
  return `${message} [transaction_id: ${transactionId}]`
}

