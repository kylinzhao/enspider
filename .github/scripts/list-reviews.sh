#!/bin/bash
# Script to list and summarize code reviews
# Usage: ./list-reviews.sh [options]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

show_help() {
  echo "Usage: $0 [OPTIONS]"
  echo ""
  echo "Options:"
  echo "  -a, --all         List all reviewed commits"
  echo "  -s, --status S    Filter by status (Approved|Request-Changes|etc)"
  echo "  -g, --grade G     Filter by grade (A|B|C|D|F)"
  echo "  -r, --risk R      Filter by risk (Low|Medium|High)"
  echo "  -l, --latest      Show latest review only"
  echo "  -h, --help        Show this help"
  echo ""
  echo "Examples:"
  echo "  $0 --all                      # List all reviews"
  echo "  $0 --status Request-Changes   # Show requested changes"
  echo "  $0 --grade A                  # Show A-rated commits"
  echo "  $0 --latest                   # Show latest review"
}

list_all_reviews() {
  echo -e "${BLUE}📋 All Reviewed Commits${NC}"
  echo "═════════════════════════════════════════"

  git log --grep="Reviewed-By" --format="%H|%ad|%s" --date=short | while IFS='|' read -r hash date subject; do
    commit_msg=$(git log $hash -1 --format=%B)

    grade=$(echo "$commit_msg" | grep "Review-Grade:" | sed 's/Review-Grade: //')
    status=$(echo "$commit_msg" | grep "Review-Status:" | sed 's/Review-Status: //')
    risk=$(echo "$commit_msg" | grep "Review-Risk:" | sed 's/Review-Risk: //')
    reviewer=$(echo "$commit_msg" | grep "Reviewed-By:" | sed 's/Reviewed-By: //')

    # Color code grades
    case $grade in
      A) grade_color=$GREEN ;;
      B) grade_color=$BLUE ;;
      C) grade_color=$YELLOW ;;
      D|F) grade_color=$RED ;;
    esac

    # Color code risk
    case $risk in
      Low) risk_color=$GREEN ;;
      Medium) risk_color=$YELLOW ;;
      High) risk_color=$RED ;;
    esac

    echo ""
    echo -e "${GREEN}➜${NC} $date ${GREEN}$hash${NC}"
    echo "   Subject: $subject"
    echo -e "   Reviewer: $reviewer"
    echo -e "   Grade: ${grade_color}${grade}${NC} | Status: $status | Risk: ${risk_color}${risk}${NC}"
  done
}

show_latest_review() {
  echo -e "${BLUE}📋 Latest Code Review${NC}"
  echo "═════════════════════════════════════════"
  echo ""

  latest_hash=$(git log --grep="Reviewed-By" -1 --format=%H)
  commit_msg=$(git log $latest_hash -1 --format=%B)

  echo -e "${GREEN}Commit:${NC} $latest_hash"
  echo -e "${GREEN}Date:${NC}    $(git log $latest_hash -1 --format=%ad --date=short)"
  echo -e "${GREEN}Author:${NC}  $(git log $latest_hash -1 --format=%an)"
  echo ""

  echo -e "${BLUE}Review Summary${NC}"
  echo "─────────────────────────────────────────"

  echo "$commit_msg" | grep -E "^(Reviewed-|Review-)" | while IFS=': ' read -r key value; do
    case $key in
      Reviewed-By)
        echo -e "👤 Reviewer: $value"
        ;;
      Reviewed-Date)
        echo -e "📅 Date: $value"
        ;;
      Review-Grade)
        echo -e "📊 Grade: $value"
        ;;
      Review-Status)
        echo -e "✅ Status: $value"
        ;;
      Review-Risk)
        echo -e "⚠️  Risk: $value"
        ;;
      Review-Issue-*)
        echo -e "❌ Issue: $value"
        ;;
      Review-Suggestion-*)
        echo -e "💡 Suggestion: $value"
        ;;
      Review-Recommendation)
        echo -e "🎯 Recommendation: $value"
        ;;
    esac
  done

  echo ""
  echo "═════════════════════════════════════════"
}

# Parse arguments
case "$1" in
  -a|--all)
    list_all_reviews
    ;;
  -l|--latest)
    show_latest_review
    ;;
  -s|--status)
    shift
    echo -e "${BLUE}📋 Reviews with Status: $1${NC}"
    git log --grep="Reviewed-By" --grep="Review-Status: $1" --oneline
    ;;
  -g|--grade)
    shift
    echo -e "${BLUE}📋 Reviews with Grade: $1${NC}"
    git log --grep="Reviewed-By" --grep="Review-Grade: $1" --oneline
    ;;
  -r|--risk)
    shift
    echo -e "${BLUE}📋 Reviews with Risk: $1${NC}"
    git log --grep="Reviewed-By" --grep="Review-Risk: $1" --oneline
    ;;
  -h|--help|*)
    show_help
    ;;
esac
