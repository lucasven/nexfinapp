-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Categories table (predefined + custom)
CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  icon TEXT,
  color TEXT,
  is_custom BOOLEAN DEFAULT false,
  user_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tags table
CREATE TABLE IF NOT EXISTS tags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  user_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(name, user_id)
);

-- Transactions table
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  description TEXT,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_method TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Transaction tags junction table
CREATE TABLE IF NOT EXISTS transaction_tags (
  transaction_id UUID REFERENCES transactions(id) ON DELETE CASCADE,
  tag_id UUID REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (transaction_id, tag_id)
);

-- Budgets table
CREATE TABLE IF NOT EXISTS budgets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  category_id UUID REFERENCES categories(id) ON DELETE CASCADE,
  amount DECIMAL(10, 2) NOT NULL,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  year INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, category_id, month, year)
);

-- Recurring transactions table
CREATE TABLE IF NOT EXISTS recurring_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  description TEXT,
  payment_method TEXT,
  day_of_month INTEGER NOT NULL CHECK (day_of_month >= 1 AND day_of_month <= 31),
  is_active BOOLEAN DEFAULT true,
  last_generated_date DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Recurring transaction payments tracking
CREATE TABLE IF NOT EXISTS recurring_payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  recurring_transaction_id UUID REFERENCES recurring_transactions(id) ON DELETE CASCADE,
  transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
  due_date DATE NOT NULL,
  is_paid BOOLEAN DEFAULT false,
  paid_date DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(recurring_transaction_id, due_date)
);

-- Insert default categories
INSERT INTO categories (name, type, icon, color, is_custom) VALUES
  ('Salary', 'income', '💰', '#10b981', false),
  ('Freelance', 'income', '💼', '#3b82f6', false),
  ('Investments', 'income', '📈', '#8b5cf6', false),
  ('Other Income', 'income', '💵', '#06b6d4', false),
  ('Food & Dining', 'expense', '🍔', '#ef4444', false),
  ('Transportation', 'expense', '🚗', '#f59e0b', false),
  ('Shopping', 'expense', '🛍️', '#ec4899', false),
  ('Entertainment', 'expense', '🎬', '#a855f7', false),
  ('Bills & Utilities', 'expense', '📄', '#6366f1', false),
  ('Healthcare', 'expense', '🏥', '#14b8a6', false),
  ('Education', 'expense', '📚', '#0ea5e9', false),
  ('Rent', 'expense', '🏠', '#f97316', false),
  ('Subscriptions', 'expense', '📱', '#8b5cf6', false),
  ('Other Expense', 'expense', '💸', '#64748b', false)
ON CONFLICT DO NOTHING;

-- Enable Row Level Security
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE recurring_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE recurring_payments ENABLE ROW LEVEL SECURITY;

-- RLS Policies for categories
CREATE POLICY "Users can view all categories" ON categories
  FOR SELECT USING (true);

CREATE POLICY "Users can insert custom categories" ON categories
  FOR INSERT WITH CHECK (is_custom = true AND auth.uid() = user_id);

CREATE POLICY "Users can update their custom categories" ON categories
  FOR UPDATE USING (is_custom = true AND auth.uid() = user_id);

CREATE POLICY "Users can delete their custom categories" ON categories
  FOR DELETE USING (is_custom = true AND auth.uid() = user_id);

-- RLS Policies for tags
CREATE POLICY "Users can view their own tags" ON tags
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own tags" ON tags
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own tags" ON tags
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own tags" ON tags
  FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for transactions
CREATE POLICY "Users can view their own transactions" ON transactions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own transactions" ON transactions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own transactions" ON transactions
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own transactions" ON transactions
  FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for transaction_tags
CREATE POLICY "Users can view their transaction tags" ON transaction_tags
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM transactions 
      WHERE transactions.id = transaction_tags.transaction_id 
      AND transactions.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert their transaction tags" ON transaction_tags
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM transactions 
      WHERE transactions.id = transaction_tags.transaction_id 
      AND transactions.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete their transaction tags" ON transaction_tags
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM transactions 
      WHERE transactions.id = transaction_tags.transaction_id 
      AND transactions.user_id = auth.uid()
    )
  );

-- RLS Policies for budgets
CREATE POLICY "Users can view their own budgets" ON budgets
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own budgets" ON budgets
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own budgets" ON budgets
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own budgets" ON budgets
  FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for recurring_transactions
CREATE POLICY "Users can view their own recurring transactions" ON recurring_transactions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own recurring transactions" ON recurring_transactions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own recurring transactions" ON recurring_transactions
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own recurring transactions" ON recurring_transactions
  FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for recurring_payments
CREATE POLICY "Users can view their recurring payments" ON recurring_payments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM recurring_transactions 
      WHERE recurring_transactions.id = recurring_payments.recurring_transaction_id 
      AND recurring_transactions.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert their recurring payments" ON recurring_payments
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM recurring_transactions 
      WHERE recurring_transactions.id = recurring_payments.recurring_transaction_id 
      AND recurring_transactions.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their recurring payments" ON recurring_payments
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM recurring_transactions 
      WHERE recurring_transactions.id = recurring_payments.recurring_transaction_id 
      AND recurring_transactions.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete their recurring payments" ON recurring_payments
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM recurring_transactions 
      WHERE recurring_transactions.id = recurring_payments.recurring_transaction_id 
      AND recurring_transactions.user_id = auth.uid()
    )
  );

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_category_id ON transactions(category_id);
CREATE INDEX IF NOT EXISTS idx_budgets_user_id ON budgets(user_id);
CREATE INDEX IF NOT EXISTS idx_budgets_month_year ON budgets(month, year);
CREATE INDEX IF NOT EXISTS idx_recurring_transactions_user_id ON recurring_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_recurring_payments_due_date ON recurring_payments(due_date);
