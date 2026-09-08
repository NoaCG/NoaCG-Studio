// What the night report must get right, and every one of these is a distinction it got wrong once
// against the real queue directory before the tests pinned it: a refusal the branch recovered from
// is not outstanding, a refusal the queue already retried is not outstanding EITHER (its retry is),
// and a refusal kind the queue adopts is never put on a person's list.
//
// The fixtures are shaped like the records on disk on 2026-09-04 rather than invented: a merge job
// carries `kind: 'merge'`, `exitCode`, an optional `refusal.kind`, and a landing is a line in
// landed.jsonl with `branch`, `sha` and `at`.
import assert from 'node:assert/strict';
import test from 'node:test';

import { DEFAULT_WINDOW_HOURS, UNNAMED, nightReport, parseArgs, renderReport } from './night-report.mjs';

const HOUR = 3_600_000;
const T0 = Date.parse('2026-09-04T20:00:00Z');
const window = { since: T0 - 6 * HOUR, until: T0 + 6 * HOUR };

const merge = (over) => ({ kind: 'merge', state: 'failed', exitCode: 1, capMinutes: 45, ...over });

test('a refusal whose branch went on to land is reported, and asks nobody for anything', () => {
  const report = nightReport({
    jobs: [merge({ id: 'j-1', branch: 'claude/a', finishedAt: T0, refusal: { kind: 'ci-red' } })],
    landings: [{ branch: 'claude/a', sha: 'abcdef1234', at: T0 + HOUR }],
    ...window,
  });
  assert.equal(report.counts.refused, 1);
  assert.equal(report.counts.refusedAndRecovered, 1);
  assert.equal(report.counts.landed, 1);
  assert.equal(report.counts.needsAPerson, 0);
  // And the listing offers no command beside it: a re-queue here mints a second landing for work
  // already on main.
  const text = renderReport(report);
  assert.match(text, /and the branch went on to land/);
  assert.doesNotMatch(text, /a person decides|the SESSION runs|the QUEUE runs/);
});

test('a landing BEFORE the refusal does not count as recovering it', () => {
  const report = nightReport({
    jobs: [merge({ id: 'j-1', branch: 'claude/a', finishedAt: T0, refusal: { kind: 'ci-red' } })],
    landings: [{ branch: 'claude/a', sha: 'abcdef1234', at: T0 - HOUR }],
    ...window,
  });
  assert.equal(report.counts.refusedAndRecovered, 0);
  assert.equal(report.counts.needsAPerson, 1);
  assert.match(report.needsAPerson[0].what, /claude\/a/);
});

test('a refusal the queue already retried is its retry\'s problem, not a person\'s', () => {
  const jobs = [
    merge({ id: 'j-1', branch: 'claude/a', finishedAt: T0, reapedAsDead: true, exitCode: null }),
    merge({ id: 'j-2', branch: 'claude/a', finishedAt: T0 + HOUR, retryOf: 'j-1', retryReason: 'reached no verdict', reapedAsDead: true, exitCode: null }),
  ];
  const report = nightReport({ jobs, landings: [], ...window });
  assert.equal(report.counts.refused, 2);
  assert.equal(report.counts.retries, 1);
  // One branch, one live problem - not two lines for the same stuck landing.
  assert.equal(report.counts.needsAPerson, 1);
  assert.match(report.needsAPerson[0].where, /j-2/);
});

test('a refusal kind the QUEUE recovers never reaches the person list', () => {
  const report = nightReport({
    jobs: [merge({ id: 'j-1', branch: 'claude/a', finishedAt: T0, refusal: { kind: 'order-blocked', blockers: ['claude/b'] } })],
    landings: [],
    ...window,
  });
  assert.equal(report.counts.needsAPerson, 0);
  assert.equal(report.refusals[0].byQueue, true);
  assert.match(report.refusals[0].summary, /claude\/b/);
});

test('a refusal the SESSION must answer carries the command, and one a person decides carries none', () => {
  const report = nightReport({
    jobs: [
      merge({ id: 'j-1', branch: 'claude/a', finishedAt: T0, refusal: { kind: 'stale-pin' } }),
      merge({ id: 'j-2', branch: 'claude/b', finishedAt: T0, refusal: { kind: 'merge-conflict' } }),
    ],
    landings: [],
    ...window,
  });
  assert.equal(report.counts.needsAPerson, 2);
  assert.match(report.needsAPerson[0].action, /queue:merge/);
  assert.equal(report.needsAPerson[1].action, 'a person decides this one');
});

test('refusals group by kind, and an unnamed one is grouped as unnamed rather than guessed at', () => {
  const report = nightReport({
    jobs: [
      merge({ id: 'j-1', branch: 'claude/a', finishedAt: T0, refusal: { kind: 'ci-red' } }),
      merge({ id: 'j-2', branch: 'claude/b', finishedAt: T0, refusal: { kind: 'ci-red' } }),
      merge({ id: 'j-3', branch: 'claude/c', finishedAt: T0 }),
    ],
    landings: [],
    ...window,
  });
  assert.deepEqual(report.kinds.map((k) => [k.kind, k.count]), [['ci-red', 2], [UNNAMED, 1]]);
  assert.match(renderReport(report), /refused before the refusal kinds existed says so in prose/);
});

test('a landing killed at its cap is ONE person-item, and asks to be re-queued', () => {
  const report = nightReport({
    jobs: [merge({ id: 'j-1', branch: 'claude/a', state: 'timed-out', exitCode: null, finishedAt: T0 })],
    landings: [],
    ...window,
  });
  // It used to appear twice - once as a refusal, once as its own case - with the two lines giving
  // contradictory advice about the same branch.
  assert.equal(report.counts.needsAPerson, 1);
  assert.match(report.needsAPerson[0].what, /45 min cap/);
  assert.match(report.needsAPerson[0].action, /requeue claude\/a/);
});

test('a capped landing the queue already put back is its retry\'s problem', () => {
  const jobs = [
    merge({ id: 'j-1', branch: 'claude/a', state: 'timed-out', exitCode: null, finishedAt: T0 }),
    merge({ id: 'j-2', branch: 'claude/a', state: 'waiting', retryOf: 'j-1' }),
  ];
  // A second requeue here would mint a second landing job for one branch.
  assert.equal(nightReport({ jobs, landings: [], ...window }).counts.needsAPerson, 0);
});

test('a landing that pushed to main and was THEN killed is a landing, not a refusal', () => {
  // endedWithoutExitCode asks git before it writes, and records this shape on purpose
  // (jobs-store.mjs). Reading the exit code instead of the state undid that.
  const report = nightReport({
    jobs: [merge({ id: 'j-1', branch: 'claude/a', state: 'done', exitCode: null, landedBeforeItEnded: true, reapedAsDead: true, finishedAt: T0 })],
    landings: [{ branch: 'claude/a', sha: 'abcdef1234', at: T0 }],
    ...window,
  });
  assert.equal(report.counts.refused, 0);
  assert.equal(report.counts.needsAPerson, 0);
});

test('a retry that landed says so, even when it recorded no exit code and no ledger line', () => {
  const jobs = [
    merge({ id: 'j-1', branch: 'claude/a', finishedAt: T0, reapedAsDead: true, exitCode: null }),
    merge({ id: 'j-2', branch: 'claude/a', state: 'done', exitCode: null, landedBeforeItEnded: true, retryOf: 'j-1', retryReason: 'reached no verdict', finishedAt: T0 + HOUR }),
  ];
  const report = nightReport({ jobs, landings: [], ...window });
  assert.equal(report.retries.length, 1);
  assert.equal(report.retries[0].landed, true);
  assert.match(renderReport(report), /and it landed/);
});

test('a CANCELLED landing is a withdrawal, not a refusal', () => {
  const report = nightReport({
    jobs: [merge({ id: 'j-1', branch: 'claude/a', state: 'cancelled', exitCode: null, finishedAt: T0 })],
    landings: [],
    ...window,
  });
  assert.equal(report.counts.refused, 0);
  assert.equal(report.counts.cancelled, 1);
  assert.equal(report.counts.needsAPerson, 0);
});

test('a gate that failed OR was killed at its cap is on the person list', () => {
  const report = nightReport({
    jobs: [
      { id: 'j-8', kind: 'gate', state: 'failed', exitCode: 1, finishedAt: T0, command: 'npm run build' },
      // Only a reaper kill writes `failed`; a gate killed at its own cap is `timed-out`, and used
      // to be reported as nothing at all.
      { id: 'j-9', kind: 'sweep', state: 'timed-out', exitCode: null, capMinutes: 45, finishedAt: T0, command: 'npm run test:e2e' },
    ],
    landings: [],
    ...window,
  });
  assert.equal(report.counts.needsAPerson, 2);
  assert.match(report.needsAPerson[0].what, /npm run build/);
  assert.match(report.needsAPerson[1].what, /45 min cap/);
});

test('a cancelled job is listed but asks for nothing - it was withdrawn on purpose', () => {
  const report = nightReport({
    jobs: [{ id: 'j-9', kind: 'gate', state: 'cancelled', exitCode: null, finishedAt: T0, command: 'node -e "0"' }],
    landings: [],
    ...window,
  });
  assert.equal(report.counts.cancelled, 1);
  assert.equal(report.counts.needsAPerson, 0);
  assert.match(renderReport(report), /## Cancelled \(1\)/);
});

test('everything outside the window is outside the report', () => {
  const report = nightReport({
    jobs: [merge({ id: 'j-1', branch: 'claude/a', finishedAt: T0 - 48 * HOUR, refusal: { kind: 'ci-red' } })],
    landings: [{ branch: 'claude/old', sha: 'aaaaaaa', at: T0 - 48 * HOUR }],
    ...window,
  });
  assert.equal(report.counts.refused, 0);
  assert.equal(report.counts.landed, 0);
});

test('an empty night renders as an empty night rather than as blank sections', () => {
  const text = renderReport(nightReport({ jobs: [], landings: [], ...window }));
  assert.match(text, /Nothing\. No branch reached main in this window\./);
  assert.match(text, /No landing refused\./);
  assert.match(text, /0 landed/);
  assert.match(text, /Nothing\. Everything that refused was either recovered/);
});

test('parseArgs defaults to the night and accepts a longer or explicit window', () => {
  const now = Date.parse('2026-09-05T08:00:00Z');
  assert.equal(parseArgs([], now).since, now - DEFAULT_WINDOW_HOURS * HOUR);
  assert.equal(parseArgs(['--hours', '24'], now).since, now - 24 * HOUR);
  assert.equal(parseArgs(['--since', '2026-09-04T18:00:00Z'], now).since, Date.parse('2026-09-04T18:00:00Z'));
  assert.equal(parseArgs(['--json', '--write'], now).json, true);
  assert.equal(parseArgs(['--json', '--write'], now).write, true);
  assert.throws(() => parseArgs(['--hours', 'soon'], now), /positive number of hours/);
  assert.throws(() => parseArgs(['--since', 'tuesday-ish'], now), /a date this machine can parse/);
  assert.throws(() => parseArgs(['--overnight'], now), /unknown option/);
});
