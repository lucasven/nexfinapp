# Pricing Tiers Design

## Overview

Freemium pricing model with WhatsApp, Couples, and Open Finance as paid tiers. Web app remains free forever.

## Tier Structure

| Tier | Monthly | Lifetime (first 50) | Features |
|------|---------|---------------------|----------|
| **Free** | R$0 | - | Web app only |
| **WhatsApp** | R$9,90 | R$79,90 | + 1 WhatsApp number |
| **Couples** | R$19,90 | R$159,90 | + 2+ WhatsApp numbers + groups |
| **Open Finance** | R$39,90 | R$319,90 | + Automatic bank ingestion via Openi |

### Key Principles

- Tiers are cumulative (Couples includes all WhatsApp features)
- Lifetime purchases limited to first 50 customers globally (creates urgency)
- Existing beta users receive one-time lifetime offer

## Data Model

### New table: `subscriptions`

```sql
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) NOT NULL,
  tier TEXT NOT NULL CHECK (tier IN ('free', 'whatsapp', 'couples', 'openfinance')),
  type TEXT NOT NULL CHECK (type IN ('monthly', 'lifetime')),
  status TEXT NOT NULL CHECK (status IN ('active', 'cancelled', 'past_due', 'expired')),
  mercado_pago_subscription_id TEXT,  -- null for lifetime
  started_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,  -- null for lifetime
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
```

### New table: `lifetime_purchases`

```sql
CREATE TABLE lifetime_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) NOT NULL,
  tier TEXT NOT NULL CHECK (tier IN ('whatsapp', 'couples', 'openfinance')),
  purchase_number INT NOT NULL,  -- 1-50, auto-incremented
  amount_paid DECIMAL(10,2) NOT NULL,
  purchased_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(purchase_number)
);
```

### Helper function: `get_user_tier(user_id)`

Returns the user's active tier for feature gating. Returns 'free' if no active subscription.

## Feature Gating Logic

### 1. WhatsApp Bot Authorization

```
1. Message arrives at bot
2. Find user by WhatsApp identifier (existing)
3. Check get_user_tier(user_id)
4. If tier = 'free' → send payment prompt, stop
5. If tier = 'whatsapp' → check only 1 number linked, NO groups
6. If tier >= 'couples' → allow multiple numbers + groups
7. Continue to message handling
```

### 2. Group Invite/Join Gating (CRITICAL)

```
When group invite link detected:
1. Check get_user_tier(user_id)
2. If tier < 'couples':
   - Send upgrade prompt: "Grupos são exclusivos para planos Casais ou superior"
   - Do NOT join group
   - Track event: group_join_blocked
3. If tier >= 'couples':
   - Join group normally
   - Track event: group_joined
```

**Investigation needed:** Locate group join logic in codebase. Tracked in `lv-expense-tracker-q8e`.

### 3. WhatsApp Number Limit Enforcement

- `whatsapp` tier: Max 1 WhatsApp number per account
- `couples` tier: Unlimited numbers, groups allowed
- Enforced when adding new numbers via web app settings

### 4. Open Finance Gating

- Feature hidden in UI for tiers below `openfinance`
- API endpoints return 403 if tier insufficient
- Openi webhook handler checks tier before processing transactions

### 5. Web App

No gating - always free. Tier only affects WhatsApp and Open Finance features.

## Payment Integration

### Provider: Mercado Pago

- Existing integration experience from another project
- Strong support for Brazilian market
- Handles both one-time payments (lifetime) and subscriptions (monthly)

### Webhook Events to Handle

- `payment.created` - Process new payment
- `subscription.authorized` - Activate subscription
- `subscription.cancelled` - Mark subscription cancelled
- `subscription.paused` - Handle paused state

## Migration Strategy

### Existing Beta Users

- Receive one-time lifetime offer via WhatsApp/email
- Offer valid for limited time (TBD: 7-14 days)
- After offer expires, must subscribe at regular rates

### New Users After Launch

- Start on free tier (web only)
- WhatsApp bot prompts for payment on first message
- Lifetime option available until 50 customers reached

## Analytics Events

| Event | Properties | Trigger |
|-------|------------|---------|
| `subscription_started` | tier, type, amount | New subscription created |
| `subscription_cancelled` | tier, reason | User cancels |
| `lifetime_purchased` | tier, purchase_number, amount | Lifetime purchase |
| `upgrade_prompt_shown` | current_tier, target_tier, trigger | User hits tier limit |
| `group_join_blocked` | user_id, tier | Group join attempted without couples tier |
| `group_joined` | user_id, tier | Successful group join |

## Implementation Tasks

1. [ ] Create database migrations for subscriptions and lifetime_purchases tables
2. [ ] Implement `get_user_tier()` database function
3. [ ] Add tier check to WhatsApp bot authorization middleware
4. [ ] Investigate and gate group join functionality (`lv-expense-tracker-q8e`)
5. [ ] Integrate Mercado Pago payment flow
6. [ ] Build subscription management UI in web app
7. [ ] Create upgrade prompts and payment pages
8. [ ] Implement lifetime purchase counter and "X spots remaining" display
9. [ ] Set up Openi integration for Open Finance tier
10. [ ] Create beta user migration campaign

## Open Questions

- Exact duration for beta user lifetime offer window
- Pricing adjustments based on market feedback
- Open Finance tier pricing after Openi costs are known
