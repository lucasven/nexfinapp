import type { Messages, FormatHelpers } from './types'

export const messages: Messages = {
  common: {
    cancel: 'Cancel',
    save: 'Save',
    add: 'Add',
    edit: 'Edit',
    delete: 'Delete',
    update: 'Update',
    loading: 'Loading...',
    saving: 'Saving...',
    select: 'Select',
    optional: 'Optional',
    required: 'Required',
  },

  nav: {
    home: 'Home',
    reports: 'Reports',
    budgets: 'Budgets',
    categories: 'Categories',
    recurring: 'Recurring',
    profile: 'Profile',
    signOut: 'Sign Out',
  },

  home: {
    title: 'Expense Tracker',
    subtitle: 'Manage your finances with ease',
    addTransaction: 'Add Transaction',
  },

  balance: {
    totalBalance: 'Total Balance',
    currentBalance: 'Current balance',
    income: 'Income',
    totalIncome: 'Total income',
    expenses: 'Expenses',
    totalExpenses: 'Total expenses',
  },

  transaction: {
    title: 'Transaction',
    addTitle: 'Add Transaction',
    editTitle: 'Edit Transaction',
    addDescription: 'Add a new income or expense transaction.',
    editDescription: 'Update your transaction details.',
    type: 'Type',
    amount: 'Amount',
    category: 'Category',
    date: 'Date',
    paymentMethod: 'Payment Method',
    description: 'Description',
    selectCategory: 'Select category',
    selectPaymentMethod: 'Select payment method',
    optionalDescription: 'Optional description...',
    income: 'Income',
    expense: 'Expense',
    noTransactions: 'No transactions found',
    addFirstTransaction: 'Add your first transaction',
  },

  paymentMethods: {
    cash: 'Cash',
    creditCard: 'Credit Card',
    debitCard: 'Debit Card',
    bankTransfer: 'Bank Transfer',
    pix: 'PIX',
    other: 'Other',
  },

  budget: {
    title: 'Budget',
    addTitle: 'Add Budget',
    editTitle: 'Edit Budget',
    addDescription: 'Set a budget for a category.',
    editDescription: 'Update your budget.',
    spent: 'Spent',
    remaining: 'Remaining',
    overBudget: 'Over budget',
    nearLimit: 'Near limit',
    onTrack: 'On track',
    noBudgets: 'No budgets found',
    addFirstBudget: 'Add your first budget',
    month: 'Month',
    year: 'Year',
    amount: 'Amount',
  },

  category: {
    title: 'Category',
    addTitle: 'Add Category',
    editTitle: 'Edit Category',
    name: 'Name',
    type: 'Type',
    icon: 'Icon',
    color: 'Color',
    noCategories: 'No categories found',
    addFirstCategory: 'Add your first category',
  },

  categories: {
    salary: 'Salary',
    freelance: 'Freelance',
    investments: 'Investments',
    other: 'Other',
    food: 'Food',
    transport: 'Transport',
    housing: 'Housing',
    utilities: 'Utilities',
    entertainment: 'Entertainment',
    healthcare: 'Healthcare',
    education: 'Education',
    shopping: 'Shopping',
  },

  recurring: {
    title: 'Recurring',
    addTitle: 'Add Recurring',
    editTitle: 'Edit Recurring',
    dayOfMonth: 'Day of Month',
    isActive: 'Active',
    active: 'Active',
    inactive: 'Inactive',
    noRecurring: 'No recurring transactions found',
    addFirstRecurring: 'Add your first recurring transaction',
    upcomingPayments: 'Upcoming Payments',
    markAsPaid: 'Mark as Paid',
    dueDate: 'Due Date',
  },

  reports: {
    title: 'Reports',
    subtitle: 'View and analyze your finances',
    categoryBreakdown: 'Category Breakdown',
    monthlyTrend: 'Monthly Trend',
    yearlyOverview: 'Yearly Overview',
    selectMonth: 'Select month',
    selectYear: 'Select year',
  },

  profile: {
    title: 'Profile',
    settings: 'Profile Settings',
    displayName: 'Display Name',
    email: 'Email',
    whatsappNumbers: 'WhatsApp Numbers',
    authorizedGroups: 'Authorized Groups',
    language: 'Language',
  },

  auth: {
    login: 'Login',
    signup: 'Sign Up',
    email: 'Email',
    password: 'Password',
    confirmPassword: 'Confirm Password',
    forgotPassword: 'Forgot password?',
    noAccount: "Don't have an account?",
    haveAccount: 'Already have an account?',
    signInWithEmail: 'Sign in with Email',
    signUpWithEmail: 'Sign up with Email',
  },

  months: {
    january: 'January',
    february: 'February',
    march: 'March',
    april: 'April',
    may: 'May',
    june: 'June',
    july: 'July',
    august: 'August',
    september: 'September',
    october: 'October',
    november: 'November',
    december: 'December',
  },

  table: {
    date: 'Date',
    description: 'Description',
    category: 'Category',
    paymentMethod: 'Payment Method',
    amount: 'Amount',
    type: 'Type',
    actions: 'Actions',
  },
}

export const formatHelpers: FormatHelpers = {
  formatCurrency: (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(value)
  },

  formatDate: (date: Date | string) => {
    const dateObj = typeof date === 'string' ? new Date(date) : date
    return new Intl.DateTimeFormat('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: 'numeric',
    }).format(dateObj)
  },

  formatNumber: (value: number) => {
    return new Intl.NumberFormat('en-US').format(value)
  },

  getMonthName: (month: number) => {
    const monthNames = [
      messages.months.january,
      messages.months.february,
      messages.months.march,
      messages.months.april,
      messages.months.may,
      messages.months.june,
      messages.months.july,
      messages.months.august,
      messages.months.september,
      messages.months.october,
      messages.months.november,
      messages.months.december,
    ]
    return monthNames[month - 1] || ''
  },

  getCurrencySymbol: () => '$',
}
