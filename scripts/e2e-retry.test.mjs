// guards: .github/workflows/ci.yml
// Which files the retry re-runs, read off a Playwright JSON report, and the three refusals that
// keep a green retry honest. The report shape is the reporter's (suites nest, specs carry tests,
// tests carry a final `status`), and the two traps e2e/AGENTS.md names are the cases: `ok` says
// nothing about a skipped spec, and a spec that passed after a retry is `flaky`, not `unexpected`.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';

import { REPORTED_STEPS, failedSpecFiles, retryPlan } from './e2e-retry.mjs';

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

// Run 38153870752 (#1020, #1025): ten shards, ten complete green reports, and shard 5 concluded
// `cancelled` at its 20-minute cap in its post steps, after every step of its own had passed.
// The job list is that run's, as the jobs API gave it (names, conclusions, the steps read).
const tenBins = all(10).map((n) => [`s${n}.spec.ts`]);
const shardSteps = (over = {}) => ['E2E shard', 'Tests left the tree clean', 'Upload shard report', 'Upload failure evidence']
  .map((name) => ({ name, conclusion: over[name] ?? (name === 'Upload failure evidence' ? 'skipped' : 'success') }));
const run38153870752 = () => [
  { name: 'Build', conclusion: 'success', steps: [] },
  ...all(10).map((n) => ({ name: `E2E ${n}/10 (full)`, conclusion: n === 5 ? 'cancelled' : 'success', steps: shardSteps() })),
  { name: 'E2E retry (failed specs, same commit)', conclusion: null, steps: [] },
];
const greenShape = { failed: [], reported: all(10), shards: 10, shardSpecs: tenBins, errors: 0 };

test('run 38153870752: every report in, none failing, a shard cancelled after its upload - green with nothing to re-run, and it says why', () => {
  const plan = retryPlan({ ...greenShape, jobs: run38153870752() });
  assert.equal(plan.ok, true, plan.reason);
  const { reason, ...rest } = plan;
  assert.deepEqual(rest, { ok: true, specs: [], unreported: [], dead: [], capped: [5] });
  assert.match(reason, /all 10 shard reports are in with no failing spec and no run error, and shard 5 was cancelled only after .* nothing to re-run/);
});

test('every report in and none failing still refuses what the reports cannot vouch for', () => {
  const withShard = (n, job) => run38153870752().map((j) => (j.name === `E2E ${n}/10 (full)` ? { ...j, ...job } : j));
  for (const [input, why, said] of [
    [{ jobs: withShard(3, { conclusion: 'failure', steps: shardSteps({ 'Tests left the tree clean': 'failure' }) }) },
      'a shard failed outside its specs: the clean-tree check (#801)', /shard 3 concluded failure without passing "Tests left the tree clean"/],
    [{ jobs: withShard(5, { steps: shardSteps({ 'Tests left the tree clean': 'failure' }) }) },
      'a shard cancelled after its tree check failed, which the aggregate result cannot tell apart', /shard 5 concluded cancelled without passing "Tests left the tree clean"/],
    [{ jobs: withShard(5, { steps: shardSteps({ 'E2E shard': 'cancelled', 'Upload shard report': 'skipped' }) }) },
      'a re-run attempt killed mid-test, the report an earlier attempt\'s', /shard 5 concluded cancelled without passing "E2E shard", "Upload shard report"/],
    [{ jobs: run38153870752(), errors: 1 }, 'a run-level error (a spec file that did not load) names no spec', /1 run-level error/],
    [{ jobs: run38153870752(), errors: null }, 'a report that says nothing of run errors', /says nothing of run-level errors/],
    [{ jobs: null }, 'no job list (a local run, or GitHub did not answer)', /shows 0 of 10 shard jobs/],
    [{ jobs: run38153870752().filter((j) => j.name !== 'E2E 7/10 (full)') }, 'a job list short of a shard', /shows 9 of 10 shard jobs/],
    [{ jobs: run38153870752().map((j) => ({ ...j, conclusion: j.conclusion === 'cancelled' ? 'success' : j.conclusion })) }, 'no shard was cancelled at all', /no shard job was cancelled/],
    [{ jobs: run38153870752(), shards: 0, reported: [] }, 'no shard count', /shows 10 of 0 shard jobs/],
  ]) {
    const plan = retryPlan({ ...greenShape, ...input });
    assert.equal(plan.ok, false, why);
    assert.match(plan.reason, /the failure was not a test/, why);
    assert.match(plan.reason, said, why);
  }
});

test('a failing spec the change itself edits refuses: that flake is the change\'s, not the suite\'s', () => {
  const plan = retryPlan({ failed: ['e2e/a.spec.ts', 'e2e/b.spec.ts'], reported: all(9), shards: 9, changed: ['e2e/b.spec.ts', 'src/y.ts'] });
  assert.equal(plan.ok, false);
  assert.match(plan.reason, /e2e\/b\.spec\.ts failed and this change edits it/);
});

test('a shard cancelled after its report lifts none of the three refusals', () => {
  const jobs = run38153870752();
  assert.match(retryPlan({ failed: [], reported: [2], shards: 3, shardSpecs: bins, jobs, errors: 0 }).reason, /2 of 3 shards uploaded no report/);
  assert.match(retryPlan({ failed: [], reported: [1, 2], shards: 3, shardSpecs: null, jobs, errors: 0 }).reason, /shard 3 uploaded no report and the plan does not name its files/);
  assert.match(retryPlan({ ...greenShape, failed: ['e2e/b.spec.ts'], changed: ['e2e/b.spec.ts'], jobs }).reason, /e2e\/b\.spec\.ts failed and this change edits it/);
});

test('a dead shard does not lift the edited-spec refusal for a spec that failed beside it', () => {
  const plan = retryPlan({ failed: ['e2e/c.spec.ts'], reported: [1, 2], shards: 3, shardSpecs: bins, changed: ['e2e/c.spec.ts'] });
  assert.equal(plan.ok, false);
  assert.match(plan.reason, /e2e\/c\.spec\.ts failed and this change edits it/);
});

// Exercise the workflow's actual expression and shell, so a planner-only pass cannot hide
// a skipped retry or a final gate that still rejects its successful verdict.
const workflow = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const retryIf = workflow.match(/^ {2}e2e-retry:\n[\s\S]*?^ {4}if: \$\{\{ (.*) \}\}$/m)?.[1];
assert.ok(retryIf, 'retry eligibility must be present in the workflow');
const canRetry = (result, event = 'push', ref = 'refs/heads/main', cancelled = false) => runInNewContext(retryIf, {
  cancelled: () => cancelled,
  needs: { e2e: { result } },
  github: { event_name: event, ref },
}, { timeout: 100 });

test('main and merge groups can retry a failed or cancelled matrix, never a manual cancellation', () => {
  for (const result of ['failure', 'cancelled']) {
    assert.equal(canRetry(result), true, result);
    assert.equal(canRetry(result, 'merge_group', 'refs/heads/gh-readonly-queue/main/test'), true, result);
    assert.equal(canRetry(result, 'push', 'refs/heads/main', true), false, 'manual workflow cancellation');
    assert.equal(canRetry(result, 'merge_group', 'refs/heads/gh-readonly-queue/main/test', true), false);
    assert.equal(canRetry(result, 'pull_request', 'refs/pull/1/merge'), false, 'PRs have no retry');
    assert.equal(canRetry(result, 'push', 'refs/heads/topic'), false, 'feature branch pushes have no retry');
  }
  for (const result of ['success', 'skipped']) assert.equal(canRetry(result), false, result);
});

const retryJob = workflow.match(/^ {2}e2e-retry:\n([\s\S]*?)\n {2}# The catalog calibration/m)?.[1];
assert.ok(retryJob, 'the retry job must be present in the workflow');
const stepIf = (body, name) => body.match(new RegExp(`- name: ${name}\\n(?: {8}[^\\n]*\\n)*? {8}if: \\$\\{\\{ (.*) \\}\\}$`, 'm'))?.[1];

test('the retry job can read this run\'s shard jobs, and their names and steps are the ones the green path reads', () => {
  for (const line of [/GH_TOKEN: \$\{\{ github\.token \}\}/, /GH_REPO: \$\{\{ github\.repository \}\}/, /RUN_ID: \$\{\{ github\.run_id \}\}/, /^ {6}actions: read\b/m]) {
    assert.match(retryJob, line);
  }
  const shardJob = workflow.match(/^ {2}e2e:\n([\s\S]*?)\n {2}# THE SECOND RUN/m)?.[1] ?? '';
  assert.match(shardJob, /^ {4}name: E2E \$\{\{ matrix\.shardIndex \}\}\/\$\{\{ matrix\.shardTotal \}\}/m, 'job names read as "E2E <n>/<total>"');
  for (const name of REPORTED_STEPS) assert.match(shardJob, new RegExp(`- name: ${name}\\n`), name);
});

test('with nothing re-run the retry job uploads no report, so its empty verdict exits green', () => {
  const uploadIf = stepIf(retryJob, 'Upload the retry report');
  assert.ok(uploadIf, 'the upload step has a condition');
  const uploads = (second, unreported, cancelled = false) => runInNewContext(uploadIf, {
    cancelled: () => cancelled, steps: { second: { outcome: second }, unreported: { outcome: unreported } },
  }, { timeout: 100 });
  assert.equal(uploads('skipped', 'skipped'), false, 'run 38153870752: nothing ran, nothing to upload');
  for (const [second, unreported] of [['success', 'skipped'], ['failure', 'skipped'], ['skipped', 'success'], ['success', 'failure']]) {
    assert.equal(uploads(second, unreported), true, `${second}/${unreported}`);
  }
  assert.equal(uploads('success', 'skipped', true), false, 'never after a manual cancellation');
});

test('an empty set of re-run specs quarantines nothing', () => {
  const quarantineIf = stepIf(workflow, 'Quarantine the specs that failed and then passed');
  assert.ok(quarantineIf, 'the quarantine step has a condition');
  // A job id with a hyphen is a property access in a workflow expression and a subtraction in JS.
  const quarantines = (specs) => runInNewContext(quarantineIf.replaceAll('needs.e2e-retry', "needs['e2e-retry']"), {
    needs: { gate: { result: 'success' }, 'e2e-retry': { result: 'success', outputs: { specs } } },
  }, { timeout: 100 });
  assert.equal(quarantines('[]'), false);
  assert.equal(quarantines('["e2e/a.spec.ts"]'), true);
});

const gateBody = workflow.match(/ {6}- name: Require every gate\n[\s\S]*? {8}run: \|\n((?: {10}[^\n]*\n|\n)*)/)?.[1];
assert.ok(gateBody, 'the final gate shell must be present in the workflow');
const gateScript = gateBody.replace(/^ {10}/gm, '');
const bash = process.platform === 'win32' ? join(process.env.ProgramFiles || 'C:/Program Files', 'Git/bin/bash.exe') : 'bash';
function gate(results = {}) {
  const run = spawnSync(bash, ['--noprofile', '--norc', '-s'], {
    input: gateScript, encoding: 'utf8', timeout: 10_000, windowsHide: true,
    env: { ...process.env, BUILD_RESULT: 'success', PLAN_RESULT: 'success', FACTORY_RESULT: 'success',
      CATALOG_RESULT: 'success', GUIDED_MOD_RESULT: 'skipped', E2E_RESULT: 'success', RETRY_RESULT: 'skipped',
      EVENT: 'pull_request', CONFIGURED_FLAG: 'false', CONFIGURED_RESULT: 'skipped', CONFIGURED_VERDICT: 'skipped', ...results },
  });
  assert.ifError(run.error);
  assert.equal(run.signal, null, run.stderr);
  return run;
}

test('a cancelled matrix passes only after its bounded retry succeeds', () => {
  const completed = gate({ E2E_RESULT: 'cancelled', RETRY_RESULT: 'success' });
  assert.equal(completed.status, 0, completed.stdout + completed.stderr);
  assert.doesNotMatch(completed.stdout, /a flake, not a regression/, 'unreported tests have no prior assertion verdict');
  for (const result of ['', 'skipped', 'failure', 'cancelled']) {
    assert.notEqual(gate({ E2E_RESULT: 'cancelled', RETRY_RESULT: result }).status, 0, result);
  }
});

test('failed-then-passed assertions retain the flake verdict; a failed retry stays red', () => {
  const completed = gate({ E2E_RESULT: 'failure', RETRY_RESULT: 'success' });
  assert.equal(completed.status, 0, completed.stdout + completed.stderr);
  assert.match(completed.stdout, /a flake, not a regression/);
  assert.notEqual(gate({ E2E_RESULT: 'failure', RETRY_RESULT: 'failure' }).status, 0);
});

test('a successful retry never overrides any other required gate', () => {
  for (const key of ['BUILD_RESULT', 'PLAN_RESULT', 'FACTORY_RESULT', 'CATALOG_RESULT', 'GUIDED_MOD_RESULT']) {
    for (const result of ['failure', 'cancelled']) {
      assert.notEqual(gate({ E2E_RESULT: 'cancelled', RETRY_RESULT: 'success', [key]: result }).status, 0, key + result);
    }
  }
});

test('the guided mod holds the gate when it ran red, and only a plan that skipped it passes it by', () => {
  for (const result of ['success', 'skipped']) assert.equal(gate({ GUIDED_MOD_RESULT: result }).status, 0, result);
  for (const result of ['failure', 'cancelled', '']) {
    const run = gate({ GUIDED_MOD_RESULT: result });
    assert.notEqual(run.status, 0, result);
    assert.match(run.stdout, new RegExp(`Guided mod finished '${result}'`), result);
  }
  const gateNeeds = workflow.match(/\n {2}gate:\n[\s\S]*?\n {4}needs: \[([^\]]*)\]/)?.[1].split(',').map((job) => job.trim());
  assert.ok(gateNeeds?.includes('guided-mod'), 'CI gate needs the guided-mod job');
});
