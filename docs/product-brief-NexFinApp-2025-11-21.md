# Product Brief: NexFinApp - Smart Onboarding & Engagement System

**Date:** 2025-11-21
**Author:** Lucas
**Context:** Brownfield Enhancement

---

## Executive Summary

NexFinApp needs a **smart onboarding and engagement system** that guides users through feature discovery via WhatsApp, making them feel accomplished at each step, while implementing intelligent re-engagement that respects user dignity and avoids spam-like behavior.

The core insight: **Users don't know what they CAN do → they don't feel accomplished → they churn.** The solution is guided discovery that builds confidence, not more features.

---

## Core Vision

### Problem Statement

Current users face three distinct drop-off points:

1. **Pre-connection drop-off**: Users complete web signup but never connect their WhatsApp number
2. **Confusion drop-off**: Users connect WhatsApp but don't understand what actions are available, leading to inaction
3. **Engagement drop-off**: Users add a few expenses manually but don't return, never discovering the full power of the system

The root cause is **lack of awareness** - users simply don't know the range of actions they can take (expense tracking, category management, budgets, recurring expenses, reports). Without this knowledge, they can't feel accomplished, and without accomplishment, they don't form the habit.

### Problem Impact

- Users who could benefit from the 3-layer NLP system never experience it
- The semantic cache and AI capabilities go unused
- Retention suffers because users don't reach the "hooked" milestone (2 months of usage)
- Manual onboarding support is required (founder-led guidance via WhatsApp)

### Proposed Solution

A **two-part intelligent engagement system**:

1. **Progressive Onboarding Journey**: Guide users through a structured discovery of features, celebrating each accomplishment
2. **Smart Re-engagement Engine**: Context-aware nudges that respect user activity patterns and emotional state

Key design principles:
- Feel like a supportive friend, not a nagging app
- Preserve user dignity (finances are personal and sensitive)
- Use curiosity-driven language, never guilt
- Respect user choices (silence for churned users)

---

## Target Users

### Primary Users

**New NexFinApp signups** who have:
- Created a web account
- May or may not have connected WhatsApp
- Are in the critical first 2 weeks (trial period)
- Need guidance to discover the full feature set

Characteristics:
- Motivated enough to sign up (they want to track expenses)
- Unfamiliar with WhatsApp bot capabilities
- Need small wins to build confidence
- Sensitive about financial matters

### Secondary Users

**Lapsed users** who have:
- Connected WhatsApp previously
- Used the app but gone quiet
- May still be active on the web interface
- Could be re-engaged with the right approach

---

## Success Metrics

### Primary KPIs

| Metric | Current | Target | Why It Matters |
|--------|---------|--------|----------------|
| Trial → 2-month retention | TBD | Increase | Core "hooked" indicator |
| WhatsApp connection rate | TBD | Increase | First engagement hurdle |
| Features discovered per user | TBD | 8+ features | Accomplishment breadth |
| Time to first "aha moment" | TBD | < 24 hours | Early hook critical |

### Engagement Indicators

- Tier completion rates (Tier 1 → Tier 2 → Tier 3 progression)
- Self-select goodbye response distribution (confused vs busy vs all good)
- Re-engagement message response rate
- Web-only → WhatsApp conversion rate
- Voluntary churn vs. confusion churn (informed by self-select responses)

---

## MVP Scope

### Core Features

#### 1. Progressive Onboarding Journey

A guided sequence using **progressive disclosure** across 3 tiers - each tier feels like an achievement:

**TIER 1: "Expense Mastery"** (Core actions - available immediately)
| Step | Action | Accomplishment Message |
|------|--------|------------------------|
| 1 | Add an expense | "You just tracked spending! 🎉" |
| 2 | Edit expense category | "You can reorganize anytime" |
| 3 | Delete an expense | "Mistakes happen, easy fix" |
| 4 | Add a category | "Make it yours" |

> 🔓 *"You've mastered expense tracking! But here's where it gets powerful..."*

**TIER 2: "Plan Ahead"** (Unlocks after Tier 1 complete)
| Step | Action | Accomplishment Message |
|------|--------|------------------------|
| 5 | Set a budget | "Now you're planning ahead!" |
| 6 | Add recurring expense | "Autopilot for subscriptions" |
| 7 | List categories | "See your world organized" |

> 🔓 *"You're not just tracking—you're planning! Ready to see the big picture?"*

**TIER 3: "See the Big Picture"** (Unlocks after Tier 2 complete)
| Step | Action | Accomplishment Message |
|------|--------|------------------------|
| 8 | Edit a category | "Evolve your system" |
| 9 | Check reports | "See your progress" ← HOOK POINT |

> 🎉 *"You're a pro now! You have complete control over your finances."*

**Why this structure:**
- **Tier 1 = Expense CRUD**: Users came to track expenses—let them do it immediately
- **Tier 2 = Forward planning**: Budgets and recurring unlock "autopilot" feeling
- **Tier 3 = Insights**: Reports are the hook that shows long-term value

Principles:
- **Action first**: Let users DO something immediately (add expense is step 1)
- **Progressive disclosure**: Reveal complexity gradually, each tier feels like an achievement
- **User autonomy**: Allow skipping tiers or stopping the flow entirely
- Track **tier completion** (not individual steps) for cleaner progress tracking
- **Self-serve alternative**: Documentation/videos on website for users who prefer to explore independently
- **Contextual learning**: Teach categories AFTER first expense ("Want to create custom categories like 'Coffee runs'?")

#### 2. Smart Re-engagement Engine

Context-aware messaging based on user activity:

| Scenario | Action | Timing |
|----------|--------|--------|
| Active user (had activity last week) | **Weekly review**: Celebrate + gentle check-in | Weekly |
| Active user (no activity last week) | **No message** (silence, not guilt) | — |
| Active user, slight gap | Gentle curiosity nudge | After a few days |
| Inactive 2 weeks | **Self-select goodbye** with options | Single message |
| Active on web, not WhatsApp | "You can do this in WhatsApp too" | Once per month |
| Fully churned (no activity) | Respectful silence | No messages |

**Weekly Review Message (activity-triggered only):**
> "Hey, you did great last week tracking your expenses! How are things going for you this week?"

Key: Only sent if user HAD activity. No activity = no message. The absence of guilt IS the design.

**Self-Select Goodbye Message:**
> "Hey! We noticed you've been quiet. No pressure at all—finances are personal.
>
> Quick question before we go quiet:
> 1️⃣ I was confused—help me out?
> 2️⃣ Just busy—remind me later
> 3️⃣ All good, I'll reach out when ready
>
> (Or just ignore this, we'll be here 💙)"

**Goodbye Response Handling:**

| Response | Action |
|----------|--------|
| 1️⃣ (confused) | Send link to self-serve docs + offer quick tour |
| 2️⃣ (busy) | Set reminder for 2 weeks later, then check again |
| 3️⃣ (all good) | Confirm silence, door stays open |
| No response (48h) | Default to silence |

**Engagement State Machine:**
```
ACTIVE → (14 days inactive) → GOODBYE_SENT
GOODBYE_SENT → (user responds "1") → HELP_FLOW → ACTIVE
GOODBYE_SENT → (user responds "2") → REMIND_LATER (2-week timer) → DORMANT
GOODBYE_SENT → (user responds "3" or 48h timeout) → DORMANT
DORMANT → (any user-initiated message) → ACTIVE
```

**Failsafe Design:**
- Idempotent scheduler: Re-running never double-sends (checks "already sent goodbye?")
- Timer states stored in DB, not memory
- Any user message immediately reactivates to ACTIVE

**Group Message Behavior:**
- If a user interacts via a WhatsApp group (e.g., spouses sharing account), all bot messages default to that group
- Simple model: store `preferred_destination` flag on user profile
- User can switch context explicitly via command if needed

#### 3. Tone & Voice System

Communication style guide for all automated messages:

**DO use:**
- Curiosity: "Wondering how your week went?"
- Celebration: "You've tracked 10 expenses! Your future self thanks you"
- Dignity: "Finances are personal - we're just here when you need us"
- Empowerment: "You're building a clearer picture"

**NEVER use:**
- Guilt: ~~"You haven't logged anything in 5 days..."~~
- Pressure: ~~"Don't forget to track your spending!"~~
- Judgment: ~~"Your budget is way over!"~~
- Manipulation: ~~"Don't lose your streak!"~~

#### 4. User Control & Preferences

**Notification Silencing (per WhatsApp number):**
- Users can silence notifications for specific WhatsApp numbers via the web configs page
- Useful for users with multiple numbers or who want different engagement levels
- Granular control respects user preferences

**Dual Opt-out Capability:**
- Users can disable re-engagement messages via **WhatsApp** (e.g., "stop reminders")
- Users can disable re-engagement messages via **Web** (settings/configs page)
- Both channels respected equally - system syncs preference
- LGPD compliance: Easy, accessible opt-out

#### 5. Self-Serve Learning Resources

For users who prefer to explore independently (escape the guided flow):
- **Documentation page** on website with feature guides
- **Video tutorials** (potential future addition)
- Linked from onboarding messages: "Prefer to explore on your own? Check out our guides!"
- Reduces friction for power users who don't want hand-holding

### Out of Scope for MVP

- Gamification (badges, streaks, leaderboards) - may add pressure
- Push notifications (WhatsApp messages only for now)
- A/B testing framework (manual iteration first)
- Personalized message timing based on user timezone analysis

### MVP Success Criteria

**Onboarding:**
- [ ] 3-tier progressive disclosure onboarding (Expense Mastery → Plan Ahead → Big Picture)
- [ ] Tier completion tracked and persisted
- [ ] Users can skip tiers or stop flow entirely
- [ ] Contextual learning after first expense

**Re-engagement:**
- [ ] Weekly review ONLY if user had activity (no activity = no message)
- [ ] Self-select goodbye with 3 options + ignore default
- [ ] 5-state engagement state machine implemented
- [ ] Idempotent scheduler (no double-sends)
- [ ] Web-active users get monthly WhatsApp reminders

**User Controls:**
- [ ] Per-WhatsApp-number notification silencing in configs page
- [ ] Dual opt-out (WhatsApp command + web settings)
- [ ] Group messages default to group context (preferred_destination)

**Content & Tone:**
- [ ] Tone guidelines followed in all messages
- [ ] Self-serve documentation page on website

**Testing:**
- [ ] E2E testing capability for WhatsApp bot
- [ ] Integration tests for 30-day user journey scenarios
- [ ] Scheduler test coverage for all timing scenarios

---

## Technical Preferences

### Integration Points (Existing Infrastructure)

- `services/onboarding/` - Extend existing onboarding service
- `user_profiles` table - Track onboarding progress and engagement state
- WhatsApp message handlers - Add engagement message types
- Cron jobs (Railway) - Schedule re-engagement checks

### New Components Needed

- **Onboarding tier tracker** (track tier completion: tier_1, tier_2, tier_3)
- **Engagement state machine** (5 states: active, goodbye_sent, help_flow, remind_later, dormant)
- **Re-engagement scheduler** (idempotent, daily evaluation + weekly reviews)
- **Activity tracker** (web vs. WhatsApp activity, activity-based weekly review trigger)
- **Message template system** (tone-consistent messages, self-select goodbye)
- **Notification preferences system** (per-WhatsApp-number silencing)
- **Group context tracker** (preferred_destination flag on user profile)
- **Opt-out sync service** (sync preferences between WhatsApp and web)
- **Self-serve docs page** (feature guides on website)

### Database Schema Additions

```sql
ALTER TABLE user_profiles ADD COLUMN engagement_state
  ENUM('active', 'goodbye_sent', 'help_flow', 'remind_later', 'dormant')
  DEFAULT 'active';
ALTER TABLE user_profiles ADD COLUMN engagement_state_updated_at TIMESTAMP;
ALTER TABLE user_profiles ADD COLUMN next_reminder_at TIMESTAMP NULL;
ALTER TABLE user_profiles ADD COLUMN preferred_destination
  ENUM('individual', 'group') DEFAULT 'individual';
ALTER TABLE user_profiles ADD COLUMN preferred_group_jid VARCHAR(255) NULL;
ALTER TABLE user_profiles ADD COLUMN tier_1_complete BOOLEAN DEFAULT FALSE;
ALTER TABLE user_profiles ADD COLUMN tier_2_complete BOOLEAN DEFAULT FALSE;
ALTER TABLE user_profiles ADD COLUMN tier_3_complete BOOLEAN DEFAULT FALSE;
```

### Testing Requirements (Critical)

**E2E Testing Capability for WhatsApp Bot** - Currently only manual testing exists for real flow. This feature requires:

| Test Level | Coverage |
|------------|----------|
| Unit tests | NLP parsing, message formatting, state transitions |
| Integration tests | 30-day user journey simulations, scheduler scenarios |
| E2E tests | Full WhatsApp message flow (mock client or test number) |

**Critical scheduler test scenarios:**
- User inactive 13 days → no message
- User inactive 14 days → goodbye sent
- User inactive 15 days → silence (already sent)
- User responds "1" to goodbye → help flow triggered
- User responds "2" → remind_later state, 2-week timer
- User active on web, inactive WhatsApp 30 days → monthly nudge

---

## Risks and Assumptions

### Assumptions

- Users WANT to be guided (not annoyed by suggestions)
- WhatsApp is an appropriate channel for re-engagement
- 2 weeks is the right "quiet period" before goodbye
- Monthly web→WhatsApp reminders won't feel spammy
- Activity-triggered weekly reviews add value (no activity = no message avoids guilt)
- Users will find self-serve docs if they prefer independence
- Progressive disclosure (3 tiers) feels like achievements, not homework
- Self-select goodbye options provide useful signal for recovery flows
- E2E testing infrastructure is achievable and worth the investment

### Risks

| Risk | Mitigation |
|------|------------|
| Messages feel robotic | Invest in copywriting, test with real users |
| Users opt out of WhatsApp entirely | Respect immediately, don't re-add |
| Onboarding feels like homework | Progressive disclosure tiers feel like achievements, self-serve escape hatch |
| Sensitive financial situation triggers | Tone guidelines, no judgment, easy dual opt-out |
| Weekly reviews become annoying | Activity-triggered only (no activity = silence) |
| Group vs individual context confusion | Simple preferred_destination flag, explicit switch command |
| Preference sync issues | Single source of truth in DB, test cross-channel sync |
| Self-select goodbye adds complexity | State machine is testable, 4 branches max, 48h timeout default |
| Re-engagement scheduler bugs | Idempotent design, comprehensive E2E tests, integration test scenarios |
| E2E testing infrastructure cost | Start with mock client, graduate to test number if needed |

---

## Future Vision

After MVP validation:

- **Personalized pacing**: Adjust onboarding speed based on user engagement
- **Contextual tips**: "You added 5 food expenses - want to set a food budget?"
- **Milestone celebrations**: "1 month of tracking! Here's what you learned..."
- **Smart quiet hours**: Don't message during user's typical non-responsive times
- **Recovery flows**: Special re-onboarding for users who come back after long absence

---

_This Product Brief captures the vision for NexFinApp's Smart Onboarding & Engagement System._

_It was created through collaborative discovery and reflects the unique needs of this brownfield enhancement project._

_Next: PRD workflow will transform this brief into detailed product requirements._
