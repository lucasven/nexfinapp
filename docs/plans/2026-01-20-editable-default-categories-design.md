# Editable Default Categories Design

**Date:** 2026-01-20
**Status:** Approved

## Problem

Users cannot edit or remove default categories. They're stuck with categories they may not use (e.g., "Educação" for someone not in school), and can't customize names to match their mental model.

## Solution: Copy-on-Write with Hidden Defaults

### Key Decisions

| Decision | Choice |
|----------|--------|
| Approach | Copy-on-write (create personal copy when editing) |
| Original visibility | Auto-hide original when user has a copy |
| Transaction handling | Migrate user's transactions to the new copy |
| Delete behavior | Hide default (don't delete), even if transactions exist |

### Data Model

New table to track hidden defaults per user:

```sql
CREATE TABLE user_hidden_categories (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  category_id UUID REFERENCES categories(id) ON DELETE CASCADE,
  hidden_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, category_id)
);
```

Database function for consistent fetching (works with both frontend RLS and bot admin access):

```sql
CREATE OR REPLACE FUNCTION get_visible_categories(p_user_id UUID)
RETURNS SETOF categories AS $$
BEGIN
  RETURN QUERY
  SELECT c.*
  FROM categories c
  WHERE
    (c.user_id = p_user_id)
    OR
    (c.user_id IS NULL AND NOT EXISTS (
      SELECT 1 FROM user_hidden_categories h
      WHERE h.category_id = c.id AND h.user_id = p_user_id
    ));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### Operations

**Edit default category:**
1. Create custom copy with user's edits (`is_custom = true`, `user_id = current_user`)
2. Migrate user's transactions from original to copy
3. Auto-hide the original default

**Delete/remove default category:**
1. Add row to `user_hidden_categories`
2. Transactions keep their category reference (hidden from selection, but data intact)

**Edit/delete custom category:**
- No change from current behavior

**System categories:**
- Remain protected (cannot delete)

### Server Actions

**Modified `deleteCategory()`:**
- If `is_system`: throw error (protected)
- If `is_custom`: current behavior (check usage, hard delete)
- If default: insert into `user_hidden_categories` (soft hide)

**Modified `updateCategory()`:**
- If `is_system`: allow name/icon only
- If `is_custom`: direct update
- If default: copy-on-write flow

**New helper `editDefaultCategory()`:**
1. Create personal copy with edits
2. Migrate transactions: `UPDATE transactions SET category_id = copy.id WHERE user_id = X AND category_id = original.id`
3. Hide original: `INSERT INTO user_hidden_categories`

### Frontend Changes

**Categories list:**
- Enable delete button for default categories (was disabled)
- Only system categories remain protected

**Delete confirmation:**
- Default: "Remover categoria" / "Esta categoria será removida da sua lista."
- Custom: "Deletar categoria" / "Esta ação não pode ser desfeita."

### WhatsApp Bot Changes

**Category matching:**
- Use `get_visible_categories(user_id)` function
- Hidden defaults won't be matched
- User's custom copies will be matched instead

### Migration

**File:** `048_user_hidden_categories.sql`

Contents:
1. Create `user_hidden_categories` table
2. Add RLS policies (users manage own hidden categories)
3. Create `get_visible_categories()` function
4. Add index on `user_id` for performance

**No data migration needed** - existing users see all defaults until they choose to customize.

### Not Included (Future)

- "Restore defaults" feature
- Bulk hide/show operations
- Category templates or presets
