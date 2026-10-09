// The question guard, verified the way docs/MISTAKE_TRIGGERS.md asks for: real event JSON piped
// into the REAL hook file, reading the exit code and the message. What is pinned: an untagged
// question is refused with the three-kinds rule; a tagged question with a recommended option
// passes; a tagged question without a recommendation is refused; more than one question per call
// is refused; a wave-row subagent may not ask at all; an open night wave's own sessions (its
// orchestrator and its rows) may not ask, while every other session and a day wave may; other tools and malformed input pass through; and the hook is wired.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { runHook, wiringProblem } from './test-lib.mjs';

const HOOK = new URL('./guard-question.mjs', import.meta.url);

/** A throwaway job store holding the given wave plans, so the machine's real waves never leak in. */
function store(plans = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'noacg-guard-question-'));
  mkdirSync(path.join(dir, 'wave-plans'));
  for (const [name, text] of Object.entries(plans)) writeFileSync(path.join(dir, 'wave-plans', name), text, 'utf8');
  return dir;
}
const EMPTY = store();
const run = (event, dir = EMPTY) => runHook(HOOK, event, { NOACG_JOBS_DIR: dir });
const plan = (kind, ends, sessions = []) =>
  `# ${kind} wave\n\nWindow starts: ${new Date().toISOString()}\nWindow ends: ${new Date(ends).toISOString()}\n${sessions.map((id) => `Session: ${id}\n`).join('')}`;

const ask = (questions, extra = {}) => ({ hook_event_name: 'PreToolUse', tool_name: 'AskUserQuestion', cwd: process.cwd(), tool_input: { questions }, ...extra });
const q = (question, header = 'Choice', first = 'a (Recommended)') => ({ question, header, options: [{ label: first, description: 'a' }, { label: 'b', description: 'b' }], multiSelect: false });

test('an untagged question is refused with the three-kinds rule and the question itself', () => {
  const { status, message } = run(ask([q('Should the queue land a caution branch first?')]));
  assert.equal(status, 2);
  assert.match(message, /STOP - is this the owner's question/);
  assert.match(message, /\? Should the queue land a caution branch first\?/);
  assert.match(message, /Decide operational matters yourself/);
  assert.match(message, /needs: decision/);
});

test('a question tagged needs: decision with a recommended answer passes', () => {
  for (const text of [
    'needs: decision - should the ticker speed field be per item or per strip?',
    'Which account should the SMTP sender use? (needs: decision)',
    'Needs: Decision - is the scoreboard still the second graphic?',
  ]) {
    assert.equal(run(ask([q(text)])).status, 0, text);
  }
  assert.equal(run(ask([q('Which?', 'needs: decision')])).status, 0, 'the tag may sit in the header');
});

test('the retired reason tags no longer pass on their own', () => {
  for (const text of ['needs: money - buy the Pro tier?', 'needs: account - which sender?', 'needs: harness - allow it?']) {
    assert.equal(run(ask([q(text)])).status, 2, text);
  }
});

test('a tagged question without a recommended answer is refused', () => {
  const { status, message } = run(ask([q('needs: decision - which layout?', 'Layout', 'a')]));
  assert.equal(status, 2);
  assert.match(message, /no recommended answer/);
});

test('more than one question per call is refused, even when every one is tagged', () => {
  const { status, message } = run(ask([q('needs: decision - renew the domain?'), q('needs: decision - which colour?')]));
  assert.equal(status, 2);
  assert.match(message, /2 questions in one call/);
});

test('a wave-row subagent may not ask at all', () => {
  const { status, message } = run(ask([q('needs: decision - which layout?')], { agent_type: 'wave-row-deciding' }));
  assert.equal(status, 2);
  assert.match(message, /a wave row asks nothing/);
});

const NIGHT = '2026-10-09-night-wave-plan.local.md';
const tagged = (extra) => ask([q('needs: decision - renew the domain?')], extra);

test('a night wave refuses its own sessions, the orchestrator and its rows, even a tagged question', () => {
  const night = store({ [NIGHT]: plan('Night', Date.now() + 3_600_000, ['orch-1']) });
  const orchestrator = run(tagged({ session_id: 'orch-1' }), night);
  assert.equal(orchestrator.status, 2);
  assert.match(orchestrator.message, /this session runs a night wave/);
  assert.match(orchestrator.message, /DECIDED:/);
  assert.match(orchestrator.message, /2026-10-09-night-wave-plan\.local\.md/);
  // A row the orchestrator launched runs under its session id, whatever agent type it was given.
  assert.equal(run(tagged({ session_id: 'orch-1', agent_id: 'a1', agent_type: 'general-purpose' }), night).status, 2, 'a row');

  const resumed = store({ [NIGHT]: plan('Night', Date.now() + 3_600_000, ['orch-1', 'orch-2']) });
  assert.equal(run(tagged({ session_id: 'orch-2' }), resumed).status, 2, 'the session that resumed it after a restart');

  const over = store({ [NIGHT]: plan('Night', Date.now() - 60_000, ['orch-1']) });
  assert.equal(run(tagged({ session_id: 'orch-1' }), over).status, 0, 'a night wave past its window is over');
  const reported = store({ [NIGHT]: `${plan('Night', Date.now() + 3_600_000, ['orch-1'])}\n## Report\n\nDone.\n` });
  assert.equal(run(tagged({ session_id: 'orch-1' }), reported).status, 0, 'a reported night wave is over');
});

test('every other session still asks the owner while a night wave runs', () => {
  const night = store({ [NIGHT]: plan('Night', Date.now() + 3_600_000, ['orch-1']) });
  assert.equal(run(tagged({ session_id: 'owner-2' }), night).status, 0, 'an unrelated session');
  assert.equal(run(tagged({}), night).status, 0, 'an event without a session id');
  const unrecorded = store({ [NIGHT]: plan('Night', Date.now() + 3_600_000) });
  assert.equal(run(tagged({ session_id: 'orch-1' }), unrecorded).status, 0, 'a wave that recorded no session refuses nobody');
});

test('a day wave may ask the owner a tagged question', () => {
  const day = store({ '2026-10-09-day-wave-plan.local.md': plan('Day', Date.now() + 3_600_000) });
  assert.equal(run(ask([q('needs: decision - renew the domain?')]), day).status, 0);
  assert.equal(run(ask([q('Should the queue land a caution branch first?')]), day).status, 2, 'the tag rule still holds');
});

test('other tools, malformed input and an empty batch pass through', () => {
  assert.equal(run({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'ls' } }).status, 0);
  assert.equal(run('not json').status, 0);
  assert.equal(run(ask([])).status, 0);
  assert.equal(run({ hook_event_name: 'PreToolUse', tool_name: 'AskUserQuestion', tool_input: {} }).status, 0);
});

test('the hook is wired in .claude/settings.json', () => {
  assert.equal(wiringProblem('PreToolUse', 'AskUserQuestion', 'node scripts/hooks/guard-question.mjs'), null);
});
