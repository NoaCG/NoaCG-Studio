// The citation gate catches a pointer INTO a contract that no longer lands: a rule id the store
// does not define, and a prose section of a contract that is now generated from the rule store.
// What is pinned: which tokens are read as rule ids at all (the ambiguous ones are skipped, not
// guessed at), that a generated contract refuses every section citation, and that a hand-written
// one accepts a quoted bullet as readily as a quoted heading.
import assert from 'node:assert/strict';
import test from 'node:test';

import { staleRuleIds, staleSections } from './check-contract-citations.mjs';

const STORE = {
  areas: new Set(['root', 'wizard', 'ai']),
  ids: new Set(['root/read-build-own-exit-code-never', 'wizard/start-every-detected-text-row-prefix']),
};

test('a backticked rule id that the store defines is not a failure', () => {
  const text = 'Read the exit code (`root/read-build-own-exit-code-never`), never a pipe\'s.';
  assert.deepEqual(staleRuleIds(text, STORE), []);
});

test('a rule id the store does not define fails, and names its line', () => {
  const text = ['first line', 'See `root/this-rule-was-reworded-away-entirely` for why.'].join('\n');
  const stale = staleRuleIds(text, STORE);
  assert.equal(stale.length, 1);
  assert.equal(stale[0].line, 2);
  assert.equal(stale[0].citation, 'root/this-rule-was-reworded-away-entirely');
});

test('tokens that are not rule ids are skipped rather than guessed at', () => {
  const text = [
    'The route `ai/generate` is an API path, not a rule.',
    'A file `src/model/wizard.ts` carries a slash and an extension.',
    'An unknown area `supabase/some-long-hyphenated-thing-here` is not a rule area.',
  ].join('\n');
  assert.deepEqual(staleRuleIds(text, STORE), []);
});

test('a GENERATED contract refuses every section citation, quoted or numbered', () => {
  const contracts = new Map([['AGENTS.md', { generated: true, text: 'compiled from contracts/rules' }]]);
  const text = [
    'See AGENTS.md "Verifying changes" for the gate.',
    'The version rule is root AGENTS.md non-negotiable 6.',
    'And AGENTS.md § 5 covers the rest.',
  ].join('\n');
  const stale = staleSections(text, contracts);
  assert.equal(stale.length, 3);
  assert.ok(stale.every((s) => /GENERATED/.test(s.why)));
  assert.deepEqual(stale.map((s) => s.line), [1, 2, 3]);
});

test('a hand-written contract accepts a quoted heading OR a quoted bullet lead-in', () => {
  const contracts = new Map([['e2e/AGENTS.md', {
    generated: false,
    text: '## gotchas when writing a spec - a suite that skips itself exits 0. npm run test:e2e:live',
  }]]);
  const text = [
    'See e2e/AGENTS.md "Gotchas when writing a spec".',
    'Because e2e/AGENTS.md, "A suite that skips itself exits 0".',
  ].join('\n');
  assert.deepEqual(staleSections(text, contracts), []);
});

test('a hand-written contract still fails a section it no longer says anything about', () => {
  const contracts = new Map([['e2e/AGENTS.md', { generated: false, text: '## gotchas when writing a spec' }]]);
  const stale = staleSections('See e2e/AGENTS.md "The Old Removed Heading".', contracts);
  assert.equal(stale.length, 1);
  assert.match(stale[0].why, /renamed or removed/);
});

test('a citation whose target is not a tracked contract is skipped, not failed', () => {
  // `wizard/AGENTS.md` in a comment is shorthand for src/components/wizard/AGENTS.md. The gate
  // judges what it can resolve and stands down elsewhere rather than inventing a failure.
  const contracts = new Map([['AGENTS.md', { generated: true, text: '' }]]);
  assert.deepEqual(staleSections('The panel opens itself (wizard/AGENTS.md "Some Section").', contracts), []);
});
