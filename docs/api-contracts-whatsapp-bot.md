# API Contracts - WhatsApp Bot (whatsapp-bot/)

## Overview

The WhatsApp Bot is an event-driven service that processes WhatsApp messages through a sophisticated 3-layer NLP system and provides financial management capabilities via natural language.

**Architecture**: Event-Driven Message Processing with AI-Powered Intent Recognition

---

## Message Processing Architecture

### 3-Layer NLP System

```
Incoming Message
      ↓
[Layer 1: Explicit Commands] (/add, /budget)
      ↓ (if no match)
[Layer 2: Semantic Cache] (pgvector similarity 0.85+)
      ↓ (if no match)
[Layer 3: OpenAI LLM] (GPT-4o-mini intent extraction)
      ↓
Intent Execution → Response
```

**Performance Characteristics**:
- Layer 1: < 10ms (regex matching)
- Layer 2: ~50-100ms (embedding + vector search)
- Layer 3: ~800-1500ms (LLM call + learning)

**Cost Optimization**:
- Target: 60% cache hit rate
- Average cost per message: $0.002-0.005
- User daily limit: $1.00 (configurable)

---

## Message Flow

```typescript
WhatsApp Event
  → User ID Extraction (Multi-Identifier System)
    → Authorization Check
      → Group Authorization (if group message)
        → Message Type Detection
          → [Text Handler] or [Image Handler (OCR)]
            → Intent Recognition (3 layers)
              → Handler Execution
                → Database Transaction
                  → Analytics Tracking
                    → Response Generation (Localized)
                      → WhatsApp Reply
```

---

## Handler Modules

### 1. Core Handlers (`handlers/core/`)

#### **message-handler.ts** - Main Entry Point
- **Purpose**: Route messages to appropriate handler based on type
- **Flow**:
  1. Track analytics event (message received)
  2. Check group authorization (if group message)
  3. Delegate to text-handler or image-handler
  4. Track processing result (success/failure)

**Functions**:
- `handleMessage(context: MessageContext): Promise<string | string[] | null>`

---

#### **text-handler.ts** - Text Message Processing
- **Purpose**: Process text messages through 3-layer NLP
- **Layers**:
  1. **Explicit Commands**: Regex patterns (`/add`, `/budget`, `/report`)
  2. **Semantic Cache**: Vector similarity search (0.85 threshold)
  3. **LLM Fallback**: OpenAI GPT-4o-mini with structured outputs

**Functions**:
- `handleTextMessage(from, message, groupOwnerId?)`
- Returns: Response string or array

---

#### **image-handler.ts** - Image/OCR Processing
- **Purpose**: Extract transaction data from images (SMS, receipts)
- **Flow**:
  1. Image preprocessing (Sharp: resize, grayscale, sharpen)
  2. OCR extraction (Tesseract.js + Portuguese language pack)
  3. Text parsing for transaction details
  4. Confirmation flow with user
  5. Transaction creation

**Supported Image Types**:
- Bank SMS screenshots
- Receipt photos
- Bank statement screenshots

**Functions**:
- `handleImageMessage(from, imageBuffer, caption?, groupOwnerId?)`

---

#### **intent-executor.ts** - Intent Routing
- **Purpose**: Execute parsed intents by routing to appropriate handler
- **Intent Types**:
  - `add_expense`, `add_income` → transactions handler
  - `set_budget`, `check_budget` → budgets handler
  - `list_categories`, `add_category` → categories handler
  - `show_report`, `monthly_summary` → reports handler
  - `add_recurring`, `list_recurring` → recurring handler
  - `search_transaction` → search handler
  - `help`, `start` → help handler

**Functions**:
- `executeIntent(userId, intent, context)`

---

#### **permissions.ts** - Authorization Guards
- **Purpose**: Check user permissions for operations
- **Permissions**:
  - Read transactions
  - Write transactions
  - Manage budgets
  - Admin operations

---

#### **undo.ts** - Transaction Undo/Rollback
- **Purpose**: Allow users to undo last transaction
- **Window**: 5 minutes after creation
- **Command**: "undo", "desfazer"

---

### 2. Transaction Handlers (`handlers/transactions/`)

#### **transactions.ts** - Main Transaction CRUD
**Commands**:
- Add expense: "gastei 50 em comida", "/add 50 comida"
- Add income: "recebi 1000 salário", "/income 1000"
- List recent: "minhas despesas", "/list"
- Delete: "deletar transação X123"

**Features**:
- Multiple transactions in one message
- Category auto-detection
- Payment method learning
- Date parsing (hoje, ontem, segunda-feira, 15/01)
- Amount parsing (R$, reais, paus)

**Functions**:
- `handleAddExpense(userId, amount, category, description, date, paymentMethod)`
- `handleAddIncome(userId, amount, category, description, date)`
- `handleListTransactions(userId, filters)`
- `handleDeleteTransaction(userId, transactionId)`

---

#### **expenses.ts** - Expense-Specific Logic
- Expense categorization
- Payment method suggestions
- Recurring expense detection

---

#### **ocr-confirmation.ts** - OCR Result Confirmation
- **Purpose**: Interactive confirmation flow for OCR-extracted data
- **Flow**:
  1. Bot sends extracted data for review
  2. User confirms/edits
  3. Transaction created on confirmation

**Functions**:
- `requestOCRConfirmation(userId, extractedData)`
- `processOCRConfirmation(userId, confirmed, edits?)`

---

#### **duplicate-confirmation.ts** - Duplicate Detection
- **Purpose**: Prevent duplicate transaction creation
- **Detection Window**: Last 24 hours
- **Similarity**: Same amount + similar category + close timestamp

**Functions**:
- `checkDuplicate(userId, amount, category, timestamp)`
- `requestDuplicateConfirmation(userId, possibleDuplicate)`

---

#### **transaction-corrections.ts** - Error Correction
- **Purpose**: Allow users to correct transaction details
- **Commands**: "corrigir X123 categoria comida", "mudar X123 valor 60"

**Functions**:
- `handleCorrection(userId, transactionId, field, newValue)`

---

### 3. Budget Handlers (`handlers/budgets/`)

#### **budgets.ts** - Budget Management
**Commands**:
- Set budget: "definir orçamento de comida R$500"
- Check budget: "status do orçamento", "meus orçamentos"
- Update budget: "atualizar orçamento comida 600"
- Delete budget: "remover orçamento comida"

**Features**:
- Monthly budget tracking
- Overspending alerts
- Budget vs actual spending
- Category-level budgets

**Functions**:
- `handleSetBudget(userId, category, amount, month, year)`
- `handleCheckBudget(userId, category?)`
- `handleUpdateBudget(userId, category, newAmount)`
- `handleDeleteBudget(userId, category)`

---

### 4. Category Handlers (`handlers/categories/`)

#### **categories.ts** - Category Management
**Commands**:
- List: "categorias", "/categories"
- Add: "criar categoria academia"
- Assign icon: "ícone da categoria academia 🏋️"

**Functions**:
- `handleListCategories(userId, type?)`
- `handleAddCategory(userId, name, type, icon?, color?)`

---

### 5. Reports Handlers (`handlers/reports/`)

#### **reports.ts** - Financial Reports
**Commands**:
- Monthly: "relatório deste mês", "/report"
- Category breakdown: "gastos por categoria"
- Period: "resumo de janeiro"

**Report Types**:
- Monthly summary (income, expense, balance)
- Category breakdown with percentages
- Top expenses
- Comparison to previous month
- Budget performance

**Functions**:
- `handleMonthlyReport(userId, month, year)`
- `handleCategoryBreakdown(userId, startDate, endDate)`
- `handleTopExpenses(userId, limit)`

---

#### **analysis.ts** - Advanced Analytics
- Spending trends (6-month)
- Category patterns
- Unusual spending detection
- Recommendations

---

### 6. Recurring Handlers (`handlers/recurring/`)

#### **recurring.ts** - Subscription Management
**Commands**:
- Add: "adicionar netflix mensal R$40 dia 5"
- List: "pagamentos recorrentes", "/recurring"
- Cancel: "cancelar recorrência netflix"

**Frequencies**: Daily, Weekly, Monthly, Yearly

**Functions**:
- `handleAddRecurring(userId, name, amount, category, frequency, dayOfMonth)`
- `handleListRecurring(userId)`
- `handleCancelRecurring(userId, recurringId)`

**Automation**: Cron job generates transactions automatically on due dates

---

### 7. Search Handlers (`handlers/search/`)

#### **search.ts** - Transaction Search
**Commands**:
- By description: "buscar mercado"
- By category: "transações de comida"
- By date range: "despesas de janeiro"
- By amount: "gastos acima de 100"

**Functions**:
- `handleSearch(userId, query, filters)`

---

### 8. Auth Handlers (`handlers/auth/`)

#### **auth.ts** - Authentication
**Commands**:
- Login: "Login: email@example.com senha123"
- Logout: "logout", "sair"
- Status: "meu status", "/whoami"

**Session Management**:
- 24-hour session expiry
- Auto-logout on inactivity
- Multi-device support

**Functions**:
- `handleLogin(from, email, password)`
- `handleLogout(from)`
- `checkSession(from)`

---

## Services

### AI Services (`services/ai/`)

#### **semantic-cache.ts** - Vector Similarity Cache
- **Model**: text-embedding-3-small (OpenAI)
- **Dimensions**: 1536
- **Storage**: PostgreSQL + pgvector extension
- **Similarity**: Cosine similarity (threshold 0.85)

**Functions**:
- `searchSimilarMessages(userId, messageText): Promise<CacheResult>`
- `cacheMessage(userId, messageText, intent, embedding)`

**Performance**:
- Average search: 50-100ms
- Cache hit rate target: 60%
- Cost per embedding: ~$0.00002

---

#### **ai-pattern-generator.ts** - LLM Intent Extraction
- **Model**: GPT-4o-mini
- **Temperature**: 0.1 (deterministic)
- **Max Tokens**: 500
- **Output**: Structured JSON (Zod schema)

**Schema**:
```typescript
{
  intent: string
  confidence: number
  entities: {
    amount?: number
    category?: string
    description?: string
    date?: string
    paymentMethod?: string
  }
}
```

**Functions**:
- `generateIntentFromLLM(userId, messageText): Promise<ParsedIntent>`
- Includes automatic pattern caching for future use

---

#### **ai-usage-tracker.ts** - Cost Monitoring
- **Purpose**: Track AI API costs per user
- **Daily Limit**: $1.00 (default, configurable)
- **Alerts**: Notify user at 80%, 90%, 100% of limit

**Functions**:
- `recordEmbeddingUsage(userId, tokens)`
- `recordLLMUsage(userId, promptTokens, completionTokens)`
- `checkUserLimit(userId): Promise<boolean>`
- `getCostSummary(userId, period)`

**Tracked Costs**:
- Embeddings: text-embedding-3-small
- LLM calls: GPT-4o-mini
- Total per user per day

---

#### **ai-cost-calculator.ts** - Cost Estimation
**Functions**:
- `estimateTokens(text): number` - Rough token count
- `calculateCost(tokens, model): number`

---

### User Services (`services/user/`)

#### **identifier-sync.ts** - Multi-Identifier System
- **Purpose**: Support WhatsApp Business accounts (LID + JID + Phone)
- **Identifiers**:
  - JID (jabber ID) - always available
  - LID (WhatsApp Business anonymous ID)
  - Phone number - may not be available for Business accounts

**Functions**:
- `extractUserIdentifiers(message): UserIdentifiers`
- `syncUserIdentifiers(userId, identifiers)`
- `findUserByIdentifiers(identifiers): string | null`

**Database Function**: `find_user_by_whatsapp_identifier(p_jid, p_lid, p_phone_number)`

**Lookup Cascade**: JID → LID → Phone Number → Legacy sessions

---

#### **preference-manager.ts** - User Preferences
- **Preferences**:
  - Default category
  - Default payment method
  - Preferred currency
  - Locale (pt-BR, en)
  - Notification settings

**Functions**:
- `getUserPreferences(userId)`
- `updatePreference(userId, key, value)`

---

### Group Services (`services/groups/`)

#### **group-manager.ts** - Group Authorization
- **Purpose**: Allow bot usage in WhatsApp groups
- **Authorization**: Group owner must authorize group via web app

**Functions**:
- `isGroupAuthorized(groupJid): Promise<string | null>` - Returns owner ID
- `authorizeGroup(userId, groupJid, groupName)`
- `deauthorizeGroup(groupJid)`
- `updateGroupLastMessage(groupJid)` - Track activity

---

### Detection Services (`services/detection/`)

#### **duplicate-detector.ts** - Duplicate Prevention
- **Window**: 24 hours
- **Criteria**: Same amount + similar category + close timestamp

**Functions**:
- `detectDuplicate(userId, amount, category, timestamp)`

---

#### **correction-detector.ts** - Error Detection
- **Purpose**: Detect when user wants to correct previous transaction
- **Patterns**: "corrigir", "mudar", "atualizar", "editar"

**Functions**:
- `isCorrection(messageText): boolean`

---

### Database Services (`services/database/`)

#### **supabase-client.ts** - Database Client
- **Client**: Supabase JS SDK with service role key
- **Connection**: Singleton pattern
- **RLS**: Bypassed (backend has service key)

**Functions**:
- `getSupabaseClient(): SupabaseClient`

---

### Monitoring Services (`services/monitoring/`)

#### **logger.ts** - Structured Logging
- **Library**: Pino (high-performance)
- **Levels**: debug, info, warn, error
- **Transport**: Console (Railway captures logs)

---

#### **metrics-tracker.ts** - Performance Metrics
- **Metrics**:
  - Message processing time
  - NLP layer hit rates
  - Database query times
  - Error rates

---

### Onboarding Services (`services/onboarding/`)

#### **greeting-sender.ts** - Welcome Messages
- **Trigger**: New user connects WhatsApp
- **Content**: Localized tutorial messages
- **Flow**: Step-by-step onboarding

**Functions**:
- `sendWelcomeMessage(userId, phoneNumber)`
- `sendTutorialStep(userId, step)`

---

#### **queue-greeting.ts** - Async Greeting Queue
- **Purpose**: Queue greeting messages for batch sending
- **Storage**: Database table: `greeting_queue`

---

## OCR System (`nlp/ocr/`)

### **ocr-processor.ts** - Receipt Scanning

**Workflow**:
1. **Image Preprocessing** (Sharp):
   - Resize to optimal dimensions
   - Convert to grayscale
   - Sharpen edges
   - Increase contrast

2. **Text Extraction** (Tesseract.js):
   - Language: Portuguese + English
   - PSM mode: Auto
   - Confidence threshold: 60%

3. **Text Parsing**:
   - Extract amounts (R$, reais)
   - Extract dates
   - Extract merchant names
   - Extract descriptions

4. **Confirmation Flow**:
   - Send extracted data to user
   - Wait for confirmation
   - Create transaction on confirm

**Supported Languages**: Portuguese, English

**Accuracy**: ~75-85% on clear images

---

## NLP System (`nlp/`)

### **Explicit Command Patterns**
- Regex-based matching
- Examples:
  - `/add 50 comida hoje`
  - `/budget transporte 200`
  - `/report`

### **Natural Language Patterns**
- Local NLP (Compromise.js)
- Examples:
  - "gastei 50 reais no mercado"
  - "paguei 30 de uber"
  - "recebi 1000 de salário"

### **Supported Expressions**

**Amounts**:
- "50 reais", "R$50", "50 paus", "cinquenta reais"

**Dates**:
- "hoje", "ontem", "segunda-feira"
- "15/01", "15 de janeiro"
- "semana passada", "mês passado"

**Categories** (Portuguese):
- comida, transporte, saúde, educação, lazer, moradia, etc.

**Payment Methods**:
- dinheiro, cartão, pix, débito, crédito

---

## Analytics Integration

**Events Tracked** (PostHog):
- Message received (text/image, group/DM)
- Intent recognized (layer 1/2/3)
- Transaction created/updated/deleted
- Budget set/exceeded
- OCR processed
- Error occurred
- User authenticated/logged out

**Properties**:
- message_type, intent_type, category, amount, source
- processing_time, layer_used, cache_hit
- error_message, error_type

---

## Localization

**Supported Locales**: pt-BR (primary), en (fallback)

**Localization Files** (`localization/`):
- `pt-br.ts` - Portuguese messages
- `en.ts` - English messages

**Message Types**:
- Success confirmations
- Error messages
- Help text
- Report formatting

**Function**:
- `getUserLocale(userId): Promise<string>`
- `getLocalizedMessage(key, locale, vars?): string`

---

## Cron Jobs (`cron/`)

### **generate-recurring-payments.ts**
- **Schedule**: Daily at 00:00 UTC
- **Purpose**: Generate transactions for recurring payments due today

### **execute-auto-payments.ts**
- **Schedule**: Daily at 01:00 UTC
- **Purpose**: Process auto-pay recurring transactions

### **send-payment-reminders.ts**
- **Schedule**: Daily at 09:00 UTC (user timezone)
- **Purpose**: Remind users of upcoming recurring payments

---

## Security

**Authentication**:
- WhatsApp phone number as identity
- Email/password for account linking
- 24-hour session tokens

**Authorization**:
- Per-user data isolation
- Group authorization system
- Permission checks on all operations

**Data Protection**:
- Sensitive data hashing in analytics
- No plaintext passwords
- Secure session storage

**Rate Limiting**:
- AI usage limits ($1/day per user)
- Message rate limits (to be implemented)

---

## Error Handling

**Strategy**:
```typescript
try {
  // Process message
  const intent = await parseIntent(message)
  const result = await executeIntent(intent)
  return formatResponse(result)
} catch (error) {
  logger.error('Error processing message', { userId, message }, error)
  trackEvent('whatsapp_message_failed', userId, { error: error.message })
  return getLocalizedMessage('error.generic', locale)
}
```

**User-Facing Errors**:
- Generic error messages (don't expose internals)
- Localized
- Actionable (suggest next steps)

---

## Testing

**Coverage**: 70% (branches, functions, lines, statements)

**Test Files** (`__tests__/`):
- Unit tests for each handler
- Service layer tests
- NLP parsing tests
- OCR extraction tests

**Mocks** (`__mocks__/`):
- Supabase client
- OpenAI client
- Baileys (WhatsApp)

**Command**: `npm test`

---

**Generated**: 2025-11-21
**Part**: WhatsApp Bot (whatsapp-bot/)
**Total Handlers**: 19 handler modules + 17+ services
