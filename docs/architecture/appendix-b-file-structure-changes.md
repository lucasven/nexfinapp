# Appendix B: File Structure Changes

## New Files

```
whatsapp-bot/src/
├── services/
│   ├── helpers/
│   │   ├── base-helper.ts              # NEW (ADR-003)
│   │   ├── budget-helper.ts            # NEW (ADR-003)
│   │   ├── installment-helper.ts       # NEW (ADR-003)
│   │   └── [5 more helpers...]         # FUTURE
│   ├── installments/
│   │   ├── installment-manager.ts      # NEW (ADR-001)
│   │   └── future-commitments.ts       # NEW (ADR-001)
│   ├── ai/
│   │   └── cost-manager.ts             # NEW (ADR-009)
│   ├── scheduler/
│   │   ├── auto-payments-job.ts        # NEW (ADR-010)
│   │   └── credit-card-reminders-job.ts # NEW (ADR-005)
│   └── analytics/
│       └── posthog.ts                  # NEW (ADR-012)

fe/
├── components/
│   ├── credit-cards/
│   │   ├── credit-mode-toggle.tsx      # NEW (ADR-004)
│   │   ├── installment-dialog.tsx      # NEW (ADR-001)
│   │   └── statement-period-display.tsx # NEW (ADR-006)
│   └── settings/
│       └── notification-preferences.tsx # EXISTING (referenced)
└── lib/
    └── analytics/
        └── performance.ts              # NEW (ADR-011)
```

## Modified Files

```
whatsapp-bot/src/
└── scheduler.ts                        # UPDATE (ADR-005, ADR-010)

fe/
├── lib/actions/
│   ├── installments.ts                 # NEW (ADR-001)
│   └── admin.ts                        # UPDATE (ADR-009)
└── lib/analytics/
    └── events.ts                       # UPDATE (ADR-012)
```

## Database Migrations

```
supabase/migrations/
├── 033_installment_tables.sql          # NEW (ADR-001)
├── 034_credit_mode_fields.sql          # NEW (ADR-001)
└── 035_helper_cost_tracking.sql        # NEW (ADR-009)
```

---

**Document Version:** 2.0
**Status:** ✅ Complete - All 12 ADRs Finalized
**Last Updated:** 2025-12-02
**Next Review:** After Phase 1 implementation completion

**Approval:**
- [x] Lucas (Product Owner) - Architecture Review
- [x] Lucas (Developer) - Technical Feasibility Review
- [x] Ready for Implementation

---

_This architecture document was created through collaborative decision facilitation by Lucas (Architect Agent) as part of the BMad Method workflow._