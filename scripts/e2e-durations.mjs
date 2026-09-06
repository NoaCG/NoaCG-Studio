#!/usr/bin/env node
// gate: none - the --check half only reports drift; record:e2e-durations is what changes the table
// guards: scripts/e2e-durations.json, e2e/**
//
// HOW LONG EACH SPEC FILE TAKES - the measured table `scripts/e2e-affected.mjs` sizes a CI run's
// shard count from, and the command that refreshes it.
//
//   node scripts/e2e-durations.mjs --check                 # report drift, change nothing
//   npm run record:e2e-durations                           # re-record from the newest green full run
//   npm run record:e2e-durations -- <run-id>               # ...or from one you name
//   node scripts/e2e-durations.mjs <merged-report.json>    # rewrite the table from a report you merged
//
// WHY A TABLE AND NOT A FILE COUNT. Until 2026-08-19 CI sized its shards off the NUMBER of spec
// files in the plan: nine shards for a full run, and `min(4, floor(files / 4))` for a subset.
// File count is a bad proxy for time - the spread across these 128 files is 0.001 min to 3.33 -
// and the cap made it worse the bigger the plan got. Measured on the 60 CI runs to 2026-08-19:
//
//   run 32174589727   103 specs  58.3 min of tests  on 4 shards = 14.6 min per shard
//   run 32152498866    88 specs  51.8 min           on 4 shards = 12.9 min per shard
//   run 32215290709    73 specs  40.8 min           on 4 shards = 10.2 min per shard
//   (a FULL run)      128 specs  66.9 min           on 9 shards =  7.4 min per shard
//
// A subset covering 80% of the suite was running on 44% of the runners, so a "cheap" targeted
// run finished LATER than the full suite it was meant to be cheaper than. Sizing off measured
// minutes puts every one of those at ~7 min per shard instead.
//
// WHAT IT DECIDES, AND WHAT IT CANNOT BREAK. Until 2026-09-04 this table only decided HOW MANY
// runners the plan asked for, and Playwright's own `--shard=i/n` did the assigning - so a stale
// entry cost wall clock and nothing else. It now also decides shard BALANCE: `packShards`
// (scripts/e2e-affected.mjs) bin-packs spec files by these durations and CI hands each runner an
// explicit file list. A wrong weight therefore costs a lopsided shard, which is how four `main`
// runs died at the 20-minute cap on 2026-09-03/04.
//
// AND SINCE 2026-09-04 IT ALSO CARRIES WHAT A SHARD COSTS BESIDES ITS TESTS (`overhead` below).
// The per-spec numbers were never the problem - measured against run 33854844447 they predicted
// the test STEP to 2.7% - but the planner read them as the shard's WALL CLOCK, and a runner also
// checks out, installs, starts Playwright and boots a dev server. That term averaged 6.4 minutes
// on the ten runs to that morning and reached 10.2 at the p90, which is what killed two shards
// carrying only 9.8 measured minutes each. Recording it is what lets `budgetMinutes` say how much
// a shard can carry and `emitJson` say when a plan does not fit, before the run rather than after.
//
// It still cannot cost COVERAGE, which is what kept bin-packing off the table for three weeks:
// the packer takes the suite from the e2e DIRECTORY (`specFilesOnDisk`) and reads this file for
// weights only, so an unmeasured spec is packed at the median and never dropped; the assignment
// asserts that its bins are exactly the suite; and the plan job warns, naming every spec it had
// to guess at. That is why this file is still not a gate and lives under `scripts/` (ignored by
// the affected-spec map: nothing a spec can observe changes when it does).
//
// HOW TO REFRESH IT. `npm run record:e2e-durations` does the whole thing. The numbers come from a
// real CI run's shard reports, because that is the hardware they are used on - a laptop's timings
// are a different machine's - so the command picks the newest GREEN FULL run of ci.yml on `main`
// (main always runs full), downloads its blob reports, merges them and rewrites the table,
// stamping which run it came from. Name a run id to use that one instead.
//
// A HALF-RUN IS REFUSED, not silently recorded: a run whose E2E jobs are not all `(full)`, or that
// is missing a shard, measures a SUBSET, and writing that would drop every unmeasured spec back to
// the median. Blob artifacts are kept for 7 days, so re-record from a recent run.
import { readFileSync, writeFileSync, mkdtempSync, rmSync, copyFileSync, mkdirSync } from 'node:fs';
import { readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const TABLE = fileURLToPath(new URL('./e2e-durations.json', import.meta.url));
const E2E_DIR = fileURLToPath(new URL('../e2e/', import.meta.url));

/**
 * WHAT A SHARD COSTS BESIDES ITS TESTS, when the table has never been told.
 *
 * Every consumer reads `overhead` through `readTable`, so this is the shape they all see, and the
 * value they get until a run is recorded. It is not a bare guess: on the cache-hit path a shard's
 * setup is checkout (0.05 min), setup-node (0.05), the node_modules restore, the browser cache
 * (0.05, measured at 2.9 s for 261 MB on run 33854844447) and the artifact upload (0.02), and the
 * 1.05 factor is the ratio the same run showed between the shard STEPS and this table's totals.
 *
 * IT IS DELIBERATELY THE OPTIMISTIC END, and the table SHIPS without a recorded overhead on
 * purpose. The only overhead measurements in reach on 2026-09-04 came from runs that paid an
 * uncached `npm ci` - 6.6 min at the p90 - and `.github/actions/node-modules` removes exactly
 * that cost in the same commit. Carrying that number forward would have made a brand-new
 * instrument raise a permanent alarm about a configuration that no longer exists, which is how a
 * warning gets trained out of people. So the first honest reading has to come from a green FULL
 * run on `main` WITH the cache: `npm run record:e2e-durations`. Until then `--check` says the
 * figures are defaults, in those words.
 */
export const DEFAULT_OVERHEAD = { jobMinutes: 1, testFactor: 1.05, medianJobMinutes: 1, samples: 0 };

/** The table as `{ source, minutes, overhead }`, or a usable empty one if it has been removed. */
export function readTable() {
  try {
    const raw = JSON.parse(readFileSync(TABLE, 'utf8'));
    const overhead = { ...DEFAULT_OVERHEAD, ...(raw.overhead ?? {}) };
    // Normalize on read, the way every other versioned format here does, so nothing downstream
    // has to defend itself: a `testFactor` below 1 would SHRINK every prediction, and it cannot
    // be right for a `workers: 1` run whatever produced it.
    overhead.testFactor = Math.max(1, overhead.testFactor);
    return { source: raw.source ?? {}, minutes: raw.minutes ?? {}, overhead };
  } catch {
    return { source: {}, minutes: {}, overhead: { ...DEFAULT_OVERHEAD } };
  }
}

/**
 * Per-file totals, in minutes, from a Playwright JSON report.
 *
 * Sums every RESULT rather than every test, so a retried test contributes what it actually cost
 * the runner - which is the number a shard's wall clock is made of.
 */
export function minutesByFile(report) {
  const totals = new Map();
  const walk = (suite, inherited) => {
    const file = suite.file ?? inherited;
    for (const child of suite.suites ?? []) walk(child, file);
    for (const spec of suite.specs ?? []) {
      const name = (spec.file ?? file ?? '').split(/[/\\]/).pop();
      if (!name) continue;
      for (const test of spec.tests ?? []) {
        for (const result of test.results ?? []) {
          totals.set(name, (totals.get(name) ?? 0) + (result.duration ?? 0) / 60_000);
        }
      }
    }
  };
  for (const suite of report.suites ?? []) walk(suite, suite.file);
  return Object.fromEntries(
    [...totals].map(([f, m]) => [f, Number(m.toFixed(3))]).sort(([a], [b]) => (a < b ? -1 : 1)),
  );
}

/** The p-th percentile of a numeric sample, nearest-rank. `p90` of nine samples is the worst. */
function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))];
}

/**
 * THE PART OF A SHARD'S WALL CLOCK THAT IS NOT IN THE PER-SPEC TABLE.
 *
 * WHY IT HAS TO BE RECORDED. Until 2026-09-04 the table described the sum of Playwright's own
 * `result.duration` values and the planner treated that as the shard's wall clock. The sum is
 * excellent at what it measures - across the nine shards of run 33854844447 it predicted the
 * test STEP to 2.7% in aggregate - and it says nothing at all about the twenty minutes the job
 * actually has. Two shards of that run were killed at the cap carrying 9.8 measured minutes
 * each, because the job spent ten minutes in `npm ci` first and no number anywhere knew.
 *
 * So the model is now `wall clock = tests x testFactor + jobMinutes`, and both terms come from
 * the same run the per-spec minutes come from:
 *
 * - `jobMinutes` is the job's wall clock minus its `E2E shard` step: checkout, setup-node, the
 *   install, the browser cache, the artifact upload. Recorded at the p90 rather than the mean,
 *   because a cap kills the WORST shard and the mean is not what has to fit. `medianJobMinutes`
 *   rides along so the two can be compared - a wide gap is the signature of an install that is
 *   sometimes fast and sometimes not, which is exactly the fault this term was added to expose.
 * - `testFactor` is the shard STEPS' total over the table's total: Playwright's own start, the
 *   dev-server boot, and whatever a test costs the runner outside `result.duration`. It is
 *   floored at 1 because CI runs `workers: 1` (playwright.config.ts), so a step can never be
 *   shorter than the tests it ran; a value below 1 means the run was not the serial one this
 *   assumes and the figure would be misleading rather than merely wrong.
 *
 * Pure, so it can be tested against a recorded jobs payload with no network.
 *
 * @param {Array<{ name?: string, started_at?: string, completed_at?: string,
 *                 steps?: Array<{ name?: string, started_at?: string, completed_at?: string }> }>} jobs
 *        the REST shape of `/actions/runs/{id}/jobs` (snake_case - `gh run view` does not carry steps)
 * @param {number} totalTestMinutes the table's own total for the same run
 * @returns {{ jobMinutes: number, medianJobMinutes: number, testFactor: number, samples: number } | null}
 *          null when the payload carries no usable shard, so the caller can keep what it had
 */
export function overheadFrom(jobs, totalTestMinutes) {
  const minutesBetween = (from, to) => {
    if (!from || !to) return null;
    const ms = new Date(to) - new Date(from);
    return Number.isFinite(ms) && ms >= 0 ? ms / 60_000 : null;
  };

  const setup = [];
  let stepTotal = 0;
  for (const job of jobs ?? []) {
    if (!/^E2E \d+\/\d+ /.test(job.name ?? '')) continue;
    const wall = minutesBetween(job.started_at, job.completed_at);
    const step = (job.steps ?? []).find((s) => s.name === 'E2E shard');
    const stepMinutes = step ? minutesBetween(step.started_at, step.completed_at) : null;
    if (wall == null || stepMinutes == null) continue;
    setup.push(Math.max(0, wall - stepMinutes));
    stepTotal += stepMinutes;
  }
  if (setup.length === 0) return null;

  const round = (n) => Number(n.toFixed(2));
  return {
    jobMinutes: round(percentile(setup, 0.9)),
    medianJobMinutes: round(percentile(setup, 0.5)),
    testFactor: totalTestMinutes > 0 ? round(Math.max(1, stepTotal / totalTestMinutes)) : DEFAULT_OVERHEAD.testFactor,
    samples: setup.length,
  };
}

/**
 * THE DEADLINE A SHARD IS PLANNED AGAINST - ci.yml's `timeout-minutes` for the E2E job.
 *
 * Kept here beside the overhead rather than in the planner because the two are one model: this
 * is the number the prediction has to come in under. Raising it has been refused twice (T on
 * 2026-09-04, the ci.yml strategy comment for weeks before that) for the same reason each time -
 * a loose budget stops the timeout distinguishing a hung shard from a busy one, which is the
 * whole reason the limit exists. If this changes, change ci.yml in the same commit.
 */
export const SHARD_CAP_MINUTES = 20;

/**
 * How much of the cap is left unplanned, for runner variance.
 *
 * Not a guess: over the 26 green runs to 2026-09-04 the same shard index varied by 2-3 minutes
 * run to run with nothing wrong, and that variance is what tipped four runs over a cap the
 * planner thought they were comfortably inside.
 */
export const SHARD_SAFETY_MINUTES = 3;

/**
 * How many TABLE-MINUTES of tests one shard can carry and still finish inside the cap.
 *
 * The inverse of the wall-clock model in `overheadFrom`: `(cap - safety - jobMinutes) /
 * testFactor`. Never returns less than one minute, so a pathological overhead reading cannot
 * make the planner demand an unbounded number of shards - it makes the plan not FIT, which is a
 * warning a person reads, not an arithmetic explosion.
 */
export function budgetMinutes(table = readTable()) {
  const { jobMinutes, testFactor } = { ...DEFAULT_OVERHEAD, ...table.overhead };
  return Math.max(1, (SHARD_CAP_MINUTES - SHARD_SAFETY_MINUTES - jobMinutes) / testFactor);
}

/** Predicted wall clock, in minutes, for a shard carrying `minutes` of measured tests. */
export function predictShardMinutes(minutes, table = readTable()) {
  const { jobMinutes, testFactor } = { ...DEFAULT_OVERHEAD, ...table.overhead };
  return minutes * testFactor + jobMinutes;
}

/** Spec files on disk that the table has never measured, and entries for files that are gone. */
export function drift(minutes, specFiles) {
  const known = new Set(Object.keys(minutes));
  return {
    unmeasured: specFiles.filter((f) => !known.has(f)),
    stale: [...known].filter((f) => !specFiles.includes(f)),
  };
}

/**
 * Every spec file in `e2e/`, sorted - the SUITE, as the disk holds it.
 *
 * Exported because the shard packer (`packShards`, scripts/e2e-affected.mjs) must enumerate the
 * suite from the DIRECTORY and never from this table's keys. Packing hands each runner an explicit
 * file list, so a spec the table has not measured must still be assigned to a shard; taking the
 * list from the table would make an unmeasured spec a spec nobody runs, which is the exact hazard
 * ci.yml's strategy comment refused bin-packing over until now.
 */
export function specFilesOnDisk() {
  return readdirSync(E2E_DIR).filter((f) => f.endsWith('.spec.ts')).sort();
}

/** Rewrite the table, refusing a report that measured nothing. Returns the spec count, or 0. */
function writeTable(minutes, source, overhead) {
  if (Object.keys(minutes).length === 0) return 0;
  const written = {
    $comment: 'GENERATED - do not hand-edit. See scripts/e2e-durations.mjs for how to refresh it and why it exists.',
    source: {
      run: source.run,
      workflow: 'ci.yml',
      branch: source.branch,
      sha: source.sha,
      mode: 'full',
      recordedAt: new Date().toISOString().slice(0, 10),
    },
    // Keep whatever was measured last when this run could not produce a figure (blob reports
    // outlive the job payload, so a hand-fed report has no jobs to read) rather than dropping
    // back to the optimistic default, which would quietly widen the shard budget.
    overhead: overhead ?? readTable().overhead,
    minutes,
  };
  writeFileSync(TABLE, `${JSON.stringify(written, null, 2)}\n`);
  const total = Object.values(minutes).reduce((a, b) => a + b, 0);
  console.log(`e2e-durations: wrote ${Object.keys(minutes).length} specs, ${total.toFixed(1)} min total.`);
  return Object.keys(minutes).length;
}

function run(cmd, cmdArgs, opts = {}) {
  return execFileSync(cmd, cmdArgs, { encoding: 'utf8', shell: process.platform === 'win32', ...opts });
}

/**
 * Why this run's shard jobs are not a whole full suite, or `null` if they are.
 *
 * The names CI gives them (`E2E 3/9 (full)`) carry both facts the table needs: that every shard
 * measured the FULL plan rather than an affected subset, and that none of them is missing.
 */
export function fullRunRefusal(jobs) {
  const shards = [];
  for (const job of jobs) {
    const m = /^E2E (\d+)\/(\d+) \((\w+)\)$/.exec(job.name ?? '');
    if (m) shards.push({ index: Number(m[1]), of: Number(m[2]), mode: m[3], conclusion: job.conclusion });
  }
  if (shards.length === 0) return 'it ran no E2E shards';
  const subset = shards.filter((s) => s.mode !== 'full');
  if (subset.length > 0) return `it ran mode "${subset[0].mode}", not the full suite`;
  const expected = shards[0].of;
  if (shards.length !== expected) return `only ${shards.length} of its ${expected} shards reported`;
  const failed = shards.filter((s) => s.conclusion !== 'success');
  if (failed.length > 0) return `shard ${failed[0].index}/${expected} concluded "${failed[0].conclusion}"`;
  return null;
}

/** The newest green FULL ci.yml run on `main`, as `{ id, sha }`. Throws if none is in reach. */
function newestFullRun() {
  const candidates = JSON.parse(
    run('gh', ['run', 'list', '--workflow', 'ci.yml', '--branch', 'main', '--limit', '20',
      '--json', 'databaseId,conclusion,headSha']),
  ).filter((r) => r.conclusion === 'success');
  for (const candidate of candidates) {
    const { jobs } = JSON.parse(run('gh', ['run', 'view', String(candidate.databaseId), '--json', 'jobs']));
    const refusal = fullRunRefusal(jobs);
    if (refusal) {
      console.log(`e2e-durations: skipping run ${candidate.databaseId} - ${refusal}.`);
      continue;
    }
    return { id: String(candidate.databaseId), sha: candidate.headSha };
  }
  throw new Error('no green FULL ci.yml run on main in the last 20 - name a run id, or push one.');
}

/** Download a run's shard reports, merge them, and rewrite the table from what they measured. */
function record(runId) {
  let target;
  if (runId) {
    const view = JSON.parse(run('gh', ['run', 'view', String(runId), '--json', 'jobs,headSha']));
    const refusal = fullRunRefusal(view.jobs);
    if (refusal) {
      console.error(`e2e-durations: run ${runId} is not a whole full suite - ${refusal}. Refusing to record it.`);
      return 1;
    }
    target = { id: String(runId), sha: view.headSha };
  } else {
    target = newestFullRun();
  }
  console.log(`e2e-durations: recording from run ${target.id} (${target.sha.slice(0, 8)}).`);

  const work = mkdtempSync(join(tmpdir(), 'e2e-durations-'));
  try {
    const blobs = join(work, 'blobs');
    const flat = join(work, 'flat');
    mkdirSync(flat, { recursive: true });
    run('gh', ['run', 'download', target.id, '--pattern', 'blob-report-*', '--dir', blobs], { stdio: 'inherit' });
    // merge-reports wants every zip in ONE directory; `gh` gives each artifact its own.
    let zips = 0;
    for (const dir of readdirSync(blobs)) {
      for (const file of readdirSync(join(blobs, dir))) {
        if (!file.endsWith('.zip')) continue;
        copyFileSync(join(blobs, dir, file), join(flat, `${dir}-${file}`));
        zips += 1;
      }
    }
    if (zips === 0) throw new Error(`run ${target.id} has no blob reports left - they expire after 7 days.`);
    const merged = run('npx', ['playwright', 'merge-reports', '--reporter=json', flat], { maxBuffer: 256 * 1024 * 1024 });
    const minutes = minutesByFile(JSON.parse(merged));

    // The per-job OVERHEAD, from the same run. `gh run view --json jobs` does not carry step
    // timings, so this asks the REST endpoint that does; a failure here is not fatal, because a
    // refreshed per-spec table with last week's overhead is strictly better than no refresh.
    const totalMinutes = Object.values(minutes).reduce((a, b) => a + b, 0);
    let overhead = null;
    try {
      // `per_page=100` rather than `--paginate`: this endpoint answers with an OBJECT, and
      // `--paginate` concatenates one JSON document per page, which `JSON.parse` refuses the
      // moment a run has more than 30 jobs. That failure would land in the catch below and read
      // as "no job timings in reach", quietly freezing the overhead at whatever was last
      // recorded. A ci.yml run is ~16 jobs against a 20-concurrent-job account ceiling, so one
      // page of 100 is the whole answer with room to spare.
      const payload = JSON.parse(
        run('gh', ['api', `repos/{owner}/{repo}/actions/runs/${target.id}/jobs?per_page=100`]),
      );
      overhead = overheadFrom(payload.jobs, totalMinutes);
    } catch (error) {
      console.log(`e2e-durations: could not read run ${target.id}'s job timings (${error.message.split('\n')[0]}).`);
    }
    if (overhead) {
      console.log(
        `e2e-durations: overhead p90 ${overhead.jobMinutes} min per job (median ${overhead.medianJobMinutes}), ` +
          `test factor ${overhead.testFactor}, from ${overhead.samples} shard(s).`,
      );
    } else {
      console.log('e2e-durations: no shard job timings in reach - keeping the overhead already recorded.');
    }

    if (writeTable(minutes, { run: target.id, branch: 'main', sha: target.sha }, overhead) === 0) {
      console.error(`e2e-durations: run ${target.id} merged to no test results - refusing to write an empty table.`);
      return 1;
    }
    return 0;
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

function main() {
  const args = process.argv.slice(2);
  const table = readTable();

  if (args.includes('--check') || args.length === 0) {
    const files = specFilesOnDisk();
    const { unmeasured, stale } = drift(table.minutes, files);
    const total = Object.values(table.minutes).reduce((a, b) => a + b, 0);
    console.log(
      `e2e-durations: ${Object.keys(table.minutes).length} specs, ${total.toFixed(1)} min total, ` +
        `recorded ${table.source.recordedAt ?? '?'} from run ${table.source.run ?? '?'}.`,
    );
    const { jobMinutes, medianJobMinutes, testFactor, samples } = table.overhead;
    console.log(
      `  overhead ${samples > 0 ? `from ${samples} shard(s)` : '(DEFAULTS - never recorded; record one from a green full run)'}: ` +
        `${jobMinutes} min per job at p90, ${medianJobMinutes} at the median, test factor ${testFactor}. ` +
        `A shard can carry ${budgetMinutes(table).toFixed(1)} table-minutes and still fit its 20-minute cap.`,
    );
    // The two ends of the same measurement disagreeing is the install lottery coming back: on
    // 2026-09-04 the same install took 8 seconds on one shard and ten minutes on another in the
    // same run, and nothing said so until two shards were killed at the cap.
    if (samples > 0 && jobMinutes - medianJobMinutes > 2) {
      console.log(
        `  the slowest shard's setup is ${(jobMinutes - medianJobMinutes).toFixed(1)} min above the median - ` +
          'per-job cost is unstable, and the budget above is being sized by the bad days.',
      );
    }
    if (unmeasured.length > 0) {
      console.log(`  ${unmeasured.length} spec file(s) not in the table (each counted as the median):`);
      for (const f of unmeasured) console.log('   -', f);
    }
    if (stale.length > 0) {
      console.log(`  ${stale.length} table entry/entries no longer on disk (ignored):`);
      for (const f of stale) console.log('   -', f);
    }
    // Deliberately exit 0 either way. A stale table costs wall clock and never coverage
    // (see the header), so this REPORTS - it is not a gate, and must not become one.
    return 0;
  }

  const positional = args.find((a) => !a.startsWith('--'));

  if (args.includes('--record')) return record(positional);

  if (!positional) {
    console.error('usage: node scripts/e2e-durations.mjs [--check | --record [run-id] | <merged-report.json>]');
    return 1;
  }
  const minutes = minutesByFile(JSON.parse(readFileSync(positional, 'utf8')));
  if (
    writeTable(minutes, {
      run: process.env.E2E_DURATIONS_RUN ?? table.source.run ?? 'unknown',
      branch: process.env.E2E_DURATIONS_BRANCH ?? 'main',
      sha: process.env.E2E_DURATIONS_SHA ?? 'unknown',
    }) === 0
  ) {
    console.error(`e2e-durations: ${positional} contained no test results - refusing to write an empty table.`);
    return 1;
  }
  return 0;
}

const isEntrypoint =
  Boolean(process.argv[1]) &&
  process.argv[1].replaceAll('\\', '/').toLowerCase().endsWith('e2e-durations.mjs');
if (isEntrypoint) process.exit(main());
