# Analytics Dashboard Setup Guide

This guide provides step-by-step instructions for setting up analytics dashboards to monitor engagement preferences and opt-out metrics.

## Table of Contents

1. [PostHog Dashboard Setup](#posthog-dashboard-setup)
2. [Database Query Access](#database-query-access)
3. [Scheduler Log Access](#scheduler-log-access)
4. [Recommended Dashboards](#recommended-dashboards)
5. [Alerting Configuration](#alerting-configuration)
6. [Troubleshooting](#troubleshooting)

---

## PostHog Dashboard Setup

### Prerequisites

- PostHog account credentials (stored in team vault)
- Project: NexFinApp
- PostHog host: `app.posthog.com`

### Step 1: Access PostHog

1. Navigate to: `https://app.posthog.com`
2. Log in with team credentials
3. Select project: **NexFinApp**

### Step 2: Create New Dashboard

1. Click **Dashboards** in left sidebar
2. Click **+ New Dashboard**
3. Name: `Engagement Preferences - Opt-Out Metrics`
4. Description: `Monitor user opt-out preferences and re-engagement metrics`
5. Click **Create**

### Step 3: Add Charts to Dashboard

#### Chart 1: Opt-Out Rate Over Time (Line Chart)

**Purpose**: Track daily opt-out trends to identify patterns

1. Click **+ Add insight**
2. Select **Trends**
3. Configure:
   - **Event**: `engagement_preference_changed`
   - **Filter**: `preference = 'opted_out'`
   - **Breakdown**: By day
   - **Chart type**: Line chart
   - **Time range**: Last 30 days
4. Name: `Daily Opt-Out Events`
5. Click **Save**

**Expected Result**: Line chart showing daily opt-out event counts. Should remain low and stable.

#### Chart 2: Channel Distribution (Pie Chart)

**Purpose**: Understand which channel users prefer for managing preferences

1. Click **+ Add insight**
2. Select **Trends**
3. Configure:
   - **Event**: `engagement_preference_changed`
   - **Breakdown**: By `source` property
   - **Chart type**: Pie chart
   - **Time range**: Last 30 days
4. Name: `Preference Changes by Channel (WhatsApp vs Web)`
5. Click **Save**

**Expected Result**: Pie chart showing distribution of `whatsapp` vs `web` sources.

#### Chart 3: Opt-Back-In Funnel

**Purpose**: Track how many users who opt-out eventually opt back in

1. Click **+ Add insight**
2. Select **Funnel**
3. Configure funnel steps:
   - **Step 1**:
     - Event: `engagement_preference_changed`
     - Filter: `preference = 'opted_out'`
   - **Step 2**:
     - Event: `engagement_preference_changed`
     - Filter: `preference = 'opted_in'`
   - **Time window**: 30 days
4. Name: `Opt-Back-In Funnel (30 Days)`
5. Click **Save**

**Expected Result**: Funnel showing conversion from opt-out to opt-in. Target: > 30% conversion rate.

#### Chart 4: Weekly Comparison (Multi-Line Chart)

**Purpose**: Compare opt-out vs opt-in volumes week over week

1. Click **+ Add insight**
2. Select **Trends**
3. Configure:
   - **Series 1**:
     - Event: `engagement_preference_changed`
     - Filter: `preference = 'opted_out'`
   - **Series 2**:
     - Event: `engagement_preference_changed`
     - Filter: `preference = 'opted_in'`
   - **Breakdown**: By week
   - **Chart type**: Line chart (multi-series)
   - **Time range**: Last 12 weeks
4. Name: `Weekly Opt-Out vs Opt-In Comparison`
5. Click **Save**

**Expected Result**: Two lines showing opt-out and opt-in trends. Opt-in should be stable or growing, opt-out should remain low.

#### Chart 5: Daily Opt-Out Events (Bar Chart)

**Purpose**: Visualize daily opt-out volume for recent days

1. Click **+ Add insight**
2. Select **Trends**
3. Configure:
   - **Event**: `engagement_preference_changed`
   - **Filter**: `preference = 'opted_out'`
   - **Breakdown**: By day
   - **Chart type**: Bar chart
   - **Time range**: Last 7 days
4. Name: `Last 7 Days Opt-Out Events`
5. Click **Save**

**Expected Result**: Bar chart showing daily opt-out counts. Spikes indicate messaging problems.

### Step 4: Organize Dashboard Layout

1. Drag and drop charts to arrange:
   - **Top row**: Daily Opt-Out Events (line), Channel Distribution (pie)
   - **Middle row**: Opt-Back-In Funnel, Weekly Comparison
   - **Bottom row**: Last 7 Days Opt-Out Events (bar)
2. Resize charts for visibility
3. Click **Save** in top-right corner

### Step 5: Configure Dashboard Refresh

1. Click dashboard settings (gear icon)
2. Set **Auto-refresh**: 5 minutes
3. Enable **Public dashboard** (optional, for team sharing)
4. Click **Save**

---

## Database Query Access

### Prerequisites

- Supabase project access
- Database credentials (in `.env` files)
- PostgreSQL client (psql) or Supabase dashboard access

### Method 1: Supabase Dashboard (Recommended)

**Pros**: Visual interface, no CLI required, query history

**Steps**:

1. Navigate to: `https://supabase.com/dashboard/project/{project-ref}/sql`
2. Log in with Supabase credentials
3. Click **+ New query**
4. Name query: `Opt-Out Rate`
5. Paste query from [sql-queries.md](./sql-queries.md):
   ```sql
   SELECT
     COUNT(*) as total_users,
     COUNT(*) FILTER (WHERE reengagement_opt_out = true) as opted_out_users,
     ROUND(
       (COUNT(*) FILTER (WHERE reengagement_opt_out = true)::numeric / COUNT(*)::numeric) * 100,
       2
     ) as opt_out_rate_percent
   FROM user_profiles
   WHERE user_id IN (SELECT id FROM auth.users);
   ```
6. Click **Run** (or press Ctrl+Enter)
7. Review results in table view
8. Click **Save** to save query for future use

**Export Results**:
- Click **Export** → **CSV** to download results
- Or copy-paste from results table

### Method 2: psql CLI

**Pros**: Fast, scriptable, works in CI/CD

**Steps**:

1. Get database URL from environment:
   ```bash
   # Frontend
   export DATABASE_URL=$(grep SUPABASE_URL fe/.env.local | cut -d '=' -f2)

   # Or WhatsApp bot
   export DATABASE_URL=$(grep SUPABASE_URL whatsapp-bot/.env | cut -d '=' -f2)
   ```

2. Connect via psql:
   ```bash
   psql $DATABASE_URL
   ```

3. Run query:
   ```sql
   SELECT COUNT(*) FILTER (WHERE reengagement_opt_out = true) as opted_out
   FROM user_profiles;
   ```

4. Exit: `\q`

**Run query from file**:
```bash
psql $DATABASE_URL < scripts/analytics/sample-queries.sql
```

### Method 3: Node.js Script

**Pros**: Integrate with automation, custom processing

**Example Script**:
```typescript
// scripts/analytics/get-optout-rate.ts
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

async function getOptOutRate() {
  const { data, error } = await supabase.rpc('get_opt_out_rate')

  if (error) {
    console.error('Error:', error)
    return
  }

  console.log('Opt-out rate:', data)
}

getOptOutRate()
```

**Run**:
```bash
cd whatsapp-bot
npx tsx scripts/analytics/get-optout-rate.ts
```

### Recommended Queries for Dashboard

Create saved queries in Supabase for quick access:

1. **Current Opt-Out Rate** (run daily)
2. **Opt-Out Count by User Tenure** (run weekly)
3. **Data Quality Check** (run monthly)

See [sql-queries.md](./sql-queries.md) for full query library.

---

## Scheduler Log Access

### Prerequisites

- Railway CLI installed (`npm i -g @railway/cli`)
- Railway project access
- Or CloudWatch access (if using AWS)

### Method 1: Railway Web UI

**Steps**:

1. Navigate to: `https://railway.app/project/{project-id}/service/{service-id}/logs`
2. Select service: **whatsapp-bot**
3. Set time range: Last 24 hours (or custom range)
4. **Filter logs**:
   - Type in search bar: `daily-engagement-job`
   - Or: `weekly-review-job`
5. Click on log entry to view full JSON
6. Look for fields:
   - `total_eligible_users`
   - `opted_out_users_skipped`
   - `opt_out_filter_rate`

**Export Logs**:
- Click **Export** in top-right
- Select date range
- Download as JSON or plain text

### Method 2: Railway CLI

**Installation**:
```bash
npm i -g @railway/cli
railway login
```

**Basic Commands**:

```bash
# Tail logs in real-time
railway logs --service whatsapp-bot --tail

# Get recent logs (last 500 lines)
railway logs --service whatsapp-bot --tail 500

# Filter for specific job
railway logs --service whatsapp-bot --tail 1000 | grep "daily-engagement-job"

# Extract JSON fields with jq
railway logs --service whatsapp-bot --tail 100 | \
  jq '. | select(.job == "daily-engagement-job")'
```

**Get Opt-Out Metrics**:
```bash
# Get latest opt-out filter rate
railway logs --tail 100 | \
  grep "daily-engagement-job" | \
  jq -r '.opt_out_filter_rate' | \
  tail -1
```

**Export to CSV**:
```bash
# Export last 30 days to CSV
railway logs --tail 3000 | \
  grep "daily-engagement-job" | \
  jq -r '[.timestamp, .opt_out_filter_rate, .opted_out_users_skipped] | @csv' \
  > scheduler-metrics-$(date +%Y-%m).csv
```

### Method 3: CloudWatch Logs (AWS)

**For AWS deployments only**

**Web Console**:
1. Navigate to: CloudWatch → Log Groups
2. Select log group: `/aws/lambda/whatsapp-bot` or `/ecs/whatsapp-bot`
3. Click **Insights**
4. Run query:
   ```
   fields @timestamp, job, opt_out_filter_rate, opted_out_users_skipped
   | filter job = "daily-engagement-job"
   | sort @timestamp desc
   | limit 100
   ```
5. Export results to CSV

**AWS CLI**:
```bash
aws logs tail /aws/lambda/whatsapp-bot --follow --format short
```

---

## Recommended Dashboards

### Dashboard 1: Opt-Out Overview (Daily Monitoring)

**Purpose**: Daily health check for product/dev teams

**Components**:
1. **PostHog Chart**: Daily opt-out events (last 7 days)
2. **Database Query**: Current opt-out rate
3. **Scheduler Log**: Latest opt-out filter rate from daily job
4. **Alert Status**: Any active alerts from spike detection

**Access Pattern**:
- Check daily at 11am (after daily engagement job runs)
- Review for anomalies or spikes
- Investigate if opt-out rate > 15%

### Dashboard 2: Engagement Insights (Weekly Review)

**Purpose**: Weekly deep-dive for product strategy

**Components**:
1. **PostHog Chart**: Weekly opt-out vs opt-in comparison (last 12 weeks)
2. **PostHog Chart**: Channel distribution (WhatsApp vs Web)
3. **PostHog Funnel**: Opt-back-in rate (30 days)
4. **Database Query**: Opt-out rate by user tenure

**Access Pattern**:
- Review weekly on Mondays
- Identify trends and patterns
- Plan messaging improvements based on insights

### Dashboard 3: Technical Monitoring (Ops Team)

**Purpose**: Ensure system health and data integrity

**Components**:
1. **Scheduler Logs**: Job execution times and error rates
2. **Database Query**: Data quality check (NULL values, integrity)
3. **PostHog Event Count**: Total events tracked (verify tracking working)
4. **Alert Log**: History of spike detections

**Access Pattern**:
- Review daily for technical issues
- Verify scheduler jobs running on schedule
- Check data consistency across sources

---

## Alerting Configuration

### PostHog Alerts (Built-in)

**Setup**:
1. Open PostHog dashboard
2. Select chart: "Daily Opt-Out Events"
3. Click **...** (more options) → **Create alert**
4. Configure:
   - **Condition**: Count > 20% of total users in last 24h
   - **Notification**: Email + Slack
   - **Recipients**: team@example.com
5. Click **Create**

**Note**: Alert threshold calculation requires custom insight combining event count with user count. Consider using custom monitoring script instead.

### Custom Monitoring Script

**Recommended approach**: Use `scripts/analytics/check-optout-spike.ts`

**Features**:
- Queries PostHog for last 24h opt-out events
- Calculates opt-out rate vs total users
- Alerts if rate > 20%
- Sends email/Slack notification

**Setup**:
1. Configure alert channels in `.env`:
   ```
   ALERT_EMAIL=team@example.com
   ALERT_SLACK_WEBHOOK=https://hooks.slack.com/services/xxx
   ```
2. Run as Railway cron job (daily at midnight)
3. Or run manually: `npm run analytics:check-spike`

See "Implement Spike Detection Script" section below for full implementation.

### Railway Alerts (Log-based)

**If Railway supports log-based alerts**:

1. Navigate to Railway project settings
2. Create alert:
   - **Name**: High Opt-Out Rate Detected
   - **Condition**: Log message contains "high opt-out rate detected"
   - **Action**: Send email/Slack notification
3. Save alert

**Note**: This requires scheduler jobs to log warning messages when opt-out rate > 20%.

### Database Monitoring

**Manual Check** (run daily):
```sql
SELECT
  CASE
    WHEN opt_out_rate > 20 THEN 'CRITICAL'
    WHEN opt_out_rate > 10 THEN 'WARNING'
    ELSE 'HEALTHY'
  END as status,
  opt_out_rate
FROM (
  SELECT
    ROUND(
      (COUNT(*) FILTER (WHERE reengagement_opt_out = true)::numeric / COUNT(*)::numeric) * 100,
      2
    ) as opt_out_rate
  FROM user_profiles
) rates;
```

If status is `CRITICAL`, investigate immediately.

---

## Troubleshooting

### Issue: PostHog Charts Show No Data

**Symptoms**: All charts empty, no events visible

**Possible Causes**:
1. PostHog client not initialized
2. Wrong project selected
3. Events not being tracked
4. Date range too narrow

**Solutions**:
1. Verify PostHog credentials in `.env` files:
   - Frontend: `NEXT_PUBLIC_POSTHOG_KEY`
   - WhatsApp bot: `POSTHOG_API_KEY`
2. Check project selection in PostHog dashboard
3. Manually trigger opt-out event to test tracking:
   - Use `/stop` command in WhatsApp bot
   - Or toggle opt-out in web settings
4. Expand date range to "Last 90 days"
5. Run validation test: `npm test -- posthog-events.test.ts`

### Issue: Database Queries Return 0 Users

**Symptoms**: All queries return 0 or NULL

**Possible Causes**:
1. Wrong database/project
2. No users in system yet
3. Table name typo
4. RLS policies blocking access

**Solutions**:
1. Verify database connection:
   ```sql
   SELECT current_database();
   ```
2. Check users exist:
   ```sql
   SELECT COUNT(*) FROM auth.users;
   ```
3. Verify table name:
   ```sql
   SELECT * FROM user_profiles LIMIT 1;
   ```
4. Use service key (not anon key) for queries:
   - Use `SUPABASE_SERVICE_KEY` not `SUPABASE_ANON_KEY`

### Issue: Scheduler Logs Missing Opt-Out Metrics

**Symptoms**: Logs don't include `opted_out_users_skipped` or `opt_out_filter_rate`

**Possible Causes**:
1. Scheduler jobs not updated with enhanced logging (Task 9 of Story 6.5)
2. Old version deployed
3. Logs filtered out

**Solutions**:
1. Check scheduler job code includes opt-out logging:
   - `whatsapp-bot/src/services/scheduler/daily-engagement-job.ts`
   - `whatsapp-bot/src/services/scheduler/weekly-review-job.ts`
2. Redeploy latest version to Railway
3. Verify logs after next scheduled run
4. Manually trigger job to test:
   ```bash
   railway run npm run scheduler:daily
   ```

### Issue: Different Metrics Across Sources

**Symptoms**: PostHog opt-out count ≠ database opt-out count ≠ scheduler skipped count

**Explanation**: This is expected - each source measures different things:

- **PostHog**: Historical events (all opt-out events ever tracked)
- **Database**: Current state (users currently opted out)
- **Scheduler**: Eligible users skipped (subset of opted-out users who would have received message)

**Validation**:
- PostHog event count ≥ Database opted-out count (some users opt back in)
- Scheduler skipped ≤ Database opted-out count (scheduler only processes eligible users)

**Example**:
- 50 opt-out events in PostHog (including 10 who opted back in)
- 40 opted-out users in database (current state)
- 5 users skipped by scheduler (only 5 were eligible for today's message)

All three numbers are correct and consistent.

### Issue: Spike Detection False Positives

**Symptoms**: Alert triggered but no actual problem

**Possible Causes**:
1. Small user base (1 opt-out = 20% if only 5 users)
2. Batch opt-out testing
3. Seasonal patterns (holidays)

**Solutions**:
1. Set minimum user threshold:
   ```typescript
   if (totalUsers < 50) {
     // Don't alert for small user bases
     return
   }
   ```
2. Exclude test accounts from calculations
3. Adjust threshold based on baseline (e.g., alert if 2x baseline)

### Issue: Can't Access Railway Logs

**Symptoms**: Railway CLI returns authentication error

**Possible Causes**:
1. Not logged in to Railway
2. Wrong project selected
3. No permissions

**Solutions**:
1. Login: `railway login`
2. Link project: `railway link`
3. Select correct project when prompted
4. Verify access: `railway whoami`
5. Contact admin for project access if needed

---

## Quick Start Checklist

Use this checklist to set up analytics access from scratch:

- [ ] **PostHog Access**
  - [ ] Get credentials from team vault
  - [ ] Log in to PostHog dashboard
  - [ ] Verify NexFinApp project selected
  - [ ] Create "Engagement Preferences" dashboard
  - [ ] Add 5 recommended charts

- [ ] **Database Access**
  - [ ] Get Supabase credentials
  - [ ] Test connection via Supabase dashboard
  - [ ] Save opt-out rate query
  - [ ] Test query returns results

- [ ] **Scheduler Logs Access**
  - [ ] Install Railway CLI
  - [ ] Login and link project
  - [ ] Tail logs and verify structured JSON format
  - [ ] Verify opt-out metrics present in logs

- [ ] **Alerting**
  - [ ] Configure spike detection script
  - [ ] Set up Railway cron job (or manual runs)
  - [ ] Test alert triggers correctly
  - [ ] Verify alert notifications received

- [ ] **Validation**
  - [ ] Cross-check metrics across all three sources
  - [ ] Verify opt-out rate matches database state
  - [ ] Confirm scheduler respects opt-out preferences
  - [ ] Run validation tests

---

## Related Documentation

- [PostHog Events Documentation](./engagement-preferences.md) - Event schema and queries
- [SQL Queries Documentation](./sql-queries.md) - Database query reference
- [Scheduler Metrics Documentation](./scheduler-metrics.md) - Log parsing and analysis

## References

- PostHog Dashboard: `app.posthog.com`
- Supabase Dashboard: `supabase.com/dashboard`
- Railway Dashboard: `railway.app`
- Tech Spec: `docs/sprint-artifacts/tech-spec-epic-6.md#AC-6.5`
