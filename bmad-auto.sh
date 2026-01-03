#!/bin/bash

# BMAD Automation Script for NexFinApp
# Reads sprint-status.yaml and orchestrates Claude Code sessions for story development
#
# Usage: ./bmad-auto.sh [--dry-run] [--single] [--interactive]
#   --dry-run      Show what would be done without executing
#   --single       Run only one phase then stop
#   --interactive  Run in interactive mode (sessions stay open for manual control)

set -e

# Configuration
PROJECT_DIR="/Users/lucasventurella/code/lv-expense-tracker"
SPRINT_STATUS="$PROJECT_DIR/docs/sprint-artifacts/sprint-status.yaml"
STORIES_DIR="$PROJECT_DIR/docs/stories"
ARTIFACTS_DIR="$PROJECT_DIR/docs/sprint-artifacts"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Parse arguments
DRY_RUN=false
SINGLE_RUN=false
INTERACTIVE=false
for arg in "$@"; do
    case $arg in
        --dry-run) DRY_RUN=true ;;
        --single) SINGLE_RUN=true ;;
        --interactive) INTERACTIVE=true ;;
    esac
done

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Get current epic being worked on
# Logic: Find the epic that is 'contexted' but its retrospective is NOT 'completed'
# Or: Find the first 'backlog' epic and return the previous one
get_current_epic() {
    # Get all epic numbers that are contexted
    local contexted_epics=$(grep -E "^  epic-[0-9]+: contexted" "$SPRINT_STATUS" | sed 's/:.*//' | tr -d ' ' | sed 's/epic-//')
    
    for epic_num in $contexted_epics; do
        # Check if this epic's retrospective is completed
        local retro_status=$(grep -E "^  epic-${epic_num}-retrospective:" "$SPRINT_STATUS" | sed 's/.*: //' | tr -d ' ')
        
        # If retro is NOT completed (optional or missing), this is the active epic
        if [ "$retro_status" != "completed" ]; then
            echo "epic-${epic_num}"
            return
        fi
    done
    
    # Fallback: find first backlog epic and return the previous one
    local first_backlog=$(grep -E "^  epic-[0-9]+: backlog" "$SPRINT_STATUS" | head -1 | sed 's/:.*//' | tr -d ' ' | sed 's/epic-//')
    
    if [ -n "$first_backlog" ]; then
        local prev_epic=$((first_backlog - 1))
        # Verify the previous epic exists and is contexted
        local prev_status=$(grep -E "^  epic-${prev_epic}:" "$SPRINT_STATUS" | sed 's/.*: //' | tr -d ' ')
        if [ "$prev_status" = "contexted" ]; then
            echo "epic-${prev_epic}"
            return
        fi
    fi
    
    echo ""
}

# Get epic number from epic key (e.g., "epic-4" -> "4")
get_epic_number() {
    echo "$1" | sed 's/epic-//'
}

# Check if epic is complete (all stories done)
is_epic_complete() {
    local epic_num=$1
    local pattern="^  ${epic_num}-[0-9]"
    
    # Get all stories for this epic
    local all_stories=$(grep -E "$pattern" "$SPRINT_STATUS" | wc -l)
    local done_stories=$(grep -E "$pattern" "$SPRINT_STATUS" | grep ": done" | wc -l)
    
    if [ "$all_stories" -eq "$done_stories" ] && [ "$all_stories" -gt 0 ]; then
        return 0  # true - epic is complete
    fi
    return 1  # false - epic not complete
}

# Find next actionable story and its required action
get_next_action() {
    local epic_num=$1
    local pattern="^  ${epic_num}-"
    
    # Priority order for actions:
    # 1. in-progress stories need *dev-story (continue) or *code-review (if dev thinks done)
    # 2. review stories need *code-review then *story-done
    # 3. ready-for-dev stories need *dev-story
    # 4. drafted stories need *story-ready
    # 5. backlog stories need *create-story (but only if previous story is done)
    
    # Check for in-progress
    local in_progress=$(grep -E "$pattern" "$SPRINT_STATUS" | grep ": in-progress" | head -1 | sed 's/:.*//' | tr -d ' ')
    if [ -n "$in_progress" ]; then
        echo "$in_progress|dev-story|in-progress"
        return
    fi
    
    # Check for review
    local review=$(grep -E "$pattern" "$SPRINT_STATUS" | grep ": review" | head -1 | sed 's/:.*//' | tr -d ' ')
    if [ -n "$review" ]; then
        echo "$review|code-review|review"
        return
    fi
    
    # Check for ready-for-dev
    local ready=$(grep -E "$pattern" "$SPRINT_STATUS" | grep ": ready-for-dev" | head -1 | sed 's/:.*//' | tr -d ' ')
    if [ -n "$ready" ]; then
        echo "$ready|dev-story|ready-for-dev"
        return
    fi
    
    # Check for drafted
    local drafted=$(grep -E "$pattern" "$SPRINT_STATUS" | grep ": drafted" | head -1 | sed 's/:.*//' | tr -d ' ')
    if [ -n "$drafted" ]; then
        echo "$drafted|story-ready|drafted"
        return
    fi
    
    # Check for backlog (only first one, BMAD drafts one at a time)
    local backlog=$(grep -E "$pattern" "$SPRINT_STATUS" | grep ": backlog" | head -1 | sed 's/:.*//' | tr -d ' ')
    if [ -n "$backlog" ]; then
        echo "$backlog|create-story|backlog"
        return
    fi
    
    echo ""
}

# Find story file location
find_story_file() {
    local story_key=$1
    
    # Check sprint-artifacts first (newer stories)
    if [ -f "$ARTIFACTS_DIR/${story_key}.md" ]; then
        echo "$ARTIFACTS_DIR/${story_key}.md"
        return
    fi
    
    # Check stories folder
    if [ -f "$STORIES_DIR/${story_key}.md" ]; then
        echo "$STORIES_DIR/${story_key}.md"
        return
    fi
    
    echo ""
}

# Build prompt for Claude Code based on action
build_prompt() {
    local story_key=$1
    local action=$2
    local current_status=$3
    local story_file=$4
    
    case $action in
        "create-story")
            cat <<EOF
# BMAD Task: Create Story Draft

Run the BMAD command: /create-story

Story to draft: $story_key

Instructions:
1. Read the epic tech spec in docs/sprint-artifacts/
2. Create the story file at docs/sprint-artifacts/${story_key}.md
3. Follow the story template format
4. Update sprint-status.yaml: change "$story_key: backlog" to "$story_key: drafted"

When complete, exit with: BMAD_COMPLETE: $story_key drafted
EOF
            ;;
        
        "story-ready")
            cat <<EOF
# BMAD Task: Prepare Story for Development

Run the BMAD command: /story-ready

Story: $story_key
Story file: $story_file

Instructions:
1. Read the drafted story at $story_file
2. Generate the story context file: ${story_file%.md}_context.xml
3. Ensure all acceptance criteria are clear
4. Ensure dev notes have enough context
5. Update sprint-status.yaml: change "$story_key: drafted" to "$story_key: ready-for-dev"

When complete, exit with: BMAD_COMPLETE: $story_key ready-for-dev
EOF
            ;;
        
        "dev-story")
            local context_file="${story_file%.md}_context.xml"
            cat <<EOF
# BMAD Task: Develop Story

Run the BMAD command: /dev-story

Story: $story_key
Story file: $story_file
Context file: $context_file

Instructions:
1. Read the story file and context file thoroughly
2. Implement all tasks listed in the story
3. Write tests as specified in the acceptance criteria
4. Update the "Dev Agent Record" section with:
   - Files modified/created
   - Completion notes
   - Any issues encountered
5. Mark all task checkboxes as complete
6. Update sprint-status.yaml: change "$story_key: ready-for-dev" to "$story_key: in-progress" (if not already)
7. When ALL tasks complete, update to "$story_key: review"

When implementation is complete, exit with: BMAD_COMPLETE: $story_key review
If you need to continue in another session, exit with: BMAD_CONTINUE: $story_key in-progress
EOF
            ;;
        
        "code-review")
            cat <<EOF
# BMAD Task: Code Review

Run the BMAD command: /code-review

Story: $story_key
Story file: $story_file

Instructions:
1. Review all files listed in the Dev Agent Record
2. Run all tests and ensure they pass
3. Check that all acceptance criteria are met
4. Verify code follows project patterns
5. If issues found, document them and exit with BMAD_ISSUES
6. If approved, run /story-done to complete
7. Update sprint-status.yaml: change "$story_key: review" to "$story_key: done"

When review passes, exit with: BMAD_COMPLETE: $story_key done
If issues found, exit with: BMAD_ISSUES: $story_key [description]
EOF
            ;;
    esac
}

# Run Claude Code with prompt
# Sets global CLAUDE_OUTPUT with the session output
run_claude_session() {
    local prompt=$1
    local story_key=$2

    log_info "Starting Claude Code session for: $story_key"

    CLAUDE_OUTPUT=""

    if [ "$DRY_RUN" = true ]; then
        echo "------- DRY RUN: Would send this prompt -------"
        echo "$prompt"
        echo "------------------------------------------------"
        return 0
    fi

    cd "$PROJECT_DIR"

    # Write prompt to temp file to handle multi-line and special characters
    local prompt_file=$(mktemp)
    local output_file=$(mktemp)
    echo "$prompt" > "$prompt_file"

    if [ "$INTERACTIVE" = true ]; then
        # Interactive mode - stays open for manual control
        log_info "Running in INTERACTIVE mode (session stays open)"
        cat "$prompt_file" | claude | tee "$output_file"
    else
        # Headless mode (-p) - exits after completion
        # Read prompt from stdin to avoid shell expansion issues
        cat "$prompt_file" | claude -p --dangerously-skip-permissions | tee "$output_file"
    fi

    local exit_code=$?
    CLAUDE_OUTPUT=$(cat "$output_file")
    rm -f "$prompt_file" "$output_file"

    return $exit_code
}

# Check if output contains BMAD_ISSUES and extract the message
check_for_issues() {
    local output=$1

    # Look for BMAD_ISSUES: and extract the rest of the line
    local issues_line=$(echo "$output" | grep -o "BMAD_ISSUES:.*" | head -1)

    if [ -n "$issues_line" ]; then
        # Extract the message after BMAD_ISSUES:
        echo "${issues_line#BMAD_ISSUES:}" | sed 's/^ *//'
        return 0
    fi

    return 1
}

# Build prompt for fixing issues found in code review
build_fix_issues_prompt() {
    local story_key=$1
    local story_file=$2
    local issues=$3
    local context_file="${story_file%.md}_context.xml"

    cat <<EOF
# BMAD Task: Fix Code Review Issues

Story: $story_key
Story file: $story_file
Context file: $context_file

## Issues Found in Code Review:
$issues

## Instructions:
1. Read the story file and context file
2. Address ALL the issues listed above
3. Update the "Dev Agent Record" section with fixes made
4. Run tests to ensure everything passes
5. Once fixed, update sprint-status.yaml: change "$story_key: in-progress" to "$story_key: review"

When fixes are complete, exit with: BMAD_COMPLETE: $story_key review
If you need to continue in another session, exit with: BMAD_CONTINUE: $story_key in-progress
EOF
}

# Main loop
main() {
    log_info "BMAD Automation Starting"
    log_info "Project: $PROJECT_DIR"
    log_info "Dry run: $DRY_RUN"
    log_info "Interactive: $INTERACTIVE"
    
    if [ ! -f "$SPRINT_STATUS" ]; then
        log_error "Sprint status file not found: $SPRINT_STATUS"
        exit 1
    fi
    
    while true; do
        # Get current epic
        local current_epic=$(get_current_epic)
        
        if [ -z "$current_epic" ]; then
            log_warn "No active epic found (all epics are backlog or done)"
            exit 0
        fi
        
        local epic_num=$(get_epic_number "$current_epic")
        log_info "Current Epic: $current_epic (Epic $epic_num)"
        
        # Check if epic is complete
        if is_epic_complete "$epic_num"; then
            log_success "🎉 Epic $epic_num is COMPLETE!"
            log_warn "Please run retrospective manually (*retrospective), then context the next epic (*epic-tech-context)"
            log_info "After retrospective, update sprint-status.yaml:"
            log_info "  - Set epic-${epic_num}-retrospective: completed"
            log_info "  - Set epic-$((epic_num + 1)): contexted"
            exit 0
        fi
        
        # Get next action
        local action_info=$(get_next_action "$epic_num")
        
        if [ -z "$action_info" ]; then
            log_warn "No actionable stories found in Epic $epic_num"
            exit 0
        fi
        
        # Parse action info
        IFS='|' read -r story_key action current_status <<< "$action_info"
        
        log_info "Next action: $action for $story_key (current: $current_status)"
        
        # Find story file
        local story_file=$(find_story_file "$story_key")
        
        if [ -z "$story_file" ] && [ "$action" != "create-story" ]; then
            log_error "Story file not found for: $story_key"
            log_info "Expected locations:"
            log_info "  - $ARTIFACTS_DIR/${story_key}.md"
            log_info "  - $STORIES_DIR/${story_key}.md"
            exit 1
        fi
        
        # Build and run prompt
        local prompt=$(build_prompt "$story_key" "$action" "$current_status" "$story_file")

        run_claude_session "$prompt" "$story_key"

        # Check if code-review found issues - fallback to dev to fix them
        if [ "$action" = "code-review" ]; then
            local issues=$(check_for_issues "$CLAUDE_OUTPUT")
            if [ -n "$issues" ]; then
                log_warn "Code review found issues: $issues"
                log_info "Falling back to dev-story to fix issues..."

                # Build fix prompt and run another session
                local fix_prompt=$(build_fix_issues_prompt "$story_key" "$story_file" "$issues")
                run_claude_session "$fix_prompt" "$story_key"

                # After fixing, the loop will continue and pick up the next action
                # (which should be code-review again if status was set back to review)
            fi
        fi

        if [ "$SINGLE_RUN" = true ]; then
            log_info "Single run mode - stopping after one action"
            exit 0
        fi

        # Small delay between sessions
        log_info "Waiting 2 seconds before checking next action..."
        sleep 2
    done
}

main "$@"