# Internationalization (i18n) Guide

This document describes the internationalization framework implemented in the WhatsApp bot backend and provides guidance for future frontend integration.

## Overview

The WhatsApp bot now supports multiple languages through a comprehensive i18n system. Currently implemented languages:
- **Portuguese (Brazil)** - `pt-br` (default)
- **English** - `en`

## Backend Architecture

### Core Components

#### 1. Type Definitions (`whatsapp-bot/src/localization/types.ts`)

Defines the structure for all translatable messages and format helpers:

```typescript
export type Locale = 'pt-br' | 'en'

export interface Messages {
  welcome: string
  loginPrompt: string
  expenseAdded: (amount: number, category: string, date: string) => string
  // ... all message keys
}

export interface FormatHelpers {
  formatCurrency: (value: number) => string
  formatDate: (date: Date) => string
  getMonthName: (month: number) => string
}
```

#### 2. Locale Files

**Portuguese**: `whatsapp-bot/src/localization/pt-br.ts`
**English**: `whatsapp-bot/src/localization/en.ts`

Each file exports:
- `messages`: All translatable strings
- `formatHelpers`: Locale-specific formatting functions

#### 3. Core i18n System (`whatsapp-bot/src/localization/i18n.ts`)

Provides:
- `getUserLocale(userId)` - Retrieves user's preferred locale from database
- `setUserLocale(userId, locale)` - Updates user's locale preference
- `getMessages(locale)` - Returns messages object for a locale
- `t(key, locale, ...params)` - Translation function
- `formatCurrency(value, locale)` - Currency formatting
- `formatDate(date, locale)` - Date formatting
- `getMonthName(month, locale)` - Month name retrieval

### Database Schema

User locale preference is stored in `user_profiles` table:

```sql
ALTER TABLE user_profiles ADD COLUMN locale TEXT DEFAULT 'pt-br';
```

This column was added in migration `006_parsing_metrics.sql`.

### Usage Example

```typescript
import { getUserLocale, t, formatCurrency } from '../localization/i18n'

async function sendWelcome(userId: string) {
  const locale = await getUserLocale(userId)
  const welcomeMsg = t('welcome', locale)
  const balance = formatCurrency(1000, locale)
  // Portuguese: "R$ 1.000,00"
  // English: "$1000.00"
}
```

## Frontend Integration Plan

### Recommended Approach

#### 1. Shared Type Definitions

Create a shared package or copy type definitions to ensure consistency:

```
shared/
  localization/
    types.ts     # Same interface definitions as backend
```

#### 2. Frontend Locale Files

```
fe/lib/localization/
  types.ts       # Shared types
  pt-br.ts       # Portuguese messages
  en.ts          # English messages
  i18n.ts        # Frontend i18n utilities
```

#### 3. Frontend i18n System

Use a library like `next-intl` (for Next.js) or `react-i18next`:

```typescript
// fe/lib/localization/i18n.ts
import { createSharedPathnamesNavigation } from 'next-intl/navigation'

export const locales = ['pt-br', 'en'] as const
export const defaultLocale = 'pt-br'

export const { Link, redirect, usePathname, useRouter } =
  createSharedPathnamesNavigation({ locales })
```

#### 4. User Preference Storage

Store locale preference in:
1. **Database** (`user_profiles.locale`) - Server-side source of truth
2. **Local Storage** - Client-side cache
3. **Cookie** - For SSR

```typescript
// fe/lib/actions/profile.ts
export async function setUserLocale(locale: Locale) {
  const supabase = createClient()
  await supabase
    .from('user_profiles')
    .update({ locale })
    .eq('user_id', userId)
  
  // Update cookie for SSR
  cookies().set('locale', locale)
}
```

#### 5. Message Synchronization

Keep backend and frontend messages synchronized:

**Option A: Single Source of Truth**
- Store all messages in database
- Backend and frontend query from same source
- More complex but ensures perfect sync

**Option B: Duplicate with Validation** (Recommended)
- Maintain separate locale files
- Create validation script to check for missing keys
- Run as part of CI/CD pipeline

```typescript
// scripts/validate-i18n.ts
const backendKeys = Object.keys(backendMessages)
const frontendKeys = Object.keys(frontendMessages)
const missing = backendKeys.filter(k => !frontendKeys.includes(k))
if (missing.length > 0) {
  throw new Error(`Missing translations: ${missing.join(', ')}`)
}
```

### Format Helpers

Ensure consistent formatting between backend and frontend:

```typescript
// shared/localization/format-helpers.ts
export function formatCurrency(value: number, locale: Locale): string {
  if (locale === 'pt-br') {
    return `R$ ${value.toFixed(2).replace('.', ',')}`
  } else {
    return `$${value.toFixed(2)}`
  }
}

export function formatDate(date: Date, locale: Locale): string {
  return date.toLocaleDateString(locale === 'pt-br' ? 'pt-BR' : 'en-US', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  })
}
```

### Language Switcher Component

```typescript
// fe/components/language-switcher.tsx
import { setUserLocale } from '@/lib/actions/profile'
import { useRouter } from 'next/navigation'

export function LanguageSwitcher() {
  const router = useRouter()
  
  const handleChange = async (locale: Locale) => {
    await setUserLocale(locale)
    router.refresh() // Reload with new locale
  }
  
  return (
    <Select onValueChange={handleChange}>
      <SelectItem value="pt-br">🇧🇷 Português</SelectItem>
      <SelectItem value="en">🇺🇸 English</SelectItem>
    </Select>
  )
}
```

## Adding New Languages

### Backend

1. Create locale file: `whatsapp-bot/src/localization/{locale}.ts`
2. Implement all message keys from `Messages` interface
3. Implement format helpers for locale
4. Update `Locale` type in `types.ts`
5. Register locale in `i18n.ts`:

```typescript
const localeMessages: Record<Locale, Messages> = {
  'pt-br': ptBrMessages,
  'en': enMessages,
  'es': esMessages  // New locale
}
```

### Frontend

1. Create locale file: `fe/lib/localization/{locale}.ts`
2. Implement all message keys
3. Update locale configuration
4. Add flag/name to language switcher

## Testing i18n

### Backend Tests

```typescript
describe('i18n', () => {
  it('should return correct locale messages', () => {
    const ptMsg = t('welcome', 'pt-br')
    const enMsg = t('welcome', 'en')
    
    expect(ptMsg).toContain('Olá')
    expect(enMsg).toContain('Hello')
  })
  
  it('should format currency correctly', () => {
    expect(formatCurrency(1000, 'pt-br')).toBe('R$ 1000,00')
    expect(formatCurrency(1000, 'en')).toBe('$1000.00')
  })
})
```

### Frontend Tests

```typescript
describe('Language Switcher', () => {
  it('should update user locale on change', async () => {
    render(<LanguageSwitcher />)
    
    await userEvent.selectOptions(screen.getByRole('combobox'), 'en')
    
    expect(setUserLocale).toHaveBeenCalledWith('en')
  })
})
```

## Best Practices

1. **Always use translation keys, never hardcode strings**
   ```typescript
   // ❌ Bad
   return "Hello, user!"
   
   // ✅ Good
   return t('greeting', locale)
   ```

2. **Use parameterized messages for dynamic content**
   ```typescript
   // Message definition
   expenseAdded: (amount, category, date) => 
     `✅ Expense added!\n💵 Amount: ${amount}\n...`
   
   // Usage
   t('expenseAdded', locale, 50, 'Food', '2024-01-15')
   ```

3. **Keep messages in sync**
   - Run validation scripts regularly
   - Update all locales when adding new keys
   - Document context for translators

4. **Test with multiple locales**
   - Test formatting edge cases
   - Verify currency symbols
   - Check date formats

5. **Consider text expansion**
   - German/Portuguese text can be 30% longer than English
   - Design UI with text expansion in mind
   - Test with longest locale

## Migration Notes

### Existing Code

Currently, the backend still uses direct imports from `pt-br.ts` in many places:

```typescript
import { messages } from '../localization/pt-br'
```

### Future Refactoring

To support dynamic locales, handlers should be updated to:

```typescript
import { getUserLocale, getMessages } from '../localization/i18n'

async function handleLogin(whatsappNumber: string, ...) {
  const session = await getUserSession(whatsappNumber)
  const locale = session ? await getUserLocale(session.userId) : 'pt-br'
  const messages = getMessages(locale)
  
  return messages.loginSuccess
}
```

This refactoring can be done gradually without breaking existing functionality.

## Resources

- [Next.js i18n Routing](https://nextjs.org/docs/app/building-your-application/routing/internationalization)
- [react-i18next](https://react.i18next.com/)
- [next-intl](https://next-intl-docs.vercel.app/)
- [Format.js](https://formatjs.io/)

## Questions?

For questions or suggestions about the i18n implementation, please contact the development team or create an issue in the project repository.


