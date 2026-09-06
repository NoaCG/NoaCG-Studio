// The watcher's reading of a pull request, pinned in every direction.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { watchVerdict } from './land-watch.mjs';

const open = (over = {}) => ({ state: 'OPEN', mergedAt: null, mergeCommit: null, headRefOid: 'abc', labels: [{ name: 'land' }], ...over });

test('a labelled open pull request is still waiting; no answer from gh is waiting too', () => {
  assert.deepEqual(watchVerdict(open()), { verdict: 'waiting' });
  assert.deepEqual(watchVerdict(null), { verdict: 'waiting' });
});

test('a merged pull request landed, at its merge commit or its head', () => {
  assert.deepEqual(watchVerdict(open({ state: 'MERGED', mergedAt: 'x', mergeCommit: { oid: 'm1' } })), { verdict: 'landed', sha: 'm1' });
  assert.deepEqual(watchVerdict(open({ state: 'MERGED', mergedAt: 'x' })), { verdict: 'landed', sha: 'abc' });
});

test('an open pull request without the label was refused, and the last refusal comment is the reason', () => {
  const comments = [
    { body: 'Landed on main as ...' },
    { body: '**Landing refused**: integrating main (0123abcd) conflicts - resolve it\n\nFix it and queue again.' },
  ];
  assert.deepEqual(watchVerdict(open({ labels: [] }), comments), { verdict: 'refused', reason: 'integrating main (0123abcd) conflicts - resolve it' });
  assert.match(watchVerdict(open({ labels: [] }), []).reason, /open and no longer labelled/);
  assert.match(watchVerdict(open({ state: 'CLOSED', labels: [] }), []).reason, /closed and no longer labelled/);
});
