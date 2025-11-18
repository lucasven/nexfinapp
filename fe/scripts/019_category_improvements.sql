-- Migration: Category Matching Improvements
-- Date: 2025-11-17
-- Description: Adds support for category synonyms, merchant mappings, and user learning

-- Table: category_synonyms
-- Stores alternative names and keywords for categories
CREATE TABLE IF NOT EXISTS category_synonyms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  synonym TEXT NOT NULL,
  language TEXT DEFAULT 'pt-BR',
  is_merchant BOOLEAN DEFAULT false,
  confidence DECIMAL(3,2) DEFAULT 0.80,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(category_id, synonym)
);

CREATE INDEX idx_category_synonyms_category ON category_synonyms(category_id);
CREATE INDEX idx_category_synonyms_lookup ON category_synonyms(synonym);
CREATE INDEX idx_category_synonyms_merchant ON category_synonyms(is_merchant) WHERE is_merchant = true;

-- Table: user_category_preferences
-- Tracks user's category choices for specific merchants/descriptions to learn patterns
CREATE TABLE IF NOT EXISTS user_category_preferences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  description_pattern TEXT NOT NULL,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  frequency INTEGER DEFAULT 1,
  last_used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, description_pattern)
);

CREATE INDEX idx_user_preferences_user ON user_category_preferences(user_id);
CREATE INDEX idx_user_preferences_pattern ON user_category_preferences(description_pattern);
CREATE INDEX idx_user_preferences_frequency ON user_category_preferences(frequency DESC);

-- Table: category_corrections
-- Tracks when users correct/change categories to improve future predictions
CREATE TABLE IF NOT EXISTS category_corrections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
  original_category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  corrected_category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  description TEXT,
  amount DECIMAL(10,2),
  correction_source TEXT, -- 'manual_edit', 'bot_command', etc.
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_corrections_user ON category_corrections(user_id);
CREATE INDEX idx_corrections_original ON category_corrections(original_category_id);
CREATE INDEX idx_corrections_corrected ON category_corrections(corrected_category_id);
CREATE INDEX idx_corrections_created ON category_corrections(created_at DESC);

-- Table: merchant_category_mapping
-- Maps merchant names to categories for faster OCR matching
CREATE TABLE IF NOT EXISTS merchant_category_mapping (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_name TEXT NOT NULL,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  confidence DECIMAL(3,2) DEFAULT 0.90,
  usage_count INTEGER DEFAULT 0,
  user_id UUID, -- NULL for global mappings
  is_global BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(merchant_name, user_id)
);

CREATE INDEX idx_merchant_mapping_name ON merchant_category_mapping(merchant_name);
CREATE INDEX idx_merchant_mapping_category ON merchant_category_mapping(category_id);
CREATE INDEX idx_merchant_mapping_user ON merchant_category_mapping(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_merchant_mapping_global ON merchant_category_mapping(is_global) WHERE is_global = true;

-- Function: Update merchant mapping usage
CREATE OR REPLACE FUNCTION update_merchant_mapping_usage()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_merchant_mapping
  BEFORE UPDATE ON merchant_category_mapping
  FOR EACH ROW
  EXECUTE FUNCTION update_merchant_mapping_usage();

-- Function: Track category corrections
CREATE OR REPLACE FUNCTION track_category_correction()
RETURNS TRIGGER AS $$
BEGIN
  -- Only track if category actually changed
  IF OLD.category_id IS DISTINCT FROM NEW.category_id THEN
    INSERT INTO category_corrections (
      user_id,
      transaction_id,
      original_category_id,
      corrected_category_id,
      description,
      amount,
      correction_source
    ) VALUES (
      NEW.user_id,
      NEW.id,
      OLD.category_id,
      NEW.category_id,
      NEW.description,
      NEW.amount,
      'manual_edit'
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add trigger to transactions table (if it exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'transactions') THEN
    DROP TRIGGER IF EXISTS trigger_track_correction ON transactions;
    CREATE TRIGGER trigger_track_correction
      AFTER UPDATE ON transactions
      FOR EACH ROW
      WHEN (OLD.category_id IS DISTINCT FROM NEW.category_id)
      EXECUTE FUNCTION track_category_correction();
  END IF;
END $$;

-- Insert default merchant mappings (common Brazilian merchants)
-- Note: Using English category names as they exist before migration 020
INSERT INTO merchant_category_mapping (merchant_name, category_id, is_global, confidence)
SELECT
  merchant,
  (SELECT id FROM categories WHERE (name = category_name OR name = category_name_pt) AND user_id IS NULL LIMIT 1),
  true,
  0.95
FROM (VALUES
  -- Food & Dining / Alimentação
  ('IFOOD', 'Food & Dining', 'Alimentação'),
  ('RAPPI', 'Food & Dining', 'Alimentação'),
  ('UBER EATS', 'Food & Dining', 'Alimentação'),
  ('MC DONALDS', 'Food & Dining', 'Alimentação'),
  ('MCDONALDS', 'Food & Dining', 'Alimentação'),
  ('BK', 'Food & Dining', 'Alimentação'),
  ('BURGER KING', 'Food & Dining', 'Alimentação'),
  ('PIZZA HUT', 'Food & Dining', 'Alimentação'),
  ('DOMINOS', 'Food & Dining', 'Alimentação'),
  ('SUBWAY', 'Food & Dining', 'Alimentação'),
  ('STARBUCKS', 'Food & Dining', 'Alimentação'),
  ('PADARIA', 'Food & Dining', 'Alimentação'),
  ('RESTAURANTE', 'Food & Dining', 'Alimentação'),
  ('SUPERMERCADO', 'Food & Dining', 'Alimentação'),
  ('MERCADO', 'Food & Dining', 'Alimentação'),
  ('CARREFOUR', 'Food & Dining', 'Alimentação'),
  ('EXTRA', 'Food & Dining', 'Alimentação'),
  ('PAO DE ACUCAR', 'Food & Dining', 'Alimentação'),

  -- Transportation / Transporte
  ('UBER', 'Transportation', 'Transporte'),
  ('99', 'Transportation', 'Transporte'),
  ('CABIFY', 'Transportation', 'Transporte'),
  ('POSTO', 'Transportation', 'Transporte'),
  ('SHELL', 'Transportation', 'Transporte'),
  ('PETROBRAS', 'Transportation', 'Transporte'),
  ('IPIRANGA', 'Transportation', 'Transporte'),
  ('ALE', 'Transportation', 'Transporte'),

  -- Shopping / Compras
  ('AMAZON', 'Shopping', 'Compras'),
  ('MERCADO LIVRE', 'Shopping', 'Compras'),
  ('SHOPEE', 'Shopping', 'Compras'),
  ('MAGAZINE LUIZA', 'Shopping', 'Compras'),
  ('CASAS BAHIA', 'Shopping', 'Compras'),
  ('AMERICANAS', 'Shopping', 'Compras'),
  ('RENNER', 'Shopping', 'Compras'),
  ('RIACHUELO', 'Shopping', 'Compras'),
  ('ZARA', 'Shopping', 'Compras'),
  ('C&A', 'Shopping', 'Compras'),

  -- Entertainment / Entretenimento
  ('NETFLIX', 'Entertainment', 'Entretenimento'),
  ('SPOTIFY', 'Entertainment', 'Entretenimento'),
  ('DISNEY', 'Entertainment', 'Entretenimento'),
  ('HBO', 'Entertainment', 'Entretenimento'),
  ('PRIME VIDEO', 'Entertainment', 'Entretenimento'),
  ('YOUTUBE', 'Entertainment', 'Entretenimento'),
  ('CINEMA', 'Entertainment', 'Entretenimento'),
  ('INGRESSO', 'Entertainment', 'Entretenimento'),

  -- Bills & Utilities / Contas e Utilidades
  ('VIVO', 'Bills & Utilities', 'Contas e Utilidades'),
  ('TIM', 'Bills & Utilities', 'Contas e Utilidades'),
  ('CLARO', 'Bills & Utilities', 'Contas e Utilidades'),
  ('OI', 'Bills & Utilities', 'Contas e Utilidades'),
  ('ENEL', 'Bills & Utilities', 'Contas e Utilidades'),
  ('CEMIG', 'Bills & Utilities', 'Contas e Utilidades'),
  ('COPASA', 'Bills & Utilities', 'Contas e Utilidades'),
  ('SABESP', 'Bills & Utilities', 'Contas e Utilidades'),

  -- Healthcare / Saúde
  ('DROGASIL', 'Healthcare', 'Saúde'),
  ('DROGA RAIA', 'Healthcare', 'Saúde'),
  ('PAGUE MENOS', 'Healthcare', 'Saúde'),
  ('FARMA', 'Healthcare', 'Saúde'),
  ('DROGARIA', 'Healthcare', 'Saúde'),
  ('HOSPITAL', 'Healthcare', 'Saúde'),
  ('CLINICA', 'Healthcare', 'Saúde'),

  -- Education / Educação
  ('UDEMY', 'Education', 'Educação'),
  ('COURSERA', 'Education', 'Educação'),
  ('ESCOLA', 'Education', 'Educação'),
  ('FACULDADE', 'Education', 'Educação'),
  ('UNIVERSIDADE', 'Education', 'Educação'),
  ('LIVRARIA', 'Education', 'Educação')
) AS t(merchant, category_name, category_name_pt)
WHERE EXISTS (SELECT 1 FROM categories WHERE (name = category_name OR name = category_name_pt) AND user_id IS NULL)
ON CONFLICT (merchant_name, user_id) DO NOTHING;

-- Add comments
COMMENT ON TABLE category_synonyms IS 'Alternative names and keywords for categories to improve matching';
COMMENT ON TABLE user_category_preferences IS 'User-specific category preferences learned from transaction patterns';
COMMENT ON TABLE category_corrections IS 'Audit trail of category changes to improve future predictions';
COMMENT ON TABLE merchant_category_mapping IS 'Maps merchant names to categories for faster OCR matching';
