#!/bin/bash
# Script to add code review to a commit using Git trailers
# Usage: ./add-review.sh <commit-hash> <review-file>

set -e

COMMIT_HASH=$1
REVIEW_FILE=$2

if [ -z "$COMMIT_HASH" ] || [ -z "$REVIEW_FILE" ]; then
  echo "Usage: $0 <commit-hash> <review-file>"
  echo "Example: $0 HEAD my-review.txt"
  exit 1
fi

# Create a backup branch
BACKUP_BRANCH="backup-before-review-$(date +%s)"
git branch "$BACKUP_BRANCH"

echo "📝 Adding review to commit $COMMIT_HASH"
echo "💾 Backup branch created: $BACKUP_BRANCH"

# Read review content
REVIEW_CONTENT=$(cat "$REVIEW_FILE")

# Amend the commit with review
export GIT_EDITOR="echo '$REVIEW_CONTENT' >"
git commit --amend --no-edit --allow-empty-message -m "$(git log -1 --pretty=%B)%n%n$REVIEW_CONTENT"

echo "✅ Review added successfully!"
echo ""
echo "📊 Review Summary:"
git log -1 --grep="Review-" --pretty=format:"%nReviewer: %an%nDate: %ad%nGrade: %(Review-Grade)%nStatus: %(Review-Status)%nRisk: %(Review-Risk)%n" --date=short
echo ""
echo "⚠️  To push this review (force push required):"
echo "   git push origin $(git branch --show-current) --force-with-lease"
echo ""
echo "🔄 To revert: git reset --hard $BACKUP_BRANCH"
