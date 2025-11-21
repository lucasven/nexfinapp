import { Messages, FormatHelpers } from './types.js'

export const messages: Messages = {
  // Welcome and help messages
  welcome: `👋 Hello! Welcome to NexFinApp!

I'm your assistant for managing your finances. Here's what I can do:

💰 *Expenses and Income*
• "Spent $50 on food"
• "Received $2000 salary"
• "Add expense of 30 dollars on transport yesterday"
• "Show my expenses"

📊 *Budgets*
• "Set food budget to $500"
• "Show my budgets"
• "Budget status"

🔄 *Recurring Expenses*
• "Add monthly rent of $1200 on day 1"
• "Show recurring payments"

📈 *Reports*
• "Report for this month"
• "Expense summary"

📁 *Categories*
• "List categories"
• "Add category Gym"

🔐 *Authentication*
• "Login: myemail@example.com password123"
• "Logout"

You can also send me photos of bank SMS or statements!`,

  // Authentication messages
  loginPrompt: '🔐 To get started, log in with:\n"Login: your-email@example.com your-password"',
  loginSuccess: '✅ Login successful! You can now manage your expenses.',
  loginError: '❌ Login failed. Check your credentials and try again.',
  logoutSuccess: '👋 You have been logged out successfully!',
  notAuthenticated: '🔒 You need to log in first. Use:\n"Login: your-email@example.com your-password"',
  sessionExpired: '⏰ Your session has expired. Please log in again.',
  unauthorizedNumber: '🚫 This WhatsApp number is not authorized. Contact the account owner to add your number.',
  permissionDenied: (action: string) => `🔒 You don't have permission to ${action}. Contact the account owner to adjust your permissions.`,

  // Expense messages
  expenseAdded: (amount: number, category: string, date: string) => 
    `✅ Expense added!\n💵 Amount: $${amount.toFixed(2)}\n📁 Category: ${category}\n📅 Date: ${date}`,
  incomeAdded: (amount: number, category: string, date: string) =>
    `✅ Income added!\n💰 Amount: $${amount.toFixed(2)}\n📁 Category: ${category}\n📅 Date: ${date}`,
  expenseError: '❌ Could not add the expense. Please try again.',
  invalidAmount: '❌ Invalid amount. Please use a valid number (e.g., $50 or 50 dollars).',

  // Budget messages
  budgetSet: (category: string, amount: number, month: string) =>
    `✅ Budget set!\n📁 Category: ${category}\n💰 Amount: $${amount.toFixed(2)}\n📅 Period: ${month}`,
  budgetError: '❌ Error setting budget. Please try again.',
  noBudgets: '📊 You have no budgets set yet.',

  // Recurring messages
  recurringAdded: (amount: number, category: string, day: number) =>
    `✅ Recurring expense added!\n💵 Amount: $${amount.toFixed(2)}\n📁 Category: ${category}\n📅 Day of month: ${day}`,
  recurringError: '❌ Error adding recurring expense.',
  noRecurring: '🔄 You have no recurring expenses registered.',
  recurringAutoPayNotification: (params) =>
    `🤖 *Automatic Payment Executed*\n\n${params.type} ${params.typeLabel} created automatically:\n\n💰 Amount: ${params.amount}\n📁 ${params.category}${params.description ? `\n📝 ${params.description}` : ''}\n📅 Date: ${params.date}\n🔖 ID: #${params.transactionId}\n\n✅ This recurring expense was processed automatically.\n\n_You can edit or delete using the ID above._`,

  // Report messages
  reportHeader: (month: string, year: number) => 
    `📈 *Report - ${month}/${year}*\n${'='.repeat(30)}`,
  reportSummary: (income: number, expenses: number, balance: number) =>
    `💰 Income: $${income.toFixed(2)}\n💸 Expenses: $${expenses.toFixed(2)}\n📊 Balance: $${balance.toFixed(2)}`,
  noTransactions: '📭 No transactions found for this period.',

  // Category messages
  categoryList: '📁 *Available Categories*:\n',
  categoryAdded: (name: string) => `✅ Category "${name}" added successfully!`,
  categoryError: '❌ Error adding category.',

  // OCR messages
  ocrProcessing: '🔍 Analyzing image... Please wait.',
  ocrSuccess: (count: number) => `✅ Found ${count} expense(s) in the image:`,
  ocrNoData: '❌ Could not extract data from the image. Please add the expense manually.',
  ocrError: '❌ Error processing image. Please try again.',
  confirmOcrExpense: (amount: number, description: string) =>
    `Found:\n💵 $${amount.toFixed(2)}\n📝 ${description}\n\nReply "yes" to confirm or "no" to cancel.`,

  // OCR Confirmation Flow
  ocrPreview: (transactions: Array<{amount: number, category?: string, description?: string, date?: string}>) => {
    let message = `📸 *Transactions found in image:*\n\n`;
    transactions.forEach((t, i) => {
      const dateStr = t.date ? ` (${t.date})` : '';
      const category = t.category || 'No category';
      const description = t.description || 'No description';
      message += `${i + 1}. $${t.amount.toFixed(2)} - ${category} - ${description}${dateStr}\n`;
    });
    message += `\n*Reply:*\n`;
    message += `✅ "yes" or "confirm" - Add all\n`;
    message += `✏️ "edit 2" - Edit transaction #2\n`;
    message += `❌ "no" or "cancel" - Don't add`;
    return message;
  },
  ocrConfirmationPrompt: '💡 *How would you like to proceed?*\n\n✅ "yes" - Confirm all\n✏️ "edit N" - Edit transaction N\n❌ "no" - Cancel',
  ocrAllAdded: (count: number, successful: number) => {
    if (successful === count) {
      return `✅ *Success!*\n\nAll ${count} transactions were added.`;
    } else {
      return `⚠️ *Partially completed*\n\n${successful} of ${count} transactions added.\n${count - successful} failed.`;
    }
  },
  ocrCancelled: '❌ Transactions cancelled. No expenses were added.',
  ocrEditPrompt: (index: number, transaction: {amount: number, category?: string, description?: string}) =>
    `✏️ *Edit transaction #${index}*\n\n` +
    `💵 Amount: $${transaction.amount.toFixed(2)}\n` +
    `📁 Category: ${transaction.category || 'No category'}\n` +
    `📝 Description: ${transaction.description || 'No description'}\n\n` +
    `*Reply with what you want to change:*\n` +
    `• "category: Food" - Change category\n` +
    `• "amount: 50" - Change amount\n` +
    `• "description: Groceries" - Change description\n` +
    `• "cancel" - Go back without changes`,
  ocrEditSuccess: (index: number) => `✅ Transaction #${index} updated!\n\nReply "yes" to confirm all or "edit N" to edit another.`,
  ocrTimeout: '⏰ Time expired. The transactions extracted from the image were discarded. Send the image again if you wish.',
  ocrNoPending: '❌ There are no pending transactions to confirm. Send an image to start.',
  ocrInvalidTransactionNumber: (max: number) => `❌ Invalid transaction number. Use a number between 1 and ${max}.`,

  // Settings messages
  ocrSettingUpdated: (autoAdd: boolean) =>
    autoAdd
      ? '✅ *OCR configured to auto-add*\n\n📸 Now when you send a receipt photo, transactions will be added immediately without confirmation.\n\n💡 To return to confirmation mode, use: /settings ocr confirm'
      : '✅ *OCR configured to always confirm*\n\n📸 Now when you send a receipt photo, you\'ll see a preview and can confirm or cancel before adding.\n\n💡 To auto-add, use: /settings ocr auto',
  ocrSettingCurrent: (autoAdd: boolean) =>
    `⚙️ *Current OCR setting:* ${autoAdd ? '🚀 Auto-add' : '✋ Always confirm'}\n\n` +
    `📸 When you send a receipt photo:\n` +
    (autoAdd
      ? `✅ Transactions are added immediately\n\n💡 To enable confirmation: /settings ocr confirm`
      : `✅ You see a preview and can confirm/cancel\n\n💡 To auto-add: /settings ocr auto`),

  // Error messages
  unknownCommand: '❓ Sorry, I didn\'t understand. Type "help" to see available commands.',
  genericError: '❌ An error occurred. Please try again.',
  invalidDate: '❌ Invalid date. Use formats like "today", "yesterday", "01/12/2024".',
  missingCategory: '❌ Please specify a valid category.',

  // Group messages
  groupMention: '👋 Hello! Mention me or start with "bot" to use my commands in groups.',

  // Duplicate Detection Messages
  duplicateBlocked: (reason: string) => `🚫 Transaction automatically blocked!\n\n${reason}\n\n💡 If not a duplicate, try again with more details.`,
  duplicateWarning: (reason: string, confidence: number) => `⚠️ Possible duplicate detected!\n\n${reason}\n\nConfidence: ${confidence}%\n\n💡 If not a duplicate, confirm by typing "confirm" or "yes".`,
  duplicateConfirmed: '✅ Transaction confirmed and added!',
  duplicateConfirmationNotFound: '❌ No pending transaction found. Try adding the expense again.',
  duplicateConfirmationInvalid: '❌ Confirmation not recognized. Use "yes", "confirm" or "ok" to proceed.',

  // Transaction Correction Messages
  correctionTransactionNotFound: (id: string) => `❌ Transaction ${id} not found. Check the ID and try again.`,
  correctionTransactionDeleted: (id: string) => `✅ Transaction ${id} removed successfully!`,
  correctionTransactionUpdated: (id: string) => `✅ Transaction ${id} updated successfully!`,
  correctionNoChanges: '❌ No changes specified. Use "was $X" or "was category Y" to specify changes.',
  correctionInvalidAction: '❌ Correction type not recognized. Use "remove", "fix" or "correct" followed by transaction ID.',
  correctionMissingId: '❌ Transaction ID not found. Use the 6-character ID that appears when you add a transaction.',

  // NEW: Transaction Management
  aiLimitExceeded: '⚠️ Daily AI usage limit exceeded. Some features may be unavailable until tomorrow.',
  transactionDeleted: (id: string) => `✅ Transaction ${id} deleted successfully!`,
  transactionEdited: (id: string, field: string) => `✅ Transaction ${id} ${field} updated!`,
  transactionDetails: (id: string, amount: number, category: string, date: string) => 
    `📄 Transaction ${id}:\n💵 Amount: $${amount.toFixed(2)}\n📁 Category: ${category}\n📅 Date: ${date}`,
  undoSuccess: '↩️ Last action undone successfully!',
  undoNotAvailable: '❌ No recent actions to undo.',

  // NEW: Category Management
  categoryRemoved: (name: string) => `✅ Category "${name}" removed successfully!`,
  categoryInUse: (name: string, count: number) => `❌ Cannot remove category "${name}". It's used in ${count} transaction(s).`,
  categoryNotFound: (name: string) => `❌ Category "${name}" not found.`,
  cannotDeleteDefaultCategory: '❌ Cannot delete default categories.',

  // NEW: Recurring Management
  recurringEdited: (name: string) => `✅ Recurring payment "${name}" updated!`,
  expenseConvertedToRecurring: (id: string, day: number) => `✅ Transaction ${id} converted to recurring on day ${day}!`,
  recurringNotFound: (name: string) => `❌ Recurring payment "${name}" not found.`,

  // NEW: Budget Management
  budgetDeleted: (category: string) => `✅ Budget for "${category}" removed!`,
  budgetNotFound: (category: string) => `❌ No budget found for "${category}".`,

  // NEW: Analysis & Search
  analysisResult: '📊 Analysis:\n\n',
  quickStatsHeader: (period: string) => `📊 Quick Stats - ${period}`,
  searchNoResults: '🔍 No transactions found matching your criteria.',

  // Confirmation messages
  confirmYes: ['yes', 'y', 'confirm', 'ok', 'sure'],
  confirmNo: ['no', 'n', 'cancel', 'nope'],
  
  // Date keywords
  dateKeywords: {
    today: ['today'],
    yesterday: ['yesterday'],
    thisMonth: ['this month', 'current month'],
    lastMonth: ['last month', 'previous month']
  },
  
  // Command help texts
  commandHelp: {
    add: `
/add <amount> <category> [date] [description] [payment_method]

Examples:
/add 50 food
/add 30 transport 15/10
/add 100 groceries yesterday card
/add 25.50 pharmacy "medicine purchases" pix
    `,
    budget: `
/budget <category> <amount> [period]

Examples:
/budget food 500
/budget transport 200 month
/budget entertainment 1000 year
    `,
    recurring: `
/recurring <name> <amount> day <day>

Examples:
/recurring rent 1200 day 5
/recurring salary 5000 day 1
/recurring gym 80 day 15
    `,
    report: `
/report [period] [category]

Examples:
/report
/report this month
/report january 2024
/report food
    `,
    list: `
/list [type]

Types: categories, recurring, budgets, transactions

Examples:
/list
/list categories
/list recurring
    `,
    categories: `
/categories [action] [name]

Actions: add, remove

Examples:
/categories
/categories add "home and decoration"
/categories remove transport
    `,
    help: `
Available commands:

/add - Add expense
/budget - Set budget
/recurring - Add recurring expense
/report - View reports
/list - List items
/categories - Manage categories
/help - Show this help

Use /help <command> for specific details.
    `
  }
}

export const formatCurrency = (value: number): string => {
  return `$${value.toFixed(2)}`
}

export const formatDate = (date: Date): string => {
  return date.toLocaleDateString('en-US', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  })
}

export const getMonthName = (month: number): string => {
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ]
  return months[month - 1] || ''
}

export const formatHelpers: FormatHelpers = {
  formatCurrency,
  formatDate,
  getMonthName
}

