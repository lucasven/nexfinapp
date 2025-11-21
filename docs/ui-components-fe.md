# UI Components - Frontend (fe/)

## Overview

The frontend uses **Next.js 15 App Router** with **React 19** and a component architecture built on **Radix UI** primitives styled with **Tailwind CSS 4**. All components are TypeScript with strict type safety.

**Total Components**: 68 .tsx files
**Component Library**: Radix UI (headless components)
**Styling**: Tailwind CSS 4 with custom design system
**Charts**: Recharts library for data visualization
**Icons**: Lucide React
**i18n**: next-intl for pt-BR/en translations

---

## Architecture Patterns

### Component Types

**1. UI Primitives** (`components/ui/`):
- Radix UI components wrapped with Tailwind styling (shadcn/ui pattern)
- Headless, accessible, composable
- 17 primitive components (button, dialog, card, input, select, etc.)

**2. Feature Components** (`components/`):
- Business logic components that compose UI primitives
- Connected to server actions and state
- 29 feature components (transaction-dialog, budget-card, etc.)

**3. Admin Components** (`components/admin/`):
- Analytics dashboards and admin tools
- 22 specialized components (charts, tables, dialogs)

**4. Onboarding Components** (`components/onboarding/`):
- Tutorial and onboarding flow
- 2 components (tutorial-overlay, resume-tour-fab)

### Common Patterns

**Client Component Pattern**:
```tsx
"use client"  // Opt into client-side interactivity

import { useState } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { trackEvent } from "@/lib/analytics/tracker"
import { createTransaction } from "@/lib/actions/transactions"

export function FeatureComponent() {
  const t = useTranslations()  // i18n hook
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    setLoading(true)
    await createTransaction(data)  // Server action call
    trackEvent(AnalyticsEvent.TRANSACTION_CREATED)
    setLoading(false)
  }

  return <Button onClick={handleSubmit}>{t('button.save')}</Button>
}
```

**Server Component Pattern** (default in Next.js 15):
```tsx
// No "use client" directive
import { getTransactions } from "@/lib/actions/transactions"
import { TransactionList } from "@/components/transaction-list"

export default async function TransactionsPage() {
  const transactions = await getTransactions()  // Direct server action call
  return <TransactionList data={transactions} />
}
```

**Form Pattern**:
```tsx
"use client"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function FormComponent() {
  const [formData, setFormData] = useState({
    amount: "",
    description: "",
  })

  return (
    <form onSubmit={handleSubmit}>
      <Label htmlFor="amount">{t('form.amount')}</Label>
      <Input
        id="amount"
        type="number"
        value={formData.amount}
        onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
      />
    </form>
  )
}
```

---

## Component Inventory

### 1. UI Primitives (`components/ui/`)

**Purpose**: Reusable, accessible, styled Radix UI components

| Component | Source | Purpose |
|-----------|--------|---------|
| `Button` | Radix UI | Primary/secondary/ghost/outline button variants |
| `Card` | Div wrapper | Container with header/content/footer sections |
| `Dialog` | Radix Dialog | Modal dialogs with overlay |
| `AlertDialog` | Radix AlertDialog | Confirmation dialogs for destructive actions |
| `Input` | HTML input | Text/number/date inputs with validation styles |
| `Label` | HTML label | Form labels with accessibility |
| `Select` | Radix Select | Dropdown selects with search |
| `Textarea` | HTML textarea | Multi-line text input |
| `Checkbox` | Radix Checkbox | Checkboxes with labels |
| `Table` | HTML table | Data tables with sorting/pagination support |
| `Tabs` | Radix Tabs | Tab navigation |
| `Dropdown` | Radix DropdownMenu | Context menus and action dropdowns |
| `Badge` | Div wrapper | Status badges (success, warning, error, info) |
| `Progress` | Radix Progress | Progress bars for budgets |
| `Skeleton` | Div wrapper | Loading skeletons |
| `Slider` | Radix Slider | Range sliders |
| `Tooltip` | Radix Tooltip | Hover tooltips |
| `Accordion` | Radix Accordion | Collapsible sections |
| `Form` | React Hook Form | Form validation wrapper (with Zod) |

**Styling Convention**:
- Tailwind utility classes
- CSS variables for theming (`--primary`, `--background`, etc.)
- Dark mode support (not yet implemented)

---

### 2. Feature Components (`components/`)

#### Transaction Management

**`transaction-dialog.tsx`**
- Purpose: Create/edit transaction form dialog
- Features:
  - Type toggle (income/expense)
  - Category dropdown with translated names
  - Amount, date, payment method, description fields
  - Onboarding integration (advances step after first transaction)
  - Analytics tracking (dialog opened, transaction created)
- Server Actions: `createTransaction()`, `updateTransaction()`, `advanceOnboardingStep()`
- i18n: Full translation support

**`transaction-list.tsx`**
- Purpose: Table of transactions with filtering
- Features:
  - Sortable columns (date, amount, category)
  - Edit/delete actions per row
  - Empty state messaging
  - Category icons + translated names
- Server Actions: `deleteTransaction()`

#### Budget Management

**`budget-dialog.tsx`**
- Purpose: Create/edit monthly budget form
- Features:
  - Category selection (expense categories only)
  - Amount input
  - Month/year picker
  - Validation (prevents duplicate budgets)
- Server Actions: `createBudget()`, `updateBudget()`

**`budget-card.tsx`**
- Purpose: Budget vs. actual spending display
- Features:
  - Progress bar (% of budget used)
  - Color coding (green → yellow → red as budget is exceeded)
  - Spending breakdown
  - Quick edit/delete actions
- Calculations: Client-side progress calculation from server data

#### Category Management

**`category-dialog.tsx`**
- Purpose: Create/edit custom categories
- Features:
  - Name, type (income/expense), icon, color
  - Icon picker (emoji selector)
  - Color picker (hex input)
  - Validation (unique names)
- Server Actions: `createCategory()`, `updateCategory()`

**`category-chart.tsx`**
- Purpose: Pie chart of spending/income by category
- Library: Recharts
- Features:
  - Responsive container
  - Color-coded slices
  - Tooltip with amounts
  - Empty state handling
- Data: Pre-aggregated from server

#### Recurring Payments

**`recurring-dialog.tsx`**
- Purpose: Set up recurring transactions
- Features:
  - Frequency selector (daily, weekly, monthly, yearly)
  - Day of month picker
  - Next payment date calculation
  - Active/inactive toggle
- Server Actions: `createRecurringPayment()`, `updateRecurringPayment()`

**`recurring-payment-card.tsx`**
- Purpose: Display single recurring payment
- Features:
  - Payment schedule summary
  - Next due date
  - Amount + category
  - Quick toggle active/inactive
- Server Actions: `updateRecurringPayment()`, `deleteRecurringPayment()`

**`upcoming-recurring-widget.tsx`**
- Purpose: Dashboard widget for upcoming payments
- Features:
  - Next 7 days of due payments
  - "Pay now" action
  - Snooze/skip options
- Server Actions: `processRecurringPayments()`

#### Reports & Analytics

**`reports-viewer.tsx`**
- Purpose: Monthly/yearly financial reports
- Features:
  - Period selector (month/year dropdowns)
  - Summary cards (income, expenses, balance, top category)
  - Category breakdown tables
  - Trend comparison (vs. previous period)
- Server Actions: `getMonthlyReport()`, `getCategorySpending()`

**`category-chart.tsx`**
- Pie chart for category breakdown (see above)

**`trend-chart.tsx`**
- Purpose: Line chart of income/expenses over time
- Library: Recharts
- Features:
  - Dual-axis (income + expenses)
  - 6-month trend
  - Responsive
- Server Actions: `getSpendingTrends()`

**`yearly-chart.tsx`**
- Purpose: Bar chart of monthly totals for year
- Library: Recharts
- Features:
  - Monthly bars (income vs. expenses)
  - Year-over-year comparison
  - Responsive

#### User Profile & Settings

**`profile-settings-card.tsx`**
- Purpose: User profile edit form
- Features:
  - Display name
  - Currency preference
  - Locale (pt-BR/en)
  - Timezone selection
- Server Actions: `updateProfile()`

**`user-menu.tsx`**
- Purpose: Navigation dropdown menu
- Features:
  - User avatar/name display
  - Links to profile, settings, admin (if admin)
  - Sign out action
- Server Actions: `signOut()` (Supabase auth)

**`language-switcher.tsx`**
- Purpose: Toggle between pt-BR and English
- Features:
  - Dropdown or toggle button
  - Saves preference to user profile
  - Updates i18n locale
- Server Actions: `updateProfile()`

#### WhatsApp Integration

**`whatsapp-numbers-card.tsx`**
- Purpose: Manage authorized WhatsApp numbers
- Features:
  - List of authorized numbers with names
  - Primary number indicator
  - Permissions display (can_view, can_add, etc.)
  - Add/edit/delete actions
- Server Actions: `getAuthorizedNumbers()`, `deleteAuthorizedNumber()`

**`whatsapp-number-dialog.tsx`**
- Purpose: Add/edit WhatsApp number authorization
- Features:
  - Phone number input (with validation)
  - Name/label input
  - Primary number toggle
  - Permissions checkboxes (granular permissions)
- Server Actions: `addAuthorizedNumber()`, `updateAuthorizedNumber()`

**`authorized-groups-card.tsx`**
- Purpose: Manage authorized WhatsApp groups
- Features:
  - List of authorized groups
  - Group JID + invite link
  - Active/inactive toggle
- Server Actions: `getAuthorizedGroups()`, `updateGroupStatus()`

#### Onboarding

**`tutorial-overlay.tsx`**
- Purpose: Interactive onboarding tutorial
- Features:
  - Step-by-step overlay with highlights
  - Progress indicator (step X of Y)
  - Skip/next/previous navigation
  - Highlights specific UI elements (spotlight effect)
  - Saves progress to user profile
- Server Actions: `advanceOnboardingStep()`, `completeOnboarding()`
- Steps:
  1. Welcome
  2. Add first category
  3. Add first transaction
  4. Connect WhatsApp
  5. Explore features

**`resume-tour-fab.tsx`**
- Purpose: Floating action button to resume incomplete onboarding
- Features:
  - Only shows if onboarding incomplete
  - Positioned bottom-right
  - Dismissible
- State: Checks `user_profiles.onboarding_completed`

#### Branding & UI Elements

**`nexfin-logo.tsx`**
- Purpose: App logo component
- Features:
  - SVG logo with text
  - Light/dark variants (not yet implemented)
  - Clickable (links to home)

**`balance-card.tsx`**
- Purpose: Dashboard summary card
- Features:
  - Total income
  - Total expenses
  - Net balance (income - expenses)
  - Period selector (month/year)
  - Color coding (positive = green, negative = red)
- Server Actions: `getMonthlyReport()`

**`beta-signup-form.tsx`**
- Purpose: Beta program enrollment form
- Features:
  - Email input
  - Marketing consent checkbox
  - Validation
  - Success/error messaging
- Server Actions: `joinBeta()`

---

### 3. Admin Components (`components/admin/`)

**Purpose**: Admin dashboard analytics and management tools

#### User Management

**`users-table.tsx`**
- Purpose: Admin table of all users
- Features:
  - Columns: Email, display name, WhatsApp #s, transactions, AI spend, daily limit, joined date
  - Actions: View details, update status, delete user
  - Pagination
- Server Actions: `getAllUsers()`, `updateUserStatus()`, `deleteUserData()`

**`user-details-dialog.tsx`**
- Purpose: Detailed user information dialog
- Features:
  - User profile summary
  - Transaction count + recent transactions
  - AI usage statistics
  - WhatsApp numbers
  - Admin actions (ban, delete, adjust limits)
- Server Actions: `getUserDetails()`

**`beta-signups-table.tsx`**
- Purpose: Beta program enrollments
- Features:
  - Columns: Email, signup date, invited status
  - Actions: Send invite, mark as invited
- Server Actions: `getBetaSignups()`, `sendBetaInvite()`

#### AI/NLP Analytics

**`ai-usage-table.tsx`**
- Purpose: Per-user AI cost tracking
- Features:
  - Columns: User, total cost, daily cost, LLM calls, cache hits, cache hit rate
  - Sorting by cost/usage
  - Export to CSV
- Server Actions: `getAIUsageStats()`

**`cache-hit-rate-chart.tsx`**
- Purpose: Line chart of semantic cache performance over time
- Library: Recharts
- Features:
  - Daily cache hit rate %
  - LLM calls vs. cache hits trend
  - Goal line (60% target)
- Server Actions: `getCacheHitRateTimeseries()`

#### Category Intelligence Analytics

**`category-corrections-bar-chart.tsx`**
- Purpose: Bar chart of category corrections by original category
- Library: Recharts
- Features:
  - Shows which categories are most often corrected
  - Helps identify weak category matching
- Server Actions: `getCategoryCorrections()`

**`correction-rate-chart.tsx`**
- Purpose: Pie chart of correction rates
- Features:
  - % of transactions corrected vs. accepted
  - By match type (OCR, NLP, merchant, etc.)

**`low-confidence-matches-table.tsx`**
- Purpose: Table of transactions with low category confidence (< 0.80)
- Features:
  - Columns: Description, category, confidence, match type, user
  - Actions: Review, correct category
  - Helps improve NLP patterns
- Server Actions: `getLowConfidenceMatches()`

**`match-type-pie-chart.tsx`**
- Purpose: Distribution of match types (exact, fuzzy, merchant, etc.)
- Library: Recharts
- Features:
  - Shows which matching strategies are used most
  - Helps optimize matching pipeline

#### Merchant Mapping Analytics

**`merchant-category-mapping-table.tsx`**
- Purpose: Table of merchant → category mappings
- Features:
  - Columns: Merchant name, category, confidence, usage count, global/user-specific
  - Actions: Edit, delete, add new mapping
  - Filter by global/user-specific
- Server Actions: `getMerchantMappings()`, `updateMerchantMapping()`

**`merchant-mapping-dialog.tsx`**
- Purpose: Create/edit merchant mapping
- Features:
  - Merchant name input (autocomplete from transaction descriptions)
  - Category dropdown
  - Confidence slider (0.0-1.0)
  - Global vs. user-specific toggle
- Server Actions: `createMerchantMapping()`, `updateMerchantMapping()`

**`merchant-recognition-bar-chart.tsx`**
- Purpose: Bar chart of merchant recognition rates
- Features:
  - Top merchants by transaction count
  - Recognition rate % (how often auto-matched)
  - Helps identify merchants needing mappings

**`merchant-coverage-chart.tsx`**
- Purpose: Pie chart of transactions with/without merchant mappings
- Features:
  - % of transactions matched via merchant mapping
  - % needing manual classification

#### Synonym Management

**`synonym-management.tsx`**
- Purpose: Table of category synonyms
- Features:
  - List of all synonyms per category
  - Language filter (pt-BR/en)
  - Merchant flag indicator
  - Actions: Add, edit, delete synonym
- Server Actions: `getCategorySynonyms()`, `deleteSynonym()`

**`synonym-dialog.tsx`**
- Purpose: Add/edit synonym
- Features:
  - Category dropdown
  - Synonym text input
  - Language selector
  - Is merchant checkbox
  - Confidence slider
- Server Actions: `createSynonym()`, `updateSynonym()`

#### Parsing & NLP Analytics

**`intent-distribution-chart.tsx`**
- Purpose: Pie chart of intent types (add_expense, set_budget, list, etc.)
- Library: Recharts
- Features:
  - Shows most common user intents
  - Helps optimize command coverage

**`command-coverage-heatmap.tsx`**
- Purpose: Heatmap of command usage by hour/day
- Library: Recharts
- Features:
  - X-axis: Hour of day (0-23)
  - Y-axis: Day of week
  - Color intensity: Command count
  - Helps identify peak usage times

**`strategy-distribution-pie-chart.tsx`**
- Purpose: Distribution of intent parsing strategies (Layer 1/2/3)
- Features:
  - % of messages handled by each layer
  - Goal: 60% cache hits (Layer 2)

**`strategy-performance-chart.tsx`**
- Purpose: Bar chart of average latency by strategy
- Features:
  - Layer 1 (explicit): ~10ms
  - Layer 2 (cache): ~50-100ms
  - Layer 3 (LLM): ~800-1500ms

**`entity-extraction-table.tsx`**
- Purpose: Table of extracted entities (amounts, dates, categories) from NLP
- Features:
  - Shows entity extraction accuracy
  - Columns: Message, extracted entities, correct/incorrect
  - Actions: Mark as correct/incorrect to improve model

**`pattern-quality-table.tsx`**
- Purpose: Table of learned patterns with quality scores
- Features:
  - Columns: Pattern text, category, frequency, accuracy
  - Actions: Archive low-quality patterns

**`retry-patterns-table.tsx`**
- Purpose: Table of messages that required retries (failed Layer 2, succeeded Layer 3)
- Features:
  - Helps identify cache gaps
  - Actions: Add to cache manually

#### OCR Analytics

**`ocr-success-rate-chart.tsx`**
- Purpose: Line chart of OCR success rates over time
- Library: Recharts
- Features:
  - % of receipts successfully extracted
  - By image quality (good, fair, poor)
  - Helps monitor Tesseract.js performance

---

### 4. Page Routes (`app/[locale]/`)

**Total Routes**: 21 pages

#### Public Routes

| Route | File | Purpose |
|-------|------|---------|
| `/` | `[locale]/page.tsx` | Landing page (redirects to dashboard if authenticated) |
| `/landing` | `[locale]/landing/page.tsx` | Marketing landing page |
| `/auth/login` | `[locale]/auth/login/page.tsx` | Email/password login |
| `/auth/signup` | `[locale]/auth/signup/page.tsx` | User registration |
| `/auth/forgot-password` | `[locale]/auth/forgot-password/page.tsx` | Password reset request |
| `/auth/reset-password` | `[locale]/auth/reset-password/page.tsx` | Password reset form (with token) |

#### Authenticated Routes

| Route | File | Purpose |
|-------|------|---------|
| `/categories` | `[locale]/categories/page.tsx` | Category management (list + CRUD) |
| `/budgets` | `[locale]/budgets/page.tsx` | Budget management (list + CRUD) |
| `/recurring` | `[locale]/recurring/page.tsx` | Recurring payments management |
| `/reports` | `[locale]/reports/page.tsx` | Financial reports & charts |
| `/profile` | `[locale]/profile/page.tsx` | User profile settings |
| `/settings/account` | `[locale]/settings/account/page.tsx` | Account settings (delete account, etc.) |
| `/onboarding` | `[locale]/onboarding/page.tsx` | Onboarding flow entry |
| `/onboarding/welcome` | `[locale]/onboarding/welcome/page.tsx` | Onboarding welcome screen |

#### Admin Routes (requires `is_admin=true`)

| Route | File | Purpose |
|-------|------|---------|
| `/admin` | `[locale]/admin/page.tsx` | Admin dashboard overview |
| `/admin/overview` | `[locale]/admin/overview/page.tsx` | System metrics summary |
| `/admin/users` | `[locale]/admin/users/page.tsx` | User management table |
| `/admin/ai-usage` | `[locale]/admin/ai-usage/page.tsx` | AI cost analytics |
| `/admin/beta-signups` | `[locale]/admin/beta-signups/page.tsx` | Beta program management |
| `/admin/category-analytics` | `[locale]/admin/category-analytics/page.tsx` | Category intelligence analytics |
| `/admin/parsing-analytics` | `[locale]/admin/parsing-analytics/page.tsx` | NLP/OCR analytics |

---

## Internationalization (i18n)

**Library**: next-intl
**Locales**: `pt-BR` (default), `en`

**Usage Pattern**:
```tsx
import { useTranslations } from 'next-intl'

export function Component() {
  const t = useTranslations()

  return (
    <div>
      <h1>{t('dashboard.title')}</h1>
      <p>{t('dashboard.welcome', { name: 'Lucas' })}</p>
    </div>
  )
}
```

**Translation Files**:
- `fe/lib/localization/pt-br.ts` - Portuguese (Brazil)
- `fe/lib/localization/en.ts` - English
- `fe/lib/localization/types.ts` - TypeScript types for type-safe translations

**Category Translation**:
- Categories have English system names in database
- `translateCategoryName(name, locale)` helper translates to user locale
- Example: "Food & Dining" → "Alimentação" (pt-BR)

---

## State Management

**Server State**: Next.js Server Components (default)
- Data fetched server-side via Server Actions
- No client-side state management library needed
- `router.refresh()` revalidates server data

**Client State**: React hooks (`useState`, `useEffect`)
- Form state management
- UI state (dialog open/close, loading states)
- No Redux/Zustand needed for current complexity

**Form State**: Native React state
- Could upgrade to React Hook Form for complex forms with validation
- Zod schemas for validation (already integrated with some forms)

---

## Analytics Integration

**Library**: PostHog (via `fe/lib/analytics/`)

**Pattern**:
```tsx
import { trackEvent } from '@/lib/analytics/tracker'
import { AnalyticsEvent } from '@/lib/analytics/events'

trackEvent(AnalyticsEvent.TRANSACTION_CREATED, {
  amount: 100,
  category: 'food',
  source: 'web'
})
```

**Tracked Events**:
- User registration, login, logout
- Transaction created/updated/deleted
- Budget created/exceeded
- Category created
- Recurring payment setup
- Onboarding milestones
- Dialog opened/closed
- Report viewed

**User Identification**:
- PostHog `identify()` called on login with `user_id`
- User properties: email, locale, created_at, transaction_count

---

## Styling System

**Framework**: Tailwind CSS 4
**Design Tokens**: CSS variables in `fe/app/globals.css`

**Key Variables**:
```css
:root {
  --background: 0 0% 100%;
  --foreground: 222.2 84% 4.9%;
  --primary: 222.2 47.4% 11.2%;
  --primary-foreground: 210 40% 98%;
  --secondary: 210 40% 96.1%;
  --secondary-foreground: 222.2 47.4% 11.2%;
  --muted: 210 40% 96.1%;
  --muted-foreground: 215.4 16.3% 46.9%;
  --accent: 210 40% 96.1%;
  --accent-foreground: 222.2 47.4% 11.2%;
  --destructive: 0 84.2% 60.2%;
  --destructive-foreground: 210 40% 98%;
  --border: 214.3 31.8% 91.4%;
  --input: 214.3 31.8% 91.4%;
  --ring: 222.2 84% 4.9%;
  --radius: 0.5rem;
}
```

**Responsive Breakpoints**:
- `sm`: 640px
- `md`: 768px
- `lg`: 1024px
- `xl`: 1280px
- `2xl`: 1536px

**Component Variants** (example):
```tsx
<Button variant="default">Default</Button>
<Button variant="destructive">Delete</Button>
<Button variant="outline">Cancel</Button>
<Button variant="ghost">Link-like</Button>
<Button variant="link">Underline link</Button>
```

---

## Performance Considerations

**Code Splitting**:
- Next.js 15 automatic code splitting per route
- Dynamic imports for heavy components (charts, dialogs)

**Image Optimization**:
- Next.js `<Image>` component for automatic optimization
- Lazy loading below the fold

**Server Components**:
- Default to Server Components (no "use client")
- Only mark interactive components as client components
- Reduces JavaScript bundle size

**Data Fetching**:
- Server-side data fetching in page components
- Parallel data fetching where possible
- `revalidatePath()` for targeted cache invalidation

**Bundle Size**:
- Radix UI: ~20KB (tree-shaken)
- Recharts: ~100KB (code-split per chart type)
- Lucide Icons: Tree-shaken (only used icons)
- Total JS bundle (estimated): ~200KB gzipped

---

## Accessibility (a11y)

**Radix UI Benefits**:
- All primitives are WCAG 2.1 compliant
- Keyboard navigation built-in
- Screen reader support
- Focus management

**Additional Measures**:
- Semantic HTML (headings, landmarks)
- `aria-label` on icon-only buttons
- Form labels with `htmlFor`
- Color contrast ratios (WCAG AA minimum)

**Testing**:
- Manual keyboard navigation testing
- Screen reader testing (NVDA, JAWS) - not yet systematic

---

## Testing Strategy

**Current State**: Limited component testing

**Recommended Approach**:
- **Unit Tests**: React Testing Library for component logic
- **Integration Tests**: Test component + server action integration
- **E2E Tests**: Playwright for critical user flows (login, create transaction, etc.)

**Example Test Structure**:
```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { TransactionDialog } from './transaction-dialog'

test('creates transaction on form submit', async () => {
  render(<TransactionDialog categories={mockCategories} />)

  fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '100' } })
  fireEvent.click(screen.getByText('Save'))

  await waitFor(() => {
    expect(createTransaction).toHaveBeenCalledWith({ amount: 100, ... })
  })
})
```

---

## Future Enhancements

**Planned**:
- Dark mode support (design tokens ready)
- React Hook Form + Zod for all forms (currently partial)
- Storybook for component documentation
- E2E testing with Playwright
- Progressive Web App (PWA) support
- Offline mode with IndexedDB cache
- Real-time updates via Supabase subscriptions
- WebSocket for live notifications

**Under Consideration**:
- Component library extraction (npm package)
- Design system documentation site
- A/B testing framework integration
- Accessibility audit tooling (axe-core)

---

**Generated**: 2025-11-21
**Component Count**: 68 .tsx files
**Page Routes**: 21 routes
**UI Library**: Radix UI + Tailwind CSS 4
**i18n**: next-intl (pt-BR, en)
