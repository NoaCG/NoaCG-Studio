// The guard on the Codex delegation channel is these cases, not the prose in codex-rescue.mjs.
//
// Each defect the first delegation trial found (2026-08-29; all three are described in the header
// of codex-rescue.mjs, which is where the record lives now that the trial's handoff is swept) was
// invisible: a killed job that still read as running, a cancel that could not kill, a launch that
// died with its caller. None of them announce themselves, so each one is pinned here as the shape
// that has to hold - the two that matter most are the ones a regression would make silent again:
//
//   - a pid that is GONE must flip the job to a recorded outcome, and a pid that is ALIVE must
//     never be touched (pids are reused; a false "dead" is worse than a stale "running");
//   - nothing this file plans may pass through a shell, because Git Bash is $SHELL on this
//     machine and MSYS rewrites every argument that starts with a slash.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  imageNamePlan,
  killPlan,
  parseRelayArgs,
  pickPluginVersion,
  processAlive,
  reconcileJob,
  relayArgs,
  splitOwnArgs,
} from './codex-rescue.mjs';

// ── Defect 2: a killed job must stop reading as running ──────────────────────────────────────────

const nowIso = () => '2026-08-30T00:00:00.000Z';
const gone = () => false;
const alive = () => true;

test('a running job whose pid is gone is recorded as dead', () => {
  const patch = reconcileJob({ id: 'task-1', status: 'running', phase: 'starting', pid: 39112 }, { alive: gone, nowIso });
  assert.equal(patch.status, 'failed');
  assert.equal(patch.phase, 'dead');
  assert.equal(patch.pid, null);
  assert.equal(patch.deadPid, 39112);
  assert.equal(patch.completedAt, nowIso());
  assert.match(patch.errorMessage, /39112 is gone/);
});

test('a queued job whose pid is gone is dead too - it died before it ever ran', () => {
  const patch = reconcileJob({ id: 'task-1', status: 'queued', pid: 4242 }, { alive: gone, nowIso });
  assert.equal(patch.status, 'failed');
  assert.equal(patch.deadPid, 4242);
});

test('a live pid is never touched, however long it has been running', () => {
  assert.equal(reconcileJob({ id: 'task-1', status: 'running', pid: 39112 }, { alive, nowIso }), null);
});

test('a finished job is never rewritten, even though its pid is gone by definition', () => {
  for (const status of ['completed', 'failed', 'cancelled']) {
    assert.equal(reconcileJob({ id: 'task-1', status, pid: 39112 }, { alive: gone, nowIso }), null);
  }
});

test('a job with no pid yet is left alone rather than declared dead', () => {
  for (const pid of [null, undefined, 0, -1, 'x']) {
    assert.equal(reconcileJob({ id: 'task-1', status: 'running', pid }, { alive: gone, nowIso }), null);
  }
});

test('EPERM means the process exists and is not ours to signal, so it counts as alive', () => {
  const eperm = () => { const error = new Error('nope'); error.code = 'EPERM'; throw error; };
  const esrch = () => { const error = new Error('gone'); error.code = 'ESRCH'; throw error; };
  assert.equal(processAlive(1, eperm), true);
  assert.equal(processAlive(1, esrch), false);
  assert.equal(processAlive(1, () => undefined), true);
});

// ── Defect 3: the kill must not travel through a shell ───────────────────────────────────────────

test('taskkill gets /PID as its own argument, so MSYS has no command line to rewrite', () => {
  const plan = killPlan(39112, 'win32');
  assert.deepEqual(plan.args, ['/PID', '39112', '/T', '/F']);
  assert.match(plan.command, /taskkill(\.exe)?$/i);
  // The whole defect was `/PID` becoming a path. It must never be concatenated into one string.
  assert.ok(!plan.args.some((arg) => arg.includes(' ')));
});

test('tasklist gets its filter as one argument, for the same reason', () => {
  assert.deepEqual(imageNamePlan(39112, 'win32').args, ['/FI', 'PID eq 39112', '/FO', 'CSV', '/NH']);
  assert.equal(imageNamePlan(39112, 'linux'), null);
});

test('posix kills the process group instead', () => {
  assert.deepEqual(killPlan(4242, 'linux'), { command: 'kill', args: ['-TERM', '-4242'] });
});

// ── Defect 1: the launch must outlive the caller ─────────────────────────────────────────────────

test('the relay carries the launcher argv through argv, never through a command line', () => {
  const argv = relayArgs({
    self: 'C:\\repo\\scripts\\codex-rescue.mjs',
    script: 'C:\\p\\codex-companion.mjs',
    outFile: 'C:\\tmp\\out.json',
    scriptArgs: ['task', '--background', '--prompt-file', 'C:\\tmp\\a b\\prompt.txt'],
  });
  assert.deepEqual(argv.slice(0, 6), [
    'C:\\repo\\scripts\\codex-rescue.mjs', 'relay',
    '--relay-out', 'C:\\tmp\\out.json',
    '--relay-script', 'C:\\p\\codex-companion.mjs',
  ]);
  // A path with a space survives because nothing ever joins these into a string.
  assert.deepEqual(argv.slice(6), ['--', 'task', '--background', '--prompt-file', 'C:\\tmp\\a b\\prompt.txt']);
});

test('the relay reads back exactly what it was given, with -- separating the two halves', () => {
  const parsed = parseRelayArgs(relayArgs({
    self: 'self.mjs', script: 'companion.mjs', outFile: 'out.json',
    scriptArgs: ['task', '--relay-out', 'a-value-that-looks-like-our-own-flag'],
  }).slice(1));
  assert.equal(parsed.outFile, 'out.json');
  assert.equal(parsed.script, 'companion.mjs');
  // The forwarded half is taken verbatim after `--`, so a task argument can never be read as ours.
  assert.deepEqual(parsed.scriptArgs, ['task', '--relay-out', 'a-value-that-looks-like-our-own-flag']);
});

test('a relay argv with no forwarded half forwards nothing rather than guessing', () => {
  assert.deepEqual(parseRelayArgs(['relay', '--relay-out', 'o']), {
    outFile: 'o', script: null, scriptArgs: [],
  });
});

test('a forwarded --cwd stays forwarded - only the one before `--` is ours', () => {
  const forwarded = ['--', 'task', '--background', '--cwd', 'C:\\repo', '--prompt-file', 'p.txt'];
  // Ours is absent: the whole forwarded half must survive untouched, including its own --cwd.
  assert.deepEqual(splitOwnArgs(['--relay-out', 'o', ...forwarded], 'C:\\fallback'), {
    cwd: 'C:\\fallback',
    argv: ['--relay-out', 'o', ...forwarded],
  });
  // Ours is present: it is consumed, and the forwarded half is still untouched.
  assert.deepEqual(splitOwnArgs(['--cwd', 'C:\\mine', '--relay-out', 'o', ...forwarded], 'C:\\fallback'), {
    cwd: 'C:\\mine',
    argv: ['--relay-out', 'o', ...forwarded],
  });
});

// ── Picking the plugin: an upgrade must be followed without editing anything ─────────────────────

test('the highest semver plugin version wins, and numbers compare as numbers', () => {
  assert.equal(pickPluginVersion(['1.0.6', '1.0.10', '0.9.9']), '1.0.10');
  assert.equal(pickPluginVersion(['2.0.0', '10.0.0']), '10.0.0');
  assert.equal(pickPluginVersion(['1.0.6', 'node_modules', '.DS_Store']), '1.0.6');
  assert.equal(pickPluginVersion(['not-a-version']), null);
  assert.equal(pickPluginVersion([]), null);
});

// ── The reasoning-effort floor: a launch that names no effort carries the norm ───────────────────

test('a launch with no --effort is given the default effort explicitly', async () => {
  const { launchPlan, DEFAULT_EFFORT } = await import('./codex-rescue.mjs');
  const { flags, text } = launchPlan(['--write', 'fix', 'the', 'thing']);
  assert.deepEqual(flags, ['--write', '--effort', DEFAULT_EFFORT]);
  assert.equal(text, 'fix the thing');
});

test('an explicit --effort always wins over the default, even a lower one', async () => {
  const { launchPlan } = await import('./codex-rescue.mjs');
  const { flags } = launchPlan(['--effort', 'low', 'list', 'the', 'sites']);
  assert.deepEqual(flags, ['--effort', 'low']);
});

test('the default effort is the owner-ruled setting, not the machine config', async () => {
  const { DEFAULT_EFFORT, DEFAULT_EFFORT_REVIEW_ON } = await import('./codex-rescue.mjs');
  // medium until 2026-09-16 by the 2026-09-09 ruling; high is the standing norm it returns to.
  assert.equal(DEFAULT_EFFORT, 'medium');
  // low is never the default, whatever the machine config drifted to - that is the one thing this
  // constant exists to stop, and it is the shape the defect actually took on 2026-08-30.
  assert.notEqual(DEFAULT_EFFORT, 'low');

  // A trial without an expiry is just a new default. The date is asserted so that a session
  // reading this after it passes is TOLD to go and settle it from the delegation ledger rather
  // than inheriting a week-long experiment as policy.
  assert.match(DEFAULT_EFFORT_REVIEW_ON, /^\d{4}-\d{2}-\d{2}$/);
  const due = Date.parse(`${DEFAULT_EFFORT_REVIEW_ON}T00:00:00Z`);
  assert.ok(
    Date.now() < due || DEFAULT_EFFORT === 'high',
    `the ${DEFAULT_EFFORT} default was a trial due for review on ${DEFAULT_EFFORT_REVIEW_ON}: `
      + 'read npm run harness:usage for what the week measured, then either extend it with that '
      + 'evidence and move the date, or set DEFAULT_EFFORT back to high',
  );
});

test('--resume still maps to --resume-last and --model is still forwarded beside the default', async () => {
  // Reads DEFAULT_EFFORT rather than restating it: this case is about the FLAGS being forwarded,
  // and spelling the value here made it fail for an unrelated reason the day the default moved.
  const { launchPlan, DEFAULT_EFFORT } = await import('./codex-rescue.mjs');
  const { flags } = launchPlan(['--resume', '--model', 'gpt-5.6-sol']);
  assert.deepEqual(flags, ['--resume-last', '--model', 'gpt-5.6-sol', '--effort', DEFAULT_EFFORT]);
});

test('the = spelling of a valued flag is a flag, never prompt text', async () => {
  const { launchPlan, DEFAULT_EFFORT } = await import('./codex-rescue.mjs');
  const { flags, text } = launchPlan(['--effort=low', 'list', 'the', 'exports']);
  assert.deepEqual(flags, ['--effort', 'low']);
  assert.equal(text, 'list the exports');
  const model = launchPlan(['--model=gpt-5.6-sol', 'x']);
  assert.deepEqual(model.flags, ['--model', 'gpt-5.6-sol', '--effort', DEFAULT_EFFORT]);
});

test('a valued flag with no value is refused, not spawned as undefined', async () => {
  const { launchPlan } = await import('./codex-rescue.mjs');
  assert.throws(() => launchPlan(['do', 'the', 'thing', '--effort']), /--effort needs a value/);
  assert.throws(() => launchPlan(['--model=', 'x']), /--model needs a value/);
});
