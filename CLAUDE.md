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
# Run migrations in order (001 through 028)
# Latest: 028_multi_identifier_support.sql (Multi-identifier user recognition)
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
3. Server actions in `lib/actions/` for data mutations
4. Supabase client setup in `lib/supabase/`
5. Analytics events tracked in `lib/analytics/events.ts`

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