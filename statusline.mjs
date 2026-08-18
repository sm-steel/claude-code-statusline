#!/usr/bin/env node
// Claude Code status line — boxed, Catppuccin Mocha palette.
// Degrades wide -> medium -> narrow -> minimal based on terminal width (COLUMNS),
// so the box stays readable when the window is snapped to half the screen.
// Rate limit data (rate_limits.five_hour / .seven_day) mirrors `/status`.

import { execSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';

const ESC = '\x1b';
const RESET = `${ESC}[0m`;
const BOLD = `${ESC}[1m`;

// Catppuccin Mocha (https://catppuccin.com/palette) — truecolor.
const hexToRgb = (hex) => {
  const n = parseInt(hex, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const rgb = (hex) => {
  const [r, g, b] = hexToRgb(hex);
  return `${ESC}[38;2;${r};${g};${b}m`;
};
const bg = (r, g, b) => `${ESC}[48;2;${r};${g};${b}m`;
const GRADIENT_FROM = hexToRgb('11111b'); // Mocha Crust
const GRADIENT_TO = hexToRgb('353743'); // Surface2, darkened 40% — bright end was too light
const MAUVE = rgb('cba6f7');
const BLUE = rgb('89b4fa');
const LAVENDER = rgb('b4befe'); // border accent
const TEAL = rgb('94e2d5');
const PEACH = rgb('fab387');
const SKY = rgb('89dceb');
const GREEN = rgb('a6e3a1');
const YELLOW = rgb('f9e2af');
const RED = rgb('f38ba8');
const OVERLAY0 = rgb('6c7086'); // dim separators / labels
const BAR_BG = bg(...hexToRgb('5b385d')); // bar track background — Latte Pink blended 30% into Mocha Base

// Single source of truth for what counts as an ANSI SGR escape, so the three
// call sites that need slightly different regex forms (global replace, capturing
// split, anchored full-match) can't drift out of sync with each other.
const ANSI_PATTERN = '\\x1b\\[[0-9;]*m';
const ANSI_RE_GLOBAL = new RegExp(ANSI_PATTERN, 'g');
const ANSI_RE_SPLIT = new RegExp(`(${ANSI_PATTERN})`);
const ANSI_RE_FULL = new RegExp(`^${ANSI_PATTERN}$`);

const stripAnsi = (s) => s.replace(ANSI_RE_GLOBAL, '');

// Width = codepoint count, EXCEPT for symbols whose Unicode Emoji_Presentation
// property is "Yes" — those render as a double-width color glyph by default, with no
// variation selector needed. 📁 (U+1F4C1) and ⌛ (U+231B) are Emoji_Presentation=Yes;
// ⏱ (U+23F1 STOPWATCH) is NOT — it defaults to a narrow text glyph unless explicitly
// followed by U+FE0F, which this script never adds. Confirmed empirically: treating
// all four emoji occurrences as uniformly narrow undercounted the border by exactly 3
// (one per Emoji_Presentation=Yes occurrence: 📁 + two ⌛). Spreading the string groups
// astral surrogate pairs into single iteration items so they're counted once.
const WIDE_CODEPOINTS = new Set([0x1f4c1, 0x231b]); // 📁 ⌛ — NOT 0x23f1 (⏱)
function visLen(s) {
  let width = 0;
  for (const ch of stripAnsi(s)) width += WIDE_CODEPOINTS.has(ch.codePointAt(0)) ? 2 : 1;
  return width;
}

// Paints a static left-to-right background gradient across an already-styled line,
// without disturbing its existing foreground colors. Splits on ANSI escapes (passed
// through unchanged) vs. visible codepoints; a fresh background code is inserted right
// before every visible character based on its column position, so it survives any
// RESET that appears earlier in the string. `total` is the target line width (all rows
// of the box pass the same `total` so the gradient lines up across top/mid/bottom).
function applyGradientBg(line, total) {
  let col = 0;
  let out = '';
  let protectedBg = false; // true while an explicit (non-gradient) bg is active, e.g. the bar track
  for (const chunk of line.split(ANSI_RE_SPLIT)) {
    if (!chunk) continue;
    if (ANSI_RE_FULL.test(chunk)) {
      if (chunk === RESET) protectedBg = false;
      else if (/48;2;/.test(chunk)) protectedBg = true;
      out += chunk;
      continue;
    }
    for (const ch of chunk) {
      const w = WIDE_CODEPOINTS.has(ch.codePointAt(0)) ? 2 : 1;
      if (!protectedBg) {
        const t = total > 1 ? Math.min(1, col / (total - 1)) : 0;
        const r = Math.round(GRADIENT_FROM[0] + (GRADIENT_TO[0] - GRADIENT_FROM[0]) * t);
        const g = Math.round(GRADIENT_FROM[1] + (GRADIENT_TO[1] - GRADIENT_FROM[1]) * t);
        const b = Math.round(GRADIENT_FROM[2] + (GRADIENT_TO[2] - GRADIENT_FROM[2]) * t);
        out += bg(r, g, b);
      }
      out += ch;
      col += w;
    }
  }
  return out + RESET;
}
const dot = `${OVERLAY0} · ${RESET}`;

function colorForPct(pct) {
  if (pct >= 90) return RED;
  if (pct >= 70) return YELLOW;
  return GREEN;
}

// Inverted thresholds for metrics where HIGH is good (e.g. cache hit rate).
function colorForGoodPct(pct) {
  if (pct >= 70) return GREEN;
  if (pct >= 40) return YELLOW;
  return RED;
}

// Session cost thresholds — arbitrary but reasonable defaults for a single session.
function colorForCost(cost) {
  if (cost >= 5) return RED;
  if (cost >= 1) return YELLOW;
  return GREEN;
}

// Braille dot levels, 1-7 dots filled (bottom-up), used for sub-character bar resolution.
const DOTS = ['⣀', '⣄', '⣤', '⣦', '⣶', '⣷', '⣿'];

function bar(pct, width) {
  const units = Math.max(0, Math.min(width * 7, Math.round((pct / 100) * width * 7)));
  const fullCells = Math.floor(units / 7);
  const remainder = units % 7;
  const color = colorForPct(pct);
  let filled = DOTS[6].repeat(fullCells);
  let emptyCount = width - fullCells;
  if (remainder > 0) {
    filled += DOTS[remainder - 1];
    emptyCount -= 1;
  }
  return `${BAR_BG}${color}${filled}${RESET}${BAR_BG}${' '.repeat(Math.max(0, emptyCount))}${RESET}`;
}

function fmtReset(epochSec) {
  if (!epochSec) return '';
  const diffMs = epochSec * 1000 - Date.now();
  if (diffMs <= 0) return 'now';
  const totalMin = Math.floor(diffMs / 60000);
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  if (d > 0) return `${d}d${h}h`;
  if (h > 0) return `${h}h${m}m`;
  return `${m}m`;
}

// Draws a rounded, softly-dashed box around one line of content.
// withTitle embeds the cat glyph into the top border instead of repeating it in the content.
function box(content, { withTitle }) {
  const width = visLen(content); // total border width = width + 4 (2 side chars + 2 padding)
  const bottom = `${LAVENDER}╰${'╌'.repeat(width + 2)}╯${RESET}`;
  const mid = `${LAVENDER}│${RESET} ${content} ${LAVENDER}│${RESET}`;

  let top;
  const total = width + 4; // full border width, matching the mid line exactly
  const leftCat = 'ᓚᘏᗢ';
  const rightCat = 'ᗢᘏᓗ'; // community mirrored form — swaps the lead glyph for its actual mirror-image codepoint, not just a reversed string

  if (withTitle && total >= 2 * (leftCat.length + 2) + 2) {
    // Both bookends fit with room for at least a couple of fill dashes between them.
    // One space on every side of each cat.
    const leftPart = `╭ ${leftCat} `;
    const rightPart = ` ${rightCat} ╮`;
    const fillCount = Math.max(0, total - visLen(leftPart) - visLen(rightPart));
    top = `${LAVENDER}╭ ${leftCat} ${'╌'.repeat(fillCount)} ${rightCat} ╮${RESET}`;
  } else if (withTitle && total >= leftCat.length + 4) {
    // Only room for one cat — keep the original left-side title.
    const prefix = `╭ ${leftCat} `;
    const fillCount = Math.max(0, total - visLen(prefix) - 1);
    top = `${LAVENDER}╭ ${leftCat} ${'╌'.repeat(fillCount)}╮${RESET}`;
  } else {
    top = `${LAVENDER}╭${'╌'.repeat(width + 2)}╮${RESET}`;
  }

  return [top, mid, bottom].map((line) => applyGradientBg(line, total)).join('\n');
}

let input = '';
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  let data;
  try {
    data = JSON.parse(input);
  } catch {
    process.exit(0);
  }

  const COLUMNS = parseInt(process.env.COLUMNS, 10) || 100;

  const model = data.model?.display_name ?? '?';
  const currentDirFull = data.workspace?.current_dir ?? data.cwd ?? '';
  const dir = path.basename(currentDirFull);

  // Which machine this session is running on — useful when a project is synced across
  // multiple PCs (e.g. via Dropbox) and it's not otherwise obvious which one you're on.
  const hostname = os.hostname().split('.')[0]; // drop any domain suffix

  // Flags when the session has cd'd away from where it started, so a stray `cd` doesn't
  // silently put you in the wrong directory without you noticing. Compared after
  // normalizing separators/trailing-slash (and case on win32's case-insensitive
  // filesystem) so a cosmetic difference alone doesn't produce a false positive.
  const normalizePathForCompare = (p) => {
    if (!p) return p;
    const norm = p.replace(/\\/g, '/').replace(/\/+$/, '');
    return process.platform === 'win32' ? norm.toLowerCase() : norm;
  };
  const projectDirFull = data.workspace?.project_dir;
  const hasDrifted = !!projectDirFull && normalizePathForCompare(projectDirFull) !== normalizePathForCompare(currentDirFull);
  const projectDirBase = hasDrifted ? path.basename(projectDirFull) : '';

  // Compact single-glyph effort indicator. Absent when the model doesn't support the
  // effort parameter. Ultracode reports as 'xhigh' per the docs, so no separate 'max' case.
  const EFFORT_GLYPHS = { low: '○', medium: '◐', high: '●', xhigh: '⬤' };
  const effortGlyph = EFFORT_GLYPHS[data.effort?.level] ?? '';

  let branch = '';
  try {
    branch = execSync('git branch --show-current', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim();
  } catch { /* not a git repo */ }

  const ctxPct = data.context_window?.used_percentage;
  const hasCtx = ctxPct != null;
  const ctxRounded = hasCtx ? Math.round(ctxPct) : 0;

  // Cache hit rate: how much of the current context is served from cache (cheap)
  // vs freshly billed. current_usage is null before the first API call / after /compact.
  const usage = data.context_window?.current_usage;
  const cacheTotal = usage
    ? (usage.input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0)
    : 0;
  const hasCache = usage != null && cacheTotal > 0;
  const cachePct = hasCache ? Math.round(((usage.cache_read_input_tokens ?? 0) / cacheTotal) * 100) : 0;

  const cost = data.cost?.total_cost_usd ?? 0;
  const durationMs = data.cost?.total_duration_ms ?? 0;
  const mins = Math.floor(durationMs / 60000);
  const secs = Math.floor((durationMs % 60000) / 1000);
  // Burn rate ($/hr) — spend velocity rather than the running total. Needs at least
  // 30s of session time so an early tiny duration doesn't produce a wild extrapolation.
  const hasBurnRate = durationMs >= 30000 && cost > 0;
  const burnRate = hasBurnRate ? cost / (durationMs / 3600000) : 0;
  const linesAdded = data.cost?.total_lines_added ?? 0;
  const linesRemoved = data.cost?.total_lines_removed ?? 0;
  const hasLines = linesAdded > 0 || linesRemoved > 0;
  const linesStr = hasLines
    ? [
        linesAdded > 0 ? `${GREEN}+${linesAdded}${RESET}` : '',
        linesRemoved > 0 ? `${RED}-${linesRemoved}${RESET}` : '',
      ].filter(Boolean).join(' ')
    : '';

  const rl = data.rate_limits ?? {};
  const fiveH = rl.five_hour?.used_percentage;
  const sevenD = rl.seven_day?.used_percentage;
  const hasRate = fiveH != null || sevenD != null;
  const nearLimit = (fiveH != null && fiveH >= 90) || (sevenD != null && sevenD >= 90);

  function rateSeg(label, pct, resetEpoch, { withBar, barWidth, withReset }) {
    if (pct == null) return '';
    const c = colorForPct(pct);
    const b = withBar ? `${bar(pct, barWidth)} ` : '';
    const reset = withReset ? fmtReset(resetEpoch) : '';
    return `${OVERLAY0}${label}${RESET} ${b}${c}${pct.toFixed(0)}%${RESET}${reset ? `${OVERLAY0}⌛${reset}${RESET}` : ''}`;
  }

  function rateLimitStr(opts) {
    const parts = [];
    const five = rateSeg('5h', fiveH, rl.five_hour?.resets_at, opts);
    const seven = rateSeg('7d', sevenD, rl.seven_day?.resets_at, opts);
    if (five) parts.push(five);
    if (seven) parts.push(seven);
    const joined = parts.join(`${OVERLAY0} · ${RESET}`);
    return nearLimit ? `${RED}⚠${RESET} ${joined}` : joined;
  }

  // --- Tier builders: raw content only, boxing happens after a tier is chosen ---

  function buildWide() {
    const nameSeg = effortGlyph
      ? `${LAVENDER}${effortGlyph}${RESET} ${BOLD}${MAUVE}${model}${RESET} ${OVERLAY0}@${hostname}${RESET}`
      : `${BOLD}${MAUVE}${model}${RESET} ${OVERLAY0}@${hostname}${RESET}`;
    const parts = [nameSeg];

    const driftSeg = hasDrifted ? ` ${OVERLAY0}↰${projectDirBase}${RESET}` : '';
    const loc = branch
      ? `${BLUE}📁 ${dir}${RESET} ${TEAL} ${branch}${RESET}${driftSeg}`
      : `${BLUE}📁 ${dir}${RESET}${driftSeg}`;
    parts.push(loc);

    if (hasCtx) parts.push(`${OVERLAY0}ctx${RESET} ${bar(ctxRounded, 10)} ${colorForPct(ctxRounded)}${ctxRounded}%${RESET}`);

    if (hasCache) parts.push(`${OVERLAY0}cache${RESET} ${colorForGoodPct(cachePct)}${cachePct}%${RESET}`);

    const costColor = colorForCost(cost);
    const costSeg = hasBurnRate
      ? `${costColor}$${cost.toFixed(2)}${RESET} ${OVERLAY0}(${burnRate.toFixed(2)}/hr)${RESET} ${SKY}⏱${mins}m${secs}s${RESET}`
      : `${costColor}$${cost.toFixed(2)}${RESET} ${SKY}⏱${mins}m${secs}s${RESET}`;
    parts.push(costSeg);

    if (hasLines) parts.push(linesStr);

    if (hasRate) parts.push(rateLimitStr({ withBar: true, barWidth: 6, withReset: true }));

    return { content: parts.join(dot), withTitle: true };
  }

  function buildMedium() {
    const nameSeg = effortGlyph
      ? `${LAVENDER}${effortGlyph}${RESET} ${BOLD}${MAUVE}${model}${RESET}`
      : `${BOLD}${MAUVE}${model}${RESET}`;
    const parts = [nameSeg];
    if (hasCtx) parts.push(`${bar(ctxRounded, 6)} ${colorForPct(ctxRounded)}${ctxRounded}%${RESET}`);
    if (hasCache) parts.push(`${OVERLAY0}cache${RESET} ${colorForGoodPct(cachePct)}${cachePct}%${RESET}`);
    parts.push(`${colorForCost(cost)}$${cost.toFixed(2)}${RESET}`);
    if (hasLines) parts.push(linesStr);
    if (hasRate) parts.push(rateLimitStr({ withBar: true, barWidth: 4, withReset: false }));
    return { content: parts.join(dot), withTitle: true };
  }

  function buildNarrow() {
    const parts = [];
    if (hasCtx) parts.push(`${bar(ctxRounded, 4)} ${colorForPct(ctxRounded)}${ctxRounded}%${RESET}`);
    if (hasRate) parts.push(rateLimitStr({ withBar: false, withReset: false }));
    return { content: parts.join(dot), withTitle: false };
  }

  function buildMinimal() {
    const bits = [];
    if (hasCtx) bits.push(`${colorForPct(ctxRounded)}${ctxRounded}%${RESET}`);
    if (fiveH != null) bits.push(`${colorForPct(fiveH)}5h${fiveH.toFixed(0)}${RESET}`);
    if (sevenD != null) bits.push(`${colorForPct(sevenD)}7d${sevenD.toFixed(0)}${RESET}`);
    // Guaranteed non-empty fallback: before the first API response (fresh session),
    // context_window and rate_limits are both absent, so bits would otherwise stay
    // empty and render as a content-free box. Model name is always available.
    if (bits.length === 0) bits.push(`${OVERLAY0}${model}${RESET}`);
    return { content: bits.join(' '), withTitle: false };
  }

  const attempts = [buildWide, buildMedium, buildNarrow, buildMinimal];
  let chosen = buildMinimal();
  for (const attempt of attempts) {
    const candidate = attempt();
    // Reject empty renders outright — buildNarrow can legitimately produce one (no
    // ctx, no rate data yet), and an empty candidate would otherwise "fit" any width
    // and get selected ahead of buildMinimal's guaranteed-non-empty fallback.
    if (!candidate.content) continue;
    // total box width = content width + 4 (side chars + padding)
    if (visLen(candidate.content) + 4 <= COLUMNS - 1) {
      chosen = candidate;
      break;
    }
  }

  console.log(box(chosen.content, { withTitle: chosen.withTitle }));
});
