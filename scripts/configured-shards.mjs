#!/usr/bin/env node
// THE CONFIGURED SUITE'S SHARDS: e2e/configured/ packed onto configured-suite.yml's runners by
// measured minutes.
//
//   node scripts/configured-shards.mjs [--github-output] [<earlier configured report.json> ...]
//
// The reports are Playwright JSON reports of earlier configured-suite runs, NEWEST FIRST. Prints
// one JSON object - { shardSpecs, matrix, weights } - and with --github-output also writes
// `shardspecs` and `matrix` for the jobs that need them.
//
// WHY (issue #1668). On one worker the suite reached 130 tests and 33.5 minutes of Playwright, and
// a run was cancelled by the 40-minute job cap with no verdict. Several specs watch live behaviour
// for 60 to 90 seconds on purpose, so every added test grows the total. Four runners, each with its
// own stack, give the verdict inside 15 minutes with the cap unchanged.
//
// THE SAME PACKER AS ci.yml AND THE NIGHTLY (`packShards`, longest first onto the lightest runner),
// weighed the nightly's way (`nightlyMinutes`: the slowest of the newest three runs that finished a
// file cleanly). Playwright's own `--shard` splits by test count in file order, which would put the
// long live-behaviour specs wherever the alphabet does. One difference from the nightly: a file
// that only ever ran with a failure (a quarantined spec fails every run until it is fixed) keeps
// its newest finished minutes rather than the median, because it is often among the heaviest.
//
// A FIXED COUNT. The count follows hosted-latency.yml, which runs the same specs on four shards.
// When a shard nears the 15-minute verdict, raise CONFIGURED_SHARDS; never the job cap.
import { appendFileSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { minutesFor, packShards } from './e2e-affected.mjs';
import { minutesByFile } from './e2e-durations.mjs';
import { nightlyMinutes } from './nightly-shards.mjs';
import { unfinishedByFile } from './nightly-triage.mjs';

/** Runners for one configured-suite run. Each brings up its own Supabase stack. */
export const CONFIGURED_SHARDS = 4;

const CONFIGURED_DIR = fileURLToPath(new URL('../e2e/configured/', import.meta.url));

/** Every spec file in e2e/configured/, sorted - the suite as the disk holds it. */
export function configuredSpecFiles() {
  return readdirSync(CONFIGURED_DIR).filter((f) => f.endsWith('.spec.ts')).sort();
}

/**
 * Per-file minutes: the nightly's clean-runs rule first, then the newest report that finished a
 * file at all, so a file that failed in every report still weighs what it costs.
 *
 * @param {object[]} reports Playwright JSON reports, newest first
 * @returns {Record<string, number>} basename -> minutes
 */
export function configuredMinutes(reports) {
  const finished = {};
  for (const report of [...reports].reverse()) {
    const unfinished = unfinishedByFile(report);
    for (const [file, m] of Object.entries(minutesByFile(report))) {
      if (!unfinished.has(file)) finished[file] = m;
    }
  }
  return { ...finished, ...nightlyMinutes(reports) };
}

/**
 * @param {{ suite: string[], reports?: object[], shards?: number }} input
 */
export function planConfigured({ suite, reports = [], shards = CONFIGURED_SHARDS }) {
  const measured = configuredMinutes(reports);
  const known = Object.entries(measured).filter(([f]) => suite.includes(f));
  // Nothing measured weighs every file at zero, and zeros all pack onto the first runner; one
  // minute each splits by file count instead.
  const table = { minutes: Object.fromEntries(known.length ? known : suite.map((f) => [f, 1])) };
  const shardSpecs = packShards(suite, shards, table);
  return {
    shardSpecs,
    matrix: { shardIndex: shardSpecs.map((_, i) => i + 1), shardTotal: [shardSpecs.length] },
    predicted: shardSpecs.map((bin) => Number(minutesFor(bin, table).toFixed(1))),
    weights: { measured: known.length, median: suite.length - known.length },
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values, positionals } = parseArgs({
    options: { 'github-output': { type: 'boolean' } },
    allowPositionals: true,
  });
  const reports = [];
  for (const file of positionals) {
    try {
      reports.push(JSON.parse(readFileSync(file, 'utf8')));
    } catch (error) {
      // Best effort: a report that cannot be read costs balance for its files, never the run.
      console.error(`configured-shards: ignoring ${file} - ${error.message}`);
    }
  }
  const plan = planConfigured({ suite: configuredSpecFiles(), reports });
  console.error(
    plan.weights.measured
      ? `configured-shards: ${plan.shardSpecs.length} shards, predicted ${plan.predicted.join(', ')} test-minutes; ` +
          `weights from ${reports.length} earlier report(s) for ${plan.weights.measured} files, the median for ${plan.weights.median}.`
      : `configured-shards: ${plan.shardSpecs.length} shards of ${plan.predicted.join(', ')} files - no earlier report, so split by file count.`,
  );
  const out = process.env.GITHUB_OUTPUT;
  if (values['github-output'] && out) {
    appendFileSync(out, `shardspecs=${JSON.stringify(plan.shardSpecs)}\nmatrix=${JSON.stringify(plan.matrix)}\n`);
  }
  process.stdout.write(`${JSON.stringify(plan)}\n`);
}
