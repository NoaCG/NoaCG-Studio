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
// a main push whose last commit with a verdict was green and whose failure survived a real second
// run, and every refusal names its reason so the issue can carry it.
import { lastVerdictBefore, shouldRevert } from './red-main-issue.mjs';

const MAIN = { event: 'push', ref: 'refs/heads/main' };
const GREEN = { sha: 'g'.repeat(40), conclusion: 'success' };
const RED = { sha: 'r'.repeat(40), conclusion: 'failure' };
const SPEC = ['e2e/x.spec.ts'];

test('a main push whose specs failed twice, after a green verdict, is reverted from that verdict', () => {
  const decision = shouldRevert({ ...MAIN, items: SPEC, retry: 'failure', retried: 1, previous: GREEN });
  assert.equal(decision.revert, true);
  assert.equal(decision.since, GREEN.sha);
  assert.equal(shouldRevert({ ...MAIN, items: ['job: Build'], rerun: 'failure', previous: GREEN }).revert, true, 'a build that failed again on its re-run is a break');
});

// A FAILURE THAT WAS NEVER A SPEC IS NOT DETERMINISTIC ON ITS OWN. The rule used to say it was, and
// run 34537651787 refuted it: on e06cd2d4 (2026-09-10 22:34 UTC) one unit test out of 1592 failed
// inside the Build job, a re-run of the identical tree was green, and the rule had already opened
// pull request 246 reverting a whole landed row with auto-merge on. It was closed only because
// somebody happened to be awake. So a failed Build or Factory job gets one re-run on the same
// commit, exactly as a failed spec does, and only a second failure is evidence.
test('a Build failure that passes when re-run on the same commit is a flake, not a revert', () => {
  const decision = shouldRevert({ ...MAIN, items: ['job: Build'], retry: 'skipped', rerun: 'success', previous: GREEN });
  assert.equal(decision.revert, false);
  assert.match(decision.reason, /passed when it was re-run/);
});

test('a Build failure that never got its re-run reverts nothing', () => {
  for (const rerun of ['skipped', 'cancelled']) {
    const decision = shouldRevert({ ...MAIN, items: ['job: Build'], rerun, previous: GREEN });
    assert.equal(decision.revert, false, rerun);
    assert.match(decision.reason, /never got a second run/, rerun);
  }
});

test('a build break that fails twice still reverts - the re-run must not become "never revert"', () => {
  for (const items of [['job: Build'], ['job: Factory gates'], ['job: Build', 'job: Factory gates']]) {
    const decision = shouldRevert({ ...MAIN, items, retry: 'skipped', rerun: 'failure', previous: GREEN });
    assert.equal(decision.revert, true, items.join(', '));
    assert.equal(decision.since, GREEN.sha);
    assert.match(decision.reason, /survived a second run/);
  }
});

test('a flake on one side never shields a break confirmed on the other', () => {
  // Until 2026-09-11 a spec retry that passed returned "flake" before the build was looked at, so a
  // real build break landing beside a flaky spec was never reverted.
  const both = ['e2e/x.spec.ts', 'job: Build'];
  assert.equal(shouldRevert({ ...MAIN, items: both, retry: 'success', rerun: 'failure', previous: GREEN }).revert, true, 'build broke twice, spec was a flake');
  assert.equal(shouldRevert({ ...MAIN, items: both, retry: 'failure', retried: 1, rerun: 'success', previous: GREEN }).revert, true, 'specs broke twice, build was a flake');
  const neither = shouldRevert({ ...MAIN, items: both, retry: 'success', rerun: 'success', previous: GREEN });
  assert.equal(neither.revert, false, 'both flaked');
  assert.match(neither.reason, /flake/);
});

test('a run that names no failure at all has nothing confirmed, so nothing is reverted', () => {
  assert.equal(shouldRevert({ ...MAIN, items: [], rerun: 'skipped', previous: GREEN }).revert, false);
});

test('the last verdict is looked up only once the cheap rules have passed', () => {
  let asked = 0;
  const previous = () => {
    asked += 1;
    return GREEN;
  };
  assert.equal(shouldRevert({ ...MAIN, items: SPEC, retry: 'success', previous }).revert, false);
  assert.equal(asked, 0);
  assert.equal(shouldRevert({ ...MAIN, items: SPEC, retry: 'failure', retried: 2, previous }).revert, true);
  assert.equal(asked, 1);
});

test('every other case refuses with a reason', () => {
  const cases = [
    [{ ...MAIN, event: 'merge_group', items: SPEC, retry: 'failure', retried: 1, previous: GREEN }, /not a push to main/],
    [{ ...MAIN, ref: 'refs/heads/topic', items: SPEC, retry: 'failure', retried: 1, previous: GREEN }, /not a push to main/],
    [{ ...MAIN, items: SPEC, exhausted: true, previous: GREEN }, /no verdict/],
    [{ ...MAIN, items: SPEC, retry: 'success', previous: GREEN }, /flake/],
    [{ ...MAIN, items: SPEC, retry: 'skipped', previous: GREEN }, /never got a second run/],
    [{ ...MAIN, items: SPEC, retry: 'cancelled', previous: GREEN }, /never got a second run/],
    [{ ...MAIN, items: ['job: E2E shard'], retry: 'failure', retried: 0, previous: GREEN }, /re-ran nothing/],
    [{ ...MAIN, items: SPEC, retry: 'failure', retried: 1, previous: RED }, /already red at rrrrrrr/],
    [{ ...MAIN, items: SPEC, retry: 'failure', retried: 1, previous: { sha: null, conclusion: 'unknown' } }, /no earlier main commit has a verdict/],
  ];
  for (const [input, reason] of cases) {
    const decision = shouldRevert(input);
    assert.equal(decision.revert, false, JSON.stringify(input));
    assert.match(decision.reason, reason, JSON.stringify(input));
  }
});

test('the last verdict is the nearest first-parent ancestor a completed push run judged, not the newest run', () => {
  const runs = [
    { head_sha: 'later', conclusion: 'success' }, // a landing AFTER the one being judged, finished first
    { head_sha: 'skip', conclusion: 'cancelled' }, // superseded, no verdict
    { head_sha: 'prev', conclusion: 'failure' },
    { head_sha: 'older', conclusion: 'success' },
  ];
  const gh = () => runs;
  const git = () => ['skip', 'prev', 'older'];
  assert.deepEqual(lastVerdictBefore({ repo: 'o/r', sha: 'red', gh, git }), { sha: 'prev', conclusion: 'failure' });
  assert.deepEqual(lastVerdictBefore({ repo: 'o/r', sha: 'red', gh, git: () => ['skip', 'nothing'] }), { sha: null, conclusion: 'unknown' });
  assert.deepEqual(lastVerdictBefore({ repo: '', sha: 'red', gh, git }), { sha: null, conclusion: 'unknown' });
});

test('the body names the revert, or the reason there is none, and says what the second run was', () => {
  const queued = issueBody({ sha: SHA, runUrl: 'u', items: SPEC, hash: HASH, retry: 'failure', retried: 1, revert: { status: 'queued', url: 'https://github.com/o/r/pull/80' } });
  assert.match(queued, /1 failed spec file\(s\) were re-run once on this same commit and failed again/);
  assert.match(queued, /Reverting the batch: https:\/\/github\.com\/o\/r\/pull\/80/);
  const refused = issueBody({ sha: SHA, runUrl: 'u', items: ['job: E2E shard'], hash: HASH, retry: 'failure', retried: 0, revert: { status: 'skipped', reason: 'the retry job re-ran nothing' } });
  assert.match(refused, /could not re-run the failed specs/);
  const skipped = issueBody({ sha: SHA, runUrl: 'u', items: ['job: Build'], hash: HASH, retry: 'skipped', revert: { status: 'skipped', reason: 'main was already red' } });
  assert.match(skipped, /Not reverted automatically: main was already red/);
  assert.match(skipped, /No second run/);
  assert.ok(!/refuses to merge onto it/.test(skipped), 'the queue no longer refuses on a red main; the body must not claim it does');
});
