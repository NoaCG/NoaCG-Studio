// Which ref answers "has this landed?", in both directions and with no remote at all.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { mainRef } from './main-ref.mjs';

/** A git runner that answers from a script of [args-joined, ok] pairs. */
const runner = (answers) => (args) => ({ ok: answers[args.join(' ')] ?? false });

test('origin/main wins whenever the local branch is behind it - the state under the merge queue', () => {
  const run = runner({
    'rev-parse --verify --quiet origin/main': true,
    'rev-parse --verify --quiet main': true,
    'merge-base --is-ancestor main origin/main': true,
  });
  assert.equal(mainRef(run), 'origin/main');
});

test('the local branch wins when it is not behind, so nothing changes for a checkout that keeps up', () => {
  const run = runner({
    'rev-parse --verify --quiet origin/main': true,
    'rev-parse --verify --quiet main': true,
    'merge-base --is-ancestor main origin/main': false,
  });
  assert.equal(mainRef(run), 'main');
});

test('no local branch answers origin/main, because a CI checkout of a feature branch has none', () => {
  // `actions/checkout` creates a branch only for the ref it checked out. The containment test then
  // fails because one side is missing, and naming the missing side would refuse every git command.
  const run = runner({ 'rev-parse --verify --quiet origin/main': true });
  assert.equal(mainRef(run), 'origin/main');
});

test('no remote-tracking ref falls back to the local name, because a ref that does not exist answers nothing', () => {
  assert.equal(mainRef(runner({})), 'main');
});

test('the branch name is a parameter, so this is not hardcoded to one default branch', () => {
  const run = runner({
    'rev-parse --verify --quiet origin/trunk': true,
    'rev-parse --verify --quiet trunk': true,
    'merge-base --is-ancestor trunk origin/trunk': true,
  });
  assert.equal(mainRef(run, 'trunk'), 'origin/trunk');
});

test('an async runner is answered asynchronously, so a caller using promises needs no second helper', async () => {
  // Every step answered, so this exercises the full chain rather than an early exit.
  const run = (args) => Promise.resolve({ ok: {
    'rev-parse --verify --quiet origin/main': true,
    'rev-parse --verify --quiet main': true,
    'merge-base --is-ancestor main origin/main': true,
  }[args.join(' ')] ?? false });
  assert.equal(await mainRef(run), 'origin/main');
});
