# API Contracts - Frontend (fe/)

## Overview

The frontend uses **Next.js 15 Server Actions** as the primary API layer, with a few REST API routes for webhooks and external integrations.

**Total API Surface**: ~4000 lines across 12 server action modules + 3 API routes

## Architecture Pattern

**Server Actions** (`lib/actions/*.ts`):
- Marked with `"use server"` directive
- Executed server-side with direct database access
- Type-safe RPC-style calls from client components
- Automatic request deduplication and caching
- Built-in CSRF protection

**Common Pattern**:
```typescript
"use server"
import { getSupabaseServerClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

export async function actionName(params) {
  const supabase = await getSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")

  // Database operation with user_id filter (RLS)
  const { data, error } = await supabase.from("table")...

  if (error) throw error
  revalidatePath("/path")  // Cache invalidation
  trackServerEvent(...)     // Analytics
  return data
}
```

---

## Server Actions by Module

### 1. Transactions (`actions/transactions.ts`)

**Purpose**: CRUD operations for income/expense transactions

**Actions**:
- `getTransactions(filters?)` - List transactions with filtering
  - Filters: startDate, endDate, categoryId, type, search
  - Returns: Transaction[] with joined category data
  - Sorted by date (desc)

- `createTransaction(formData)` - Create new transaction
  - Generates human-readable ID via DB function
  - Tracks first transaction milestone
  - Updates user analytics properties
  - Revalidates: /transactions, /dashboard, /reports

- `updateTransaction(id, updates)` - Update existing transaction
  - Validates ownership via RLS
  - Revalidates affected paths

- `deleteTransaction(id)` - Soft/hard delete transaction
  - Cascade handling for related records
  - Analytics tracking

**Security**: All queries filtered by `user_id` via Supabase RLS

---

### 2. Budgets (`actions/budgets.ts`)

**Purpose**: Budget management per category per month

**Actions**:
- `getBudgets(month?, year?)` - List budgets for period
  - Defaults to current month/year
  - Joins category data

- `getBudgetWithSpending(month?, year?)` - Budget vs actual spending
  - Calculates spending from transactions
  - Returns budget + spent + remaining

- `createBudget(data)` - Create monthly budget
  - Validates: amount > 0, unique category per month
  - Prevents duplicate budgets

- `updateBudget(id, data)` - Update budget amount

- `deleteBudget(id)` - Remove budget

**RLS**: User-scoped via `user_id` column

---

### 3. Categories (`actions/categories.ts`)

**Purpose**: Category management with icons and types

**Actions**:
- `getCategories(type?)` - List categories
  - Filter by: "income", "expense", or all
  - System + user-custom categories

- `createCategory(data)` - Create custom category
  - Fields: name, type, icon, color

- `updateCategory(id, updates)` - Modify category
  - Only user-created categories (not system)

- `deleteCategory(id)` - Remove custom category
  - Prevents deletion if used in transactions

---

### 4. Recurring Payments (`actions/recurring.ts`)

**Purpose**: Manage recurring/subscription expenses

**Actions**:
- `getRecurringPayments()` - List active recurring payments

- `createRecurringPayment(data)` - Set up recurring expense
  - Fields: amount, category, frequency (daily/weekly/monthly/yearly)
  - next_payment_date calculation

- `updateRecurringPayment(id, data)` - Modify recurring payment

- `deleteRecurringPayment(id)` - Cancel subscription

- `processRecurringPayments()` - Cron: Generate due transactions
  - Called by scheduled job
  - Creates transactions for payments due today

---

### 5. Reports (`actions/reports.ts`)

**Purpose**: Financial analytics and insights

**Actions**:
- `getMonthlyReport(month, year)` - Monthly summary
  - Total income, expenses, balance
  - Category breakdown
  - Comparison to previous month

- `getCategorySpending(startDate, endDate)` - Spending by category
  - Used for charts/visualizations

- `getSpendingTrends()` - 6-month trend analysis

- `exportTransactions(format)` - Export to CSV/Excel
  - Filtered by date range

---

### 6. Profile (`actions/profile.ts`)

**Purpose**: User profile and preferences

**Actions**:
- `getProfile()` - Get user profile
  - Includes: display name, currency, locale, timezone

- `updateProfile(data)` - Update profile settings
  - Updates Supabase auth.users metadata

- `getPreferences()` - User preferences
  - Theme, notifications, defaults

- `updatePreferences(prefs)` - Save preferences

---

### 7. Onboarding (`actions/onboarding.ts`)

**Purpose**: New user onboarding flow

**Actions**:
- `getOnboardingStatus()` - Check onboarding progress
  - Returns: completed steps, whatsapp_connected

- `updateOnboardingStep(step)` - Mark step complete
  - Steps: profile_setup, first_category, first_transaction, whatsapp_connected

- `connectWhatsApp(phoneNumber)` - Link WhatsApp account
  - Validates phone format
  - Creates pending session

- `sendOnboardingGreeting()` - Trigger WhatsApp welcome message

---

### 8. Admin (`actions/admin.ts`)

**Purpose**: Admin-only operations (requires admin role)

**Actions**:
- `getAllUsers()` - List all users (paginated)
  - Admin role check

- `getUserDetails(userId)` - Get user details
  - Transaction count, budget usage, last active

- `updateUserStatus(userId, status)` - Enable/disable user

- `deleteUserData(userId)` - Complete user deletion
  - Cascade: transactions, budgets, categories, sessions

**Security**: Requires `role = 'admin'` in user metadata

---

### 9. Groups (`actions/groups.ts`)

**Purpose**: Shared expense groups (future feature)

**Actions**: (Placeholder for group expense splitting)

---

### 10. Analytics (`actions/analytics.ts`)

**Purpose**: PostHog event tracking server-side

**Actions**:
- `trackEvent(event, properties)` - Track analytics event
  - Used internally by other actions

- `identifyUser(userId, traits)` - Set user properties

---

### 11. User Management (`actions/user.ts`)

**Purpose**: User account operations

**Actions**:
- `deleteAccount()` - User self-deletion
  - Deletes all user data
  - Signs out user
  - Anonymizes WhatsApp sessions

---

### 12. Beta Signup (`actions/beta-signup.ts`)

**Purpose**: Beta program enrollment

**Actions**:
- `joinBeta(email)` - Add to beta waitlist

---

## REST API Routes

### 1. `/api/onboarding/send-greeting` (POST)

**Purpose**: Webhook to trigger WhatsApp onboarding message

**Request**:
```json
{
  "userId": "uuid",
  "phoneNumber": "+5511999999999"
}
```

**Response**: 200 OK or error

**Authentication**: Service key required

---

### 2. `/api/whatsapp/send-batch-greetings` (POST)

**Purpose**: Admin endpoint for bulk WhatsApp messages

**Request**:
```json
{
  "userIds": ["uuid1", "uuid2"],
  "message": "text"
}
```

**Authentication**: Admin role required

---

### 3. `/[locale]/auth/callback` (GET)

**Purpose**: Supabase Auth callback handler

**Flow**: OAuth redirect → exchange code → set session → redirect to app

---

## Security Model

**Authentication**: Supabase Auth with JWT tokens
- Email/password signup
- OAuth providers (future)
- Session cookies (httpOnly, secure)

**Authorization**:
- Row Level Security (RLS) on all tables
- User-scoped queries via `user_id`
- Admin role checks for privileged operations
- Server Actions enforce auth before any operation

**CSRF Protection**: Built-in with Next.js Server Actions

**Rate Limiting**: (To be implemented)

---

## Analytics Integration

All mutations track events via PostHog:
- Transaction created/updated/deleted
- Budget created/exceeded
- Category created
- Recurring payment setup
- Onboarding milestones

Events include properties: amount, category, source, etc.

---

## Cache Strategy

**Revalidation Patterns**:
```typescript
revalidatePath("/dashboard")      // After transaction changes
revalidatePath("/transactions")   // After CRUD ops
revalidatePath("/budgets")        // After budget changes
revalidatePath("/reports")        // After data mutations
```

**Static Generation**: Layout, marketing pages
**Dynamic**: Dashboard, reports, transaction lists
**ISR**: None currently

---

## Error Handling

**Pattern**:
```typescript
try {
  const { data, error } = await supabase...
  if (error) throw error
  return data
} catch (error) {
  console.error("Action failed:", error)
  throw error  // Client handles with toast/error boundary
}
```

**Client-side handling**:
- Try/catch in form submissions
- Toast notifications for errors
- Error boundaries for unexpected failures

---

## Type Safety

All actions use TypeScript with Supabase generated types:
```typescript
import type { Database } from "@/lib/database.types"
type Transaction = Database["public"]["Tables"]["transactions"]["Row"]
```

Forms use Zod schemas matching server action signatures.

---

## Performance Considerations

- Server Actions deduplicate identical requests
- Supabase connection pooling
- Minimal data fetching (select only needed columns)
- Database indexes on user_id, date, category_id
- Edge runtime not used (needs Node.js APIs for Supabase)

---

**Generated**: 2025-11-21
**Part**: Frontend (fe/)
**Total Actions**: 50+ server actions across 12 modules
