export interface UserSession {
  id: string
  whatsappNumber: string
  userId: string
  sessionToken: string
  isActive: boolean
  lastActivity: Date
  expiresAt: Date
}

export interface ParsedIntent {
  action: 'add_expense' | 'add_income' | 'show_expenses' | 'show_budget' | 'set_budget' | 
          'add_recurring' | 'show_recurring' | 'delete_recurring' | 'show_report' | 
          'list_categories' | 'add_category' | 'login' | 'logout' | 'help' | 'unknown' |
          'list_transactions' | 'list_recurring' | 'list_budgets' | 'show_help' |
          // Transaction Management
          'edit_transaction' | 'delete_transaction' | 'change_category' | 
          'show_transaction_details' | 'undo_last' |
          // Category Management
          'remove_category' |
          // Recurring Management
          'edit_recurring' | 'make_expense_recurring' |
          // Budget Management
          'delete_budget' |
          // Search & Analysis
          'search_transactions' | 'quick_stats' | 'analyze_spending'
  confidence: number
  entities: {
    amount?: number
    category?: string
    description?: string
    date?: string
    dayOfMonth?: number
    month?: number
    year?: number
    type?: 'income' | 'expense'
    paymentMethod?: string
    transactions?: Array<{
      amount: number
      category?: string
      description?: string
      date?: string
      type?: 'income' | 'expense'
      paymentMethod?: string
    }>
    // NEW: Transaction Management
    transactionId?: string
    field?: string  // for edit_transaction
    value?: string  // for edit_transaction
    // NEW: Search & Analysis
    period?: 'today' | 'week' | 'month'  // for quick_stats
    searchCriteria?: {
      dateFrom?: string
      dateTo?: string
      minAmount?: number
      maxAmount?: number
    }
    analysisType?: 'top_categories' | 'trends' | 'recommendations' | 'budget_health' | 'general'
  }
}

export interface ExpenseData {
  amount: number
  category?: string
  description?: string
  date?: string
  type: 'income' | 'expense'
  paymentMethod?: string
}

export interface OCRResult {
  text: string
  confidence: number
  expenses?: ExpenseData[]
}

export interface MessageContext {
  from: string
  isGroup: boolean
  groupJid?: string // Group JID if message is from a group
  groupName?: string // Group name if available
  message: string
  hasImage: boolean
  imageBuffer?: Buffer
  quotedMessage?: string // For WhatsApp reply context
  userIdentifiers?: import('./utils/user-identifiers.js').UserIdentifiers // Full user identifiers for multi-identifier support
}

