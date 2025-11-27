# Engagement State Machine

This document describes the 5-state engagement machine that manages user lifecycle and re-engagement in the NexFinApp WhatsApp bot.

## State Diagram

```
                                    ┌─────────────────┐
                                    │                 │
                  user_message      │     ACTIVE      │◄────────────────────┐
              ┌────────────────────►│                 │                     │
              │                     └────────┬────────┘                     │
              │                              │                              │
              │                              │ inactivity_14d               │
              │                              │                              │
              │                              ▼                              │
              │                     ┌─────────────────┐                     │
              │                     │                 │                     │
              │  goodbye_response_1 │  GOODBYE_SENT   │ user_message        │
              │  (confused)         │                 │────────────────────►│
              │         ┌──────────►│   (48h timer)   │                     │
              │         │           └──┬──────┬───┬───┘                     │
              │         │              │      │   │                         │
              │         │              │      │   │ goodbye_timeout         │
              │         │              │      │   │ or goodbye_response_3   │
              │         │              │      │   │ (all_good)              │
              │         │              │      │   │                         │
              │         │              │      │   ▼                         │
              │    ┌────┴─────┐       │      │ ┌─────────────────┐         │
              │    │          │       │      │ │                 │         │
              │    │ HELP_FLOW│       │      │ │    DORMANT      │         │
              └────┤          │       │      │ │                 │─────────┘
                   │(transient)│       │      │ │  (end state)   │ user_message
                   └──────────┘       │      │ └────────┬────────┘
                                      │      │          ▲
                                      │      │          │
                         goodbye_     │      │          │ reminder_due
                         response_2   │      │          │
                         (busy)       │      │          │
                                      │      │ ┌────────┴────────┐
                                      │      │ │                 │
                                      │      │ │  REMIND_LATER   │
                                      │      └►│                 │
                                      │        │  (14d timer)    │
                                      │        └─────────────────┘
                                      │                ▲
                                      └────────────────┘
                                            user_message
                                            (reactivate)
```

## States

| State | Description | Entry Trigger | Exit Triggers |
|-------|-------------|---------------|---------------|
| `active` | Normal operating state. User is engaged. | Initial state, or reactivation | `inactivity_14d` |
| `goodbye_sent` | Goodbye message sent, waiting for response (48h window) | `inactivity_14d` | `goodbye_response_1/2/3`, `goodbye_timeout`, `user_message` |
| `help_flow` | Transient state for users who said "confused". Resets onboarding tiers. | `goodbye_response_1` | `user_message` (immediate) |
| `remind_later` | User requested a break. Reminder scheduled for 14 days. | `goodbye_response_2` | `reminder_due`, `user_message` |
| `dormant` | Inactive user. No proactive messages sent. | `goodbye_response_3`, `goodbye_timeout`, `reminder_due` | `user_message` |

## Triggers

| Trigger | Description | Source |
|---------|-------------|--------|
| `user_message` | Any message from the user | Real-time message handler |
| `inactivity_14d` | User hasn't sent messages for 14 days | Daily scheduler job |
| `goodbye_response_1` | User responds "1" or "confused" to goodbye | Message handler |
| `goodbye_response_2` | User responds "2" or "busy" to goodbye | Message handler |
| `goodbye_response_3` | User responds "3" or "all good" to goodbye | Message handler |
| `goodbye_timeout` | 48 hours passed since goodbye_sent without response | Daily scheduler job |
| `reminder_due` | Scheduled reminder time reached | Daily scheduler job |

## Goodbye Response Options

When a user receives the goodbye message, they can respond with:

| Option | Input Patterns | Action |
|--------|---------------|--------|
| 1 - Confused | `1`, `1️⃣`, `confuso`, `confused` | Reset to Tier 0, send help message, transition to `active` |
| 2 - Busy | `2`, `2️⃣`, `ocupado`, `busy` | Schedule 14-day reminder, transition to `remind_later` |
| 3 - All Good | `3`, `3️⃣`, `tudo certo`, `all good` | Graceful exit, transition to `dormant` |
| Other | Any other text | Reactivate user, process message normally |

## Key Files

- [`state-machine.ts`](./state-machine.ts) - Core state transition logic, optimistic locking
- [`activity-tracker.ts`](./activity-tracker.ts) - Tracks user activity, detects first messages
- [`message-router.ts`](./message-router.ts) - Routes messages to correct destination (individual/group)
- [`types.ts`](./types.ts) - TypeScript types of and transition maps
- [`constants.ts`](./constants.ts) - Configuration values (timeouts, thresholds)
- [`analytics.ts`](./analytics.ts) - PostHog event tracking for transitions

## Database Tables

### `user_engagement_states`
Tracks current state for each user:
- `state` - Current engagement state
- `last_activity_at` - Timestamp of last user activity
- `goodbye_sent_at` - When goodbye message was sent (null if not applicable)
- `goodbye_expires_at` - When 48h timeout expires (null if not in goodbye_sent)
- `remind_at` - When to send reminder (null if not in remind_later)

### `engagement_state_transitions`
Audit log of all state changes:
- `from_state`, `to_state` - State before/after transition
- `trigger` - What caused the transition
- `metadata` - JSONB with analytics data (days_inactive, response_type, etc.)

### `engagement_message_queue`
Queue for proactive messages with idempotency:
- `message_type` - Type of message (goodbye, weekly_review, etc.)
- `idempotency_key` - Prevents duplicate messages
- `status` - pending/sent/failed/cancelled

## Scheduler Jobs

### Daily Engagement Job
Runs daily to process:
1. **Inactive users** (14+ days) → Send goodbye message
2. **Expired goodbyes** (48h timeout) → Transition to dormant
3. **Due reminders** → Transition to dormant

### Weekly Review Job
Runs weekly (Sundays) to:
1. Find active users with transactions in the past week
2. Queue weekly review messages

## User Preferences

Two separate opt-out settings:
- `onboarding_tips_enabled` - Controls tier celebrations, contextual hints
- `reengagement_opt_out` - Controls goodbye messages, weekly reviews

Users can opt out via:
- WhatsApp: "parar lembretes" / "stop reminders"
- Web: Settings > Notification Preferences toggle

## Analytics Events (PostHog)

| Event | When Fired |
|-------|------------|
| `engagement_state_transition` | Every state change |
| `engagement_goodbye_response` | User responds to goodbye (including timeout) |
| `engagement_unprompted_return` | User returns after 3+ days without prompt |
| `engagement_preference_changed` | User opts in/out of re-engagement |

## Error Handling

- **State machine failures** are logged but don't crash the system
- **Analytics failures** are caught and logged (never block state transitions)
- **Optimistic locking** prevents concurrent modification conflicts
- **Idempotency keys** prevent duplicate messages

## Testing

- Unit tests in `__tests__/engagement/` and `__tests__/services/engagement/`
- Integration tests for full 30-day user journey
- Burn-in loop (10 iterations) for flaky test detection
