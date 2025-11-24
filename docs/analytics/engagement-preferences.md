# Engagement Preferences Analytics - PostHog Events

This document provides comprehensive guidance on querying and analyzing engagement preference data through PostHog events.

## Event Schema

### Event Name
```
engagement_preference_changed
```

### Event Properties

| Property | Type | Values | Description |
|----------|------|--------|-------------|
| `user_id` | string (UUID) | - | User's database ID (from user_profiles table) |
| `preference` | enum | `opted_in`, `opted_out` | New preference state |
| `source` | enum | `whatsapp`, `web` | Channel where preference was changed |
| `timestamp` | string (ISO 8601) | - | When the preference change occurred |

### Example Event Payload

```json
{
  "event": "engagement_preference_changed",
  "properties": {
    "user_id": "123e4567-e89b-12d3-a456-426614174000",
    "preference": "opted_out",
    "source": "whatsapp",
    "timestamp": "2025-11-24T10:30:00.000Z"
  }
}
```

## Implementation Locations

- **WhatsApp Bot**: `whatsapp-bot/src/handlers/engagement/opt-out-handler.ts`
  - Tracks when users use `/stop` or `/start` commands
  - Source: `whatsapp`

- **Web Application**: `fe/app/[locale]/settings/account/page.tsx`
  - Tracks when users toggle the engagement preference in settings
  - Source: `web`

## PostHog Dashboard Queries

### 1. Opt-Out Rate Over Time (Daily)

**Purpose**: Track daily opt-out events to identify trends

**Configuration**:
```
Chart Type: Line Chart
Event: engagement_preference_changed
Filter: preference = 'opted_out'
Breakdown: Day
Time Period: Last 30 days
```

**Expected Insight**: Should see < 10% opt-out rate on average. Sudden spikes indicate messaging issues.

### 2. Opt-In Rate Over Time (Daily)

**Purpose**: Track daily opt-in events (including opt-back-in)

**Configuration**:
```
Chart Type: Line Chart
Event: engagement_preference_changed
Filter: preference = 'opted_in'
Breakdown: Day
Time Period: Last 30 days
```

**Expected Insight**: Opt-in events after opt-out show users re-engaging. Target > 30% opt-back-in rate.

### 3. Channel Distribution

**Purpose**: Understand which channel users prefer for managing preferences

**Configuration**:
```
Chart Type: Pie Chart
Event: engagement_preference_changed
Breakdown: source
Time Period: Last 30 days
```

**Expected Insight**: If web usage is low, consider UX improvements to settings page.

### 4. Opt-Back-In Funnel

**Purpose**: Track how many users who opt-out eventually opt back in

**Configuration**:
```
Chart Type: Funnel Chart
Step 1: engagement_preference_changed (preference = 'opted_out')
Step 2: engagement_preference_changed (preference = 'opted_in')
Time Window: 30 days
```

**Expected Insight**: Target > 30% conversion from opt-out to opt-in. Lower rates suggest messaging quality issues.

### 5. Daily Opt-Out Events (Bar Chart)

**Purpose**: Visualize daily opt-out volume

**Configuration**:
```
Chart Type: Bar Chart
Event: engagement_preference_changed
Filter: preference = 'opted_out'
Breakdown: Day
Time Period: Last 7 days
```

**Expected Insight**: Consistent low volume is healthy. Spikes indicate problems with specific messages.

### 6. Weekly Comparison (Opt-Out vs Opt-In)

**Purpose**: Compare weekly opt-out and opt-in volumes side by side

**Configuration**:
```
Chart Type: Multi-Series Line Chart
Series 1: engagement_preference_changed (preference = 'opted_out')
Series 2: engagement_preference_changed (preference = 'opted_in')
Breakdown: Week
Time Period: Last 12 weeks
```

**Expected Insight**: Opt-in should trend upward or stable. Opt-out should remain low and stable.

## Advanced Queries

### Finding Users Who Opted Out Then Back In

**Use Case**: Identify user patterns for re-engagement

**Query Approach**:
1. Filter for users with both `opted_out` and `opted_in` events
2. Ensure `opted_in` timestamp > `opted_out` timestamp
3. Group by user_id to count unique users

**PostHog Implementation**:
```
Event: engagement_preference_changed
Filter:
  - preference = 'opted_out'
  - Then: preference = 'opted_in' (within 30 days)
Chart: Count unique users
```

### Channel Preference by Time of Day

**Use Case**: Understand when users interact with preferences

**Query Approach**:
```
Event: engagement_preference_changed
Breakdown: Hour of day
Secondary Breakdown: source
Time Period: Last 7 days
Chart: Heatmap or Stacked Bar Chart
```

## Filter Syntax Examples

### Basic Filters

```
# Only opt-out events
preference = 'opted_out'

# Only WhatsApp source
source = 'whatsapp'

# Combine filters (AND)
preference = 'opted_out' AND source = 'whatsapp'

# Either source (OR)
source = 'whatsapp' OR source = 'web'
```

### Date Range Filters

```
# Last 24 hours
timestamp >= now() - interval '24 hours'

# Last 7 days
timestamp >= now() - interval '7 days'

# Specific date range
timestamp >= '2025-11-01' AND timestamp < '2025-12-01'
```

## Dashboard Setup Recommendations

### Overview Dashboard

Create a dashboard with these charts:

1. **Opt-Out Rate Over Time** (Line Chart, 30 days)
   - Shows trend and helps identify spikes

2. **Channel Distribution** (Pie Chart, 30 days)
   - Shows where users manage preferences

3. **Daily Events** (Bar Chart, 7 days)
   - Shows recent activity volume

4. **Opt-Back-In Funnel** (Funnel Chart, 30 days)
   - Shows re-engagement success

### Alert Configuration

**Critical Alert: Opt-Out Spike**

```
Alert Name: High Opt-Out Rate (24h)
Condition: engagement_preference_changed (preference = 'opted_out') count > 20% of total users
Time Window: Last 24 hours
Notification: Email + Slack
Action Required: Review message content and frequency
```

**Note**: This alert is also implemented via the monitoring script in `scripts/analytics/check-optout-spike.ts`

## Troubleshooting

### Issue: Events Not Appearing

**Possible Causes**:
1. PostHog client not initialized properly
2. Network issues preventing event delivery
3. Events filtered by PostHog sampling (if enabled)

**Solution**:
- Check PostHog client initialization in `whatsapp-bot/src/analytics/posthog-client.ts` and `fe/lib/analytics/tracker.ts`
- Verify `NEXT_PUBLIC_POSTHOG_KEY` and `NEXT_PUBLIC_POSTHOG_HOST` in frontend `.env.local`
- Check PostHog project settings for sampling configuration

### Issue: Missing Properties

**Possible Causes**:
1. Event tracked without all required properties
2. Property values are undefined/null

**Solution**:
- Review tracking calls in opt-out handler and web settings page
- Ensure `user_id`, `preference`, `source`, and `timestamp` are always provided
- Run validation tests: `npm test -- posthog-events.test.ts`

### Issue: Incorrect Counts

**Possible Causes**:
1. Duplicate events from retries
2. Test events included in production data
3. Events from deleted users

**Solution**:
- Implement idempotency in event tracking (deduplicate by user_id + timestamp)
- Filter out test user IDs in queries
- Cross-reference with database opt-out count for validation

## Data Retention

- **PostHog Events**: Retained for 90 days (configurable in PostHog project settings)
- **Recommendation**: Export key metrics monthly for long-term analysis
- **LGPD Compliance**: Events use user_id (UUID) not PII, no sensitive data tracked

## Related Documentation

- [SQL Queries Documentation](./sql-queries.md) - Database queries for opt-out metrics
- [Scheduler Metrics Documentation](./scheduler-metrics.md) - Log-based analytics
- [Dashboard Setup Guide](./dashboard-setup.md) - Complete dashboard creation guide

## References

- PostHog Dashboard: `app.posthog.com` (credentials in team vault)
- Implementation: Stories 6.1 (WhatsApp) and 6.2 (Web)
- Tech Spec: `docs/sprint-artifacts/tech-spec-epic-6.md#AC-6.5`
