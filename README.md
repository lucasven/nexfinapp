# NexFinApp - Expense Tracking Application

An expense tracking application with two main components:
- **Frontend (fe/)**: Next.js 15 web app with internationalization (pt-BR/en)
- **WhatsApp Bot (whatsapp-bot/)**: Node.js bot for WhatsApp integration

## Quick Start

### Frontend Development
```bash
cd fe
npm install
npm run dev  # Start dev server at http://localhost:3000
```

### WhatsApp Bot Development
```bash
cd whatsapp-bot
npm install
npm run dev  # Start with ts-node
```

## Architecture

### Frontend (`fe/`)
- **Framework**: Next.js 15 with App Router
- **UI**: Radix UI components with Tailwind CSS
- **State**: React Hook Form with Zod validation
- **Analytics**: PostHog integration
- **Database**: Supabase (PostgreSQL with pgvector extension)
- **Internationalization**: next-intl with locale-based routing (`/[locale]/...`)

### WhatsApp Bot (`whatsapp-bot/`)
- **Core**: TypeScript with ESM modules
- **WhatsApp**: Baileys library for WhatsApp Web API
- **NLP**: 3-layer architecture (Explicit Commands → Semantic Cache → OpenAI LLM)
- **OCR**: Tesseract.js for receipt scanning with Sharp for image processing
- **Database**: Shared Supabase instance with frontend

## Analytics & Monitoring

The application includes comprehensive analytics for monitoring user engagement and opt-out preferences.

### Data Sources

1. **PostHog Events** - Real-time event tracking
   - Event: `engagement_preference_changed`
   - Tracks opt-out/opt-in from WhatsApp and web
   - See: [docs/analytics/engagement-preferences.md](docs/analytics/engagement-preferences.md)

2. **Database Queries** - Current state snapshots
   - Table: `user_profiles.reengagement_opt_out`
   - SQL queries for opt-out rate and metrics
   - See: [docs/analytics/sql-queries.md](docs/analytics/sql-queries.md)

3. **Scheduler Logs** - Job execution metrics
   - Daily/weekly engagement job logs
   - Users skipped due to opt-out
   - See: [docs/analytics/scheduler-metrics.md](docs/analytics/scheduler-metrics.md)

### Quick Analytics Queries

**Current Opt-Out Rate** (Database):
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

**Opt-Out Events (PostHog)**:
- Dashboard: `app.posthog.com`
- Event: `engagement_preference_changed`
- Filter: `preference = 'opted_out'`

**Scheduler Metrics (Railway)**:
```bash
railway logs --service whatsapp-bot --tail 100 | \
  grep "daily-engagement-job" | \
  jq '.opt_out_filter_rate'
```

### Analytics Dashboard Setup

For step-by-step instructions on setting up analytics dashboards:
- [Dashboard Setup Guide](docs/analytics/dashboard-setup.md)

### Monitoring & Alerts

**Opt-Out Spike Detection**:

Run the monitoring script to detect abnormal opt-out rates (> 20% in 24 hours):

```bash
# From project root
npx tsx scripts/analytics/check-optout-spike.ts

# Or via npm script (add to package.json)
npm run analytics:check-spike
```

**Configure Alerts**:
```bash
# .env file
OPTOUT_SPIKE_THRESHOLD=20
ALERT_EMAIL=team@example.com
ALERT_SLACK_WEBHOOK=https://hooks.slack.com/services/xxx
```

**Deploy as Cron Job** (Railway):
Add to `railway.cron.yml`:
```yaml
- name: check-optout-spike
  schedule: "0 0 * * *"  # Daily at midnight
  command: npx tsx scripts/analytics/check-optout-spike.ts
```

### Key Metrics to Monitor

| Metric | Target | Data Source |
|--------|--------|-------------|
| **Opt-out rate** | < 10% | Database |
| **Opt-out spike** | < 20% in 24h | PostHog events |
| **Opt-back-in rate** | > 30% | PostHog funnel |
| **Scheduler skip rate** | Matches DB opt-out rate | Scheduler logs |

### Accessing Analytics

- **PostHog Dashboard**: `app.posthog.com` (credentials in team vault)
- **Supabase SQL Editor**: `supabase.com/dashboard/project/{project-ref}/sql`
- **Railway Logs**: `railway.app/project/{project-id}/service/whatsapp-bot/logs`

### Sample Queries

Executable SQL queries available in:
- [scripts/analytics/sample-queries.sql](scripts/analytics/sample-queries.sql)

Run via:
```bash
psql $DATABASE_URL < scripts/analytics/sample-queries.sql
```

## Documentation

- **Project Instructions**: [CLAUDE.md](CLAUDE.md) - Detailed project overview and development guidelines
- **Analytics Documentation**: [docs/analytics/](docs/analytics/) - Complete analytics and monitoring guides
  - [engagement-preferences.md](docs/analytics/engagement-preferences.md) - PostHog events and queries
  - [sql-queries.md](docs/analytics/sql-queries.md) - Database query reference
  - [scheduler-metrics.md](docs/analytics/scheduler-metrics.md) - Log-based analytics
  - [dashboard-setup.md](docs/analytics/dashboard-setup.md) - Dashboard creation guide
- **Sprint Artifacts**: [docs/sprint-artifacts/](docs/sprint-artifacts/) - Epic and story documentation

## Database Migrations

Database migrations are located in `fe/scripts/` (001-037 as of now).

Run migrations:
```bash
psql $DATABASE_URL < fe/scripts/001_initial_schema.sql
# Continue with subsequent migrations in order
```

Key migrations:
- `034_engagement_system.sql` - Adds reengagement_opt_out column
- `037_opt_out_index.sql` - Adds index for opt-out queries

## Testing

### WhatsApp Bot Tests
```bash
cd whatsapp-bot
npm test                    # Run all tests
npm test -- --watch        # Watch mode
npm test -- path/to/test.ts # Specific test
```

### Frontend Tests
```bash
cd fe
npm test
```

## Deployment

### Environment Variables

**Frontend (.env.local)**:
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_KEY=
NEXT_PUBLIC_POSTHOG_KEY=
NEXT_PUBLIC_POSTHOG_HOST=
```

**WhatsApp Bot (.env)**:
```
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
OPENAI_API_KEY=
WHATSAPP_PHONE_NUMBER=
POSTHOG_API_KEY=
POSTHOG_HOST=
PORT=3001
```

**Analytics Monitoring (.env)**:
```
OPTOUT_SPIKE_THRESHOLD=20
ALERT_EMAIL=
ALERT_SLACK_WEBHOOK=
```

### Railway Deployment

WhatsApp bot is deployed on Railway with:
- Configuration: `railway.json`
- Cron jobs: `railway.cron.yml`
- Build: Nixpacks

## Contributing

See [CLAUDE.md](CLAUDE.md) for detailed development guidelines, architecture patterns, and code organization.

## License

Proprietary
