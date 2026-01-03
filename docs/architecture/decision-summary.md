# Decision Summary

| # | Category | Decision | Priority | Affects Epics | Key Rationale |
|---|----------|----------|----------|---------------|---------------|
| **ADR-001** | Data Model - Installments | Two-table design: `installment_plans` + `installment_payments` | CRITICAL | Epic A (FR13-FR23) | Clean separation of plan metadata from monthly payments. Natural fit for Brazilian "compra parcelada" mental model. |
| **ADR-001** | Budget Periods | Hybrid: Calendar month (categories), Statement period (credit card totals) | CRITICAL | Epic A (FR8-FR12) | Category budgets stay simple. Credit card total budgets follow statement closing date. Avoids per-card category complexity. |
| **ADR-002** | Feature Flags | PostHog feature flags (no custom fallback) | CRITICAL | Epic A, Epic B (FR69-FR70) | Pure PostHog for 5% → 100% rollout. Simple, no dual systems. |
| **ADR-003** | Helper Architecture | BaseHelper abstract class + LLM-based routing | CRITICAL | Epic B (FR55-FR68) | Class-based abstraction enables 7 eventual helpers. LLM routing from day 1 (not keyword-based). |
| **ADR-004** | Credit Mode Switch | Non-destructive with user choice (keep/pay off installments) | CRITICAL | Epic A (FR3-FR7) | Never lose data. User decides what happens to active installments when switching modes. |
| **ADR-005** | Scheduled Jobs | In-process node-cron scheduler | IMPORTANT | Epic A (FR51-FR54) | Extend existing `whatsapp-bot/src/scheduler.ts`. Jobs need WhatsApp socket access. |
| **ADR-006** | Statement Period Edge Cases | Use last day of month when closing_day > days in month | IMPORTANT | Epic A (FR8-FR12) | Edge case: Feb 30 → Feb 28/29. Prevents errors, predictable behavior. |
| **ADR-007** | Budget Calculation | Real-time aggregation (no caching) | IMPORTANT | Epic A (FR8-FR12) | Proper indexes sufficient for realistic workload. Defer caching until proven need. |
| **ADR-008** | Helper Rollout & Testing | Manual testing + metrics-driven 4-phase rollout | IMPORTANT | Epic B (FR66-FR68) | Realistic for WhatsApp (no E2E automation). 0% → 5% → 25% → 50% → 100%. |
| **ADR-009** | AI Cost Management | Per-helper domain tracking, shared daily limit | IMPORTANT | Epic B (FR64) | Track costs by helper domain. Graceful degradation when limit reached. Admin-only limit adjustment. |
| **ADR-010** | Auto-Payment Category | Use recurring payment's saved category (simple) | IMPORTANT | Epic A (FR47-FR50) | Simple, fast, predictable. User can manually correct if needed. |
| **ADR-011** | Performance Optimization | Defer until proven need (start with indexes) | NICE-TO-HAVE | Epic A (NFR1) | YAGNI principle. Proper indexes handle realistic workload (<1s dashboard load). |
| **ADR-012** | Analytics Events | Extend existing PostHog pattern | NICE-TO-HAVE | Epic A, Epic B (NFR9) | Consistent with existing analytics. Simple event tracking, no complex taxonomy. |

---
