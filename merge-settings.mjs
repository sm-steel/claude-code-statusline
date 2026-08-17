#!/usr/bin/env node
// Merges the statusLine config into ~/.claude/settings.json without disturbing any
// other keys already there. Refuses to touch the file if it can't be parsed, rather
// than risk clobbering hand-edited settings.
//
// Usage: node merge-settings.mjs <path-to-settings.json>

import fs from 'node:fs';

const settingsPath = process.argv[2];
if (!settingsPath) {
  console.error('Usage: node merge-settings.mjs <path-to-settings.json>');
  process.exit(1);
}

let settings = {};
if (fs.existsSync(settingsPath)) {
  const raw = fs.readFileSync(settingsPath, 'utf8').trim();
  if (raw) {
    try {
      settings = JSON.parse(raw);
    } catch (e) {
      console.error(`${settingsPath} exists but is not valid JSON — refusing to touch it.`);
      console.error(e.message);
      console.error('Fix the JSON, or manually add this key:');
      console.error(JSON.stringify({ statusLine: statusLineConfig() }, null, 2));
      process.exit(1);
    }
  }
}

function statusLineConfig() {
  return {
    type: 'command',
    command: 'node ~/.claude/statusline.mjs',
    refreshInterval: 5,
  };
}

settings.statusLine = statusLineConfig();

fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
console.log(`Updated ${settingsPath}`);
