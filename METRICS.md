# Parsing Metrics Guide

This document explains how to use the parsing metrics system to monitor and improve the WhatsApp bot's message understanding capabilities.

## Overview

The parsing metrics system tracks every message processed by the bot, recording which parsing strategy was used, whether it succeeded, and performance data. This information helps identify:

- Which parsing strategies are most effective
- Where users encounter difficulties
- Performance bottlenecks
- Permission issues

## Database Schema

### Table: `parsing_metrics`

```sql
CREATE TABLE parsing_metrics (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  whatsapp_number TEXT NOT NULL,
  
  -- Message info
  message_text TEXT NOT NULL,
  message_type TEXT NOT NULL,  -- 'text', 'image', 'command'
  
  -- Parsing strategy
  strategy_used TEXT NOT NULL,  -- See strategies below
  
  -- Results
  intent_action TEXT,
  confidence FLOAT,
  success BOOLEAN NOT NULL,
  error_message TEXT,
  
  -- Performance
  parse_duration_ms INTEGER,
  execution_duration_ms INTEGER,
  
  -- Permissions
  permission_required TEXT,
  permission_granted BOOLEAN,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### Parsing Strategies

| Strategy | Description | Priority |
|----------|-------------|----------|
| `correction_state` | User is correcting a previous AI result | 1 (Highest) |
| `duplicate_confirmation` | Waiting for duplicate transaction confirmation | 2 |
| `correction_intent` | Detected transaction correction request | 3 |
| `explicit_command` | Message starts with `/` (e.g., `/add 50 food`) | 4 |
| `learned_pattern` | Matched a previously learned user pattern | 5 |
| `local_nlp` | Natural language processing (confidence >= 0.8) | 6 |
| `ai_pattern` | OpenAI-based parsing (fallback) | 7 |
| `unknown` | No strategy could parse the message | 8 (Last resort) |

## API Functions

### Recording Metrics

```typescript
import { recordParsingMetric } from '../services/metrics-tracker'

await recordParsingMetric({
  userId: 'user-123',
  whatsappNumber: '5511999999999',
  messageText: 'gastei 50 reais em comida',
  messageType: 'text',
  strategyUsed: 'local_nlp',
  intentAction: 'add_expense',
  confidence: 0.85,
  success: true,
  parseDurationMs: 45,
  executionDurationMs: 120,
  permissionRequired: 'add',
  permissionGranted: true
})
```

### Querying Metrics

#### Get Strategy Success Rate

```typescript
import { getStrategySuccessRate } from '../services/metrics-tracker'

// All strategies for all users
const overallRate = await getStrategySuccessRate()

// Specific strategy
const localNlpRate = await getStrategySuccessRate('local_nlp')

// For specific user
const userRate = await getStrategySuccessRate('local_nlp', 'user-123')
```

#### Get Average Parse Time

```typescript
import { getAverageParseTime } from '../services/metrics-tracker'

// All strategies
const avgTime = await getAverageParseTime()

// Specific strategy
const aiTime = await getAverageParseTime('ai_pattern')
```

#### Get Comprehensive Statistics

```typescript
import { getStrategyStatistics } from '../services/metrics-tracker'

// All users, all time
const stats = await getStrategyStatistics()

// Specific user
const userStats = await getStrategyStatistics('user-123')

// Date range
const monthStats = await getStrategyStatistics(
  undefined,
  new Date('2024-01-01'),
  new Date('2024-01-31')
)

// Returns:
// [
//   {
//     strategy: 'local_nlp',
//     totalCount: 1250,
//     successCount: 1100,
//     failureCount: 150,
//     successRate: 0.88,
//     avgParseDuration: 42,
//     avgExecutionDuration: 95
//   },
//   ...
// ]
```

#### Get Recent Failures

```typescript
import { getRecentFailures } from '../services/metrics-tracker'

// Last 10 failures
const failures = await getRecentFailures()

// Last 20 failures for specific user
const userFailures = await getRecentFailures(20, 'user-123')
```

## SQL Queries for Analysis

### Strategy Usage Distribution

```sql
SELECT 
  strategy_used,
  COUNT(*) as count,
  COUNT(*) * 100.0 / SUM(COUNT(*)) OVER () as percentage
FROM parsing_metrics
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY strategy_used
ORDER BY count DESC;
```

### Success Rate by Strategy

```sql
SELECT 
  strategy_used,
  COUNT(*) as total_attempts,
  SUM(CASE WHEN success THEN 1 ELSE 0 END) as successful,
  ROUND(
    SUM(CASE WHEN success THEN 1 ELSE 0 END)::numeric / 
    COUNT(*)::numeric * 100, 
    2
  ) as success_rate_pct
FROM parsing_metrics
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY strategy_used
ORDER BY success_rate_pct DESC;
```

### Performance by Strategy

```sql
SELECT 
  strategy_used,
  COUNT(*) as samples,
  ROUND(AVG(parse_duration_ms)) as avg_parse_ms,
  ROUND(AVG(execution_duration_ms)) as avg_exec_ms,
  ROUND(AVG(parse_duration_ms + execution_duration_ms)) as avg_total_ms,
  MAX(parse_duration_ms + execution_duration_ms) as max_total_ms
FROM parsing_metrics
WHERE 
  created_at >= NOW() - INTERVAL '30 days'
  AND parse_duration_ms IS NOT NULL
  AND execution_duration_ms IS NOT NULL
GROUP BY strategy_used
ORDER BY avg_total_ms DESC;
```

### Failed Messages Analysis

```sql
SELECT 
  strategy_used,
  message_text,
  error_message,
  created_at
FROM parsing_metrics
WHERE 
  success = FALSE
  AND created_at >= NOW() - INTERVAL '7 days'
ORDER BY created_at DESC
LIMIT 50;
```

### Permission Denials

```sql
SELECT 
  permission_required,
  whatsapp_number,
  COUNT(*) as denial_count
FROM parsing_metrics
WHERE 
  permission_granted = FALSE
  AND created_at >= NOW() - INTERVAL '30 days'
GROUP BY permission_required, whatsapp_number
ORDER BY denial_count DESC;
```

### User Activity Patterns

```sql
SELECT 
  DATE_TRUNC('hour', created_at) as hour,
  COUNT(*) as message_count,
  SUM(CASE WHEN success THEN 1 ELSE 0 END) as successful_count
FROM parsing_metrics
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY hour
ORDER BY hour DESC;
```

### AI vs Local NLP Comparison

```sql
SELECT 
  strategy_used,
  COUNT(*) as total,
  ROUND(AVG(confidence)::numeric, 3) as avg_confidence,
  ROUND(AVG(parse_duration_ms)) as avg_parse_time,
  ROUND(
    SUM(CASE WHEN success THEN 1 ELSE 0 END)::numeric / 
    COUNT(*)::numeric * 100, 
    2
  ) as success_rate
FROM parsing_metrics
WHERE strategy_used IN ('local_nlp', 'ai_pattern')
  AND created_at >= NOW() - INTERVAL '30 days'
GROUP BY strategy_used;
```

### Messages Requiring Multiple Attempts

```sql
SELECT 
  whatsapp_number,
  message_text,
  COUNT(*) as attempt_count,
  ARRAY_AGG(strategy_used ORDER BY created_at) as strategies_tried,
  MAX(CASE WHEN success THEN strategy_used END) as successful_strategy
FROM parsing_metrics
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY whatsapp_number, message_text
HAVING COUNT(*) > 1
ORDER BY attempt_count DESC;
```

## Monitoring Dashboard Queries

### Real-time Success Rate

```sql
SELECT 
  DATE_TRUNC('minute', created_at) as minute,
  SUM(CASE WHEN success THEN 1 ELSE 0 END)::float / COUNT(*) as success_rate
FROM parsing_metrics
WHERE created_at >= NOW() - INTERVAL '1 hour'
GROUP BY minute
ORDER BY minute;
```

### Top Failed Message Patterns

```sql
WITH message_patterns AS (
  SELECT 
    -- Normalize message for pattern detection
    REGEXP_REPLACE(message_text, '[0-9]+', 'NUM', 'g') as pattern,
    COUNT(*) as failure_count
  FROM parsing_metrics
  WHERE 
    success = FALSE
    AND created_at >= NOW() - INTERVAL '7 days'
  GROUP BY pattern
)
SELECT 
  pattern,
  failure_count
FROM message_patterns
WHERE failure_count > 2
ORDER BY failure_count DESC
LIMIT 20;
```

## Optimization Tips

### Index Performance

The migration includes these indexes:
- `idx_parsing_metrics_user` - User-specific queries
- `idx_parsing_metrics_strategy` - Strategy analysis
- `idx_parsing_metrics_created` - Time-based queries
- `idx_parsing_metrics_whatsapp` - WhatsApp number lookups
- `idx_parsing_metrics_action` - Intent action analysis

### Query Optimization

1. **Always use date ranges** - Prevents full table scans
   ```sql
   WHERE created_at >= NOW() - INTERVAL '30 days'
   ```

2. **Use specific strategies** - More efficient than scanning all
   ```sql
   WHERE strategy_used IN ('local_nlp', 'ai_pattern')
   ```

3. **Limit results** - Especially for debugging queries
   ```sql
   LIMIT 100
   ```

### Data Retention

Consider implementing data retention policies:

```sql
-- Archive old metrics (older than 90 days)
CREATE TABLE parsing_metrics_archive (LIKE parsing_metrics INCLUDING ALL);

INSERT INTO parsing_metrics_archive
SELECT * FROM parsing_metrics
WHERE created_at < NOW() - INTERVAL '90 days';

DELETE FROM parsing_metrics
WHERE created_at < NOW() - INTERVAL '90 days';
```

## Alerting

### Setup Alerts for:

1. **Low Success Rate**
   ```sql
   -- Alert if success rate drops below 80% in last hour
   SELECT 
     SUM(CASE WHEN success THEN 1 ELSE 0 END)::float / COUNT(*) as rate
   FROM parsing_metrics
   WHERE created_at >= NOW() - INTERVAL '1 hour'
   HAVING rate < 0.8;
   ```

2. **High AI Usage**
   ```sql
   -- Alert if AI usage exceeds 30%
   SELECT 
     COUNT(*) FILTER (WHERE strategy_used = 'ai_pattern')::float / 
     COUNT(*) as ai_rate
   FROM parsing_metrics
   WHERE created_at >= NOW() - INTERVAL '1 hour'
   HAVING ai_rate > 0.3;
   ```

3. **Slow Performance**
   ```sql
   -- Alert if average response time exceeds 500ms
   SELECT AVG(parse_duration_ms + execution_duration_ms) as avg_time
   FROM parsing_metrics
   WHERE created_at >= NOW() - INTERVAL '5 minutes'
   HAVING avg_time > 500;
   ```

4. **Permission Denials Spike**
   ```sql
   -- Alert if permission denials increase significantly
   SELECT COUNT(*) as denials
   FROM parsing_metrics
   WHERE 
     created_at >= NOW() - INTERVAL '1 hour'
     AND permission_granted = FALSE
   HAVING denials > 10;
   ```

## Best Practices

1. **Always record metrics** - Even for failures
2. **Include context** - User ID, message text, error messages
3. **Track timing** - Both parsing and execution
4. **Monitor trends** - Use time-series analysis
5. **Act on insights** - Use data to improve parsing strategies

## Example Analysis Workflow

### 1. Identify Problem

```sql
-- Find strategies with lowest success rates
SELECT strategy_used, 
       ROUND(AVG(CASE WHEN success THEN 1.0 ELSE 0.0 END) * 100, 2) as success_rate
FROM parsing_metrics
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY strategy_used
ORDER BY success_rate ASC;
```

### 2. Investigate Failures

```sql
-- Get sample of failures for worst-performing strategy
SELECT message_text, error_message, confidence
FROM parsing_metrics
WHERE strategy_used = 'local_nlp'
  AND success = FALSE
  AND created_at >= NOW() - INTERVAL '7 days'
LIMIT 20;
```

### 3. Test Improvements

After making changes to the parsing strategy:

```sql
-- Compare before and after
SELECT 
  DATE(created_at) as date,
  AVG(CASE WHEN success THEN 1.0 ELSE 0.0 END) as success_rate
FROM parsing_metrics
WHERE strategy_used = 'local_nlp'
  AND created_at >= NOW() - INTERVAL '14 days'
GROUP BY date
ORDER BY date;
```

### 4. Monitor Impact

Track key metrics after deployment:
- Success rate trend
- Parse time distribution
- User feedback

## Troubleshooting

### High AI Usage

**Symptom**: Too many messages fall back to AI parsing
**Investigation**:
```sql
SELECT message_text, confidence
FROM parsing_metrics
WHERE strategy_used = 'ai_pattern'
LIMIT 50;
```
**Solution**: Improve local NLP patterns or add more learned patterns

### Slow Performance

**Symptom**: High parse/execution times
**Investigation**:
```sql
SELECT strategy_used, 
       MAX(parse_duration_ms + execution_duration_ms) as max_time,
       message_text
FROM parsing_metrics
WHERE created_at >= NOW() - INTERVAL '1 day'
GROUP BY strategy_used, message_text
ORDER BY max_time DESC
LIMIT 10;
```
**Solution**: Optimize slow strategies or add caching

### Low Success Rate

**Symptom**: Many failed parsing attempts
**Investigation**: See Example Analysis Workflow above
**Solution**: Improve patterns, add training data, refine AI prompts

## Resources

- Database schema: `fe/scripts/006_parsing_metrics.sql`
- Metrics tracker service: `whatsapp-bot/src/services/metrics-tracker.ts`
- Integration: `whatsapp-bot/src/handlers/message-handler.ts`

## Questions?

For questions about the metrics system, please contact the development team or create an issue in the project repository.


