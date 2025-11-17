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
    deleting: string
    select: string
    optional: string
    required: string
    all: string
    custom: string
    day: string
    confirmDelete: string
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
    transactions: string
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
    allTypes: string
    allCategories: string
    deleteConfirm: string
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
    subtitle: string
  }

  // Category
  category: {
    title: string
    categories: string
    addTitle: string
    editTitle: string
    deleteTitle: string
    deleteConfirm: string
    name: string
    type: string
    icon: string
    color: string
    noCategories: string
    addFirstCategory: string
    subtitle: string
    income: string
    incomeDescription: string
    expense: string
    expenseDescription: string
    noIncome: string
    noExpense: string
    cannotDelete: string
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
    subtitle: string
    upcomingDescription: string
    templatesDescription: string
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
    subtitle: string
    displayName: string
    displayNamePlaceholder: string
    email: string
    emailCannotChange: string
    saveChanges: string
    updateFailed: string
    whatsappNumbers: string
    authorizedGroups: string
    language: string
  }

  // WhatsApp
  whatsapp: {
    title: string
    subtitle: string
    addNumber: string
    editNumber: string
    addNumberTitle: string
    editNumberSubtitle: string
    addNumberSubtitle: string
    noNumbers: string
    name: string
    namePlaceholder: string
    nameHelp: string
    number: string
    numberPlaceholder: string
    numberHelp: string
    isPrimary: string
    onlyOnePrimary: string
    primary: string
    permissions: string
    permissionView: string
    permissionViewDesc: string
    permissionAdd: string
    permissionAddDesc: string
    permissionEdit: string
    permissionEditDesc: string
    permissionDelete: string
    permissionDeleteDesc: string
    permissionBudgets: string
    permissionBudgetsDesc: string
    permissionReports: string
    permissionReportsDesc: string
    view: string
    add: string
    edit: string
    delete: string
    budgets: string
    reports: string
    deleteConfirm: string
    deleteFailed: string
    invalidNumber: string
    saveFailed: string
  }

  // Groups
  groups: {
    title: string
    subtitle: string
    noGroups: string
    noGroupsHelp: string
    unknownGroup: string
    autoAuthorized: string
    active: string
    inactive: string
    addedBy: string
    lastMessage: string
    never: string
    justNow: string
    minutesAgo: string
    hoursAgo: string
    daysAgo: string
    weeksAgo: string
    activate: string
    deactivate: string
    deleteConfirm: string
    updateFailed: string
    deleteFailed: string
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

  // Onboarding
  onboarding: {
    progress: string
    back: string
    next: string
    skip: string
    skipTour: string
    getStarted: string
    complete: string

    welcome: {
      title: string
      heading: string
      intro: string
      feature1Title: string
      feature1Desc: string
      feature2Title: string
      feature2Desc: string
      feature3Title: string
      feature3Desc: string
    }

    whatsapp: {
      title: string
      heading: string
      description: string
      explanation: string
      instructions: string
      addButton: string
      connected: string
    }

    category: {
      title: string
      heading: string
      description: string
      explanation: string
      tip: string
      tipDetail: string
      goToCategories: string
    }

    expense: {
      tutorialTitle: string
      tutorialDescription: string
    }

    features: {
      title: string
      heading: string
      description: string
      explanation: string
      tutorialTitle: string
      tutorialDescription: string

      naturalLanguage: {
        title: string
        description: string
        example: string
      }

      ocr: {
        title: string
        description: string
        example: string
      }

      budgets: {
        title: string
        description: string
      }
    }
  }
}

export interface FormatHelpers {
  formatCurrency: (value: number) => string
  formatDate: (date: Date | string) => string
  formatNumber: (value: number) => string
  getMonthName: (month: number) => string
  getCurrencySymbol: () => string
}
