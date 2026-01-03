-- Seed file for local Supabase development
-- Creates a test user with sample data for development/testing

-- ============================================================================
-- SECTION 1: CREATE TEST USER IN AUTH SCHEMA
-- ============================================================================

-- Create a test user with a known UUID for consistent development
-- Email: dev@example.com / Password: password123
INSERT INTO auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'dev@example.com',
  -- Password: password123 (bcrypt hash)
  crypt('password123', gen_salt('bf')),
  NOW(),
  '{"provider": "email", "providers": ["email"]}',
  '{"name": "Dev User"}',
  NOW(),
  NOW(),
  '',
  '',
  '',
  ''
) ON CONFLICT (id) DO NOTHING;

-- Create identity for the user (required for email auth)
INSERT INTO auth.identities (
  id,
  user_id,
  identity_data,
  provider,
  provider_id,
  last_sign_in_at,
  created_at,
  updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  '{"sub": "00000000-0000-0000-0000-000000000001", "email": "dev@example.com"}',
  'email',
  'dev@example.com',
  NOW(),
  NOW(),
  NOW()
) ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- SECTION 2: CREATE USER PROFILE
-- ============================================================================

INSERT INTO user_profiles (
  id,
  user_id,
  display_name,
  created_at,
  updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000001',
  'Dev User',
  NOW(),
  NOW()
) ON CONFLICT (user_id) DO NOTHING;

-- ============================================================================
-- SECTION 3: CREATE PAYMENT METHODS
-- ============================================================================

-- Credit card with Credit Mode enabled
INSERT INTO payment_methods (
  id,
  user_id,
  name,
  type,
  credit_mode,
  statement_closing_day,
  payment_due_day,
  monthly_budget,
  created_at,
  updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000010',
  '00000000-0000-0000-0000-000000000001',
  'Nubank',
  'credit',
  true,
  5,
  10,
  3000.00,
  NOW(),
  NOW()
) ON CONFLICT (user_id, name) DO NOTHING;

-- Credit card in Simple Mode
INSERT INTO payment_methods (
  id,
  user_id,
  name,
  type,
  credit_mode,
  created_at,
  updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000011',
  '00000000-0000-0000-0000-000000000001',
  'Itaú',
  'credit',
  false,
  NOW(),
  NOW()
) ON CONFLICT (user_id, name) DO NOTHING;

-- Debit card
INSERT INTO payment_methods (
  id,
  user_id,
  name,
  type,
  created_at,
  updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000012',
  '00000000-0000-0000-0000-000000000001',
  'Conta Corrente',
  'debit',
  NOW(),
  NOW()
) ON CONFLICT (user_id, name) DO NOTHING;

-- PIX
INSERT INTO payment_methods (
  id,
  user_id,
  name,
  type,
  created_at,
  updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000013',
  '00000000-0000-0000-0000-000000000001',
  'PIX',
  'pix',
  NOW(),
  NOW()
) ON CONFLICT (user_id, name) DO NOTHING;

-- ============================================================================
-- SECTION 4: CREATE SAMPLE TRANSACTIONS
-- ============================================================================

-- Get category IDs for sample transactions
DO $$
DECLARE
  food_category_id UUID;
  transport_category_id UUID;
  shopping_category_id UUID;
  salary_category_id UUID;
BEGIN
  SELECT id INTO food_category_id FROM categories WHERE name = 'Food & Dining' LIMIT 1;
  SELECT id INTO transport_category_id FROM categories WHERE name = 'Transportation' LIMIT 1;
  SELECT id INTO shopping_category_id FROM categories WHERE name = 'Shopping' LIMIT 1;
  SELECT id INTO salary_category_id FROM categories WHERE name = 'Salary' LIMIT 1;

  -- Sample expenses
  INSERT INTO transactions (
    id, user_id, amount, type, category_id, description, date, payment_method_id, user_readable_id
  ) VALUES
    (
      '00000000-0000-0000-0000-000000000100',
      '00000000-0000-0000-0000-000000000001',
      45.90,
      'expense',
      food_category_id,
      'Almoço - Restaurante',
      CURRENT_DATE - INTERVAL '1 day',
      '00000000-0000-0000-0000-000000000010',
      generate_transaction_id()
    ),
    (
      '00000000-0000-0000-0000-000000000101',
      '00000000-0000-0000-0000-000000000001',
      120.00,
      'expense',
      transport_category_id,
      'Uber - Semana',
      CURRENT_DATE - INTERVAL '3 days',
      '00000000-0000-0000-0000-000000000010',
      generate_transaction_id()
    ),
    (
      '00000000-0000-0000-0000-000000000102',
      '00000000-0000-0000-0000-000000000001',
      299.90,
      'expense',
      shopping_category_id,
      'Tênis Nike',
      CURRENT_DATE - INTERVAL '5 days',
      '00000000-0000-0000-0000-000000000010',
      generate_transaction_id()
    ),
    (
      '00000000-0000-0000-0000-000000000103',
      '00000000-0000-0000-0000-000000000001',
      32.50,
      'expense',
      food_category_id,
      'iFood',
      CURRENT_DATE,
      '00000000-0000-0000-0000-000000000013',
      generate_transaction_id()
    )
  ON CONFLICT (id) DO NOTHING;

  -- Sample income
  INSERT INTO transactions (
    id, user_id, amount, type, category_id, description, date, payment_method_id, user_readable_id
  ) VALUES (
    '00000000-0000-0000-0000-000000000104',
    '00000000-0000-0000-0000-000000000001',
    8500.00,
    'income',
    salary_category_id,
    'Salário Dezembro',
    CURRENT_DATE - INTERVAL '10 days',
    '00000000-0000-0000-0000-000000000012',
    generate_transaction_id()
  ) ON CONFLICT (id) DO NOTHING;
END $$;

-- ============================================================================
-- SECTION 5: CREATE SAMPLE INSTALLMENT PLAN
-- ============================================================================

DO $$
DECLARE
  shopping_category_id UUID;
BEGIN
  SELECT id INTO shopping_category_id FROM categories WHERE name = 'Shopping' LIMIT 1;

  -- Create installment plan for a phone purchase
  INSERT INTO installment_plans (
    id,
    user_id,
    description,
    total_amount,
    total_installments,
    status,
    merchant,
    category_id,
    payment_method_id,
    created_at,
    updated_at
  ) VALUES (
    '00000000-0000-0000-0000-000000000200',
    '00000000-0000-0000-0000-000000000001',
    'iPhone 15 Pro',
    4800.00,
    12,
    'active',
    'Apple Store',
    shopping_category_id,
    '00000000-0000-0000-0000-000000000010',
    NOW(),
    NOW()
  ) ON CONFLICT (id) DO NOTHING;

  -- Create installment payments (12 months)
  FOR i IN 1..12 LOOP
    INSERT INTO installment_payments (
      id,
      plan_id,
      installment_number,
      amount,
      due_date,
      status,
      created_at,
      updated_at
    ) VALUES (
      ('00000000-0000-0000-0000-0000000002' || LPAD(i::TEXT, 2, '0'))::UUID,
      '00000000-0000-0000-0000-000000000200',
      i,
      400.00,
      (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month' * (i - 1) + INTERVAL '5 days')::DATE,
      CASE WHEN i = 1 THEN 'paid' ELSE 'pending' END,
      NOW(),
      NOW()
    ) ON CONFLICT (id) DO NOTHING;
  END LOOP;
END $$;

-- ============================================================================
-- SECTION 6: CREATE AUTHORIZED WHATSAPP NUMBER (for WhatsApp bot testing)
-- ============================================================================

INSERT INTO authorized_whatsapp_numbers (
  id,
  user_id,
  whatsapp_number,
  name,
  is_primary,
  permissions,
  created_at,
  updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000300',
  '00000000-0000-0000-0000-000000000001',
  '+5511999999999',
  'Dev Phone',
  true,
  '{"can_view": true, "can_add": true, "can_edit": true, "can_delete": true, "can_manage_budgets": true, "can_view_reports": true}',
  NOW(),
  NOW()
) ON CONFLICT (user_id, whatsapp_number) DO NOTHING;

-- ============================================================================
-- SECTION 7: CREATE FRESH TEST USER (for onboarding testing)
-- ============================================================================
-- This user has ONLY auth + profile data, no payment methods, transactions, etc.
-- Use this account to test the onboarding flow from scratch.

-- Create fresh test user
-- Email: fresh@example.com / Password: password123
INSERT INTO auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token
) VALUES (
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'fresh@example.com',
  -- Password: password123 (bcrypt hash)
  crypt('password123', gen_salt('bf')),
  NOW(),
  '{"provider": "email", "providers": ["email"]}',
  '{"name": "Fresh User"}',
  NOW(),
  NOW(),
  '',
  '',
  '',
  ''
) ON CONFLICT (id) DO NOTHING;

-- Create identity for the fresh user
INSERT INTO auth.identities (
  id,
  user_id,
  identity_data,
  provider,
  provider_id,
  last_sign_in_at,
  created_at,
  updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000002',
  '{"sub": "00000000-0000-0000-0000-000000000002", "email": "fresh@example.com"}',
  'email',
  'fresh@example.com',
  NOW(),
  NOW(),
  NOW()
) ON CONFLICT (id) DO NOTHING;

-- Create minimal profile for fresh user
INSERT INTO user_profiles (
  id,
  user_id,
  display_name,
  created_at,
  updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000002',
  'Fresh User',
  NOW(),
  NOW()
) ON CONFLICT (user_id) DO NOTHING;

-- ============================================================================
-- SEED COMPLETE
--
-- Test User 1 (Full Data):
--   Email: dev@example.com
--   Password: password123
--   User ID: 00000000-0000-0000-0000-000000000001
--   Sample Data Created:
--     - 4 payment methods (Nubank, Itaú, Conta Corrente, PIX)
--     - 5 transactions (4 expenses, 1 income)
--     - 1 installment plan (iPhone 15 Pro - 12x R$400)
--     - 1 authorized WhatsApp number
--
-- Test User 2 (Fresh/Onboarding):
--   Email: fresh@example.com
--   Password: password123
--   User ID: 00000000-0000-0000-0000-000000000002
--   Data: Profile only (no payment methods, transactions, etc.)
--   Use this account to test onboarding flow!
-- ============================================================================
