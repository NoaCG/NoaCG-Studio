// The dedup that must never become a silence. Both halves of the owner's constraint, stated on
// 2026-08-29, are asserted here: repeats of a reported problem stop arriving, and anything new -
// including anything this gate could not classify - always speaks up.

import assert from 'node:assert/strict';
import test from 'node:test';

import { issueBody, marker, planRedMainComment } from './red-main-issue.mjs';

const HASH = 'abc123def456';
const OTHER = '0f0f0f0f0f0f';
const SHA = 'a'.repeat(40);

test('the first red-main run files the issue', () => {
  const decision = planRedMainComment({ existing: null, sha: SHA, hash: HASH });
  assert.equal(decision.action, 'create');
});

test('a repeat of the SAME failure set comments nothing', () => {
  // The whole point: 27 identical reports of e2e/anim-engine.spec.ts across 25 runs, because each
  // landing was a new commit and the old rule deduped on the commit.
  const decision = planRedMainComment({
    existing: 12,
    bodies: ['first report', `Still red. ${marker(HASH)}`],
    sha: SHA,
    hash: HASH,
  });
  assert.equal(decision.action, 'withhold');
  assert.match(decision.reason, /still red/i);
});

test('a NEW spec alongside the familiar one always comments', () => {
  const decision = planRedMainComment({
    existing: 12,
    bodies: [`report ${marker(HASH)}`],
    sha: SHA,
    hash: OTHER,
  });
  assert.equal(decision.action, 'comment');
});

test('an UNKNOWN failure set always comments - never dedups, not even against another unknown', () => {
  const decision = planRedMainComment({
    existing: 12,
    bodies: [`report ${marker('unknown')}`],
    sha: SHA,
    hash: 'unknown',
  });
  assert.equal(decision.action, 'comment');
  assert.match(decision.reason, /could not be identified/);
});

test('only the LATEST word dedups - a set that comes back after something else is news again', () => {
  const decision = planRedMainComment({
    existing: 12,
    bodies: [`first ${marker(HASH)}`, `second ${marker(OTHER)}`],
    sha: SHA,
    hash: HASH,
  });
  assert.equal(decision.action, 'comment');
});

test('the OLD refusal is kept: a re-run of an already-reported commit stays silent', () => {
  // Not weakened by the new rule, and checked FIRST: the same commit failing again is the same
  // event, whatever it failed on.
  const decision = planRedMainComment({
    existing: 12,
    bodies: [`Commit ${SHA} failed CI ${marker(OTHER)}`],
    sha: SHA,
    hash: HASH,
  });
  assert.equal(decision.action, 'withhold');
  assert.match(decision.reason, new RegExp(SHA));
});

test('a fresh issue with no comments yet still dedups against its own body', () => {
  const decision = planRedMainComment({ existing: 12, bodies: [`opened ${marker(HASH)}`], sha: 'b'.repeat(40), hash: HASH });
  assert.equal(decision.action, 'withhold');
});

test('an issue whose bodies could not be read comments rather than assuming silence', () => {
  const decision = planRedMainComment({ existing: 12, bodies: [], sha: SHA, hash: HASH });
  assert.equal(decision.action, 'comment');
});

test('the body names the failing specs and carries the marker the next run reads', () => {
  const body = issueBody({ sha: SHA, runUrl: 'https://example.invalid/1', items: ['e2e/anim-engine.spec.ts'], hash: HASH });
  assert.match(body, /e2e\/anim-engine\.spec\.ts/);
  assert.match(body, new RegExp(SHA));
  assert.ok(body.includes(marker(HASH)));
  // The marker the body carries must be the one a later run's dedup looks for - if these two ever
  // drift, every run comments for ever and the fix silently stops working.
  assert.equal(
    planRedMainComment({ existing: 1, bodies: [body], sha: 'c'.repeat(40), hash: HASH }).action,
    'withhold',
  );
});

// AN ALARM MUST NOT INVENT A FAULT. The rules above are all written against the opposite failure -
// going quiet about a real problem - and they are right. This one guards the other direction, and
// it has its own receipt: issue #52, opened 2026-09-04 against main's tip 09be5a75, saying
// "Failing: something this gate could not name - open the run". Nothing had failed. Four E2E
// shards had been killed at the job's 20-minute cap, which GitHub records as `cancelled`.
test('a run that only ran out of time files nothing, and names the jobs that did not finish', () => {
  const decision = planRedMainComment({
    existing: null,
    sha: 'd'.repeat(40),
    hash: 'unknown',
    exhausted: true,
    cancelled: ['E2E 2/9 (full)', 'E2E 4/9 (full)'],
  });
  assert.equal(decision.action, 'withhold');
  assert.match(decision.reason, /ran out of time/);
  assert.match(decision.reason, /E2E 4\/9 \(full\)/);
  assert.match(decision.reason, /not a pass/, 'withholding the report must not read as approval');
});

test('exhaustion outranks every other rule, including "no issue exists yet"', () => {
  // Checked first on purpose: with an open issue the old code would have COMMENTED (unknown never
  // dedups), and with none it would have CREATED one. Both would be false.
  for (const existing of [null, 7]) {
    const decision = planRedMainComment({ existing, bodies: [], sha: 'e'.repeat(40), hash: 'unknown', exhausted: true, cancelled: ['E2E 1/9 (full)'] });
    assert.equal(decision.action, 'withhold', `existing=${existing}`);
  }
});

test('a genuinely unidentifiable failure still speaks up - exhaustion is a narrow exception', () => {
  // The eyes-open rule the whole file exists for. `exhausted` false means something DID fail, so
  // an unnameable set must comment exactly as it always has.
  const decision = planRedMainComment({ existing: 1, bodies: ['unrelated'], sha: 'f'.repeat(40), hash: 'unknown', exhausted: false });
  assert.equal(decision.action, 'comment');
});

// THE REVERT RULE. A revert changes main, so every way it can be wrong has a case: it fires only on
// a main push whose previous run was green and whose failure survived the second run, and every
// refusal names its reason so the issue can carry it.
import { shouldRevert } from './red-main-issue.mjs';

const MAIN = { event: 'push', ref: 'refs/heads/main', before: 'b'.repeat(40) };

test('a main push that stayed red after the retry, onto a green main, is reverted', () => {
  assert.equal(shouldRevert({ ...MAIN, previous: 'success', retry: 'failure' }).revert, true);
  assert.equal(shouldRevert({ ...MAIN, previous: 'success', retry: 'skipped' }).revert, true, 'a red build had no retry and is still deterministic');
});

test('every other case refuses with a reason', () => {
  const cases = [
    [{ ...MAIN, event: 'merge_group', previous: 'success' }, /not a push to main/],
    [{ ...MAIN, ref: 'refs/heads/topic', previous: 'success' }, /not a push to main/],
    [{ ...MAIN, previous: 'success', exhausted: true }, /no verdict/],
    [{ ...MAIN, before: '0'.repeat(40), previous: 'success' }, /before/],
    [{ ...MAIN, before: '', previous: 'success' }, /before/],
    [{ ...MAIN, previous: 'success', retry: 'success' }, /flake/],
    [{ ...MAIN, previous: 'failure', retry: 'failure' }, /already red/],
    [{ ...MAIN, previous: 'unknown', retry: 'failure' }, /no verdict/],
  ];
  for (const [input, reason] of cases) {
    const decision = shouldRevert(input);
    assert.equal(decision.revert, false, JSON.stringify(input));
    assert.match(decision.reason, reason, JSON.stringify(input));
  }
});

test('the body names the revert, or the reason there is none, and says whether the retry ran', () => {
  const queued = issueBody({ sha: SHA, runUrl: 'u', items: ['e2e/x.spec.ts'], hash: HASH, retry: 'failure', revert: { status: 'queued', url: 'https://github.com/o/r/pull/80' } });
  assert.match(queued, /re-run once on this same commit and failed again/);
  assert.match(queued, /Reverting the batch: https:\/\/github\.com\/o\/r\/pull\/80/);
  const skipped = issueBody({ sha: SHA, runUrl: 'u', items: ['job: Build'], hash: HASH, retry: 'skipped', revert: { status: 'skipped', reason: 'main was already red' } });
  assert.match(skipped, /Not reverted automatically: main was already red/);
  assert.match(skipped, /No second run/);
  assert.ok(!/refuses to merge onto it/.test(skipped), 'the queue no longer refuses on a red main; the body must not claim it does');
});
