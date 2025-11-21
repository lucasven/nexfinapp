# Architecture Overview - NexFinApp

## System Architecture

NexFinApp is a **multi-part application** consisting of two independent but tightly integrated services sharing a common PostgreSQL database.

```
┌─────────────────────────────────────────────────────────────┐
│                         User Layer                           │
├──────────────────────────────┬──────────────────────────────┤
│     Web Browser (Next.js)    │   WhatsApp Client (Baileys)  │
└──────────────┬───────────────┴────────────┬─────────────────┘
               │                            │
               ▼                            ▼
┌──────────────────────────────┬────────────────────────────────┐
│   Frontend (fe/)             │   WhatsApp Bot (whatsapp-bot/)│
│   Next.js 15 + React 19      │   Node.js + TypeScript ESM    │
│   - Server Actions           │   - Baileys (WhatsApp Web API)│
│   - Radix UI + Tailwind      │   - 3-Layer NLP               │
│   - next-intl (pt-BR/en)     │   - Tesseract.js OCR          │
│   - PostHog Analytics        │   - OpenAI GPT-4o-mini        │
└──────────────┬───────────────┴────────────┬───────────────────┘
               │                            │
               └────────────┬───────────────┘
                            ▼
               ┌────────────────────────────┐
               │   Supabase PostgreSQL      │
               │   + pgvector extension     │
               │   + Row Level Security     │
               └────────────────────────────┘
                            │
               ┌────────────────────────────┐
               │   External Services        │
               │   - OpenAI API             │
               │   - PostHog Analytics      │
               └────────────────────────────┘
```

---

## Authentication & Authorization

### Supabase Auth System

**Authentication Provider**: Supabase Auth (built on GoTrue)

**Supported Methods**:
- Email/Password (primary)
- OAuth providers (future: Google, GitHub)
- Magic links (future)

**Session Management**:
- JWT tokens stored in httpOnly cookies (frontend)
- Service key authentication (WhatsApp bot)
- Session duration: 7 days (configurable)
- Refresh token rotation enabled

### User Authentication Flow

**Frontend (Web)**:
```
1. User visits /auth/login
2. Enter email + password
3. POST to Supabase Auth API
4. Receive JWT token + refresh token
5. Store in httpOnly secure cookie
6. Redirect to /dashboard
7. All subsequent requests include JWT in cookie
8. Server Actions extract user via auth.uid()
```

**WhatsApp Bot**:
```
1. User sends message to WhatsApp bot
2. Bot extracts WhatsApp identifiers (JID, LID, phone)
3. Query database: find_user_by_whatsapp_identifier(JID, LID, phone)
4. Cascading lookup: JID (highest priority) → LID → phone number
5. If found: Load user context and permissions
6. If not found: Send onboarding message
7. All database operations use service key (bypasses RLS)
```

### Multi-Identifier WhatsApp Authentication

**Problem**: WhatsApp Business accounts may use anonymous LIDs instead of phone numbers

**Solution**: Store multiple identifiers with cascading lookup

**Identifiers**:
- **JID** (WhatsApp JID): Most reliable, always available (e.g., `5511999999999@s.whatsapp.net`)
- **LID** (Local Identifier): Business accounts, anonymous (e.g., `lid:xyz123@lid`)
- **Phone Number**: Regular WhatsApp, exposed number (e.g., `+5511999999999`)
- **Push Name**: Display name (not unique, for UX only)
- **Account Type**: `regular`, `business`, `unknown`

**Database Schema**:
```sql
CREATE TABLE authorized_whatsapp_numbers (
  whatsapp_jid TEXT,    -- Primary lookup
  whatsapp_lid TEXT,    -- Business fallback
  whatsapp_number TEXT, -- Backward compatibility
  account_type TEXT,    -- regular/business/unknown
  push_name TEXT,       -- Display name
  ...
);
```

**Authorization Flow**:
```typescript
// 1. Extract identifiers from message
const identifiers = extractUserIdentifiers(message)
// { jid: '5511..@s.whatsapp.net', lid: null, phoneNumber: '+5511..', pushName: 'Lucas' }

// 2. Database lookup (cascading)
const auth = await checkAuthorizationWithIdentifiers(identifiers)
// Tries: JID → LID → phone number → legacy sessions

// 3. If found, return user + permissions
// { userId: 'uuid', permissions: { can_add: true, can_view: true, ... } }

// 4. Auto-sync: Update identifiers on each message
await syncUserIdentifiers(userId, identifiers)
```

### Authorization Model

**Row Level Security (RLS)**:
- Every table has `user_id` column
- RLS policies filter queries: `auth.uid() = user_id`
- Service role bypasses RLS (WhatsApp bot uses this)

**Permissions**:
- **User Role**: Standard user (default)
- **Admin Role**: `user_profiles.is_admin = true`
- **WhatsApp Permissions**: Granular per-number (can_view, can_add, can_edit, can_delete, can_manage_budgets, can_view_reports)

**RLS Policy Pattern**:
```sql
-- Users can view their own data
CREATE POLICY "Users can view own transactions" ON transactions
  FOR SELECT USING (auth.uid() = user_id);

-- Service role (bot) can access all
CREATE POLICY "Service role can access all" ON transactions
  FOR ALL USING (auth.jwt()->>'role' = 'service_role');

-- Admin can view all users
CREATE POLICY "Admins can view all" ON transactions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_id = auth.uid() AND is_admin = true
    )
  );
```

---

## Security Model

### Data Protection

**At Rest**:
- Supabase encrypts database at rest (AES-256)
- Secrets stored in environment variables
- API keys rotated regularly

**In Transit**:
- HTTPS everywhere (TLS 1.3)
- Supabase SSL connections
- httpOnly cookies prevent XSS theft

**Sensitive Data Handling**:
- Passwords: Bcrypt hashing (Supabase Auth)
- WhatsApp session data: Encrypted in `auth-state/` directory
- AI embeddings: User-scoped, not shared

### Input Validation

**Frontend**:
- Zod schemas for form validation
- Type-safe TypeScript
- Sanitize user inputs before display
- CSP headers prevent XSS

**Backend (WhatsApp Bot)**:
- Command argument validation
- OCR text sanitization (remove control characters)
- SQL injection prevention via parameterized queries
- Rate limiting on AI API calls

**Server Actions**:
- All inputs validated before database operations
- User authentication checked before any mutation
- Errors logged but not exposed to client

### Rate Limiting

**AI API Calls**:
- Daily limit per user (default: $1.00/day)
- Tracked in `user_ai_usage` table
- Function `check_daily_limit()` enforces limits
- Admin override available

**Database Queries**:
- Supabase connection pooling (max 50 connections)
- Query timeout: 10 seconds
- Index optimization for performance

**WhatsApp Bot**:
- No explicit rate limiting (WhatsApp handles this)
- Exponential backoff on errors
- Message queue for high volume

### LGPD Compliance (Brazilian GDPR)

**Data Rights**:
- User self-deletion via settings page
- Complete data removal across all tables
- Audit log of deletions in `user_deletion_audit`

**Deletion Function**:
```sql
delete_user_data(user_id, deleted_by_user_id, deletion_type='self')
  -- Deletes:
  -- 1. transactions → 2. recurring_transactions → 3. budgets
  -- 4. categories → 5. AI data (embeddings, usage, patterns)
  -- 6. WhatsApp data → 7. user_profiles
  -- Returns: Summary of deleted records
```

**Anonymization**:
- WhatsApp sessions anonymized on deletion
- AI embeddings deleted (not anonymized)
- Audit logs retain email but not personal data

**Data Minimization**:
- Only collect necessary data
- WhatsApp push_name optional (for UX)
- Transaction descriptions user-controlled

---

## Integration Points

### Frontend ↔ Backend (WhatsApp Bot)

**Shared Resources**:
- **Database**: Single Supabase PostgreSQL instance
- **User Profiles**: `user_profiles` table
- **Categories**: `categories` table (system + user-custom)
- **Transactions**: `transactions` table

**Integration Flows**:

**1. User Registration (Frontend → WhatsApp)**:
```
Frontend:
1. User signs up via /auth/signup
2. Server action creates auth.users record
3. Trigger creates user_profiles record
4. Frontend shows onboarding: "Connect WhatsApp"

WhatsApp Bot:
5. User sends first message to bot
6. Bot checks: find_user_by_whatsapp_identifier()
7. If not found, prompt for email (login flow)
8. User sends "login: email@example.com password123"
9. Bot validates credentials via Supabase Auth
10. Creates authorized_whatsapp_numbers record
11. Links WhatsApp to user_id
12. Frontend refreshes, shows "WhatsApp Connected ✓"
```

**2. Transaction Creation (WhatsApp → Frontend)**:
```
WhatsApp Bot:
1. User sends "gastei 50 de comida hoje"
2. NLP parses intent + entities
3. Creates transaction in database
4. Sends confirmation message

Frontend:
5. User opens /dashboard
6. Server action queries transactions
7. Displays new transaction in list
8. No explicit sync needed (database is source of truth)
```

**3. Category Management (Frontend → WhatsApp)**:
```
Frontend:
1. User creates custom category "lazer"
2. Server action inserts into categories table

WhatsApp Bot:
3. User sends "gastei 100 de lazer"
4. NLP queries categories (includes new "lazer")
5. Matches category, creates transaction
6. Category available immediately (shared database)
```

### Frontend ↔ Supabase

**Connection Pattern**:
```typescript
// Server Component (default)
import { getSupabaseServerClient } from "@/lib/supabase/server"

export default async function Page() {
  const supabase = await getSupabaseServerClient()
  const { data } = await supabase.from('transactions').select('*')
  return <TransactionList data={data} />
}

// Server Action
"use server"
import { getSupabaseServerClient } from "@/lib/supabase/server"

export async function createTransaction(data) {
  const supabase = await getSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")

  const { error } = await supabase.from('transactions').insert({
    ...data,
    user_id: user.id  // RLS enforcement
  })

  if (error) throw error
  revalidatePath('/dashboard')
}
```

**Authentication Flow**:
- JWT in httpOnly cookie
- `getSupabaseServerClient()` extracts JWT
- Supabase validates token with Auth API
- RLS policies enforce user_id filtering

### WhatsApp Bot ↔ Supabase

**Connection Pattern**:
```typescript
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY  // Bypasses RLS
)

// Direct database access (no auth.uid() available)
const { data } = await supabase
  .from('transactions')
  .select('*')
  .eq('user_id', userId)  // Manual filtering
```

**Service Key Usage**:
- Full database access (bypasses RLS)
- Required for bot operations (no user session)
- Must manually filter by user_id
- Used for admin operations

### WhatsApp Bot ↔ OpenAI

**NLP API Calls**:
```typescript
import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// LLM (GPT-4o-mini)
const completion = await openai.chat.completions.create({
  model: 'gpt-4o-mini',
  messages: [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage }
  ],
  response_format: { type: 'json_object' },  // Structured outputs
  temperature: 0.3  // Low temperature for consistency
})

// Embeddings (text-embedding-3-small)
const embedding = await openai.embeddings.create({
  model: 'text-embedding-3-small',
  input: userMessage
})
```

**Cost Tracking**:
- Before call: `checkDailyLimit(userId)`
- After call: `recordAIUsage(userId, cost, 'llm', inputTokens, outputTokens)`
- Stored in `user_ai_usage` table

### Frontend ↔ PostHog

**Analytics Tracking**:
```typescript
import { trackEvent } from '@/lib/analytics/tracker'
import { AnalyticsEvent } from '@/lib/analytics/events'

// Frontend
trackEvent(AnalyticsEvent.TRANSACTION_CREATED, {
  amount: 50,
  category: 'food',
  source: 'web'
})

// WhatsApp Bot
trackServerEvent(AnalyticsEvent.TRANSACTION_CREATED, userId, {
  amount: 50,
  category: 'food',
  source: 'whatsapp'
})
```

**User Identification**:
- `posthog.identify(user_id, { email, locale, created_at })`
- Properties synced on login
- Events include user_id for segmentation

---

## Deployment Architecture

### Frontend (Next.js)

**Hosting**: Vercel (recommended) or Railway

**Build Configuration**:
```json
{
  "scripts": {
    "build": "next build",
    "start": "next start",
    "dev": "next dev"
  }
}
```

**Environment Variables**:
```env
NEXT_PUBLIC_SUPABASE_URL=https://...supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_KEY=eyJhbGc...
NEXT_PUBLIC_POSTHOG_KEY=phc_...
NEXT_PUBLIC_POSTHOG_HOST=https://app.posthog.com
```

**Edge Configuration**:
- Node.js runtime (not Edge Runtime - requires Node APIs for Supabase)
- ISR not used (dynamic data)
- Revalidation via `revalidatePath()`

**CDN Strategy**:
- Static assets: Vercel CDN
- API routes: Serverless functions
- Images: Next.js Image Optimization

### WhatsApp Bot (Node.js)

**Hosting**: Railway (with persistent storage)

**Configuration** (`railway.json`):
```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS",
    "buildCommand": "npm run build"
  },
  "deploy": {
    "startCommand": "npm start",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

**Cron Jobs** (`railway.cron.yml`):
```yaml
jobs:
  - name: process-recurring-payments
    schedule: "0 0 * * *"  # Daily at midnight
    command: "node dist/cron/process-recurring.js"
```

**Persistent Storage**:
- `auth-state/` directory for WhatsApp session data
- Mounted volume on Railway
- Backup strategy: Daily to S3 (future)

**Environment Variables**:
```env
SUPABASE_URL=https://...supabase.co
SUPABASE_SERVICE_KEY=eyJhbGc...
OPENAI_API_KEY=sk-...
WHATSAPP_PHONE_NUMBER=+5511999999999
PORT=3001
NODE_ENV=production
```

**Health Check**:
```typescript
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    whatsapp: client.state === 'open'
  })
})
```

### Database (Supabase)

**Hosting**: Supabase Cloud (PostgreSQL 15)

**Configuration**:
- Instance size: Starter (2GB RAM, 8GB storage)
- Connection pooling: Enabled (max 50)
- Extensions: `uuid-ossp`, `pgvector`
- Backups: Daily automatic

**Migration Strategy**:
- Numbered SQL files: `001_initial_schema.sql` → `032_user_deletion_function.sql`
- Apply via `psql` or Supabase dashboard
- Idempotent migrations (`IF NOT EXISTS`, `CREATE OR REPLACE`)

**Performance Optimization**:
- Indexes on `user_id`, `date`, `category_id`
- IVFFlat index on `embedding` vector column
- Materialized view for user analytics (migration 027)

### Monitoring & Logging

**Application Monitoring**:
- **PostHog**: User events, funnels, retention
- **Vercel Analytics**: Web Vitals, page speed
- **Railway Logs**: WhatsApp bot errors, system logs

**Error Tracking**:
- Console.error logs sent to Railway logs
- Critical errors trigger alerts (future: Sentry)
- Database query errors logged but sanitized

**Performance Metrics**:
- NLP Layer 1/2/3 latency tracked in database
- OCR processing time logged
- AI API costs tracked per user
- Cache hit rate monitored

---

## Development Workflow

### Local Development

**Prerequisites**:
- Node.js 18+ (LTS)
- PostgreSQL 15+ (or Supabase local)
- OpenAI API key
- Supabase project

**Setup**:
```bash
# Clone repo
git clone https://github.com/user/lv-expense-tracker
cd lv-expense-tracker

# Frontend
cd fe
npm install
cp .env.example .env.local
# Edit .env.local with Supabase keys
npm run dev  # http://localhost:3000

# WhatsApp Bot (separate terminal)
cd whatsapp-bot
npm install
cp .env.example .env
# Edit .env with Supabase + OpenAI keys
npm run dev  # Port 3001
```

**Database Setup**:
```bash
# Connect to Supabase
psql $DATABASE_URL

# Run migrations in order
\i fe/scripts/001_initial_schema.sql
\i fe/scripts/002_whatsapp_integration.sql
# ... through 032
```

### Testing Strategy

**Frontend**:
- Component tests: React Testing Library (future)
- E2E tests: Playwright (future)
- Type checking: `tsc --noEmit`

**WhatsApp Bot**:
- Unit tests: Jest + ts-jest
- Coverage threshold: 70%
- Test files: `**/*.test.ts`
- Run: `npm test`

**Database**:
- Migration tests: Verify idempotency
- RLS policy tests: Verify user isolation
- Function tests: SQL test scripts

### CI/CD Pipeline

**Frontend (Vercel)**:
```yaml
# .github/workflows/frontend.yml
name: Frontend CI
on: [push]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - run: cd fe && npm install
      - run: cd fe && npm run lint
      - run: cd fe && npm run build
```

**WhatsApp Bot (Railway)**:
```yaml
# .github/workflows/bot.yml
name: WhatsApp Bot CI
on: [push]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - run: cd whatsapp-bot && npm install
      - run: cd whatsapp-bot && npm test
      - run: cd whatsapp-bot && npm run build
```

**Auto-deploy**:
- Main branch → Production (Vercel + Railway)
- Feature branches → Preview deployments (Vercel only)

---

## Scalability Considerations

### Current Limits

**Frontend (Vercel)**:
- Serverless functions: 10s timeout
- Concurrent executions: 1000 (Pro plan)
- Bandwidth: Unlimited

**WhatsApp Bot (Railway)**:
- Single instance (no horizontal scaling yet)
- Memory: 2GB
- CPU: Shared vCPU

**Database (Supabase)**:
- Connections: 50 max (pooled)
- Storage: 8GB (Starter plan)
- Bandwidth: 50GB/month

### Scaling Strategy

**When to Scale**:
- > 100 concurrent users: Upgrade Supabase to Pro
- > 1000 WhatsApp users: Horizontal scaling (multiple bot instances)
- > 10K transactions/day: Database read replicas

**Horizontal Scaling (WhatsApp Bot)**:
- Multiple Railway instances
- Shared database (Supabase)
- WhatsApp Web session per instance (Baileys limitation)
- Load balancer not needed (users connect to specific bot instance)

**Database Optimization**:
- Read replicas for analytics queries
- Partition large tables by date
- Archive old transactions to cold storage

**Caching Strategy**:
- Semantic cache already implemented (pgvector)
- Future: Redis for session data
- Future: CDN caching for static reports

---

## Technology Stack Summary

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Frontend** | Next.js 15 + React 19 | Web application framework |
| | Radix UI + Tailwind CSS | UI components + styling |
| | next-intl | Internationalization (pt-BR/en) |
| | PostHog | Analytics and product insights |
| **Backend** | Node.js + TypeScript | WhatsApp bot runtime |
| | Baileys | WhatsApp Web API |
| | Compromise.js | NLP entity extraction |
| | Tesseract.js + Sharp | OCR + image preprocessing |
| **AI/ML** | OpenAI GPT-4o-mini | Intent parsing (Layer 3) |
| | text-embedding-3-small | Semantic cache embeddings |
| **Database** | PostgreSQL 15 (Supabase) | Primary data store |
| | pgvector | Vector similarity search |
| **Infrastructure** | Vercel | Frontend hosting |
| | Railway | WhatsApp bot hosting |
| | Supabase | Database + Auth |
| **DevOps** | GitHub Actions | CI/CD pipelines |
| | TypeScript | Type safety across stack |
| | Jest | Unit testing |

---

**Generated**: 2025-11-21
**Architecture Type**: Multi-part (Frontend + Backend)
**Database**: Shared Supabase PostgreSQL
**Authentication**: Supabase Auth + Multi-identifier WhatsApp
**Deployment**: Vercel (Frontend) + Railway (Backend) + Supabase (Database)
