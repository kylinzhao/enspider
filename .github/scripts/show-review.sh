#!/bin/bash
# Script to display code review information from commits
# Usage: ./show-review.sh [commit-hash]

set -e

COMMIT=${1:-HEAD}

echo "📋 Code Review Information"
echo "═════════════════════════════════════════"
echo ""

git show "$COMMIT" --format=fuller | grep -A 20 "Review-" || echo "No review information found"

echo ""
echo "═════════════════════════════════════════"

# Show issues count
HIGH_COUNT=$(git log "$COMMIT" --format=%B | grep -c "Review-Issue.*HIGH" || echo "0")
MEDIUM_COUNT=$(git log "$COMMIT" --format=%B | grep -c "Review-Suggestion.*MEDIUM" || echo "0")

echo "📊 Issues Summary:"
echo "   HIGH: $HIGH_COUNT"
echo "   MEDIUM: $MEDIUM_COUNT"
