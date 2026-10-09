// The command guard refuses the whole default browser suite typed straight into the shell, since it
// runs on GitHub Actions; a run naming its specs, and a queued job, pass this rule. Real event JSON
// into the real hook (test-lib.mjs); the hook only answers, so nothing here starts a browser.
import assert from 'node:assert/strict';
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

test('naming specs or enqueueing is not refused as a whole-suite run', () => {
  for (const command of ['npm run test:e2e:queued -- e2e/project.spec.ts e2e/wizard.spec.ts', 'npm run queue -- "npm run test:e2e"']) {
    assert.doesNotMatch(runHook(GUARD, bash(command)).message, /whole browser suite/, command);
  }
});
