// The Read and Grep guard (#1281): real event JSON into the real hook (test-lib.mjs), and the wiring
// in .claude/settings.json, since a hook nothing routes to refuses nothing. Which paths count is
// tested in env-secrets.test.mjs.
import assert from 'node:assert/strict';
import test from 'node:test';

import { runHook, wiringProblem } from './test-lib.mjs';

const GUARD = new URL('./guard-read.mjs', import.meta.url);
const call = (tool_name, tool_input) => ({ hook_event_name: 'PreToolUse', tool_name, cwd: process.cwd(), tool_input });

test('reading a .env file is refused, and the refusal points at the configured test accounts', () => {
  for (const event of [call('Read', { file_path: 'C:\\claude\\NoaCG-Studio\\.env' }), call('Grep', { pattern: 'KEY', path: '.env.local', output_mode: 'content' })]) {
    const run = runHook(GUARD, event);
    assert.equal(run.status, 2, `${event.tool_name} was allowed`);
    assert.match(run.message, /\.github\/workflows\/configured-suite\.yml/);
    assert.match(run.message, /docs\/VERIFICATION\.md/);
  }
});

test('a committed .env file, an ordinary file and an unreadable event pass', () => {
  for (const event of [call('Read', { file_path: '.env.example' }), call('Read', { file_path: 'scripts/bench-env.mjs' }), call('Grep', { pattern: 'x' }), 'not json']) {
    const run = runHook(GUARD, event);
    assert.equal(run.status, 0, run.message);
  }
});

test('.claude/settings.json routes Read and Grep to this hook', () => {
  assert.equal(wiringProblem('PreToolUse', 'Read|Grep', 'node scripts/hooks/guard-read.mjs'), null);
});
