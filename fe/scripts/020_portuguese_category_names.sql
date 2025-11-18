-- Migration: Rename Default Categories to Portuguese
-- Date: 2025-11-17
-- Description: Updates default category names from English to Portuguese for better user experience

-- Store English names as synonyms before renaming
INSERT INTO category_synonyms (category_id, synonym, language, confidence)
SELECT
  id,
  name,
  'en',
  1.00
FROM categories
WHERE user_id IS NULL
ON CONFLICT (category_id, synonym) DO NOTHING;

-- Update expense categories to Portuguese
UPDATE categories
SET name = 'Alimentação'
WHERE name = 'Food & Dining' AND user_id IS NULL;

UPDATE categories
SET name = 'Transporte'
WHERE name = 'Transportation' AND user_id IS NULL;

UPDATE categories
SET name = 'Compras'
WHERE name = 'Shopping' AND user_id IS NULL;

UPDATE categories
SET name = 'Entretenimento'
WHERE name = 'Entertainment' AND user_id IS NULL;

UPDATE categories
SET name = 'Contas e Utilidades'
WHERE name = 'Bills & Utilities' AND user_id IS NULL;

UPDATE categories
SET name = 'Saúde'
WHERE name = 'Healthcare' AND user_id IS NULL;

UPDATE categories
SET name = 'Educação'
WHERE name = 'Education' AND user_id IS NULL;

UPDATE categories
SET name = 'Aluguel'
WHERE name = 'Rent' AND user_id IS NULL;

UPDATE categories
SET name = 'Assinaturas'
WHERE name = 'Subscriptions' AND user_id IS NULL;

UPDATE categories
SET name = 'Outros Gastos'
WHERE name = 'Other Expense' AND user_id IS NULL;

-- Update income categories to Portuguese
UPDATE categories
SET name = 'Salário'
WHERE name = 'Salary' AND user_id IS NULL;

UPDATE categories
SET name = 'Freelance'
WHERE name = 'Freelance' AND user_id IS NULL;

UPDATE categories
SET name = 'Investimentos'
WHERE name = 'Investments' AND user_id IS NULL;

UPDATE categories
SET name = 'Outras Receitas'
WHERE name = 'Other Income' AND user_id IS NULL;

-- Update merchant_category_mapping to use Portuguese names
UPDATE merchant_category_mapping
SET category_id = (SELECT id FROM categories WHERE name = 'Alimentação' AND user_id IS NULL LIMIT 1)
WHERE category_id IN (SELECT id FROM categories WHERE name = 'Food & Dining' AND user_id IS NULL);

UPDATE merchant_category_mapping
SET category_id = (SELECT id FROM categories WHERE name = 'Transporte' AND user_id IS NULL LIMIT 1)
WHERE category_id IN (SELECT id FROM categories WHERE name = 'Transportation' AND user_id IS NULL);

UPDATE merchant_category_mapping
SET category_id = (SELECT id FROM categories WHERE name = 'Compras' AND user_id IS NULL LIMIT 1)
WHERE category_id IN (SELECT id FROM categories WHERE name = 'Shopping' AND user_id IS NULL);

UPDATE merchant_category_mapping
SET category_id = (SELECT id FROM categories WHERE name = 'Entretenimento' AND user_id IS NULL LIMIT 1)
WHERE category_id IN (SELECT id FROM categories WHERE name = 'Entertainment' AND user_id IS NULL);

UPDATE merchant_category_mapping
SET category_id = (SELECT id FROM categories WHERE name = 'Contas e Utilidades' AND user_id IS NULL LIMIT 1)
WHERE category_id IN (SELECT id FROM categories WHERE name = 'Bills & Utilities' AND user_id IS NULL);

UPDATE merchant_category_mapping
SET category_id = (SELECT id FROM categories WHERE name = 'Saúde' AND user_id IS NULL LIMIT 1)
WHERE category_id IN (SELECT id FROM categories WHERE name = 'Healthcare' AND user_id IS NULL);

UPDATE merchant_category_mapping
SET category_id = (SELECT id FROM categories WHERE name = 'Educação' AND user_id IS NULL LIMIT 1)
WHERE category_id IN (SELECT id FROM categories WHERE name = 'Education' AND user_id IS NULL);

-- Add English names as synonyms for backward compatibility
INSERT INTO category_synonyms (category_id, synonym, language, confidence) VALUES
  ((SELECT id FROM categories WHERE name = 'Alimentação' AND user_id IS NULL LIMIT 1), 'Food & Dining', 'en', 1.00),
  ((SELECT id FROM categories WHERE name = 'Alimentação' AND user_id IS NULL LIMIT 1), 'comida', 'pt-BR', 1.00),
  ((SELECT id FROM categories WHERE name = 'Alimentação' AND user_id IS NULL LIMIT 1), 'mercado', 'pt-BR', 0.85),

  ((SELECT id FROM categories WHERE name = 'Transporte' AND user_id IS NULL LIMIT 1), 'Transportation', 'en', 1.00),
  ((SELECT id FROM categories WHERE name = 'Transporte' AND user_id IS NULL LIMIT 1), 'transporte', 'pt-BR', 1.00),

  ((SELECT id FROM categories WHERE name = 'Compras' AND user_id IS NULL LIMIT 1), 'Shopping', 'en', 1.00),
  ((SELECT id FROM categories WHERE name = 'Compras' AND user_id IS NULL LIMIT 1), 'compras', 'pt-BR', 1.00),

  ((SELECT id FROM categories WHERE name = 'Entretenimento' AND user_id IS NULL LIMIT 1), 'Entertainment', 'en', 1.00),
  ((SELECT id FROM categories WHERE name = 'Entretenimento' AND user_id IS NULL LIMIT 1), 'lazer', 'pt-BR', 0.90),

  ((SELECT id FROM categories WHERE name = 'Contas e Utilidades' AND user_id IS NULL LIMIT 1), 'Bills & Utilities', 'en', 1.00),
  ((SELECT id FROM categories WHERE name = 'Contas e Utilidades' AND user_id IS NULL LIMIT 1), 'contas', 'pt-BR', 1.00),

  ((SELECT id FROM categories WHERE name = 'Saúde' AND user_id IS NULL LIMIT 1), 'Healthcare', 'en', 1.00),
  ((SELECT id FROM categories WHERE name = 'Saúde' AND user_id IS NULL LIMIT 1), 'saude', 'pt-BR', 1.00),

  ((SELECT id FROM categories WHERE name = 'Educação' AND user_id IS NULL LIMIT 1), 'Education', 'en', 1.00),
  ((SELECT id FROM categories WHERE name = 'Educação' AND user_id IS NULL LIMIT 1), 'educacao', 'pt-BR', 1.00),

  ((SELECT id FROM categories WHERE name = 'Aluguel' AND user_id IS NULL LIMIT 1), 'Rent', 'en', 1.00),
  ((SELECT id FROM categories WHERE name = 'Aluguel' AND user_id IS NULL LIMIT 1), 'aluguel', 'pt-BR', 1.00),

  ((SELECT id FROM categories WHERE name = 'Assinaturas' AND user_id IS NULL LIMIT 1), 'Subscriptions', 'en', 1.00),
  ((SELECT id FROM categories WHERE name = 'Assinaturas' AND user_id IS NULL LIMIT 1), 'assinatura', 'pt-BR', 1.00),

  ((SELECT id FROM categories WHERE name = 'Outros Gastos' AND user_id IS NULL LIMIT 1), 'Other Expense', 'en', 1.00),
  ((SELECT id FROM categories WHERE name = 'Outros Gastos' AND user_id IS NULL LIMIT 1), 'outros', 'pt-BR', 1.00),

  ((SELECT id FROM categories WHERE name = 'Salário' AND user_id IS NULL LIMIT 1), 'Salary', 'en', 1.00),
  ((SELECT id FROM categories WHERE name = 'Salário' AND user_id IS NULL LIMIT 1), 'salario', 'pt-BR', 1.00),

  ((SELECT id FROM categories WHERE name = 'Investimentos' AND user_id IS NULL LIMIT 1), 'Investments', 'en', 1.00),
  ((SELECT id FROM categories WHERE name = 'Investimentos' AND user_id IS NULL LIMIT 1), 'investimentos', 'pt-BR', 1.00),

  ((SELECT id FROM categories WHERE name = 'Outras Receitas' AND user_id IS NULL LIMIT 1), 'Other Income', 'en', 1.00),
  ((SELECT id FROM categories WHERE name = 'Outras Receitas' AND user_id IS NULL LIMIT 1), 'receita', 'pt-BR', 0.85)
ON CONFLICT (category_id, synonym) DO NOTHING;

-- Add comment
COMMENT ON TABLE categories IS 'Categories are now in Portuguese by default with English synonyms for backward compatibility';
