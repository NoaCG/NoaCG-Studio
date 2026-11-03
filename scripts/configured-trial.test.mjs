// The repeat trial's argument checks and verdict (scripts/configured-trial.mjs).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_REPEAT, trialArgs, trialVerdict } from './configured-trial.mjs';

const args = (s) => s.split(' ');

test('a trial names one configured spec, a count and a time cap', () => {
  assert.deepEqual(trialArgs(args('--spec e2e/configured/late-send-abandoned.spec.ts --repeat 32 --minutes 40')), {
    spec: 'e2e/configured/late-send-abandoned.spec.ts',
    repeat: 32,
    minutes: 40,
  });
  // A value given after `npm run trial:<name> --` overrides the script's own.
  assert.equal(trialArgs(args('--spec e2e/configured/a.spec.ts --repeat 40 --minutes 40 --repeat 3')).repeat, 3);
  assert.throws(() => trialArgs(args('--spec e2e/late-send-abandoned.spec.ts --repeat 3 --minutes 4')), /under e2e\/configured/);
  assert.throws(() => trialArgs(args('--spec e2e/configured/../x.spec.ts --repeat 3 --minutes 4')), /under e2e\/configured/);
  assert.throws(() => trialArgs(args('--spec e2e/configured/a.spec.ts --repeat 0 --minutes 4')), /--repeat/);
  assert.throws(() => trialArgs(args(`--spec e2e/configured/a.spec.ts --repeat ${MAX_REPEAT + 1} --minutes 4`)), /--repeat/);
  assert.throws(() => trialArgs(args('--spec e2e/configured/a.spec.ts --repeat 2.5 --minutes 4')), /--repeat/);
  assert.throws(() => trialArgs(args('--spec e2e/configured/a.spec.ts --repeat 3')), /--minutes/);
  assert.throws(() => trialArgs(args('--spec e2e/configured/a.spec.ts --repeat 3 --minutes 76')), /--minutes/);
});

const spec = (line, statuses, retry = 0, id = `id-${line}`) => ({
  id,
  file: 'late-send-abandoned.spec.ts',
  line,
  title: 'a held Take',
  tests: [{ results: statuses.map((status) => ({ status, retry })) }],
});
const report = (statuses, retry = 0) => ({ suites: [{ suites: [{ specs: [spec(28, statuses, retry)] }] }] });

test('only every asked-for run passing is a pass', () => {
  assert.equal(trialVerdict(report(['passed', 'passed', 'passed']), 3).ok, true);
  const one = trialVerdict(report(['passed', 'failed', 'passed']), 3);
  assert.equal(one.ok, false);
  assert.equal(one.failed, 1);
  // A timed-out or interrupted run is not a pass either.
  assert.equal(trialVerdict(report(['passed', 'timedOut', 'interrupted']), 3).failed, 2);
});

test('a short, missing or retried run is never a pass', () => {
  assert.match(trialVerdict(report(['passed', 'passed']), 3).problems.join(), /2 runs, but 1 test\(s\) x 3 = 3/);
  assert.match(trialVerdict(null, 3).problems.join(), /no test ran/);
  assert.match(trialVerdict(report(['passed'], 1), 1).problems.join(), /retried/);
});

test('two tests with one title are two tests', () => {
  const both = { suites: [{ specs: [spec(28, ['passed', 'passed']), spec(90, ['passed', 'passed'])] }] };
  const v = trialVerdict(both, 2);
  assert.equal(v.tests, 2);
  assert.equal(v.ok, true);
});

test('each repetition listed as its own entry is still one test', () => {
  // What --repeat-each writes: one entry per repetition, each with its own id, one result each.
  const repeated = { suites: [{ specs: [1, 2, 3].map((n) => spec(28, ['passed'], 0, `rep-${n}`)) }] };
  const v = trialVerdict(repeated, 3);
  assert.equal(v.tests, 1);
  assert.equal(v.ok, true);
});
