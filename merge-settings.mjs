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

function statusLineConfig() {
  return {
    type: 'command',
    command: 'node ~/.claude/statusline.mjs',
    refreshInterval: 5,
  };
}

function bail(reason) {
  console.error(`${settingsPath}: ${reason} — refusing to touch it.`);
  console.error('Fix the file, or manually add this key:');
  console.error(JSON.stringify({ statusLine: statusLineConfig() }, null, 2));
  process.exit(1);
}

let settings = {};
if (fs.existsSync(settingsPath)) {
  let raw;
  try {
    raw = fs.readFileSync(settingsPath, 'utf8').trim();
  } catch (e) {
    bail(`could not be read (${e.code ?? e.message})`);
  }
  if (raw) {
    try {
      settings = JSON.parse(raw);
    } catch (e) {
      bail(`is not valid JSON (${e.message})`);
    }
    // JSON.parse succeeds on any valid JSON value, not just objects — null, arrays,
    // and primitives all parse fine but can't safely take a .statusLine property
    // (arrays silently drop non-index keys from JSON.stringify; null/primitives throw).
    if (settings === null || typeof settings !== 'object' || Array.isArray(settings)) {
      const found = settings === null ? 'null' : Array.isArray(settings) ? 'an array' : typeof settings;
      bail(`must be a JSON object at the top level, found ${found}`);
    }
  }
}

settings.statusLine = statusLineConfig();

fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
console.log(`Updated ${settingsPath}`);
