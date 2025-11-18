-- Enhanced Intent Tracking Migration
-- Adds comprehensive tracking for intent classification accuracy and command execution

-- ============================================
-- 1. Enhance parsing_metrics table
-- ============================================

-- Add columns to track extracted entities and execution results
ALTER TABLE parsing_metrics ADD COLUMN IF NOT EXISTS intent_entities JSONB;
ALTER TABLE parsing_metrics ADD COLUMN IF NOT EXISTS execution_result JSONB;
ALTER TABLE parsing_metrics ADD COLUMN IF NOT EXISTS cache_hit BOOLEAN DEFAULT false;
ALTER TABLE parsing_metrics ADD COLUMN IF NOT EXISTS cache_similarity FLOAT;
ALTER TABLE parsing_metrics ADD COLUMN IF NOT EXISTS linked_transaction_id UUID;

-- Add comment explaining the new columns
COMMENT ON COLUMN parsing_metrics.intent_entities IS 'Extracted entities from user message: {amount, category, date, paymentMethod, description, etc}';
COMMENT ON COLUMN parsing_metrics.execution_result IS 'Result of executing the intent: {transactionId, budgetId, success, errorDetails, etc}';
COMMENT ON COLUMN parsing_metrics.cache_hit IS 'True if semantic cache was used for this parsing';
COMMENT ON COLUMN parsing_metrics.cache_similarity IS 'Cosine similarity score if cache was used';
COMMENT ON COLUMN parsing_metrics.linked_transaction_id IS 'Direct link to transaction created by this parsing';

-- Add index for linking queries
CREATE INDEX IF NOT EXISTS idx_parsing_metrics_transaction
  ON parsing_metrics(linked_transaction_id)
  WHERE linked_transaction_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_parsing_metrics_cache_hit
  ON parsing_metrics(cache_hit)
  WHERE cache_hit = true;

-- ============================================
-- 2. Link transactions to their parsing metrics
-- ============================================

-- Add column to transactions to track which parsing created them
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS parsing_metric_id UUID;

-- Add foreign key constraint
ALTER TABLE transactions
  ADD CONSTRAINT fk_transactions_parsing_metric
  FOREIGN KEY (parsing_metric_id)
  REFERENCES parsing_metrics(id)
  ON DELETE SET NULL;

-- Add index for reverse lookup
CREATE INDEX IF NOT EXISTS idx_transactions_parsing_metric
  ON transactions(parsing_metric_id)
  WHERE parsing_metric_id IS NOT NULL;

COMMENT ON COLUMN transactions.parsing_metric_id IS 'Links to the parsing_metrics entry that created this transaction';

-- ============================================
-- 3. Create intent misclassifications table
-- ============================================

CREATE TABLE IF NOT EXISTS intent_misclassifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Original parsing that was incorrect
  original_parsing_id UUID REFERENCES parsing_metrics(id) ON DELETE CASCADE,
  original_intent TEXT NOT NULL,
  original_entities JSONB,
  original_message TEXT NOT NULL,

  -- Corrected/actual intent (if known)
  corrected_intent TEXT,
  corrected_entities JSONB,
  correction_method TEXT, -- 'user_correction', 'retry_success', 'manual_review', 'duplicate_rejection'

  -- Context
  correction_message TEXT, -- User's follow-up message if they corrected
  time_to_correction_seconds INTEGER, -- How long until user corrected

  -- Metadata
  severity TEXT DEFAULT 'medium', -- 'low', 'medium', 'high', 'critical'
  notes TEXT, -- Admin notes
  resolved BOOLEAN DEFAULT false,
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for analysis
CREATE INDEX idx_intent_misclass_user ON intent_misclassifications(user_id);
CREATE INDEX idx_intent_misclass_original_intent ON intent_misclassifications(original_intent);
CREATE INDEX idx_intent_misclass_corrected_intent ON intent_misclassifications(corrected_intent);
CREATE INDEX idx_intent_misclass_unresolved ON intent_misclassifications(resolved) WHERE resolved = false;
CREATE INDEX idx_intent_misclass_created ON intent_misclassifications(created_at DESC);

COMMENT ON TABLE intent_misclassifications IS 'Tracks when user intents are misclassified and how they were corrected';

-- ============================================
-- 4. Enable RLS for intent_misclassifications
-- ============================================

ALTER TABLE intent_misclassifications ENABLE ROW LEVEL SECURITY;

-- Users can view their own misclassifications
CREATE POLICY "Users can view own misclassifications"
  ON intent_misclassifications
  FOR SELECT
  USING (auth.uid() = user_id);

-- Service role can manage all
CREATE POLICY "Service role can manage misclassifications"
  ON intent_misclassifications
  FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');

-- ============================================
-- 5. Create intent accuracy analytics view
-- ============================================

CREATE OR REPLACE VIEW intent_accuracy_stats AS
SELECT
  pm.intent_action,
  COUNT(*) as total_attempts,
  COUNT(*) FILTER (WHERE pm.success = true) as successful,
  COUNT(*) FILTER (WHERE pm.success = false) as failed,
  ROUND(
    COUNT(*) FILTER (WHERE pm.success = true)::NUMERIC /
    NULLIF(COUNT(*), 0) * 100,
    2
  ) as success_rate,
  AVG(pm.confidence) as avg_confidence,
  COUNT(DISTINCT pm.user_id) as unique_users,
  COUNT(*) FILTER (WHERE pm.cache_hit = true) as cache_hits,
  COUNT(im.id) as misclassification_count,
  ROUND(
    AVG(pm.parse_duration_ms)::NUMERIC,
    0
  ) as avg_parse_time_ms
FROM parsing_metrics pm
LEFT JOIN intent_misclassifications im ON pm.id = im.original_parsing_id
WHERE pm.intent_action IS NOT NULL
GROUP BY pm.intent_action
ORDER BY total_attempts DESC;

COMMENT ON VIEW intent_accuracy_stats IS 'Aggregated statistics for intent classification accuracy by action type';

-- ============================================
-- 6. Create entity extraction accuracy view
-- ============================================

CREATE OR REPLACE VIEW entity_extraction_stats AS
SELECT
  pm.intent_action,
  jsonb_object_keys(pm.intent_entities) as entity_type,
  COUNT(*) as total_extractions,
  COUNT(*) FILTER (
    WHERE pm.execution_result->>'success' = 'true'
  ) as successful_executions,
  COUNT(im.id) as corrections_needed,
  ROUND(
    AVG(pm.confidence)::NUMERIC,
    2
  ) as avg_confidence
FROM parsing_metrics pm
LEFT JOIN intent_misclassifications im ON pm.id = im.original_parsing_id
WHERE pm.intent_entities IS NOT NULL
  AND pm.intent_action IS NOT NULL
GROUP BY pm.intent_action, jsonb_object_keys(pm.intent_entities)
ORDER BY total_extractions DESC;

COMMENT ON VIEW entity_extraction_stats IS 'Statistics on entity extraction accuracy by intent and entity type';

-- ============================================
-- 7. Grant permissions
-- ============================================

-- Grant access to authenticated users for views
GRANT SELECT ON intent_accuracy_stats TO authenticated;
GRANT SELECT ON entity_extraction_stats TO authenticated;

-- Grant access to service role for all operations
GRANT ALL ON intent_misclassifications TO service_role;
GRANT ALL ON parsing_metrics TO service_role;
GRANT ALL ON transactions TO service_role;
