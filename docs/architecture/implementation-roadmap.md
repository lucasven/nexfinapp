# Implementation Roadmap

## Phase 1: Foundation (Week 1-2)

**Database Schema:**
- Create `installment_plans` and `installment_payments` tables (ADR-001)
- Add `credit_mode`, `statement_closing_day`, `payment_due_day` to `payment_methods` (ADR-001)
- Add `helper_domain` column to `user_ai_usage` (ADR-009)
- Create indexes for performance (ADR-011)

**Feature Flags:**
- Configure PostHog feature flags: `credit-card-management`, `ai-helpers` (ADR-002)
- Set both to 0% initially

**Analytics:**
- Add PostHog integration to WhatsApp bot (ADR-012)
- Create credit card tracking events (frontend)
- Create helper tracking events (bot)

## Phase 2: Credit Card Management (Week 3-5)

**Backend (WhatsApp Bot):**
- Installment creation handler (ADR-001)
- Statement period calculation utility (ADR-006)
- Credit card budget calculations (ADR-007)
- Auto-payment scheduled job (ADR-010)
- Credit card reminder scheduled job (ADR-005)

**Frontend:**
- Credit Mode toggle UI (ADR-004)
- Installment plan creation/editing
- Statement period budget display
- Future commitments visualization

**Testing:**
- Manual testing with real WhatsApp numbers
- Edge case validation (Feb 30 → Feb 28/29, etc.)
- Feature flag rollout: 0% → 5% → 25% → 50% → 100% over 4 weeks

## Phase 3: AI Helper System (Week 6-8)

**Backend (WhatsApp Bot):**
- BaseHelper abstract class (ADR-003)
- LLM-based domain routing (ADR-003)
- AI cost management (ADR-009)
- BudgetHelper implementation (first helper)
- InstallmentHelper implementation (second helper)

**Testing:**
- Manual test script (ADR-008)
- Unit tests for helpers
- Metrics collection (PostHog)
- Feature flag rollout: 0% → 5% → 25% → 50% → 100% over 5 weeks

## Phase 4: Iteration & Expansion (Week 9+)

**Additional Helpers:**
- CategoryHelper
- RecurringHelper
- TransactionHelper
- ReportHelper
- TipHelper

**Optimizations:**
- Performance monitoring (ADR-011)
- Add caching if dashboard >2s
- Prompt optimization based on cost analytics

---
