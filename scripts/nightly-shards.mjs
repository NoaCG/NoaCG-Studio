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
// THE WEIGHTS COME FROM EARLIER NIGHTLIES FIRST. They measured this suite on these runners hours
// ago. The durations table (scripts/e2e-durations.json) is a ci.yml recording that a person must
// re-land by hand, and on 2026-09-30 it had no entry for 21 of 187 spec files, among them
// playout-folders.spec.ts at 5.1 measured minutes - one of the heaviest files in the suite, which
// the table would have packed as a 0.5-minute median. Several nights are read, newest first,
// because one night can miss files: a shard that was cancelled reported nothing, and a file a
// shard did not finish measured only part of itself. For each file the newest night that FINISHED
// it wins; then the table; then the median, as for any unmeasured spec.
//
// NO QUARANTINE SPLIT. The nightly is the whole suite by definition, quarantined specs included,
// as it was under `--shard`.
import { appendFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { packShards } from './e2e-affected.mjs';
import { minutesByFile, predictShardMinutes, readTable, specFilesOnDisk } from './e2e-durations.mjs';
import { unfinishedByFile } from './nightly-triage.mjs';

/** Runners the nightly asks for. Eight since the tier began; the packing, not the count, was wrong. */
export const NIGHTLY_SHARDS = 8;

/**
 * How long one shard's Playwright run may take before it stops itself (nightly.yml passes it as
 * `--global-timeout`), in minutes. Below the job's 25-minute cap so that an overrun ends as a
 * FAILED shard that still uploads its report, naming what did not finish, rather than as a
 * cancelled one that uploads nothing. The five minutes between them are the job's own setup.
 */
export const NIGHTLY_TEST_BUDGET_MINUTES = 20;

/**
 * Per-file minutes from earlier nightly reports, newest first: each file takes the newest report
 * that ran it to the end. A file with a test that did not finish is left to an older report.
 *
 * @param {object[]} reports merged Playwright JSON reports, newest first
 * @returns {Record<string, number>} basename -> minutes
 */
export function nightlyMinutes(reports) {
  const minutes = {};
  for (const report of reports) {
    const unfinished = unfinishedByFile(report);
    for (const [file, m] of Object.entries(minutesByFile(report))) {
      if (file in minutes || unfinished.has(file)) continue;
      minutes[file] = m;
    }
  }
  return minutes;
}

/**
 * The plan: the suite packed into `shards` runners, weighted by earlier nightlies over the table.
 *
 * @param {{ suite: string[], table: { minutes: Record<string, number>, overhead?: object }, reports?: object[], shards?: number }} input
 */
export function planNightly({ suite, table, reports = [], shards = NIGHTLY_SHARDS }) {
  const measured = nightlyMinutes(reports);
  const weights = { ...table, minutes: { ...table.minutes, ...measured } };
  const shardSpecs = packShards(suite, shards, weights);
  const median = medianOf(Object.values(weights.minutes));
  const worth = (spec) => weights.minutes[spec] ?? median;
  const predicted = shardSpecs.map((bin) =>
    Number(predictShardMinutes(bin.reduce((sum, spec) => sum + worth(spec), 0), weights).toFixed(1)),
  );
  const fromNightly = suite.filter((s) => s in measured).length;
  const fromTable = suite.filter((s) => !(s in measured) && s in table.minutes).length;
  return {
    shardSpecs,
    matrix: { shardIndex: shardSpecs.map((_, i) => i + 1), shardTotal: [shardSpecs.length] },
    predicted,
    weights: { nightly: fromNightly, table: fromTable, median: suite.length - fromNightly - fromTable },
  };
}

function medianOf(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)] : 0;
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
    // workflow commands there; elsewhere stdout is the JSON alone.
    if (worst > NIGHTLY_TEST_BUDGET_MINUTES) {
      console.log(
        `::warning title=Nightly shard plan::A shard is predicted at ${worst} min, over the ${NIGHTLY_TEST_BUDGET_MINUTES}-minute ` +
          'test budget each shard stops itself at. Add a runner (NIGHTLY_SHARDS, scripts/nightly-shards.mjs) or find what grew.',
      );
    }
  }
  process.stdout.write(`${JSON.stringify(plan)}\n`);
}
