# Navigation Structure - Expense Tracker

**Last Updated:** December 4, 2025
**Status:** Approved Design
**Related Wireframes:** `docs/diagrams/wireframe-homepage-option4-20251204.excalidraw`

## Overview

This document defines the complete navigation structure for the expense tracker application. The design focuses on simplicity, logical grouping, and scalability.

---

## Header Navigation

### Layout
```
┌────────────────────────────────────────────────────────────┐
│  Controle de Despesas                                      │
│  Gerencie suas finanças com facilidade                     │
│                                                             │
│  [📊 Visão Geral ▾]  [💳 Cartões ▾]  [⚙️ Configurar ▾]    │
│                                  [+ Adicionar Transação] [👤]│
└────────────────────────────────────────────────────────────┘
```

### Navigation Groups

#### 1. 📊 Visão Geral (Overview)
**Purpose:** Analytics and high-level financial views

| Item | Route | Description |
|------|-------|-------------|
| 🏠 Dashboard | `/` | Main dashboard with financial overview, budgets, commitments |
| 📊 Relatórios | `/reports` | Analytics, reports, and insights |

**Default:** Dashboard is the landing page

---

#### 2. 💳 Cartões (Credit Cards)
**Purpose:** Everything related to credit card management and tracking

| Item | Route | Description |
|------|-------|-------------|
| 💰 Parcelamentos | `/installments` | View all active installments (existing page) |
| ⚙️ Gerenciar Cartões | `/credit-cards` | Manage credit cards (NEW page - see wireframe) |

**What "Gerenciar Cartões" includes:**
- Add new credit cards
- Edit existing credit cards
- Delete credit cards
- Set monthly budgets (per card)
- Configure statement closing dates (per card)
- Configure payment due dates (per card)
- Toggle Credit Mode vs Simple Mode

**Note:** "Parcelamentos" reuses the existing `/installments` page. No duplication needed.

---

#### 3. ⚙️ Configurar (Settings)
**Purpose:** Application configuration and data management

| Item | Route | Description |
|------|-------|-------------|
| 📁 Categorias | `/categories` | Manage transaction categories (existing page) |
| 🔄 Recorrentes | `/recurring` | Manage recurring payments |
| 💵 Métodos de Pagamento | `/payment-methods` | Manage bank accounts and payment methods |

**Future items (potential):**
- Import/Export data
- Notifications preferences
- Integrations

---

#### 4. ➕ Adicionar Transação (Primary CTA)
**Type:** Button (not dropdown)
**Action:** Opens transaction creation modal/dialog
**Always visible:** Yes (primary user action)

---

#### 5. 👤 Profile Dropdown (User Account)
**Purpose:** User account, preferences, and authentication

| Item | Action | Description |
|------|--------|-------------|
| **Lucas Venturella** | Label | User name (non-clickable) |
| lucas.venturella@... | Label | Email (non-clickable) |
| ─────────── | Divider | Visual separator |
| 🌍 Português | Action | Language selector (modal/submenu) |
| ⚙️ Configurações do Perfil | `/profile/settings` | User profile configuration |
| 📊 Admin Dashboard | `/admin` | Admin panel (if user is admin) |
| ─────────── | Divider | Visual separator |
| 🚪 Sair | Action | Logout |

**Note:** Language and profile preferences remain here (no separate page needed for now)

---

## Mobile Navigation (< 768px)

On mobile devices, the header dropdowns convert to a hamburger menu:

```
┌─────────────────────┐
│ ☰  Controle         │
│         [+ Add] [👤]│
└─────────────────────┘

Tap ☰ opens drawer:
┌─────────────────────┐
│ 📊 Visão Geral   ▾  │ ← Expandable
│   🏠 Dashboard      │
│   📊 Relatórios     │
│                     │
│ 💳 Cartões       ▾  │ ← Expandable
│   💰 Parcelamentos  │
│   ⚙️ Gerenciar      │
│                     │
│ ⚙️ Configurar    ▾  │ ← Expandable
│   📁 Categorias     │
│   🔄 Recorrentes    │
│   💵 Métodos Pag.   │
└─────────────────────┘
```

---

## Routing Map

Complete list of all application routes:

| Route | Page Name | Navigation Source |
|-------|-----------|-------------------|
| `/` | Dashboard | Visão Geral > Dashboard |
| `/reports` | Relatórios | Visão Geral > Relatórios |
| `/installments` | Parcelamentos | Cartões > Parcelamentos |
| `/credit-cards` | Gerenciar Cartões | Cartões > Gerenciar Cartões ⭐ NEW |
| `/categories` | Categorias | Configurar > Categorias |
| `/recurring` | Recorrentes | Configurar > Recorrentes |
| `/payment-methods` | Métodos de Pagamento | Configurar > Métodos de Pagamento |
| `/profile/settings` | Configurações do Perfil | Profile dropdown |
| `/admin` | Admin Dashboard | Profile dropdown (admin only) |

⭐ **NEW PAGE:** `/credit-cards` - See wireframe for detailed design

---

## Migration from Current Structure

### What's Changing

**Header Before:**
- Relatórios
- Orçamentos
- Categorias
- Recorrentes
- + Adicionar Transação

**Header After:**
- 📊 Visão Geral (Dashboard, Relatórios)
- 💳 Cartões (Parcelamentos, Gerenciar Cartões)
- ⚙️ Configurar (Categorias, Recorrentes, Métodos de Pagamento)
- + Adicionar Transação

**Impact:**
1. ✅ Reduced header items: 5 → 3 dropdowns (cleaner)
2. ✅ Added "Parcelamentos" navigation (missing before)
3. ✅ Credit card settings moved from profile page → dedicated page
4. ✅ Logical grouping (View → Manage → Configure)

### What's Staying the Same

1. ✅ Dashboard layout (homepage wireframe)
2. ✅ Transaction flow
3. ✅ `/installments` page (reused, not rebuilt)
4. ✅ Language/preferences in profile dropdown
5. ✅ All existing pages (categories, recurring, etc.)

---

## Dashboard Responsive Card Behavior

The dashboard uses a flexible 3-column grid that adapts based on available data:

### Scenario 1: All Cards Present (Default)
```
┌─────────┐ ┌─────────────┐ ┌──────────────┐
│Financial│ │   Budget    │ │ Commitments  │
│Overview │ │   Widget    │ │              │
│ 300px   │ │   520px     │ │   500px      │
└─────────┘ └─────────────┘ └──────────────┘
```

### Scenario 2: No Budget Widget
```
┌──────────────────────────┐ ┌──────────────┐
│   Financial Overview     │ │ Commitments  │
│      EXPANDED            │ │              │
│       820px              │ │   500px      │
└──────────────────────────┘ └──────────────┘
```

**When:** User has no credit cards OR no budget set
**Behavior:** Financial Overview expands to show more details

### Scenario 3: No Commitments
```
┌─────────┐ ┌──────────────────────────────┐
│Financial│ │      Budget Widget           │
│Overview │ │         EXPANDED             │
│ 300px   │ │         1020px               │
└─────────┘ └──────────────────────────────┘
```

**When:** User has no upcoming payments AND no installments
**Behavior:** Budget Widget expands to show multiple cards or additional details

### Scenario 4: No Budget + No Commitments
```
┌─────────────────────────────────────────┐
│     Financial Overview - FULL WIDTH     │
│              1360px                     │
└─────────────────────────────────────────┘
```

**When:** New user OR simple setup
**Behavior:** Financial Overview shows recent transactions preview + onboarding hints

### Mobile (< 768px)
All cards stack vertically:
```
┌──────────────┐
│  Financial   │
└──────────────┘
┌──────────────┐
│    Budget    │
└──────────────┘
┌──────────────┐
│ Commitments  │
└──────────────┘
```

Empty cards are hidden completely on mobile.

---

## Collapsed Category Section Behavior

The category breakdown section on the dashboard has TWO states:

### Collapsed State (Default)
```
┌────────────────────────────────────────────────────────┐
│ 💰 Detalhamento por categoria • 3 Dec - 2 Jan         │
│                                    [▼ Ver tudo]        │
│                                                        │
│ 🍔 Alimentação  ████████░░  R$ 120,00  (91%)          │
│ 🏠 Assinaturas  █░░░░░░░░░  R$ 12,00   (9%)           │
│ 📦 +1 categoria                                        │
└────────────────────────────────────────────────────────┘
```

**Shows:**
- Top 2 categories with amounts and percentages
- Visual progress bars
- "+X categorias" hint if more exist

**Height:** ~140px

### Expanded State (Clicked "Ver tudo")
```
┌────────────────────────────────────────────────────────┐
│ 💰 Detalhamento por categoria • 3 Dec - 2 Jan         │
│                                    [▲ Ocultar]         │
│                                                        │
│ 🍔 Alimentação  ████████░░  R$ 120,00  (91%)          │
│    3 transações • Inclui 1 parcelamento               │
│                                                        │
│ 🏠 Assinaturas  █░░░░░░░░░  R$ 12,00   (9%)           │
│    1 transação                                         │
│                                                        │
│ 🎮 Lazer        ░░░░░░░░░░  R$ 0,00    (0%)           │
│    Nenhuma transação                                   │
│                                                        │
│ Total: R$ 132,00 em 3 categorias                      │
└────────────────────────────────────────────────────────┘
```

**Shows:**
- ALL categories (not just top 2)
- Transaction counts per category
- Installment indicators
- Total summary

**Height:** Dynamic (based on category count)

---

## Design Principles

### 1. Progressive Disclosure
- Show summary first, details on demand
- Collapsed states are useful (not just hidden)
- "View all" links for deeper exploration

### 2. Awareness-First Language
- Neutral colors (blue, gray, yellow)
- Non-judgmental messaging
- Positive framing ("Sobraram R$ X" not "You have R$ X left")

### 3. Logical Grouping
- View (analytics) → Manage (credit cards) → Configure (settings)
- Mental model alignment with user tasks

### 4. Scalability
- Easy to add new features within existing groups
- No header bloat
- Clear hierarchy

### 5. Mobile-First
- All layouts adapt to small screens
- Hamburger menu on mobile
- Touch-friendly targets (44px minimum)

---

## Future Enhancements (Not Prioritized)

Potential additions to the navigation structure:

1. **Visão Geral**
   - Insights (AI-powered spending insights)
   - Tendências (Spending trends over time)

2. **Cartões**
   - Comparar Cartões (Compare credit card spending)
   - Histórico de Faturas (Statement history)

3. **Configurar**
   - Importar/Exportar (Data import/export)
   - Notificações (Notification preferences)
   - Integrações (Third-party integrations)

---

## Related Documentation

- **Homepage Wireframe:** `docs/diagrams/wireframe-homepage-option4-20251204.excalidraw`
- **Credit Cards Page Wireframe:** `docs/diagrams/wireframe-credit-cards-management-20251204.excalidraw` (see below)
- **Component Library:** `fe/components/` (React components)
- **Routing Config:** `fe/app/[locale]/` (Next.js App Router)

---

## Accessibility Notes

### Keyboard Navigation
- All dropdowns accessible via keyboard (Tab, Enter, Escape)
- Arrow keys navigate dropdown items
- Escape closes active dropdown

### Screen Readers
- Proper ARIA labels on all navigation items
- `aria-expanded` states on dropdowns
- `aria-current="page"` on active page

### Focus Management
- Visible focus indicators (2px blue outline)
- Focus trap in open dropdowns
- Return focus to trigger after dropdown closes

---

## Implementation Checklist

- [ ] Update header component with new dropdown structure
- [ ] Create `/credit-cards` page (see wireframe)
- [ ] Add navigation links for "Parcelamentos"
- [ ] Remove credit card settings from profile page
- [ ] Update mobile hamburger menu
- [ ] Add keyboard navigation support
- [ ] Test responsive behavior (all breakpoints)
- [ ] Update analytics tracking (new navigation events)
- [ ] Update localization files (pt-BR/en)
- [ ] Add unit tests for navigation components

---

**Document Version:** 1.0
**Approved By:** Lucas Venturella
**Next Review:** After implementation feedback
