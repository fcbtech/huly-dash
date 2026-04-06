#!/bin/bash
# Source this file in your .zshrc/.bashrc:
#   source ~/Projects/agents/huly/hooks/gh-huly-wrapper.sh
#
# Then use `gh` normally — it intercepts `gh pr create` and updates Huly automatically.

HULY_UPDATE="${HULY_DASH_DIR:-$HOME/Projects/agents/huly}/src/huly-update.js"

gh() {
  # Pass through to real gh for everything except `pr create`
  if [[ "$1" == "pr" && "$2" == "create" ]]; then
    _gh_pr_create_with_huly "$@"
  else
    command gh "$@"
  fi
}

_gh_pr_create_with_huly() {
  # Extract issue number from branch name
  local branch
  branch=$(git symbolic-ref --short HEAD 2>/dev/null)
  local issue
  issue=$(echo "$branch" | grep -oE 'ENG-[0-9]+' | head -1)

  # Run the real `gh pr create` and capture output
  local output
  output=$(command gh "$@" 2>&1)
  local exit_code=$?

  echo "$output"

  if [[ $exit_code -ne 0 ]]; then
    return $exit_code
  fi

  # Extract PR URL from output (gh pr create prints it on the last line)
  local pr_url
  pr_url=$(echo "$output" | grep -oE 'https://github.com/[^ ]+/pull/[0-9]+' | tail -1)

  if [[ -n "$issue" && -n "$pr_url" ]]; then
    echo ""
    echo "🔗 Huly: updating $issue (PR created)"
    node "$HULY_UPDATE" pr-created "$issue" --pr "$pr_url" 2>/dev/null
  elif [[ -n "$issue" ]]; then
    echo ""
    echo "🔗 Huly: updating $issue (PR created)"
    node "$HULY_UPDATE" pr-created "$issue" 2>/dev/null
  fi

  return $exit_code
}
