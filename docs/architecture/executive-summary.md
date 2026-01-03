# Executive Summary

This architecture defines the technical approach for adding two major feature epics to NexFinApp's existing expense tracking system:

1. **Epic A: Credit Card Management** - Brazilian parcelamento (installment) intelligence with statement-aware budgeting and awareness-first UX
2. **Epic B: AI Helper System** - Conversational education platform with feature-flagged gradual rollout

**Key Architectural Decisions:**
- Two-table installment model (plans + payments) for parcelamento tracking
- Hybrid budget periods: calendar month for categories, statement period for credit card totals
- AI-first conversational layer (GPT-4o-mini, no NLP pattern extensions)
- Feature flag infrastructure for 5% → 100% helper rollout
- Extend existing Next.js frontend + Node.js WhatsApp bot architecture

**Foundation:** Built on existing tech stack (Next.js 15, PostgreSQL + pgvector, Baileys WhatsApp, OpenAI GPT-4o-mini, Supabase, PostHog).

---
