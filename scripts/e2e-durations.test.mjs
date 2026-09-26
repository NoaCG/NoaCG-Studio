// The duration table decides how many runners a CI plan asks for, and it is refreshed from a
// real run's shard reports (`npm run record:e2e-durations`). Recording is where it can go
// silently wrong: a run that measured only an AFFECTED SUBSET has timings for a fraction of the
// suite, and writing those wipes every spec it never ran. Each wiped spec then counts as the
// median - the table reads full and healthy while being wrong about most of it.
//
// Nothing downstream can catch that. The table is deliberately not a gate (a stale entry costs
// wall clock, never coverage), so a corrupt recording produces no red anywhere - just slower
// runs, blamed on the runners. The refusal is the only thing standing between a mistyped run id
// and that outcome, which is why it is a pure function over the job list and pinned here.
//
// `fullRunRefusal` reads the names CI gives its shard jobs (`E2E 3/9 (full)`), because they carry
// both facts a recording needs: that every shard ran the FULL plan, and that none is missing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  budgetMinutes,
  drift,
  fullRunRefusal,
  minutesByFile,
  overheadFrom,
  parseArgs,
  predictShardMinutes,
  quietBody,
  refreshBody,
  refreshVerdict,
  REFRESH_BRANCH,
  REFRESH_THRESHOLDS,
  shardBalance,
  SHARD_CAP_MINUTES,
  SHARD_SAFETY_MINUTES,
} from './e2e-durations.mjs';

/** The shard jobs of a healthy full run, as `gh run view --json jobs` reports them. */
function fullShards(count = 9, overrides = {}) {
  return Array.from({ length: count }, (_, i) => ({
    name: `E2E ${i + 1}/${count} (full)`,
    conclusion: 'success',
    ...(overrides[i + 1] ?? {}),
  }));
}

/** The non-shard jobs every run also has - none of which says anything about coverage. */
const OTHER_JOBS = [
  { name: 'Build', conclusion: 'success' },
  { name: 'E2E plan', conclusion: 'success' },
  { name: 'Catalog calibration gate', conclusion: 'success' },
  { name: 'CI gate', conclusion: 'success' },
];

test('a green full run is accepted', () => {
  assert.equal(fullRunRefusal([...OTHER_JOBS, ...fullShards()]), null);
});

test('the surrounding jobs are not mistaken for shards', () => {
  // "E2E plan" starts with the same two characters as a shard job and must not parse as one -
  // if it did, a run would look like it had an extra, unnumbered shard.
  assert.equal(fullRunRefusal([...OTHER_JOBS, ...fullShards(4)]), null);
  assert.match(fullRunRefusal(OTHER_JOBS), /ran no E2E shards/);
  // A shard name CI does not currently produce must refuse rather than half-parse: reading a
  // trailing word as if it were not there is how a renamed job would quietly pass as full.
  const suffixed = fullShards().map((job) => ({ ...job, name: `${job.name} rerun` }));
  assert.match(fullRunRefusal(suffixed), /ran no E2E shards/);
});

test('a subset run is refused - it measured a fraction of the suite', () => {
  const subset = fullShards().map((job) => ({ ...job, name: job.name.replace('(full)', '(subset)') }));
  assert.match(fullRunRefusal(subset), /not the full suite/);
});

test('one subset shard among full ones is still a refusal', () => {
  const mixed = fullShards();
  mixed[2].name = 'E2E 3/9 (subset)';
  assert.match(fullRunRefusal(mixed), /not the full suite/);
});

test('a missing shard is refused - its specs would be wiped, not measured', () => {
  const short = fullShards().slice(0, 8);
  const refusal = fullRunRefusal(short);
  assert.match(refusal, /only 8 of its 9 shards/);
});

test('a failed or cancelled shard is refused', () => {
  assert.match(fullRunRefusal(fullShards(9, { 4: { conclusion: 'failure' } })), /shard 4\/9.*"failure"/);
  assert.match(fullRunRefusal(fullShards(9, { 7: { conclusion: 'cancelled' } })), /shard 7\/9.*"cancelled"/);
});

test('a run with no jobs at all is refused', () => {
  assert.match(fullRunRefusal([]), /ran no E2E shards/);
  assert.match(fullRunRefusal([{ conclusion: 'success' }]), /ran no E2E shards/);
});

test('per-file minutes sum every RESULT, so a retry costs what it really cost', () => {
  const report = {
    suites: [
      {
        file: 'e2e/wizard.spec.ts',
        specs: [
          {
            file: 'e2e/wizard.spec.ts',
            tests: [{ results: [{ duration: 30_000 }, { duration: 30_000 }] }],
          },
        ],
      },
    ],
  };
  // Two results of 30s - a test that failed once and passed on retry - is one measured minute.
  assert.deepEqual(minutesByFile(report), { 'wizard.spec.ts': 1 });
});

test('per-file minutes fold nested suites into the file that owns them', () => {
  const report = {
    suites: [
      {
        file: 'e2e/exports.spec.ts',
        suites: [
          { specs: [{ tests: [{ results: [{ duration: 6_000 }] }] }] },
          { specs: [{ tests: [{ results: [{ duration: 6_000 }] }] }] },
        ],
        specs: [{ tests: [{ results: [{ duration: 12_000 }] }] }],
      },
    ],
  };
  assert.deepEqual(minutesByFile(report), { 'exports.spec.ts': 0.4 });
});

test('drift names specs the table has never measured, and entries whose file is gone', () => {
  const minutes = { 'a.spec.ts': 1, 'gone.spec.ts': 2 };
  const { unmeasured, stale } = drift(minutes, ['a.spec.ts', 'new.spec.ts']);
  assert.deepEqual(unmeasured, ['new.spec.ts']);
  assert.deepEqual(stale, ['gone.spec.ts']);
});

// THE PART OF A SHARD THAT IS NOT ITS TESTS. Until 2026-09-04 nothing measured it, and the
// planner behaved as though it were zero: it aimed nine bins at 11.1 measured minutes each,
// called that comfortable against a 20-minute cap, and two shards of run 33854844447 were killed
// at exactly that cap carrying 9.8 measured minutes behind a ten-minute `npm ci`. These tests pin
// the arithmetic that now carries the second term, because it decides whether a plan is planned
// to fail.

/** A run's shard jobs in the REST shape, with per-step timings. Minutes in, minutes out. */
function shardJobs(pairs) {
  const at = (minutes) => new Date(Date.UTC(2026, 8, 4) + minutes * 60_000).toISOString();
  return pairs.map(([setup, step], i) => ({
    name: `E2E ${i + 1}/${pairs.length} (full)`,
    started_at: at(0),
    completed_at: at(setup + step),
    steps: [
      { name: 'Install dependencies', started_at: at(0), completed_at: at(setup) },
      { name: 'E2E shard', started_at: at(setup), completed_at: at(setup + step) },
    ],
  }));
}

test('overhead is the job wall clock minus its test step, at the p90 and the median', () => {
  // Setup costs 1,1,1,1,1,1,1,1,9 - nine samples, so the p90 is the worst one. That is the point:
  // a cap kills the slowest shard, and sizing against the mean is how a plan is planned to fail.
  const jobs = shardJobs([[1, 10], [1, 10], [1, 10], [1, 10], [1, 10], [1, 10], [1, 10], [1, 10], [9, 10]]);
  const overhead = overheadFrom(jobs, 90);
  assert.equal(overhead.jobMinutes, 9);
  assert.equal(overhead.medianJobMinutes, 1);
  assert.equal(overhead.samples, 9);
});

test('the test factor is the shard steps over the table, floored at one', () => {
  // Three steps of 10 minutes against a table saying 24: the runner spent 25% longer than the sum
  // of `result.duration`, which is Playwright's own start and the dev-server boot.
  assert.equal(overheadFrom(shardJobs([[1, 10], [1, 10], [1, 10]]), 24).testFactor, 1.25);
  // A table LARGER than the steps that produced it cannot be right for a `workers: 1` run, and
  // reporting a factor below one would shrink every later prediction. Floored, never inverted.
  assert.equal(overheadFrom(shardJobs([[1, 10], [1, 10], [1, 10]]), 60).testFactor, 1);
});

test('jobs that are not shards, or that never ran the step, contribute nothing', () => {
  const jobs = [
    ...shardJobs([[2, 10], [2, 10]]),
    { name: 'Build', started_at: '2026-09-04T00:00:00Z', completed_at: '2026-09-04T00:30:00Z', steps: [] },
    { name: 'E2E 3/3 (full)', started_at: '2026-09-04T00:00:00Z', completed_at: '2026-09-04T00:40:00Z', steps: [] },
  ];
  const overhead = overheadFrom(jobs, 20);
  assert.equal(overhead.samples, 2);
  assert.equal(overhead.jobMinutes, 2);
});

test('a payload with no usable shard returns null, so the caller keeps what it had', () => {
  assert.equal(overheadFrom([], 10), null);
  assert.equal(overheadFrom([{ name: 'Build' }], 10), null);
});

test('the shard budget shrinks as the measured overhead grows', () => {
  const table = (jobMinutes, testFactor) => ({ minutes: {}, overhead: { jobMinutes, testFactor } });
  // A healthy day: 20, less 3 of variance margin, less 1 of setup, over a factor of 1.
  assert.equal(budgetMinutes(table(1, 1)), 16);
  // 2026-09-04's measured p90. The full suite is 99.7 minutes, so nine runners cannot carry it -
  // which is exactly what the cancelled shards were saying.
  assert.ok(budgetMinutes(table(6.6, 1.02)) < 99.7 / 9);
  // Never zero or negative, however bad the reading: a plan that cannot fit must produce a
  // warning a person reads, not a division that asks for an unbounded number of runners.
  assert.equal(budgetMinutes(table(40, 1)), 1);
});

// THE CAP IS A FACT ABOUT ci.yml, and this constant is a copy of it. The whole value of the
// prediction is that it is measured against the real deadline, so a workflow raised to 25 with
// the constant left at 20 would leave `budgetMinutes` and the plan's over-cap warning answering a
// question nobody is asking, quietly, with every test still green. Cheaper to assert than to
// document: the comment on SHARD_CAP_MINUTES says "change ci.yml in the same commit", and this is
// what makes that true rather than hopeful.
test('the shard cap matches the E2E job timeout in ci.yml', () => {
  const ci = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
  // The `e2e:` job's own block, up to the next top-level job key.
  const block = /^ {2}e2e:$([\s\S]*?)^ {2}\S/m.exec(ci);
  assert.ok(block, 'ci.yml no longer has an `e2e:` job - this assertion needs updating with it');
  const timeout = /^ {4}timeout-minutes: (\d+)$/m.exec(block[1]);
  assert.ok(timeout, 'the E2E job has no timeout-minutes - the shard cap is no longer a real deadline');
  assert.equal(Number(timeout[1]), SHARD_CAP_MINUTES);
});

test('the prediction is the budget read the other way round', () => {
  const table = { minutes: {}, overhead: { jobMinutes: 2, testFactor: 1.1 } };
  assert.equal(predictShardMinutes(10, table), 13);
  // A shard carrying exactly the budget lands on the cap minus the variance margin.
  const budget = budgetMinutes(table);
  assert.ok(Math.abs(predictShardMinutes(budget, table) - (SHARD_CAP_MINUTES - SHARD_SAFETY_MINUTES)) < 1e-9);
});

// THE SCHEDULED REFRESH (`--refresh`, .github/workflows/e2e-durations-refresh.yml). Recording is
// automatic now, so the only judgement left is whether a recording is worth a person's attention -
// and that judgement is the whole mechanism. Too eager and it files a pull request every Monday,
// which is how the weekly report it replaces came to be ignored; too slow and the table drifts on
// exactly as it did for 15 days in August. So the thresholds are pinned here rather than tuned in
// a workflow log.

/** A table with the fields every consumer reads, and nothing else. */
function tableOf(minutes, overhead = { jobMinutes: 0.5, testFactor: 1.01 }, source = {}) {
  return { source: { run: '1', recordedAt: '2026-09-16', ...source }, minutes, overhead };
}

/** Balance figures shaped like `shardBalance`'s, with no drift in them unless asked for. */
function balanceOf(slowestBefore, slowestAfter) {
  return {
    before: { shards: 9, slowest: slowestBefore, spread: 1, balanced: slowestAfter },
    after: { shards: 9, slowest: slowestAfter, spread: 0.05, balanced: slowestAfter },
  };
}

test('a recording that agrees with the table on main is thrown away', () => {
  const same = tableOf({ 'a.spec.ts': 5, 'b.spec.ts': 5 });
  const verdict = refreshVerdict(same, same, ['a.spec.ts', 'b.spec.ts'], balanceOf(5, 5));
  assert.equal(verdict.material, false);
  assert.deepEqual(verdict.reasons, []);
});

// The leak the whole mechanism exists to stop: a spec file lands, nothing measures it, and the
// packer guesses it at the median from then on. Four were on disk on 2026-09-16.
test('a spec file the table has never measured is enough on its own', () => {
  const before = tableOf({ 'a.spec.ts': 5 });
  const after = tableOf({ 'a.spec.ts': 5, 'new.spec.ts': 0.2 });
  const verdict = refreshVerdict(before, after, ['a.spec.ts', 'new.spec.ts'], balanceOf(5, 5));
  assert.equal(verdict.material, true);
  assert.match(verdict.reasons[0], /never measured.*new\.spec\.ts/);
});

// 4.0% of it is RUNNER SPEED: two green full runs an hour apart, recorded over the same 151 spec
// files on 2026-09-16, disagreed by that much with nothing about the suite changed. A threshold
// under the noise floor is a pull request every Monday.
test('the suite total has to move further than a slow runner moves it', () => {
  const before = tableOf({ 'a.spec.ts': 100 });
  const suite = ['a.spec.ts'];
  const quiet = refreshVerdict(before, tableOf({ 'a.spec.ts': 104 }), suite, balanceOf(100, 100));
  assert.equal(quiet.material, false);
  const loud = refreshVerdict(before, tableOf({ 'a.spec.ts': 112 }), suite, balanceOf(100, 100));
  assert.equal(loud.material, true);
  assert.match(loud.reasons[0], /suite total moved 12\.0%/);
  // The threshold is the one documented beside it, not whatever this test happens to use.
  assert.equal(REFRESH_THRESHOLDS.totalFraction, 0.1);
});

// The overhead terms decide `budgetMinutes`, which is what the plan's "does this fit the 20-minute
// cap" verdict is made of - so drift there costs a wrong ANSWER, not just a slow run. Thresholding
// the budget rather than each term covers a changed install cost and a changed test factor at once.
test('a shard budget that moves by a minute is worth asking about', () => {
  const minutes = { 'a.spec.ts': 50 };
  const suite = ['a.spec.ts'];
  const before = tableOf(minutes, { jobMinutes: 0.5, testFactor: 1.01 });
  const quiet = refreshVerdict(before, tableOf(minutes, { jobMinutes: 1, testFactor: 1.01 }), suite, balanceOf(50, 50));
  assert.equal(quiet.material, false);
  const loud = refreshVerdict(before, tableOf(minutes, { jobMinutes: 6.5, testFactor: 1.01 }), suite, balanceOf(50, 50));
  assert.equal(loud.material, true);
  assert.match(loud.reasons[0], /budget moves -5\.9 table-minutes/);
});

// What a stale table costs since `packShards` started bin-packing: the same suite, divided by
// weights that are wrong, leaves one runner carrying more than the rest and the E2E stage waits on
// it. Both figures here are the real ones measured on 2026-09-16 - the quiet pair is two
// consecutive runs an hour apart, which is the floor a repacking always beats because it is
// optimised for the numbers it was handed; the loud pair is a table 12 days old.
test('an unbalanced shard set is worth asking about even when the total has not moved', () => {
  const minutes = { 'a.spec.ts': 50 };
  const suite = ['a.spec.ts'];
  const table = tableOf(minutes);
  assert.equal(refreshVerdict(table, table, suite, balanceOf(13.3, 12.7)).material, false);
  const loud = refreshVerdict(table, table, suite, balanceOf(14.95, 12.68));
  assert.equal(loud.material, true);
  assert.match(loud.reasons[0], /slowest of 9 shards loses 2\.3 table-minutes/);
});

// Both packings are scored with the FRESH weights, because the question is what the shard set CI
// ships today costs in the suite as it really is - not what the stale table believed it cost.
test('the balance is measured in this recording s minutes, under both tables', async () => {
  const suite = ['heavy.spec.ts', 'light.spec.ts', 'mid.spec.ts', 'other.spec.ts'];
  // The table on main thinks every file is the same size; the recording knows one of them grew.
  const before = tableOf(Object.fromEntries(suite.map((f) => [f, 1])));
  const after = tableOf({ 'heavy.spec.ts': 6, 'light.spec.ts': 1, 'mid.spec.ts': 1, 'other.spec.ts': 1 });
  const balance = await shardBalance(before, after, suite);
  assert.equal(balance.after.slowest, 6, 'the fresh packing gives the heavy file a bin of its own');
  assert.ok(balance.before.slowest >= 7, `a blind packing pairs it with another file: ${balance.before.slowest}`);
});

test('the pull request body carries the case, the run, and the review it does not claim', () => {
  const before = tableOf({ 'a.spec.ts': 100 }, { jobMinutes: 0.5, testFactor: 1.01 }, { run: '111', recordedAt: '2026-09-04' });
  const after = tableOf({ 'a.spec.ts': 120 }, { jobMinutes: 0.5, testFactor: 1.01 }, { run: '222', recordedAt: '2026-09-16', sha: 'abc1234' });
  const balance = balanceOf(14.7, 12.2);
  const verdict = refreshVerdict(before, after, ['a.spec.ts'], balance);
  const body = refreshBody(before, after, verdict, balance);
  assert.match(body, /run 222/);
  assert.match(body, /run 111 \(2026-09-04\)/);
  for (const reason of verdict.reasons) assert.ok(body.includes(reason), `the body is missing: ${reason}`);
  // The stamp and the auto-merge are the difference between a proposal and a gate editing its own
  // budget, so the body says out loud that neither is here.
  assert.match(body, /noacg\/reviewed/);
  assert.match(body, /queue-merge/);
  // The App token started this pull request's CI, so the body gives no dispatch command any more:
  // it says the checks are already running and that `/queue-merge` re-runs `Reviewed`.
  assert.match(body, /App token/);
  assert.doesNotMatch(body, /gh workflow run/);
});

// A quiet week is read in the same places a loud one is - the job summary the owner-queue item
// routes to, and the step log. Printing the pull request body there would open it with a "why it is
// worth landing" heading over no reasons at all.
test('a quiet week says what did not move, and what it would have taken', () => {
  const before = tableOf({ 'a.spec.ts': 100 });
  const after = tableOf({ 'a.spec.ts': 104 });
  const verdict = refreshVerdict(before, after, ['a.spec.ts'], balanceOf(12.6, 12.2));
  assert.equal(verdict.material, false);
  const body = quietBody(verdict);
  assert.match(body, /nothing proposed/);
  assert.match(body, /4\.0%/);
  assert.match(body, /0\.40 table-minutes off the slowest shard/);
  assert.match(body, new RegExp(`${REFRESH_THRESHOLDS.slowestShardMinutes} table-minutes`));
});

// `--body <path>` eats the argument after it, and the guard against reading that argument as a run
// id ALSO has to leave argument zero alone - `e2e-durations.mjs <merged-report.json>` is the one
// mode whose positional comes first. Written without the -1 check, that mode answered the usage
// error instead of rewriting the table, and no test anywhere noticed.
test('the report path is a positional argument, with or without --body', () => {
  assert.deepEqual(parseArgs(['report.json']), { bodyPath: undefined, positional: 'report.json' });
  assert.deepEqual(parseArgs(['--refresh', '123']), { bodyPath: undefined, positional: '123' });
  assert.deepEqual(parseArgs(['--refresh', '--body', 'out.md']), { bodyPath: 'out.md', positional: undefined });
  assert.deepEqual(parseArgs(['--refresh', '123', '--body', 'out.md']), { bodyPath: 'out.md', positional: '123' });
  assert.deepEqual(parseArgs(['--refresh', '--body', 'out.md', '123']), { bodyPath: 'out.md', positional: '123' });
  assert.deepEqual(parseArgs(['--check']), { bodyPath: undefined, positional: undefined });
});

// THE BRANCH NAME LIVES IN TWO PLACES, because a workflow cannot read a constant out of a module -
// the workflow pushes it, and the pull request body tells a person to name it in a command. If
// they ever disagree, the body's instruction names a branch nobody has, which is a dead end
// discovered by whoever is trying to land the refresh.
test('the workflow pushes the branch the pull request body tells you to dispatch', () => {
  const workflow = readFileSync(new URL('../.github/workflows/e2e-durations-refresh.yml', import.meta.url), 'utf8');
  const branch = /^ {10}BRANCH: (\S+)$/m.exec(workflow);
  assert.ok(branch, 'e2e-durations-refresh.yml no longer sets BRANCH - this assertion needs updating with it');
  assert.equal(branch[1], REFRESH_BRANCH);
});

// The dispatch that gives the pull request its `CI gate` runs at the very END of a refresh, after
// the recording, the push and the pull request have all worked, so a token that may not dispatch
// fails the one step nothing before it exercises - and only in a week that had something to propose.
test('the workflow token may dispatch the ci.yml run it asks for', () => {
  const workflow = readFileSync(new URL('../.github/workflows/e2e-durations-refresh.yml', import.meta.url), 'utf8');
  assert.match(workflow, /gh workflow run ci\.yml/);
  assert.match(workflow, /^ {2}actions: write$/m);
});
