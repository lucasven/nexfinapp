# Epic 1 Retrospective: Foundation & Message Infrastructure

**Date:** 2025-11-21
**Epic:** 1 - Foundation & Message Infrastructure
**Stories Completed:** 6/6 (100%)

---

## Summary

Epic 1 established the foundational infrastructure for the Smart Onboarding & Engagement System. All 6 stories were completed successfully with no blockers or significant issues.

### Stories Completed

| Story | Title | Outcome |
|-------|-------|---------|
| 1.1 | Database Schema Migration | Created 3 tables, extended user_profiles, RLS policies |
| 1.2 | Handler Directory Structure | 5 handler stubs in handlers/engagement/ |
| 1.3 | Service Directory Structure | 10 service files in services/engagement/ and services/scheduler/ |
| 1.4 | Localization - Portuguese | 20 engagement message keys in pt-br.ts |
| 1.5 | Localization - English | Natural English equivalents in en.ts |
| 1.6 | Message Queue Service | Implemented queueMessage() with idempotency |

---

## What Went Well

### 1. Clear Technical Specification
The tech-spec-epic-1.md document provided precise acceptance criteria and code examples, enabling rapid implementation without ambiguity.

### 2. Parallel Story Execution
Stories 1.2 and 1.3 could have been executed in parallel after 1.1, but were done sequentially for simplicity. Future epics can leverage parallelism.

### 3. Existing Patterns
The codebase had well-established patterns (handler structure, service structure, localization) that made it easy to follow conventions.

### 4. TypeScript Enforcement
TypeScript caught the missing English localization immediately when types.ts was updated, ensuring both languages stay in sync.

### 5. Idempotency Design
The `getIdempotencyKey()` function was simple but effective: `{userId}:{eventType}:{YYYY-MM-DD}` prevents duplicate daily messages.

---

## What Could Be Improved

### 1. Migration Numbering Discovery
Initially referenced migration as 033, but had to discover the actual latest was 033_fix_deletion_fk_order.sql.

**Lesson:** Always glob for `fe/scripts/*.sql | tail -1` before creating migrations.

### 2. Coupled Localization Updates
Updating types.ts required immediate updates to both pt-br.ts AND en.ts to pass TypeScript build, even though Story 1.5 was meant to handle English.

**Lesson:** Consider adding optional/partial message support, or document that localization stories must be done together.

### 3. Stub vs Implementation Boundary
Some functions in Story 1.3 (like `getIdempotencyKey()`) were implemented rather than stubbed because they had no external dependencies. This blurred the story boundaries.

**Lesson:** Document which functions are "implementable now" vs "need future dependencies" in tech spec.

---

## Technical Decisions Made

### Decision 1: CHECK Constraints vs ENUM
Used CHECK constraints for state values instead of PostgreSQL ENUMs for easier migrations.

```sql
CHECK (state IN ('active', 'goodbye_sent', 'help_flow', 'remind_later', 'dormant'))
```

**Rationale:** Adding new states requires only altering the CHECK constraint, not complex ENUM migrations.

### Decision 2: Partial Indexes for Nullable Columns
Used partial indexes for timestamp columns that are often NULL:

```sql
CREATE INDEX idx_engagement_goodbye_expires ON user_engagement_states(goodbye_expires_at)
  WHERE goodbye_expires_at IS NOT NULL;
```

**Rationale:** Improves scheduler query performance by only indexing rows that need to be checked.

### Decision 3: Upsert with ignoreDuplicates
Used Supabase's upsert with `ignoreDuplicates: true` for idempotency rather than explicit conflict handling.

**Rationale:** Cleaner code, no need to check if message exists before inserting.

---

## Metrics

| Metric | Value |
|--------|-------|
| Stories completed | 6 |
| Files created | 18 |
| Files modified | 5 |
| Build errors encountered | 1 (en.ts missing keys - expected) |
| Blockers | 0 |
| Time to complete | ~1 session |

---

## Impact on Future Epics

### Epic 2 (Conversation-First Welcome)
- Can now use `handlers/engagement/first-message-handler.ts`
- Can use localization messages: `engagementFirstMessage`, `engagementFirstExpenseSuccess`
- Database ready with `user_engagement_states` table

### Epic 3 (Progressive Tier Journey)
- Can use `handlers/engagement/tier-progress-handler.ts`
- Can use localization messages: `engagementTier1Complete`, `engagementTier2Complete`, `engagementTier3Complete`
- `user_profiles.onboarding_tier` column ready

### Epic 4 (Engagement State Machine)
- Can implement `services/engagement/state-machine.ts`
- VALID_TRANSITIONS map already defined in types.ts
- All 5 states ready in database

### Epic 5 (Scheduled Jobs)
- Can implement `services/scheduler/daily-engagement-job.ts`
- Can implement `services/scheduler/weekly-review-job.ts`
- `queueMessage()` ready for use
- `processMessageQueue()` stub ready for implementation

### Epic 6 (User Preferences)
- Can use `handlers/engagement/opt-out-handler.ts`
- `user_profiles.reengagement_opt_out` column ready
- Localization: `engagementOptOutConfirm`, `engagementOptInConfirm`

---

## Recommendations for Next Epic

1. **Context Epic 2 before starting stories** - Ensure tech spec is created with same detail level as Epic 1

2. **Consider story parallelism** - Stories 2.1-2.3 may be independent and parallelizable

3. **Test database migration** - Run 034_engagement_system.sql on staging before production

4. **Verify RLS policies** - Test that service role can access engagement tables while regular users cannot write

---

## Open Questions for Future

| Question | Status | Notes |
|----------|--------|-------|
| Should weekly review respect timezone? | Deferred | Currently runs Sunday UTC |
| Should goodbye timeout be exact 48h or approximate? | Resolved | ADR-005: Approximate (daily job) |
| Should message queue support priority? | Deferred | Not needed for MVP |

---

_Retrospective completed: 2025-11-21_
_Agent: Claude Sonnet 4.5_
