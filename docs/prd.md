# NexFinApp - Product Requirements Document

**Author:** Lucas
**Date:** 2025-11-28
**Version:** 2.0

---

## Executive Summary

NexFinApp's Credit Card Management System transforms how Brazilian users track and understand their credit card spending by embracing cultural norms (installment payments), respecting mental models (opt-in Credit Mode vs Simple Mode), and prioritizing awareness without judgment.

The core insight: **Users don't change spending behavior through restriction—they change through clear self-awareness.** The solution is visibility-first features that make the invisible visible, combined with Brazilian-specific installment intelligence that no generic tracker provides.

This PRD defines a two-epic system:
1. **Credit Card Management** (Epic A): Opt-in credit features, installment tracking, statement awareness, and user-defined budgets
2. **AI Helper System** (Epic B): Conversational domain helpers that educate users about features through natural WhatsApp conversations

### What Makes This Special

> "The first credit card tracker that treats manual entry as mindfulness, not a limitation—with uniquely Brazilian installment awareness and zero guilt."

**The differentiator isn't automation—it's the interaction philosophy:**

| Traditional Credit Card Apps | NexFinApp Credit Management |
|------------------------------|----------------------------|
| Auto-sync everything | Manual entry = awareness moment |
| One-size-fits-all | Credit Mode OR Simple Mode (user choice) |
| Red warnings: "OVERSPENT!" | Neutral awareness: "Spent more than planned" |
| Generic credit tracking | Brazilian parcelamento intelligence |
| Rigid command interface | Conversational AI helpers ("ajuda cartão") |
| Feature discovery through menus | Education-first helper system |
| Feels like **surveillance** | Feels like **self-knowledge** |

Competitors build budget enforcers. NexFinApp builds **financial awareness companions** that respect user autonomy and cultural context.

---

## Project Classification

**Technical Type:** Multi-part Application Enhancement (Brownfield)
- Next.js 15 web application with Supabase backend
- Node.js WhatsApp bot service using Baileys library
- Shared PostgreSQL database with pgvector for AI features
- **Enhancement context:** Building on mature codebase (~12,000 lines) with existing expense tracking

**Domain:** Personal Finance / Credit Card Management (Fintech-adjacent)

**Complexity:** Medium
- No payment processing (tracking only, not transactions)
- No KYC/AML regulatory requirements
- LGPD compliance already implemented in existing codebase
- Brazilian cultural context: installments (parcelamento) are norm, not exception
- AI/NLP costs managed with daily limits

**Project Context:** Brownfield Feature Addition
- Existing 3-layer NLP system operational
- Multi-identifier WhatsApp authentication in place
- Category management and budgeting infrastructure exists
- Building credit-specific features as opt-in enhancement

---

## Source Documents

**Brainstorming Session:** `docs/brainstorming-session-results-2025-11-27.md`
**Brownfield Documentation:** `docs/index.md` (comprehensive technical docs)
**Product Brief:** `docs/product-brief-NexFinApp-2025-11-21.md` (original vision - onboarding focus)
**Research Documents:** None (proceeding with founder insights + cultural knowledge)

---
