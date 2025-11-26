#!/bin/bash
# Selective Testing Script
# Runs only tests affected by changed files
# Usage: ./scripts/test-changed.sh [base-branch]

set -e

BASE_BRANCH=${1:-main}

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎯 Selective Test Execution"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Comparing against: $BASE_BRANCH"
echo ""

# Change to project root
cd "$(dirname "$0")/.."

# Get changed files
CHANGED_FILES=$(git diff --name-only $BASE_BRANCH...HEAD 2>/dev/null || git diff --name-only HEAD~1)

if [ -z "$CHANGED_FILES" ]; then
  echo "⚠️  No changed files detected"
  echo "Running full test suite as fallback..."
  npm test
  exit 0
fi

echo "Changed files:"
echo "$CHANGED_FILES" | sed 's/^/  - /'
echo ""

# Check if changes affect test files directly
TEST_FILES_CHANGED=$(echo "$CHANGED_FILES" | grep "\.test\.ts$" || true)

# Check if changes affect source code that has tests
SOURCE_FILES_CHANGED=$(echo "$CHANGED_FILES" | grep "^src/.*\.ts$" | grep -v "\.test\.ts$" || true)

if [ -n "$TEST_FILES_CHANGED" ]; then
  echo "📝 Test files changed directly:"
  echo "$TEST_FILES_CHANGED" | sed 's/^/  - /'
  echo ""
fi

if [ -n "$SOURCE_FILES_CHANGED" ]; then
  echo "📦 Source files changed (may have tests):"
  echo "$SOURCE_FILES_CHANGED" | sed 's/^/  - /'
  echo ""
fi

# Determine test strategy
if echo "$CHANGED_FILES" | grep -q "package\.json\|package-lock\.json\|jest\.config"; then
  echo "⚠️  Infrastructure files changed (package.json, jest.config, etc.)"
  echo "Running FULL test suite for safety..."
  echo ""
  npm test
  exit 0
fi

if echo "$CHANGED_FILES" | grep -q "__tests__/utils/\|__tests__/setup\.ts"; then
  echo "⚠️  Test infrastructure changed (test helpers, setup, fixtures)"
  echo "Running FULL test suite for safety..."
  echo ""
  npm test
  exit 0
fi

# If only a few files changed, run targeted tests
NUM_CHANGED=$(echo "$CHANGED_FILES" | wc -l | tr -d ' ')

if [ "$NUM_CHANGED" -le 5 ]; then
  echo "🎯 Running targeted tests for $NUM_CHANGED changed file(s)..."
  echo ""

  # Build test file pattern from changed source files
  TEST_PATTERN=""

  for file in $SOURCE_FILES_CHANGED; do
    # Convert src/services/foo/bar.ts to bar.test.ts
    TEST_FILE=$(basename "$file" .ts).test.ts

    if [ -z "$TEST_PATTERN" ]; then
      TEST_PATTERN="$TEST_FILE"
    else
      TEST_PATTERN="$TEST_PATTERN|$TEST_FILE"
    fi
  done

  # Add directly changed test files
  for file in $TEST_FILES_CHANGED; do
    TEST_FILE=$(basename "$file")

    if [ -z "$TEST_PATTERN" ]; then
      TEST_PATTERN="$TEST_FILE"
    else
      TEST_PATTERN="$TEST_PATTERN|$TEST_FILE"
    fi
  done

  if [ -n "$TEST_PATTERN" ]; then
    echo "Test pattern: $TEST_PATTERN"
    echo ""
    npm test -- --testPathPattern="($TEST_PATTERN)"
  else
    echo "⚠️  No matching test files found"
    echo "Changed files may not have tests - running full suite..."
    echo ""
    npm test
  fi
else
  echo "⚠️  Many files changed ($NUM_CHANGED files)"
  echo "Running FULL test suite for comprehensive coverage..."
  echo ""
  npm test
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Selective testing complete"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Note: Full test suite still runs on main branch merge in CI"
