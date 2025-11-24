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

  // Onboarding greeting message
  onboardingGreeting: (userName: string | null) => `👋 Hello${userName ? ' ' + userName : ''}! Welcome to NexFinApp!

I'm your financial assistant on WhatsApp. Let's get started!

📋 *First Steps:*
1. Create your first expense category
2. Add an expense
3. Set up budgets

👥 *To use in a group (for couples or families)*
1. Create a group with the people you want to share with
2. Click on the group name
3. Click on Invite via group link
4. Click on Send link via WhatsApp
5. Send the link to the bot and it will join automatically

💬 *How to use:*
You can speak naturally! For example:
• "Spent $50 on food"
• "Add $30 expense on transport"
• "Show my expenses"
• "Received $3000 salary"

📸 *Special Tip:*
You can also send me photos of bank SMS and I'll extract the data automatically using OCR!

💰 *Advanced Features:*
• Set monthly budgets for categories
• Get alerts when approaching limits
• View detailed financial reports

Type "help" anytime to see everything I can do.

Let's begin? 🚀`,

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
  },

  // Engagement: First Message & Welcome
  engagementFirstMessage: (contextualResponse: string | null) =>
    `Hi! Great to have you here 😊
${contextualResponse ? `\n${contextualResponse}\n` : ''}
Try saying something like "spent 50 on lunch" and see the magic happen.`,

  engagementFirstExpenseSuccess: `You just logged your first expense. Easy, right?`,

  engagementGuideToFirstExpense: `Try sending something like "spent 50 on lunch" and I'll take care of the rest!`,

  engagementFirstExpenseCelebration: (amount: string, category: string) =>
    `Done! I logged ${amount} in ${category} for you. Welcome to NexFin 😊`,

  // Engagement: Tier Unlock Messages
  engagementTier1Complete: `You've got the basics down!
Want to go further? Try setting a budget: "set food budget to 500"`,

  engagementTier2Complete: `You're not just tracking—you're planning!
Want to see the results? Try "report this month" to see your progress.`,

  engagementTier3Complete: `You're a pro now! You have complete control over your finances.
Any questions, just reach out.`,

  // Engagement: Contextual Hints
  engagementHintAddCategory: `Tip: you can create custom categories. Try "add category subscriptions"`,

  engagementHintSetBudget: `Tip: set limits to avoid overspending. Try "set transport budget to 300"`,

  engagementHintViewReport: `Tip: see how you're doing. Try "how much did I spend this month?"`,

  engagementHintFirstExpenseCategory: `💡 Want to create custom categories? Send "create category" to learn how!`,

  engagementHintBudgetSuggestion: (count: number, category: string) =>
    `💡 You have ${count} expenses in ${category}. Want to set a budget? Send "budget ${category} 500"`,

  // Engagement: Goodbye/Self-Select Messages (Story 4.3)
  engagementGoodbyeSelfSelect: `Hey! I noticed it's been a while since you dropped by 🤔

Everything okay? Let me know:
1️⃣ Confused about the app
2️⃣ Just busy right now
3️⃣ All good, just don't need it anymore

Just reply with the number that fits!`,

  // Legacy goodbye message (kept for backward compatibility)
  engagementGoodbyeMessage: `Hey! We noticed you've been quiet. No pressure—finances are personal.

Quick question before we go silent:
1️⃣ I was confused—help me out?
2️⃣ Just busy—remind me later
3️⃣ All good, I'll reach out when ready

(Or just ignore this, we'll be here 💙)`,

  // Story 4.4: Goodbye Response Processing - Updated messages per AC-4.4.6
  engagementGoodbyeResponse1: `No problem! Let me help you get started again. I'll send you some tips over the next few days. How about logging an expense? E.g., 'spent 50 on lunch'`,

  engagementGoodbyeResponse2: `Got it! See you in 2 weeks. I'll be here if you need anything in the meantime.`,

  engagementGoodbyeResponse3: `All good! The door is always open. Just send a message whenever you want to come back.`,

  engagementGoodbyeTimeout: `No worries, we'll stay quiet for now.
Whenever you want to come back, just send a message.`,

  engagementRemindLaterConfirm: `Hey again! It's been 2 weeks.
Want to pick up where you left off? Just send an expense.`,

  // Engagement: Help Flow (Response 1)
  engagementHelpFlowStart: `No problem! Let's start from the beginning.

The basics are simple: tell me about your expenses like you would in a conversation.

For example:
• "Spent 50 at the grocery store"
• "Paid 30 for uber yesterday"
• "Lunch 25 dollars"

Try sending an expense now.`,

  // Engagement: Weekly Review
  engagementWeeklyReviewActive: (summary: { totalTransactions: number; totalAmount: number }) =>
    `Hey! You logged ${summary.totalTransactions} expense${summary.totalTransactions > 1 ? 's' : ''} this week, totaling $${summary.totalAmount.toFixed(2)}.
You're doing great! Want to see the full report? Just send "report".`,

  // Engagement: Opt-Out
  engagementOptOutConfirm: `Got it! I won't send reminders anymore.
You can still use all features normally, just reach out anytime.`,

  engagementOptInConfirm: `Enabled! You'll now receive reminders and tips again.`,

  // Engagement: Dormant Reactivation
  engagementWelcomeBack: `Hey! Great to see you back. Pick up where you left off!`,

  // Engagement: Destination Switching (Story 4.6)
  engagementDestinationSwitchedToGroup: "Done! I'll now send messages in the group.",
  engagementDestinationSwitchedToIndividual: "Done! I'll now send messages privately.",
  engagementDestinationSwitchFailed: "Couldn't change preference. Try again?",
  engagementDestinationNeedGroupFirst: 'To receive messages in a group, send a message in the group first.'
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

