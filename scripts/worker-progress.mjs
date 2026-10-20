#!/usr/bin/env node
// Is a launched worker making progress? Liveness checks (a heartbeat, a session that still
// answers) cannot tell a working session from a stuck one, so this looks at what work leaves
// behind: the commits on its branch, its CI runs, and optionally a session log the coordinator
// names. PR comments are left out: a nudge or a bot comment is not the worker's progress.
// Read-only; the coordinator decides whether to nudge or relaunch.
//
//   node scripts/worker-progress.mjs --branch <branch> [--wave <file> | --since <ISO>] [--log <file>] [--idle-minutes 30]
//
// The clock starts at the step's launch: `--wave` takes the in-flight step's launch (or latest
// handoff) time from the ledger, `--since` names it. Nothing older counts, so a branch cut from
// main does not inherit main's age. A queued or running Actions run on the branch, started since
// the launch, is activity however long it takes; one waiting for approval is not. Prints { state: progressing | idle | unknown, lastActivity, idleMinutes,
// sources } and exits 0 when progressing, 1 when idle, 2 when nothing could be read (no branch yet,
// no CI, no log): unknown means reconcile the worker, never replace it.
import { spawnSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { phasePosition, readSteps } from './plan-run.mjs';

export const IDLE_MINUTES = 30;
const ACTIVE_RUN = new Set(['queued', 'in_progress', 'pending', 'requested']);
const USAGE = 'Usage: node scripts/worker-progress.mjs --branch <branch> [--wave <file> | --since <ISO>] [--log <file>] [--idle-minutes 30]';

/** The in-flight step's start in a wave ledger: its launch or the latest handoff to a replacement. */
export function launchedAt(text) {
  const position = phasePosition(text);
  if (position.action !== 'wait') return null;
  return readSteps(text).filter((step) => step.phase === position.phase && ['build', 'repair', 'check', 'resume'].includes(step.event)).at(-1)?.at ?? null;
}

/**
 * The newest activity since the launch decides; a running CI run is activity now. No readable
 * source is unknown, never idle.
 */
export function progress(sources, now = Date.now(), idleMinutes = IDLE_MINUTES, since = null) {
  if (!sources.length) return { state: 'unknown', lastActivity: null, idleMinutes: null, sources };
  const floor = Date.parse(since ?? '');
  const times = sources.map((s) => Date.parse(s.at)).filter(Number.isFinite);
  if (Number.isFinite(floor)) times.push(floor);
  if (!times.length) return { state: 'unknown', lastActivity: null, idleMinutes: null, sources };
  // A run counts only if it started since the launch: a stale one from before is not this worker's.
  const running = sources.some((s) => s.running && !(Date.parse(s.running) < floor));
  const last = running ? now : Math.max(...times), idle = Math.max(0, Math.floor((now - last) / 60_000));
  return { state: running || idle < idleMinutes ? 'progressing' : 'idle', lastActivity: new Date(last).toISOString(), idleMinutes: idle, sources };
}

/** Each source that answers contributes its time; one that fails is left out. */
export function observe({ branch, log }, run = (command, args) => spawnSync(command, args, { encoding: 'utf8', timeout: 30_000, windowsHide: true })) {
  const read = (command, args) => {
    const result = run(command, args);
    return result.status === 0 ? String(result.stdout).trim() : '';
  };
  const sources = [];
  const add = (source, at, extra = {}) => { if (at) sources.push({ source, at, ...extra }); };
  if (branch) {
    // The remote tip, fetched without moving FETCH_HEAD, which other tools in this checkout read.
    const tip = read('git', ['ls-remote', 'origin', `refs/heads/${branch}`]).split(/\s+/)[0];
    if (tip && run('git', ['fetch', '--no-tags', '--quiet', '--no-write-fetch-head', 'origin', branch]).status === 0) {
      add('commit', read('git', ['log', '-1', '--format=%cI', tip]));
    }
    let runs = [];
    try { runs = JSON.parse(read('gh', ['run', 'list', '--branch', branch, '--limit', '20', '--json', 'status,createdAt,updatedAt']) || '[]'); } catch { /* Unreadable CI is not activity. */ }
    if (Array.isArray(runs) && runs.length) {
      const newest = (times) => times.filter((at) => Number.isFinite(Date.parse(at))).sort().at(-1);
      // `running` is the newest active run's start, so the launch clock can rule out a stale one.
      const active = newest(runs.filter((r) => ACTIVE_RUN.has(r.status)).map((r) => r.createdAt));
      add('ci', newest(runs.map((r) => r.updatedAt)), active ? { running: active } : {});
    }
  }
  if (log) { try { add('log', statSync(log).mtime.toISOString()); } catch { /* A missing log is not activity. */ } }
  return sources;
}

export function main(argv = process.argv.slice(2), { now = Date.now(), run, print = console.log } = {}) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, '');
    if (!['branch', 'log', 'idle-minutes', 'since', 'wave'].includes(key) || !argv[i + 1]) { print(USAGE); return 2; }
    args[key] = argv[i + 1];
  }
  const idleMinutes = Number(args['idle-minutes'] ?? IDLE_MINUTES);
  let since = args.since ?? null;
  if (args.wave && args.since) { print(USAGE); return 2; }
  if (args.wave) {
    try { since = launchedAt(readFileSync(args.wave, 'utf8')); } catch { since = null; }
    if (!since) { print(USAGE); return 2; }
  }
  if (!(args.branch || args.log) || !(idleMinutes > 0) || (since !== null && !Number.isFinite(Date.parse(since)))) { print(USAGE); return 2; }
  const result = progress(observe(args, run), now, idleMinutes, since);
  print(JSON.stringify(result));
  return { progressing: 0, idle: 1, unknown: 2 }[result.state];
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main();
