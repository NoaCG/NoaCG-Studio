// The probe exists because a dropped `isolation` was INVISIBLE, so the thing worth testing is not
// that it recognises the machine - it is that a mismatch is never silent, and that the weak
// direction of the verdict admits to being weak. Both are checked here; the OS-touching half
// (`observe`) is left to the CLI, which is the only place the real facts exist.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { classifyLocation, mismatchReport } from './agent-isolation.mjs';

const CLI = fileURLToPath(new URL('./agent-isolation.mjs', import.meta.url));
const run = (...args) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });

test('queue records alone settle it, because git never clones them', () => {
  const verdict = classifyLocation({ queueRecords: 557, worktrees: 0 });
  assert.equal(verdict.verdict, 'local');
  assert.equal(verdict.confident, true);
  assert.match(verdict.reasons.join(' '), /landing queue/);
});

test('sibling worktrees alone settle it, for a machine that has not queued anything yet', () => {
  const verdict = classifyLocation({ queueRecords: 0, worktrees: 9 });
  assert.equal(verdict.verdict, 'local');
  assert.equal(verdict.confident, true);
});

test('one worktree is not a sibling, so it proves nothing on its own', () => {
  const verdict = classifyLocation({ queueRecords: 0, worktrees: 1 });
  assert.equal(verdict.verdict, 'remote');
});

test('the remote verdict rests on absent signals and never claims confidence', () => {
  const verdict = classifyLocation({ queueRecords: 0, worktrees: 0 });
  assert.equal(verdict.verdict, 'remote');
  assert.equal(verdict.confident, false);
  assert.match(verdict.reasons.join(' '), /looks identical/);
});

test('a cloud session says so itself, and that makes remote confident', () => {
  const verdict = classifyLocation({ queueRecords: 0, worktrees: 1, remoteFlag: true });
  assert.equal(verdict.verdict, 'remote');
  assert.equal(verdict.confident, true);
  assert.match(verdict.reasons.join(' '), /CLAUDE_CODE_REMOTE/);
});

test('the disk outranks the environment: queue records with the flag set are still local', () => {
  const verdict = classifyLocation({ queueRecords: 12, worktrees: 3, remoteFlag: true });
  assert.equal(verdict.verdict, 'local');
  assert.match(verdict.reasons.join(' '), /disk says/);
});

test('missing counts do not read as a remote machine by accident', () => {
  // A caller that fails to gather the facts must not be handed the answer it was hoping for. The
  // shape is the same as an empty container, so it lands on the unconfident verdict, never a
  // confident one.
  for (const input of [undefined, {}, { queueRecords: undefined }]) {
    assert.equal(classifyLocation(input).confident, false);
  }
});

test('agreement is silent', () => {
  for (const verdict of ['local', 'remote']) {
    assert.equal(mismatchReport({ expected: verdict, verdict, confident: true, reasons: [] }), null);
  }
});

test('a dropped remote isolation names the cost, not just the mismatch', () => {
  const report = mismatchReport({
    expected: 'remote',
    verdict: 'local',
    confident: true,
    reasons: ['557 job record(s) in the machine\'s landing queue, which git never clones'],
  });
  assert.match(report, /ISOLATION MISMATCH/);
  assert.match(report, /asked for remote, this process is local/);
  assert.match(report, /RAM/, 'the point of the row being remote was the machine it does not use');
  assert.match(report, /landing queue/, 'the evidence travels with the verdict');
});

test('the opposite mismatch is reported too, and does not borrow the dropped-isolation wording', () => {
  const report = mismatchReport({ expected: 'local', verdict: 'remote', confident: false, reasons: ['no queue'] });
  assert.match(report, /ISOLATION MISMATCH/);
  assert.doesNotMatch(report, /dropped/);
  assert.match(report, /weak direction/, 'an unconfident verdict says so wherever it is reported');
});

// The CLI half, spawned rather than imported, because these are the ways the probe itself could
// fail silently - and a probe against silent failure that passes quietly is worse than none.

test('a bare --expect is a usage error, never a quiet pass', () => {
  const res = run('--expect');
  assert.equal(res.status, 2, 'exit 2, not the 0 that reads as "isolation verified"');
  assert.match(res.stderr, /takes local or remote/);
});

test('an --expect value that is neither is refused the same way', () => {
  for (const value of ['cloud', 'REMOTE', 'true', '--json']) {
    assert.equal(run('--expect', value).status, 2, `${value} is not a verdict`);
  }
});

test('the expectation that matches exits 0 and the other one exits 1, wherever this runs', () => {
  // Asserted as a RELATIONSHIP, not as "remote fails here". This suite runs both on the laptop
  // that owns the queue (verdict local) and on a CI runner, which is a fresh clone with no queue
  // and one worktree (verdict remote) - so a test pinned to either answer is green in one place
  // and red in the other for no defect at all. What must hold in both is that agreement is silent
  // and disagreement is loud, which is the whole contract.
  const here = JSON.parse(run('--json').stdout).verdict;
  const other = here === 'local' ? 'remote' : 'local';

  assert.equal(run('--expect', here).status, 0, `agreeing with ${here} must be silent`);
  const mismatch = run('--expect', other);
  assert.equal(mismatch.status, 1, `expecting ${other} while ${here} must fail`);
  assert.match(mismatch.stderr, /ISOLATION MISMATCH/);
});

test('--json carries the verdict and the expectation for a caller that parses it', () => {
  // Derived, not pinned, for the reason the test above spells out. This one WAS pinned to
  // `local` and went red on CI, where the checkout is a fresh clone and the verdict is `remote`.
  const here = JSON.parse(run('--json').stdout).verdict;
  const res = run('--json', '--expect', here);
  assert.equal(res.status, 0);
  const facts = JSON.parse(res.stdout);
  assert.equal(facts.verdict, here);
  assert.equal(facts.expected, here);
  assert.ok(Array.isArray(facts.reasons) && facts.reasons.length > 0, 'the evidence travels with the verdict');
});
