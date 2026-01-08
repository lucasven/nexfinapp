export interface Category {
  id: string
  name: string
  type: "income" | "expense"
  icon: string | null
  color: string | null
  is_custom: boolean
  is_system: boolean
  user_id: string | null
  created_at: string
}

export interface Tag {
  id: string
  name: string
  user_id: string
  created_at: string
}

export interface PaymentMethod {
  id: string
  user_id: string
  name: string
  type: 'credit' | 'debit' | 'cash' | 'pix' | 'other'
  credit_mode: boolean | null
  statement_closing_day: number | null
  payment_due_day: number | null
  monthly_budget: number | null
  created_at: string
  updated_at: string
}

export interface Transaction {
  id: string
  user_id: string
  amount: number
  type: "income" | "expense"
  category_id: string | null
  description: string | null
  date: string
  payment_method_id: string
  payment_method_legacy?: string | null
  created_at: string
  updated_at: string
  category?: Category
  payment_method?: PaymentMethod
  tags?: Tag[]
  // Story 4.3/4.4: Metadata for auto-generated transactions
  // Epic 2: Metadata for installment-sourced transactions
  metadata?: {
    auto_generated?: boolean
    source?: string
    credit_card_id?: string
    statement_period_start?: string
    statement_period_end?: string
    statement_total?: number
    installment_source?: boolean
    installment_plan_id?: string
    installment_number?: number
    total_installments?: number
  } | null
}

export interface Budget {
  id: string
  user_id: string
  category_id: string
  amount: number
  month: number | null  // NULL for default budgets
  year: number | null   // NULL for default budgets
  is_default: boolean   // true = applies to all months, false = specific month
  created_at: string
  updated_at: string
  category?: Category
}

// Extended budget with spending info and source tracking
export interface BudgetWithSpending extends Budget {
  spent: number
  remaining: number
  percentage: number
  source_type: 'default' | 'override'  // indicates where the budget came from
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
  onboarding_completed: boolean
  onboarding_step: string | null
  whatsapp_setup_completed: boolean
  first_category_added: boolean
  first_expense_added: boolean
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
  greeting_sent: boolean
  greeting_sent_at: string | null
  greeting_message_id: string | null
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

export interface OnboardingMessage {
  id: string
  user_id: string
  whatsapp_number: string
  user_name: string | null
  message_type: 'greeting' | 'reminder' | 'celebration'
  status: 'pending' | 'sent' | 'failed'
  sent_at: string | null
  error: string | null
  retry_count: number
  created_at: string
  updated_at: string
}

// Story 2.2: Installment types for web frontend
export interface InstallmentPlan {
  id: string
  user_id: string
  payment_method_id: string
  description: string
  total_amount: number
  total_installments: number
  status: 'active' | 'paid_off' | 'cancelled'
  merchant: string | null
  category_id: string | null
  created_at: string
  updated_at: string
  payment_method?: PaymentMethod
  category?: Category
}

export interface InstallmentPayment {
  id: string
  plan_id: string
  transaction_id: string | null
  installment_number: number
  amount: number
  due_date: string
  status: 'pending' | 'paid' | 'cancelled'
  created_at: string
  updated_at: string
}

export interface CreateInstallmentRequest {
  payment_method_id: string
  description: string
  total_amount: number
  total_installments: number
  merchant?: string
  category_id?: string
  first_payment_date: string
}

export interface CreateInstallmentResponse {
  success: boolean
  planId?: string
  error?: string
}

// Story 2.3: Future Commitments types
export interface FutureCommitment {
  month: string          // YYYY-MM format
  total_due: number      // Sum of all payments due this month
  payment_count: number  // Number of installment payments due
}

export interface MonthCommitmentDetail {
  plan_id: string
  description: string
  installment_number: number
  total_installments: number
  amount: number
  category_id: string | null
}

// Story 2.4: View All Installments types
export interface InstallmentPlanWithDetails extends InstallmentPlan {
  payment_method_name: string
  payment_method_type: string
  category_name: string | null
  category_emoji: string | null
  payments_paid: number
  next_payment_date: string | null
  remaining_amount: number
}

export interface InstallmentPaymentWithTransaction extends InstallmentPayment {
  transaction_id: string | null
  transaction_date: string | null
}

export interface InstallmentPlanDetails {
  plan: InstallmentPlanWithDetails
  payments: InstallmentPaymentWithTransaction[]
  total_paid: number
  total_remaining: number
  payments_paid_count: number
  payments_pending_count: number
}

export interface InstallmentCounts {
  active: number
  paid_off: number
}

// Story 2.5: Mark Installment as Paid Off Early types
export interface PayoffConfirmationData {
  plan_id: string
  description: string
  payment_method_name: string
  total_amount: number
  total_installments: number
  payments_paid: number
  amount_paid: number
  payments_pending: number
  amount_remaining: number
  pending_transactions_count: number // Number of future transactions to be deleted
}

export interface PayoffResultData {
  plan_id: string
  payments_cancelled: number
  amount_removed: number
}

// Story 2.6: Edit Installment Plan types
export interface UpdateInstallmentRequest {
  description?: string
  total_amount?: number
  total_installments?: number
  merchant?: string | null
  category_id?: string | null
}

export interface UpdateResultData {
  plan_id: string
  fields_changed: string[]
  old_amount?: number
  new_amount?: number
  old_installments?: number
  new_installments?: number
  payments_added?: number
  payments_removed?: number
  payments_recalculated?: number
}

export interface UpdateInstallmentResponse {
  success: boolean
  error?: string
  updateData?: UpdateResultData
}

// Story 2.7: Delete Installment Plan types
export interface DeleteResultData {
  planId: string
  description: string
  paidCount: number
  pendingCount: number
  paidAmount: number
  pendingAmount: number
}

export interface DeleteInstallmentResponse {
  success: boolean
  error?: string
  deletedData?: DeleteResultData
}

// Epic 3 Story 3.5: Statement Summary Types
export interface InstallmentDetail {
  description: string
  currentInstallment: number
  totalInstallments: number
  amount: number
}

export interface CategoryBreakdown {
  categoryId: string | null
  categoryName: string
  categoryIcon: string | null
  amount: number
  percentage: number
  transactionCount: number
  includesInstallments: boolean
  installmentDetails?: InstallmentDetail[]
}

export interface StatementSummary {
  paymentMethodName: string
  periodStart: Date
  periodEnd: Date
  totalSpent: number
  monthlyBudget: number | null
  budgetPercentage: number | null
  categoryBreakdown: CategoryBreakdown[]
}

// Epic 4 Story 4.1: Payment Due Date Types
export interface PaymentDueDateInfo {
  nextDueDate: Date
  dueDay: number
  dueMonth: number
  dueYear: number
}
