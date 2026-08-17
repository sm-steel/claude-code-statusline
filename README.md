# Claude Code Status Line

A boxed, Catppuccin Mocha-themed status line for Claude Code. Shows model, effort
level, hostname, directory (with drift-from-project-root indicator), git branch,
context usage, cache hit rate, cost (with burn rate), lines changed, and 5h/7d rate
limits — all in an adaptive box that degrades gracefully as the terminal narrows.

![Status line example](docs/screenshot.png)

## Setup on a new machine

Requirements: Node.js and Git on PATH. Works in Git Bash / WSL on Windows and native
bash on Linux/macOS.

```bash
git clone https://github.com/sm-steel/claude-code-statusline.git ~/.claude-statusline-repo
cd ~/.claude-statusline-repo
bash setup.sh
```

That's it — `setup.sh`:

1. Symlinks `~/.claude/statusline.mjs` to the repo's `statusline.mjs` (falls back to a
   plain copy if symlinks aren't available — see below)
2. Merges the `statusLine` config into `~/.claude/settings.json`, without touching
   any other settings already there

Send a new message in Claude Code (or restart it) and the status line appears.

### Windows symlink note

Creating a symlink on Windows needs either **Developer Mode** enabled (Settings >
Privacy & security > For developers) or running the script as Administrator. Without
either, `setup.sh` falls back to a plain copy and tells you so — in that case you'll
need to re-run `setup.sh` after each update instead of it applying automatically.

## Updating

Re-run the same script on any machine — it pulls the latest and re-applies the
symlink/settings merge (safe to run repeatedly):

```bash
cd ~/.claude-statusline-repo && bash setup.sh
```

If your machine has a real symlink (not the copy fallback), a plain `git pull` in the
repo is actually enough on its own — the running script picks up changes immediately
since `~/.claude/statusline.mjs` *is* the repo file, not a copy of it.
