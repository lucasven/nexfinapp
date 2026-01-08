/**
 * Type definitions for internationalization (i18n) system
 */

export type Locale = 'pt-br' | 'en'

export interface Messages {
  // Welcome and help messages
  welcome: string

  // Onboarding greeting message
  onboardingGreeting: (userName: string | null) => string

  // Authentication messages
  loginPrompt: string
  loginSuccess: string
  loginError: string
  logoutSuccess: string
  notAuthenticated: string
  sessionExpired: string
  unauthorizedNumber: string
  permissionDenied: (action: string) => string
  
  // Expense messages
  expenseAdded: (amount: number, category: string, date: string) => string
  incomeAdded: (amount: number, category: string, date: string) => string
  expenseError: string
  invalidAmount: string
  
  // Budget messages
  budgetSet: (category: string, amount: number, month: string) => string
  budgetError: string
  noBudgets: string
  
  // Recurring messages
  recurringAdded: (amount: number, category: string, day: number) => string
  recurringError: string
  noRecurring: string
  recurringAutoPayNotification: (params: {
    type: string
    typeLabel: string
    amount: string
    category: string
    description: string
    date: string
    transactionId: string
  }) => string
  
  // Report messages
  reportHeader: (month: string, year: number) => string
  reportSummary: (income: number, expenses: number, balance: number) => string
  noTransactions: string
  
  // Category messages
  categoryList: string
  categoryAdded: (name: string) => string
  categoryError: string
  
  // OCR messages
  ocrProcessing: string
  ocrSuccess: (count: number) => string
  ocrNoData: string
  ocrError: string
  confirmOcrExpense: (amount: number, description: string) => string

  // OCR Confirmation Flow
  ocrPreview: (transactions: Array<{amount: number, category?: string, description?: string, date?: string}>) => string
  ocrConfirmationPrompt: string
  ocrAllAdded: (count: number, successful: number) => string
  ocrCancelled: string
  ocrEditPrompt: (index: number, transaction: {amount: number, category?: string, description?: string}) => string
  ocrEditSuccess: (index: number) => string
  ocrTimeout: string
  ocrNoPending: string
  ocrInvalidTransactionNumber: (max: number) => string

  // Settings messages
  ocrSettingUpdated: (autoAdd: boolean) => string
  ocrSettingCurrent: (autoAdd: boolean) => string

  // Error messages
  unknownCommand: string
  aiLimitExceeded: string
  genericError: string
  invalidDate: string
  missingCategory: string
  
  // Group messages
  groupMention: string
  
  // Duplicate Detection Messages
  duplicateBlocked: (reason: string) => string
  duplicateWarning: (reason: string, confidence: number) => string
  duplicateConfirmed: string
  duplicateConfirmationNotFound: string
  duplicateConfirmationInvalid: string
  
  // Transaction Correction Messages
  correctionTransactionNotFound: (id: string) => string
  correctionTransactionDeleted: (id: string) => string
  correctionTransactionUpdated: (id: string) => string
  correctionNoChanges: string
  correctionInvalidAction: string
  correctionMissingId: string
  
  // NEW: Transaction Management
  transactionDeleted: (id: string) => string
  transactionEdited: (id: string, field: string) => string
  transactionDetails: (id: string, amount: number, category: string, date: string) => string
  transactionTypeChanged: (oldType: 'income' | 'expense', newType: 'income' | 'expense') => string
  categoryChanged: (oldCategory: string, newCategory: string) => string
  undoSuccess: string
  undoNotAvailable: string
  
  // NEW: Category Management
  categoryRemoved: (name: string) => string
  categoryInUse: (name: string, count: number) => string
  categoryNotFound: (name: string) => string
  cannotDeleteDefaultCategory: string
  
  // NEW: Recurring Management
  recurringEdited: (name: string) => string
  expenseConvertedToRecurring: (id: string, day: number) => string
  recurringNotFound: (name: string) => string
  
  // NEW: Budget Management
  budgetDeleted: (category: string) => string
  budgetNotFound: (category: string) => string
  // Default/Fixed Budget Management
  defaultBudgetSet: (category: string, amount: number) => string
  defaultBudgetDeleted: (category: string) => string
  defaultBudgetNotFound: (category: string) => string
  
  // NEW: Analysis & Search
  analysisResult: string  // Used as prefix for AI-generated analysis
  quickStatsHeader: (period: string) => string
  searchNoResults: string
  
  // Confirmation messages
  confirmYes: string[]
  confirmNo: string[]
  
  // Date keywords
  dateKeywords: {
    today: string[]
    yesterday: string[]
    thisMonth: string[]
    lastMonth: string[]
  }
  
  // Command help texts
  commandHelp: {
    add: string
    budget: string
    recurring: string
    report: string
    list: string
    categories: string
    help: string
  }

  // Engagement: First Message & Welcome
  engagementFirstMessage: (contextualResponse: string | null) => string
  engagementFirstExpenseSuccess: string
  engagementGuideToFirstExpense: string
  engagementFirstExpenseCelebration: (amount: string, category: string) => string

  // Engagement: Tier Unlock Messages
  engagementTier1Complete: string
  engagementTier2Complete: string
  engagementTier3Complete: string

  // Engagement: Contextual Hints
  engagementHintAddCategory: string
  engagementHintSetBudget: string
  engagementHintViewReport: string
  engagementHintFirstExpenseCategory: string
  engagementHintBudgetSuggestion: (count: number, category: string) => string

  // Engagement: Goodbye/Self-Select Messages (Story 4.3)
  engagementGoodbyeSelfSelect: string // New 3-option goodbye message
  engagementGoodbyeMessage: string // Legacy goodbye message
  engagementGoodbyeResponse1: string // confused - help
  engagementGoodbyeResponse2: string // busy - remind later
  engagementGoodbyeResponse3: string // all good - dormant
  engagementGoodbyeTimeout: string // 48h timeout - dormant
  engagementRemindLaterConfirm: string

  // Engagement: Help Flow (Response 1)
  engagementHelpFlowStart: string

  // Engagement: Weekly Review
  engagementWeeklyReviewActive: (summary: { totalTransactions: number; totalAmount: number }) => string
  engagementWeeklyReviewCelebration: (params: { count: number }) => string

  // Engagement: Opt-Out
  engagementOptOutConfirm: string
  engagementOptInConfirm: string

  // Engagement: Re-engagement Opt-Out (Story 6.1)
  engagementOptOutConfirmed: string
  engagementOptInConfirmed: string
  engagementOptOutError: string

  // Engagement: Dormant Reactivation
  engagementWelcomeBack: string

  // Engagement: Destination Switching (Story 4.6)
  engagementDestinationSwitchedToGroup: string
  engagementDestinationSwitchedToIndividual: string
  engagementDestinationSwitchFailed: string
  engagementDestinationNeedGroupFirst: string

  // Credit Mode Selection (Story 1.3)
  credit_mode: {
    selection_prompt: string
    confirmation_credit: string
    confirmation_simple: string
    invalid_input: string
    switch_warning?: (count: number) => string
    mode_switched_keep?: string
    mode_switched_payoff?: (count: number) => string
    mode_switched_success?: (cardName: string, mode: 'credit' | 'simple') => string
    mode_switch_cancelled?: string
    invalid_switch_option?: string
  }

  // Installments (Epic 2 Story 2.1)
  installment?: {
    created_title: (description: string) => string
    created_total: (total: number, installments: number, monthly: number) => string
    created_first_payment: (date: string) => string
    created_last_payment: (date: string) => string
    created_help: string
    blocked_simple_mode: string
    select_card: (cards: string[]) => string
    clarify_amount: string
    clarify_installments: string
    error_validation: string
    error_network: string
  }

  // Future Commitments (Epic 2 Story 2.3)
  futureCommitments?: {
    title: string
    total_next_months: (months: number, total: number) => string
    no_active: string
    create_hint: string
    month_summary: (month: string, year: string, amount: number, count: number) => string
    installment_item: (description: string, current: number, total: number, amount: number) => string
    empty_state: string
    loading: string
    error: string
  }

  // Statement Reminder (Epic 3 Story 3.4)
  statementReminder?: {
    greeting: string
    closingIn: (paymentMethod: string, days: number, date: string) => string
    period: (start: string, end: string) => string
    total: (amount: string) => string
    budget: (budget: string, percentage: number) => string
    remaining: (amount: string) => string
    exceeded: (amount: string) => string
    cta: string
  }

  // Payment Due Reminder (Epic 4 Story 4.2)
  paymentReminder?: {
    title: string
    dueIn: (days: number, date: string) => string
    amount: (amount: string) => string
    cardName: (name: string) => string
    period: (start: string, end: string) => string
    footer: string
  }

  autoPayment?: {
    descriptionFormat: (cardName: string, monthYear: string) => string
    jobStarted: string
    jobCompleted: string
    transactionCreated: (cardName: string) => string
    transactionSkipped: (cardName: string) => string
    transactionFailed: (cardName: string) => string
  }

  // Installment Payoff (Epic 2 Story 2.5)
  installmentPayoff?: {
    list_active: string
    installment_summary: (emoji: string, description: string, paymentMethod: string, amount: number, count: number, paid: number, total: number, remaining: number) => string
    select_prompt: (numbers: string) => string
    confirmation_title: string
    confirmation_details: (emoji: string, description: string, paymentMethod: string, total: number, count: number, paid: number, paidAmount: number, pending: number, remaining: number) => string
    confirm_prompt: string
    success: (emoji: string, description: string, count: number, amount: number) => string
    cancelled: string
    no_active: string
    invalid_selection: (numbers: string) => string
    error: string
  }

  // Installment Delete (Epic 2 Story 2.7)
  installmentDelete?: {
    list_prompt: string
    list_item: (number: string, description: string, total: number, installments: number) => string
    list_status: (paid: number, pending: number) => string
    list_footer: string
    no_active: string
    confirmation_title: string
    confirmation_intro: string
    confirmation_details: (emoji: string, description: string, total: number, count: number) => string
    confirmation_status: string
    confirmation_paid: (paid: number, paidAmount: number) => string
    confirmation_pending: (pending: number, remaining: number) => string
    confirmation_warning?: string
    confirmation_what_happens: string
    confirmation_plan_removed: string
    confirmation_pending_deleted: (count: number) => string
    confirmation_paid_preserved: (count: number) => string
    confirmation_commitments_updated: (amount: number) => string
    confirmation_irreversible: string
    confirmation_consequences?: string[]
    confirm_prompt: string
    success_title: string
    success_description: (description: string) => string
    success_impact: string
    success_pending_deleted: (count: number) => string
    success_paid_preserved: (count: number) => string
    success_commitments_updated: (amount: number) => string
    success_footer: string
    success?: (description: string) => string // Legacy - keep for backward compatibility
    cancelled: string
    timeout: string
    invalid_selection: (numbers: string) => string
    error: string
    error_not_found: string
    error_unauthorized: string
  }

  // Statement Summary (Epic 3 Story 3.5)
  statementSummary?: {
    header: (paymentMethod: string) => string
    period: (start: string, end: string) => string
    total: (amount: string) => string
    budget: (budget: string, percentage: number) => string
    exceeded: (amount: string) => string
    remaining: (amount: string) => string
    categoryHeader: string
    categoryLine: (icon: string, name: string, amount: string, percentage: number) => string
    transactionCount: (count: number) => string
    includesInstallments: string
    installmentFormat: (description: string, current: number, total: number, amount: string) => string
    installmentBullet: (description: string, current: number, total: number, amount: string) => string
    cta: string
    noTransactions: string
    cardSelection: (count: number, list: string) => string
    noCards: string
    noClosingDate: string
    error: string
  }

  // Statement Period (Epic 3 Story 3.6)
  statementPeriod?: {
    currentPeriod: string
    nextPeriod: string
    pastPeriod: string
    periodContext: string
  }
}

export interface FormatHelpers {
  formatCurrency: (value: number) => string
  formatDate: (date: Date) => string
  getMonthName: (month: number) => string
}

export type LocaleMessages = {
  [K in Locale]: Messages
}

export type LocaleFormatHelpers = {
  [K in Locale]: FormatHelpers
}

