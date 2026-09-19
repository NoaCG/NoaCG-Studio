// The watcher's reading of a pull request in the merge queue, pinned in every direction.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { watchVerdict } from './land-watch.mjs';

const open = (over = {}) => ({ state: 'OPEN', mergedAt: null, mergeCommit: null, headRefOid: 'abc', autoMergeRequest: { enabledAt: 'x' }, ...over });

test('an open pull request with auto-merge on, or a queue entry, is waiting; no answer from gh is waiting too', () => {
  assert.deepEqual(watchVerdict(open()), { verdict: 'waiting' });
  assert.deepEqual(watchVerdict(open({ autoMergeRequest: null, mergeQueueEntry: { state: 'AWAITING_CHECKS', position: 1 } })), { verdict: 'waiting' }, 'the queue clears the auto-merge request when it takes the pull request');
  assert.deepEqual(watchVerdict(null), { verdict: 'waiting' });
  assert.deepEqual(watchVerdict(open({ state: 'MERGED', merged: true, mergeCommit: { oid: 'm9' } })), { verdict: 'landed', sha: 'm9' });
});

test('a merged pull request landed, at its merge commit or its head', () => {
  assert.deepEqual(watchVerdict(open({ state: 'MERGED', mergedAt: 'x', mergeCommit: { oid: 'm1' } })), { verdict: 'landed', sha: 'm1' });
  assert.deepEqual(watchVerdict(open({ state: 'MERGED', mergedAt: 'x' })), { verdict: 'landed', sha: 'abc' });
});

test('a conflicting pull request is a refusal even while its auto-merge request stands', () => {
  const verdict = watchVerdict(open({ mergeable: 'CONFLICTING' }));
  assert.equal(verdict.verdict, 'refused');
  assert.match(verdict.reason, /conflicts with main/);
  assert.deepEqual(watchVerdict(open({ mergeable: 'MERGEABLE' })), { verdict: 'waiting' });
  assert.deepEqual(watchVerdict(open({ mergeable: 'UNKNOWN' })), { verdict: 'waiting' }, 'GitHub has not computed it yet');
});

test('a failed gate on the pull request is a refusal while its auto-merge request still stands', () => {
  const red = { name: 'CI gate', status: 'COMPLETED', conclusion: 'FAILURE' };
  const shard = { name: 'E2E 3/9 (subset)', status: 'COMPLETED', conclusion: 'FAILURE' };
  const verdict = watchVerdict(open(), [shard, shard, red, red, { name: 'Build', status: 'COMPLETED', conclusion: 'SUCCESS' }]);
  assert.equal(verdict.verdict, 'refused');
  assert.equal(verdict.reason, 'E2E 3/9 (subset), CI gate failed on the pull request, so the queue never took it');
  // One of the two runs still going, or green, is not a verdict: GitHub reads the newest.
  assert.deepEqual(watchVerdict(open(), [red, { name: 'CI gate', status: 'IN_PROGRESS', conclusion: '' }]), { verdict: 'waiting' });
  assert.deepEqual(watchVerdict(open(), [red, { name: 'CI gate', status: 'COMPLETED', conclusion: 'SUCCESS' }]), { verdict: 'waiting' });
  // A red shard with no gate verdict yet is still waiting, and so is a gate nobody has reported.
  assert.deepEqual(watchVerdict(open(), [shard]), { verdict: 'waiting' });
  assert.deepEqual(watchVerdict(open(), []), { verdict: 'waiting' });
  // Inside the queue the pull request's own checks are history; the merge group decides.
  assert.deepEqual(watchVerdict(open({ mergeQueueEntry: { state: 'AWAITING_CHECKS', position: 1 } }), [red]), { verdict: 'waiting' });
});

test('auto-merge off without a merge is a refusal, naming the failed checks when there are any', () => {
  const checks = [{ name: 'CI gate', conclusion: 'FAILURE' }, { name: 'Build', conclusion: 'SUCCESS' }, { context: 'noacg/reviewed', state: 'SUCCESS' }];
  assert.deepEqual(watchVerdict(open({ autoMergeRequest: null }), checks), { verdict: 'refused', reason: 'CI gate failed on the pull request' });
  assert.match(watchVerdict(open({ autoMergeRequest: null }), []).reason, /open and no longer queued for auto-merge/);
  assert.match(watchVerdict(open({ state: 'CLOSED', autoMergeRequest: null }), []).reason, /closed and no longer queued/);
});

test('a branch pushed after it was declared finished is refused, and a merge still outranks the pin', () => {
  // The pin is written by `add-merge` as `--expect-sha <tip>`, and it is what `requeue` re-reads to
  // refuse a declaration the branch has moved past. GitHub refuses the same pull request anyway,
  // because `noacg/reviewed` is a required check posted on the exact tip and a commit status cannot
  // follow a new commit - this only says so on the first tick rather than leaving a reader to work
  // out which check went missing and why.
  const moved = watchVerdict(open({ headRefOid: 'def' }), [], { expectSha: 'abc' });
  assert.equal(moved.verdict, 'refused');
  assert.match(moved.reason, /moved after it was declared finished/);
  assert.match(moved.reason, /abc -> def/);

  // The pin holding is not a verdict of its own - the watcher goes on waiting.
  assert.deepEqual(watchVerdict(open(), [], { expectSha: 'abc' }), { verdict: 'waiting' });
  // An unpinned job (queued before the pin was written) is unaffected.
  assert.deepEqual(watchVerdict(open({ headRefOid: 'def' })), { verdict: 'waiting' });
  // WHAT LANDED, LANDED. A merged pull request is answered before the pin, or a landing that raced
  // a push would be reported as a refusal and re-queued.
  assert.equal(
    watchVerdict(open({ state: 'MERGED', mergedAt: 'x', headRefOid: 'def' }), [], { expectSha: 'abc' }).verdict,
    'landed',
  );
});
