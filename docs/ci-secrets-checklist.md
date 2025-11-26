# CI/CD Secrets Checklist

**Platform**: GitHub Actions
**Repository**: `lucasven/nexfinapp`

---

## Required Secrets

Currently **no secrets are required** for the basic CI pipeline to function. All tests run using the test database configuration from the codebase.

---

## Optional Secrets

These secrets enable additional CI features:

### 1. Slack Notifications (Optional)

**Secret Name**: `SLACK_WEBHOOK`
**Purpose**: Send notifications to Slack when tests fail
**Required**: No (feature disabled by default)

**How to set up:**

1. **Create Slack Incoming Webhook:**
   - Go to https://api.slack.com/messaging/webhooks
   - Click "Create New App" or select existing app
   - Enable "Incoming Webhooks"
   - Click "Add New Webhook to Workspace"
   - Select channel (e.g., `#engineering` or `#ci-alerts`)
   - Copy webhook URL (looks like: `https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXX`)

2. **Add to GitHub:**
   - Go to: https://github.com/lucasven/nexfinapp/settings/secrets/actions
   - Click "New repository secret"
   - Name: `SLACK_WEBHOOK`
   - Value: Paste webhook URL
   - Click "Add secret"

3. **Enable in workflow:**
   - Edit `.github/workflows/test.yml`
   - Uncomment the "Notify on failure" step
   - Commit and push

**Example notification message:**
```
❌ Test failures detected in PR #42
Branch: feature/new-engagement
Run: https://github.com/lucasven/nexfinapp/actions/runs/123456
```

---

### 2. Test Database (Optional)

**Secret Name**: `SUPABASE_TEST_URL`
**Purpose**: Use dedicated test database in CI instead of shared dev database
**Required**: No (currently using test client from codebase)

**When you might need this:**
- Running CI on multiple PRs simultaneously
- Test data isolation requirements
- Production-like environment testing

**How to set up:**

1. **Create test Supabase project:**
   - Go to https://supabase.com/dashboard
   - Create new project: `nexfinapp-test` or similar
   - Copy database URL

2. **Run migrations on test database:**
   ```bash
   # Apply all migrations to test database
   psql $SUPABASE_TEST_URL < fe/scripts/001_initial_schema.sql
   # ... continue through migration 039
   ```

3. **Add to GitHub:**
   - Repository Settings → Secrets → Actions
   - Name: `SUPABASE_TEST_URL`
   - Value: Test database connection string
   - Click "Add secret"

4. **Update workflow:**
   - Edit `.github/workflows/test.yml`
   - Add environment variable:
     ```yaml
     env:
       SUPABASE_URL: ${{ secrets.SUPABASE_TEST_URL || env.SUPABASE_URL }}
     ```

**Cost consideration:** Free tier Supabase project supports test workload.

---

### 3. API Keys for External Services (Future)

If your tests start calling external APIs:

**Potential secrets:**
- `OPENAI_TEST_API_KEY` - Separate OpenAI key for test environment with rate limits
- `POSTHOG_TEST_KEY` - Analytics test key (or disable analytics in tests)
- `STRIPE_TEST_KEY` - Payment processing test mode

**Current status**: Not needed - tests mock external services (see `whatsapp-bot/src/__mocks__/`)

---

## Environment Variables (Not Secrets)

These can be set directly in `.github/workflows/test.yml` without secrets:

**Already configured:**
- `NODE_ENV=test` - Enables test mode
- `CI=true` - Indicates CI environment

**Available if needed:**
- `LOG_LEVEL=error` - Reduce test output noise
- `TEST_TIMEOUT=30000` - Global test timeout override

---

## Secret Management Best Practices

### ✅ DO:
- Use GitHub's encrypted secrets (Settings → Secrets → Actions)
- Rotate secrets regularly (every 90 days)
- Use different secrets for test vs. production
- Document which secrets are required vs. optional
- Use least-privilege principle (test keys with limited permissions)

### ❌ DON'T:
- Commit secrets to the repository (even in comments)
- Share secrets via Slack/email (use secure sharing tools)
- Use production credentials in CI
- Log secret values in CI output
- Give CI access to admin-level credentials

---

## Verifying Secrets Configuration

### Check if secret is configured:
```yaml
# In .github/workflows/test.yml, add a step:
- name: Verify secrets
  run: |
    if [ -z "${{ secrets.SLACK_WEBHOOK }}" ]; then
      echo "⚠️  SLACK_WEBHOOK not configured"
    else
      echo "✅ SLACK_WEBHOOK configured"
    fi
```

### Test Slack webhook:
```bash
# From local machine, test the webhook
curl -X POST https://hooks.slack.com/services/YOUR/WEBHOOK/URL \
  -H 'Content-Type: application/json' \
  -d '{"text":"🧪 Test notification from CI setup"}'
```

---

## Security Considerations

### Secret Exposure Risk: LOW

**Why:**
- Secrets only accessible to repository with write access
- Not exposed in PR forks (GitHub protects secrets from untrusted code)
- Not visible in logs (GitHub masks secret values)

### If a secret is compromised:

1. **Immediate action:**
   - Delete the secret from GitHub (Settings → Secrets → Actions)
   - Revoke the key/webhook at the source (Slack, Supabase, etc.)

2. **Generate new secret:**
   - Create new webhook/key with same permissions
   - Add to GitHub with same secret name
   - Test CI pipeline

3. **Investigate:**
   - Check GitHub audit log for access patterns
   - Review recent PR activity
   - Scan commits for accidental exposure

---

## Current Configuration Summary

**Secrets configured:** 0 / 3 optional
**Required for basic CI:** None ✅
**Recommended for production:** 1-2 (Slack notifications, dedicated test DB)

### Quick Setup Priority

**Priority 1 (Recommended):**
- [ ] `SLACK_WEBHOOK` - Get alerts when tests fail

**Priority 2 (Optional):**
- [ ] `SUPABASE_TEST_URL` - Isolate test database

**Priority 3 (Future):**
- [ ] External API keys (only when needed)

---

## Testing Without Secrets

The CI pipeline is designed to work **without any secrets** for basic functionality:

- Tests use mocked external services (OpenAI, Baileys, PostHog)
- Test database uses in-memory client or shared test environment
- No external API calls during tests

This makes it easy to:
- Run CI on forks
- Onboard new contributors
- Test locally without configuration

---

## Next Steps

1. **Monitor first CI run** - Verify pipeline works without secrets ✅
2. **Set up Slack webhook** - Get failure notifications (recommended)
3. **Consider test database** - If running many PRs simultaneously
4. **Review quarterly** - Rotate secrets, audit access

---

**Questions?** Contact the team lead or check GitHub repository settings.
