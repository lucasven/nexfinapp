# Risk Assessment & Mitigation

## High Risk

| Risk | Impact | Mitigation | ADR |
|------|--------|------------|-----|
| Helper system causes high AI costs | $$$ | Per-user daily limits ($1), graceful degradation, admin-only limit adjustment | ADR-009 |
| Feature flags misconfigured (100% rollout too early) | User experience | Manual testing before each phase, metrics-driven rollout criteria, quick rollback procedure | ADR-008 |
| Statement period calculation errors | Budget accuracy | Comprehensive edge case testing (Feb 30, leap years), use last day of month fallback | ADR-006 |

## Medium Risk

| Risk | Impact | Mitigation | ADR |
|------|--------|------------|-----|
| Dashboard performance degrades with installment queries | User experience | Proper indexes, performance monitoring, defer optimization until proven need | ADR-011 |
| Credit Mode switching confusion | User confusion | Non-destructive mode switching, clear warnings, option to keep/pay off installments | ADR-004 |
| Auto-payment category becomes stale | Data accuracy | Use saved category (simple), user can manually correct or update recurring payment | ADR-010 |

## Low Risk

| Risk | Impact | Mitigation | ADR |
|------|--------|------------|-----|
| PostHog downtime affects feature flags | Feature rollout | Acceptable: PostHog SLA 99.9%, feature flags cached locally | ADR-002 |
| Helper routing accuracy <90% | User experience | LLM-based routing from day 1, monitor routing_accuracy metric, iterate on prompts | ADR-003 |

---
