// Which files the retry re-runs, read off a Playwright JSON report, and the three refusals that
// keep a green retry honest. The report shape is the reporter's (suites nest, specs carry tests,
// tests carry a final `status`), and the two traps e2e/AGENTS.md names are the cases: `ok` says
// nothing about a skipped spec, and a spec that passed after a retry is `flaky`, not `unexpected`.
import assert from 'node:assert/strict';
import test from 'node:test';

import { failedSpecFiles, retryPlan } from './e2e-retry.mjs';

const spec = (file, status) => ({ file, ok: status === 'expected', tests: [{ status }] });

test('only specs whose final verdict is unexpected are named, once per file, sorted', () => {
  const report = {
    suites: [
      { file: 'e2e/b.spec.ts', specs: [spec('e2e/b.spec.ts', 'unexpected'), spec('e2e/b.spec.ts', 'expected')] },
      { file: 'e2e/a.spec.ts', specs: [spec('e2e/a.spec.ts', 'expected')], suites: [{ file: 'e2e/a.spec.ts', specs: [spec('e2e/a.spec.ts', 'unexpected')] }] },
      { file: 'e2e/c.spec.ts', specs: [spec('e2e/c.spec.ts', 'skipped'), spec('e2e/c.spec.ts', 'flaky')] },
    ],
  };
  assert.deepEqual(failedSpecFiles(report), ['e2e/a.spec.ts', 'e2e/b.spec.ts']);
});

test('paths are normalized to the repo-relative e2e/ form whatever the reporter wrote, and a spec with no file is skipped', () => {
  const report = { suites: [{ file: 'e2e\\x.spec.ts', specs: [spec('e2e\\x.spec.ts', 'unexpected')] }, { file: 'y.spec.ts', specs: [{ tests: [{ status: 'unexpected' }] }] }, { specs: [{ tests: [{ status: 'unexpected' }] }] }] };
  assert.deepEqual(failedSpecFiles(report), ['e2e/x.spec.ts', 'e2e/y.spec.ts']);
});

test('an empty or malformed report names nothing rather than crashing', () => {
  assert.deepEqual(failedSpecFiles({}), []);
  assert.deepEqual(failedSpecFiles({ suites: [{}] }), []);
  assert.deepEqual(failedSpecFiles(null), []);
});

test('the retry runs the failed files when every shard reported and none of them is the change\'s own', () => {
  assert.deepEqual(retryPlan({ failed: ['e2e/a.spec.ts'], reports: 9, shards: 9, changed: ['src/x.ts'] }), { ok: true, specs: ['e2e/a.spec.ts'] });
  assert.equal(retryPlan({ failed: ['e2e/a.spec.ts'], reports: 3, shards: 0 }).ok, true, 'an unknown shard count cannot refuse');
});

test('a missing shard report refuses: the files of the shard that died never ran on this commit', () => {
  const plan = retryPlan({ failed: ['e2e/a.spec.ts'], reports: 8, shards: 9 });
  assert.equal(plan.ok, false);
  assert.match(plan.reason, /8 of 9 shards/);
});

test('no failing spec refuses: there is nothing to re-run and the failure was not a test', () => {
  const plan = retryPlan({ failed: [], reports: 9, shards: 9 });
  assert.equal(plan.ok, false);
  assert.match(plan.reason, /nothing to re-run/);
});

test('a failing spec the change itself edits refuses: that flake is the change\'s, not the suite\'s', () => {
  const plan = retryPlan({ failed: ['e2e/a.spec.ts', 'e2e/b.spec.ts'], reports: 9, shards: 9, changed: ['e2e/b.spec.ts', 'src/y.ts'] });
  assert.equal(plan.ok, false);
  assert.match(plan.reason, /e2e\/b\.spec\.ts failed and this change edits it/);
});
