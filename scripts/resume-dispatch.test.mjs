// gate: build
// guards: scripts/resume-dispatch.mjs, .agent-workflows/orchestrator/hosts.md
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { resumeDispatch, validateResume } from './resume-dispatch.mjs';

const NOW = Date.parse('2026-09-12T05:40:00Z');
function state() {
  return {
    version: 1, kind: 'bounded-production-pilot', phase: 'awaiting_resume', resumeCount: 0,
    startedAt: '2026-09-11T20:12:28Z', deadline: '2026-09-11T21:12:28Z',
    continuation: { startedAt: '2026-09-12T05:34:37Z', deadline: '2026-09-12T06:04:37Z', authorizedBy: 'User continue' },
    refill: { launchCount: 0, status: 'pending' },
  };
}

function fixture(t) {
  const directory = mkdtempSync(path.join(tmpdir(), 'resume-dispatch-'));
  t.after(() => {
    assert.equal(path.dirname(directory), tmpdir());
    assert.ok(path.basename(directory).startsWith('resume-dispatch-'));
    rmSync(directory, { recursive: true, force: true });
  });
  const primary = path.join(directory, 'primary');
  const cwd = path.join(directory, 'worker');
  const git = (args) => assert.equal(spawnSync('git', args, { encoding: 'utf8', windowsHide: true }).status, 0);
  git(['init', '--initial-branch=main', primary]);
  git(['-C', primary, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '--allow-empty', '-m', 'Initialize test repository']);
  git(['-C', primary, 'worktree', 'add', '-b', 'feature/test', cwd]);
  const file = path.join(directory, 'pilot.json');
  const initial = { ...state(), worktree: cwd, branch: 'feature/test' };
  writeFileSync(file, JSON.stringify(initial));
  const marker = path.join(directory, 'calls.txt');
  const worker = path.join(cwd, 'worker.mjs');
  writeFileSync(worker, `import { appendFileSync } from 'node:fs'; appendFileSync(process.argv[2], ${JSON.stringify('called\n')}); console.log(process.argv[3]);`);
  return { file, initial, marker, worker, primary, cwd, args: [worker, marker, 'literal $() & | text'] };
}

test('historical UTC deadline remains open in three local time zones', () => {
  const module = new URL('./resume-dispatch.mjs', import.meta.url).href;
  for (const TZ of ['UTC', 'Europe/Kyiv', 'America/Los_Angeles']) {
    const result = spawnSync(process.execPath, ['--input-type=module', '-e',
      `import { validateResume } from ${JSON.stringify(module)}; console.log(validateResume(${JSON.stringify(state())}, ${NOW}));`,
    ], { env: { ...process.env, TZ }, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(Number(result.stdout), Date.parse('2026-09-12T06:04:37Z'));
  }
});

test('invalid, expired, future, unapproved and duplicate state is refused', () => {
  for (const change of [
    (s) => { s.continuation.deadline = '2026-09-12T05:40:00Z'; },
    (s) => { s.continuation.deadline = '2026-09-12T06:04:37'; },
    (s) => { s.continuation.deadline = '2026-09-12T06:04:37+03:00'; },
    (s) => { s.continuation.deadline = '2026-02-30T06:04:37Z'; },
    (s) => { s.continuation.startedAt = '2026-09-12T05:50:00Z'; },
    (s) => { s.continuation.authorizedBy = ''; },
    (s) => { s.continuation = null; },
    (s) => { s.continuation.deadline = '2026-09-14T06:04:37Z'; },
    (s) => { delete s.continuation; },
    (s) => { s.refill.launchCount = 1; },
    (s) => { s.resumeCount = 1; },
    (s) => { s.phase = 'reviewing'; },
  ]) {
    const value = state(); change(value);
    assert.throws(() => validateResume(value, NOW));
  }
  const original = state(); delete original.continuation;
  assert.equal(validateResume(original, Date.parse('2026-09-11T20:30:00Z')), Date.parse(original.deadline));
});

test('a refused claim never calls the launcher or changes saved state', async (t) => {
  const f = fixture(t);
  let calls = 0;
  const before = readFileSync(f.file, 'utf8');
  await assert.rejects(resumeDispatch(f.file, process.execPath, f.args, {
    now: () => Date.parse('2026-09-12T07:00:00Z'), launch: () => { calls++; throw new Error('must not run'); },
  }), /window is not open/);
  assert.equal(calls, 0);
  assert.equal(readFileSync(f.file, 'utf8'), before);
  assert.equal(existsSync(f.marker), false);
});

test('claim persistence failure and expiry during persistence cannot dispatch', async (t) => {
  for (const failure of ['write', 'expiry']) {
    const f = fixture(t);
    let clock = NOW;
    let calls = 0;
    await assert.rejects(resumeDispatch(f.file, process.execPath, f.args, {
      now: () => clock,
      writeState: (file, value) => {
        if (failure === 'write') throw new Error('disk unavailable');
        writeFileSync(file, JSON.stringify(value));
        clock = Date.parse(value.continuation.deadline);
      },
      launch: () => { calls++; throw new Error('must not run'); },
    }), failure === 'write' ? /disk unavailable/ : /expired before dispatch/);
    assert.equal(calls, 0);
    assert.ok(existsSync(`${f.file}.dispatch-lock`));
    await assert.rejects(resumeDispatch(f.file, process.execPath, f.args, { now: () => NOW }), /EEXIST/);
  }
});

test('one local child sees its durable claim, preserves deadlines and cannot be refilled twice', async (t) => {
  const f = fixture(t);
  let duplicate;
  const result = await resumeDispatch(f.file, process.execPath, f.args, {
    now: () => NOW,
    launch: (command, args, options) => {
      assert.equal(JSON.parse(readFileSync(f.file)).refill.launchCount, 1);
      assert.equal(options.shell, false);
      duplicate = assert.rejects(resumeDispatch(f.file, command, args, { now: () => NOW }), /EEXIST/);
      return spawn(command, args, options);
    },
  });
  await duplicate;
  assert.equal(result.refill.exitCode, 0);
  assert.equal(result.phase, 'awaiting_result_review');
  assert.equal(result.deadline, f.initial.deadline);
  assert.deepEqual(result.continuation, f.initial.continuation);
  assert.equal(result.resumeCount, 1);
  assert.ok(result.refill.childPid > 0);
  assert.equal(readFileSync(f.marker, 'utf8'), 'called\n');
  assert.match(readFileSync(result.refill.logFile, 'utf8'), /literal \$\(\) & \| text/);
  await assert.rejects(resumeDispatch(f.file, process.execPath, f.args, { now: () => NOW }), /EEXIST/);
});

test('wrong worktree identity and existing unknown claim never launch', async (t) => {
  const f = fixture(t);
  writeFileSync(f.file, JSON.stringify({ ...f.initial, branch: 'wrong-branch' }));
  await assert.rejects(resumeDispatch(f.file, process.execPath, f.args, { now: () => NOW }), /Saved branch/);
  writeFileSync(f.file, JSON.stringify({ ...f.initial, worktree: f.primary, branch: 'main' }));
  await assert.rejects(resumeDispatch(f.file, process.execPath, f.args, { now: () => NOW }), /Saved branch/);
  writeFileSync(`${f.file}.dispatch-lock`, JSON.stringify({ supervisorPid: 999999999 }));
  await assert.rejects(resumeDispatch(f.file, process.execPath, f.args, { now: () => NOW }), /EEXIST/);
  assert.equal(existsSync(f.marker), false);
});

test('spawn failure remains a failure and retains ownership', async (t) => {
  const f = fixture(t);
  await assert.rejects(resumeDispatch(f.file, path.join(f.cwd, 'missing-executable'), [], { now: () => NOW }), /ENOENT/);
  await new Promise((resolve) => setImmediate(resolve));
  const saved = JSON.parse(readFileSync(f.file));
  assert.equal(saved.refill.status, 'spawn_failed');
  assert.ok(existsSync(`${f.file}.dispatch-lock`));
});

test('two real coordinator processes can launch only one local child', async (t) => {
  const f = fixture(t);
  const current = { ...f.initial, startedAt: new Date(Date.now() - 60_000).toISOString(), deadline: new Date(Date.now() + 60_000).toISOString() };
  delete current.continuation;
  writeFileSync(f.file, JSON.stringify(current));
  const run = () => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/resume-dispatch.mjs', '--state', f.file, '--', process.execPath, ...f.args], {
      windowsHide: true, stdio: 'ignore',
    });
    child.once('error', reject);
    child.once('close', resolve);
  });
  assert.deepEqual((await Promise.all([run(), run()])).sort(), [0, 1]);
  assert.equal(readFileSync(f.marker, 'utf8'), 'called\n');
  const saved = JSON.parse(readFileSync(f.file));
  assert.equal(saved.resumeCount, 1);
  assert.equal(saved.refill.launchCount, 1);
});

test('CLI refusal cannot fall through to its supplied command', (t) => {
  const f = fixture(t);
  delete f.initial.continuation; // The original September 11 window is expired.
  f.initial.startedAt = '2000-01-01T00:00:00Z';
  f.initial.deadline = '2000-01-01T01:00:00Z';
  writeFileSync(f.file, JSON.stringify(f.initial));
  const result = spawnSync(process.execPath, ['scripts/resume-dispatch.mjs', '--state', f.file, '--', process.execPath, ...f.args], { encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /window is not open/);
  assert.equal(existsSync(f.marker), false);
  assert.deepEqual(JSON.parse(readFileSync(f.file)), f.initial);
});

test('post-spawn persistence failure remains claimed and cannot cause a duplicate', async (t) => {
  const f = fixture(t);
  let writes = 0;
  await assert.rejects(resumeDispatch(f.file, process.execPath, f.args, {
    now: () => NOW,
    writeState: (file, value) => {
      if (++writes > 1) throw new Error('disk disappeared after spawn');
      writeFileSync(file, JSON.stringify(value));
    },
  }), /disk disappeared/);
  assert.equal(readFileSync(f.marker, 'utf8'), 'called\n');
  assert.equal(JSON.parse(readFileSync(f.file)).refill.status, 'launching');
  await assert.rejects(resumeDispatch(f.file, process.execPath, f.args, { now: () => NOW }), /EEXIST/);
});

test('empty output and nonzero exit never establish a successful review', async (t) => {
  for (const exitCode of [0, 7]) {
    const f = fixture(t);
    const result = await resumeDispatch(f.file, process.execPath, ['-e', `process.exit(${exitCode})`], { now: () => NOW });
    assert.equal(result.phase, 'awaiting_result_review');
    assert.equal(result.refill.status, 'exited');
    assert.equal(result.refill.exitCode, exitCode);
    assert.equal(readFileSync(result.refill.logFile, 'utf8'), '');
  }
});
