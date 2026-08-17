# Claude Code Status Line

A boxed, Catppuccin Mocha-themed status line for Claude Code. Shows model, effort
level, hostname, directory (with drift-from-project-root indicator), git branch,
context usage, cache hit rate, cost (with burn rate), lines changed, and 5h/7d rate
limits — all in an adaptive box that degrades gracefully as the terminal narrows.

## Setup on a new machine

Requirements: Node.js and Git (for `git branch`) on PATH.

1. Clone this repo somewhere (or just copy `statusline.mjs`):

   ```bash
   git clone https://github.com/sm-steel/claude-code-statusline.git ~/.claude-statusline-repo
   cp ~/.claude-statusline-repo/statusline.mjs ~/.claude/statusline.mjs
   ```

2. Merge this into `~/.claude/settings.json` (add the key — don't overwrite the rest
   of the file):

   ```json
   {
     "statusLine": {
       "type": "command",
       "command": "node ~/.claude/statusline.mjs",
       "refreshInterval": 5
     }
   }
   ```

3. Restart Claude Code, or just send a new message — the status line picks up
   automatically.

## Updating

Pull the latest script and re-copy it into place:

```bash
cd ~/.claude-statusline-repo && git pull
cp statusline.mjs ~/.claude/statusline.mjs
```
