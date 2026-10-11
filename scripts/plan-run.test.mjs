// The plan run's ledger. What matters is order and no repeats: the next phase never starts before
// the previous one's check passed, a failed check gets one repair and then the run stops, and a
// coordinator restarted mid-run is told the next unfinished step and refused a second launch.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { main, nextStep, readPhases, recordStep, refuseStep } from './plan-run.mjs';
import { openWave } from './wave-plan-store.mjs';

const NOW = Date.parse('2026-10-09T12:00:00Z');
const UNTIL = '2026-10-09T22:00:00+03:00';

/** A plan run opened in a throwaway store, with three phases copied in. */
function run(phases = ['One - first file', 'Two - second file', 'Three - third file']) {
  const dir = mkdtempSync(path.join(tmpdir(), 'noacg-plan-run-'));
  const { file } = openWave({ date: '2026-10-09', kind: 'plan-proof', until: UNTIL, dir, now: NOW });
  writeFileSync(file, `${readFileSync(file, 'utf8')}\n## Phases\n\n${phases.map((name, i) => `${i + 1}. ${name}`).join('\n')}\n\n## Log\n`, 'utf8');
  return file;
}

const at = (minutes) => NOW + minutes * 60_000;
const next = (file, minutes = 0) => nextStep(readFileSync(file, 'utf8'), at(minutes));
function record(file, phase, event, detail = '', minutes = 0) {
  const result = recordStep(file, phase, event, detail, at(minutes));
  assert.equal(result.refusal, undefined, `${phase} ${event}: ${result.refusal}`);
}

test('the phases are the numbered list under "## Phases" and nothing else', () => {
  assert.deepEqual(readPhases('# x\n\n## Phases\n\n1. A\n2. B\n\n## Log\n\n1. not a phase\n'), ['A', 'B']);
  assert.deepEqual(readPhases('# x\r\n\r\n## Phases\r\n1. A\r\n'), ['A']);
  assert.equal(nextStep('# x\n').action, 'no-phases');
});

test('three phases run build, land, check in order, and the run ends when the plan ends', () => {
  const file = run();
  for (const phase of [1, 2, 3]) {
    assert.deepEqual(next(file), { action: 'launch', phase, step: 'build' });
    record(file, phase, 'build', `branch claude/p${phase}`);
    assert.deepEqual(next(file), { action: 'wait', phase, step: 'build', launched: `branch claude/p${phase}` });
    // The next phase cannot start on an unchecked one.
    if (phase < 3) assert.match(refuseStep(readFileSync(file, 'utf8'), phase + 1, 'build'), /has not passed its check/);
    record(file, phase, 'landed', `#${100 + phase}`);
    assert.deepEqual(next(file), { action: 'launch', phase, step: 'check' });
    record(file, phase, 'check');
    if (phase < 3) assert.match(refuseStep(readFileSync(file, 'utf8'), phase + 1, 'build'), /has not passed its check/);
    record(file, phase, 'pass');
  }
  assert.equal(next(file).action, 'done');
  const events = readFileSync(file, 'utf8').match(/phase \d \w+/g);
  assert.deepEqual(events, [1, 2, 3].flatMap((n) => ['build', 'landed', 'check', 'pass'].map((e) => `phase ${n} ${e}`)));
});

test('the time limit stops new launches, but a launched step is still waited for', () => {
  const file = run();
  record(file, 1, 'build');
  assert.equal(next(file, 24 * 60).action, 'wait');
  record(file, 1, 'landed', '#1');
  assert.equal(next(file, 24 * 60).action, 'time-limit');
  assert.deepEqual(next(file, 10), { action: 'launch', phase: 1, step: 'check' });
});

test('a failed check gets one repair; the second failure stops the run at that phase', () => {
  const file = run();
  for (const event of ['build', 'landed', 'check', 'fail']) record(file, 1, event);
  assert.deepEqual(next(file), { action: 'launch', phase: 1, step: 'repair' });
  for (const event of ['repair', 'landed', 'check', 'fail']) record(file, 1, event);
  assert.equal(next(file).action, 'stop');
  assert.match(refuseStep(readFileSync(file, 'utf8'), 1, 'repair'), /next event is stop/);
  assert.match(refuseStep(readFileSync(file, 'utf8'), 2, 'build'), /phase 1 has not passed/);
  record(file, 1, 'stop', 'asked the owner: the check fails on X');
  assert.equal(next(file).action, 'stopped');
  // The owner's answer lets the phase go on, with one more repair and no more.
  record(file, 1, 'answered', 'try Y');
  assert.deepEqual(next(file), { action: 'launch', phase: 1, step: 'repair' });
  for (const event of ['repair', 'landed', 'check', 'fail']) record(file, 1, event);
  assert.equal(next(file).action, 'stop');
});

test('a reserved decision stops the step it met, and the answer resumes that same step', () => {
  const file = run();
  record(file, 1, 'build');
  record(file, 1, 'stop', 'needs an account');
  assert.equal(next(file).action, 'stopped');
  record(file, 1, 'answered', 'use the test account');
  assert.equal(next(file).action, 'wait');
});

test('a restarted coordinator continues from the next unfinished step and launches nothing twice', () => {
  const file = run();
  for (const event of ['build', 'landed', 'check', 'pass']) record(file, 1, event);
  record(file, 2, 'build', 'branch claude/p2 worktree C:/wt/p2');
  // The computer closes here. A new coordinator reads only the file.
  const text = readFileSync(file, 'utf8');
  assert.deepEqual(nextStep(text, at(60)), { action: 'wait', phase: 2, step: 'build', launched: 'branch claude/p2 worktree C:/wt/p2' });
  assert.match(refuseStep(text, 2, 'build'), /already launched: resume it/);
  assert.match(refuseStep(text, 1, 'build'), /phase 1 is passed/);
  assert.equal(refuseStep(text, 2, 'resume'), null);
  record(file, 2, 'resume', 'session restarted in C:/wt/p2');
  assert.equal(next(file).action, 'wait');
  record(file, 2, 'landed', '#2');
  assert.deepEqual(next(file), { action: 'launch', phase: 2, step: 'check' });
  assert.equal(readFileSync(file, 'utf8').match(/phase 2 build/g).length, 1);
});

test('the command line refuses a wrong step with a reason and records a right one', () => {
  const file = run();
  const errors = [];
  const write = process.stderr.write;
  const out = process.stdout.write;
  process.stderr.write = (chunk) => errors.push(String(chunk));
  process.stdout.write = () => true;
  try {
    assert.equal(main(['record', file, '2', 'build']), 1);
    assert.equal(main(['record', file, '1', 'build', 'branch', 'claude/p1']), 0);
    assert.equal(main(['record', file, '1', 'build']), 1);
    assert.equal(main(['next', file]), 0);
    assert.equal(main(['next']), 2);
  } finally {
    process.stderr.write = write;
    process.stdout.write = out;
  }
  assert.match(errors[0], /phase 1 has not passed/);
  assert.match(errors[1], /already launched/);
  assert.match(readFileSync(file, 'utf8'), /phase 1 build branch claude\/p1$/m);
});
