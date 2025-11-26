# CI/CD Pipeline Guide

**Platform**: GitHub Actions
**Configuration**: `.github/workflows/test.yml`
**Status**: ✅ Active

---

## Overview

The NexFinApp CI/CD pipeline provides automated quality gates with parallel test execution, flaky test detection, and comprehensive artifact collection. Every push to main branches and every pull request runs the complete test suite to ensure code quality.

---

## Pipeline Stages

### Stage 1: Lint & Code Quality
**Duration**: ~2 minutes
**Purpose**: Catch syntax errors and code quality issues early

**Checks:**
- TypeScript compilation (`tsc --noEmit`)
- Linting (if configured in package.json)

**Triggers:**
- All pushes and PRs

### Stage 2: Test Execution (Parallel Shards)
**Duration**: ~3-4 minutes (parallelized across 4 shards)
**Purpose**: Run full test suite with maximum speed

**Configuration:**
- **Shards**: 4 parallel jobs
- **Workers**: 2 per shard
- **Timeout**: 15 minutes per shard
- **Environment**: Node 18, Ubuntu latest

**Test Command:**
```bash
npm test -- --shard=$SHARD_NUM/4 --maxWorkers=2
```

**Artifacts on Failure:**
- Test results
- Coverage reports
- Logs and traces

### Stage 3: Burn-In Loop (Flaky Detection)
**Duration**: ~30 minutes
**Purpose**: Detect non-deterministic test failures

**When it runs:**
- ✅ PRs to `main` or `develop`
- ✅ Weekly on schedule (Monday 2 AM UTC)
- ❌ Not on every commit (too slow)

**How it works:**
- Runs entire test suite **10 times consecutively**
- **Even ONE failure** = tests are flaky
- Must fix flakiness before merging

**Why this matters:**
Flaky tests that pass 99% of the time still block deployments. The burn-in loop catches these before they reach main branch.

### Stage 4: Coverage Report
**Duration**: ~3 minutes
**Purpose**: Ensure code coverage meets 70% threshold

**Threshold Requirements:**
- Branches: 70%
- Functions: 70%
- Lines: 70%
- Statements: 70%

**Configured in**: `whatsapp-bot/jest.config.js`

### Stage 5: Database Migration Check
**Duration**: <1 minute
**Purpose**: Detect new SQL migrations that need manual application

**Alerts when:**
- New `.sql` files added in `fe/scripts/`
- Reminds to apply migrations before deploying

---

## Running Locally

### Quick Test
```bash
cd whatsapp-bot
npm test
```

### Full CI Mirror (Recommended before pushing)
```bash
cd whatsapp-bot
./scripts/ci-local.sh
```

**What it runs:**
1. TypeScript compilation check
2. Linting (if configured)
3. Full test suite
4. Burn-in loop (3 iterations - reduced for speed)
5. Coverage report

**Duration**: ~5-10 minutes

### Burn-In Only
```bash
cd whatsapp-bot
./scripts/burn-in.sh [iterations]
```

**Examples:**
```bash
./scripts/burn-in.sh        # 10 iterations (default)
./scripts/burn-in.sh 3      # Quick check (3 iterations)
./scripts/burn-in.sh 100    # High confidence (100 iterations)
```

### Selective Testing (Faster Feedback)
```bash
cd whatsapp-bot
./scripts/test-changed.sh [base-branch]
```

**What it does:**
- Detects files changed since base branch
- Runs only affected tests
- Fallback to full suite for infrastructure changes

**Use case:** Quick iteration during development

---

## Debugging Failed CI Runs

### Step 1: Check which stage failed

Look at the GitHub Actions summary - each stage shows ✅ or ❌

### Step 2: Download artifacts (if test/burn-in failed)

**Navigate to:**
```
GitHub → Actions → Failed Run → Artifacts section
```

**Available artifacts:**
- `test-results-shard-N` - Per-shard test output
- `burn-in-failures` - Burn-in iteration logs
- `coverage-report` - Coverage HTML report

### Step 3: Reproduce locally

```bash
# Mirror the exact CI environment
cd whatsapp-bot
./scripts/ci-local.sh
```

### Step 4: Common failure causes

**Flaky tests (burn-in failures):**
- **Symptom**: Test passes sometimes, fails other times
- **Common causes**: Race conditions, test pollution, timing issues
- **Fix**: Add proper cleanup in `afterEach`, use `setupMockTime` for deterministic time, check for shared state

**Coverage below threshold:**
- **Symptom**: Coverage report shows <70% on a metric
- **Fix**: Add tests for uncovered code paths, or adjust threshold in `jest.config.js`

**TypeScript errors:**
- **Symptom**: `tsc --noEmit` fails
- **Fix**: Run `npx tsc --noEmit` locally to see exact errors

---

## Performance Optimization

### Current Performance
- **Lint**: <2 min
- **Tests (4 shards)**: ~3-4 min
- **Burn-in**: ~30 min (only on PRs to main)
- **Coverage**: ~3 min
- **Total (without burn-in)**: ~10 min

### Speedup Strategies

**1. Parallel Sharding**
- Default: 4 shards
- Current: Tests split across 4 jobs = **4× speedup**
- Can increase to 8 shards if test suite grows

**2. Caching**
- npm dependencies cached by `package-lock.json` hash
- Reduces install time from ~3 min to ~30 sec

**3. Selective Testing (Local)**
- Use `./scripts/test-changed.sh` during development
- Runs only affected tests = **50-80% time reduction**
- Full suite still runs on CI

---

## Required Secrets

Currently no secrets required for basic CI pipeline.

**Optional secrets** (see `ci-secrets-checklist.md` for setup):
- `SLACK_WEBHOOK` - Slack notifications on failure
- `SUPABASE_TEST_URL` - Test database (if using dedicated test env)

---

## Badge URLs

Add these to your README.md:

**Test Status Badge:**
```markdown
![Tests](https://github.com/lucasven/nexfinapp/actions/workflows/test.yml/badge.svg)
```

**Coverage Badge** (if using coveralls or codecov):
```markdown
![Coverage](https://img.shields.io/badge/coverage-70%25-green)
```

---

## Notifications (Optional)

To enable Slack notifications on test failures:

1. Create a Slack webhook in your workspace
2. Add `SLACK_WEBHOOK` secret to GitHub repository settings
3. Uncomment the notification step in `.github/workflows/test.yml`

---

## Troubleshooting

### "Tests pass locally but fail in CI"

**Common causes:**
1. **Environment differences**: CI uses Ubuntu, you may be on macOS/Windows
2. **Timing issues**: CI may be slower/faster than local
3. **Missing cleanup**: Tests pollution not caught locally due to different execution order

**Debug steps:**
```bash
# Run with CI environment variable
CI=true npm test

# Run burn-in locally to catch flakiness
./scripts/burn-in.sh 10
```

### "Burn-in passes on PR but fails on schedule"

This is actually **good** - the weekly burn-in caught flakiness that the PR burn-in missed (due to randomness).

**Action**: Fix the flaky test even though PR passed.

### "CI is too slow"

**Options:**
1. Increase shards (4 → 8): Edit `.github/workflows/test.yml` matrix
2. Remove burn-in from PR workflow (keep on schedule only)
3. Use selective testing for faster feedback: `./scripts/test-changed.sh`

---

## Maintenance

### Updating Node version

1. Update `package.json` engines field
2. Update `.github/workflows/test.yml` node-version field
3. Create `.nvmrc` file with version (optional)

### Adjusting burn-in iterations

**Current**: 10 iterations

**To change**:
- Edit `.github/workflows/test.yml` burn-in step
- Change `ITERATIONS=10` to desired number
- Lower = faster feedback, higher = more confidence

**Recommendations:**
- 3 iterations: Quick feedback
- 10 iterations: Standard (current)
- 100 iterations: High confidence

---

## Best Practices

✅ **DO:**
- Run `./scripts/ci-local.sh` before pushing to catch issues early
- Fix flaky tests immediately (don't ignore burn-in failures)
- Keep tests fast (<15 min total suite execution)
- Add new tests for bug fixes to prevent regressions

❌ **DON'T:**
- Skip CI checks with `[skip ci]` (except for docs-only changes)
- Increase timeout limits to hide slow tests - fix the root cause instead
- Merge PRs with failing burn-in "just this once"
- Disable coverage thresholds without team agreement

---

## Next Steps

1. **Monitor first CI run**: Push code and watch the pipeline execute
2. **Adjust shard count**: If tests complete in <3 min per shard, reduce shards to save resources
3. **Enable notifications**: Set up Slack webhook for failure alerts
4. **Review coverage**: Check which areas need more test coverage
5. **Optimize slow tests**: Profile and improve any tests taking >5 seconds

---

**Questions or issues?** Check GitHub Actions logs or run `./scripts/ci-local.sh` for debugging.
