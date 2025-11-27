#!/bin/bash

# Run integration tests in isolation to prevent inter-suite pollution
# Each test suite runs separately with its own database cleanup

set -e  # Exit on any error

echo "🧪 Running Integration Tests in Isolation"
echo "=========================================="

# Test suites to run
TESTS=(
  "30-day-journey.test.ts"
  "state-machine.test.ts"
  "daily-job.test.ts"
  "weekly-job.test.ts"
  "idempotency.test.ts"
  "destination-handler.integration.test.ts"
)

# Track results
TOTAL_TESTS=0
TOTAL_PASSED=0
TOTAL_FAILED=0
FAILED_SUITES=()

# Run each test suite
for test in "${TESTS[@]}"; do
  echo ""
  echo "📋 Running: $test"
  echo "----------------------------------------"

  # Run test and capture output
  if NODE_ENV=test npm run test:integration -- "$test" 2>&1 | tee /tmp/test-output.txt; then
    # Extract test counts from output
    SUITE_PASSED=$(grep -E "Tests:.*passed" /tmp/test-output.txt | grep -oE "[0-9]+ passed" | grep -oE "[0-9]+" || echo "0")
    SUITE_FAILED=$(grep -E "Tests:.*failed" /tmp/test-output.txt | grep -oE "[0-9]+ failed" | grep -oE "[0-9]+" || echo "0")

    TOTAL_PASSED=$((TOTAL_PASSED + SUITE_PASSED))
    TOTAL_FAILED=$((TOTAL_FAILED + SUITE_FAILED))
    TOTAL_TESTS=$((TOTAL_TESTS + SUITE_PASSED + SUITE_FAILED))

    echo "✅ $test: $SUITE_PASSED passed"
  else
    # Test suite failed
    SUITE_PASSED=$(grep -E "Tests:.*passed" /tmp/test-output.txt | grep -oE "[0-9]+ passed" | grep -oE "[0-9]+" || echo "0")
    SUITE_FAILED=$(grep -E "Tests:.*failed" /tmp/test-output.txt | grep -oE "[0-9]+ failed" | grep -oE "[0-9]+" || echo "0")

    TOTAL_PASSED=$((TOTAL_PASSED + SUITE_PASSED))
    TOTAL_FAILED=$((TOTAL_FAILED + SUITE_FAILED))
    TOTAL_TESTS=$((TOTAL_TESTS + SUITE_PASSED + SUITE_FAILED))
    FAILED_SUITES+=("$test")

    echo "❌ $test: $SUITE_PASSED passed, $SUITE_FAILED failed"
  fi
done

# Print summary
echo ""
echo "=========================================="
echo "📊 Integration Test Summary"
echo "=========================================="
echo "Total Tests: $TOTAL_TESTS"
echo "Passed: $TOTAL_PASSED"
echo "Failed: $TOTAL_FAILED"
if [ "$TOTAL_TESTS" -gt 0 ]; then
  PASS_RATE=$(awk -v passed="$TOTAL_PASSED" -v total="$TOTAL_TESTS" 'BEGIN {printf "%.1f", (passed/total)*100}')
  echo "Pass Rate: ${PASS_RATE}%"
else
  echo "Pass Rate: N/A (no tests run)"
fi
echo ""

if [ ${#FAILED_SUITES[@]} -gt 0 ]; then
  echo "❌ Failed Suites:"
  for suite in "${FAILED_SUITES[@]}"; do
    echo "  - $suite"
  done
  exit 1
else
  echo "✅ All test suites passed!"
  exit 0
fi
