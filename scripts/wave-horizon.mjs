#!/usr/bin/env node
// THE HORIZON - does another unit of work still fit before the wave window ends?
//
//   node scripts/wave-horizon.mjs --plan <wave-plan.local.md>      # reads its "Window ends:" line
//   node scripts/wave-horizon.mjs --end 2026-09-06T07:00:00+03:00
//   node scripts/wave-horizon.mjs --plan <path> --size small       # exit 0 fits, 1 does not
//   node scripts/wave-horizon.mjs --plan <path> --json
//
// WHY. On 2026-09-04 the night wave stopped at 04:40 local with the window open until 07:00,
// because the loop's stopping rule was "every planned row has landed" and nothing measured
// whether one more unit would have finished and landed in time. The owner asked for a stopping
// rule based on measured verification and landing latency, never on a percentage of the night.
//
// THE RULE. A unit of a given size fits while
//
//     remaining  >=  p90(launch -> queued, that size)  +  p90(gate)  +  p90(queue wait)  +  buffer
//
// where the first term comes from the launch ledger (`wave-launch.mjs`), the gate and wait terms
// from the merge jobs in the job store, and the buffer is a fixed 30 minutes for the integration
// the queue does when main has moved. Every term is printed with its sample size. A size with
// fewer than MIN_SAMPLES finished rows falls back to the SEED measured on the eleven rows of
// 2026-09-04 and says so - a fallback is a number with a label, never a silent constant.
//
// What this does NOT decide: which unit. That is the candidate list's order and the collision
// check. This only answers "is there time for one of this size", and a row that overruns is not a
// failure - it lands after the owner wakes; only an unlanded conflict is, and the queue refuses that.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { jobsDir, readJobs, readLandings } from './jobs-store.mjs';
import { SIZES, joinDurations, percentile, readLaunches, statsBySize } from './wave-launch.mjs';

/** Measured 2026-09-04 (eleven rows, launch to queued): 40 to 177 min, median 105. `large` has
 *  no sample and is a planner's guess written down, which is why a large unit should be split. */
export const SEED_P90_MINUTES = Object.freeze({ small: 80, standard: 160, large: 240 });
export const SEED_GATE_MINUTES = 13; // slowest gate that night, row C
export const SEED_WAIT_MINUTES = 17; // longest queue wait that night, row B
export const INTEGRATION_BUFFER_MINUTES = 30;
export const MIN_SAMPLES = 5;

/** The `Window ends: <iso>` line of a wave plan, as epoch ms, or null. */
export function parseWindowEnd(text) {
  return parseWindowTime(text, 'ends');
}

/** Optional for legacy plans; new plans retain this original start across refills. */
export function parseWindowStart(text) {
  return parseWindowTime(text, 'starts');
}

function parseWindowTime(text, edge) {
  const match = new RegExp('^\\s*(?:[-*]\\s*)?(?:\\*\\*)?window ' + edge + '\\s*(?:\\*\\*)?:\\s*`?([^`\\s]+)`?', 'im').exec(String(text).replace(/\r\n/g, '\n'));
  if (!match) return null;
  const at = Date.parse(match[1]);
  return Number.isFinite(at) ? at : null;
}

/** Gate and queue-wait p90 in minutes over finished merge jobs, with sample sizes. */
export function landingLatency(jobs) {
  const merges = jobs.filter((job) => job.kind === 'merge' && Number.isFinite(job.startedAt) && Number.isFinite(job.finishedAt) && job.state === 'done');
  const gate = merges.map((job) => (job.finishedAt - job.startedAt) / 60_000);
  const wait = merges.filter((job) => Number.isFinite(job.enqueuedAt)).map((job) => Math.max(0, (job.startedAt - job.enqueuedAt) / 60_000));
  return {
    gate: { n: gate.length, p90: percentile(gate, 0.9) },
    wait: { n: wait.length, p90: percentile(wait, 0.9) },
  };
}

/**
 * The verdict per size. `remainingMin` is the wall clock left; `durations` is `statsBySize`'s
 * output; `latency` is `landingLatency`'s. Every number in the result carries where it came from.
 */
export function horizon({ remainingMin, durations, latency, bufferMin = INTEGRATION_BUFFER_MINUTES, minSamples = MIN_SAMPLES }) {
  const gate = latency.gate.n >= minSamples ? { minutes: Math.ceil(latency.gate.p90), source: `p90 of ${latency.gate.n} gates` } : { minutes: SEED_GATE_MINUTES, source: 'seed (2026-09-04)' };
  const wait = latency.wait.n >= minSamples ? { minutes: Math.ceil(latency.wait.p90), source: `p90 of ${latency.wait.n} waits` } : { minutes: SEED_WAIT_MINUTES, source: 'seed (2026-09-04)' };
  const sizes = {};
  for (const size of SIZES) {
    const stat = durations[size] ?? { n: 0, p90: null };
    const unit = stat.n >= minSamples ? { minutes: Math.ceil(stat.p90), source: `p90 of ${stat.n} rows` } : { minutes: SEED_P90_MINUTES[size], source: 'seed (2026-09-04)' };
    const needed = unit.minutes + gate.minutes + wait.minutes + bufferMin;
    sizes[size] = { unit, needed, fits: remainingMin >= needed, slackMin: Math.round(remainingMin - needed) };
  }
  return { remainingMin: Math.round(remainingMin), gate, wait, bufferMin, sizes };
}

export function formatHorizon(result, endAt) {
  const lines = [];
  lines.push(`Window ends ${new Date(endAt).toISOString()} - ${result.remainingMin} min remain.`);
  lines.push(`Landing: gate ${result.gate.minutes} min (${result.gate.source}), queue wait ${result.wait.minutes} min (${result.wait.source}), integration buffer ${result.bufferMin} min.`);
  for (const size of SIZES) {
    const row = result.sizes[size];
    lines.push(`  ${size.padEnd(8)} needs ${String(row.needed).padStart(3)} min (unit ${row.unit.minutes}, ${row.unit.source})  ->  ${row.fits ? 'FITS' : 'does not fit'} (${row.slackMin >= 0 ? '+' : ''}${row.slackMin} min)`);
  }
  const fitting = SIZES.filter((size) => result.sizes[size].fits);
  lines.push(fitting.length ? `Launch: ${fitting.join(', ')}.` : 'Launch nothing more - let what is running land, then report.');
  return lines.join('\n');
}

function argValue(argv, name) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

export function main(argv = process.argv.slice(2), { now = Date.now() } = {}) {
  const dir = jobsDir();
  if (!dir) {
    process.stderr.write('wave-horizon: not inside a git repository.\n');
    return 2;
  }
  let endAt = null;
  const end = argValue(argv, '--end');
  const plan = argValue(argv, '--plan');
  if (end) endAt = Date.parse(end);
  else if (plan) {
    const file = path.resolve(plan);
    if (!existsSync(file)) {
      process.stderr.write(`wave-horizon: no plan at ${file}\n`);
      return 2;
    }
    endAt = parseWindowEnd(readFileSync(file, 'utf8'));
    if (endAt === null) {
      process.stderr.write('wave-horizon: the plan has no parseable "Window ends: <iso>" line - the planner writes it, the check refuses a plan without it.\n');
      return 2;
    }
  }
  if (!Number.isFinite(endAt)) {
    process.stdout.write('Usage: node scripts/wave-horizon.mjs (--plan <path> | --end <iso>) [--size small|standard|large] [--json]\n');
    return 2;
  }
  const jobs = readJobs(dir);
  const durations = statsBySize(joinDurations(readLaunches(dir), jobs, readLandings(dir)));
  const result = horizon({ remainingMin: (endAt - now) / 60_000, durations, latency: landingLatency(jobs) });
  const size = argValue(argv, '--size');
  if (argv.includes('--json')) process.stdout.write(`${JSON.stringify({ endAt: new Date(endAt).toISOString(), ...result }, null, 2)}\n`);
  else process.stdout.write(`${formatHorizon(result, endAt)}\n`);
  if (size) {
    if (!SIZES.includes(size)) {
      process.stderr.write(`wave-horizon: --size must be one of ${SIZES.join(', ')}\n`);
      return 2;
    }
    return result.sizes[size].fits ? 0 : 1;
  }
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main());
}
