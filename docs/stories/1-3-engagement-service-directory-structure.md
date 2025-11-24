# Story 1.3: Engagement Service Directory Structure

**Status:** done

---

## Story

**As a** developer,
**I want** the engagement service directory structure created with types, constants, and placeholder services,
**So that** subsequent stories have a clear location for engagement business logic.

---

## Acceptance Criteria

1. **AC-1:** File `services/engagement/types.ts` defines `EngagementState`, `TransitionTrigger`, `MessageType`, `TierProgress`
2. **AC-2:** File `services/engagement/constants.ts` defines thresholds and tier action arrays
3. **AC-3:** File `services/engagement/index.ts` exports all engagement services
4. **AC-4:** Stub files exist: `state-machine.ts`, `activity-tracker.ts`, `message-router.ts`
5. **AC-5:** Files exist: `services/scheduler/index.ts`, `daily-engagement-job.ts`, `weekly-review-job.ts`, `message-sender.ts`

---

## Tasks / Subtasks

- [x] **Task 1: Create engagement types** (AC: 1)
  - [x] Define EngagementState type (5 states)
  - [x] Define TransitionTrigger type
  - [x] Define MessageType type
  - [x] Define TierProgress interface
  - [x] Define VALID_TRANSITIONS map

- [x] **Task 2: Create engagement constants** (AC: 2)
  - [x] INACTIVITY_THRESHOLD_DAYS = 14
  - [x] GOODBYE_TIMEOUT_HOURS = 48
  - [x] REMIND_LATER_DAYS = 14
  - [x] Tier action arrays

- [x] **Task 3: Create engagement services** (AC: 3, 4)
  - [x] Create state-machine.ts stub
  - [x] Create activity-tracker.ts stub
  - [x] Create message-router.ts stub
  - [x] Create index.ts with re-exports

- [x] **Task 4: Create scheduler services** (AC: 5)
  - [x] Create message-sender.ts stub
  - [x] Create daily-engagement-job.ts stub
  - [x] Create weekly-review-job.ts stub
  - [x] Create index.ts with re-exports

---

## Dev Notes

### Architecture Alignment

Implements the Project Structure section from `docs/architecture.md`.

### File Structure

```
whatsapp-bot/src/services/
├── engagement/           # NEW
│   ├── index.ts
│   ├── types.ts
│   ├── constants.ts
│   ├── state-machine.ts
│   ├── activity-tracker.ts
│   └── message-router.ts
└── scheduler/            # NEW
    ├── index.ts
    ├── message-sender.ts
    ├── daily-engagement-job.ts
    └── weekly-review-job.ts
```

### References

- [Source: docs/architecture.md#Project-Structure]
- [Source: docs/stories/tech-spec-epic-1.md#Services-and-Modules]

---

## Dev Agent Record

### Context Reference

- `docs/stories/1-2-engagement-handler-directory-structure.md` (predecessor)

### Learnings from Previous Story

**From Story 1-2 (Status: done)**

- Handler stubs created at `handlers/engagement/`
- Pattern: stub functions with TODO comments referencing implementation epics

### Agent Model Used

Claude Sonnet 4.5 (claude-sonnet-4-5-20250929)

### Debug Log References

No issues encountered.

### Completion Notes List

- Created 10 service files with stub implementations
- types.ts includes VALID_TRANSITIONS map and isValidTransition() helper
- constants.ts has all PRD-derived thresholds
- message-sender.ts includes getIdempotencyKey() implementation (not a stub)
- All functions have TODO comments referencing implementation epics

### File List

**NEW:**
- `whatsapp-bot/src/services/engagement/index.ts`
- `whatsapp-bot/src/services/engagement/types.ts`
- `whatsapp-bot/src/services/engagement/constants.ts`
- `whatsapp-bot/src/services/engagement/state-machine.ts`
- `whatsapp-bot/src/services/engagement/activity-tracker.ts`
- `whatsapp-bot/src/services/engagement/message-router.ts`
- `whatsapp-bot/src/services/scheduler/index.ts`
- `whatsapp-bot/src/services/scheduler/message-sender.ts`
- `whatsapp-bot/src/services/scheduler/daily-engagement-job.ts`
- `whatsapp-bot/src/services/scheduler/weekly-review-job.ts`

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2025-11-21 | Murat (TEA) | Initial draft and implementation |
