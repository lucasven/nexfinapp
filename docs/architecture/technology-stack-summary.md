# Technology Stack Summary

## Existing (Unchanged)

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| Frontend | Next.js | 15 | React framework with App Router |
| UI Components | Radix UI | Latest | Accessible component primitives |
| Styling | Tailwind CSS | 4 | Utility-first CSS |
| Database | PostgreSQL + pgvector | 15 | Relational database with vector search |
| Auth | Supabase Auth | Latest | User authentication |
| Backend | Node.js + TypeScript | 20 + 5.3 | WhatsApp bot runtime |
| WhatsApp | Baileys | Latest | WhatsApp Web API library |
| AI/NLP | OpenAI GPT-4o-mini | Latest | Intent parsing, helpers |
| Analytics | PostHog | Latest | Product analytics + feature flags |

## New Additions

| Package | Version | Purpose | Used By |
|---------|---------|---------|---------|
| `posthog-node` | ^4.0.0 | Server-side PostHog | WhatsApp bot (ADR-012) |
| `node-cron` | Existing | Scheduled jobs | Already in use (ADR-005) |

---
