export interface Category {
  id: string
  name: string
  type: "income" | "expense"
  icon: string | null
  color: string | null
  is_custom: boolean
  user_id: string | null
  created_at: string
}

export interface Tag {
  id: string
  name: string
  user_id: string
  created_at: string
}

export interface Transaction {
  id: string
  user_id: string
  amount: number
  type: "income" | "expense"
  category_id: string | null
  description: string | null
  date: string
  payment_method: string | null
  created_at: string
  updated_at: string
  category?: Category
  tags?: Tag[]
}

export interface Budget {
  id: string
  user_id: string
  category_id: string
  amount: number
  month: number
  year: number
  created_at: string
  updated_at: string
  category?: Category
}

export interface RecurringTransaction {
  id: string
  user_id: string
  amount: number
  type: "income" | "expense"
  category_id: string | null
  description: string | null
  payment_method: string | null
  day_of_month: number
  is_active: boolean
  last_generated_date: string | null
  created_at: string
  updated_at: string
  category?: Category
}

export interface RecurringPayment {
  id: string
  recurring_transaction_id: string
  transaction_id: string | null
  due_date: string
  is_paid: boolean
  paid_date: string | null
  created_at: string
  recurring_transaction?: RecurringTransaction
}
