// The watcher's reading of a pull request in the merge queue, pinned in every direction.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { watchVerdict } from './land-watch.mjs';

const open = (over = {}) => ({ state: 'OPEN', mergedAt: null, mergeCommit: null, headRefOid: 'abc', autoMergeRequest: { enabledAt: 'x' }, ...over });

test('an open pull request with auto-merge on is waiting in the queue; no answer from gh is waiting too', () => {
  assert.deepEqual(watchVerdict(open()), { verdict: 'waiting' });
  assert.deepEqual(watchVerdict(null), { verdict: 'waiting' });
});

test('a merged pull request landed, at its merge commit or its head', () => {
  assert.deepEqual(watchVerdict(open({ state: 'MERGED', mergedAt: 'x', mergeCommit: { oid: 'm1' } })), { verdict: 'landed', sha: 'm1' });
  assert.deepEqual(watchVerdict(open({ state: 'MERGED', mergedAt: 'x' })), { verdict: 'landed', sha: 'abc' });
});

test('auto-merge off without a merge is a refusal, naming the failed checks when there are any', () => {
  const checks = [{ name: 'CI gate', conclusion: 'FAILURE' }, { name: 'Build', conclusion: 'SUCCESS' }, { context: 'noacg/reviewed', state: 'SUCCESS' }];
  assert.deepEqual(watchVerdict(open({ autoMergeRequest: null }), checks), { verdict: 'refused', reason: 'CI gate failed on the pull request' });
  assert.match(watchVerdict(open({ autoMergeRequest: null }), []).reason, /open and no longer queued for auto-merge/);
  assert.match(watchVerdict(open({ state: 'CLOSED', autoMergeRequest: null }), []).reason, /closed and no longer queued/);
});
