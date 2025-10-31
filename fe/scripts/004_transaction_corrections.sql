-- Migration: Add user-readable transaction ID and correction support
-- File: scripts/004_transaction_corrections.sql

-- Add user_readable_id field to transactions table
ALTER TABLE transactions 
ADD COLUMN IF NOT EXISTS user_readable_id TEXT;

-- Create index for fast lookup by user_readable_id
CREATE INDEX IF NOT EXISTS idx_transactions_user_readable_id 
ON transactions(user_readable_id);

-- Create index for user + user_readable_id combination
CREATE INDEX IF NOT EXISTS idx_transactions_user_readable 
ON transactions(user_id, user_readable_id);

-- Function to generate user-readable transaction ID
CREATE OR REPLACE FUNCTION generate_transaction_id()
RETURNS TEXT AS $$
DECLARE
    v_id TEXT;
    v_exists BOOLEAN;
BEGIN
    LOOP
        -- Generate a 6-character alphanumeric ID
        v_id := upper(substring(md5(random()::text) from 1 for 6));
        
        -- Check if ID already exists
        SELECT EXISTS(
            SELECT 1 FROM transactions 
            WHERE user_readable_id = v_id
        ) INTO v_exists;
        
        -- If ID doesn't exist, we can use it
        IF NOT v_exists THEN
            EXIT;
        END IF;
    END LOOP;
    
    RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get transaction by user_readable_id and user_id
CREATE OR REPLACE FUNCTION get_transaction_by_id(
    p_user_id UUID,
    p_user_readable_id TEXT
)
RETURNS TABLE (
    id UUID,
    amount DECIMAL,
    type TEXT,
    category_id UUID,
    description TEXT,
    date DATE,
    payment_method TEXT,
    user_readable_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE,
    category_name TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        t.id,
        t.amount,
        t.type,
        t.category_id,
        t.description,
        t.date,
        t.payment_method,
        t.user_readable_id,
        t.created_at,
        c.name as category_name
    FROM transactions t
    LEFT JOIN categories c ON t.category_id = c.id
    WHERE t.user_id = p_user_id 
    AND t.user_readable_id = p_user_readable_id;
END;
$$ LANGUAGE plpgsql;

-- Update existing transactions with user_readable_id (if any exist)
UPDATE transactions 
SET user_readable_id = generate_transaction_id()
WHERE user_readable_id IS NULL;

-- Make user_readable_id NOT NULL after populating existing records
ALTER TABLE transactions 
ALTER COLUMN user_readable_id SET NOT NULL;

-- Add constraint to ensure user_readable_id is unique
ALTER TABLE transactions 
ADD CONSTRAINT unique_user_readable_id UNIQUE (user_readable_id);

-- Create a view for easy transaction lookup with correction info
CREATE OR REPLACE VIEW transaction_corrections AS
SELECT 
    t.id,
    t.user_id,
    t.user_readable_id,
    t.amount,
    t.type,
    t.description,
    t.date,
    t.payment_method,
    t.created_at,
    c.name as category_name,
    c.type as category_type
FROM transactions t
LEFT JOIN categories c ON t.category_id = c.id
WHERE t.user_readable_id IS NOT NULL;

-- Grant permissions
GRANT SELECT ON transaction_corrections TO authenticated;
GRANT EXECUTE ON FUNCTION get_transaction_by_id TO authenticated;
GRANT EXECUTE ON FUNCTION generate_transaction_id TO authenticated;
