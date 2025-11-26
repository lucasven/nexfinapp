#!/bin/bash
# Local CI Mirror Script
# Mirrors the CI pipeline execution locally for debugging
# Usage: ./scripts/ci-local.sh

set -e # Exit on error

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔍 Running CI Pipeline Locally"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Change to project root
cd "$(dirname "$0")/.."

# Stage 1: Lint
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Stage 1: Lint & Code Quality"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

echo "Running TypeScript compiler check..."
npx tsc --noEmit || {
  echo "❌ TypeScript compilation failed"
  exit 1
}
echo "✅ TypeScript check passed"
echo ""

# Check for lint script
if grep -q "\"lint\"" package.json; then
  echo "Running lint..."
  npm run lint || {
    echo "❌ Lint failed"
    exit 1
  }
  echo "✅ Lint passed"
else
  echo "⚠️  No lint script configured - skipping"
fi

echo ""

# Stage 2: Tests
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Stage 2: Test Suite"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

echo "Running full test suite..."
npm test || {
  echo "❌ Tests failed"
  exit 1
}
echo "✅ Tests passed"
echo ""

# Stage 3: Burn-in (reduced iterations for local)
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Stage 3: Burn-In Loop (3 iterations - reduced for local)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

ITERATIONS=3
FAILED=0

for i in $(seq 1 $ITERATIONS); do
  echo "🔥 Burn-in iteration $i/$ITERATIONS"

  if npm test > /dev/null 2>&1; then
    echo "  ✅ Iteration $i passed"
  else
    echo "  ❌ Iteration $i FAILED"
    FAILED=$i
    break
  fi
done

if [ $FAILED -ne 0 ]; then
  echo ""
  echo "❌ BURN-IN FAILED at iteration $FAILED"
  echo "Tests are FLAKY and need investigation"
  exit 1
fi

echo "✅ All $ITERATIONS burn-in iterations passed"
echo ""

# Stage 4: Coverage
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Stage 4: Coverage Report"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

echo "Running tests with coverage..."
npm run test:coverage || {
  echo "❌ Coverage check failed (below 70% threshold)"
  exit 1
}
echo "✅ Coverage meets 70% threshold"
echo ""

# Success
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Local CI Pipeline Complete"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "All quality gates passed:"
echo "  - Lint: ✅"
echo "  - Tests: ✅"
echo "  - Burn-in (3 iterations): ✅"
echo "  - Coverage (70% threshold): ✅"
echo ""
echo "Ready to push to CI!"
