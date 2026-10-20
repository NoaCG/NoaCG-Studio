// The plan run's ledger. What matters is order and no repeats: the next phase never starts before
// the previous one's check passed, a failed check gets one repair and then a diagnosis, and a
// coordinator restarted mid-run is told the next unfinished step and refused a second launch.
// A second failure goes to one fresh deciding agent; a failure after its decision stops the run.
// Findings travel with the next launch, only the checks that must land notes are told so, and the
// window's last 45 minutes are announced so the coordinator can checkpoint instead of overrunning.
import assert from 'node:assert/strict';
import { appendFileSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
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
/** Build, land and check `phase`, leaving it waiting for its verdict. */
const checked = (file, phase) => ['build', 'landed', 'check'].forEach((event) => record(file, phase, event));
/** What `node scripts/plan-run.mjs next <file>` prints, run `minutes` after NOW. */
function printed(file, minutes = 0) {
  let out = '';
  const write = process.stdout.write;
  const now = Date.now;
  process.stdout.write = (chunk) => { out += String(chunk); return true; };
  Date.now = () => at(minutes);
  try { main(['next', file]); } finally {
    process.stdout.write = write;
    Date.now = now;
  }
  return out;
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
    // Only the last phase's check lands the plan's notes.
    assert.deepEqual(next(file), phase < 3 ? { action: 'launch', phase, step: 'check' } : { action: 'launch', phase, step: 'check', notes: 'final phase' });
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

test('a product failure gets one repair; a second failure is diagnosed, and a failure after the diagnosed repair stops the run', () => {
  const file = run();
  checked(file, 1);
  record(file, 1, 'fail', 'product: the overlay never shows');
  assert.deepEqual(next(file), { action: 'launch', phase: 1, step: 'repair', carry: 'product: the overlay never shows' });
  for (const event of ['repair', 'landed', 'check']) record(file, 1, event);
  record(file, 1, 'fail', 'product: still hidden');
  // Owner decision 2026-10-20: a second failure goes to one fresh deciding agent, not straight to the owner.
  assert.equal(next(file).action, 'diagnose');
  assert.match(next(file).why, /failed again after a repair/);
  assert.match(refuseStep(readFileSync(file, 'utf8'), 1, 'repair'), /next event is diagnose/);
  assert.match(refuseStep(readFileSync(file, 'utf8'), 2, 'build'), /phase 1 has not passed/);
  assert.match(refuseStep(readFileSync(file, 'utf8'), 1, 'diagnose', 'the decider looked'), /decision/);
  assert.match(refuseStep(readFileSync(file, 'utf8'), 1, 'diagnose', 'check: infrastructure'), /repair or stop/);
  record(file, 1, 'diagnose', 'repair: the z-index fight, scope it to the overlay layer');
  assert.deepEqual(next(file), { action: 'launch', phase: 1, step: 'repair', carry: 'product: still hidden (diagnosis: the z-index fight, scope it to the overlay layer)' });
  // The diagnosed repair is the last one: one diagnosis per phase, and a further failure is a real stop.
  for (const event of ['repair', 'landed', 'check']) record(file, 1, event);
  record(file, 1, 'fail', 'product: hidden again');
  assert.deepEqual(next(file), { action: 'stop', phase: 1, why: 'its check failed again after the diagnosed repair' });
  assert.match(refuseStep(readFileSync(file, 'utf8'), 1, 'diagnose', 'repair: once more'), /next event is stop/);
  record(file, 1, 'stop', 'asked the owner: the check fails on X');
  assert.equal(next(file).action, 'stopped');
  // The owner's answer lets the phase go on, with one more repair and no more.
  record(file, 1, 'answered', 'try Y');
  assert.deepEqual(next(file), { action: 'launch', phase: 1, step: 'repair', carry: 'product: hidden again' });
  for (const event of ['repair', 'landed', 'check']) record(file, 1, event);
  record(file, 1, 'fail', 'product: no');
  assert.equal(next(file).action, 'stop');
  assert.equal(readFileSync(file, 'utf8').match(/phase 1 repair/g).length, 3);
});

test('a diagnosis that needs the owner records stop with its reason', () => {
  const file = run();
  checked(file, 1);
  record(file, 1, 'fail', 'product: one');
  for (const event of ['repair', 'landed', 'check']) record(file, 1, event);
  record(file, 1, 'fail', 'product: two');
  record(file, 1, 'diagnose', 'stop: the acceptance contradicts the design language; the owner decides');
  assert.equal(next(file).action, 'stopped');
  record(file, 1, 'answered', 'keep the design language');
  assert.deepEqual(next(file), { action: 'launch', phase: 1, step: 'repair', carry: 'product: two' });
});

test('a product failure repairs, a blocked check runs again without a repair, and a second blocked check is diagnosed', () => {
  const file = run();
  checked(file, 1);
  record(file, 1, 'fail', 'product: the label clips');
  assert.deepEqual(next(file), { action: 'launch', phase: 1, step: 'repair', carry: 'product: the label clips' });
  for (const event of ['repair', 'landed', 'check']) record(file, 1, event);
  // Blocked is not the phase's fault: the check runs again, lands its notes, and no repair is spent.
  record(file, 1, 'fail', 'Blocked: the CI runner was offline');
  assert.deepEqual(next(file), { action: 'launch', phase: 1, step: 'check', notes: 'second check' });
  assert.match(refuseStep(readFileSync(file, 'utf8'), 1, 'repair'), /next event is check/);
  record(file, 1, 'check');
  record(file, 1, 'fail', 'blocked: still offline');
  assert.equal(next(file).action, 'diagnose');
  assert.match(next(file).why, /blocked twice/);
  assert.match(refuseStep(readFileSync(file, 'utf8'), 1, 'diagnose', 'repair: rebuild'), /check or stop/);
  // The deciding agent saw the runner recover: one more check, no repair spent.
  record(file, 1, 'diagnose', 'check: the runner is back online');
  assert.deepEqual(next(file), { action: 'launch', phase: 1, step: 'check', notes: 'second check' });
  record(file, 1, 'check');
  record(file, 1, 'fail', 'blocked: offline again');
  assert.deepEqual(next(file), { action: 'stop', phase: 1, why: 'its check was blocked again after the diagnosis' });
  // The owner's answer buys one more check, as it buys one more repair after product failures.
  record(file, 1, 'stop', 'asked the owner about the runner');
  record(file, 1, 'answered', 'runner is back');
  assert.deepEqual(next(file), { action: 'launch', phase: 1, step: 'check', notes: 'second check' });
  record(file, 1, 'check');
  record(file, 1, 'pass', 'ok');
  assert.deepEqual(next(file), { action: 'launch', phase: 2, step: 'build', carry: 'ok' });
});

test('a fail without a kind is refused', () => {
  const file = run();
  checked(file, 1);
  const text = readFileSync(file, 'utf8');
  assert.match(refuseStep(text, 1, 'fail'), /"product:".*"blocked:"/);
  assert.match(refuseStep(text, 1, 'fail', 'FAIL the label clips'), /"product:".*"blocked:"/);
  assert.match(refuseStep(text, 1, 'fail', 'blocked the runner'), /"product:".*"blocked:"/);
  assert.equal(refuseStep(text, 1, 'fail', 'PRODUCT: the label clips'), null);
  assert.equal(refuseStep(text, 1, 'fail', 'blocked: the runner'), null);
  assert.match(recordStep(file, 1, 'fail', 'the label clips').refusal, /names its kind/);
  assert.equal(next(file).action, 'wait');
});

test('four phases make five landings: only the last check lands notes, and each build from phase 2 carries the previous findings', () => {
  const file = run(['One', 'Two', 'Three', 'Four']);
  const launches = [];
  for (const phase of [1, 2, 3, 4]) {
    const build = next(file);
    launches.push(build);
    assert.deepEqual(build, phase === 1
      ? { action: 'launch', phase, step: 'build' }
      : { action: 'launch', phase, step: 'build', carry: `findings ${phase - 1}: tighten the ${phase - 1} spacing` });
    if (phase === 2) assert.equal(printed(file), 'launch build phase 2\n  carry: findings 1: tighten the 1 spacing\n');
    record(file, phase, 'build');
    record(file, phase, 'landed', `#${phase}`);
    const check = next(file);
    launches.push(check);
    assert.deepEqual(check, phase === 4 ? { action: 'launch', phase, step: 'check', notes: 'final phase' } : { action: 'launch', phase, step: 'check' });
    if (phase === 4) assert.equal(printed(file), 'launch check phase 4 (land notes: final phase)\n');
    record(file, phase, 'check');
    if (phase === 2) {
      record(file, phase, 'pass', `findings ${phase}: tighten the ${phase} spacing`);
      assert.equal(next(file).action, 'retro');
      appendFileSync(file, '\n## Midpoint retro\n\n- fine so far\n', 'utf8');
    } else record(file, phase, 'pass', `findings ${phase}: tighten the ${phase} spacing`);
  }
  assert.equal(next(file).action, 'done');
  // Four implementation pull requests and one notes pull request.
  assert.equal(readFileSync(file, 'utf8').match(/ landed #/g).length, 4);
  assert.equal(launches.filter((launch) => launch.notes).length, 1);
});

test('findings survive a restart', () => {
  const file = run();
  checked(file, 1);
  record(file, 1, 'pass', 'findings: the label clips at 40 characters; the fade is 20 ms late');
  // The computer closes here. A new coordinator reads only the file.
  const text = readFileSync(file, 'utf8');
  assert.deepEqual(nextStep(text, at(60)), {
    action: 'launch', phase: 2, step: 'build', carry: 'findings: the label clips at 40 characters; the fade is 20 ms late',
  });
});

test("the window's last 45 minutes say closing, and paused is accepted on a running step", () => {
  const file = run();
  // The window ends 420 minutes after NOW.
  assert.deepEqual(next(file, 374), { action: 'launch', phase: 1, step: 'build' });
  assert.deepEqual(next(file, 375), { action: 'launch', phase: 1, step: 'build', closingMinutes: 45 });
  assert.deepEqual(next(file, 400), { action: 'launch', phase: 1, step: 'build', closingMinutes: 20 });
  assert.equal(next(file, 419.5).closingMinutes, 1);
  assert.deepEqual(next(file, 420), { action: 'time-limit', phase: 1, why: 'the window ended at 2026-10-09T19:00:00.000Z' });
  record(file, 1, 'build', 'branch claude/p1', 400);
  const text = readFileSync(file, 'utf8');
  assert.equal(nextStep(text, at(410)).closingMinutes, 10);
  assert.match(refuseStep(text, 2, 'paused', 'nothing yet'), /has not passed/);
  assert.equal(refuseStep(text, 1, 'paused', 'the builder pushed; the pull request is queued'), null);
  record(file, 1, 'paused', 'the builder pushed; the pull request is queued', 418);
  // A pause is a launch boundary, even with a worker in flight or after block end.
  assert.equal(next(file, 420).action, 'paused');
  assert.equal(readFileSync(file, 'utf8').match(/phase 1 build/g).length, 1);
  record(file, 1, 'landed', '#1', 430);
  assert.equal(next(file, 430).action, 'paused');
  record(file, 1, 'resume', 'owner permitted same deadline; worker and PR reconciled', 430);
  assert.equal(next(file, 430).action, 'time-limit');
});

test('the closing line is printed last, after the step', () => {
  const file = run();
  checked(file, 1);
  record(file, 1, 'pass', 'findings: one');
  assert.equal(printed(file, 400), 'launch build phase 2\n  carry: findings: one\nwindow ends in 20 min: launch only a step that lands before then, else checkpoint and record paused\n');
});

test('a four-phase plan asks for one midpoint retro, a three-phase plan never', () => {
  const four = run(['One', 'Two', 'Three', 'Four']);
  for (const phase of [1, 2]) {
    checked(four, phase);
    record(four, phase, 'pass', `fine ${phase}`);
  }
  const retro = { action: 'retro', phase: 2, why: 'the middle phase passed: write ## Midpoint retro (orchestrator.md step 6, at most five lines), then run next again' };
  assert.deepEqual(next(four), retro);
  assert.deepEqual(next(four), retro);
  assert.equal(printed(four), `retro phase 2: ${retro.why}\n`);
  // A retro bullet naming a phase and an event is a note, not a step: only a line the record
  // command wrote, which starts with its ISO time, is read as one (#1280).
  appendFileSync(four, '\n## Midpoint retro\n\n- the checks took longer than the builds\n- Pace: phase 1 build+check took ~2h\n', 'utf8');
  assert.deepEqual(next(four), { action: 'launch', phase: 3, step: 'build', carry: 'fine 2' });
  for (const phase of [3, 4]) {
    checked(four, phase);
    record(four, phase, 'pass');
  }
  assert.equal(next(four).action, 'done');

  const three = run();
  const asked = [];
  for (const phase of [1, 2, 3]) {
    asked.push(next(three).action);
    checked(three, phase);
    record(three, phase, 'pass');
    asked.push(next(three).action);
  }
  assert.deepEqual(asked, ['launch', 'launch', 'launch', 'launch', 'launch', 'done']);
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
  const clock = Date.now;
  Date.now = () => NOW;
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
    Date.now = clock;
  }
  assert.match(errors[0], /phase 1 has not passed/);
  assert.match(errors[1], /already launched/);
  assert.match(readFileSync(file, 'utf8'), /phase 1 build branch claude\/p1$/m);
});
