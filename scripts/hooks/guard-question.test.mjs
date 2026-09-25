// The question guard, verified the way docs/MISTAKE_TRIGGERS.md asks for: real event JSON piped
// into the REAL hook file, reading the exit code and the message. What is pinned: an untagged
// question is refused with the three-kinds rule; a tagged question with a recommended option
// passes; a tagged question without a recommendation is refused; more than one question per call
// is refused; a wave-row subagent may not ask at all; other tools and malformed input pass
// through; and the hook is wired.
import assert from 'node:assert/strict';
import test from 'node:test';

import { runHook, wiringProblem } from './test-lib.mjs';

const HOOK = new URL('./guard-question.mjs', import.meta.url);

const ask = (questions, extra = {}) => ({ hook_event_name: 'PreToolUse', tool_name: 'AskUserQuestion', cwd: process.cwd(), tool_input: { questions }, ...extra });
const q = (question, header = 'Choice', first = 'a (Recommended)') => ({ question, header, options: [{ label: first, description: 'a' }, { label: 'b', description: 'b' }], multiSelect: false });

test('an untagged question is refused with the three-kinds rule and the question itself', () => {
  const { status, message } = runHook(HOOK, ask([q('Should the queue land a caution branch first?')]));
  assert.equal(status, 2);
  assert.match(message, /STOP - is this the owner's question/);
  assert.match(message, /\? Should the queue land a caution branch first\?/);
  assert.match(message, /Decide operational matters yourself/);
  assert.match(message, /needs: decision/);
});

test('a tagged question with a recommended answer passes', () => {
  for (const text of [
    'needs: decision - should the ticker speed field be per item or per strip?',
    'needs: money - buy the Pro tier for the render worker?',
    'Which account should the SMTP sender use? (needs: account)',
    'needs: Alignment - is the scoreboard still the second graphic?',
  ]) {
    assert.equal(runHook(HOOK, ask([q(text)])).status, 0, text);
  }
  assert.equal(runHook(HOOK, ask([q('Which?', 'needs: harness')])).status, 0, 'the tag may sit in the header');
});

test('a tagged question without a recommended answer is refused', () => {
  const { status, message } = runHook(HOOK, ask([q('needs: decision - which layout?', 'Layout', 'a')]));
  assert.equal(status, 2);
  assert.match(message, /no recommended answer/);
});

test('more than one question per call is refused, even when every one is tagged', () => {
  const { status, message } = runHook(HOOK, ask([q('needs: money - renew the domain?'), q('needs: decision - which colour?')]));
  assert.equal(status, 2);
  assert.match(message, /2 questions in one call/);
});

test('a wave-row subagent may not ask at all', () => {
  const { status, message } = runHook(HOOK, ask([q('needs: decision - which layout?')], { agent_type: 'wave-row-design' }));
  assert.equal(status, 2);
  assert.match(message, /a wave asks nothing/);
});

test('other tools, malformed input and an empty batch pass through', () => {
  assert.equal(runHook(HOOK, { hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'ls' } }).status, 0);
  assert.equal(runHook(HOOK, 'not json').status, 0);
  assert.equal(runHook(HOOK, ask([])).status, 0);
  assert.equal(runHook(HOOK, { hook_event_name: 'PreToolUse', tool_name: 'AskUserQuestion', tool_input: {} }).status, 0);
});

test('the hook is wired in .claude/settings.json', () => {
  assert.equal(wiringProblem('PreToolUse', 'AskUserQuestion', 'node scripts/hooks/guard-question.mjs'), null);
});
