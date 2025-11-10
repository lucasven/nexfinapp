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

export interface UserProfile {
  id: string
  user_id: string
  display_name: string | null
  locale: 'pt-br' | 'en' | null
  created_at: string
  updated_at: string
}

export interface AuthorizedWhatsAppNumber {
  id: string
  user_id: string
  whatsapp_number: string
  name: string
  is_primary: boolean
  permissions: {
    can_view: boolean
    can_add: boolean
    can_edit: boolean
    can_delete: boolean
    can_manage_budgets: boolean
    can_view_reports: boolean
  }
  created_at: string
  updated_at: string
}

export interface AuthorizedGroup {
  id: string
  group_jid: string
  group_name: string | null
  user_id: string
  added_by: string | null
  auto_authorized: boolean
  is_active: boolean
  created_at: string
  updated_at: string
  last_message_at: string | null
}
