// guards: scripts/e2e-capacity.mjs, docs/work-specs/e2e-suite-budget/spec.md
// The capacity line: what counts as usage, when a change is warned or refused, how an exception
// covers it, and that an unmeasured spec in a partial report counts at the p90, never the median.
import assert from 'node:assert/strict';
import test from 'node:test';

import { EXCEPTION_MAX_DAYS, HARD_SHARE, MAIN_RUNNERS, WARN_SHARE, assess, capacityMinutes, exceptionFor, parseExceptions, summarize } from './e2e-capacity.mjs';

// A table whose budget is easy to reason about: jobMinutes 0.42 and testFactor 1.01 give
// budgetMinutes 16.416 and, on 13 runners, a capacity of 213.40 table-minutes.
const overhead = { jobMinutes: 0.42, testFactor: 1.01, medianJobMinutes: 0.3, samples: 10 };
function table(total, n = 100) {
  const minutes = {};
  for (let i = 0; i < n; i++) minutes[`s${i}.spec.ts`] = total / n;
  return { source: {}, minutes, overhead };
}
const suiteOf = (t, extra = []) => [...Object.keys(t.minutes), ...extra].sort();

test('capacity is runners times the budget, and the lines sit where the spec says', () => {
  assert.equal(MAIN_RUNNERS, 13);
  assert.equal(WARN_SHARE, 0.85);
  assert.equal(HARD_SHARE, 0.95);
  assert.ok(Math.abs(capacityMinutes(table(100)) - 213.40) < 0.05);
});

test('below the warning line a change that adds a spec is ok, and the added minutes are reported', () => {
  const t = table(100);
  const r = assess({ table: t, suite: suiteOf(t, ['new.spec.ts']), changed: ['e2e/new.spec.ts'], today: '2026-10-12' });
  assert.equal(r.status, 'ok');
  assert.equal(r.details[0].how, 'unmeasured - estimated at the median until the run reports');
  assert.ok(Math.abs(r.added - 1) < 1e-9, 'the median of a flat table is one minute');
});

test('between the lines every change is warned, whether or not it adds minutes', () => {
  const t = table(189);
  assert.equal(assess({ table: t, suite: suiteOf(t), today: '2026-10-12' }).status, 'warn');
  assert.equal(assess({ table: t, suite: suiteOf(t, ['new.spec.ts']), changed: ['e2e/new.spec.ts'], today: '2026-10-12' }).status, 'warn');
});

test('above the hard line a change is refused only when it ADDS minutes without an exception', () => {
  const t = table(204);
  const quiet = assess({ table: t, suite: suiteOf(t), today: '2026-10-12' });
  assert.equal(quiet.status, 'warn', 'a change that adds nothing is never refused, whoever made it');
  const adds = assess({ table: t, suite: suiteOf(t, ['new.spec.ts']), changed: ['e2e/new.spec.ts'], today: '2026-10-12' });
  assert.equal(adds.status, 'refuse');
  assert.match(adds.reason, /without a budget exception for new\.spec\.ts/);
  const edited = assess({ table: t, suite: suiteOf(t), changed: ['e2e/s1.spec.ts'], measured: { 's1.spec.ts': 1.0 }, today: '2026-10-12' });
  assert.equal(edited.status, 'warn', 'editing a spec without making it slower adds nothing');
  const faster = assess({ table: t, suite: suiteOf(t), changed: ['e2e/s1.spec.ts'], measured: { 's1.spec.ts': 0.2 }, today: '2026-10-12' });
  assert.ok(faster.after < faster.before + 1e-9, 'a spec made faster lowers the usage');
});

test('a valid exception covers the added spec; an expired or too-long one does not', () => {
  const t = table(204);
  const ex = (expires) => [{ spec: 'e2e/new.spec.ts', minutes: 2, protects: 'the saved graphic reopening', expires, from: 'docs/work-specs/x/spec.md' }];
  const covered = assess({ table: t, suite: suiteOf(t, ['new.spec.ts']), changed: ['e2e/new.spec.ts'], exceptions: ex('2026-11-01'), today: '2026-10-12' });
  assert.equal(covered.status, 'warn');
  assert.equal(covered.details[0].exception.expires, '2026-11-01');
  assert.equal(assess({ table: t, suite: suiteOf(t, ['new.spec.ts']), changed: ['e2e/new.spec.ts'], exceptions: ex('2026-10-11'), today: '2026-10-12' }).status, 'refuse', 'expired yesterday');
  assert.equal(assess({ table: t, suite: suiteOf(t, ['new.spec.ts']), changed: ['e2e/new.spec.ts'], exceptions: ex('2026-12-31'), today: '2026-10-12' }).status, 'refuse', `longer than ${EXCEPTION_MAX_DAYS} days is not an exception`);
  assert.equal(exceptionFor(ex('2026-10-12'), 'e2e/new.spec.ts', '2026-10-12')?.expires, '2026-10-12', 'the expiry day itself still counts');
});

test('a partial report counts a changed spec it does not carry at the p90, never the median', () => {
  const minutes = {};
  for (let i = 0; i < 100; i++) minutes[`s${i}.spec.ts`] = i < 90 ? 0.5 : 5; // median 0.5, p90 5
  const t = { source: {}, minutes, overhead };
  const r = assess({ table: t, suite: suiteOf(t, ['new.spec.ts']), changed: ['e2e/new.spec.ts'], measured: { 's1.spec.ts': 0.5 }, today: '2026-10-12' });
  assert.equal(r.details[0].now, 5);
  assert.match(r.details[0].how, /p90/);
  const estimate = assess({ table: t, suite: suiteOf(t, ['new.spec.ts']), changed: ['e2e/new.spec.ts'], today: '2026-10-12' });
  assert.equal(estimate.details[0].now, 0.5, 'before any run the median stands in');
});

test('exception lines parse from the work spec section and nothing else', () => {
  const md = [
    '# Spec', '', '## Budget exceptions', '',
    '- e2e/editor-foo.spec.ts: 3.4 min, protects the saved graphic reopening as it was, expires 2026-11-10',
    '- `e2e/bar.spec.ts`: 1 min, protects the take, expires 2026-11-01',
    '- e2e/bad.spec.ts: three minutes, protects nothing, expires soon',
    '', '## Test maintenance', '', '- e2e/not-an-exception.spec.ts: 9 min, protects x, expires 2026-11-01',
  ].join('\n');
  assert.deepEqual(parseExceptions(md).map((e) => [e.spec, e.minutes, e.expires]), [['e2e/editor-foo.spec.ts', 3.4, '2026-11-10'], ['e2e/bar.spec.ts', 1, '2026-11-01']]);
  assert.deepEqual(parseExceptions('# nothing here'), []);
});

test('the summary keeps execution, runner minutes and wall clock apart', () => {
  const t = table(100);
  const r = assess({ table: t, suite: suiteOf(t, ['new.spec.ts']), changed: ['e2e/new.spec.ts'], today: '2026-10-12' });
  const text = summarize(r, { runnerMinutes: 42.5, wallMinutes: 9.1 });
  assert.match(text, /Execution: 101\.0 of 213\.4 table-minutes/);
  assert.match(text, /Runner minutes of this run: 42\.5/);
  assert.match(text, /Wall clock of this run so far: 9\.1 min/);
  assert.match(text, /\| `new\.spec\.ts` \| - \| 1\.00 \| \+1\.00 \|/);
});
