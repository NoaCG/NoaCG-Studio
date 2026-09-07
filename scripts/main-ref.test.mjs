// Which ref answers "has this landed?", in both directions and with no remote at all.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { mainRef } from './main-ref.mjs';

/** A git runner that answers from a script of [args-joined, ok] pairs. */
const runner = (answers) => (args) => ({ ok: answers[args.join(' ')] ?? false });

test('origin/main wins whenever the local branch is behind it - the state under the merge queue', () => {
  const run = runner({
    'rev-parse --verify --quiet origin/main': true,
    'merge-base --is-ancestor main origin/main': true,
  });
  assert.equal(mainRef(run), 'origin/main');
});

test('the local branch wins when it is not behind, so nothing changes for a checkout that keeps up', () => {
  const run = runner({
    'rev-parse --verify --quiet origin/main': true,
    'merge-base --is-ancestor main origin/main': false,
  });
  assert.equal(mainRef(run), 'main');
});

test('no remote-tracking ref falls back to the local name, because a ref that does not exist answers nothing', () => {
  assert.equal(mainRef(runner({})), 'main');
});

test('the branch name is a parameter, so this is not hardcoded to one default branch', () => {
  const run = runner({
    'rev-parse --verify --quiet origin/trunk': true,
    'merge-base --is-ancestor trunk origin/trunk': true,
  });
  assert.equal(mainRef(run, 'trunk'), 'origin/trunk');
});

test('an async runner is answered asynchronously, so a caller using promises needs no second helper', async () => {
  const run = (args) => Promise.resolve({ ok: {
    'rev-parse --verify --quiet origin/main': true,
    'merge-base --is-ancestor main origin/main': true,
  }[args.join(' ')] ?? false });
  assert.equal(await mainRef(run), 'origin/main');
});
