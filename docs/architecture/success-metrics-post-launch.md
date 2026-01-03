# Success Metrics (Post-Launch)

## Credit Card Management (Epic A)

| Metric | Target | Measurement | Dashboard |
|--------|--------|-------------|-----------|
| Credit Mode adoption rate | >30% of credit card users | `credit_card_created` with `credit_mode=true` | PostHog: Credit Card Adoption |
| Installment creation rate | >10 installments/week | `installment_created` count | PostHog: Credit Card Adoption |
| Statement period usage | >50% of Credit Mode users view statement | `statement_period_viewed` unique users | PostHog: Credit Card Adoption |
| Auto-payment success rate | >95% | `auto_payment_executed` success/total | Logs + PostHog |

## AI Helper System (Epic B)

| Metric | Target | Measurement | Dashboard |
|--------|--------|-------------|-----------|
| Helper invocation rate | >5 invocations/user/week | `ai_helper_invoked` count | PostHog: AI Helper Performance |
| Helper completion rate | >70% | `ai_helper_completed` success/total | PostHog: AI Helper Performance |
| Helper error rate | <10% | `ai_helper_error` count/invocations | PostHog: AI Helper Performance |
| Avg conversation turns | <4 turns | `turn_count` average | PostHog: AI Helper Performance |
| Routing accuracy | >90% | Manual validation sample | PostHog: AI Helper Performance |
| Cost per user per day | <$0.10 | `user_ai_usage` daily totals | Admin analytics |

## Performance (NFRs)

| Metric | Target | Measurement | Dashboard |
|--------|--------|-------------|-----------|
| Dashboard load time (p95) | <2s | `dashboard_load` duration_ms | PostHog: Dashboard Performance |
| Auto-payment execution time | <5s per payment | Logs | Scheduler logs |
| Helper response time | <3s | Time to first message | PostHog: AI Helper Performance |

---
