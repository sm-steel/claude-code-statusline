#!/usr/bin/env bash
# Sets up (or updates) the Claude Code statusline on this machine.
# Works in Git Bash / WSL on Windows and native bash on Linux/macOS.
#
# Usage: ./setup.sh
# Safe to re-run any time — clones if missing, pulls if present, and
# (re)creates the symlink and settings.json entry either way.
set -euo pipefail

REPO_URL="https://github.com/sm-steel/claude-code-statusline.git"
REPO_DIR="${CLAUDE_STATUSLINE_REPO_DIR:-$HOME/.claude-statusline-repo}"
CLAUDE_DIR="$HOME/.claude"
TARGET="$CLAUDE_DIR/statusline.mjs"
SOURCE="$REPO_DIR/statusline.mjs"

mkdir -p "$CLAUDE_DIR"

if [ -d "$REPO_DIR/.git" ]; then
  echo "Updating existing repo at $REPO_DIR..."
  git -C "$REPO_DIR" pull --ff-only
else
  echo "Cloning into $REPO_DIR..."
  git clone "$REPO_URL" "$REPO_DIR"
fi

# Replace whatever is currently at the target (file, symlink, or nothing) with a
# symlink to the repo copy, so future `git pull`s take effect immediately with no
# separate copy step.
rm -f "$TARGET"
if ln -s "$SOURCE" "$TARGET" 2>/dev/null; then
  echo "Symlinked $TARGET -> $SOURCE"
else
  echo "Symlink creation failed."
  echo "On Windows this needs Developer Mode enabled (Settings > Privacy & security >"
  echo "For developers), or running this script as Administrator. Falling back to a"
  echo "plain copy for now — you'll need to re-run this script after each 'git pull'."
  cp "$SOURCE" "$TARGET"
fi

# Merge the statusLine config into settings.json without disturbing any other keys.
node "$REPO_DIR/merge-settings.mjs" "$CLAUDE_DIR/settings.json"

echo "Done. Send a new message in Claude Code (or restart it) to see the status line."
