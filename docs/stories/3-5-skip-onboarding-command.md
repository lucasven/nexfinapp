# Story 3.5: Skip Onboarding Command

**Status:** done

---

## Story

**As a** user,
**I want** to stop receiving onboarding tips,
**So that** I can use the app without tutorial interruptions.

---

## Acceptance Criteria

26. **AC-3.5.1:** "parar dicas" or "stop tips" disables tips, sends confirmation
27. **AC-3.5.2:** "ativar dicas" or "enable tips" re-enables tips, sends confirmation
28. **AC-3.5.3:** With tips disabled, tier completions tracked but NOT celebrated
29. **AC-3.5.4:** Tip preference is separate from re-engagement opt-out (FR28-32)
30. **AC-3.5.5:** Command matching is case-insensitive

---

## Tasks / Subtasks

- [x] **Task 1: Implement isTipCommand()** (AC: 26, 27, 30)
  - [x] Define regex patterns for disable: parar dicas, stop tips, desativar dicas, disable tips
  - [x] Define regex patterns for enable: ativar dicas, enable tips, start tips
  - [x] Make matching case-insensitive
  - [x] Return 'disable' | 'enable' | null

- [x] **Task 2: Implement handleTipOptOut()** (AC: 26, 27)
  - [x] Check if message matches tip command
  - [x] Update user_profiles.onboarding_tips_enabled
  - [x] Return localized confirmation message
  - [x] Return null if not a tip command

- [x] **Task 3: Ensure tips_enabled column exists** (AC: all)
  - [x] Check if column exists in Epic 1 migration
  - [x] If not, create migration to add column
  - [x] Default value: true

- [x] **Task 4: Integrate with message handler** (AC: 26, 27)
  - [x] Add tip command check early in message processing
  - [x] Handle command before NLP processing
  - [x] Return confirmation without further processing

- [x] **Task 5: Verify separation from re-engagement opt-out** (AC: 29)
  - [x] Document that onboarding_tips_enabled != reengagement_opt_out
  - [x] Test that disabling tips doesn't affect re-engagement
  - [x] Test that opting out of re-engagement doesn't affect tips

- [x] **Task 6: Update areTipsEnabled() in tier-tracker** (AC: 28)
  - [x] Ensure areTipsEnabled() reads from correct column
  - [x] Verify celebration logic respects this setting

- [x] **Task 7: Write unit tests** (AC: 26, 27, 28, 29, 30)
  - [x] Test "parar dicas" disables tips
  - [x] Test "STOP TIPS" (uppercase) disables tips
  - [x] Test "ativar dicas" enables tips
  - [x] Test variations: "desativar dicas", "disable tips"
  - [x] Test non-matching text returns null
  - [x] Test tier completion with tips disabled - no celebration

---

## Dev Notes

### Architecture Alignment

Implements `handlers/engagement/opt-out-handler.ts` (stub from Epic 1).

### Command Patterns

```typescript
const DISABLE_PATTERNS = [
  /parar\s*dicas/i,
  /stop\s*tips/i,
  /desativar\s*dicas/i,
  /disable\s*tips/i,
]

const ENABLE_PATTERNS = [
  /ativar\s*dicas/i,
  /enable\s*tips/i,
  /start\s*tips/i,
  /ligar\s*dicas/i,
]

export function isTipCommand(text: string): 'disable' | 'enable' | null {
  const normalized = text.trim().toLowerCase()
  if (DISABLE_PATTERNS.some(p => p.test(normalized))) return 'disable'
  if (ENABLE_PATTERNS.some(p => p.test(normalized))) return 'enable'
  return null
}
```

### Database Column

```sql
-- Check if exists, add if not
ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS onboarding_tips_enabled BOOLEAN DEFAULT true;
```

### Localization Keys

From localization (Epic 1):
- `engagementTipsDisabled`: "Dicas desativadas. Envie 'ativar dicas' para reativar."
- `engagementTipsEnabled`: "Dicas ativadas! Você receberá sugestões após ações."

### Separation from Re-engagement

| Setting | Column | Affects |
|---------|--------|---------|
| Tips enabled | `onboarding_tips_enabled` | Tier celebrations, contextual hints |
| Re-engagement opt-out | `reengagement_opt_out` | Goodbye messages, weekly reviews |

Both default to opt-in (tips=true, opt_out=false).

### References

- [Source: docs/stories/tech-spec-epic-3.md#Story-3.5]
- [Source: docs/prd.md#FR10]

---

## Dev Agent Record

### Context Reference

- `docs/stories/tech-spec-epic-3.md` (epic tech spec)
- `docs/stories/3-1-tier-progress-tracking-service.md` (areTipsEnabled)
- `docs/stories/3-3-tier-completion-detection-celebrations.md` (uses tips setting)
- `whatsapp-bot/src/localization/pt-br.ts` (confirmation messages)

### Prerequisites

- Epic 1 infrastructure complete
- Story 3.1 complete (areTipsEnabled function)

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2025-11-22 | BMad Master | Initial draft |
