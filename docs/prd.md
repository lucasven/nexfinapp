# NexFinApp - Product Requirements Document

**Author:** Lucas
**Date:** 2025-11-28
**Version:** 2.0

---

## Executive Summary

NexFinApp's Credit Card Management System transforms how Brazilian users track and understand their credit card spending by embracing cultural norms (installment payments), respecting mental models (opt-in Credit Mode vs Simple Mode), and prioritizing awareness without judgment.

The core insight: **Users don't change spending behavior through restriction—they change through clear self-awareness.** The solution is visibility-first features that make the invisible visible, combined with Brazilian-specific installment intelligence that no generic tracker provides.

This PRD defines a two-epic system:
1. **Credit Card Management** (Epic A): Opt-in credit features, installment tracking, statement awareness, and user-defined budgets
2. **AI Helper System** (Epic B): Conversational domain helpers that educate users about features through natural WhatsApp conversations

### What Makes This Special

> "The first credit card tracker that treats manual entry as mindfulness, not a limitation—with uniquely Brazilian installment awareness and zero guilt."

**The differentiator isn't automation—it's the interaction philosophy:**

| Traditional Credit Card Apps | NexFinApp Credit Management |
|------------------------------|----------------------------|
| Auto-sync everything | Manual entry = awareness moment |
| One-size-fits-all | Credit Mode OR Simple Mode (user choice) |
| Red warnings: "OVERSPENT!" | Neutral awareness: "Spent more than planned" |
| Generic credit tracking | Brazilian parcelamento intelligence |
| Rigid command interface | Conversational AI helpers ("ajuda cartão") |
| Feature discovery through menus | Education-first helper system |
| Feels like **surveillance** | Feels like **self-knowledge** |

Competitors build budget enforcers. NexFinApp builds **financial awareness companions** that respect user autonomy and cultural context.

---

## Project Classification

**Technical Type:** Multi-part Application Enhancement (Brownfield)
- Next.js 15 web application with Supabase backend
- Node.js WhatsApp bot service using Baileys library
- Shared PostgreSQL database with pgvector for AI features
- **Enhancement context:** Building on mature codebase (~12,000 lines) with existing expense tracking

**Domain:** Personal Finance / Credit Card Management (Fintech-adjacent)

**Complexity:** Medium
- No payment processing (tracking only, not transactions)
- No KYC/AML regulatory requirements
- LGPD compliance already implemented in existing codebase
- Brazilian cultural context: installments (parcelamento) are norm, not exception
- AI/NLP costs managed with daily limits

**Project Context:** Brownfield Feature Addition
- Existing 3-layer NLP system operational
- Multi-identifier WhatsApp authentication in place
- Category management and budgeting infrastructure exists
- Building credit-specific features as opt-in enhancement

---

## Source Documents

**Brainstorming Session:** `docs/brainstorming-session-results-2025-11-27.md`
**Brownfield Documentation:** `docs/index.md` (comprehensive technical docs)
**Product Brief:** `docs/product-brief-NexFinApp-2025-11-21.md` (original vision - onboarding focus)
**Research Documents:** None (proceeding with founder insights + cultural knowledge)

---

## Success Criteria

### Primary Metrics

| Metric | Target | Why It Matters |
|--------|--------|----------------|
| **Credit Mode Opt-in Rate** | 40%+ of credit card users | Validates that users understand and want credit-specific features |
| **Installment Tracking Adoption** | 60%+ of Credit Mode users | Brazilian feature—high adoption proves cultural fit |
| **Manual Entry Frequency** | Maintain or improve vs. baseline | Manual entry as mindfulness—shouldn't drop with new features |
| **Helper Usage Rate** | 30%+ of users try "ajuda" commands | Validates conversational education model |
| **Budget vs Limit Preference** | Track user-defined budget usage | Shows users want personal budgets, not bank limits |

### Diagnostic Metrics

| Metric | What It Tells Us |
|--------|------------------|
| **Credit Mode → Simple Mode switches** | If high, mental model mismatch or confusing features |
| **Installment editing patterns** | Early payoff usage = feature resonance; errors = UX issues |
| **Helper conversation depth** | Single-turn = lookup; multi-turn = learning/education working |
| **Statement reminder open rate** | WhatsApp notification effectiveness |
| **"Real available credit" views** | Interest in future commitment visibility |

### What We're NOT Measuring (Intentionally)

| Metric | Why We Skip It |
|--------|----------------|
| Total expenses logged | Vanity metric—quality over quantity |
| Daily active users | Credit cards aren't daily—weekly/monthly is natural |
| Time in app | Fast interactions = good; long sessions = confusion |
| Budget adherence % | Awareness-first, not enforcement—judgment metric |

### Success Definition

**MVP Success (Epic A - Credit Card Management)** = Evidence of product-market fit:
- 40%+ opt-in to Credit Mode (users see value in credit-specific features)
- 60%+ of Credit Mode users track at least one installment (Brazilian feature resonates)
- Qualitative signal: Users describe budget tracking as "clarity" not "restriction"
- Zero complaints about "judgmental" language (awareness-first tone working)

**Platform Success (Epic B - AI Helper System)** = Conversational education working:
- 30%+ helper usage in first 30 days after launch
- Multi-turn conversations indicate learning (not just lookups)
- Support ticket reduction for "how do I..." questions
- Feature discovery increase (tracked via PostHog events)

**Long-term Success** = Sustained engagement:
- Credit Mode users maintain manual entry frequency (mindfulness working)
- Weekly reflection patterns emerge (statement reminders + budget checks)
- Low Credit→Simple mode churn (mental model holds over time)
- Helper system expands to all 7 domains (platform value proven)

---

## Product Scope

### MVP - Minimum Viable Product

The smallest system that proves the hypothesis: **"Awareness without judgment + Brazilian cultural fit = engaged credit card users"**

#### Epic A: Credit Card Management - Core Features (Sprint 1-2)

**Foundation: Opt-in Mental Model**

**Feature 1: Credit Mode vs Simple Mode**
- Users choose their mental model on first credit card transaction
- **Credit Mode**: Installments, statements, credit-specific budgets, future commitment tracking
- **Simple Mode**: Treat credit card like debit (existing expense tracking behavior)
- Can switch modes later (with data implications warning)
- Default: Ask user; no assumption

**Why first:** Respects that users have different relationships with credit cards. Forcing credit features on everyone frustrates "pay-in-full" users.

**Feature 2: User-Defined Monthly Budget**
- Separate from bank credit limit
- User sets: "I want to spend R$2,000 this month" (even if limit is R$10,000)
- Tracks spending against personal budget, not bank limit
- Only for Credit Mode users

**Why critical:** High-limit users don't track against bank limit—they track against personal intention. This is the core "awareness" metric.

**Feature 3: Installment Tracker (Parcelamento)**
- Add expense with installment: "Gastei 600 em 3x no celular"
- System creates:
  - Parent installment record (R$600 total, 3 months)
  - Monthly expense entries (R$200 each) across 3 months
- Dashboard shows: "Future commitments: R$800/month for next 4 months"
- **Budget impact:** Only monthly payment counts against monthly budget
- Option to mark as "paid off early" (if bank offers discount)

**Why Brazilian-specific:** Parcelamento is cultural norm. Generic trackers miss this—NexFinApp embraces it.

**Feature 4: Statement Awareness**
- User sets statement closing date (e.g., day 5 of month)
- WhatsApp reminder 3 days before: "Statement closes in 3 days. Current total: R$2,450"
- Shows what's on THIS statement vs next statement
- Neutral tone: "Here's where you're at" not "WARNING: High spending"

**Feature 5: Due Date Reminder with Auto-Expense**
- User sets payment due date (e.g., day 15 of month)
- Reminder: "Credit card payment due in 2 days: R$2,450"
- Auto-creates expense in NEXT month: "Pagamento Cartão de Crédito - R$2,450"
- Category: "Credit Card Payment" (system category)
- Separates current month usage from payment transaction

**Feature 6: Awareness-First Language**
- Replace all judgmental copy:
  - ~~"OVERSPENT!"~~ → "Spent more than planned"
  - ~~"Warning: Budget exceeded"~~ → "Heads up: Budget reached"
  - ~~"You're R$500 over"~~ → "R$500 above personal budget"
- No red colors for amounts (neutral blues/grays)
- Celebration language for staying within budget: "On track this month"

**Why foundational:** Sets the tone for entire feature set. Awareness, not enforcement.

---

#### Epic B: AI Helper System - Platform Foundation (Sprint 3-4)

**Fully Feature-Flagged Architecture**

**Feature 7: Feature Flag Infrastructure**
- PostHog integration (frontend + WhatsApp bot)
- Environment variable fallback: `ENABLE_AI_HELPERS=true`
- Gradual rollout: Internal → 5% → 25% → 50% → 100%
- Instant rollback capability

**Feature 8: Base Helper Architecture**
- Abstract `BaseHelper` class with shared conversational logic
- Each domain helper extends base
- Helper router (keyword-based domain identification)
- Conversational freedom: AI can ask clarifying questions before executing

**Feature 9: Credit Card Helper ("ajuda cartão")**
- Explains Credit Mode vs Simple Mode
- Teaches installment tracking
- Shows statement dates and budget status
- Guides through first credit card expense
- **Priority 1:** This validates the helper concept

**Feature 10: Transaction Helper ("ajuda gastos")**
- Explains CRUD operations (add, edit, delete expenses)
- Shows recent transactions
- Guides category changes
- **Priority 2:** High usage expected

**Feature 11: AI Integration Test Framework**
- Separate test suite (NOT in CI pipeline)
- Structured scenarios with expected outcomes
- Run manually before deploying prompt/tool changes
- Prevents regression on conversational quality

**Feature 12: Gradual Rollout Strategy**
- Week 1-2: Internal testing (Lucas only)
- Week 3: 5% rollout, monitor error rates
- Week 4-5: 25% rollout, monitor quality
- Week 6-7: 50% rollout
- Week 8+: 100% if metrics healthy
- Maintain old system for 2 months, then deprecate

---

### Growth Features (Post-MVP, Sprint 2-4)

Build these AFTER MVP validation, based on user feedback and metrics:

#### Epic A Enhancements

**Guilt-Free Catch-Up Mode**
- Detects multi-day gaps in expense entry
- Message: "Welcome back! Let's pick up where you left off" (not "You missed 5 days")
- Bulk entry flow optimized for catching up
- **Trigger:** If manual entry frequency drops

**Pre-Statement Summary**
- 3 days before closing, send category breakdown
- "This statement: Food R$650, Transport R$320, Shopping R$890"
- Helps users understand where money went
- **Trigger:** After statement reminders prove valuable

**"Real Available Credit" Calculation**
- Dashboard widget: "Credit Limit R$10k - Future installments R$800 = R$9,200 available"
- Shows true purchasing power accounting for future commitments
- **Trigger:** If installment adoption is high (60%+)

**Weekly Category Spotlight** (A/B Test)
- Variant of existing weekly reminder
- Shows biggest spending category with neutral awareness
- "This week: Food was your top category at R$320"
- **Trigger:** A/B test against current weekly reminder

**Spending Personality Insights**
- Neutral archetypes: "Weekend Spender", "Subscription Collector"
- Not judgments—just patterns
- "You spend 60% of your budget on weekends"
- **Trigger:** After 3 months of data

#### Epic B Expansion

**Budget Helper ("ajuda orçamento")**
- Set budgets per category
- Track budget progress
- Explain difference between budget and credit limit

**Reports Helper ("ajuda relatórios")**
- Show spending summaries
- Category breakdowns
- Balance inquiries

**Recurring Helper ("ajuda recorrentes")**
- Set up subscriptions
- Manage recurring expenses
- **Note:** Expenses only for now; if recurring income needed, route to income-helper

**Category Helper ("ajuda categorias")**
- Show all categories
- Create custom categories
- Change expense categories

**Income Helper ("ajuda receitas")**
- Track income sources
- Differentiate from expenses
- Show net cash flow

---

### Vision Features (Future, 6+ months)

Build these ONLY after Epic A/B prove successful:

**Three Rings Visualization**
- Dashboard: Credit utilization ring, Category budget ring, Savings goal ring
- Apple Watch-style progress visualization
- **Why wait:** Need established user base with multiple goals

**Predictive Spending Projections**
- "At this pace, you'll reach R$3,500 by statement close (R$500 over budget)"
- Requires ML model trained on spending patterns
- **Why wait:** Need historical data for accuracy

**Streak Shields with Planned Splurge Days**
- Gamification: Budget streaks with planned exceptions
- "Mark this as a planned splurge day"
- **Why wait:** Risks adding pressure; validate awareness-first approach first

**AI-Powered Anomaly Detection**
- "Unusual spending detected: 3 restaurant charges in one day"
- Catches duplicate entries or fraud
- **Why wait:** Requires baseline patterns per user

**OCR Helper ("ajuda foto")**
- Guide receipt scanning
- Troubleshoot OCR issues
- Explain best practices
- **Why wait:** Helper system must prove valuable first

**Multi-Card Support**
- Users with 2-3 credit cards
- Budget allocation across cards
- Consolidated view
- **Why wait:** Adds significant complexity; validate single-card first

---

### Explicitly Out of Scope

**Never build these (contradict core philosophy):**

| Feature | Why Never |
|---------|-----------|
| Automatic spending limits (enforce) | Awareness, not enforcement |
| Guilt-based reminders ("You're over budget again") | Dignity-first philosophy |
| Public leaderboards / social comparison | Compare to past self only |
| Gamified daily streaks | Adds pressure, contradicts comfort approach |

---

## Functional Requirements

> **Altitude Check:** Each FR states WHAT capability exists, not HOW it's implemented.
> These are testable capabilities that downstream work (UX, Architecture, Epics) will deliver.

### Epic A: Credit Card Management

#### Mental Model & Opt-In

- **FR1:** System detects when user adds first credit card transaction
- **FR2:** System prompts user to choose between Credit Mode and Simple Mode
- **FR3:** System stores user's credit card mode preference (credit/simple) per payment method
- **FR4:** Users can switch between Credit Mode and Simple Mode at any time
- **FR5:** System warns user about data implications when switching modes (installments affected)
- **FR6:** Simple Mode users see credit cards treated as regular expenses (existing behavior)
- **FR7:** Credit Mode users access credit-specific features (budgets, installments, statements)

#### User-Defined Budgets

- **FR8:** Credit Mode users can set a personal monthly credit card budget (separate from bank limit)
- **FR9:** System tracks spending against user-defined budget, not credit limit
- **FR10:** Users can edit monthly budget at any time
- **FR11:** System displays budget progress: spent amount, remaining, and percentage
- **FR12:** System uses awareness-first language when budget is exceeded (no judgment)

#### Installment Tracking (Parcelamento)

- **FR13:** Users can add expenses with installment information (total amount + number of installments)
- **FR14:** System creates parent installment record with full amount and duration
- **FR15:** System automatically creates monthly expense entries for each installment payment
- **FR16:** System distributes installment payments across correct months from purchase date
- **FR17:** System displays "future commitments" showing total upcoming installment obligations per month
- **FR18:** Only the monthly installment payment counts against monthly budget (not full amount)
- **FR19:** Users can view all active installments with remaining payments
- **FR20:** Users can mark installments as "paid off early"
- **FR21:** Early payoff recalculates future commitment totals
- **FR22:** Users can edit or delete installment records
- **FR23:** Deleting installment removes all future monthly payments

#### Statement Awareness

- **FR24:** Credit Mode users can set their credit card statement closing date
- **FR25:** System sends WhatsApp reminder 3 days before statement closing date
- **FR26:** Statement reminder includes current statement total
- **FR27:** System distinguishes expenses on current statement vs next statement
- **FR28:** Users can view pre-statement summary with category breakdown
- **FR29:** Statement reminders use neutral, awareness-first tone

#### Payment Due Date

- **FR30:** Credit Mode users can set credit card payment due date
- **FR31:** System sends WhatsApp reminder 2 days before payment due date
- **FR32:** Payment reminder includes total amount due
- **FR33:** System auto-creates "Credit Card Payment" expense transaction in next month
- **FR34:** Payment expense uses system category "Pagamento Cartão de Crédito"
- **FR35:** Payment transaction separates current month usage from actual payment
- **FR36:** Users can edit or delete auto-generated payment transactions

#### Awareness-First Language & UX

- **FR37:** All credit card features use awareness-first language (no judgment terminology)
- **FR38:** System replaces "overspent" with "spent more than planned"
- **FR39:** System replaces "warning" with "heads up"
- **FR40:** Budget visualizations use neutral colors (no red for overspending)
- **FR41:** System celebrates staying within budget with positive reinforcement
- **FR42:** All error messages maintain dignity-first tone

### Epic B: AI Helper System

#### Platform Infrastructure

- **FR43:** System integrates with PostHog feature flags for helper system control
- **FR44:** Feature flags support gradual rollout (5%, 25%, 50%, 100%)
- **FR45:** System supports instant feature flag rollback
- **FR46:** Environment variable fallback enables/disables helper system

#### Helper Architecture

- **FR47:** System implements base helper architecture with shared conversational logic
- **FR48:** System routes user messages to appropriate domain helper based on keywords
- **FR49:** Helper system coexists with existing 3-layer NLP system
- **FR50:** Helpers can ask clarifying questions before executing actions
- **FR51:** Helpers prioritize education over immediate execution
- **FR52:** Helper conversations support multi-turn interactions

#### Domain Helpers (MVP)

- **FR53:** Credit Card Helper responds to "ajuda cartão" and variations
- **FR54:** Credit Card Helper explains Credit Mode vs Simple Mode
- **FR55:** Credit Card Helper teaches installment tracking syntax
- **FR56:** Credit Card Helper shows user's statement dates and budget status
- **FR57:** Credit Card Helper guides users through first credit card expense

- **FR58:** Transaction Helper responds to "ajuda gastos", "ajuda transações" and variations
- **FR59:** Transaction Helper explains CRUD operations (add, edit, delete)
- **FR60:** Transaction Helper shows recent transactions
- **FR61:** Transaction Helper guides category changes
- **FR62:** Transaction Helper differentiates between income and expenses

#### Testing & Quality

- **FR63:** System supports AI integration testing with structured scenarios
- **FR64:** Test framework validates conversational quality (not just correctness)
- **FR65:** Tests cover multi-turn conversation flows
- **FR66:** Tests verify education-first behavior (explain before execute)
- **FR67:** Test results prevent regression on prompt/tool changes

#### Rollout & Monitoring

- **FR68:** System logs all helper interactions with user ID and timestamp
- **FR69:** System tracks helper usage metrics (invocations, conversation depth, success rate)
- **FR70:** System monitors error rates per helper domain
- **FR71:** System supports gradual user rollout with cohort tracking
- **FR72:** Old AI system remains accessible during helper system rollout
- **FR73:** System deprecates old AI system 2 months after 100% rollout

### Growth Features (Post-MVP)

#### Catch-Up Mode

- **FR74:** System detects multi-day gaps in expense entry
- **FR75:** System offers guilt-free catch-up flow with "Welcome back" messaging
- **FR76:** Catch-up mode optimizes bulk entry workflow

#### Enhanced Awareness

- **FR77:** System calculates "real available credit" (limit minus future installments)
- **FR78:** System displays future installment obligations on dashboard
- **FR79:** System sends pre-statement category breakdown summary
- **FR80:** System identifies spending personality patterns (weekend spender, etc.)
- **FR81:** Spending patterns use neutral archetypes (no judgment)

#### Additional Domain Helpers

- **FR82:** Budget Helper responds to "ajuda orçamento"
- **FR83:** Reports Helper responds to "ajuda relatórios", "ajuda saldo"
- **FR84:** Recurring Helper responds to "ajuda recorrentes", "ajuda assinaturas"
- **FR85:** Category Helper responds to "ajuda categorias"
- **FR86:** Income Helper responds to "ajuda receitas", "ajuda renda"

### Analytics & Learning

- **FR87:** System tracks Credit Mode vs Simple Mode adoption rates
- **FR88:** System tracks installment creation and editing patterns
- **FR89:** System tracks manual entry frequency before/after credit features
- **FR90:** System tracks helper usage rates per domain
- **FR91:** System tracks conversation depth (single-turn vs multi-turn)
- **FR92:** System tracks mode switching (Credit ↔ Simple)
- **FR93:** System tracks statement reminder open rates
- **FR94:** System tracks budget vs limit preference (user-defined vs bank limit)
- **FR95:** Analytics data accessible via PostHog dashboards

---

## Non-Functional Requirements

> Only NFRs that matter for this specific feature set. Generic requirements (LGPD, RLS, authentication) already implemented in existing codebase.

### Performance

| Requirement | Target | Rationale |
|-------------|--------|-----------|
| **NFR1:** Helper response time (first turn) | < 2 seconds | Conversational education feels natural—delays break flow |
| **NFR2:** Helper response time (follow-up) | < 1.5 seconds | Multi-turn conversations require quick responses |
| **NFR3:** Installment calculation time | < 500ms | User waits while system creates monthly entries—must be instant |
| **NFR4:** Mode switching operation | < 1 second | Immediate feedback on Credit ↔ Simple mode change |
| **NFR5:** Budget progress calculation | < 200ms | Displayed on every expense add—critical path operation |
| **NFR6:** Statement reminder job execution | < 30 seconds for all users | Daily cron job must complete reliably |

### Reliability

| Requirement | Target | Rationale |
|-------------|--------|-----------|
| **NFR7:** Installment calculation accuracy | 100% | Financial data—zero tolerance for errors |
| **NFR8:** Reminder delivery success rate | 99.5% | Missed reminders damage trust (statement/payment dates) |
| **NFR9:** Feature flag response time | < 100ms | Rollback must be instantaneous if issues detected |
| **NFR10:** Helper system failover | Graceful degradation to old NLP | Users never blocked from core expense tracking |
| **NFR11:** Mode switching data integrity | No orphaned installments | Credit→Simple must handle existing installments safely |
| **NFR12:** Payment auto-expense creation | 100% success | Missing payment transactions = broken accounting |

### Scalability

| Requirement | Target | Rationale |
|-------------|--------|-----------|
| **NFR13:** Helper system capacity | 1000 concurrent conversations | Gradual rollout peak load (10% of 10k users) |
| **NFR14:** Installment storage efficiency | O(n) per user, not O(n²) | Users may have 10+ active installments |
| **NFR15:** Feature flag evaluation performance | < 10ms per check | Called on every helper invocation |
| **NFR16:** Statement reminder scaling | Handle 10,000 users daily check | Linear scaling with user growth |

### Data Integrity

| Requirement | Target | Rationale |
|-------------|--------|-----------|
| **NFR17:** Installment-to-expense linkage | Maintain parent-child relationships | Editing parent must cascade correctly |
| **NFR18:** Budget calculation consistency | Real-time accuracy across all views | Web and WhatsApp must show same numbers |
| **NFR19:** Mode preference persistence | Survive service restarts | User choice must never be lost |
| **NFR20:** Statement date validation | Prevent invalid dates (32nd, etc.) | User input must be validated |
| **NFR21:** Early payoff recalculation | Atomic operation | All future payments updated or none |

### Observability

| Requirement | Target | Rationale |
|-------------|--------|-----------|
| **NFR22:** Helper conversation logging | Full transcript with metadata | Debug conversational issues, improve prompts |
| **NFR23:** Feature flag change audit trail | All rollout steps logged | Reconstruct what % was live when issues occurred |
| **NFR24:** Installment operation logging | Create, edit, delete, payoff events | Track user behavior for UX improvements |
| **NFR25:** Mode switching events | Log all Credit ↔ Simple transitions | Understand why users change modes |
| **NFR26:** Helper error rate alerting | Real-time alerts at >5% error rate | Catch helper system degradation immediately |
| **NFR27:** Reminder delivery logging | Success/failure per user | Identify WhatsApp delivery issues |

### Usability (Credit-Specific)

| Requirement | Target | Rationale |
|-------------|--------|-----------|
| **NFR28:** Mode selection clarity | 90%+ users understand choice | If confused, defeats purpose of opt-in model |
| **NFR29:** Installment syntax learnability | Users succeed on first try after helper guidance | Natural language must be intuitive |
| **NFR30:** Budget vs limit distinction | Clear in all UI/messaging | Users must understand personal budget ≠ credit limit |
| **NFR31:** Awareness-first tone consistency | Zero user complaints about judgment | Language audit across all features |

### Compatibility

| Requirement | Target | Rationale |
|-------------|--------|-----------|
| **NFR32:** Simple Mode backward compatibility | Existing users unaffected | Credit features are additive, not breaking |
| **NFR33:** Old NLP system coexistence | Both systems operational during rollout | 2-month overlap period during helper migration |
| **NFR34:** Feature flag framework compatibility | Works in both frontend and WhatsApp bot | Cross-platform feature control |

### Maintainability

| Requirement | Target | Rationale |
|-------------|--------|-----------|
| **NFR35:** Helper system extensibility | Add new domain helper in < 1 day | BaseHelper architecture must be reusable |
| **NFR36:** Installment logic testability | 100% unit test coverage | Financial calculations require comprehensive tests |
| **NFR37:** Feature flag documentation | All flags documented with rollout plan | Future developers understand migration state |

---

## PRD Summary

### What We're Building

A **Credit Card Management System with AI Helper Platform** that transforms NexFinApp from basic expense tracking into culturally-aware financial awareness companion for Brazilian users.

**Core Hypothesis:** Awareness without judgment + Brazilian cultural fit (parcelamento) + conversational education = engaged credit card users who maintain manual entry as mindfulness practice.

### Key Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Mental model approach** | Opt-in: Credit Mode OR Simple Mode | Respects different user relationships with credit cards |
| **Budget philosophy** | User-defined budget, not bank limit | High-limit users track intention, not max spending |
| **Brazilian-specific feature** | Installment (parcelamento) tracking | Cultural norm—generic trackers miss this |
| **Language tone** | Awareness-first, zero judgment | "Spent more than planned" not "OVERSPENT!" |
| **AI architecture** | Education-first helpers, not executors | "Ajuda cartão" teaches, then executes |
| **Rollout strategy** | Feature-flagged gradual rollout (5%→100%) | Safe experimentation with instant rollback |
| **Testing approach** | AI integration test framework (non-CI) | Prevent conversational regression on prompt changes |
| **Platform investment** | Helper system benefits ALL features | Credit helper validates, then expand to 7 domains |

### By the Numbers

| Category | Count |
|----------|-------|
| **Functional Requirements** | 95 FRs |
| **Non-Functional Requirements** | 37 NFRs |
| **MVP Features (Epic A)** | 6 features |
| **MVP Features (Epic B)** | 6 components |
| **Growth Features** | 10 features |
| **Vision Features** | 6 features |
| **Success Metrics** | 5 primary + 5 diagnostic |
| **Sprints Estimated** | 4 sprints (Epic A: 1-2, Epic B: 3-4) |

### Innovation Highlights

**From Brainstorming Session:**

1. **Manual Entry as Mindfulness** - Reframed limitation (no auto-sync) as feature (awareness moment)
2. **Fitness Tracker → Guilt Loops** - Forced Relationships technique revealed: guilt breaks habits, awareness builds them
3. **Parcelamento Intelligence** - Brazilian cultural norm elevated to core feature (not afterthought)
4. **AI as Teacher** - Helpers educate first, execute second (vs rigid tool-calling)
5. **Feature Flag Discipline** - Major architectural change protected by gradual rollout

### The Product in One Sentence

> NexFinApp's credit card management respects how Brazilians actually use credit (installments), treats manual entry as self-awareness (not chore), and educates through conversation (not menus)—all while preserving dignity with judgment-free language.

---

## Next Steps

**PRD Complete!** Here's the recommended path forward:

### Option A: Architecture First (Recommended)

Since Epic B (AI Helper System) involves major architectural change, the Architect should design:
- Helper system architecture (BaseHelper, router, domain helpers)
- Feature flag integration points (PostHog + environment variables)
- Installment data model (parent-child relationships, future commitments calculation)
- Credit Mode vs Simple Mode data schema
- Helper system coexistence with existing 3-layer NLP
- Gradual rollout infrastructure

**Why first:** Feature-flagged architecture requires upfront design. Installment tracking has complex data relationships. Helper system is platform investment—architecture must be extensible.

**Command:** `/bmad:bmm:workflows:architecture`

---

### Option B: Epic Breakdown Directly

If architecture is straightforward (extend existing patterns), skip to breaking this PRD into implementable stories:
- Epic A: Credit Card Management (6 features → ~8-12 stories)
- Epic B: AI Helper System (6 components → ~10-15 stories)

**Command:** `/bmad:bmm:workflows:create-epics-and-stories`

---

### Option C: UX Design First

If you want detailed interaction flows and copy variations before implementation:
- Credit Mode vs Simple Mode opt-in dialog
- Installment entry UX flows
- Helper conversation scripts
- Statement reminder copy testing
- Awareness-first language audit

**Command:** `/bmad:bmm:workflows:create-ux-design`

---

### My Recommendation: **Option A (Architecture)**

**Reasons:**
1. **Epic B is architectural:** Helper system is platform-level change requiring careful design
2. **Feature flags need infrastructure:** PostHog integration, gradual rollout mechanics
3. **Installment complexity:** Parent-child relationships, budget calculations, future commitments
4. **Data schema decisions:** Credit Mode preference storage, installment tables, payment tracking
5. **Coexistence strategy:** Old NLP + new helpers running simultaneously requires design
6. **Brownfield constraints:** Must integrate with existing 3-layer NLP, category system, budget infrastructure

**After Architecture:**
- Then UX Design for Credit Mode opt-in flows and helper conversations
- Then Epic Breakdown with full architectural context
- Then Implementation (Sprint 1-4)

---

**Update Workflow Status:**

The workflow status file should be updated:
- `prd` status: `docs/prd.md` ✓
- Next recommended: `architecture`

---

_This PRD captures the vision for NexFinApp's Credit Card Management System—awareness without judgment, Brazilian cultural intelligence, and conversational education._

_Created through collaborative discovery between Lucas and PM Agent, based on brainstorming session facilitated by 9 BMAD agents on 2025-11-27._

_Generated: 2025-11-28_

