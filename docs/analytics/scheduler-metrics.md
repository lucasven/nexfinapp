# Engagement Preferences Analytics - Scheduler Metrics

This document provides guidance on extracting and analyzing opt-out metrics from scheduler job logs.

## Overview

The engagement system includes two scheduled jobs that respect user opt-out preferences:

1. **Daily Engagement Job** (`whatsapp-bot/src/services/scheduler/daily-engagement-job.ts`)
   - Sends "goodbye" messages to users entering dormant state
   - Filters out users who have opted out (`reengagement_opt_out = true`)

2. **Weekly Review Job** (`whatsapp-bot/src/services/scheduler/weekly-review-job.ts`)
   - Sends weekly activity summaries to active users
   - Filters out users who have opted out

These jobs log metrics about users filtered due to opt-out, providing insights into the opt-out system's effectiveness.

## Log Format

### Structured JSON Logs

Both scheduler jobs output structured JSON logs in this format:

```json
{
  "timestamp": "2025-11-24T10:00:00.000Z",
  "level": "info",
  "job": "daily-engagement-job",
  "message": "Daily engagement job completed",
  "total_eligible_users": 150,
  "opted_out_users_skipped": 23,
  "messages_queued": 127,
  "opt_out_filter_rate": 15.33,
  "duration_ms": 1250,
  "succeeded": 127,
  "failed": 0
}
```

### Log Fields

| Field | Type | Description |
|-------|------|-------------|
| `timestamp` | ISO 8601 string | When the job completed |
| `level` | string | Log level (`info`, `warn`, `error`) |
| `job` | string | Job name (`daily-engagement-job`, `weekly-review-job`) |
| `message` | string | Human-readable log message |
| `total_eligible_users` | number | Total users meeting criteria (before opt-out filter) |
| `opted_out_users_skipped` | number | Users filtered out due to opt-out |
| `messages_queued` | number | Actual messages queued (after opt-out filter) |
| `opt_out_filter_rate` | number | Percentage of users filtered: `(opted_out / total_eligible) * 100` |
| `duration_ms` | number | Job execution time in milliseconds |
| `succeeded` | number | Messages successfully queued |
| `failed` | number | Messages that failed to queue |

### Example Logs

**Daily Engagement Job (Healthy State)**:
```json
{
  "timestamp": "2025-11-24T10:00:00Z",
  "level": "info",
  "job": "daily-engagement-job",
  "message": "Daily engagement job completed",
  "total_eligible_users": 50,
  "opted_out_users_skipped": 5,
  "messages_queued": 45,
  "opt_out_filter_rate": 10.0,
  "duration_ms": 850,
  "succeeded": 45,
  "failed": 0
}
```

**Weekly Review Job (High Opt-Out Rate)**:
```json
{
  "timestamp": "2025-11-24T18:00:00Z",
  "level": "warn",
  "job": "weekly-review-job",
  "message": "Weekly review job completed - high opt-out rate detected",
  "total_eligible_users": 200,
  "opted_out_users_skipped": 45,
  "messages_queued": 155,
  "opt_out_filter_rate": 22.5,
  "duration_ms": 2100,
  "succeeded": 155,
  "failed": 0
}
```

## Key Metrics to Track

### 1. Opt-Out Filter Rate

**Calculation**: `(opted_out_users_skipped / total_eligible_users) * 100`

**Expected Values**:
- < 10%: Healthy (most users engaged)
- 10-20%: Warning (monitor for trends)
- > 20%: Critical (investigate messaging issues)

**Interpretation**:
- Should correlate with database opt-out rate
- Sudden spikes indicate recent messaging problems
- Gradual increase may indicate engagement fatigue

### 2. Users Skipped per Day

**Calculation**: `opted_out_users_skipped` from daily logs

**Use Case**: Track daily volume of users opting out

**Query Pattern**:
```bash
# Extract opted_out_users_skipped from last 7 days
railway logs --service whatsapp-bot --tail 1000 | \
  grep "daily-engagement-job" | \
  jq '.opted_out_users_skipped'
```

### 3. Eligible vs Queued Ratio

**Calculation**: `messages_queued / total_eligible_users`

**Expected Value**: ~90% (if opt-out rate is 10%)

**Use Case**: Verify opt-out filter is working correctly

**Validation**:
```
messages_queued + opted_out_users_skipped = total_eligible_users
```

If this doesn't match, investigate double-counting or filter bugs.

## Accessing Logs

### Railway (Production)

**Web UI**:
1. Navigate to: `https://railway.app/project/{project-id}/service/{service-id}/logs`
2. Filter logs by searching: `daily-engagement-job` or `weekly-review-job`
3. Set time range to desired period
4. Export logs if needed

**Railway CLI**:
```bash
# Install Railway CLI
npm i -g @railway/cli

# Login
railway login

# Tail logs in real-time
railway logs --service whatsapp-bot --tail

# Get recent logs
railway logs --service whatsapp-bot --tail 500

# Filter for specific job
railway logs --service whatsapp-bot --tail 1000 | grep "daily-engagement-job"

# Extract JSON fields
railway logs --service whatsapp-bot --tail 100 | jq '. | select(.job == "daily-engagement-job")'
```

### CloudWatch (AWS Deployments)

If deployed to AWS Lambda/ECS:

**Web Console**:
1. Navigate to CloudWatch → Log Groups
2. Select log group: `/aws/lambda/whatsapp-bot` or `/ecs/whatsapp-bot`
3. Use CloudWatch Insights for querying

**CloudWatch Insights Query**:
```
fields @timestamp, job, total_eligible_users, opted_out_users_skipped, opt_out_filter_rate
| filter job = "daily-engagement-job"
| sort @timestamp desc
| limit 100
```

### Local Development

**Console Output**:
```bash
# Run scheduler job locally
cd whatsapp-bot
npm run dev

# Logs output to console in JSON format
```

**Log Files** (if configured):
```bash
# Tail log file
tail -f whatsapp-bot/logs/scheduler.log | jq
```

## Log Parsing Examples

### Extract Opt-Out Metrics with grep + jq

**Last 7 days of daily job opt-out rates**:
```bash
railway logs --service whatsapp-bot --tail 1000 | \
  grep "daily-engagement-job" | \
  jq -r '[.timestamp, .opt_out_filter_rate] | @csv'
```

**Output**:
```
"2025-11-24T10:00:00Z",10.0
"2025-11-23T10:00:00Z",9.5
"2025-11-22T10:00:00Z",12.3
```

**Average opt-out filter rate (last 30 days)**:
```bash
railway logs --service whatsapp-bot --tail 3000 | \
  grep "daily-engagement-job" | \
  jq -s 'map(.opt_out_filter_rate) | add / length'
```

**Output**: `10.47` (average opt-out filter rate)

### Detect Spikes with awk

**Alert if opt-out rate > 20%**:
```bash
railway logs --service whatsapp-bot --tail 100 | \
  grep "daily-engagement-job" | \
  jq -r 'select(.opt_out_filter_rate > 20) | "ALERT: \(.timestamp) - Opt-out rate: \(.opt_out_filter_rate)%"'
```

**Output**:
```
ALERT: 2025-11-24T10:00:00Z - Opt-out rate: 22.5%
```

### Track Trend Over Time

**Daily opt-out counts for last 14 days**:
```bash
railway logs --service whatsapp-bot --tail 2000 | \
  grep "daily-engagement-job" | \
  jq -r '[.timestamp[:10], .opted_out_users_skipped] | @csv' | \
  sort -u
```

**Output**:
```csv
"2025-11-10",8
"2025-11-11",9
"2025-11-12",12
"2025-11-13",15
"2025-11-14",23
```

## Correlation with Other Data Sources

### Cross-Check with Database

**Scheduler logs vs Database state**:

1. **Get opted-out count from scheduler logs**:
   ```bash
   railway logs --tail 100 | grep "daily-engagement-job" | jq '.opted_out_users_skipped' | tail -1
   ```

2. **Get opted-out count from database**:
   ```sql
   SELECT COUNT(*) FROM user_profiles WHERE reengagement_opt_out = true;
   ```

3. **Compare**: Scheduler skipped count should ≤ database opted-out count (scheduler only processes eligible users, not all users).

### Cross-Check with PostHog Events

**Scheduler logs vs PostHog opt-out events**:

1. **Get opt-out events from last 24h** (PostHog dashboard):
   - Event: `engagement_preference_changed`
   - Filter: `preference = 'opted_out'`
   - Time range: Last 24 hours
   - Count: e.g., 5 events

2. **Get opted-out users skipped** (scheduler logs):
   ```bash
   railway logs --tail 200 | grep "daily-engagement-job" | jq '.opted_out_users_skipped' | tail -2
   ```

3. **Compare**: If 5 users opted out today, scheduler should skip ~5 more users than yesterday (cumulative).

## Alerting Based on Logs

### Manual Monitoring

**Daily Check** (run at 11am after daily job completes):
```bash
railway logs --tail 50 | \
  grep "daily-engagement-job" | \
  jq -r 'select(.opt_out_filter_rate > 20) | "⚠️ High opt-out rate: \(.opt_out_filter_rate)%"'
```

### Automated Monitoring

**Option 1: Railway Alerting** (if available)

Configure Railway alerts:
- Condition: Log message contains "high opt-out rate detected"
- Action: Send email/Slack notification

**Option 2: Custom Monitoring Script**

See `scripts/analytics/check-optout-spike.ts` for automated spike detection using PostHog events.

**Option 3: CloudWatch Alarms** (AWS)

Create CloudWatch alarm:
- Metric: Custom metric from logs (opt_out_filter_rate)
- Condition: > 20
- Action: SNS notification

## Troubleshooting

### Issue: Logs Missing Opt-Out Metrics

**Symptoms**: Logs don't include `opted_out_users_skipped` or `opt_out_filter_rate` fields

**Cause**: Scheduler jobs not updated with enhanced logging (from Task 9 of this story)

**Solution**:
1. Verify scheduler jobs include opt-out logging
2. Redeploy WhatsApp bot with updated code
3. Check logs after next scheduler run

### Issue: Opt-Out Filter Rate Doesn't Match Database

**Symptoms**: `opt_out_filter_rate` from logs ≠ database opt-out rate

**Explanation**: This is expected behavior:

- **Scheduler logs**: Percentage of eligible users skipped (e.g., only users entering dormant state)
- **Database**: Percentage of all users who are opted out

Example:
- 10 users entering dormant state (eligible for goodbye message)
- 2 of them are opted out
- Scheduler `opt_out_filter_rate` = 20%
- But database has 15 opted out of 150 total = 10% opt-out rate

**Solution**: These metrics measure different things. Compare trends, not absolute values.

### Issue: Negative Values or NaN in Logs

**Symptoms**: `opt_out_filter_rate` shows `NaN` or negative numbers

**Cause**: Division by zero (no eligible users) or logic error

**Solution**:
```typescript
// In scheduler job
const optOutFilterRate = totalEligible > 0
  ? (optedOutSkipped / totalEligible) * 100
  : 0 // No users = no opt-outs = 0%
```

### Issue: Logs Not Appearing in Railway

**Symptoms**: No scheduler logs visible in Railway dashboard

**Cause**: Logs not flushing to Railway, or service not running

**Solution**:
1. Check service status in Railway dashboard
2. Verify cron job configuration in `railway.cron.yml`
3. Check for errors in Railway build logs
4. Manually trigger job: `railway run npm run scheduler:daily`

## Log Retention & Archiving

### Railway Log Retention

- **Free Tier**: 7 days
- **Pro Tier**: 30 days
- **Recommendation**: Export important logs monthly

**Export logs for long-term storage**:
```bash
# Export last 30 days to JSON
railway logs --service whatsapp-bot --tail 5000 > scheduler-logs-$(date +%Y-%m).json

# Parse and convert to CSV for analysis
cat scheduler-logs-*.json | \
  jq -r '[.timestamp, .job, .opt_out_filter_rate] | @csv' > scheduler-metrics.csv
```

### CloudWatch Log Retention

**Configure retention period**:
1. CloudWatch → Log Groups → Select log group
2. Actions → Edit retention setting
3. Set retention: 30 days, 90 days, or indefinite

**Note**: Longer retention = higher storage costs. 30 days recommended for scheduler logs.

## Sample Analysis Queries

### Calculate 7-Day Average Opt-Out Rate

```bash
railway logs --tail 1000 | \
  grep "daily-engagement-job" | \
  jq -s '[.[0:7] | .[].opt_out_filter_rate] | add / length' | \
  xargs printf "7-day average opt-out filter rate: %.2f%%\n"
```

### Identify Days with Spikes

```bash
railway logs --tail 2000 | \
  grep "daily-engagement-job" | \
  jq -r 'select(.opt_out_filter_rate > 15) | "📈 \(.timestamp[:10]): \(.opt_out_filter_rate)% opt-out rate"'
```

### Total Messages Skipped (Last 30 Days)

```bash
railway logs --tail 3000 | \
  grep "daily-engagement-job\|weekly-review-job" | \
  jq -s 'map(.opted_out_users_skipped) | add' | \
  xargs echo "Total messages skipped due to opt-out in last 30 days:"
```

## Related Documentation

- [PostHog Events Documentation](./engagement-preferences.md) - Event-based analytics
- [SQL Queries Documentation](./sql-queries.md) - Database analytics
- [Dashboard Setup Guide](./dashboard-setup.md) - Complete dashboard setup

## References

- Scheduler Jobs:
  - `whatsapp-bot/src/services/scheduler/daily-engagement-job.ts`
  - `whatsapp-bot/src/services/scheduler/weekly-review-job.ts`
- Cron Configuration: `railway.cron.yml`
- Tech Spec: `docs/sprint-artifacts/tech-spec-epic-6.md#AC-6.5`
