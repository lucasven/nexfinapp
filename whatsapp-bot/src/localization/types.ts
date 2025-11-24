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

  // Engagement: Opt-Out
  engagementOptOutConfirm: string
  engagementOptInConfirm: string

  // Engagement: Dormant Reactivation
  engagementWelcomeBack: string

  // Engagement: Destination Switching (Story 4.6)
  engagementDestinationSwitchedToGroup: string
  engagementDestinationSwitchedToIndividual: string
  engagementDestinationSwitchFailed: string
  engagementDestinationNeedGroupFirst: string
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

