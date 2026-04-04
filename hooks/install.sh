#!/bin/bash
# Install Huly git hooks into a target repository.
#
# Usage:
#   ./install.sh /path/to/your/repo
#
# This copies post-commit and post-merge hooks and adds the gh wrapper to your shell.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TARGET_REPO="${1:-.}"

if [[ ! -d "$TARGET_REPO/.git" ]]; then
  echo "Error: $TARGET_REPO is not a git repository"
  exit 1
fi

HOOKS_DIR="$TARGET_REPO/.git/hooks"

echo "Installing Huly hooks into $TARGET_REPO..."

# Install git hooks
cp "$SCRIPT_DIR/post-commit" "$HOOKS_DIR/post-commit"
chmod +x "$HOOKS_DIR/post-commit"
echo "  ✓ post-commit hook (first commit → Dev Start + In Progress)"

cp "$SCRIPT_DIR/post-merge" "$HOOKS_DIR/post-merge"
chmod +x "$HOOKS_DIR/post-merge"
echo "  ✓ post-merge hook (merge to main → In Review for QA)"

echo ""
echo "To enable the gh pr create wrapper, add this to your ~/.zshrc:"
echo ""
echo "  source $SCRIPT_DIR/gh-huly-wrapper.sh"
echo ""
echo "Then restart your shell or run: source ~/.zshrc"
echo ""
echo "Make sure HULY_DASH_DIR points to your huly-dash install:"
echo "  export HULY_DASH_DIR=$SCRIPT_DIR/.."
echo ""
echo "Branch naming convention: include ENG-XXXX in your branch name, e.g.:"
echo "  git checkout -b ENG-14826/remove-deepcopy"
echo "  git checkout -b feature/ENG-14826-remove-deepcopy"
