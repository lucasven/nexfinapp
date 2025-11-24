# UX Specification: Notification Preferences

**Date:** 2025-11-21
**Author:** Sally (UX Designer Agent)
**Scope:** Web Settings Page - Notification Preferences Card & Opt-Out Toggle
**Related FRs:** FR28-FR32 (User Preferences & Opt-Out)

---

## Overview

This specification defines the UX design for the notification preferences section within the existing Account Settings page. The design introduces a new Card section and a Switch component for controlling re-engagement message preferences.

### Design Principles Applied

- **Consistency**: Follows existing Card-based settings page pattern
- **Clarity**: Clear distinction between re-engagement opt-out and onboarding tips
- **Respect**: Uses "comfort over pressure" language aligned with PRD tone guidelines
- **Accessibility**: WCAG 2.1 AA compliant with keyboard navigation and screen reader support

---

## 1. Page Location & Information Architecture

### Placement in Settings Page

The Notification Preferences Card should appear in the Account Settings page (`/[locale]/settings/account`) in this order:

1. Account Information (existing)
2. Your Data (existing)
3. **Notification Preferences** (NEW)
4. Your Data Rights / LGPD (existing)
5. Danger Zone (existing)

**Rationale:** Notification preferences are a routine setting, not dangerous, so they belong before the LGPD/Danger Zone sections.

---

## 2. Component: Notification Preferences Card

### 2.1 Visual Design

```
┌─────────────────────────────────────────────────────────────────┐
│ 🔔 Notification Preferences                                     │
│ Control how we communicate with you via WhatsApp                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Re-engagement Messages                           [Toggle]   │ │
│ │                                                             │ │
│ │ Friendly check-ins when you've been quiet for a while.     │ │
│ │ We'll ask how you're doing—never spam or guilt.            │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ ℹ️ Onboarding tips will still be sent to help you          │ │
│ │    discover features. You can stop these via WhatsApp      │ │
│ │    by saying "stop tips".                                   │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Card Structure

| Element | Component | Notes |
|---------|-----------|-------|
| Icon | `Bell` from lucide-react | Matches existing pattern (Shield for LGPD, AlertTriangle for Danger) |
| Title | CardTitle | "Notification Preferences" |
| Description | CardDescription | "Control how we communicate with you via WhatsApp" |
| Border | Default (no special color) | Neutral setting, not dangerous |

### 2.3 Content Structure

**Preference Row:**
- Label: "Re-engagement Messages"
- Description: "Friendly check-ins when you've been quiet for a while. We'll ask how you're doing—never spam or guilt."
- Control: Switch component (right-aligned)

**Info Note:**
- Style: `bg-muted/50 p-3 rounded-lg` (matches existing data summary style)
- Icon: `Info` from lucide-react
- Text: Explains onboarding tips are separate and how to stop them via WhatsApp

---

## 3. Component: Switch (Toggle)

### 3.1 Component Specification

**New Component Required:** `fe/components/ui/switch.tsx`

Use Radix UI Switch primitive (`@radix-ui/react-switch`) for accessibility.

### 3.2 States

| State | Visual | Behavior |
|-------|--------|----------|
| **Enabled (On)** | Primary color background, white thumb to right | User receives re-engagement messages |
| **Disabled (Off)** | Muted/gray background, white thumb to left | User opted out of re-engagement |
| **Loading** | Reduced opacity, cursor not-allowed | During API call |
| **Focus** | Ring outline (matches existing focus styles) | Keyboard navigation |

### 3.3 Switch Visual Specifications

```
Enabled (On):
┌────────────────┐
│ ████████████ ○ │  ← Primary color, thumb right
└────────────────┘

Disabled (Off):
┌────────────────┐
│ ○ ████████████ │  ← Muted color, thumb left
└────────────────┘

Dimensions:
- Width: 44px (w-11)
- Height: 24px (h-6)
- Thumb: 20px (size-5)
- Border radius: Full (rounded-full)
```

### 3.4 Switch Component Code Pattern

```tsx
// Based on existing checkbox pattern using Radix primitives
import * as SwitchPrimitive from "@radix-ui/react-switch"

function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "data-[state=checked]:bg-primary data-[state=unchecked]:bg-input",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform",
          "data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0"
        )}
      />
    </SwitchPrimitive.Root>
  )
}
```

---

## 4. Interaction Design

### 4.1 Toggle Interaction Flow

```
User clicks/taps toggle
        │
        ▼
┌─────────────────┐
│ Optimistic UI   │ ← Toggle visually changes immediately
│ Update          │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ API Call        │ ← Server action: updateNotificationPreferences()
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
Success    Failure
    │         │
    ▼         ▼
Toast:     Revert toggle
"Saved"    Toast: "Failed to save. Please try again."
```

### 4.2 Toast Messages

| Scenario | Type | Message (en) | Message (pt-BR) |
|----------|------|--------------|-----------------|
| Opt-out saved | Success | "Preferences saved" | "Preferências salvas" |
| Opt-in saved | Success | "Preferences saved" | "Preferências salvas" |
| Save failed | Error | "Failed to save preferences. Please try again." | "Falha ao salvar preferências. Tente novamente." |

### 4.3 Loading State

During the API call:
- Switch thumb shows subtle pulse animation OR
- Switch is disabled with reduced opacity
- Cursor changes to `not-allowed`

**Recommendation:** Use optimistic UI (immediate visual change) with revert on failure for snappier feel.

---

## 5. Accessibility Requirements

### 5.1 Keyboard Navigation

| Key | Action |
|-----|--------|
| `Tab` | Focus the switch |
| `Space` | Toggle the switch |
| `Enter` | Toggle the switch (optional, but good practice) |

### 5.2 Screen Reader

- **Role:** `switch` (built into Radix)
- **Label:** "Re-engagement Messages" (via `aria-labelledby` or explicit label)
- **State announcement:** "On" / "Off"

### 5.3 Focus Indicator

Match existing focus styles:
- `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`

### 5.4 Color Contrast

- Enabled state: Primary color must have 3:1 contrast ratio against background
- Thumb: White/background color, always visible against track

---

## 6. Localization

### 6.1 Translation Keys

Add to `fe/messages/en.json`:

```json
{
  "settings": {
    "notifications": {
      "title": "Notification Preferences",
      "description": "Control how we communicate with you via WhatsApp",
      "reengagement": {
        "label": "Re-engagement Messages",
        "description": "Friendly check-ins when you've been quiet for a while. We'll ask how you're doing—never spam or guilt."
      },
      "tipsNote": "Onboarding tips will still be sent to help you discover features. You can stop these via WhatsApp by saying \"stop tips\".",
      "saved": "Preferences saved",
      "error": "Failed to save preferences. Please try again."
    }
  }
}
```

Add to `fe/messages/pt-BR.json`:

```json
{
  "settings": {
    "notifications": {
      "title": "Preferências de Notificação",
      "description": "Controle como nos comunicamos com você via WhatsApp",
      "reengagement": {
        "label": "Mensagens de Reengajamento",
        "description": "Check-ins amigáveis quando você está quieto por um tempo. Vamos perguntar como você está—nunca spam ou culpa."
      },
      "tipsNote": "Dicas de onboarding ainda serão enviadas para ajudar você a descobrir recursos. Você pode parar essas dicas via WhatsApp dizendo \"parar dicas\".",
      "saved": "Preferências salvas",
      "error": "Falha ao salvar preferências. Tente novamente."
    }
  }
}
```

---

## 7. Data Binding

### 7.1 Initial State

On page load:
1. Fetch `user_profiles.reengagement_opt_out` via existing data loading pattern
2. Switch state: `checked={!reengagementOptOut}` (inverted because "enabled" means NOT opted out)

### 7.2 State Sync

Per FR30 (sync between WhatsApp and web):
- Single source of truth: `user_profiles.reengagement_opt_out` column
- Web reads/writes directly
- WhatsApp bot reads the same column
- NFR10: < 5 second sync (achieved via shared database)

---

## 8. Server Action

### 8.1 Action Signature

```typescript
// fe/lib/actions/engagement.ts
"use server"

export async function updateNotificationPreferences(
  reengagementOptOut: boolean
): Promise<{ success: boolean; message?: string }>
```

### 8.2 Implementation Notes

- Use existing Supabase client pattern
- Update `user_profiles.reengagement_opt_out` column
- Return success/failure with localized message
- No need for additional RLS policy (user can update their own profile)

---

## 9. Component File Structure

```
fe/
├── components/
│   ├── ui/
│   │   └── switch.tsx                    # NEW - Radix Switch primitive
│   └── settings/
│       └── notification-preferences.tsx  # NEW - Card component
├── lib/
│   └── actions/
│       └── engagement.ts                 # NEW - Server action
└── messages/
    ├── en.json                           # UPDATE - Add notification keys
    └── pt-BR.json                        # UPDATE - Add notification keys
```

---

## 10. Visual Reference

### Light Mode
```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  🔔 Notification Preferences                                    │
│  Control how we communicate with you via WhatsApp               │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                                                           │  │
│  │  Re-engagement Messages                         [●━━━━━]  │  │
│  │                                                   ON      │  │
│  │  Friendly check-ins when you've been quiet for a while.  │  │
│  │  We'll ask how you're doing—never spam or guilt.         │  │
│  │                                                           │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  ℹ️ Onboarding tips will still be sent to help you       │  │
│  │     discover features. You can stop these via WhatsApp    │  │
│  │     by saying "stop tips".                                │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Opted-Out State
```
┌───────────────────────────────────────────────────────────────┐
│                                                               │
│  Re-engagement Messages                         [━━━━━○]     │
│                                                   OFF        │
│  Friendly check-ins when you've been quiet for a while.     │
│  We'll ask how you're doing—never spam or guilt.            │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

---

## 11. Tone & Voice Alignment

Per PRD guidelines, all text follows the "comfort over pressure" philosophy:

| Aspect | Applied |
|--------|---------|
| Curiosity | ✅ "how you're doing" |
| Dignity | ✅ "never spam or guilt" |
| Empowerment | ✅ "You can stop these" |
| No Pressure | ✅ No guilt about opting out |

**Avoided:**
- ❌ "Don't miss out..."
- ❌ "You'll lose..."
- ❌ "Are you sure you want to miss..."

---

## 12. Implementation Checklist

### For Developer

- [ ] Create `fe/components/ui/switch.tsx` (Radix Switch)
- [ ] Create `fe/components/settings/notification-preferences.tsx`
- [ ] Create `fe/lib/actions/engagement.ts` with `updateNotificationPreferences()`
- [ ] Add translation keys to `en.json` and `pt-BR.json`
- [ ] Integrate NotificationPreferences card into Account Settings page
- [ ] Test keyboard navigation (Tab, Space)
- [ ] Test screen reader announcements
- [ ] Verify optimistic UI and error rollback
- [ ] Verify preference syncs with WhatsApp bot (< 5s per NFR10)

---

## Appendix: Related PRD Requirements

| FR | Requirement | How This Design Addresses It |
|----|-------------|------------------------------|
| FR29 | Web settings opt-out toggle | NotificationPreferences card with Switch component |
| FR30 | Sync between WhatsApp and web | Single DB column, both channels read/write directly |
| FR31 | Respect opt-out for re-engagement, allow tips | Info note explains distinction, only re-engagement toggle here |
| FR32 | Users can opt back in | Toggle allows both directions |

---

_This UX specification was created through collaborative design facilitation by Sally (UX Designer Agent) as part of the BMad Method workflow._
