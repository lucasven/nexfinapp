# Story 1.4: Engagement Localization - Portuguese

**Status:** done

---

## Story

**As a** Brazilian user,
**I want** all engagement messages in natural Portuguese (pt-BR),
**So that** the bot feels like a friendly companion, not a formal system.

---

## Acceptance Criteria

1. **AC-1:** `localization/pt-br.ts` contains welcome message categories
2. **AC-2:** `localization/pt-br.ts` contains tier unlock messages (Tier 1, 2, 3)
3. **AC-3:** `localization/pt-br.ts` contains goodbye/self-select messages
4. **AC-4:** `localization/pt-br.ts` contains weekly review messages
5. **AC-5:** `localization/pt-br.ts` contains opt-out confirmation messages
6. **AC-6:** All messages use casual register ("você"), max one emoji
7. **AC-7:** No guilt, pressure, judgment, or manipulation framing

---

## Tasks / Subtasks

- [x] **Task 1: Update types.ts** (AC: 1-5)
  - [x] Add engagement message type definitions
  - [x] Add function signatures for parameterized messages

- [x] **Task 2: Create Portuguese messages** (AC: 1-7)
  - [x] First message & welcome messages
  - [x] Tier unlock messages (1, 2, 3)
  - [x] Contextual hints
  - [x] Goodbye/self-select messages
  - [x] Weekly review message
  - [x] Opt-out/opt-in confirmations
  - [x] Dormant reactivation message

- [x] **Task 3: Add English stubs** (Build requirement)
  - [x] Add corresponding messages to en.ts for TypeScript compilation

- [x] **Task 4: Verify build** (AC: all)
  - [x] Run `npm run build` to ensure TypeScript compiles

---

## Dev Notes

### Message Keys Added

```typescript
// First Message & Welcome
engagementFirstMessage: (contextualResponse: string | null) => string
engagementFirstExpenseSuccess: string
engagementGuideToFirstExpense: string

// Tier Unlock Messages
engagementTier1Complete: string
engagementTier2Complete: string
engagementTier3Complete: string

// Contextual Hints
engagementHintAddCategory: string
engagementHintSetBudget: string
engagementHintViewReport: string

// Goodbye/Self-Select Messages
engagementGoodbyeMessage: string
engagementGoodbyeResponse1: string
engagementGoodbyeResponse2: string
engagementGoodbyeResponse3: string
engagementGoodbyeTimeout: string
engagementRemindLaterConfirm: string

// Help Flow
engagementHelpFlowStart: string

// Weekly Review
engagementWeeklyReviewActive: (summary) => string

// Opt-Out
engagementOptOutConfirm: string
engagementOptInConfirm: string

// Dormant Reactivation
engagementWelcomeBack: string
```

### Tone Compliance

All messages follow PRD tone guidelines:
- **Curiosity**: "Experimenta mandar algo tipo..."
- **Celebration**: "Você já dominou o básico!"
- **Dignity**: "Sem pressão—finanças são pessoais"
- **Empowerment**: "Tem controle total das suas finanças"

Avoided:
- Guilt framing
- Pressure ("Don't forget!")
- Judgment ("Your budget is way over!")
- Manipulation ("Don't lose your streak!")

### References

- [Source: docs/prd.md#Critical-Interaction-Flows]
- [Source: docs/stories/tech-spec-epic-1.md#Story-1.4]

---

## Dev Agent Record

### Context Reference

- `docs/stories/1-3-engagement-service-directory-structure.md` (predecessor)

### Learnings from Previous Story

**From Story 1-3 (Status: done)**

- Service stubs created at `services/engagement/` and `services/scheduler/`
- Pattern: stub functions with TODO comments referencing implementation epics

### Agent Model Used

Claude Sonnet 4.5 (claude-sonnet-4-5-20250929)

### Debug Log References

No issues encountered.

### Completion Notes List

- Added 20 engagement message keys to types.ts
- Created Portuguese messages following PRD tone guidelines
- Added English equivalents for TypeScript compilation (Story 1.5 will refine)
- All messages use casual "você" register
- Max one emoji per message (only in goodbye message: 💙)
- Build passes successfully

### File List

**MODIFIED:**
- `whatsapp-bot/src/localization/types.ts`
- `whatsapp-bot/src/localization/pt-br.ts`
- `whatsapp-bot/src/localization/en.ts`

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2025-11-21 | Murat (TEA) | Initial draft and implementation |
