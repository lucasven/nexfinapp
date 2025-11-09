-- Migration: Semantic Cache with Embeddings
-- Description: Add pgvector extension and embeddings table for semantic similarity search
-- Date: 2025-01-07

-- Enable pgvector extension for vector operations
CREATE EXTENSION IF NOT EXISTS vector;

-- Create embeddings cache table
CREATE TABLE IF NOT EXISTS message_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL, -- References auth.users (no explicit FK in Supabase pattern)
  message_text TEXT NOT NULL,
  embedding vector(1536), -- OpenAI text-embedding-3-small dimension
  parsed_intent JSONB NOT NULL, -- Stores the ParsedIntent result
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  usage_count INTEGER DEFAULT 1
);

-- Create index for vector similarity search (IVFFlat index for better performance)
-- This index uses cosine distance for similarity
CREATE INDEX IF NOT EXISTS message_embeddings_embedding_idx 
  ON message_embeddings 
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Create index for user lookups
CREATE INDEX IF NOT EXISTS message_embeddings_user_id_idx 
  ON message_embeddings(user_id);

-- Create index for usage tracking
CREATE INDEX IF NOT EXISTS message_embeddings_last_used_idx 
  ON message_embeddings(last_used_at DESC);

-- Function to find similar messages using cosine similarity
CREATE OR REPLACE FUNCTION find_similar_messages(
  p_user_id UUID,
  p_embedding vector(1536),
  p_similarity_threshold FLOAT DEFAULT 0.85,
  p_limit INTEGER DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  message_text TEXT,
  parsed_intent JSONB,
  similarity FLOAT,
  usage_count INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    me.id,
    me.message_text,
    me.parsed_intent,
    1 - (me.embedding <=> p_embedding) AS similarity, -- cosine similarity
    me.usage_count
  FROM message_embeddings me
  WHERE 
    me.user_id = p_user_id
    AND 1 - (me.embedding <=> p_embedding) >= p_similarity_threshold
  ORDER BY me.embedding <=> p_embedding -- cosine distance (smaller is more similar)
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Function to update usage statistics when cache is hit
CREATE OR REPLACE FUNCTION update_embedding_usage(p_embedding_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE message_embeddings
  SET 
    last_used_at = NOW(),
    usage_count = usage_count + 1
  WHERE id = p_embedding_id;
END;
$$ LANGUAGE plpgsql;

-- Enable RLS for security
ALTER TABLE message_embeddings ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS "Users can view their own embeddings" ON message_embeddings;
DROP POLICY IF EXISTS "Users can insert their own embeddings" ON message_embeddings;
DROP POLICY IF EXISTS "Users can update their own embeddings" ON message_embeddings;
DROP POLICY IF EXISTS "Users can delete their own embeddings" ON message_embeddings;

-- RLS Policies for message_embeddings
CREATE POLICY "Users can view their own embeddings" ON message_embeddings
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own embeddings" ON message_embeddings
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own embeddings" ON message_embeddings
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own embeddings" ON message_embeddings
  FOR DELETE USING (auth.uid() = user_id);

-- Add comment for documentation
COMMENT ON TABLE message_embeddings IS 'Stores message embeddings for semantic similarity search and caching';
COMMENT ON COLUMN message_embeddings.embedding IS 'OpenAI text-embedding-3-small vector (1536 dimensions)';
COMMENT ON COLUMN message_embeddings.parsed_intent IS 'Cached ParsedIntent result from LLM';
COMMENT ON FUNCTION find_similar_messages IS 'Find semantically similar messages using cosine similarity';

