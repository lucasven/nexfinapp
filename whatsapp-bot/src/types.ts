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
          'list_categories' | 'add_category' | 'login' | 'logout' | 'help' | 'unknown'
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
  message: string
  hasImage: boolean
  imageBuffer?: Buffer
}

