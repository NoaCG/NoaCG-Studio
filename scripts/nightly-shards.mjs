#!/usr/bin/env node
// THE NIGHTLY'S SHARDS: the whole E2E suite, packed onto nightly.yml's runners by measured minutes.
//
//   node scripts/nightly-shards.mjs [--github-output] [<earlier nightly report.json> ...]
//
// The reports are merged Playwright JSON reports of earlier nightlies, NEWEST FIRST. Prints one
// JSON object - { shardSpecs, matrix, predicted, weights } - and with --github-output also writes
// `shardspecs` and `matrix` for the jobs that need them.
//
// WHY. nightly.yml split the suite with Playwright's `--shard=i/8`, which divides by test COUNT.
// ci.yml stopped doing that on 2026-09-04 for exactly this reason (scripts/e2e-affected.mjs
// `packShards`); the nightly kept it. Four nights to 2026-09-30, the same eight shards ran 5-6 min
// on shard 1 and 14, 17, 22 and then 25+ min on shard 6, which drew the playout and production
// specs Phase 6 was adding to. On 2026-09-30 shard 6 was cancelled by its 25-minute job cap at
// test 220 of 221 (run 36674227393, issue #568), and because a cancelled shard uploads no report
// the triage read the other seven and said "every spec file green". Nothing was hung; the split
// was lopsided. This packs spec files by their measured minutes with the same packer ci.yml uses.
//
// THE RUNNER COUNT FOLLOWS THE SUITE (issue #706). The packing fixed the balance and kept eight
// runners, and the suite then outgrew them: 122 measured minutes on 2026-10-02, about 160 a week
// later, as each landing added a spec file of two or three minutes. The plan predicted every shard
// at 18.5, 20.2 and then 20.5 minutes against a 20-minute budget and said so in a warning, and
// four nights running three to five shards stopped at `--global-timeout` with 80-90 tests
// unreached - the alphabetical tail of each shard, never the same specs twice, no test hung or
// timed out. So the plan now asks for as many runners as the measured minutes need
// (`nightlyShardCount`), and the warning is left for a suite that outgrows the ceiling.
//
// THE WEIGHTS COME FROM EARLIER NIGHTLIES FIRST. They measured this suite on these runners hours
// ago. The durations table (scripts/e2e-durations.json) is a ci.yml recording that a person must
// re-land by hand, and on 2026-09-30 it had no entry for 21 of 187 spec files, among them
// playout-folders.spec.ts at 5.1 measured minutes - one of the heaviest files in the suite, which
// the table would have packed as a 0.5-minute median. Several nights are read, newest first,
// because one night can miss files: a shard that was cancelled reported nothing, and a file a
// shard did not finish measured only part of itself. Each file weighs the SLOWEST of the newest
// `NIGHTS_PER_FILE` nights that finished it; then the table; then the median, as for any
// unmeasured spec.
//
// NO QUARANTINE SPLIT. The nightly is the whole suite by definition, quarantined specs included,
// as it was under `--shard`.
import { appendFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { minutesFor, packShards } from './e2e-affected.mjs';
import { budgetMinutes, minutesByFile, predictShardMinutes, readTable, SHARD_SAFETY_MINUTES, specFilesOnDisk } from './e2e-durations.mjs';
import { failedFiles, unfinishedByFile } from './nightly-triage.mjs';

/**
 * The most runners one nightly asks for. The account runs 20 jobs at once and the nightly holds
 * two more (the catalog jobs) beside its shards; a suite that needs more than this is a suite to
 * look at, which the plan's warning says. A ci.yml run beside the nightly makes some jobs wait for
 * a runner, which costs wall clock and no verdict: a job's timeout starts when it does.
 */
export const NIGHTLY_MAX_SHARDS = 16;

/**
 * How long one shard's Playwright run may take before it stops itself (nightly.yml passes it as
 * `--global-timeout`), in minutes. Below the job's 25-minute cap so that an overrun ends as a
 * FAILED shard that still uploads its report, naming what did not finish, rather than as a
 * cancelled one that uploads nothing. The five minutes between them are the job's own setup.
 */
export const NIGHTLY_TEST_BUDGET_MINUTES = 20;

/** The predicted minutes every shard is planned under: the budget less the variance margin. */
export const NIGHTLY_PLAN_LINE_MINUTES = NIGHTLY_TEST_BUDGET_MINUTES - SHARD_SAFETY_MINUTES;

/**
 * How many of the newest nights that finished a file its weight is taken from, slowest wins.
 *
 * Measured, not guessed: replaying the four green packed nights of 2026-10-01..04 (32 shards), a
 * shard ran up to 3.1 minutes past its plan when each file weighed its newest night alone, because
 * a file's minutes move a minute or more night to night with nothing changed (import-svg-corpus
 * 5.0-6.7, editor-base-edits 2.3-3.5). The slowest of three nights cut the worst overrun to 1.6
 * minutes and planned the median shard within 0.2 of what it ran; five nights gained 0.2 more and
 * hold a spec that got faster at its old cost for longer.
 */
export const NIGHTS_PER_FILE = 3;

/**
 * Per-file minutes from earlier nightly reports, newest first: each file weighs the slowest of the
 * newest `NIGHTS_PER_FILE` reports that ran it to the end and passed it. A report in which a file
 * has a test that did not finish, or failed, says nothing about that file: an unfinished file
 * measured only part of itself, and a failing one measured a broken night (a test that times out
 * costs its full minute), which the slowest-wins rule would otherwise carry for three nights.
 *
 * @param {object[]} reports merged Playwright JSON reports, newest first
 * @returns {Record<string, number>} basename -> minutes
 */
export function nightlyMinutes(reports) {
  const seen = {};
  for (const report of reports) {
    const unfinished = unfinishedByFile(report);
    const failed = failedFiles(report);
    for (const [file, m] of Object.entries(minutesByFile(report))) {
      if (unfinished.has(file) || failed.has(file)) continue;
      (seen[file] ??= []).push(m);
    }
  }
  return Object.fromEntries(
    Object.entries(seen).map(([file, nights]) => [file, Math.max(...nights.slice(0, NIGHTS_PER_FILE))]),
  );
}

/**
 * THE SUITE ON AS MANY RUNNERS AS IT NEEDS: the fewest whose packed shards are all predicted at or
 * under `NIGHTLY_PLAN_LINE_MINUTES`, up to `NIGHTLY_MAX_SHARDS`. Starts from the arithmetic lower
 * bound and adds a runner while the packing leaves a shard over the line, and stops adding once a
 * runner no longer helps - a single file heavier than the line is over it on any count.
 *
 * @param {string[]} suite
 * @param {{ minutes: Record<string, number>, overhead?: object }} weights
 * @param {number} [fixed] a set runner count instead, for tests
 * @returns {{ bins: string[][], predicted: number[] }}
 */
export function packNightly(suite, weights, fixed) {
  const pack = (count) => {
    const bins = packShards(suite, count, weights);
    return { bins, predicted: bins.map((bin) => predictShardMinutes(minutesFor(bin, weights), weights)) };
  };
  if (fixed) return pack(fixed);
  const lowerBound = Math.ceil(minutesFor(suite, weights) / budgetMinutes(weights, NIGHTLY_TEST_BUDGET_MINUTES));
  let count = Math.min(NIGHTLY_MAX_SHARDS, Math.max(1, lowerBound));
  let plan = pack(count);
  while (Math.max(...plan.predicted) > NIGHTLY_PLAN_LINE_MINUTES && count < NIGHTLY_MAX_SHARDS && count < suite.length) {
    const next = pack(count + 1);
    if (Math.max(...next.predicted) >= Math.max(...plan.predicted)) break;
    plan = next;
    count += 1;
  }
  return plan;
}

/**
 * The plan: the suite packed onto as many runners as it needs, weighted by earlier nightlies over
 * the table. `shards` fixes the count instead, for tests. `fits` is false when a shard is still
 * planned over the line, which only a suite past the ceiling or a file heavier than the line does.
 *
 * @param {{ suite: string[], table: { minutes: Record<string, number>, overhead?: object }, reports?: object[], shards?: number }} input
 */
export function planNightly({ suite, table, reports = [], shards }) {
  const measured = nightlyMinutes(reports);
  const weights = { ...table, minutes: { ...table.minutes, ...measured } };
  const { bins: shardSpecs, predicted } = packNightly(suite, weights, shards);
  const fromNightly = suite.filter((s) => s in measured).length;
  const fromTable = suite.filter((s) => !(s in measured) && s in table.minutes).length;
  return {
    shardSpecs,
    matrix: { shardIndex: shardSpecs.map((_, i) => i + 1), shardTotal: [shardSpecs.length] },
    predicted: predicted.map((m) => Number(m.toFixed(1))),
    fits: predicted.every((m) => m <= NIGHTLY_PLAN_LINE_MINUTES),
    weights: { nightly: fromNightly, table: fromTable, median: suite.length - fromNightly - fromTable },
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
      // Best effort, like the budget's comparison: a report that cannot be read costs balance for
      // its files, which fall back to the table. It must not stop the nightly from running.
      console.error(`nightly-shards: ignoring ${file} - ${error.message}`);
    }
  }
  const plan = planNightly({ suite: specFilesOnDisk(), table: readTable(), reports });
  const worst = Math.max(...plan.predicted);
  console.error(
    `nightly-shards: ${plan.shardSpecs.length} shards, predicted ${Math.min(...plan.predicted)}-${worst} min each; ` +
      `weights from ${reports.length} earlier nightly report(s) for ${plan.weights.nightly} files, ` +
      `the durations table for ${plan.weights.table}, the median for ${plan.weights.median}.`,
  );
  const out = process.env.GITHUB_OUTPUT;
  if (values['github-output'] && out) {
    appendFileSync(out, `shardspecs=${JSON.stringify(plan.shardSpecs)}\nmatrix=${JSON.stringify(plan.matrix)}\n`);
    // A warning, not a refusal: an over-budget shard still tests more than one that never starts,
    // and its report will name what it did not reach. On stdout only in Actions, which reads
    // workflow commands there; elsewhere stdout is the JSON alone. The count already grows to fit,
    // so this fires only when even the ceiling's runners cannot hold the suite, or when one file is
    // heavier than the line on its own.
    //
    // The line sits the variance margin under the budget, as ci.yml's does under its cap. The first
    // packed nightly (run 36771185828, 2026-09-30) planned every shard at 15.2 min and ran them in
    // 12.4-17.2 min of job time, so a plan that only just clears 20 is a shard that stops short.
    if (!plan.fits) {
      console.log(
        `::warning title=Nightly shard plan::A shard is predicted at ${worst} min on ${plan.shardSpecs.length} runners, past ` +
          `${NIGHTLY_PLAN_LINE_MINUTES}: less than the ${SHARD_SAFETY_MINUTES}-minute variance margin under the ` +
          `${NIGHTLY_TEST_BUDGET_MINUTES}-minute test budget each shard stops itself at. Find what grew, or raise ` +
          'NIGHTLY_MAX_SHARDS (scripts/nightly-shards.mjs) within the account\'s 20 concurrent jobs.',
      );
    }
  }
  process.stdout.write(`${JSON.stringify(plan)}\n`);
}
