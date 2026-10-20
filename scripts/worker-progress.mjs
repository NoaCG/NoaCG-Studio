#!/usr/bin/env node
// Is a launched worker making progress? Liveness checks (a heartbeat, a session that still
// answers) cannot tell a working session from a stuck one, so this looks at what work leaves
// behind: the commits on its branch, its CI runs and its pull request's merge-queue runs, and
// optionally a session log or the newest event of its session (`--event-at`, which the coordinator
// reads with list_events, since a script cannot). PR comments are left out: a nudge or a bot
// comment is not the worker's progress. Read-only; the coordinator decides whether to nudge or relaunch.
//
//   node scripts/worker-progress.mjs --branch <branch> [--wave <file> | --since <ISO>] [--log <file>] [--event-at <ISO>] [--idle-minutes 30]
//
// The clock starts at the step's launch: `--wave` takes the in-flight step's launch (or latest
// handoff) time from the ledger, `--since` names it. Nothing older counts, so a branch cut from
// main does not inherit main's age. A running Actions run on the branch or in the merge queue,
// started since the launch, is activity however long it takes; a queued one is activity for its
// first hour, after which the wait is GitHub's capacity, not the worker; one waiting for approval
// is not activity. Prints { state: progressing | idle | queued | unknown, lastActivity,
// idleMinutes, sources } and exits 0 when progressing, 1 when idle, 3 when only a run queued for over
// an hour is left (an infrastructure wait: never replace the worker for it), 2 when nothing could be
// read, or nothing was pushed and no launch time is known: unknown means reconcile the worker, never
// replace it. A branch not pushed yet counts from the launch, so a worker stalled before its first
// push turns idle. A time more than five minutes ahead of this clock is ignored.
import { spawnSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { phasePosition, readSteps } from './plan-run.mjs';
import { pullRequestNumberFromGroupRef } from './reviewed-status.mjs';

export const IDLE_MINUTES = 30;
/** How long a queued run counts as the worker's activity before the wait is GitHub's. */
export const QUEUE_MINUTES = 60;
const QUEUED_RUN = new Set(['queued', 'pending', 'requested']);
/** How far ahead of this clock a source may be (another machine's clock) before it is ignored. */
const SKEW_MS = 5 * 60_000;
const ISO_OFFSET = /^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d+)?)?(?:Z|[+-]\d\d:\d\d)$/;
const USAGE = 'Usage: node scripts/worker-progress.mjs --branch <branch> [--wave <file> | --since <ISO>] [--log <file>] [--event-at <ISO>] [--idle-minutes 30]';

/** The in-flight step's start in a wave ledger: its launch or the latest handoff to a replacement. */
export function launchedAt(text) {
  const position = phasePosition(text);
  if (position.action !== 'wait') return null;
  return readSteps(text).filter((step) => step.phase === position.phase && ['build', 'repair', 'check', 'resume'].includes(step.event)).at(-1)?.at ?? null;
}

/**
 * The newest activity since the launch decides; a running CI run, or one queued under an hour, is
 * activity now. No readable source is unknown, never idle.
 */
export function progress(sources, now = Date.now(), idleMinutes = IDLE_MINUTES, since = null) {
  if (!sources.length) return { state: 'unknown', lastActivity: null, idleMinutes: null, sources };
  // The launch time follows the same clock rule as the sources: a little ahead is now. Far ahead,
  // nothing can be judged as since the launch, so the answer is unknown: reconcile, never replace.
  const launch = Date.parse(since ?? '');
  if (launch > now + SKEW_MS) return { state: 'unknown', lastActivity: null, idleMinutes: null, sources };
  const floor = Math.min(launch, now);
  // A time slightly ahead of now (clock skew) is now; one further ahead is ignored, so a fixed
  // future time cannot keep a stuck worker looking busy on every poll.
  const times = sources.map((s) => Date.parse(s.at)).filter((at) => Number.isFinite(at) && at <= now + SKEW_MS).map((at) => Math.min(at, now));
  if (Number.isFinite(floor)) times.push(floor);
  if (!times.length) return { state: 'unknown', lastActivity: null, idleMinutes: null, sources };
  // A run counts only if it started since the launch: a stale one from before is not this worker's.
  const sinceLaunch = (at) => Number.isFinite(Date.parse(at)) && !(Date.parse(at) < floor);
  const running = sources.some((s) => s.running && sinceLaunch(s.running));
  const queued = sources.map((s) => s.queued).filter((at) => at && sinceLaunch(at)).map(Date.parse);
  const freshQueue = queued.some((at) => now - at < QUEUE_MINUTES * 60_000);
  const last = running || freshQueue ? now : Math.max(...times), idle = Math.max(0, Math.floor((now - last) / 60_000));
  const state = running || freshQueue || idle < idleMinutes ? 'progressing' : queued.length ? 'queued' : 'idle';
  return { state, lastActivity: new Date(last).toISOString(), idleMinutes: idle, sources };
}

/** One CI source from a run list: its newest update, plus the newest running and queued starts. */
function ciSource(runs) {
  const newest = (times) => times.filter((at) => Number.isFinite(Date.parse(at))).sort().at(-1);
  const running = newest(runs.filter((r) => r.status === 'in_progress').map((r) => r.createdAt));
  const queued = newest(runs.filter((r) => QUEUED_RUN.has(r.status)).map((r) => r.createdAt));
  return { at: newest(runs.map((r) => r.updatedAt)), ...(running ? { running } : {}), ...(queued ? { queued } : {}) };
}

/** Each source that answers contributes its time; one that fails is left out. */
export function observe({ branch, log, eventAt, since }, run = (command, args) => spawnSync(command, args, { encoding: 'utf8', timeout: 30_000, windowsHide: true })) {
  const read = (command, args) => {
    const result = run(command, args);
    return result.status === 0 ? String(result.stdout).trim() : '';
  };
  const sources = [];
  const add = (source, at, extra = {}) => { if (at) sources.push({ source, at, ...extra }); };
  if (branch) {
    // The remote tip, fetched without moving FETCH_HEAD, which other tools in this checkout read.
    const remote = run('git', ['ls-remote', 'origin', `refs/heads/${branch}`]);
    const tip = remote.status === 0 ? String(remote.stdout).trim().split(/\s+/)[0] : '';
    if (tip && run('git', ['fetch', '--no-tags', '--quiet', '--no-write-fetch-head', 'origin', branch]).status === 0) {
      add('commit', read('git', ['log', '-1', '--format=%cI', tip]));
    } else if (remote.status === 0 && !tip) {
      // Read, and nothing pushed yet: no activity time, but the launch clock still runs, so a
      // worker that stalls before its first push turns idle instead of staying unknown.
      sources.push({ source: 'branch', at: null });
    }
    const list = (args) => { try { const runs = JSON.parse(read('gh', args) || '[]'); return Array.isArray(runs) ? runs : []; } catch { return []; } };
    // Unreadable CI is not activity. `running` and `queued` are run starts, so the launch clock can rule out a stale one.
    const runs = list(['run', 'list', '--branch', branch, '--limit', '20', '--json', 'status,createdAt,updatedAt']);
    if (runs.length) { const { at, ...extra } = ciSource(runs); add('ci', at, extra); }
    // Once queued, the pull request's checks run on the merge queue's own branch, gh-readonly-queue/<base>/pr-<n>-<sha>.
    // REST, not `gh pr list`: cloud sessions refuse gh's GraphQL commands.
    const pr = Number(read('gh', ['api', `repos/{owner}/{repo}/pulls?head={owner}:${encodeURIComponent(branch)}&state=all&per_page=1`, '--jq', '.[0].number']));
    if (Number.isInteger(pr) && pr > 0) {
      const created = Number.isFinite(Date.parse(since ?? '')) ? ['--created', `>=${new Date(Date.parse(since)).toISOString()}`] : [];
      const queue = list(['run', 'list', '--event', 'merge_group', ...created, '--limit', '100', '--json', 'headBranch,status,createdAt,updatedAt'])
        .filter((r) => pullRequestNumberFromGroupRef(r.headBranch) === pr);
      if (queue.length) { const { at, ...extra } = ciSource(queue); add('merge-queue', at, extra); }
    }
  }
  if (log) { try { add('log', statSync(log).mtime.toISOString()); } catch { /* A missing log is not activity. */ } }
  if (ISO_OFFSET.test(eventAt ?? '')) add('session', new Date(Date.parse(eventAt)).toISOString());
  return sources;
}

export function main(argv = process.argv.slice(2), { now = Date.now(), run, print = console.log } = {}) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, '');
    if (!['branch', 'log', 'idle-minutes', 'since', 'wave', 'event-at'].includes(key) || !argv[i + 1]) { print(USAGE); return 2; }
    args[key] = argv[i + 1];
  }
  const idleMinutes = Number(args['idle-minutes'] ?? IDLE_MINUTES);
  let since = args.since ?? null;
  if (args.wave && args.since) { print(USAGE); return 2; }
  if (args.wave) {
    try { since = launchedAt(readFileSync(args.wave, 'utf8')); } catch { since = null; }
    if (!since) { print(USAGE); return 2; }
  }
  if (!(args.branch || args.log || args['event-at']) || !(idleMinutes > 0) || (since !== null && !Number.isFinite(Date.parse(since)))
    || (args['event-at'] && !(ISO_OFFSET.test(args['event-at']) && Number.isFinite(Date.parse(args['event-at']))))) { print(USAGE); return 2; }
  const result = progress(observe({ ...args, eventAt: args['event-at'], since }, run), now, idleMinutes, since);
  print(JSON.stringify(result));
  return { progressing: 0, idle: 1, unknown: 2, queued: 3 }[result.state];
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main();
