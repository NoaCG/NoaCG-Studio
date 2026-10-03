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

const all = (n) => Array.from({ length: n }, (_, i) => i + 1);
// The plan's assignment as ci.yml hands it over: planner names, one list per shard.
const bins = [['a.spec.ts', 'b.spec.ts'], ['c.spec.ts'], ['d.spec.ts', 'e.spec.ts']];

test('the retry runs the failed files when every shard reported and none of them is the change\'s own', () => {
  assert.deepEqual(retryPlan({ failed: ['e2e/a.spec.ts'], reported: all(9), shards: 9, changed: ['src/x.ts'] }), { ok: true, specs: ['e2e/a.spec.ts'], unreported: [], dead: [] });
  assert.equal(retryPlan({ failed: ['e2e/a.spec.ts'], reported: all(3), shards: 0 }).ok, true, 'an unknown shard count cannot refuse');
});

test('a shard that left no report has its assigned files run, as unreported and never as failed', () => {
  // Runs 37096120413 and 37118148332: one shard failed e2e/layout.spec.ts, another died at the cap.
  const plan = retryPlan({ failed: ['e2e/c.spec.ts'], reported: [1, 2], shards: 3, shardSpecs: bins });
  assert.deepEqual(plan, { ok: true, specs: ['e2e/c.spec.ts'], unreported: ['e2e/d.spec.ts', 'e2e/e.spec.ts'], dead: [3] });
});

test('a dead shard with no failing spec anywhere still gets its files run, and nothing is named a flake', () => {
  const plan = retryPlan({ failed: [], reported: [2, 3], shards: 3, shardSpecs: bins });
  assert.deepEqual(plan, { ok: true, specs: [], unreported: ['e2e/a.spec.ts', 'e2e/b.spec.ts'], dead: [1] });
});

test('more than one dead shard refuses: one second run cannot hold several runners\' files', () => {
  const plan = retryPlan({ failed: ['e2e/c.spec.ts'], reported: [2], shards: 3, shardSpecs: bins });
  assert.equal(plan.ok, false);
  assert.match(plan.reason, /2 of 3 shards uploaded no report \(1, 3\)/);
  assert.equal(retryPlan({ failed: [], reported: [], shards: 3, shardSpecs: bins }).ok, false, 'and no report at all');
});

test('a dead shard the plan does not name refuses: its files cannot be re-run', () => {
  for (const shardSpecs of [null, [], [['a.spec.ts'], ['c.spec.ts'], []]]) {
    const plan = retryPlan({ failed: ['e2e/a.spec.ts'], reported: [1, 2], shards: 3, shardSpecs });
    assert.equal(plan.ok, false);
    assert.match(plan.reason, /shard 3 uploaded no report and the plan does not name its files/);
  }
});

test('no failing spec and no dead shard refuses: there is nothing to re-run and the failure was not a test', () => {
  const plan = retryPlan({ failed: [], reported: all(9), shards: 9 });
  assert.equal(plan.ok, false);
  assert.match(plan.reason, /nothing to re-run/);
});

test('a failing spec the change itself edits refuses: that flake is the change\'s, not the suite\'s', () => {
  const plan = retryPlan({ failed: ['e2e/a.spec.ts', 'e2e/b.spec.ts'], reported: all(9), shards: 9, changed: ['e2e/b.spec.ts', 'src/y.ts'] });
  assert.equal(plan.ok, false);
  assert.match(plan.reason, /e2e\/b\.spec\.ts failed and this change edits it/);
});

test('a dead shard does not lift the edited-spec refusal for a spec that failed beside it', () => {
  const plan = retryPlan({ failed: ['e2e/c.spec.ts'], reported: [1, 2], shards: 3, shardSpecs: bins, changed: ['e2e/c.spec.ts'] });
  assert.equal(plan.ok, false);
  assert.match(plan.reason, /e2e\/c\.spec\.ts failed and this change edits it/);
});
