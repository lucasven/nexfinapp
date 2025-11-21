# Data Models - Shared Database (Supabase PostgreSQL)

## Overview

The application uses a **shared PostgreSQL database** hosted on Supabase, accessed by both the frontend (Next.js) and WhatsApp bot (Node.js). The database leverages PostgreSQL extensions (uuid-ossp, pgvector) and Row Level Security (RLS) for multi-tenancy.

**Total Schema**: 20+ tables across 32 migration files
**Database**: Supabase PostgreSQL 15+
**Extensions**: uuid-ossp, pgvector
**Security Model**: Row Level Security (RLS) on all tables

---

## Architecture Patterns

**Security Model**:
- **Row Level Security (RLS)**: Every table has user-scoped policies
- **Service Role**: Bot operations bypass RLS with service key
- **User Isolation**: `user_id` column filters all queries
- **Admin Role**: Special permissions via `is_admin` flag in user_profiles

**Common Patterns**:
```sql
-- Standard table pattern
CREATE TABLE table_name (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,  -- Links to auth.users
  ...columns...,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE table_name ENABLE ROW LEVEL SECURITY;

-- Standard RLS policy
CREATE POLICY "Users can view their own records" ON table_name
  FOR SELECT USING (auth.uid() = user_id);

-- Service role bypass
CREATE POLICY "Service role can manage all" ON table_name
  FOR ALL USING (auth.jwt()->>'role' = 'service_role');
```

---

## Table Categories

### 1. Core Financial Tables

#### `transactions`
**Purpose**: Main expense/income records

**Schema**:
```sql
CREATE TABLE transactions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  type TEXT CHECK (type IN ('income', 'expense')),
  category_id UUID REFERENCES categories(id),
  description TEXT,
  date DATE DEFAULT CURRENT_DATE,
  payment_method TEXT,

  -- AI/NLP metadata (added in migration 022)
  match_confidence DECIMAL(3,2) CHECK (match_confidence BETWEEN 0 AND 1),
  match_type TEXT CHECK (match_type IN ('exact', 'fuzzy', 'keyword', 'substring', 'merchant', 'user_preference', 'fallback', 'legacy')),

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

**Key Features**:
- `match_confidence`: Category assignment confidence (0.0-1.0)
- `match_type`: How category was determined (OCR, NLP, manual, etc.)
- RLS: Users can only access their own transactions
- Indexes: `user_id`, `date`, `category_id`, `match_confidence` (for low-confidence queries)

**Triggers**:
- `track_category_correction`: Logs category changes to `category_corrections`
- `update_updated_at_column`: Auto-updates `updated_at`

---

#### `categories`
**Purpose**: Expense/income categories (system + user-custom)

**Schema**:
```sql
CREATE TABLE categories (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT CHECK (type IN ('income', 'expense')),
  icon TEXT,  -- Emoji (e.g., '🍔', '💰')
  color TEXT, -- Hex color (e.g., '#ef4444')
  is_custom BOOLEAN DEFAULT false,
  user_id UUID,  -- NULL for system categories
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

**Default Categories**:
- **Income**: Salary, Freelance, Investments, Other Income
- **Expense**: Food & Dining, Transportation, Shopping, Entertainment, Bills & Utilities, Healthcare, Education, Rent, Subscriptions, Other Expense

**RLS**:
- All users can view all categories
- Users can only create/update/delete their custom categories

---

#### `budgets`
**Purpose**: Monthly budget limits per category

**Schema**:
```sql
CREATE TABLE budgets (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  category_id UUID REFERENCES categories(id) ON DELETE CASCADE,
  amount DECIMAL(10, 2) NOT NULL,
  month INTEGER CHECK (month BETWEEN 1 AND 12),
  year INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, category_id, month, year)
);
```

**Constraints**:
- Unique constraint prevents duplicate budgets per category per month
- Cascade delete when category is removed

---

#### `recurring_transactions`
**Purpose**: Subscription/recurring expense definitions

**Schema**:
```sql
CREATE TABLE recurring_transactions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  type TEXT CHECK (type IN ('income', 'expense')),
  category_id UUID REFERENCES categories(id),
  description TEXT,
  payment_method TEXT,
  day_of_month INTEGER CHECK (day_of_month BETWEEN 1 AND 31),
  is_active BOOLEAN DEFAULT true,
  last_generated_date DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

**Related**: `recurring_payments` tracks individual due dates and payment status.

---

### 2. WhatsApp Integration Tables

#### `whatsapp_sessions`
**Purpose**: WhatsApp authentication sessions (legacy, being replaced by multi-identifier system)

**Schema**:
```sql
CREATE TABLE whatsapp_sessions (
  id UUID PRIMARY KEY,
  whatsapp_number TEXT NOT NULL UNIQUE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  session_token TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  last_activity TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '24 hours'),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

**Maintenance**:
- Function `cleanup_expired_whatsapp_sessions()` deactivates expired sessions
- Scheduled via pg_cron (if available)

---

#### `authorized_whatsapp_numbers`
**Purpose**: Multi-identifier WhatsApp authorization with permissions

**Schema**:
```sql
CREATE TABLE authorized_whatsapp_numbers (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Multi-identifier support (migration 029)
  whatsapp_number TEXT NOT NULL,  -- +5511999999999
  whatsapp_jid TEXT,              -- 5511999999999@s.whatsapp.net (most reliable)
  whatsapp_lid TEXT,              -- Anonymous Business account ID
  push_name TEXT,                 -- WhatsApp display name
  account_type TEXT DEFAULT 'regular' CHECK (account_type IN ('regular', 'business', 'unknown')),

  -- User-friendly metadata
  name TEXT NOT NULL,  -- e.g., "Spouse", "John", "Me"
  is_primary BOOLEAN DEFAULT false,

  -- Granular permissions
  permissions JSONB DEFAULT '{
    "can_view": true,
    "can_add": false,
    "can_edit": false,
    "can_delete": false,
    "can_manage_budgets": false,
    "can_view_reports": false
  }'::jsonb,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, whatsapp_number)
);
```

**Key Features**:
- **Multi-Identifier System**: JID (always available) → LID (Business) → phone number (fallback)
- **Account Types**: regular (standard WhatsApp), business (WhatsApp Business), unknown
- **Single Primary**: Trigger `ensure_single_primary_number()` enforces one primary per user
- **Cascading Lookup**: Function `find_user_by_whatsapp_identifier(jid, lid, phone)` tries identifiers in order

**Indexes**:
- `idx_authorized_whatsapp_jid` (primary lookup)
- `idx_authorized_whatsapp_lid` (Business accounts)
- `idx_authorized_whatsapp_identifiers` (composite for multi-field queries)

**Database Functions**:
```sql
-- Find user by any identifier (cascading JID → LID → phone)
find_user_by_whatsapp_identifier(p_jid, p_lid, p_phone_number)
  RETURNS TABLE(user_id, permissions, ...)

-- Insert or update identifiers
upsert_whatsapp_identifiers(p_user_id, p_whatsapp_number, p_whatsapp_jid, ...)
  RETURNS UUID
```

---

#### `authorized_groups`
**Purpose**: WhatsApp group authorization (referenced but schema not in provided migrations)

---

### 3. User Management Tables

#### `user_profiles`
**Purpose**: Extended user profile and onboarding tracking

**Schema**:
```sql
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY,
  user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,

  -- Onboarding tracking (migration 014)
  onboarding_completed BOOLEAN DEFAULT false,
  onboarding_step VARCHAR(50),  -- 'whatsapp_setup', 'first_category', 'first_expense', 'features'
  whatsapp_setup_completed BOOLEAN DEFAULT false,
  first_category_added BOOLEAN DEFAULT false,
  first_expense_added BOOLEAN DEFAULT false,

  -- Locale preference (migration 010)
  locale TEXT DEFAULT 'pt-BR',

  -- Admin flag (migration 012)
  is_admin BOOLEAN DEFAULT false,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

**Purpose**:
- Extended profile data beyond Supabase auth.users
- Track onboarding progress for tutorial flow
- Locale preference for internationalization
- Admin role for privileged operations

**Indexes**:
- `idx_user_profiles_user_id`
- `idx_user_profiles_onboarding` (efficient onboarding queries)

---

#### `user_deletion_audit`
**Purpose**: LGPD compliance audit log for account deletions

**Schema**:
```sql
CREATE TABLE user_deletion_audit (
  id UUID PRIMARY KEY,
  deleted_user_id UUID NOT NULL,
  deleted_user_email TEXT NOT NULL,
  deleted_by_user_id UUID,  -- NULL if self-deletion
  deletion_type TEXT CHECK (deletion_type IN ('self', 'admin')),
  deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  data_summary JSONB NOT NULL,  -- Record counts by table
  ip_address INET,
  user_agent TEXT
);
```

**RLS**: Only admins can view deletion audit logs

**Related Function**:
```sql
delete_user_data(p_user_id, p_deleted_by_user_id, p_deletion_type)
  RETURNS JSONB  -- Summary of deleted records
```

Deletes all user data in order:
1. transactions → 2. recurring_transactions → 3. budgets → 4. categories → 5. AI data → 6. WhatsApp data → 7. user_profiles

---

### 4. AI/NLP System Tables

#### `message_embeddings`
**Purpose**: Semantic cache using OpenAI embeddings + pgvector

**Schema**:
```sql
CREATE EXTENSION vector;

CREATE TABLE message_embeddings (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  message_text TEXT NOT NULL,
  embedding vector(1536),  -- OpenAI text-embedding-3-small
  parsed_intent JSONB NOT NULL,  -- Cached ParsedIntent result

  -- Usage tracking
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  usage_count INTEGER DEFAULT 1
);
```

**Vector Search**:
```sql
-- IVFFlat index for cosine similarity
CREATE INDEX message_embeddings_embedding_idx
  ON message_embeddings
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);
```

**Database Functions**:
```sql
-- Find semantically similar messages
find_similar_messages(p_user_id, p_embedding, p_similarity_threshold=0.85, p_limit=5)
  RETURNS TABLE(id, message_text, parsed_intent, similarity, usage_count)
  -- Uses cosine similarity: 1 - (embedding <=> p_embedding)

-- Update usage statistics on cache hit
update_embedding_usage(p_embedding_id)
  RETURNS VOID
```

**Performance**:
- Threshold: 0.85 cosine similarity
- Target cache hit rate: 60%
- Average lookup time: 50-100ms (vs. 800-1500ms for LLM)

---

#### `user_ai_usage`
**Purpose**: Per-user AI cost tracking with daily limits

**Schema**:
```sql
CREATE TABLE user_ai_usage (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,

  -- Cost tracking
  total_cost_usd DECIMAL(10, 6) DEFAULT 0.0,  -- Lifetime
  daily_cost_usd DECIMAL(10, 6) DEFAULT 0.0,
  usage_date DATE DEFAULT CURRENT_DATE,

  -- Limits
  daily_limit_usd DECIMAL(10, 6) DEFAULT 1.00,  -- $1/day default
  is_limit_enabled BOOLEAN DEFAULT true,
  is_admin_override BOOLEAN DEFAULT false,

  -- Usage counters
  llm_calls_count INTEGER DEFAULT 0,
  llm_calls_today INTEGER DEFAULT 0,
  embedding_calls_count INTEGER DEFAULT 0,
  embedding_calls_today INTEGER DEFAULT 0,
  cache_hits_count INTEGER DEFAULT 0,
  cache_hits_today INTEGER DEFAULT 0,

  -- Token usage
  total_input_tokens BIGINT DEFAULT 0,
  total_output_tokens BIGINT DEFAULT 0,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_reset_date DATE DEFAULT CURRENT_DATE
);
```

**Database Functions**:
```sql
-- Check if user can make AI call
check_daily_limit(p_user_id) RETURNS BOOLEAN
  -- Auto-resets daily counters on date change

-- Record AI usage
record_ai_usage(p_user_id, p_cost_usd, p_call_type, p_input_tokens, p_output_tokens)
  -- Call types: 'llm', 'embedding', 'cache_hit'

-- Get usage statistics
get_user_usage_stats(p_user_id)
  RETURNS TABLE(daily_cost, daily_limit, remaining_budget, cache_hit_rate, ...)
```

**Daily Reset Logic**:
- Automatically resets `daily_cost_usd` and `*_today` counters when date changes
- Maintains lifetime totals

---

### 5. Category Intelligence Tables

#### `category_synonyms`
**Purpose**: Alternative names/keywords for categories

**Schema**:
```sql
CREATE TABLE category_synonyms (
  id UUID PRIMARY KEY,
  category_id UUID REFERENCES categories(id) ON DELETE CASCADE,
  synonym TEXT NOT NULL,
  language TEXT DEFAULT 'pt-BR',
  is_merchant BOOLEAN DEFAULT false,
  confidence DECIMAL(3,2) DEFAULT 0.80,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(category_id, synonym)
);
```

**Use Cases**:
- NLP keyword matching: "comida" → Food & Dining
- Merchant names: "IFOOD" → Food & Dining (is_merchant=true)
- Multi-language support

---

#### `merchant_category_mapping`
**Purpose**: OCR merchant name → category mapping

**Schema**:
```sql
CREATE TABLE merchant_category_mapping (
  id UUID PRIMARY KEY,
  merchant_name TEXT NOT NULL,
  category_id UUID REFERENCES categories(id),
  confidence DECIMAL(3,2) DEFAULT 0.90,
  usage_count INTEGER DEFAULT 0,
  user_id UUID,  -- NULL for global mappings
  is_global BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(merchant_name, user_id)
);
```

**Default Mappings**: 80+ Brazilian merchants pre-populated (IFOOD, UBER, AMAZON, NETFLIX, etc.)

**Levels**:
- **Global**: `is_global=true`, applies to all users
- **User-specific**: Custom merchant mappings per user

---

#### `user_category_preferences`
**Purpose**: User-specific pattern learning

**Schema**:
```sql
CREATE TABLE user_category_preferences (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  description_pattern TEXT NOT NULL,  -- e.g., "almoço no trabalho"
  category_id UUID REFERENCES categories(id),
  frequency INTEGER DEFAULT 1,
  last_used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, description_pattern)
);
```

**Learning**: Tracks user's category choices to improve future predictions.

---

#### `category_corrections`
**Purpose**: Audit trail of category changes

**Schema**:
```sql
CREATE TABLE category_corrections (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  transaction_id UUID REFERENCES transactions(id),
  original_category_id UUID REFERENCES categories(id),
  corrected_category_id UUID REFERENCES categories(id),
  description TEXT,
  amount DECIMAL(10,2),
  correction_source TEXT,  -- 'manual_edit', 'bot_command', etc.
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

**Trigger**: Automatically populated when `transactions.category_id` is updated.

**Use Case**: Improve future predictions by learning from corrections.

---

### 6. Other Tables

#### `tags`
**Purpose**: User-defined transaction tags

**Schema**:
```sql
CREATE TABLE tags (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  user_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(name, user_id)
);
```

#### `transaction_tags`
**Purpose**: Many-to-many junction for transactions ↔ tags

**Schema**:
```sql
CREATE TABLE transaction_tags (
  transaction_id UUID REFERENCES transactions(id) ON DELETE CASCADE,
  tag_id UUID REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (transaction_id, tag_id)
);
```

#### `recurring_payments`
**Purpose**: Track individual recurring payment instances

**Schema**:
```sql
CREATE TABLE recurring_payments (
  id UUID PRIMARY KEY,
  recurring_transaction_id UUID REFERENCES recurring_transactions(id) ON DELETE CASCADE,
  transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
  due_date DATE NOT NULL,
  is_paid BOOLEAN DEFAULT false,
  paid_date DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(recurring_transaction_id, due_date)
);
```

#### `beta_signups` (migration 011)
**Purpose**: Beta program enrollment (referenced but schema not in provided migrations)

#### `onboarding_messages` (migrations 015-016)
**Purpose**: WhatsApp onboarding message queue (referenced but schema not in provided migrations)

#### `parsing_metrics` (referenced in deletion function)
**Purpose**: NLP parsing performance metrics (schema not in provided migrations)

#### `learned_patterns` (referenced in deletion function)
**Purpose**: AI-learned expense patterns (schema not in provided migrations)

---

## Database Functions

### WhatsApp Multi-Identifier System

```sql
find_user_by_whatsapp_identifier(p_jid TEXT, p_lid TEXT, p_phone_number TEXT)
  -- Cascading lookup: JID (most reliable) → LID (Business) → phone number
  -- Returns: user_id, permissions, account_type, etc.

upsert_whatsapp_identifiers(p_user_id, p_whatsapp_number, p_whatsapp_jid, p_whatsapp_lid, ...)
  -- Insert or update user identifiers
  -- Returns: record ID
```

### Semantic Cache

```sql
find_similar_messages(p_user_id, p_embedding, p_similarity_threshold, p_limit)
  -- Vector similarity search using cosine distance
  -- Returns: matching messages with similarity scores

update_embedding_usage(p_embedding_id)
  -- Increment usage_count and update last_used_at
```

### AI Usage Tracking

```sql
check_daily_limit(p_user_id) RETURNS BOOLEAN
  -- Auto-resets daily counters, checks if under limit

record_ai_usage(p_user_id, p_cost_usd, p_call_type, p_input_tokens, p_output_tokens)
  -- Increments cost and usage counters

get_user_usage_stats(p_user_id)
  -- Returns: costs, limits, call counts, cache hit rate, limit exceeded status
```

### User Management

```sql
delete_user_data(p_user_id, p_deleted_by_user_id, p_deletion_type)
  -- Comprehensive user data deletion for LGPD compliance
  -- Returns: JSONB summary of deleted records
```

### Utility Functions

```sql
cleanup_expired_whatsapp_sessions()
  -- Deactivates sessions past expires_at

ensure_single_primary_number() (trigger)
  -- Ensures only one is_primary=true per user

track_category_correction() (trigger)
  -- Logs category changes to category_corrections

update_updated_at_column() (trigger)
  -- Auto-updates updated_at timestamp
```

---

## Indexes Strategy

**User Lookups**:
- All tables have `idx_<table>_user_id` for RLS filtering

**Transaction Performance**:
- `idx_transactions_date` - Date range queries
- `idx_transactions_category_id` - Category aggregations
- `idx_transactions_match_confidence` - Low-confidence filter (< 0.80)

**WhatsApp Identifiers**:
- `idx_authorized_whatsapp_jid` - Primary identifier
- `idx_authorized_whatsapp_lid` - Business accounts
- `idx_authorized_whatsapp_identifiers` - Composite (number, JID, LID)

**Vector Search**:
- `message_embeddings_embedding_idx` - IVFFlat index for cosine similarity

**Budget Queries**:
- `idx_budgets_month_year` - Monthly budget lookups

**Audit Trails**:
- `idx_category_corrections_created` - Recent corrections
- `idx_user_deletion_audit_deleted_at` - Deletion history

---

## Migration History

**Total Migrations**: 32 files (001-032)

**Key Milestones**:
- **001**: Initial schema (transactions, categories, budgets)
- **002**: WhatsApp integration
- **003**: Learned patterns (AI learning)
- **005**: User profiles and permissions
- **007**: Semantic cache (pgvector)
- **008**: AI usage tracking
- **014**: Onboarding tracking
- **019**: Category intelligence (synonyms, merchant mapping)
- **022**: Transaction match metadata
- **028**: Auto-pay feature
- **029**: Multi-identifier support (JID, LID, phone)
- **032**: User deletion function (LGPD compliance)

**Pattern**: Each migration is idempotent with `IF NOT EXISTS` and `DROP POLICY IF EXISTS`.

---

## Security Model

**Authentication**: Supabase Auth (email/password)
- User records in `auth.users` (managed by Supabase)
- Extended profile in `user_profiles`

**Authorization**:
- **RLS Policies**: Every table has user-scoped SELECT/INSERT/UPDATE/DELETE policies
- **Service Role**: WhatsApp bot uses service key to bypass RLS
- **Admin Role**: `user_profiles.is_admin` for privileged operations

**Data Isolation**:
- All queries filtered by `user_id = auth.uid()`
- Foreign key cascades preserve referential integrity
- Soft deletes where appropriate (e.g., sessions)

**LGPD Compliance**:
- User self-deletion via `delete_user_data()` function
- Audit logging in `user_deletion_audit`
- Complete data removal across all tables

---

## Performance Considerations

**Indexing**:
- All foreign keys indexed
- User-scoped queries optimized with `user_id` indexes
- Partial indexes for filtered queries (e.g., active sessions)

**Vector Search**:
- IVFFlat index with 100 lists for 1536-dim embeddings
- Cosine distance operator (`<=>`) for similarity

**Batch Operations**:
- `delete_user_data()` handles cascades efficiently
- Recurring payment processing batches due transactions

**Connection Pooling**:
- Supabase connection pooler handles concurrent requests
- Service key used for bot (separate connection pool)

---

**Generated**: 2025-11-21
**Migration Range**: 001-032
**Total Tables**: 20+ core tables
**Total Functions**: 10+ database functions
**Total Indexes**: 50+ performance indexes
