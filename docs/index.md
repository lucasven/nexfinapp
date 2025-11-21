# NexFinApp - Technical Documentation Index

## Project Overview

**NexFinApp** is a full-stack expense tracking application with WhatsApp integration, featuring AI-powered natural language processing and OCR receipt scanning. The system consists of two independent but tightly integrated parts sharing a common PostgreSQL database.

**Generated**: 2025-11-21
**Documentation Version**: 1.0.0
**Project Status**: Active Development (Branch: `onboarding-issues`)

---

## Quick Start

### For New Developers
1. Read [Architecture Overview](./architecture-overview.md) to understand the system design
2. Review [API Contracts - Frontend](./api-contracts-fe.md) for server actions
3. Review [API Contracts - WhatsApp Bot](./api-contracts-whatsapp-bot.md) for bot handlers
4. Check [Data Models](./data-models-shared.md) for database schema

### For Product Managers
1. Start with existing [README.md](../README.md) and [fe/README.md](../fe/README.md)
2. Read [Architecture Overview](./architecture-overview.md) - Integration Points section
3. Review [UI Components](./ui-components-fe.md) for feature inventory

### For DevOps/Infrastructure
1. Read [Architecture Overview](./architecture-overview.md) - Deployment section
2. Review [Data Models](./data-models-shared.md) - Migration History
3. Check environment variable requirements in architecture doc

---

## Documentation Structure

### 1. Architecture & System Design

#### [Architecture Overview](./architecture-overview.md)
**Comprehensive system architecture document**
- System architecture diagram
- Authentication & authorization (Supabase Auth + Multi-identifier WhatsApp)
- Security model (RLS, LGPD compliance, rate limiting)
- Integration points (Frontend ↔ Backend ↔ Database)
- Deployment architecture (Vercel + Railway + Supabase)
- Technology stack summary

**Key Topics**:
- Multi-part architecture (Next.js + Node.js)
- WhatsApp multi-identifier authentication (JID, LID, phone)
- Row Level Security (RLS) implementation
- Service key vs. user authentication
- Scaling considerations

---

### 2. API Documentation

#### [API Contracts - Frontend (fe/)](./api-contracts-fe.md)
**Next.js 15 Server Actions and REST API routes**
- 50+ server actions across 12 modules
- Common patterns ("use server", RLS, analytics)
- Module breakdown:
  - Transactions (CRUD, filtering)
  - Budgets (monthly limits per category)
  - Categories (system + custom)
  - Recurring Payments (subscriptions)
  - Reports (financial analytics)
  - Profile & Onboarding
  - Admin (user management)
  - User deletion (LGPD compliance)
- REST API routes (webhooks, auth callbacks)
- Cache strategy (`revalidatePath`)

**Lines of Code**: ~4000 across all modules

#### [API Contracts - WhatsApp Bot](./api-contracts-whatsapp-bot.md)
**Event-driven architecture with handlers and services**
- 19 handler modules (message, image, commands)
- 17+ service modules (AI, NLP, OCR, category matching)
- 3-layer NLP architecture (Explicit → Semantic Cache → LLM)
- Multi-identifier authorization system
- Event flow diagrams
- Handler pattern examples

**Lines of Code**: ~4000 across handlers + services

---

### 3. Database Documentation

#### [Data Models - Shared Database](./data-models-shared.md)
**PostgreSQL 15 + pgvector schema documentation**
- 20+ tables across 6 categories:
  - Core Financial (transactions, categories, budgets, recurring)
  - WhatsApp Integration (sessions, authorized_numbers, groups)
  - User Management (profiles, deletion audit)
  - AI/NLP (message_embeddings, user_ai_usage)
  - Category Intelligence (synonyms, merchant mappings, corrections)
- 10+ database functions (user lookup, semantic search, AI tracking, deletion)
- 50+ performance indexes
- 32 migration files history (001-032)
- RLS policies for all tables
- Performance considerations

**Key Features**:
- pgvector extension for semantic cache (1536-dim embeddings)
- Multi-identifier support (JID, LID, phone) for WhatsApp
- LGPD compliance with audit logging
- Trigger-based category correction tracking

---

### 4. Frontend Documentation

#### [UI Components - Frontend (fe/)](./ui-components-fe.md)
**Next.js 15 + React 19 + Radix UI component inventory**
- 68 .tsx component files across 4 categories:
  - UI Primitives (17 Radix UI components)
  - Feature Components (29 business logic components)
  - Admin Components (22 analytics dashboards)
  - Onboarding Components (2 tutorial components)
- 21 page routes (public, authenticated, admin)
- Internationalization (next-intl: pt-BR, en)
- Analytics integration (PostHog)
- Styling system (Tailwind CSS 4 + design tokens)
- State management patterns
- Accessibility (a11y) with Radix UI

**Component Highlights**:
- Transaction management (dialog, list, filters)
- Budget tracking (cards, dialogs, progress bars)
- Category management (custom categories, icons, colors)
- Reports & charts (Recharts: pie, line, bar, trend)
- Admin analytics (20+ specialized charts and tables)

---

### 5. NLP & OCR Documentation

#### [NLP & OCR Systems - WhatsApp Bot](./nlp-ocr-systems-whatsapp-bot.md)
**3-layer NLP + AI-assisted OCR documentation**

**3-Layer NLP System**:
- **Layer 1**: Explicit Commands (<10ms, 0.95 confidence)
  - `/add`, `/budget`, `/recurring`, `/report`, `/list`, `/help`
  - Command parsing with argument extraction
- **Layer 2**: Semantic Cache (50-100ms, pgvector similarity)
  - 0.85 similarity threshold
  - 60% cache hit rate target
  - 75x cheaper than LLM
- **Layer 3**: OpenAI LLM (800-1500ms, GPT-4o-mini)
  - Structured outputs with JSON schema
  - User context (categories, patterns, preferences)
  - Cost: ~$0.0015 per call

**OCR System**:
- Image preprocessing: Sharp.js (greyscale, normalize, sharpen)
- OCR engine: Tesseract.js (Portuguese language pack)
- 4 parsing strategies:
  1. Credit card SMS parsing (Brazilian format)
  2. Bank statement parsing (multi-transaction)
  3. Generic receipt patterns (regex-based)
  4. AI-assisted parsing (GPT-4o-mini fallback)
- Merchant category guessing (80+ pre-populated merchants)
- Payment method detection from context

**Performance**:
- NLP Layer 1: <10ms
- NLP Layer 2: 50-100ms (60% of messages)
- NLP Layer 3: 800-1500ms (40% of messages)
- OCR: 2-6 seconds (including AI fallback)
- Average cost per message: $0.000612 (with 60% cache hit rate)

---

## Project Statistics

### Codebase Metrics
- **Total Lines**: ~12,000+ (excluding dependencies)
- **Frontend**: ~6,000 lines (Next.js + React)
- **Backend**: ~6,000 lines (Node.js + TypeScript)
- **Shared Database**: 32 migration files, 20+ tables
- **Components**: 68 React components
- **Page Routes**: 21 routes (frontend)
- **API Endpoints**: 50+ server actions + 19 handlers + 17+ services
- **Test Files**: Unit tests for NLP and OCR modules

### Technology Breakdown
| Category | Count | Examples |
|----------|-------|----------|
| Server Actions | 50+ | transactions.ts, budgets.ts, categories.ts |
| WhatsApp Handlers | 19 | message-handler.ts, image-handler.ts, transaction-handlers/ |
| Services | 17+ | ai/semantic-cache.ts, ocr/image-processor.ts, category-matcher.ts |
| Database Tables | 20+ | transactions, categories, message_embeddings, user_ai_usage |
| Database Functions | 10+ | find_user_by_whatsapp_identifier, find_similar_messages, delete_user_data |
| Migrations | 32 | 001_initial_schema.sql → 032_user_deletion_function.sql |
| UI Components | 68 | button.tsx, transaction-dialog.tsx, category-chart.tsx |
| Page Routes | 21 | /dashboard, /transactions, /budgets, /admin/* |

---

## Key Features

### Expense Tracking
- ✅ Add/edit/delete transactions (income/expense)
- ✅ Category management (system + user-custom)
- ✅ Budget limits per category per month
- ✅ Recurring payments/subscriptions
- ✅ Financial reports and analytics
- ✅ Multi-currency support (default: BRL)

### WhatsApp Integration
- ✅ Multi-identifier authentication (JID, LID, phone)
- ✅ Natural language processing (3-layer NLP)
- ✅ OCR receipt scanning (Tesseract.js)
- ✅ Credit card SMS parsing (Brazilian banks)
- ✅ Merchant recognition (80+ pre-mapped)
- ✅ Granular permissions per WhatsApp number
- ✅ Group message support (future)

### AI/ML Features
- ✅ Semantic cache (pgvector + OpenAI embeddings)
- ✅ Intent parsing (GPT-4o-mini)
- ✅ Category guessing from descriptions
- ✅ Merchant mapping with synonyms
- ✅ User pattern learning
- ✅ Daily cost tracking and limits ($1/day default)

### Analytics & Admin
- ✅ PostHog integration (user events, funnels)
- ✅ Admin dashboard (user management, AI costs)
- ✅ Category intelligence analytics (corrections, confidence)
- ✅ NLP performance metrics (cache hit rate, latency)
- ✅ OCR success rate tracking
- ✅ Merchant recognition coverage

### Localization & UX
- ✅ Portuguese (pt-BR) primary language
- ✅ English (en) secondary language
- ✅ Onboarding tutorial (web + WhatsApp)
- ✅ Responsive design (mobile-first)
- ✅ Radix UI accessibility (WCAG 2.1)

### Security & Compliance
- ✅ Row Level Security (RLS) on all tables
- ✅ LGPD compliance (user data deletion)
- ✅ Rate limiting (AI API costs)
- ✅ Service role authentication (bot)
- ✅ Input validation (Zod schemas)
- ✅ Audit logging (deletion events)

---

## Related Documentation

### Project Root
- [Main README](../README.md) - Project overview and setup
- [CLAUDE.md](../CLAUDE.md) - AI assistant guidance
- [fe/README.md](../fe/README.md) - Frontend-specific README (pt-BR)
- [whatsapp-bot/README.md](../whatsapp-bot/README.md) - WhatsApp bot README

### Generated Documentation (this scan)
- [Architecture Overview](./architecture-overview.md) - System design + deployment
- [API Contracts - Frontend](./api-contracts-fe.md) - Server actions + REST APIs
- [API Contracts - WhatsApp Bot](./api-contracts-whatsapp-bot.md) - Handlers + services
- [Data Models](./data-models-shared.md) - Database schema + migrations
- [UI Components](./ui-components-fe.md) - React components + pages
- [NLP & OCR Systems](./nlp-ocr-systems-whatsapp-bot.md) - AI/ML architecture

### Workflow Tracking
- [BMM Workflow Status](./bmm-workflow-status.yaml) - BMad Method progress tracking
- [Project Scan Report](./project-scan-report.json) - Documentation workflow state

---

## Development Resources

### Environment Setup
```bash
# Frontend (fe/)
npm install
cp .env.example .env.local
npm run dev  # http://localhost:3000

# WhatsApp Bot (whatsapp-bot/)
npm install
cp .env.example .env
npm run dev  # Port 3001
```

### Required Environment Variables
**Frontend**:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_KEY`
- `NEXT_PUBLIC_POSTHOG_KEY`

**WhatsApp Bot**:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`
- `OPENAI_API_KEY`
- `WHATSAPP_PHONE_NUMBER`

### Testing
```bash
# Frontend
cd fe
npm run lint
npm run build

# WhatsApp Bot
cd whatsapp-bot
npm test              # Run all tests
npm test -- --watch   # Watch mode
npm run build         # TypeScript compile check
```

---

## Documentation Methodology

This documentation was generated using the **BMad Method** (Brownfield Multi-part Application Documentation) workflow, specifically designed for existing codebases without comprehensive documentation.

**Scan Type**: Exhaustive Scan
**Workflow**: document-project (initial_scan mode)
**Agent**: Mary (Business Analyst)
**Date**: 2025-11-21

**Process**:
1. Project structure classification (multi-part detection)
2. Existing documentation discovery
3. Technology stack analysis
4. API contract extraction (frontend + backend)
5. Database schema documentation
6. UI component inventory
7. NLP/OCR subsystem deep dive
8. Architecture and integration documentation
9. Master index generation

**Tools Used**:
- Static analysis (file structure, imports, exports)
- Code reading (key files per subsystem)
- Pattern recognition (architectural patterns)
- Database migration analysis (32 migration files)
- Test file examination (unit test coverage)

---

## Contributing

### Documentation Updates
When making code changes:
1. Update relevant .md files in `docs/`
2. Keep API contracts in sync with actual code
3. Document new database migrations
4. Update architecture diagrams if topology changes

### Code Conventions
- TypeScript strict mode enabled
- ESLint + Prettier configured
- Commit messages: Conventional Commits format
- PR template includes documentation checklist

### Questions or Issues
- GitHub Issues: Technical questions, bug reports
- Discussions: Architecture decisions, feature proposals
- Contact: [Add contact info]

---

## Changelog

### Documentation v1.0.0 (2025-11-21)
- **Initial Release**: Comprehensive brownfield documentation generated
- **Coverage**: 100% of core systems (API, Database, UI, NLP, OCR)
- **Files Generated**: 6 major documents + workflow tracking
- **Total Documentation**: ~15,000 lines across all files

---

**Last Updated**: 2025-11-21
**Next Review**: After major architecture changes or epic completion
**Maintained By**: Development Team
**Generated By**: BMad Method document-project workflow
