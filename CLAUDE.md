# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an expense tracking application with two main components:
- **Frontend (fe/)**: Next.js 15 web app with internationalization (pt-BR/en) using next-intl
- **WhatsApp Bot (whatsapp-bot/)**: Node.js bot using Baileys library for WhatsApp integration

## Architecture

### Frontend (`fe/`)
- **Framework**: Next.js 15 with App Router
- **UI**: Radix UI components with Tailwind CSS
- **State**: React Hook Form with Zod validation
- **Analytics**: PostHog integration
- **Database**: Supabase (PostgreSQL with pgvector extension)
- **Internationalization**: next-intl with locale-based routing (`/[locale]/...`)

### WhatsApp Bot (`whatsapp-bot/`)
- **Core**: TypeScript with ESM modules
- **WhatsApp**: Baileys library for WhatsApp Web API
- **NLP**: 3-layer architecture (Explicit Commands → Semantic Cache → OpenAI LLM)
- **OCR**: Tesseract.js for receipt scanning with Sharp for image processing
- **Database**: Shared Supabase instance with frontend

### Database Architecture
- PostgreSQL with pgvector extension for semantic search
- 17+ migration scripts in `fe/scripts/`
- Key tables: users, transactions, categories, user_profiles, message_embeddings, user_ai_usage

## Common Development Commands

### Frontend Development
```bash
cd fe
npm install              # Install dependencies
npm run dev             # Start dev server (http://localhost:3000)
npm run build           # Production build
npm run lint            # Run ESLint
```

### WhatsApp Bot Development
```bash
cd whatsapp-bot
npm install              # Install dependencies
npm run dev             # Start with ts-node
npm run build           # Compile TypeScript
npm run start           # Run production build
npm test                # Run all tests
npm test -- --watch    # Watch mode for tests
npm test -- path/to/test.ts  # Run specific test file
```

### Database Migrations
```bash
# Connect to Supabase and run migrations
psql $DATABASE_URL < fe/scripts/001_initial_schema.sql
# Run migrations in order (001 through 046)
# Latest: 046_payment_due_date.sql (Story 4.1 - Payment due date for Credit Mode cards)
# Previous: 045_budget_calculation_function.sql (Story 3.3 - Budget progress calculation)
# Previous: 044_statement_period_calculation.sql (Story 3.1 - Statement period function)
# Previous: 043_budget_with_installments.sql (Story 2.8 - Budget calculation with installments)
```

## Key Implementation Details

### WhatsApp Bot Message Flow
1. Message arrives at `whatsapp-bot/src/index.ts`
2. User identification via multi-identifier system (`utils/user-identifiers.ts`):
   - Extracts JID (always available), LID (Business accounts), phone number
   - Supports both regular WhatsApp and WhatsApp Business accounts
   - Handles group messages with participant identification
3. Authorization check via `middleware/authorization.ts`:
   - Cascading lookup: JID → LID → phone number → legacy sessions
   - Automatic identifier sync on first message
   - Database function: `find_user_by_whatsapp_identifier()`
4. Intent parsing in `handlers/message-handler.ts`:
   - Layer 1: Explicit commands (`/add`, `/budget`, etc.) - Always processed first ✓
   - Layer 2: Semantic cache lookup (pgvector similarity search) - Performance optimization ✓
   - Layer 3: OpenAI function calling (GPT-4o-mini) - **PREFERRED for new intents** ✓
   - Layer 4: NLP fallback (`nlp/intent-parser.ts`) - **LEGACY, do not extend** ⚠️

   **AI-First Development Guidance:**
   - For new intent types: Extend AI prompts in `services/ai/ai-pattern-generator.ts`
   - Do NOT add patterns to `nlp/intent-parser.ts` (legacy, low accuracy)
   - NLP parser remains for backward compatibility and explicit commands only
   - Target: 95%+ intent accuracy via AI (vs 60% with NLP)
   - See Epic 8 tech spec for AI-first architecture details

5. Transaction handlers in `handlers/transactions/`
6. Response via localization system (`localization/pt-br.ts`)

### Frontend User Flow
1. Landing page at `/[locale]/` with onboarding
2. Main app at `/[locale]/categories`, `/[locale]/transactions`
3. Installment creation via transaction form with conditional rendering (Story 2.2)
   - Credit Mode credit cards show installment toggle
   - Real-time monthly payment calculation
   - Redirects to `/[locale]/installments` on success
4. Server actions in `lib/actions/` for data mutations
   - `lib/actions/transactions.ts` - Regular transactions
   - `lib/actions/installments.ts` - Installment creation (Story 2.2)
   - `lib/actions/budget.ts` - Budget progress calculation (Story 3.3)
5. Supabase client setup in `lib/supabase/`
6. Analytics events tracked in `lib/analytics/events.ts`
7. Budget progress dashboard (Story 3.3)
   - Budget widgets displayed for Credit Mode cards with budget set
   - Real-time updates via React Query cache invalidation
   - Statement period calculation using `calculate_statement_period()` function
   - Spent calculation includes transactions + installment payments

### Budget Progress System (Story 3.3)
- **Component Architecture:**
  - `BudgetProgressWidget` - Main widget component with awareness-first design
  - `BudgetProgressBar` - Progress bar with status-based colors
  - `BudgetProgressWidgetsSection` - Client component that fetches all budget progress
- **Data Flow:**
  - Server Actions: `getBudgetProgress()`, `getAllBudgetProgress()` in `lib/actions/budget.ts`
  - Database Function: `calculate_statement_budget_spent()` (Migration 045)
  - React Query Hooks: `useBudgetProgress()`, `useAllBudgetProgress()` in `lib/hooks/useBudgetProgress.ts`
  - 5-minute cache with automatic invalidation on transaction mutations
- **Budget Calculation:**
  - Current statement period determined by `calculate_statement_period(closing_day, today)`
  - Total spent = Regular expenses + Pending installment payments in period
  - Status: on-track (0-79%), near-limit (80-99%), exceeded (100%+)
- **Performance:**
  - NFR5: Budget calculation MUST complete < 200ms (critical path)
  - Dashboard load < 1 second with 5 widgets
  - Parallel queries for multiple cards with Promise.all()
- **Awareness-First Design:**
  - Neutral colors: Blue (on-track), Yellow/Amber (near-limit), Gray (exceeded)
  - NO RED colors for overspending
  - Non-judgmental language: "R$ 200 acima do planejado" NOT "OVERSPENT!"
  - Positive framing: "Sobraram R$ 1.200" NOT "You have R$ 1,200 left"
- **Cache Invalidation:**
  - Transaction dialog automatically invalidates budget cache on add/edit/delete
  - Uses `useInvalidateBudgetProgress()` hook
  - Ensures real-time updates < 300ms

### Statement Period Badges (Story 3.6)
- **Purpose**: Visual indicators showing which statement period each transaction belongs to
- **Component Architecture:**
  - `StatementBadge` - Badge component displaying period (current/next/past) with neutral colors
  - Integrated into `TransactionList` component
  - Appears next to transaction amounts
- **Period Calculation:**
  - Helper functions in `fe/lib/utils/statement-period.ts`:
    - `getStatementPeriodForDate()` - Determines period for a specific transaction date
    - `getBadgesForTransactions()` - Batch calculation for multiple transactions
  - WhatsApp helper functions in `whatsapp-bot/src/utils/statement-period-helpers.ts`
  - Uses same `calculate_statement_period()` logic as budget widgets for consistency
- **Display Rules:**
  - Only shown for Credit Mode payment methods (`credit_mode = true`)
  - Only shown when `statement_closing_day` is set
  - No badge for Simple Mode or non-credit payment methods
- **Badge Types:**
  - Current Statement: Blue badge ("Fatura atual" / "Current statement")
  - Next Statement: Gray badge ("Próxima fatura" / "Next statement")
  - Past Statement: Light gray badge ("Fatura passada" / "Past statement")
- **Awareness-First Design:**
  - Neutral colors only: Blue, Gray, Light gray - NO RED
  - Non-judgmental language: "Fatura atual" not "DUE SOON"
  - Small, non-intrusive badge size
  - Subtle presentation, informational tone
- **Performance:**
  - Batch calculation: < 100ms for 50 transactions (Epic3-P4)
  - Period calculation: < 50ms (Epic3-P1)
  - Caching of period boundaries by payment method
  - React.memo optimization to avoid re-renders
- **WhatsApp Integration:**
  - Period context added to expense confirmation messages
  - Format: "📊 Fatura atual (6 Dez - 5 Jan)"
  - Only shown for Credit Mode transactions
- **Localization:**
  - Full pt-BR and English support
  - Keys in `fe/lib/localization/` and `whatsapp-bot/src/localization/`
  - Locale-specific date formatting

### Payment Due Date System (Story 4.1)
- **Purpose**: Configure when credit card payments are due (days after statement closing)
- **Component Architecture:**
  - `PaymentDueSettings` - Settings component in credit card settings page
  - Real-time preview of payment due date as user enters value
  - Save button with loading state and toast notifications
  - Localized (pt-BR/en)
- **Data Model:**
  - Database column: `payment_methods.payment_due_day` (INTEGER, nullable)
  - Range: 1-60 days after statement closing
  - CHECK constraint validates range in database
  - Example: closing_day=5, payment_due_day=10 → due on 15th of each month
- **Calculation:**
  - Helper function: `calculatePaymentDueDate()` in `fe/lib/utils/payment-due-date.ts`
  - Uses statement period logic to determine next closing date
  - Adds payment_due_day to closing date
  - Handles edge cases: month boundaries, year boundaries, leap years
  - Example edge case: closing day 25 + due day 10 = 35 → 5th of next month
- **Server Actions:**
  - `setPaymentDueDate(paymentMethodId, paymentDueDay)` - Save payment due day
  - `getPaymentDueDatePreview(paymentMethodId, paymentDueDay)` - Real-time preview
  - Both in `fe/lib/actions/payment-methods.ts`
- **Prerequisites:**
  - Credit Mode must be enabled (`credit_mode = true`)
  - Statement closing day must be set (`statement_closing_day IS NOT NULL`)
  - Settings UI hidden if prerequisites not met
- **Conditional Rendering:**
  - Only shown for Credit Mode credit cards with closing day set
  - If closing day not set: Shows message "Configure statement closing date first"
  - Simple Mode cards do NOT see payment due settings
- **Analytics:**
  - Event: `payment_due_date_set` tracked via PostHog
  - Properties: paymentMethodId, paymentDueDay, closingDay, calculatedDueDate
  - Tracked after successful database update
- **Performance:**
  - Due date calculation: < 50ms (NFR-Epic4-P1)
  - Preview fetch: < 100ms (debounced 300ms)
  - Save operation: < 200ms
- **Foundation for Epic 4:**
  - Story 4.2: WhatsApp payment reminders (2 days before due) ✅ IMPLEMENTED
  - Story 4.3: Auto-create payment transactions on due date ✅ IMPLEMENTED
  - Story 4.4: Edit/delete auto-generated payments
  - Story 4.5: System category for credit card payments (REQUIRED FOR 4.3)

### Payment Due Reminders System (Story 4.2)
- **Purpose**: Send WhatsApp reminders 2 days before credit card payment due date
- **Schedule**: Daily cron job at 12:00 UTC (9 AM Brazil time)
- **Target**: 99.5% delivery success rate (NFR8), < 30 seconds execution time (NFR6)

**Architecture:**
- **Eligibility Query** (`services/reminders/payment-reminder-query.ts`):
  - Credit Mode enabled (`credit_mode = true`)
  - Statement closing day set (`statement_closing_day IS NOT NULL`)
  - Payment due day set (`payment_due_day IS NOT NULL`)
  - Payment due in exactly 2 days
  - WhatsApp authorized (JID/LID/phone)
  - Not opted out (`payment_reminders_enabled != false`)
- **Statement Total Calculator** (`services/reminders/statement-total-calculator.ts`):
  - Uses same query logic as budget calculator (regular expenses + installment payments)
  - Performance target: < 500ms (NFR-Epic4-P2)
  - Single source of truth for statement totals
- **Message Builder** (`services/reminders/reminder-message-builder.ts`):
  - Localized messages (pt-BR/en) with awareness-first language
  - Dynamic content: card name, due date, statement total, statement period
  - Neutral tone: "Lembrete: Pagamento do cartão" NOT "WARNING: PAYMENT DUE!"
  - Format: "Vence em 2 dias (15 Jan)" NOT "URGENT: DUE SOON!"
- **Delivery** (`services/reminders/reminder-sender.ts`):
  - Reuses existing retry infrastructure from Story 3.4
  - Exponential backoff retry: 1s, 5s (max 3 attempts)
  - Error classification: transient (retry) vs permanent (skip)
  - Multi-identifier lookup (JID → LID → phone)
- **Job Handler** (`services/scheduler/credit-card-payment-reminders-job.ts`):
  - Batch processing: 10 users in parallel
  - Individual error isolation (one failure doesn't halt job)
  - PostHog event tracking: `payment_reminder_sent`, `payment_reminder_failed`, `payment_reminder_job_completed`
  - Alerts if success rate < 99% or execution time > 30 seconds

**Key Design Decisions:**
1. Separate from recurring payment reminders (`payment-reminders-job.ts`)
2. Reuses shared infrastructure from Statement Reminders (Story 3.4)
3. Awareness-first messaging: neutral, informational, non-judgmental
4. 2-day advance notice provides actionable awareness without urgency
5. In-process handler (needs WhatsApp socket access)

**Localization:**
- Full pt-BR and English support
- Keys in `whatsapp-bot/src/localization/pt-br.ts` and `en.ts`
- Locale-specific date and currency formatting

**Analytics Events:**
- `payment_reminder_sent`: Successful delivery with 10 properties
- `payment_reminder_failed`: Failed delivery with error classification
- `payment_reminder_job_completed`: Job completion metrics

**Scheduler Integration:**
- Registered in `whatsapp-bot/src/scheduler.ts`
- Schedule: `0 12 * * *` (daily at 9 AM Brazil time)
- Runs in-process to share WhatsApp connection

### Auto-Payment Transaction Creation System (Story 4.3)
- **Purpose**: Automatically create payment transactions when credit card statements close
- **Schedule**: Daily cron job at 4:00 UTC (1 AM Brazil time)
- **Target**: 100% success rate (NFR12), < 30 seconds execution time for 100 statements

**Architecture:**
- **Eligibility Query** (`services/scheduler/auto-payment-transactions-job.ts`):
  - Credit Mode enabled (`credit_mode = true`)
  - Statement closed YESTERDAY (`statement_closing_day = EXTRACT(DAY FROM CURRENT_DATE - 1)`)
  - Payment due day set (`payment_due_day IS NOT NULL`)
  - Example: If today is Jan 6, find all cards with `statement_closing_day = 5`
- **Statement Total Calculator** (reuses `services/reminders/statement-total-calculator.ts`):
  - Same calculation as payment reminders and budget dashboard
  - Regular expenses + installment payments in statement period
  - Single source of truth for consistency
  - Performance target: < 500ms (NFR-Epic4-P2)
- **Transaction Creator** (`services/scheduler/transaction-creator.ts`):
  - Idempotency check: prevents duplicate transactions via metadata matching
  - System category lookup: "Pagamento Cartão de Crédito" (Story 4.5 dependency)
  - Default bank account assignment: auto-assigns if user has default bank account
  - Localized description: "Pagamento Cartão [Name] - Fatura [MonthYear]"
  - Transaction metadata: `{ auto_generated: true, credit_card_id, statement_period, statement_total }`
- **Job Handler** (`services/scheduler/auto-payment-transactions-job.ts`):
  - Batch processing: 10 statements in parallel
  - Individual error isolation (one failure doesn't halt batch)
  - PostHog event tracking: `auto_payment_created`, `auto_payment_creation_failed`, `auto_payment_job_completed`
  - Alerts if success rate < 100% or execution time > 30 seconds

**Key Design Decisions:**
1. Runs at 1 AM (after midnight statement closings at 12:00 AM)
2. Reuses Epic 3 statement total calculation for consistency
3. Auto-assigns default bank account (reduces manual work for 90%+ users)
4. Idempotency via metadata (no separate tracking table needed)
5. Transaction date = payment due date (correct accrual accounting)

**Transaction Fields:**
- `user_id`: From payment_methods.user_id
- `amount`: Statement total (regular expenses + installments)
- `description`: Localized (pt-BR/en)
- `date`: Payment due date (closing_date + payment_due_day)
- `type`: 'expense' (payment is an expense)
- `category_id`: System category "Pagamento Cartão de Crédito"
- `payment_method_id`: Default bank account or NULL
- `metadata`: `{ auto_generated: true, source: 'payment_reminder', credit_card_id, statement_period_start, statement_period_end, statement_total }`

**Frontend Integration:**
- **Auto-Generated Badge** (`fe/components/transaction-list.tsx`):
  - Displays "Auto-gerado" (pt-BR) / "Auto-generated" (en) badge
  - Badge shown when `transaction.metadata.auto_generated === true`
  - Neutral gray badge, small size, next to transaction description
- **Transaction Appearance**:
  - Appears in transaction list grouped by payment due date (NOT closing date)
  - Editable/deletable like any other transaction (Story 4.4)
  - Included in payment month budget calculations

**Edit/Delete Auto-Generated Payments (Story 4.4):**
- **Purpose**: Provide user control over system-generated data
- **Edit Functionality**:
  - All fields editable: amount, date, payment method, category, description
  - No restrictions on auto-generated transactions
  - `metadata.auto_generated` flag remains true after edit (audit trail)
  - Badge remains visible after edit (transparency)
  - Analytics event tracked: `auto_payment_edited` with fieldsChanged array
- **Delete Functionality**:
  - Custom confirmation dialog for auto-generated transactions
  - Message: "Esta transação foi gerada automaticamente. Você tem certeza que deseja deletá-la?" (pt-BR)
  - Message: "This transaction was auto-generated. Are you sure you want to delete it?" (en)
  - No side effects: deletion doesn't prevent future auto-payments
  - Analytics event tracked: `auto_payment_deleted` with transaction details
- **Implementation**:
  - Reuses existing `updateTransaction()` and `deleteTransaction()` server actions
  - Analytics tracking in `fe/lib/actions/transactions.ts`
  - Custom confirmation in `fe/components/transaction-list.tsx`
  - Helper function: `getChangedFields()` compares old vs new transaction
- **Budget Impact**:
  - Edit/delete automatically invalidates budget cache
  - Real-time updates < 300ms (reuses Epic 3 infrastructure)
  - Budget calculations updated immediately

**Localization:**
- Full pt-BR and English support
- Keys in `whatsapp-bot/src/localization/pt-br.ts` and `en.ts`
- Frontend keys in `fe/lib/localization/pt-br.ts` and `en.ts`
- Locale-specific date and currency formatting

**Analytics Events:**
- `auto_payment_created`: Successful transaction creation (per transaction)
- `auto_payment_creation_failed`: Failed transaction creation with error type
- `auto_payment_job_completed`: Job completion metrics

**Scheduler Integration:**
- Registered in `whatsapp-bot/src/scheduler.ts`
- Schedule: `0 4 * * *` (daily at 1 AM Brazil time)
- Runs in-process (follows existing pattern, doesn't need WhatsApp socket)

**Dependencies:**
- Story 4.1: `payment_due_day` column (COMPLETE)
- Story 4.5: System category "Pagamento Cartão de Crédito" (REQUIRED BEFORE 4.3)
- Epic 3: `calculate_statement_period()` and statement total functions (COMPLETE)

### System Category for Credit Card Payments (Story 4.5)
- **Purpose**: Create system-managed category for auto-generated payment transactions
- **Migration**: `047_system_category_payment.sql`
- **Target**: < 50ms category query (first), < 1ms (cached)

**Database Implementation:**
- **System Categories** (`categories` table):
  - Two system categories created: "Pagamento Cartão de Crédito" (pt-BR) and "Credit Card Payment" (en)
  - `is_system = true` flag prevents deletion
  - `user_id = NULL` makes category visible to all users
  - Partial index on `is_system` for efficient queries
- **RLS Policies**:
  - SELECT: `user_id = auth.uid() OR is_system = true` (users can view system categories)
  - UPDATE: `user_id = auth.uid() AND is_system = false` (system categories cannot be modified)
  - DELETE: `user_id = auth.uid() AND is_system = false` (system categories cannot be deleted)
- **Migration Features**:
  - Adds `is_system` column if not exists (idempotent)
  - Creates partial index for performance
  - Drops and recreates RLS policies
  - Rollback script available (`047_system_category_payment_rollback.sql`)

**Frontend Integration:**
- **Category Type** (`fe/lib/types.ts`):
  - Added `is_system: boolean` field to Category interface
- **Category List UI** (`fe/app/[locale]/categories/categories-client.tsx`):
  - "Sistema" badge (pt-BR) / "System" badge (en) displayed for system categories
  - Delete button disabled for system categories
  - Tooltip on hover: "Categoria do sistema não pode ser deletada"
  - Edit button remains enabled (users can customize name/icon)
- **Server Action Protection** (`fe/lib/actions/categories.ts`):
  - `deleteCategory()` validates `is_system = false` before attempting delete
  - Returns error: "System categories cannot be deleted"
  - Three layers of protection: UI disabled + Server validation + RLS policy

**WhatsApp Bot Integration:**
- **Category ID Retrieval** (`whatsapp-bot/src/services/scheduler/transaction-creator.ts`):
  - `getSystemCategoryId()` function with in-memory caching
  - First call: ~20-30ms (database lookup)
  - Subsequent calls: <1ms (in-memory cache)
  - Cache invalidates on server restart (acceptable, rare event)
  - `clearSystemCategoryCache()` exported for testing
- **Auto-Payment Creation**:
  - Transaction creator calls `getSystemCategoryId()` before creating transaction
  - Uses category ID in transaction INSERT
  - Error handling if category not found (logs error, skips transaction, tracks event)

**Localization:**
- **Frontend** (`fe/lib/localization/pt-br.ts` and `en.ts`):
  - `category.systemBadge`: "Sistema" / "System"
  - `category.cannotDeleteSystemCategory`: "Categorias do sistema não podem ser deletadas" / "System categories cannot be deleted"
  - `category.deleteSystemCategoryTooltip`: "Categoria do sistema não pode ser deletada" / "System category cannot be deleted"
- **Database**:
  - pt-BR category: "Pagamento Cartão de Crédito"
  - English category: "Credit Card Payment"

**Key Design Decisions:**
1. **Reuse Existing Categories Table**: No new infrastructure needed, `is_system` flag already supported
2. **user_id = NULL**: System category visible to ALL users, not owned by one user
3. **Allow Customization**: Users can rename/change icon but cannot delete (flexibility + protection)
4. **In-Memory Caching**: System category ID doesn't change, cache reduces database queries
5. **Three-Layer Protection**: UI disabled + Server validation + RLS policy ensures category cannot be deleted

**Performance:**
- Category query (first call): < 50ms (NFR-Epic4-P5)
- Category query (cached): < 1ms
- Category list display: < 100ms (includes system category)
- No performance impact on existing operations (one additional category record)

**Deployment:**
- Documentation: `docs/MIGRATION_047_DEPLOYMENT.md`
- Verification queries included in deployment doc
- Rollback script available (WARNING: Do not rollback after auto-payments created)

### Onboarding System
- New user detection and WhatsApp number collection
- Tutorial messages via `services/onboarding/`
- Progress tracking in database
- Integration between web and WhatsApp bot

### AI/NLP System
- OpenAI GPT-4o-mini for intent extraction (**PRIMARY**)
- text-embedding-3-small for semantic cache
- Daily usage limits ($1.00 default per user)
- Cost tracking and optimization
- 60% cache hit rate target

**⚠️ NLP Intent Parser Status:**
- `nlp/intent-parser.ts` is **LEGACY** as of Epic 8 (November 2025)
- Explicit commands (/add, /budget) still processed via NLP parser
- Natural language patterns deprecated in favor of AI-first approach
- Do not extend NLP patterns - use AI prompts instead
- See file header in intent-parser.ts for migration guidance

### Statement Reminders System (Epic 3 Story 3.4)
- **Purpose**: Proactive WhatsApp reminders 3 days before credit card statement closing
- **Schedule**: Daily cron job at 12:00 UTC (9 AM Brazil time)
- **Target**: 99.5% delivery success rate (NFR8), < 30 seconds execution time (NFR6)

**Architecture:**
- **Eligibility Query** (`services/reminders/statement-reminder-query.ts`):
  - Credit Mode enabled (`credit_mode = true`)
  - Statement closing day set (`statement_closing_day IS NOT NULL`)
  - Closing date in 3 days (handles month boundaries)
  - WhatsApp authorized (JID/LID/phone)
  - Not opted out (`statement_reminders_enabled != false`)
- **Budget Calculation** (`services/reminders/budget-calculator.ts`):
  - Uses shared database functions: `calculate_statement_period()`, `calculate_statement_budget_spent()`
  - Single source of truth for budget calculations (matches web dashboard)
  - Includes regular expenses + pending installment payments
- **Message Builder** (`services/reminders/reminder-message-builder.ts`):
  - Localized messages (pt-BR/en) with awareness-first language
  - Dynamic content: payment method name, closing date, period, total spent, budget status
  - Conditional budget section (only shown if budget set)
  - Neutral tone: "R$ 400 acima do planejado" NOT "OVERSPENT!"
- **Delivery** (`services/reminders/reminder-sender.ts`):
  - Exponential backoff retry: 1s, 5s (max 3 attempts)
  - Error classification: transient (retry) vs permanent (skip)
  - Multi-identifier lookup (JID → LID → phone)
- **Job Handler** (`services/scheduler/statement-reminders-job.ts`):
  - Batch processing: 10 users in parallel
  - Individual error isolation (one failure doesn't halt job)
  - PostHog event tracking: `statement_reminder_sent`, `statement_reminder_job_completed`
  - Alerts if success rate < 99% or execution time > 30 seconds

**Key Design Decisions:**
1. Shared budget calculation functions ensure consistency between web and WhatsApp
2. Awareness-first messaging: neutral, informational, non-judgmental
3. Retry logic optimizes for 99.5% delivery success rate
4. In-process handler (needs WhatsApp socket access)
5. 3-day advance notice provides actionable awareness without urgency

**Testing:**
- Unit tests: `__tests__/services/reminders/` (eligibility, messages, errors)
- Integration tests: `__tests__/scheduler/statement-reminders-job.test.ts`
- Performance tests validate NFR6 (< 30s for 100+ users)
- Manual tests verify awareness-first language and localization

### Statement Summary System (Epic 3 Story 3.5)
- **Purpose**: On-demand statement summary with category breakdown via WhatsApp
- **Trigger**: AI intent detection - "resumo da fatura", "statement summary", "resumo", "fatura"
- **Target**: 95%+ AI intent detection accuracy, < 500ms query time (NFR Epic3-P2)

**Architecture:**
- **Handler** (`handlers/credit-card/statement-summary-handler.ts`):
  - Multi-card selection flow with conversation state (5-min TTL)
  - Graceful error handling: no cards, no closing date, setup guidance
  - PostHog event tracking: `statement_summary_viewed` with 10 properties
- **Service** (`services/statement/statement-summary-service.ts`):
  - Uses shared database functions: `calculate_statement_period()`, `calculate_statement_budget_spent()`
  - Efficient query: GROUP BY aggregation, transactions + installments UNION
  - Performance logging: warns if query > 500ms
- **Message Builder** (`services/statement/statement-summary-message-builder.ts`):
  - Localized messages (pt-BR/en) with awareness-first language
  - Dynamic content: period, total, budget status, category breakdown (top 5)
  - Installment context: "Celular parcelado 3/12 (R$ 200)"
  - Budget comparison: conditional display, neutral tone ("acima do planejado" not "OVERSPENT!")
- **AI Detection** (`services/ai/ai-pattern-generator.ts`):
  - STATEMENT_SUMMARY_TOOL: OpenAI function calling
  - Trigger patterns: comprehensive list for natural language input
  - Intent: `view_statement_summary` action

**Key Features:**
1. Category breakdown: Top 5 categories sorted by amount DESC, remaining as "Outros"
2. Installment details: Shows description, current/total installments, amount per category
3. Budget comparison: Displays spent vs budget with awareness-first messaging
4. Multi-card support: Conversation state for card selection when user has multiple cards
5. Localization: Full pt-BR and English support with proper date/currency formatting

**Data Flow:**
```
1. User sends "resumo da fatura"
2. AI detects view_statement_summary intent (Layer 3)
3. Handler checks user authentication
4. Handler fetches Credit Mode payment methods
5. If multiple cards: Ask user to select (conversation state)
6. If single card: Proceed immediately
7. Service queries category breakdown:
   - calculate_statement_period(closing_day, today)
   - Aggregate transactions + installments by category
   - Calculate totals and percentages
   - Sort top 5, group remaining as "Outros"
8. Message builder formats WhatsApp message
9. Send message to user
10. Track PostHog event with analytics
```

**Performance Optimization:**
- Database GROUP BY (not application-level aggregation)
- Single query with efficient JOINs
- Indexed queries: (user_id, payment_method_id, date)
- Performance target: < 500ms (logged and monitored)

**Error Handling:**
- No credit cards: "Configure um cartão primeiro"
- No closing date: "Configure a data de fechamento"
- Query timeout: 5-second timeout with retry message
- Empty period: "Você ainda não tem gastos neste período"

**Frontend Implementation:**
- **Server Action** (`fe/lib/actions/payment-methods.ts`):
  - `getStatementSummary(paymentMethodId)`: Fetches statement summary for web app
  - Reuses same query logic as WhatsApp service for consistency
  - RLS enforcement: Verifies user owns payment method
  - Performance logging: Warns if query > 500ms
  - PostHog event tracking: `statement_summary_viewed` (source: web)
- **Type Definitions** (`fe/lib/types.ts`):
  - `StatementSummary`: Main summary interface
  - `CategoryBreakdown`: Category details with installments
  - `InstallmentDetail`: Installment payment information
- **Components** (DEFERRED):
  - Statement summary page at `/[locale]/payment-methods/[id]/statement-summary`
  - React Query hooks with 5-minute cache
  - "View Details" button on budget widget
  - Category cards with progress bars
  - Mobile-responsive layout

**Implementation Status:**
- ✅ WhatsApp handler complete (full functionality)
- ✅ Frontend server action complete (data layer)
- ⏸️ Frontend UI components (deferred - WhatsApp provides full feature access)
- ⏸️ Unit/integration tests (deferred)
- ⏸️ Performance tests (deferred)

## Testing Strategy

### WhatsApp Bot Tests
- Unit tests in `__tests__/` directories
- Mocks in `__mocks__/`
- Coverage threshold: 70% (branches, functions, lines, statements)
- Test OCR: `npm test -- ocr.processor.test.ts`
- Test NLP: `npm test -- ai-pattern-generator.test.ts`

### Frontend Tests
- Component testing with React Testing Library
- Server action tests for data mutations
- Internationalization testing for pt-BR/en

## Deployment Configuration

### Environment Variables
**Frontend (.env.local)**:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_KEY`
- `NEXT_PUBLIC_POSTHOG_KEY`
- `NEXT_PUBLIC_POSTHOG_HOST`

**WhatsApp Bot (.env)**:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`
- `OPENAI_API_KEY`
- `WHATSAPP_PHONE_NUMBER`
- `PORT` (default: 3001)

### Railway Deployment (WhatsApp Bot)
- Configuration in `railway.json`
- Cron jobs in `railway.cron.yml`
- Nixpacks build configuration

## Current Development Branch
- Active branch: `user-onboarding`
- Modified files include onboarding components, transaction dialogs, and WhatsApp integration

## Important Patterns

### Localization
- All user-facing text must support pt-BR and en
- Frontend: Use `useTranslations` hook from next-intl
- WhatsApp bot: Use `getUserLocale` and localization files

### Database Access
- Frontend: Use Supabase client with RLS policies
- WhatsApp bot: Use service key for full access
- Always check user permissions before operations

### User Identification (Multi-Identifier System)
- **Problem**: WhatsApp Business accounts may use anonymous LIDs instead of exposing phone numbers
- **Solution**: Store and lookup multiple identifiers (JID, LID, phone number)
- **Implementation**:
  - `utils/user-identifiers.ts`: Extract identifiers from Baileys messages
  - Database columns: `whatsapp_jid`, `whatsapp_lid`, `whatsapp_number`, `account_type`, `push_name`
  - Database function: `find_user_by_whatsapp_identifier(p_jid, p_lid, p_phone_number)`
  - Cascading lookup: JID (most reliable) → LID (Business) → phone number (backward compatibility)
  - Automatic sync: `services/user/identifier-sync.ts` updates identifiers on each message
- **Usage**: Always use `checkAuthorizationWithIdentifiers()` in new code, passing `UserIdentifiers` from message context
- **Migration**: Script `028_multi_identifier_support.sql` adds new columns and functions
- **Account Types**:
  - `regular`: Standard WhatsApp (phone number always available)
  - `business`: WhatsApp Business (may have LID, verified name)
  - `unknown`: Cannot determine type

### Error Handling
- WhatsApp bot: Graceful fallbacks with user-friendly messages
- Frontend: Toast notifications for user feedback
- Logging: Structured logging with context

### State Management
- Frontend: Server-side data fetching with React Server Components
- Forms: React Hook Form with Zod schemas
- WhatsApp: Stateless message processing with database persistence

## Code Organization

### Frontend Structure
```
fe/
├── app/[locale]/         # Internationalized routes
├── components/           # Reusable UI components
├── lib/
│   ├── actions/         # Server actions
│   ├── supabase/        # Database client
│   ├── localization/    # i18n resources
│   └── analytics/       # Event tracking
└── scripts/             # Database migrations
```

### WhatsApp Bot Structure
```
whatsapp-bot/
├── src/
│   ├── handlers/        # Message and transaction handlers
│   ├── services/        # Business logic and integrations
│   ├── nlp/            # Natural language processing
│   ├── ocr/            # Receipt scanning
│   └── localization/   # Message templates
└── auth-state/         # WhatsApp session storage
```