#!/usr/bin/env node
// Merges the statusLine config and the update-check SessionStart hook into
// ~/.claude/settings.json without disturbing any other keys (or other hooks)
// already there. Refuses to touch the file if it can't be parsed, rather than risk
// clobbering hand-edited settings.
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

// Background SessionStart check: runs in the background (asyncRewake, so it never
// delays session start) and only surfaces to Claude — via exit code 2 — when an
// update is actually available. See check-update.mjs for the check itself.
function sessionStartHookConfig() {
  return {
    type: 'command',
    command: 'node ~/.claude/hooks/check-update.mjs',
    asyncRewake: true,
    timeout: 15,
  };
}

const HOOK_MARKER = 'check-update.mjs'; // identifies *our* SessionStart entry, so re-runs replace it in place

function bail(reason, snippet = { statusLine: statusLineConfig(), hooks: { SessionStart: [{ matcher: '*', hooks: [sessionStartHookConfig()] }] } }) {
  console.error(`${settingsPath}: ${reason} — refusing to touch it.`);
  console.error('Fix the file, or manually add this:');
  console.error(JSON.stringify(snippet, null, 2));
  process.exit(1);
}

// Adds/replaces our SessionStart hook entry without disturbing any other hooks
// (other events, or other SessionStart entries someone else added).
function mergeSessionStartHook(settings) {
  if (settings.hooks !== undefined && (typeof settings.hooks !== 'object' || settings.hooks === null || Array.isArray(settings.hooks))) {
    bail('has a "hooks" key that is not an object', { hooks: { SessionStart: [{ matcher: '*', hooks: [sessionStartHookConfig()] }] } });
  }
  settings.hooks ??= {};

  if (settings.hooks.SessionStart !== undefined && !Array.isArray(settings.hooks.SessionStart)) {
    bail('has a "hooks.SessionStart" key that is not an array', { hooks: { SessionStart: [{ matcher: '*', hooks: [sessionStartHookConfig()] }] } });
  }
  const existing = settings.hooks.SessionStart ?? [];

  // Drop any group that's ours (identified by the command containing our marker),
  // so re-running this script updates in place instead of accumulating duplicates.
  const others = existing.filter((group) => {
    const hooks = Array.isArray(group?.hooks) ? group.hooks : [];
    return !hooks.some((h) => typeof h?.command === 'string' && h.command.includes(HOOK_MARKER));
  });

  settings.hooks.SessionStart = [...others, { matcher: '*', hooks: [sessionStartHookConfig()] }];
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
mergeSessionStartHook(settings);

fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
console.log(`Updated ${settingsPath}`);
