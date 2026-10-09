// The command guard refuses the whole default browser suite typed straight into the shell, since it
// runs on GitHub Actions; a run naming its specs, and a queued job, pass this rule. Real event JSON
// into the real hook (test-lib.mjs); the hook only answers, so nothing here starts a browser.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { runHook } from './test-lib.mjs';

const GUARD = new URL('./guard-command.mjs', import.meta.url);
const bash = (command) => ({ hook_event_name: 'PreToolUse', tool_name: 'Bash', cwd: process.cwd(), tool_input: { command } });

test('the whole default suite is refused in the shell, and points at GitHub Actions', () => {
  for (const command of ['npm run test:e2e', 'npm run test:e2e:queued', 'npx playwright test']) {
    const run = runHook(GUARD, bash(command));
    assert.equal(run.status, 2, `${command} was allowed`);
    assert.match(run.message, /whole browser suite runs on GitHub Actions/);
  }
});

// docs/work-specs/agent-lifecycle AC-1: the 2026-10-09 loop is refused with how to add a limit, in
// the foreground and in the background, and the same loop under `timeout` runs, then fails when
// its time runs out - the failure is how its agent is told.
const hasBash = spawnSync('bash', ['-c', 'command -v timeout'], { windowsHide: true }).status === 0;

test('a wait with no time limit is refused, and says how to add one', () => {
  const loop = 'until docker info >/dev/null 2>&1; do sleep 5; done';
  for (const event of [bash(loop), { ...bash(loop), tool_input: { command: loop, run_in_background: true } }]) {
    const run = runHook(GUARD, event);
    assert.equal(run.status, 2, 'the endless wait was allowed');
    assert.match(run.message, /no time limit/);
    assert.match(run.message, /timeout 600 bash -c/);
  }
  const powershell = { ...bash('while (-not (Test-Path ready)) { Start-Sleep 5 }'), tool_name: 'PowerShell' };
  assert.equal(runHook(GUARD, powershell).status, 2);
  assert.equal(runHook(GUARD, bash("timeout 7200 bash -c 'until docker info; do sleep 5; done'")).status, 2, 'two hours is not one wait');
});

test('the same wait under a limit runs, and fails when the limit runs out', { skip: !hasBash && 'no bash with timeout here' }, () => {
  const bounded = "timeout 2 bash -c 'until noacg-not-a-command >/dev/null 2>&1; do sleep 1; done'";
  assert.equal(runHook(GUARD, bash(bounded)).status, 0, runHook(GUARD, bash(bounded)).message);
  const started = Date.now();
  const res = spawnSync('bash', ['-c', bounded], { encoding: 'utf8', windowsHide: true, timeout: 30_000 });
  assert.equal(res.status, 124, 'a wait that runs out exits with a failure');
  assert.ok(Date.now() - started < 15_000, 'and it ends when its limit does');
});

test('naming specs or enqueueing is not refused as a whole-suite run', () => {
  for (const command of ['npm run test:e2e:queued -- e2e/project.spec.ts e2e/wizard.spec.ts', 'npm run queue -- "npm run test:e2e"']) {
    assert.doesNotMatch(runHook(GUARD, bash(command)).message, /whole browser suite/, command);
  }
});
