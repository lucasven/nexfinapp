-- Migration: 054_user_hidden_categories.sql
-- Purpose: Enable users to customize or remove default categories using copy-on-write approach
-- When editing a default, a personal copy is created and transactions migrate
-- When removing, the default is hidden (soft delete)

-- Table: user_hidden_categories
CREATE TABLE IF NOT EXISTS user_hidden_categories (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  hidden_at TIMESTAMPTZ DEFAULT NOW(),
  reason TEXT, -- 'edited' or 'removed'
  PRIMARY KEY (user_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_user_hidden_categories_user ON user_hidden_categories(user_id);

-- RLS
ALTER TABLE user_hidden_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own hidden" ON user_hidden_categories;
CREATE POLICY "Users can view own hidden" ON user_hidden_categories
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can hide categories" ON user_hidden_categories;
CREATE POLICY "Users can hide categories" ON user_hidden_categories
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can unhide categories" ON user_hidden_categories;
CREATE POLICY "Users can unhide categories" ON user_hidden_categories
  FOR DELETE USING (auth.uid() = user_id);

-- Track copy lineage
ALTER TABLE categories ADD COLUMN IF NOT EXISTS copied_from_id UUID REFERENCES categories(id) ON DELETE SET NULL;

-- Function: get_visible_categories (works with both RLS and admin access)
CREATE OR REPLACE FUNCTION get_visible_categories(p_user_id UUID)
RETURNS TABLE (
  id UUID, name TEXT, type TEXT, icon TEXT, color TEXT,
  is_custom BOOLEAN, is_system BOOLEAN, user_id UUID,
  created_at TIMESTAMPTZ, copied_from_id UUID
) AS $$
BEGIN
  RETURN QUERY
  SELECT c.id, c.name, c.type, c.icon, c.color,
         c.is_custom, c.is_system, c.user_id, c.created_at, c.copied_from_id
  FROM categories c
  WHERE (c.user_id = p_user_id)
     OR (c.is_system = true)
     OR (c.user_id IS NULL AND c.is_system = false AND NOT EXISTS (
           SELECT 1 FROM user_hidden_categories h
           WHERE h.user_id = p_user_id AND h.category_id = c.id
         ))
  ORDER BY c.name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_visible_categories(UUID) TO authenticated;
