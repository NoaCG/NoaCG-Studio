// The nightly triage, read off Playwright JSON reports. The shapes are the reporter's own, checked
// against Playwright 1.61 on 2026-09-30: a test stopped by the global timeout and one never reached
// both come back `status: 'skipped'` with `ok: true`, and only `expectedStatus` says they were due.
import assert from 'node:assert/strict';
import test from 'node:test';

import { failedFiles, missingShards, runErrors, triage, unfinishedByFile } from './nightly-triage.mjs';

const t = (status, expectedStatus = 'passed') => ({ status, expectedStatus });
const report = (specs, extra = {}) => ({
  suites: Object.entries(specs).map(([file, tests]) => ({ file, specs: tests.map((x) => ({ ok: x.status !== 'unexpected', tests: [x] })) })),
  ...extra,
});

test('a complete green night says so', () => {
  const { markdown, json } = triage(report({ 'a.spec.ts': [t('expected')], 'b.spec.ts': [t('skipped', 'skipped')] }));
  assert.match(markdown, /every spec file green/);
  assert.equal(json.complete, true);
});

test('deliberate skips are not unfinished; interrupted and unreached tests are', () => {
  const r = report({
    'a.spec.ts': [t('skipped', 'skipped'), t('expected')],
    'b.spec.ts': [t('expected'), t('skipped'), t('skipped')],
  });
  assert.deepEqual([...unfinishedByFile(r)], [['b.spec.ts', 2]]);
});

test('a shard that stopped itself is named, with the error Playwright raised, and is never "green"', () => {
  const r = report(
    { 'slow.spec.ts': [t('expected'), t('skipped')] },
    { errors: [{ message: '\u001b[31mTimed out waiting 1200s for the test suite to run\u001b[39m' }] },
  );
  assert.deepEqual(runErrors(r), ['Timed out waiting 1200s for the test suite to run']);
  const { markdown, json } = triage(r);
  assert.doesNotMatch(markdown, /every spec file green/);
  assert.match(markdown, /did not finish/);
  assert.match(markdown, /Timed out waiting 1200s/);
  assert.match(markdown, /slow\.spec\.ts \(1\)/);
  assert.equal(json.complete, false);
});

test('a shard whose report never arrived is named by its number', () => {
  assert.deepEqual(missingShards(['report-1.zip', 'report-3.zip', 'other.zip'], 3), [2]);
  assert.deepEqual(missingShards([], 2), [1, 2]);
  const { markdown, json } = triage(report({ 'a.spec.ts': [t('expected')] }), { missing: [6], shards: 8 });
  assert.match(markdown, /Shard 6 of 8 sent no report/);
  assert.match(markdown, /no spec file failed among the tests that ran/);
  assert.deepEqual(json.missingShards, [6]);
});

test('the failure-set hash moves when the sweep stops short somewhere new, and holds when it repeats', () => {
  const green = triage(report({ 'a.spec.ts': [t('expected')] })).json.hash;
  const short6 = triage(report({ 'a.spec.ts': [t('expected')] }), { missing: [6], shards: 8 }).json.hash;
  const short6again = triage(report({ 'a.spec.ts': [t('expected')] }), { missing: [6], shards: 8 }).json.hash;
  const short2 = triage(report({ 'a.spec.ts': [t('expected')] }), { missing: [2], shards: 8 }).json.hash;
  assert.notEqual(green, short6);
  assert.equal(short6, short6again);
  assert.notEqual(short6, short2);
});

test('failures are still classified, focus first', () => {
  const r = report({ 'nope.spec.ts': [t('unexpected')] });
  assert.deepEqual([...failedFiles(r)], ['nope.spec.ts']);
  const { json } = triage(r);
  assert.deepEqual([...json.focusFailed, ...json.pausedFailed], ['nope.spec.ts']);
});
