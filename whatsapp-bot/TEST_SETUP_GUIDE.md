# Test Setup Guide

This guide walks you through setting up the test infrastructure for the WhatsApp bot.

## Overview

The test infrastructure requires:
1. **Separate test database** - To avoid polluting production data
2. **Real Supabase connection** - For integration tests
3. **Proper environment configuration** - Test-specific credentials

## Step-by-Step Setup

### Step 1: Create Test Database

You have **three options** for your test database:

#### Option A: New Supabase Project (Recommended for Production)
1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Create a new project called `lv-expense-tracker-test`
3. Wait for database provisioning
4. Copy the **URL** and **service_role key** from Settings → API
5. Run all migrations from `fe/scripts/` in order (001 through 028)

#### Option B: Local Supabase (Recommended for Development)
```bash
# Install Supabase CLI if not installed
brew install supabase/tap/supabase

# Start local Supabase
cd /Users/lucasventurella/code/lv-expense-tracker
supabase start

# Get credentials (printed after start)
# URL: http://localhost:54321
# service_role key: (shown in output)

# Run migrations
supabase db reset
```

#### Option C: Separate Schema in Existing Database (Not Recommended)
```sql
-- Connect to your database
CREATE SCHEMA test;

-- Set search_path for test schema
SET search_path TO test, public;

-- Run all migrations in test schema
-- (More complex, can cause conflicts)
```

### Step 2: Configure Test Environment

1. **Edit `.env.test`** (already created in `whatsapp-bot/` directory):

```bash
# For Option A (New Supabase Project)
SUPABASE_URL=https://your-test-project.supabase.co
SUPABASE_SERVICE_KEY=your_test_service_role_key

# For Option B (Local Supabase)
SUPABASE_URL=http://localhost:54321
SUPABASE_SERVICE_KEY=your_local_service_key

# OpenAI (can use production key, tests are mocked)
OPENAI_API_KEY=your_openai_api_key

# Test environment
NODE_ENV=test
PORT=3002
```

2. **Verify credentials** are correct and have read/write access

### Step 3: Run Migrations on Test Database

If using **Option A** (new project):
```bash
# Connect to your test database
export TEST_DATABASE_URL="postgresql://postgres:[PASSWORD]@db.[PROJECT].supabase.co:5432/postgres"

# Run each migration in order
cd fe/scripts
psql $TEST_DATABASE_URL < 001_initial_schema.sql
psql $TEST_DATABASE_URL < 002_add_categories.sql
# ... continue through 028_multi_identifier_support.sql
```

If using **Option B** (local):
```bash
# Migrations are run automatically with `supabase db reset`
# Or run manually:
supabase db push
```

### Step 4: Verify Test Database Connection

Run this command to verify your test database is accessible:

```bash
cd whatsapp-bot
npm test -- --testPathPattern="setup" --verbose
```

Expected output:
```
✓ Test environment loaded
✓ Database connection established
```

If you see errors:
- Check `.env.test` has correct credentials
- Verify network access to Supabase project
- Ensure migrations have been run

### Step 5: Run Your First Test

```bash
npm test
```

This should:
- Load `.env.test` environment variables
- Connect to test database
- Run all tests using real database operations
- Clean up test data after each test

## Test Infrastructure Files

### Created/Modified Files

1. **`.env.test`** - Test database credentials
2. **`src/__tests__/setup.ts`** - Updated to load test env and fix OpenAI mock
3. **`src/__tests__/utils/test-database.ts`** - Real Supabase client for tests
4. **`src/__tests__/utils/idempotency-helpers.ts`** - Updated to use real database

### How It Works

```typescript
// Tests now use REAL database operations:
import { getTestSupabaseClient } from './utils/test-database'

it('creates engagement state', async () => {
  const client = getTestSupabaseClient() // Real connection

  const { data } = await client
    .from('user_engagement_states')  // Real table
    .insert({ userId: 'test-123' })  // Real insert
    .select()
    .single()

  expect(data).toBeDefined()  // Real data
})
```

## Best Practices

### 1. **Always Clean Up**
```typescript
let testUserIds: string[] = []

afterEach(async () => {
  await cleanupEngagementStates(testUserIds)
  testUserIds = []
})
```

### 2. **Use Unique Test Data**
```typescript
const userId = `test-user-${Date.now()}-${Math.random()}`
```

### 3. **Verify Database State**
```typescript
const count = await getMessageQueueCount()
expect(count).toBe(expectedCount)
```

### 4. **Run Tests in Isolation**
```bash
# Single test file
npm test -- state-machine.test.ts

# Specific test
npm test -- -t "scheduler is idempotent"
```

## Troubleshooting

### Error: "Missing SUPABASE_URL or SUPABASE_SERVICE_KEY"
- Ensure `.env.test` exists in `whatsapp-bot/` directory
- Check file has correct variable names (no typos)
- Verify values are not placeholder text

### Error: "Test database connection failed"
- Test database URL and verify it's accessible
- Check Supabase project is active (not paused)
- Ensure service role key (not anon key) is used
- For local: Verify `supabase start` is running

### Error: "relation 'engagement_message_queue' does not exist"
- Run all migrations on test database (001-028)
- Verify migrations completed without errors
- Check you're connecting to correct database/schema

### Tests Are Slow
- Use local Supabase (`Option B`) for faster tests
- Run specific test files instead of full suite
- Consider using test database connection pooling

### Foreign Key Constraint Errors
- Ensure cleanup happens in correct order:
  1. `engagement_state_transitions`
  2. `engagement_message_queue`
  3. `user_engagement_states`

## Next Steps

1. ✅ Configure `.env.test` with your credentials
2. ✅ Run migrations on test database
3. ✅ Run `npm test` to verify setup
4. ✅ Start writing/running integration tests

## Security Notes

⚠️ **IMPORTANT**:
- Never commit `.env.test` to version control (already in `.gitignore`)
- Use separate Supabase project for tests (don't share with production)
- Service role key has full database access - keep it secure
- Test database can be reset/wiped at any time

## Reference

- Test database client: [src/__tests__/utils/test-database.ts](src/__tests__/utils/test-database.ts)
- Idempotency helpers: [src/__tests__/utils/idempotency-helpers.ts](src/__tests__/utils/idempotency-helpers.ts)
- Jest config: [jest.config.js](jest.config.js)
- Test setup: [src/__tests__/setup.ts](src/__tests__/setup.ts)
