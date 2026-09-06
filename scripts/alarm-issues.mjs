#!/usr/bin/env node
// THE ROLLING ALARMS, READ BACK WHERE SOMEBODY IS ALREADY LOOKING.
//
//   node scripts/alarm-issues.mjs        # what is open right now
//
// Five workflows file a rolling issue when something that HAS ALREADY LANDED is red: ci.yml
// ("CI is red on main"), nightly.yml (the nightly suite and the hosted-latency one),
// configured-suite.yml, and the weekly dependency audit. Each opens one issue, comments once per
// distinct failure set, and closes it on the next green run. That half has worked for weeks.
//
// The half that did not: NOTHING EVER READ THEM BACK. `scripts/main-health.mjs` reads ci.yml and
// nothing else, and the landing queue gates on ci.yml alone - deliberately, so a Docker image
// pull failing cannot freeze it (see the header of .github/workflows/configured-suite.yml). The
// consequence is that a break in any other tier costs nothing and slows nothing down, and the
// only thing that ever surfaces one is a person opening GitHub.
//
// MEASURED, on the run that produced this file. Issue #56, "Configured (authenticated) E2E suite
// is red", opened at 22:04 UTC on 2026-09-05 when the SVG behaviour system landed and took
// `e2e/configured/imported-quiz-output.spec.ts` with it. It closed at 06:47 the next morning:
// eight hours and forty-three minutes, with three landings stacked on top of it in between. The
// owner noticed, not the machine. While this file was being written, #57 ("Hosted-latency suite
// is red") opened and was invisible in exactly the same way.
//
// SO THIS IS A REPORT AND NEVER A GATE. It cannot fail a build, refuse a landing, or stop a
// session from starting. It prints a short paragraph in the two places somebody is already
// reading - `npm run jobs`, and the first screen of context every session gets - and that is the
// whole of it. Gating on these tiers is a different decision with a real cost, and the workflows
// that own them argue against it in their own headers.
//
// The pure half (which titles are alarms, how they are described and formatted) is separated from
// the network half on purpose: it is what `scripts/alarm-issues.test.mjs` pins, without a
// repository or a network.

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * MOST ROLLING ALARMS NAME THEMSELVES THE SAME WAY, and the suffix is the open-ended half of the
 * rule: "CI is red on main", "Nightly full test suite is red", "Hosted-latency suite is red",
 * "Configured (authenticated) E2E suite is red", "Weekly dependency audit is red". A sixth alarm
 * written in the house style is surfaced the day it is added, with nothing to remember.
 *
 * An ordinary issue is not swept up by accident: the title has to END here, so "North Star 2027"
 * and a bug report that merely mentions something being red are both left alone.
 */
export const ALARM_TITLE = /\bis red(?: on main)?$/i;

/**
 * The alarms whose titles do NOT end that way, listed because being clever missed them.
 *
 * THESE ARE THE ONES MOST WORTH SURFACING, which is what makes the omission expensive rather than
 * untidy: every one of them fires when something has gone QUIET rather than red. deploy-verify's
 * says production is serving an old commit; the three from nightly-drift say a scheduled job has
 * stopped firing at all, which is an alarm about an alarm. The suffix rule alone covered five of
 * the nine, and the four it missed were the four that report silence.
 *
 * `alarm-issues.test.mjs` reads the titles straight out of .github/workflows/ and fails if any of
 * them is unrecognised, so this list cannot rot the way a hand-kept list normally does. That
 * check is the reason it is safe to name them rather than invent a second pattern - guessing the
 * shape of the next one is the mistake this list exists to record.
 */
export const NAMED_ALARMS = [
  'Production is not running the latest main commit',
  'Nightly sweep has not run',
  'Configured suite is not running on its schedule',
  'Catalog gates are not running on their schedule',
];

/** Whether an issue title is one of the rolling alarms. */
export function isAlarmTitle(title) {
  const text = String(title ?? '').trim();
  if (!text) return false;
  return ALARM_TITLE.test(text) || NAMED_ALARMS.some((known) => known.toLowerCase() === text.toLowerCase());
}

/** Whole hours between an ISO timestamp and `now`, or null when it cannot be read. */
function hoursSince(iso, now) {
  const at = Date.parse(String(iso ?? ''));
  if (Number.isNaN(at)) return null;
  return Math.max(0, Math.floor((now - at) / 3_600_000));
}

/** "under an hour" / "9h" / "3d" - the age of a break, at the resolution it is worth reading. */
export function describeHours(hours) {
  if (hours === null || hours === undefined) return '';
  if (hours < 1) return 'under an hour';
  if (hours < 48) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

/**
 * The open alarms among a list of issues, oldest break first.
 *
 * Oldest first because that is the reading order that matters: an alarm nobody has answered for
 * a day is a different statement from one that opened ten minutes ago and may already have a
 * session on it.
 */
export function describeAlarms(issues = [], now = Date.now()) {
  return (Array.isArray(issues) ? issues : [])
    .filter((issue) => isAlarmTitle(issue?.title))
    .map((issue) => ({
      number: issue.number,
      title: String(issue.title).trim(),
      url: typeof issue.url === 'string' ? issue.url : '',
      openHours: hoursSince(issue.createdAt, now),
      quietHours: hoursSince(issue.updatedAt, now),
    }))
    .sort((a, b) => (b.openHours ?? 0) - (a.openHours ?? 0));
}

/**
 * The lines to print, or none at all when nothing is open.
 *
 * SILENT WHEN GREEN. This prints into a session's opening context and into the top of every
 * `npm run jobs`, so a cheerful "no alarms" line would be noise on the overwhelming majority of
 * reads, and noise is what teaches a reader to skip the section the one morning it says
 * something.
 */
export function formatAlarms(alarms = [], { asOfMinutes = null } = {}) {
  if (alarms.length === 0) return [];
  const stamp = asOfMinutes !== null && asOfMinutes >= 2 ? `, read ${asOfMinutes} min ago` : '';
  const lines = [
    `RED ON MAIN: ${alarms.length} rolling alarm${alarms.length === 1 ? '' : 's'} open${stamp} - ` +
      'something that has already LANDED is broken.',
  ];
  for (const alarm of alarms) {
    const age = describeHours(alarm.openHours);
    lines.push(`  #${alarm.number}  ${alarm.title}${age ? `  - open ${age}` : ''}`);
    if (alarm.url) lines.push(`      ${alarm.url}`);
  }
  lines.push(
    '  None of these blocks the landing queue, which gates on ci.yml alone - so a break here ' +
      'survives every landing until somebody reads it.',
  );
  return lines;
}

// ── Reading them off GitHub ──────────────────────────────────────────────────────────────────

/** How long a cached answer stands before it is fetched again. */
export const DEFAULT_MAX_AGE_MS = 10 * 60 * 1000;

const CACHE_FILE = 'noacg-alarm-issues.json';

/**
 * The cache lives in the SHARED git directory, so one fetch serves every worktree on the machine.
 *
 * A dozen sessions start in a morning and each of them would otherwise pay its own round trip for
 * the same answer. `--git-common-dir` is the one path every linked worktree agrees on, and it is
 * already outside the working tree, so nothing can commit this by accident.
 */
function cachePath(cwd) {
  const res = spawnSync('git', ['rev-parse', '--git-common-dir'], { cwd, encoding: 'utf8' });
  if (res.status !== 0 || typeof res.stdout !== 'string') return null;
  const dir = res.stdout.trim();
  return dir ? join(resolve(cwd, dir), CACHE_FILE) : null;
}

function fetchIssues(cwd, timeoutMs) {
  const res = spawnSync(
    'gh',
    ['issue', 'list', '--state', 'open', '--json', 'number,title,url,createdAt,updatedAt', '--limit', '30'],
    { cwd, encoding: 'utf8', timeout: timeoutMs, windowsHide: true },
  );
  if (res.status !== 0 || typeof res.stdout !== 'string') return null;
  try {
    const parsed = JSON.parse(res.stdout);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * The open alarms, from the cache when it is fresh and from GitHub when it is not.
 *
 * `source` says which, and STALE IS REPORTED RATHER THAN SWALLOWED: offline, or with `gh` signed
 * out, a ten-minute-old answer is still worth far more than silence - it just has to say how old
 * it is, which `formatAlarms` stamps into its first line. Only a machine that has never once
 * fetched reports nothing, and that is honest too.
 *
 * Never throws. Every caller here is an awareness surface that must not be able to fail.
 */
export function readAlarms({
  cwd = process.cwd(),
  maxAgeMs = DEFAULT_MAX_AGE_MS,
  timeoutMs = 5000,
  now = Date.now(),
} = {}) {
  let path = null;
  let cached = null;
  try {
    path = cachePath(cwd);
    if (path && existsSync(path)) cached = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    cached = null;
  }

  if (cached && typeof cached.at === 'number' && now - cached.at < maxAgeMs) {
    return { alarms: describeAlarms(cached.issues, now), asOfMinutes: 0, source: 'cache' };
  }

  const fetched = fetchIssues(cwd, timeoutMs);
  if (fetched) {
    try {
      if (path) writeFileSync(path, `${JSON.stringify({ at: now, issues: fetched })}\n`);
    } catch {
      // A cache we cannot write costs a round trip next time and nothing else.
    }
    return { alarms: describeAlarms(fetched, now), asOfMinutes: 0, source: 'github' };
  }

  if (cached) {
    return {
      alarms: describeAlarms(cached.issues, now),
      asOfMinutes: Math.round((now - (cached.at ?? now)) / 60_000),
      source: 'stale',
    };
  }
  return { alarms: [], asOfMinutes: null, source: 'unavailable' };
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1].replaceAll('\\', '/')}`).href) {
  const { alarms, asOfMinutes, source } = readAlarms();
  const lines = formatAlarms(alarms, { asOfMinutes });
  if (lines.length > 0) for (const line of lines) console.log(line);
  else if (source === 'unavailable') console.log('Could not reach GitHub, and nothing is cached - no verdict on the alarms.');
  else console.log('No rolling alarm is open.');
}
