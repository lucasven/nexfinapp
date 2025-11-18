-- Migration 024: Data Retention Policy
-- Purpose: Prevent unbounded database growth from analytics data
-- Created: 2025-11-17

-- =====================================================
-- PART 1: Add retention policy columns
-- =====================================================

-- Add retention metadata to parsing_metrics
ALTER TABLE parsing_metrics
ADD COLUMN IF NOT EXISTS archived BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

COMMENT ON COLUMN parsing_metrics.archived IS 'Whether this metric has been archived (soft delete)';
COMMENT ON COLUMN parsing_metrics.archived_at IS 'When this metric was archived';

-- =====================================================
-- PART 2: Create cleanup function for parsing_metrics
-- =====================================================

CREATE OR REPLACE FUNCTION cleanup_old_parsing_metrics(
  retention_days INTEGER DEFAULT 90,
  batch_size INTEGER DEFAULT 1000
) RETURNS TABLE (
  deleted_count INTEGER,
  archived_count INTEGER,
  oldest_date TIMESTAMPTZ
) AS $$
DECLARE
  cutoff_date TIMESTAMPTZ;
  archive_cutoff_date TIMESTAMPTZ;
  rows_deleted INTEGER := 0;
  rows_archived INTEGER := 0;
  oldest_record TIMESTAMPTZ;
BEGIN
  -- Calculate cutoff dates
  cutoff_date := NOW() - (retention_days || ' days')::INTERVAL;
  archive_cutoff_date := NOW() - ((retention_days - 30) || ' days')::INTERVAL; -- Archive 30 days before deletion

  -- Get oldest record date
  SELECT MIN(created_at) INTO oldest_record
  FROM parsing_metrics;

  -- Archive metrics that are approaching deletion (soft delete)
  -- Keep them for 30 more days for potential analysis
  UPDATE parsing_metrics
  SET
    archived = true,
    archived_at = NOW()
  WHERE
    created_at < archive_cutoff_date
    AND archived = false
    AND created_at >= cutoff_date; -- Don't archive what we're about to delete

  GET DIAGNOSTICS rows_archived = ROW_COUNT;

  -- Delete very old metrics (hard delete after retention period)
  -- Strategy: Keep successful transactions forever (they're linked to transactions table)
  -- Delete old failed attempts, permission denials, and errors
  DELETE FROM parsing_metrics
  WHERE id IN (
    SELECT id
    FROM parsing_metrics
    WHERE
      created_at < cutoff_date
      -- Keep metrics linked to transactions (preserve audit trail)
      AND linked_transaction_id IS NULL
      -- Delete failed attempts, errors, permission issues
      AND (
        success = false
        OR permission_granted = false
        OR error_message IS NOT NULL
      )
    LIMIT batch_size
  );

  GET DIAGNOSTICS rows_deleted = ROW_COUNT;

  -- Return summary
  RETURN QUERY SELECT rows_deleted, rows_archived, oldest_record;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_old_parsing_metrics IS
'Clean up old parsing metrics to prevent unbounded growth.
Preserves metrics linked to transactions (audit trail).
Archives metrics 30 days before deletion.
Deletes only unlinked, unsuccessful metrics after retention period.';

-- =====================================================
-- PART 3: Create cleanup function for message_embeddings
-- =====================================================

CREATE OR REPLACE FUNCTION cleanup_old_embeddings(
  retention_days INTEGER DEFAULT 180,
  min_usage_count INTEGER DEFAULT 1,
  batch_size INTEGER DEFAULT 500
) RETURNS INTEGER AS $$
DECLARE
  cutoff_date TIMESTAMPTZ;
  rows_deleted INTEGER := 0;
BEGIN
  cutoff_date := NOW() - (retention_days || ' days')::INTERVAL;

  -- Delete old, rarely-used embeddings to save space
  -- Keep frequently-used embeddings (they're valuable for cache hits)
  DELETE FROM message_embeddings
  WHERE id IN (
    SELECT id
    FROM message_embeddings
    WHERE
      created_at < cutoff_date
      AND usage_count <= min_usage_count
    LIMIT batch_size
  );

  GET DIAGNOSTICS rows_deleted = ROW_COUNT;

  RETURN rows_deleted;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_old_embeddings IS
'Clean up old, rarely-used semantic cache embeddings.
Preserves frequently-used embeddings for better cache hit rates.
Default: Delete embeddings older than 180 days with usage_count <= 1.';

-- =====================================================
-- PART 4: Create cleanup function for AI usage logs
-- =====================================================

CREATE OR REPLACE FUNCTION cleanup_old_ai_usage(
  retention_days INTEGER DEFAULT 365,
  batch_size INTEGER DEFAULT 1000
) RETURNS INTEGER AS $$
DECLARE
  cutoff_date DATE;
  rows_deleted INTEGER := 0;
BEGIN
  cutoff_date := CURRENT_DATE - retention_days;

  -- Delete old daily AI usage records
  -- Keep at least 1 year for billing/analytics
  DELETE FROM user_ai_usage
  WHERE id IN (
    SELECT id
    FROM user_ai_usage
    WHERE usage_date < cutoff_date
    LIMIT batch_size
  );

  GET DIAGNOSTICS rows_deleted = ROW_COUNT;

  RETURN rows_deleted;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_old_ai_usage IS
'Clean up old AI usage records.
Default: Keep 1 year of usage data for billing and analytics.';

-- =====================================================
-- PART 5: Create master cleanup function
-- =====================================================

CREATE OR REPLACE FUNCTION run_data_retention_cleanup()
RETURNS TABLE (
  table_name TEXT,
  records_affected INTEGER,
  operation TEXT,
  execution_time_ms INTEGER
) AS $$
DECLARE
  start_time TIMESTAMPTZ;
  end_time TIMESTAMPTZ;
  metrics_deleted INTEGER;
  metrics_archived INTEGER;
  embeddings_deleted INTEGER;
  ai_usage_deleted INTEGER;
BEGIN
  -- Clean parsing_metrics
  start_time := clock_timestamp();

  SELECT deleted_count, archived_count
  INTO metrics_deleted, metrics_archived
  FROM cleanup_old_parsing_metrics(90, 1000);

  end_time := clock_timestamp();

  RETURN QUERY SELECT
    'parsing_metrics'::TEXT,
    metrics_deleted,
    'deleted'::TEXT,
    EXTRACT(MILLISECONDS FROM (end_time - start_time))::INTEGER;

  RETURN QUERY SELECT
    'parsing_metrics'::TEXT,
    metrics_archived,
    'archived'::TEXT,
    0;

  -- Clean message_embeddings
  start_time := clock_timestamp();
  embeddings_deleted := cleanup_old_embeddings(180, 1, 500);
  end_time := clock_timestamp();

  RETURN QUERY SELECT
    'message_embeddings'::TEXT,
    embeddings_deleted,
    'deleted'::TEXT,
    EXTRACT(MILLISECONDS FROM (end_time - start_time))::INTEGER;

  -- Clean user_ai_usage
  start_time := clock_timestamp();
  ai_usage_deleted := cleanup_old_ai_usage(365, 1000);
  end_time := clock_timestamp();

  RETURN QUERY SELECT
    'user_ai_usage'::TEXT,
    ai_usage_deleted,
    'deleted'::TEXT,
    EXTRACT(MILLISECONDS FROM (end_time - start_time))::INTEGER;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION run_data_retention_cleanup IS
'Master cleanup function that runs all data retention policies.
Should be called periodically (daily or weekly) via cron job.
Returns summary of all cleanup operations.';

-- =====================================================
-- PART 6: Create indexes for efficient cleanup
-- =====================================================

-- Index for parsing_metrics cleanup queries
CREATE INDEX IF NOT EXISTS idx_parsing_metrics_cleanup
ON parsing_metrics (created_at, success, linked_transaction_id, archived)
WHERE linked_transaction_id IS NULL;

COMMENT ON INDEX idx_parsing_metrics_cleanup IS
'Optimizes cleanup queries by indexing on cleanup criteria';

-- Index for embeddings cleanup
CREATE INDEX IF NOT EXISTS idx_embeddings_cleanup
ON message_embeddings (created_at, usage_count);

COMMENT ON INDEX idx_embeddings_cleanup IS
'Optimizes semantic cache cleanup queries';

-- Index for AI usage cleanup
CREATE INDEX IF NOT EXISTS idx_ai_usage_cleanup
ON user_ai_usage (usage_date);

COMMENT ON INDEX idx_ai_usage_cleanup IS
'Optimizes AI usage cleanup queries';

-- =====================================================
-- PART 7: Create admin view for retention monitoring
-- =====================================================

CREATE OR REPLACE VIEW data_retention_stats AS
SELECT
  'parsing_metrics' AS table_name,
  COUNT(*) AS total_records,
  COUNT(*) FILTER (WHERE archived = true) AS archived_records,
  COUNT(*) FILTER (WHERE linked_transaction_id IS NOT NULL) AS linked_records,
  COUNT(*) FILTER (WHERE success = false AND linked_transaction_id IS NULL) AS deletable_records,
  MIN(created_at) AS oldest_record,
  MAX(created_at) AS newest_record,
  pg_size_pretty(pg_total_relation_size('parsing_metrics')) AS table_size
FROM parsing_metrics

UNION ALL

SELECT
  'message_embeddings' AS table_name,
  COUNT(*) AS total_records,
  0 AS archived_records,
  0 AS linked_records,
  COUNT(*) FILTER (WHERE created_at < NOW() - INTERVAL '180 days' AND usage_count <= 1) AS deletable_records,
  MIN(created_at) AS oldest_record,
  MAX(created_at) AS newest_record,
  pg_size_pretty(pg_total_relation_size('message_embeddings')) AS table_size
FROM message_embeddings

UNION ALL

SELECT
  'user_ai_usage' AS table_name,
  COUNT(*) AS total_records,
  0 AS archived_records,
  0 AS linked_records,
  COUNT(*) FILTER (WHERE usage_date < CURRENT_DATE - 365) AS deletable_records,
  MIN(usage_date::TIMESTAMPTZ) AS oldest_record,
  MAX(usage_date::TIMESTAMPTZ) AS newest_record,
  pg_size_pretty(pg_total_relation_size('user_ai_usage')) AS table_size
FROM user_ai_usage;

COMMENT ON VIEW data_retention_stats IS
'Monitor data retention policy effectiveness and database growth.
Shows total records, deletable records, and table sizes.';

-- =====================================================
-- PART 8: Grant permissions
-- =====================================================

-- Grant execute permissions to service role (for automated cleanup)
GRANT EXECUTE ON FUNCTION cleanup_old_parsing_metrics TO service_role;
GRANT EXECUTE ON FUNCTION cleanup_old_embeddings TO service_role;
GRANT EXECUTE ON FUNCTION cleanup_old_ai_usage TO service_role;
GRANT EXECUTE ON FUNCTION run_data_retention_cleanup TO service_role;

-- Grant view permissions to authenticated users with RLS
GRANT SELECT ON data_retention_stats TO authenticated;

-- =====================================================
-- USAGE EXAMPLES
-- =====================================================

/*
-- Run manual cleanup (can be called from admin panel or cron)
SELECT * FROM run_data_retention_cleanup();

-- Check retention stats before cleanup
SELECT * FROM data_retention_stats;

-- Run individual cleanup with custom parameters
SELECT * FROM cleanup_old_parsing_metrics(retention_days := 60, batch_size := 500);
SELECT * FROM cleanup_old_embeddings(retention_days := 120, min_usage_count := 2);
SELECT * FROM cleanup_old_ai_usage(retention_days := 180);

-- Check what would be deleted (dry run)
SELECT COUNT(*) AS would_delete
FROM parsing_metrics
WHERE
  created_at < NOW() - INTERVAL '90 days'
  AND linked_transaction_id IS NULL
  AND (success = false OR permission_granted = false OR error_message IS NOT NULL);
*/
