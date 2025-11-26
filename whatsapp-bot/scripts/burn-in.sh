#!/bin/bash
# Burn-In Loop Script
# Runs tests multiple times to detect flaky tests
# Usage: ./scripts/burn-in.sh [iterations]

set -e

# Default to 10 iterations if not specified
ITERATIONS=${1:-10}

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔥 Burn-In Loop - Flaky Test Detection"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Target: $ITERATIONS consecutive passes required"
echo "Failure threshold: Even ONE failure = flaky test"
echo ""

# Change to project root
cd "$(dirname "$0")/.."

FAILED=0
START_TIME=$(date +%s)

for i in $(seq 1 $ITERATIONS); do
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "🔥 Burn-in iteration $i/$ITERATIONS"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""

  ITERATION_START=$(date +%s)

  if npm test; then
    ITERATION_END=$(date +%s)
    ITERATION_TIME=$((ITERATION_END - ITERATION_START))
    echo ""
    echo "✅ Iteration $i passed (${ITERATION_TIME}s)"
    echo ""
  else
    ITERATION_END=$(date +%s)
    ITERATION_TIME=$((ITERATION_END - ITERATION_START))
    echo ""
    echo "❌ Iteration $i FAILED after ${ITERATION_TIME}s"
    FAILED=$i
    break
  fi
done

END_TIME=$(date +%s)
TOTAL_TIME=$((END_TIME - START_TIME))

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ $FAILED -ne 0 ]; then
  echo "❌ BURN-IN FAILED"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  echo "Failed at iteration: $FAILED/$ITERATIONS"
  echo "Total time: ${TOTAL_TIME}s"
  echo ""
  echo "⚠️  FLAKY TESTS DETECTED"
  echo ""
  echo "Action required:"
  echo "  1. Review test logs above for the failing iteration"
  echo "  2. Identify non-deterministic behavior (timing, ordering, external deps)"
  echo "  3. Fix the flaky test before merging to main"
  echo ""
  echo "Common causes of flakiness:"
  echo "  - Race conditions (missing await, timing issues)"
  echo "  - Test pollution (shared state between tests)"
  echo "  - External dependencies (APIs, databases, time-based logic)"
  echo "  - Insufficient wait conditions"
  echo ""
  exit 1
else
  echo "✅ BURN-IN PASSED"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  echo "All $ITERATIONS iterations successful"
  echo "Total time: ${TOTAL_TIME}s"
  echo "Average per iteration: $((TOTAL_TIME / ITERATIONS))s"
  echo ""
  echo "🎉 Tests are STABLE - no flakiness detected!"
  echo ""
fi
