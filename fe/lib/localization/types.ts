export type Locale = 'pt-br' | 'en'

export interface Messages {
  // Common
  common: {
    cancel: string
    save: string
    add: string
    edit: string
    delete: string
    update: string
    loading: string
    saving: string
    select: string
    optional: string
    required: string
  }

  // Navigation
  nav: {
    home: string
    reports: string
    budgets: string
    categories: string
    recurring: string
    profile: string
    signOut: string
  }

  // Home page
  home: {
    title: string
    subtitle: string
    addTransaction: string
  }

  // Balance card
  balance: {
    totalBalance: string
    currentBalance: string
    income: string
    totalIncome: string
    expenses: string
    totalExpenses: string
  }

  // Transaction
  transaction: {
    title: string
    addTitle: string
    editTitle: string
    addDescription: string
    editDescription: string
    type: string
    amount: string
    category: string
    date: string
    paymentMethod: string
    description: string
    selectCategory: string
    selectPaymentMethod: string
    optionalDescription: string
    income: string
    expense: string
    noTransactions: string
    addFirstTransaction: string
  }

  // Payment methods
  paymentMethods: {
    cash: string
    creditCard: string
    debitCard: string
    bankTransfer: string
    pix: string
    other: string
  }

  // Budget
  budget: {
    title: string
    addTitle: string
    editTitle: string
    addDescription: string
    editDescription: string
    spent: string
    remaining: string
    overBudget: string
    nearLimit: string
    onTrack: string
    noBudgets: string
    addFirstBudget: string
    month: string
    year: string
    amount: string
  }

  // Category
  category: {
    title: string
    addTitle: string
    editTitle: string
    name: string
    type: string
    icon: string
    color: string
    noCategories: string
    addFirstCategory: string
  }

  // Default categories
  categories: {
    salary: string
    freelance: string
    investments: string
    other: string
    food: string
    transport: string
    housing: string
    utilities: string
    entertainment: string
    healthcare: string
    education: string
    shopping: string
  }

  // Recurring
  recurring: {
    title: string
    addTitle: string
    editTitle: string
    dayOfMonth: string
    isActive: string
    active: string
    inactive: string
    noRecurring: string
    addFirstRecurring: string
    upcomingPayments: string
    markAsPaid: string
    dueDate: string
  }

  // Reports
  reports: {
    title: string
    subtitle: string
    categoryBreakdown: string
    monthlyTrend: string
    yearlyOverview: string
    selectMonth: string
    selectYear: string
  }

  // Profile
  profile: {
    title: string
    settings: string
    displayName: string
    email: string
    whatsappNumbers: string
    authorizedGroups: string
    language: string
  }

  // Auth
  auth: {
    login: string
    signup: string
    email: string
    password: string
    confirmPassword: string
    forgotPassword: string
    noAccount: string
    haveAccount: string
    signInWithEmail: string
    signUpWithEmail: string
  }

  // Months
  months: {
    january: string
    february: string
    march: string
    april: string
    may: string
    june: string
    july: string
    august: string
    september: string
    october: string
    november: string
    december: string
  }

  // Table
  table: {
    date: string
    description: string
    category: string
    paymentMethod: string
    amount: string
    type: string
    actions: string
  }
}

export interface FormatHelpers {
  formatCurrency: (value: number) => string
  formatDate: (date: Date | string) => string
  formatNumber: (value: number) => string
  getMonthName: (month: number) => string
  getCurrencySymbol: () => string
}
