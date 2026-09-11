#!/usr/bin/env node
// THE LAUNCH LEDGER - when each wave row was started, so a night can measure how long a unit takes.
//
//   node scripts/wave-launch.mjs record --letter H --branch claude/h-thing --size standard
//   node scripts/wave-launch.mjs list [--json]
//   node scripts/wave-launch.mjs durations [--json]
//
// WHY. The queue records when a branch was queued (`enqueuedAt` on its merge job) and when it
// landed (`landed.jsonl`), but nothing recorded when the row STARTED, so the one number the loop
// needs to decide whether another unit still fits the night - launch to queued, per size of unit -
// lived only in a heartbeat line somebody would have to parse. On 2026-09-04 that number was 40 to
// 177 minutes over eleven rows, median 105, and the loop stopped at 04:40 with 2 h 20 min left
// because nothing could tell it a small unit would have fitted. `wave-horizon.mjs` reads this
// ledger; the live orchestrator appends one line per launch.
//
// One JSON line per launch in `<git-common-dir>/noacg-jobs/wave-launches.jsonl`, beside the job
// store and under its lifetime rules. Append-only, never edited. Re-launching a branch records
// another attempt; it must never erase the time already spent on that task.

import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { jobsDir, ensureJobsDir, readJobs, readLandings } from './jobs-store.mjs';
import { inStore, wavePlanFiles, wavePlansDir } from './wave-plan-store.mjs';

export const LEDGER_VERSION = 1;
export const LEDGER_FILE = 'wave-launches.jsonl';
/** The three sizes a brief may carry. `large` is a unit the planner should have split. */
export const SIZES = Object.freeze(['small', 'standard', 'large']);

export function ledgerPath(dir) {
  return path.join(dir, LEDGER_FILE);
}

export function readLaunches(dir) {
  const file = ledgerPath(dir);
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null; // one torn line must not hide every launch before it
      }
    })
    .filter((row) => row && row.branch && Number.isFinite(row.at));
}

export function recordLaunch(dir, { letter, branch, size, plan = null, now = Date.now() }) {
  if (!branch || !/^[\w./-]+$/.test(branch)) throw new Error('record needs --branch <name>');
  if (!SIZES.includes(size)) throw new Error(`record needs --size one of ${SIZES.join(', ')}`);
  if (!Number.isFinite(now)) throw new Error('record needs a finite launch timestamp');
  ensureJobsDir(dir);
  const row = { v: LEDGER_VERSION, at: now, letter: letter ?? null, branch, size, plan };
  appendFileSync(ledgerPath(dir), `${JSON.stringify(row)}\n`, 'utf8');
  return row;
}

/**
 * One row per launched branch: when it was queued for landing and when it landed, in minutes
 * from launch. The first merge job enqueued AFTER the launch is the queueing; a branch queued
 * twice keeps its first declaration, since that is when the row finished. Rows with no merge job
 * yet are returned with `toQueueMin: null` so a caller can count what is still running.
 */
export function joinDurations(launches, jobs, landings) {
  const byBranch = new Map();
  for (const row of launches) {
    if (!row?.branch || !Number.isFinite(row.at)) continue;
    if (!byBranch.has(row.branch)) byBranch.set(row.branch, new Map());
    // An identical timestamp is a repeated record, not another attempt. Legacy v1 rows already
    // contain everything this grouping needs; no ledger rewrite or persisted schema change.
    byBranch.get(row.branch).set(row.at, row);
  }
  return [...byBranch.values()].map((records) => {
    const attempts = [...records.values()].sort((a, b) => a.at - b.at);
    const launch = attempts[0];
    const queued = jobs
      .filter((job) => job.kind === 'merge' && job.branch === launch.branch && Number.isFinite(job.enqueuedAt) && job.enqueuedAt >= launch.at)
      .sort((a, b) => a.enqueuedAt - b.enqueuedAt)[0];
    const landed = landings.filter((entry) => entry.branch === launch.branch && entry.at >= launch.at).sort((a, b) => a.at - b.at)[0];
    return {
      letter: launch.letter,
      branch: launch.branch,
      size: SIZES.includes(launch.size) ? launch.size : 'standard',
      launchedAt: launch.at,
      plan: launch.plan ?? null,
      attempts: attempts.map((attempt) => ({
        launchedAt: attempt.at,
        letter: attempt.letter ?? null,
        size: SIZES.includes(attempt.size) ? attempt.size : 'standard',
        plan: attempt.plan ?? null,
      })),
      toQueueMin: queued ? Math.round((queued.enqueuedAt - launch.at) / 60_000) : null,
      toLandMin: landed ? Math.round((landed.at - launch.at) / 60_000) : null,
    };
  });
}

/** The p-th percentile (0..1) of a list, nearest-rank. Empty lists answer null, never zero. */
export function percentile(values, p) {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const rank = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[rank];
}

/** Per size: how many finished rows, the median and the p90 of launch-to-queued minutes. */
export function statsBySize(rows) {
  const stats = {};
  for (const size of SIZES) {
    const done = rows.filter((row) => row.size === size && Number.isFinite(row.toQueueMin)).map((row) => row.toQueueMin);
    stats[size] = { n: done.length, median: percentile(done, 0.5), p90: percentile(done, 0.9) };
  }
  return stats;
}

function argValue(argv, name) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

export function main(argv = process.argv.slice(2), { now = Date.now() } = {}) {
  const dir = jobsDir();
  if (!dir) {
    process.stderr.write('wave-launch: not inside a git repository.\n');
    return 2;
  }
  const command = argv[0];
  const json = argv.includes('--json');
  if (command === 'record') {
    // The plan check is the contract's choke point and this is the code one: a row can be launched
    // without anybody running the check, but no row is launched without being recorded here.
    //
    // `--plan` is OPTIONAL in the launch commands the workflows spell out, so a guard that only
    // fired when it was passed would almost never fire. Omitting it therefore means "the plan the
    // store holds" rather than "no plan": the ledger gets the provenance it wanted, and a path
    // passed explicitly is still refused when it points outside the store (2026-09-08: three days
    // of wave plans were written into throwaway worktrees and are gone).
    const planArg = argValue(argv, '--plan');
    if (planArg && !inStore(planArg, dir)) {
      process.stderr.write(`wave-launch: --plan ${planArg} is outside the wave-plan store ${wavePlansDir(dir)}.\n`
        + 'A plan in a checkout dies with that checkout. Write it at the path '
        + '`node scripts/wave-plan-store.mjs --path <date> <day|night>` prints.\n');
      return 2;
    }
    const newest = wavePlanFiles(dir)[0];
    try {
      const row = recordLaunch(dir, {
        letter: argValue(argv, '--letter'),
        branch: argValue(argv, '--branch'),
        size: argValue(argv, '--size'),
        plan: planArg ?? (newest ? path.join(wavePlansDir(dir), newest) : null),
        now,
      });
      process.stdout.write(`recorded launch of ${row.branch} (${row.letter ?? '-'}, ${row.size}) at ${new Date(row.at).toISOString()}\n`);
      return 0;
    } catch (error) {
      process.stderr.write(`wave-launch: ${error.message}\n`);
      return 2;
    }
  }
  const rows = joinDurations(readLaunches(dir), readJobs(dir), readLandings(dir));
  if (command === 'list') {
    if (json) process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`);
    else if (rows.length === 0) process.stdout.write('no launches recorded yet\n');
    else for (const row of rows) {
      process.stdout.write(`${new Date(row.launchedAt).toISOString()}  ${row.letter ?? '-'}  ${row.size.padEnd(8)}  ${row.branch}  `
        + `queued ${row.toQueueMin ?? '-'} min  landed ${row.toLandMin ?? '-'} min\n`);
    }
    return 0;
  }
  if (command === 'durations') {
    const stats = statsBySize(rows);
    if (json) process.stdout.write(`${JSON.stringify(stats, null, 2)}\n`);
    else for (const size of SIZES) {
      const stat = stats[size];
      process.stdout.write(`${size.padEnd(8)}  n=${stat.n}  median ${stat.median ?? '-'} min  p90 ${stat.p90 ?? '-'} min\n`);
    }
    return 0;
  }
  process.stdout.write('Usage: node scripts/wave-launch.mjs record --letter <L> --branch <name> --size small|standard|large [--plan <path>]\n'
    + '       node scripts/wave-launch.mjs list [--json]\n       node scripts/wave-launch.mjs durations [--json]\n');
  return command ? 2 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main());
}
