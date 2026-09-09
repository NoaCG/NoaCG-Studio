// The wait the `Reviewed` job does, pinned. The sequence every session performs - push the tip,
// then queue it - posts the review status up to a minute after the run that reads it starts, so
// the check has to be a bounded wait rather than one look. What matters here is that the wait
// ends both ways: green the moment the status lands, and RED at the bound when nothing is coming.
//
// `scripts/gates.mjs` globs `scripts/**/*.test.mjs`, so this runs in `npm run build` with no
// entry in package.json.
import assert from 'node:assert/strict';
import test from 'node:test';

import { DEFAULT_WAIT_MS, pullRequestNumberFromGroupRef, readReviewStatus, resolveSha, waitForReviewStatus, waitMsFrom } from './reviewed-status.mjs';

/** A clock and a sleeper that cost no time: `sleep` just advances the fake clock. */
function fakeClock() {
  let ms = 0;
  return { now: () => ms, sleep: async (by) => { ms += by; } };
}

/** A reader that answers `missing` a given number of times and then `success`. */
function readerMissingFor(polls) {
  let seen = 0;
  return () => (seen++ < polls ? { state: 'missing', description: '' } : { state: 'success', description: 'reviewed by /check at abc1234 (pass)' });
}

test('a status posted while the job is waiting turns the check green', async () => {
  const { now, sleep } = fakeClock();
  const status = await waitForReviewStatus({ read: readerMissingFor(11), timeoutMs: 150_000, intervalMs: 5_000, now, sleep });
  assert.equal(status.state, 'success');
  // Fifty-five seconds is the gap measured on pull request #174, the shape this fix exists for.
  assert.equal(status.waitedMs, 55_000);
  assert.equal(status.polls, 12);
});

test('a status already there is answered on the first poll, with no wait at all', async () => {
  const { now, sleep } = fakeClock();
  const status = await waitForReviewStatus({ read: readerMissingFor(0), timeoutMs: 150_000, intervalMs: 5_000, now, sleep });
  assert.equal(status.state, 'success');
  assert.equal(status.waitedMs, 0);
  assert.equal(status.polls, 1);
});

test('a tip nobody ever stamps still goes red, at the bound', async () => {
  const { now, sleep } = fakeClock();
  let polls = 0;
  const status = await waitForReviewStatus({
    read: () => { polls += 1; return { state: 'missing', description: '' }; },
    timeoutMs: 30_000,
    intervalMs: 5_000,
    now,
    sleep,
  });
  assert.equal(status.state, 'missing');
  // The bound is honoured rather than overshot: six polls across thirty seconds, then the verdict.
  assert.equal(status.waitedMs, 30_000);
  assert.equal(polls, 7);
});

test('a status that says failure is not waited on - waiting cannot change it', async () => {
  const { now, sleep } = fakeClock();
  const status = await waitForReviewStatus({
    read: () => ({ state: 'failure', description: 'no' }),
    timeoutMs: 150_000,
    intervalMs: 5_000,
    now,
    sleep,
  });
  assert.equal(status.state, 'failure');
  assert.equal(status.polls, 1);
});

test('a pending status keeps the wait going', async () => {
  const { now, sleep } = fakeClock();
  let seen = 0;
  const status = await waitForReviewStatus({
    read: () => (seen++ === 0 ? { state: 'pending', description: '' } : { state: 'success', description: '' }),
    timeoutMs: 150_000,
    intervalMs: 5_000,
    now,
    sleep,
  });
  assert.equal(status.state, 'success');
  assert.equal(status.polls, 2);
});

test('a poll that fails is retried, not treated as an answer - one 502 must not be a red', async () => {
  const { now, sleep } = fakeClock();
  let seen = 0;
  const status = await waitForReviewStatus({
    read: () => {
      seen += 1;
      if (seen <= 2) throw new Error('gh api failed: HTTP 502');
      return { state: 'success', description: '' };
    },
    timeoutMs: 150_000,
    intervalMs: 5_000,
    now,
    sleep,
  });
  assert.equal(status.state, 'success');
  assert.equal(status.polls, 3);
});

test('a gh that never answers ends as `unreadable`, which is a different verdict from `missing`', async () => {
  const { now, sleep } = fakeClock();
  const lines = [];
  const status = await waitForReviewStatus({
    read: () => { throw new Error('gh api failed: could not resolve host\nsecond line'); },
    timeoutMs: 20_000,
    intervalMs: 5_000,
    now,
    sleep,
    log: (line) => lines.push(line),
  });
  assert.equal(status.state, 'unreadable');
  assert.equal(status.description, 'gh api failed: could not resolve host');
  assert.equal(status.waitedMs, 20_000);
  assert.match(lines[0], /still unreadable \(gh api failed: could not resolve host\) after 5s of 20s/);
});

test('the bound falls back to the default when the environment sets nonsense, so the wait is always bounded', () => {
  assert.equal(waitMsFrom({}), DEFAULT_WAIT_MS);
  assert.equal(waitMsFrom({ REVIEW_WAIT_SECONDS: 'abc' }), DEFAULT_WAIT_MS);
  assert.equal(waitMsFrom({ REVIEW_WAIT_SECONDS: '0' }), DEFAULT_WAIT_MS);
  assert.equal(waitMsFrom({ REVIEW_WAIT_SECONDS: '-5' }), DEFAULT_WAIT_MS);
  assert.equal(waitMsFrom({ REVIEW_WAIT_SECONDS: '12' }), 12_000);
});

test('a merge group reads the pull request number off its head ref', () => {
  assert.equal(pullRequestNumberFromGroupRef('gh-readonly-queue/main/pr-192-ae5a32b9'), 192);
  assert.equal(pullRequestNumberFromGroupRef('refs/heads/claude/k-reviewed-gate-race'), null);
  assert.equal(pullRequestNumberFromGroupRef(undefined), null);
});

test('the sha comes from the event: the pull request head, the group\'s pull request, or the dispatched tip', () => {
  assert.equal(resolveSha({ EVENT: 'pull_request', PR_HEAD: 'a'.repeat(40), GITHUB_SHA: 'b'.repeat(40) }), 'a'.repeat(40));
  assert.equal(resolveSha({ EVENT: 'workflow_dispatch', PR_HEAD: '', GITHUB_SHA: 'b'.repeat(40) }), 'b'.repeat(40));
  const calls = [];
  const sha = resolveSha({ EVENT: 'merge_group', GROUP_REF: 'gh-readonly-queue/main/pr-7-abc', GITHUB_REPOSITORY: 'o/r' }, (args) => {
    calls.push(args.join(' '));
    return 'c'.repeat(40);
  });
  assert.equal(sha, 'c'.repeat(40));
  assert.equal(calls[0], 'pr view 7 --repo o/r --json headRefOid --jq .headRefOid');
  assert.throws(() => resolveSha({ EVENT: 'merge_group', GROUP_REF: 'nonsense' }, () => ''), /cannot read a pull request number/);
});

test('an absent status reads as missing rather than throwing, because absent is the answer mid-landing', () => {
  assert.deepEqual(readReviewStatus('abc', 'o/r', () => '{}'), { state: 'missing', description: '' });
  assert.deepEqual(readReviewStatus('abc', 'o/r', () => ''), { state: 'missing', description: '' });
  assert.deepEqual(
    readReviewStatus('abc', 'o/r', () => '{"state":"success","description":"reviewed by /check at abc (pass)"}'),
    { state: 'success', description: 'reviewed by /check at abc (pass)' },
  );
});
