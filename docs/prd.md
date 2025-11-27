# NexFinApp - Product Requirements Document

**Author:** Lucas
**Date:** 2025-11-21
**Version:** 1.0

---

## Executive Summary

NexFinApp's Smart Onboarding & Engagement System transforms how users discover and adopt expense tracking by meeting them where they already are: WhatsApp. Instead of another app demanding attention, NexFinApp becomes a conversational companion that makes financial clarity feel effortless.

The core insight: **Users don't churn because of missing features—they churn because they never experience the magic.** The solution is guided discovery that demonstrates value immediately, builds confidence progressively, and respects user autonomy throughout.

This PRD defines a two-part system:
1. **Progressive Onboarding Journey**: Conversation-first discovery that shows the magic before teaching mechanics
2. **Smart Re-engagement Engine**: Comfort-over-pressure approach that respects user readiness and dignity

### What Makes This Special

> "The expense tracker that lives where you already are—no app to open, no guilt, no friction."

**The differentiator isn't features—it's the interaction model:**

| Traditional Expense Apps | NexFinApp |
|--------------------------|-----------|
| Open app → Navigate → Tap → Type → Save | Send a WhatsApp message |
| Check reports: Login → Dashboard → Charts | "How much did I spend on food?" → Instant answer |
| Set budget: Settings → Categories → Edit | "Set food budget to 500" → Done |
| Feels like **work** | Feels like **conversation** |

Competitors build apps. NexFinApp builds a **companion** that meets users in the flow of their daily lives.

---

## Project Classification

**Technical Type:** Multi-part Application (web_app + api_backend)
- Next.js 15 web application with Supabase backend
- Node.js WhatsApp bot service using Baileys library
- Shared PostgreSQL database with pgvector for AI features

**Domain:** Personal Finance / Consumer Productivity

**Complexity:** Medium
- No payment processing (tracking only, not transactions)
- No KYC/AML regulatory requirements
- LGPD compliance already implemented in existing codebase
- AI/NLP costs managed with daily limits

**Project Context:** Brownfield Enhancement
- Building on mature codebase (~12,000 lines)
- 3-layer NLP system already operational
- Multi-identifier WhatsApp authentication in place
- Existing onboarding infrastructure to extend

### Key Assumptions (To Be Validated)

| Assumption | Validation Method |
|------------|-------------------|
| Users churn due to lack of feature awareness | Track tier completion rates, self-select goodbye responses |
| Conversational interface is the core hook | Compare retention: guided vs. unguided users |
| Comfort-over-pressure improves retention | A/B test re-engagement approaches (future) |
| First 24 hours are critical for habit formation | Track time-to-first-action vs. retention correlation |

---

## Source Documents

**Product Brief:** `docs/product-brief-NexFinApp-2025-11-21.md`
**Brownfield Documentation:** `docs/index.md` (comprehensive technical docs)
**Research Documents:** None (proceeding with founder insights)

---

## Success Criteria

### Primary Metrics

| Metric | Target | Why It Matters |
|--------|--------|----------------|
| **Tier 1 Completion Rate** | 80% within 7 days | If users don't master basics, nothing else matters. 80% = onboarding is working. |
| **Magic Moment Rate** | 70%+ in first session | User experienced conversational NLP (not just commands). Proves they "got it." |
| **Unprompted Return Rate** | Track baseline, then improve | Users who come back after 3+ days WITHOUT a prompt = true habit formation. |
| **Tier Progression** | T1→T2: 80%, T2→T3: 60% | Progressive disclosure working. Drop-off at T2→T3 acceptable (advanced features). |

### Diagnostic Metrics

| Metric | What It Tells Us |
|--------|------------------|
| **Time to First Expense** | Onboarding friction. Target: < 5 minutes from WhatsApp connection. |
| **Self-Select Goodbye Distribution** | "Confused" = fix onboarding. "Busy" = timing issue. "All Good" = respect and wait. |
| **Web-Only vs WhatsApp-Active Retention** | Validates WhatsApp as the right channel. Expect 2x retention for WhatsApp users. |
| **Re-engagement Response Rate** | Are comfort-first messages effective? Track by message type. |

### What We're NOT Measuring (Intentionally)

| Metric | Why We Skip It |
|--------|----------------|
| DAU/MAU | Too generic—doesn't explain WHY users engage or churn |
| Time in App | Expense tracking should be FAST. Long sessions = friction, not engagement |
| Total Expenses Logged | Vanity metric. A user logging 3 meaningful expenses beats 30 junk entries |
| Streaks / Consecutive Days | Contradicts "comfort over pressure" philosophy |

### Success Definition

**MVP Success** = Evidence that the hypothesis is working:
- 80% Tier 1 completion proves onboarding guides effectively
- Magic Moment Rate > 70% proves conversational interface is the hook
- Qualitative signal: Users describe it as "easy" or "like texting a friend"

**Long-term Success** = Retention correlation:
- WhatsApp-active users reach 2-month retention at higher rates than web-only
- Unprompted return rate trends upward over cohorts
- "Confused" responses in self-select goodbye trend toward zero

---

## Product Scope

### MVP - Minimum Viable Product

The smallest thing that proves the hypothesis: **"Guided discovery + comfort-over-pressure = retention"**

#### 1. Conversation-First Welcome (Critical)

When a user sends their FIRST message after WhatsApp connection:
- Bot responds conversationally to whatever they said
- Demonstrates the "magic" immediately (NLP understanding)
- THEN guides toward first expense: "By the way, try saying something like 'I spent 50 on lunch'"

**Why first:** Users must experience the conversational magic before learning mechanics.

#### 2. Progressive Onboarding Journey (Core)

**TIER 1: "Expense Mastery"** - Available immediately
| Step | Action | Accomplishment |
|------|--------|----------------|
| 1 | Add an expense | "You just tracked spending!" |
| 2 | Edit expense category | "You can reorganize anytime" |
| 3 | Delete an expense | "Mistakes happen, easy fix" |
| 4 | Add a category | "Make it yours" |

> Unlock message: "You've mastered expense tracking! But here's where it gets powerful..."

**TIER 2: "Plan Ahead"** - Unlocks after Tier 1
| Step | Action | Accomplishment |
|------|--------|----------------|
| 5 | Set a budget | "Now you're planning ahead!" |
| 6 | Add recurring expense | "Autopilot for subscriptions" |
| 7 | List categories | "See your world organized" |

> Unlock message: "You're not just tracking—you're planning! Ready to see the big picture?"

**TIER 3: "See the Big Picture"** - Unlocks after Tier 2
| Step | Action | Accomplishment |
|------|--------|----------------|
| 8 | Edit a category | "Evolve your system" |
| 9 | Check reports | "See your progress" |

> Completion message: "You're a pro now! You have complete control over your finances."

**Design Principles:**
- Track tier completion (not individual steps) for cleaner analytics
- Users can skip ahead or stop the flow entirely (autonomy)
- Contextual teaching: suggest custom categories AFTER first expense

#### 3. Smart Re-engagement Engine (Core)

**5-State Engagement Machine:**
```
ACTIVE → (14 days inactive) → GOODBYE_SENT
GOODBYE_SENT → (response "1") → HELP_FLOW → ACTIVE
GOODBYE_SENT → (response "2") → REMIND_LATER (2-week timer)
GOODBYE_SENT → (response "3" or 48h timeout) → DORMANT
DORMANT → (any user message) → ACTIVE
```

**Weekly Review** (Activity-triggered only):
- ONLY sent if user had activity in the previous week
- No activity = no message (silence IS the design)
- Message: "Hey, you did great last week tracking your expenses! How are things going?"

**Self-Select Goodbye:**
> "Hey! We noticed you've been quiet. No pressure at all—finances are personal.
>
> Quick question before we go quiet:
> 1️⃣ I was confused—help me out?
> 2️⃣ Just busy—remind me later
> 3️⃣ All good, I'll reach out when ready
>
> (Or just ignore this, we'll be here 💙)"

**Response Handling:**
| Response | Action |
|----------|--------|
| 1 (confused) | Restart Tier 1 guidance, offer help |
| 2 (busy) | Set 2-week reminder, then DORMANT |
| 3 (all good) | Immediate DORMANT, door stays open |
| No response (48h) | Default to DORMANT |

**Failsafe Design:**
- Idempotent scheduler: re-running never double-sends
- Timer states in DB, not memory
- Any user message immediately → ACTIVE

#### 4. Group Context Handling (Critical - 66% of users)

- Store `preferred_destination` on user profile: `individual` | `group`
- If user first interacts via group → default to group for all bot messages
- User can switch explicitly via command
- All re-engagement messages respect preferred destination

#### 5. User Opt-Out (LGPD Required)

**Dual Channel Opt-Out:**
- WhatsApp: User sends "stop reminders" or similar → opt-out
- Web: Settings/configs page toggle
- Both channels sync to single source of truth in DB
- Opt-out = no re-engagement messages, onboarding tips still allowed

#### 6. Tone & Voice System

**Always Use:**
- Curiosity: "Wondering how your week went?"
- Celebration: "You've tracked 10 expenses! Your future self thanks you"
- Dignity: "Finances are personal—we're just here when you need us"
- Empowerment: "You're building a clearer picture"

**Never Use:**
- Guilt: ~~"You haven't logged anything in 5 days..."~~
- Pressure: ~~"Don't forget to track your spending!"~~
- Judgment: ~~"Your budget is way over!"~~
- Manipulation: ~~"Don't lose your streak!"~~

#### 7. Testing Infrastructure (Critical)

- E2E testing capability for WhatsApp bot flows
- Integration tests for 30-day user journey scenarios
- Scheduler test coverage for all timing edge cases

---

### Growth Features (Post-MVP)

| Feature | Trigger to Build |
|---------|------------------|
| Per-WhatsApp-number notification silencing | User feedback requesting granular control |
| Web-active → WhatsApp nudges | After MVP proves WhatsApp retention advantage |
| Personalized pacing | Data shows different users need different speeds |
| Contextual tips ("5 food expenses → suggest budget") | After Tier completion rates stabilize |
| Self-serve documentation page | If "confused" responses remain high despite onboarding |

---

### Vision Features (Future)

| Feature | Why Wait |
|---------|----------|
| Milestone celebrations ("1 month of tracking!") | Need long-term users first |
| Smart quiet hours (timezone-aware) | Requires usage pattern data |
| Recovery flows (special re-onboarding for long-absent users) | Need to understand why users leave first |
| A/B testing framework | Manual iteration until patterns emerge |
| Push notifications | WhatsApp-first; only add if WhatsApp insufficient |

---

### Explicitly Out of Scope (MVP and Beyond)

| Feature | Why Never |
|---------|-----------|
| Gamification (badges, streaks, leaderboards) | Contradicts "comfort over pressure" philosophy |
| Guilt-based messaging | Core value: preserve user dignity |
| Aggressive re-engagement (daily reminders) | Becomes spam, damages trust |

---

## User Experience Principles

### Conversational Personality

**Target feeling:** "Like texting a friend who happens to be really good with money."

| Not This | But This |
|----------|----------|
| Bank (formal, transactional) | Knowledgeable friend (helpful, casual) |
| Productivity app (task-oriented, demanding) | Supportive companion (encouraging, never judging) |
| Chatbot (scripted, robotic) | Reliable assistant (always there, never pushy) |

### Key Interaction Patterns

**Response Timing:**
- Immediate acknowledgment for actions ("Got it!")
- Brief pause before longer messages (feels more human)
- Never stack multiple messages rapidly (overwhelming)

**Message Length:**
- Short for confirmations: 1 line ("✓ R$30 em Transporte registrado!")
- Medium for guidance: 2-3 lines
- Chunked for explanations: Multiple messages only if necessary

**Conversation Recovery:**
- Gibberish input → Gentle redirect with example
- User seems frustrated → Offer help, don't repeat same instruction
- User goes quiet mid-flow → Don't chase; they'll return when ready

**Celebration Calibration:**
- Small wins: Brief ("Done!")
- Tier completions: Moderate (one emoji acceptable)
- Never over-the-top (no "🎉🎊🥳 AMAZING!!!")

### Critical Interaction Flows

**First Message (Magic Moment):**
```
User: "oi" (or anything)
Bot: "Oi! Que bom ter você aqui 😊
     [contextual response if parseable]
     Experimenta mandar algo tipo 'gastei 50 no almoço'
     e vê a mágica acontecer."
```

**First Expense Success:**
```
User: "gastei 30 no uber"
Bot: "✓ R$30 em Transporte registrado!
     Você acabou de registrar sua primeira despesa. Fácil, né?"
```

**Tier Unlock (Non-Pushy):**
```
Bot: "Você já dominou o básico!
     Quer ir além? Tenta definir um orçamento:
     'definir orçamento de 500 para alimentação'"
[User can ignore—no follow-up]
```

**Self-Select Goodbye (Dignity-First):**
```
Bot: "Oi! Notamos que você está quieto. Sem pressão—finanças são pessoais.

     Pergunta rápida antes de ficarmos em silêncio:
     1️⃣ Fiquei confuso—me ajuda?
     2️⃣ Só ocupado—me lembra depois
     3️⃣ Tá tudo certo, eu falo quando precisar

     (Ou só ignora, estaremos aqui 💙)"
```

### Language Considerations

- **Primary:** Portuguese (pt-BR) - matches user base
- **Casual register:** Uses "você" not "o senhor", contractions okay
- **Emoji:** Sparingly, never more than one per message
- **English fallback:** Detect language preference, respond accordingly

---

## Functional Requirements

> **Altitude Check:** Each FR states WHAT capability exists, not HOW it's implemented.
> These are testable capabilities that downstream work (UX, Architecture, Epics) will deliver.

### Onboarding & Discovery

- **FR1:** System detects when a user sends their first WhatsApp message after account connection
- **FR2:** System responds conversationally to the user's first message before providing onboarding guidance
- **FR3:** System guides new users toward their first expense with a natural language example
- **FR4:** System tracks user progress through a 3-tier onboarding journey (Tier 1, Tier 2, Tier 3)
- **FR5:** System detects when a user completes all actions within a tier
- **FR6:** System sends tier completion celebration message when user completes a tier
- **FR7:** System unlocks next tier guidance after previous tier completion
- **FR8:** Users can perform any action at any time regardless of tier (no hard gating)
- **FR9:** System provides contextual hints after relevant actions (e.g., suggest custom category after first expense)
- **FR10:** Users can explicitly skip onboarding guidance ("stop tips" or similar)

### Engagement State Management

- **FR11:** System maintains an engagement state for each user (ACTIVE, GOODBYE_SENT, HELP_FLOW, REMIND_LATER, DORMANT)
- **FR12:** System automatically transitions user to GOODBYE_SENT after 14 days of inactivity
- **FR13:** System sends self-select goodbye message when transitioning to GOODBYE_SENT state
- **FR14:** System processes user responses to goodbye message (options 1, 2, 3)
- **FR15:** System transitions to HELP_FLOW and restarts Tier 1 guidance when user responds "1" (confused)
- **FR16:** System transitions to REMIND_LATER and schedules 2-week reminder when user responds "2" (busy)
- **FR17:** System transitions to DORMANT when user responds "3" (all good) or after 48h no response
- **FR18:** System immediately transitions any DORMANT user to ACTIVE upon receiving any message
- **FR19:** System prevents duplicate state transition messages (idempotent scheduler)

### Weekly Engagement

- **FR20:** System tracks user activity on a weekly basis (had activity vs. no activity)
- **FR21:** System sends weekly review message to users who had activity in the previous week
- **FR22:** System does NOT send weekly review to users with no activity (silence by design)
- **FR23:** Weekly review message celebrates activity and checks in conversationally

### Message Destination

- **FR24:** System stores preferred message destination per user (individual or group)
- **FR25:** System automatically sets preferred destination based on user's first interaction context
- **FR26:** System sends all proactive messages (onboarding, re-engagement) to user's preferred destination
- **FR27:** Users can explicitly change their preferred destination via command

### User Preferences & Opt-Out

- **FR28:** Users can opt out of re-engagement messages via WhatsApp command
- **FR29:** Users can opt out of re-engagement messages via web settings
- **FR30:** System syncs opt-out preference between WhatsApp and web (single source of truth)
- **FR31:** System respects opt-out for re-engagement messages while still allowing onboarding tips
- **FR32:** Users who opt out can opt back in via either channel

### Message Content & Tone

- **FR33:** All automated messages follow defined tone guidelines (curiosity, celebration, dignity, empowerment)
- **FR34:** System never sends messages with guilt, pressure, judgment, or manipulation framing
- **FR35:** System uses appropriate message length based on context (short confirmations, medium guidance)
- **FR36:** System limits emoji usage to maximum one per message
- **FR37:** System sends messages in user's preferred language (pt-BR default, English fallback)

### Analytics & Learning

- **FR38:** System tracks tier completion events with timestamps
- **FR39:** System tracks "magic moment" occurrences (NLP-parsed first message success)
- **FR40:** System tracks self-select goodbye response distribution (confused/busy/all good/no response)
- **FR41:** System tracks unprompted return events (user message after 3+ days without re-engagement prompt)
- **FR42:** System tracks engagement state transitions with timestamps
- **FR43:** Analytics data accessible via admin dashboard or database queries

### Scheduler & Background Processing

- **FR44:** System runs daily evaluation of user engagement states
- **FR45:** System processes scheduled reminders (REMIND_LATER → check after 2 weeks)
- **FR46:** System runs weekly review evaluation (identify users with activity for review message)
- **FR47:** Scheduler operations are idempotent (safe to re-run without side effects)
- **FR48:** Scheduler state persisted in database (survives service restarts)

### Testing Infrastructure

- **FR49:** System supports E2E testing of WhatsApp message flows (mock or test client)
- **FR50:** System supports integration testing of 30-day user journey scenarios
- **FR51:** System supports unit testing of scheduler timing logic and edge cases
- **FR52:** Test coverage includes all engagement state transitions
- **FR53:** Test coverage includes idempotency verification for scheduler operations

---

## Non-Functional Requirements

> Only NFRs that matter for this specific feature. Generic requirements (LGPD, RLS) already implemented in existing codebase.

### Performance

| Requirement | Target | Rationale |
|-------------|--------|-----------|
| **NFR1:** First message response time | < 3 seconds | "Magic moment" requires quick response to feel conversational |
| **NFR2:** Onboarding hint response time | < 2 seconds | Contextual tips should feel immediate, not delayed |
| **NFR3:** Scheduler evaluation time | < 60 seconds for full user base | Daily/weekly jobs must complete reliably |

### Reliability

| Requirement | Target | Rationale |
|-------------|--------|-----------|
| **NFR4:** Scheduler job success rate | 99.9% | Missed engagement windows damage user relationship |
| **NFR5:** Message delivery confirmation | Retry on failure, max 3 attempts | Proactive messages must actually reach users |
| **NFR6:** State persistence | Survive service restarts | Engagement state must never be lost |
| **NFR7:** Idempotency guarantee | No duplicate messages ever | Sending goodbye twice = trust broken |

### Scalability

| Requirement | Target | Rationale |
|-------------|--------|-----------|
| **NFR8:** User base capacity | Handle 10,000 users without architecture changes | Build for growth even though starting small |
| **NFR9:** Scheduler efficiency | O(n) or better for user evaluation | Linear scaling with user growth |

### Data Integrity

| Requirement | Target | Rationale |
|-------------|--------|-----------|
| **NFR10:** Opt-out sync latency | < 5 seconds between channels | User opts out on web, must reflect in WhatsApp immediately |
| **NFR11:** Analytics accuracy | 100% event capture | Metrics drive product decisions; gaps are unacceptable |

### Observability

| Requirement | Target | Rationale |
|-------------|--------|-----------|
| **NFR12:** Scheduler job logging | Full audit trail | Debug failed jobs, understand timing issues |
| **NFR13:** Engagement state change logging | All transitions logged with timestamps | Reconstruct user journey for debugging |
| **NFR14:** Message delivery logging | Success/failure logged per message | Identify delivery issues quickly |

---

## PRD Summary

### What We're Building

A **Smart Onboarding & Engagement System** that transforms NexFinApp from "another expense app" into "a conversational companion that meets users where they already are."

**Core Hypothesis:** Guided discovery + comfort-over-pressure = retention

### Key Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| First user experience | Conversation-first, show magic before teaching | Proves the value prop immediately |
| Onboarding structure | 3-tier progressive disclosure | Achievements, not homework |
| Re-engagement philosophy | Comfort over pressure | Preserve dignity, no guilt |
| Weekly reviews | Activity-triggered only | Silence IS the design |
| Group handling | First-interaction auto-detect | 66% of users use groups |
| Testing | E2E infrastructure mandatory | Critical for scheduler reliability |

### By the Numbers

| Category | Count |
|----------|-------|
| Functional Requirements | 53 |
| Non-Functional Requirements | 14 |
| MVP Components | 7 |
| Engagement States | 5 |
| Onboarding Tiers | 3 |
| Success Metrics | 4 primary + 4 diagnostic |

### The Product in One Sentence

> NexFinApp's onboarding shows users the conversational magic immediately, guides them through progressive mastery, and re-engages with dignity—never guilt.

---

## Next Steps

**PRD Complete.** Here's the recommended path forward:

### Option A: Architecture First (Recommended)

Since this is a brownfield project with existing infrastructure, the Architect should review how the new engagement system integrates with:
- Existing `services/onboarding/` code
- Current database schema (`user_profiles`)
- Railway cron job infrastructure
- WhatsApp message handlers

**Command:** Load `architect` agent → `*create-architecture` or `/bmad:bmm:workflows:architecture`

### Option B: Epics & Stories Directly

If the architecture is straightforward (extend existing patterns), skip to breaking this PRD into implementable stories.

**Command:** Load `pm` agent → `*create-epics-and-stories` or `/bmad:bmm:workflows:create-epics-and-stories`

### Option C: UX Design First

If you want detailed message copy and flow diagrams before implementation.

**Command:** Load `ux-designer` agent → `*create-design` or `/bmad:bmm:workflows:create-ux-design`

---

**My Recommendation:** Go with **Option A (Architecture)** since this feature touches scheduler infrastructure, state management, and multi-channel sync—areas that benefit from explicit architectural decisions before coding.

---

_This PRD captures the vision for NexFinApp's Smart Onboarding & Engagement System—a conversational companion that guides users with empowerment, not pressure._

_Created through collaborative discovery between Lucas and John (PM Agent)._

