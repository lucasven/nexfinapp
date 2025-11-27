#!/bin/bash

# BMAD Next Action - Shows what needs to be done next
# Usage: ./bmad-next.sh

PROJECT_DIR="/Users/lucasventurella/code/lv-expense-tracker"
SPRINT_STATUS="$PROJECT_DIR/docs/sprint-artifacts/sprint-status.yaml"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}╔════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║        BMAD Sprint Status              ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════╝${NC}"
echo ""

# Find current epic - contexted but retro NOT completed
get_current_epic() {
    local contexted_epics=$(grep -E "^  epic-[0-9]+: contexted" "$SPRINT_STATUS" | sed 's/:.*//' | tr -d ' ' | sed 's/epic-//')
    
    for epic_num in $contexted_epics; do
        local retro_status=$(grep -E "^  epic-${epic_num}-retrospective:" "$SPRINT_STATUS" | sed 's/.*: //' | tr -d ' ')
        if [ "$retro_status" != "completed" ]; then
            echo "epic-${epic_num}"
            return
        fi
    done
    
    # Fallback: first backlog epic minus 1
    local first_backlog=$(grep -E "^  epic-[0-9]+: backlog" "$SPRINT_STATUS" | head -1 | sed 's/:.*//' | tr -d ' ' | sed 's/epic-//')
    if [ -n "$first_backlog" ]; then
        echo "epic-$((first_backlog - 1))"
        return
    fi
    
    echo ""
}

current_epic=$(get_current_epic)
epic_num=$(echo "$current_epic" | sed 's/epic-//')

echo -e "${BLUE}Current Epic:${NC} $current_epic"
echo ""

# Show epic progress
echo -e "${BLUE}Epic $epic_num Stories:${NC}"
grep -E "^  ${epic_num}-" "$SPRINT_STATUS" | while read line; do
    story=$(echo "$line" | cut -d: -f1 | tr -d ' ')
    status=$(echo "$line" | cut -d: -f2 | tr -d ' ')
    
    case $status in
        "done") icon="✅" ;;
        "review") icon="👀" ;;
        "in-progress") icon="🔨" ;;
        "ready-for-dev") icon="📋" ;;
        "drafted") icon="📝" ;;
        "backlog") icon="📦" ;;
        *) icon="❓" ;;
    esac
    
    echo "  $icon $story: $status"
done

echo ""

# Determine next action
in_progress=$(grep -E "^  ${epic_num}-" "$SPRINT_STATUS" | grep ": in-progress" | head -1 | sed 's/:.*//' | tr -d ' ')
review=$(grep -E "^  ${epic_num}-" "$SPRINT_STATUS" | grep ": review" | head -1 | sed 's/:.*//' | tr -d ' ')
ready=$(grep -E "^  ${epic_num}-" "$SPRINT_STATUS" | grep ": ready-for-dev" | head -1 | sed 's/:.*//' | tr -d ' ')
drafted=$(grep -E "^  ${epic_num}-" "$SPRINT_STATUS" | grep ": drafted" | head -1 | sed 's/:.*//' | tr -d ' ')
backlog=$(grep -E "^  ${epic_num}-" "$SPRINT_STATUS" | grep ": backlog" | head -1 | sed 's/:.*//' | tr -d ' ')

echo -e "${YELLOW}═══ NEXT ACTION ═══${NC}"
echo ""

if [ -n "$in_progress" ]; then
    echo -e "${GREEN}Continue development:${NC} $in_progress"
    echo ""
    echo "Run Claude Code with:"
    echo -e "  ${CYAN}claude \"*dev-story $in_progress - continue implementation\"${NC}" --dangerously-skip-permissions
    
elif [ -n "$review" ]; then
    echo -e "${GREEN}Review needed:${NC} $review" 
    echo ""
    echo "Run Claude Code with:"
    echo -e "  ${CYAN}claude \"*code-review $review\"${NC}" --dangerously-skip-permissions
    
elif [ -n "$ready" ]; then
    echo -e "${GREEN}Ready for development:${NC} $ready"
    echo ""
    echo "Run Claude Code with:"
    echo -e "  ${CYAN}claude \"*dev-story $ready\"${NC}" --dangerously-skip-permissions
    
elif [ -n "$drafted" ]; then
    echo -e "${GREEN}Needs context:${NC} $drafted"
    echo ""
    echo "Run Claude Code with:"
    echo -e "  ${CYAN}claude \"*story-ready $drafted\"${NC}" --dangerously-skip-permissions
    
elif [ -n "$backlog" ]; then
    echo -e "${GREEN}Needs drafting:${NC} $backlog"
    echo ""
    echo "Run Claude Code with:"
    echo -e "  ${CYAN}claude \"*create-story $backlog\"${NC}" --dangerously-skip-permissions
    
else
    echo -e "${GREEN}🎉 Epic $epic_num COMPLETE!${NC}"
    echo ""
    echo "Next steps:"
    echo "  1. Run retrospective: *retrospective"
    echo "  2. Context next epic: *epic-tech-context epic-$((epic_num + 1))"
fi

echo ""