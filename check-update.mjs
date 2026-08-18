#!/usr/bin/env node
// SessionStart hook (asyncRewake): checks whether origin/main has moved past the
// local clone. Runs in the background — Claude Code does not wait for this. Exits 0
// silently in every case except "an update is genuinely available", where it exits 2
// so Claude sees the stderr message as a system reminder and can ask the user before
// doing anything. Never applies an update itself.
//
// Designed to fail safe: any error (offline, auth hiccup, corrupt state file, repo
// not set up yet) falls through to a silent exit 0 rather than a false positive or a
// hung session.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const REPO_DIR = process.env.CLAUDE_STATUSLINE_REPO_DIR || path.join(os.homedir(), '.claude-statusline-repo');
const STATE_PATH = path.join(os.homedir(), '.claude', 'statusline-update-check.json');
const INTERVAL_HOURS = Number(process.env.STATUSLINE_UPDATE_CHECK_INTERVAL_HOURS) || 24;
const INTERVAL_MS = INTERVAL_HOURS * 60 * 60 * 1000;
const GIT_TIMEOUT_MS = 10000;

function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function writeState(state) {
  try {
    fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
    fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2) + '\n');
  } catch {
    // Non-fatal — worst case the throttle doesn't persist and we check again next time.
  }
}

function git(args) {
  return execFileSync('git', ['-C', REPO_DIR, ...args], {
    encoding: 'utf8',
    timeout: GIT_TIMEOUT_MS,
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
}

function main() {
  if (!fs.existsSync(path.join(REPO_DIR, '.git'))) {
    process.exit(0); // not set up yet — nothing to check
  }

  const state = readState();
  const now = Date.now();
  if (state.lastCheckedAt && now - state.lastCheckedAt < INTERVAL_MS) {
    process.exit(0); // throttled
  }

  let localSha;
  let remoteSha;
  try {
    localSha = git(['rev-parse', 'HEAD']);
    remoteSha = git(['ls-remote', 'origin', 'HEAD']).split(/\s+/)[0];
  } catch {
    // Offline, auth issue, whatever — persist the attempt and stay silent.
    writeState({ ...state, lastCheckedAt: now });
    process.exit(0);
  }

  writeState({ lastCheckedAt: now, lastLocalSha: localSha, lastRemoteSha: remoteSha });

  if (!remoteSha || localSha === remoteSha) {
    process.exit(0); // up to date
  }

  const shortLocal = localSha.slice(0, 7);
  const shortRemote = remoteSha.slice(0, 7);
  process.stderr.write(
    `Claude Code statusline update available (local ${shortLocal} -> remote ${shortRemote}). ` +
    `Ask the user if they'd like to update; if they agree, run: bash ${REPO_DIR}/setup.sh\n`
  );
  process.exit(2);
}

try {
  main();
} catch {
  // Never let an unexpected bug here surface as a false positive or hang a session.
  process.exit(0);
}
