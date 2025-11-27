# Story 1.6: Message Queue Service Foundation

**Status:** done

---

## Story

**As a** system component,
**I want** a message queue service with idempotency guarantees,
**So that** proactive engagement messages are never sent twice.

---

## Acceptance Criteria

1. **AC-1:** `queueMessage()` creates queue entry with `status = 'pending'`, `retry_count = 0`
2. **AC-2:** Duplicate idempotency keys are silently ignored (upsert behavior)
3. **AC-3:** `getIdempotencyKey()` returns format `{userId}:{eventType}:{YYYY-MM-DD}`
4. **AC-4:** Retry logic increments `retry_count` on failure (deferred to Epic 5)
5. **AC-5:** After 3 failures, status becomes `'failed'` (deferred to Epic 5)

---

## Tasks / Subtasks

- [x] **Task 1: Implement queueMessage()** (AC: 1, 2)
  - [x] Import Supabase client
  - [x] Generate idempotency key
  - [x] Insert into engagement_message_queue table
  - [x] Use upsert with ignoreDuplicates for idempotency
  - [x] Return success/failure status
  - [x] Add proper logging

- [x] **Task 2: Verify getIdempotencyKey()** (AC: 3)
  - [x] Confirm implementation from Story 1.3
  - [x] Format: `{userId}:{eventType}:{YYYY-MM-DD}`

- [x] **Task 3: Verify build** (AC: all)
  - [x] Run `npm run build` to ensure TypeScript compiles

---

## Dev Notes

### Implementation Details

```typescript
export async function queueMessage(params: QueueMessageParams): Promise<boolean> {
  const supabase = getSupabaseClient()

  const idempotencyKey = getIdempotencyKey(
    params.userId,
    params.messageType,
    params.scheduledFor || new Date()
  )

  const { error } = await supabase
    .from('engagement_message_queue')
    .upsert(
      {
        user_id: params.userId,
        message_type: params.messageType,
        message_key: params.messageKey,
        message_params: params.messageParams || {},
        destination: params.destination,
        destination_jid: params.destinationJid,
        scheduled_for: (params.scheduledFor || new Date()).toISOString(),
        status: 'pending',
        retry_count: 0,
        idempotency_key: idempotencyKey,
      },
      {
        onConflict: 'idempotency_key',
        ignoreDuplicates: true,
      }
    )

  return !error
}
```

### Idempotency Behavior

When `queueMessage()` is called:
1. Generates key: `user123:goodbye:2025-11-21`
2. Attempts upsert to `engagement_message_queue`
3. If key exists → silently ignored (no error, returns true)
4. If key new → creates entry with `status = 'pending'`

This ensures:
- Running daily job multiple times won't duplicate messages
- Race conditions won't cause double-sends

### Deferred to Epic 5

- `processMessageQueue()` - Actually sends messages via Baileys
- `cancelMessage()` - Cancels pending messages
- `getPendingMessages()` - Retrieves user's pending messages
- Retry logic with `retry_count` increment
- Status transition to `'failed'` after 3 retries

### References

- [Source: docs/stories/tech-spec-epic-1.md#APIs-and-Interfaces]
- [Source: docs/architecture.md#ADR-003-Message-Queue-Table]

---

## Dev Agent Record

### Context Reference

- `docs/stories/1-5-engagement-localization-english.md` (predecessor)
- `fe/scripts/034_engagement_system.sql` (database schema from Story 1.1)

### Learnings from Previous Story

**From Story 1-5 (Status: done)**

- Localization messages complete in both languages
- All engagement message types defined

### Agent Model Used

Claude Sonnet 4.5 (claude-sonnet-4-5-20250929)

### Debug Log References

No issues encountered.

### Completion Notes List

- Implemented `queueMessage()` with Supabase upsert
- Uses `ignoreDuplicates: true` for idempotency
- `getIdempotencyKey()` already implemented in Story 1.3
- Proper error handling and logging
- Build passes successfully

### File List

**MODIFIED:**
- `whatsapp-bot/src/services/scheduler/message-sender.ts`

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2025-11-21 | Murat (TEA) | Initial draft and implementation |
