// The run wake-up's prompt gate, verified the way docs/MISTAKE_TRIGGERS.md asks for: real event JSON
// piped into the REAL hook file. What is pinned: any prompt but the wake-up task's own envelope
// passes untouched, one quoting the task's tag included; a firing with nothing to do (here
// `unknown`, the inventory not answering) is blocked before the model; a firing with something to
// do (here `idle`) reaches the model with the check's output; and the hook is wired.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { writeWake } from '../run-wake.mjs';
import { runHook, wiringProblem } from './test-lib.mjs';

const HOOK = new URL('./run-wake-gate.mjs', import.meta.url);
const FIRING = '<scheduled-task name="noacg-run-wake" file="C:\\task\\SKILL.md">\nDurable wake-up\n</scheduled-task>';

/** A throwaway job store holding the given wave plans, so the machine's real runs never leak in. */
function store(plans = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'noacg-run-wake-gate-'));
  mkdirSync(path.join(dir, 'wave-plans'));
  for (const [name, text] of Object.entries(plans)) writeFileSync(path.join(dir, 'wave-plans', name), text, 'utf8');
  return dir;
}
const run = (prompt, dir = store()) => runHook(HOOK, { hook_event_name: 'UserPromptSubmit', prompt }, { NOACG_JOBS_DIR: dir, CLAUDE_BIN: path.join(dir, 'no-claude.exe') });

test('every other prompt, and malformed input, passes untouched', () => {
  const quoted = `Why does this block? ${FIRING}`;
  for (const prompt of ['run the wake-up check', 'noacg-run-wake is broken, look at it', '', quoted, `${FIRING}\nand also this`]) {
    assert.deepEqual(run(prompt), { status: 0, message: '', output: '' });
  }
  assert.equal(runHook(HOOK, 'not json').status, 0);
});

test('a firing with nothing to do is blocked before any model call', () => {
  const until = new Date(Date.now() + 3_600_000).toISOString();
  const wave = writeWake(`# Plan run x\n\nWindow ends: ${until}\nSession: aaa\n`, { host: 'local_1', session: 'bbb', resume: '/plan-run x' });
  const result = run(FIRING, store({ '2026-10-14-plan-x-wave-plan.local.md': wave }));
  assert.equal(result.status, 0);
  const out = JSON.parse(result.output);
  assert.equal(out.decision, 'block');
  assert.match(out.reason, /^unknown: .*the process inventory did not answer/);
});

test('a firing with something to do reaches the model with the check already run', () => {
  const result = run(FIRING);
  assert.equal(result.status, 0);
  const out = JSON.parse(result.output);
  assert.equal(out.decision, undefined);
  assert.equal(out.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
  assert.match(out.hookSpecificOutput.additionalContext, /already run for this firing:\nidle: no open run has a wake-up$/);
});

test('the gate is wired on every prompt', () => {
  assert.equal(wiringProblem('UserPromptSubmit', undefined, 'node scripts/hooks/run-wake-gate.mjs'), null);
});
