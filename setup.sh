#!/usr/bin/env bash
# Sets up (or updates) the Claude Code statusline on this machine.
# Works in Git Bash / WSL on Windows and native bash on Linux/macOS.
#
# Usage: ./setup.sh
# Safe to re-run any time — clones if missing, pulls if present, and
# (re)creates the symlinks and settings.json entries either way.
set -euo pipefail

REPO_URL="https://github.com/sm-steel/claude-code-statusline.git"
REPO_DIR="${CLAUDE_STATUSLINE_REPO_DIR:-$HOME/.claude-statusline-repo}"
CLAUDE_DIR="$HOME/.claude"

mkdir -p "$CLAUDE_DIR"

if [ -d "$REPO_DIR/.git" ]; then
  echo "Updating existing repo at $REPO_DIR..."
  git -C "$REPO_DIR" pull --ff-only
else
  echo "Cloning into $REPO_DIR..."
  git clone "$REPO_URL" "$REPO_DIR"
fi

# Replace whatever is currently at $2 (file, symlink, or nothing) with a symlink to
# $1, so future `git pull`s take effect immediately with no separate copy step.
#
# On Windows, Git Bash's `ln -s` defaults to a mode that can silently fall back to
# copying the file when it lacks symlink privilege — it still exits 0, so the exit
# code alone can't be trusted. MSYS=winsymlinks:nativestrict forces it to attempt a
# real NTFS symlink and fail loudly instead of faking it; `[ -L ]` afterward is the
# actual ground truth on both platforms. No effect on native Linux/macOS bash.
link_or_copy() {
  local source="$1"
  local target="$2"
  mkdir -p "$(dirname "$target")"
  rm -f "$target"
  if MSYS=winsymlinks:nativestrict ln -s "$source" "$target" 2>/dev/null && [ -L "$target" ]; then
    echo "Symlinked $target -> $source"
  else
    rm -f "$target"
    echo "Symlink creation failed for $target."
    echo "On Windows this needs Developer Mode enabled (Settings > Privacy & security >"
    echo "For developers), or running this script as Administrator. Falling back to a"
    echo "plain copy for now — you'll need to re-run this script after each 'git pull'."
    cp "$source" "$target"
  fi
}

link_or_copy "$REPO_DIR/statusline.mjs" "$CLAUDE_DIR/statusline.mjs"
link_or_copy "$REPO_DIR/check-update.mjs" "$CLAUDE_DIR/hooks/check-update.mjs"

# Human-glanceable "what's installed" marker — local only, never committed (see
# .gitignore), regenerated fresh on every run. Never read programmatically.
git -C "$REPO_DIR" log -1 --format='%h  %cI  %s' > "$REPO_DIR/VERSION" 2>/dev/null || true

# Merge the statusLine config and the update-check SessionStart hook into
# settings.json without disturbing any other keys already there.
node "$REPO_DIR/merge-settings.mjs" "$CLAUDE_DIR/settings.json"

echo "Done. Send a new message in Claude Code (or restart it) to see the status line."
