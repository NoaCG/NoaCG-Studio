// The retired-names gate fires on a paragraph that INSTRUCTS a retired mechanism and stays quiet on
// one that names it as history. What is pinned: the paragraph grain, the history words, the line
// number of the match, and that a malformed list is refused rather than read as "nothing retired".
import assert from 'node:assert/strict';
import test from 'node:test';

import { findRetired, HISTORY_WORDS, loadRetired, paragraphs } from './check-retired-names.mjs';

const list = JSON.stringify({
  v: 1,
  retired: [
    { name: 'safe-merge', pattern: 'safe-merge(?!-preflight)', since: '2026-09-06', replacement: 'queue-merge', why: 'the ruleset refuses the push' },
    { name: 'the lander', pattern: 'auto-merge\\.mjs', since: '2026-09-06', replacement: 'the merge queue', why: 'runs on GitHub now' },
  ],
});

test('a paragraph instructing a retired mechanism is a finding on the line of the name', () => {
  const text = [
    '# Landing',
    '',
    'Two things, never blended: what landed, and what is queued.',
    '',
    'When the queue refuses, read the reason and then',
    'run the safe-merge workflow in the branch worktree.',
    '',
    'The preflight is `scripts/safe-merge-preflight.mjs`, which still exists.',
  ].join('\n');
  const findings = findRetired(text, loadRetired(list));
  assert.equal(findings.length, 1);
  assert.equal(findings[0].line, 6);
  assert.equal(findings[0].name, 'safe-merge');
  assert.equal(findings[0].replacement, 'queue-merge');
});

test('a paragraph that says the mechanism is history passes', () => {
  const retired = loadRetired(list);
  for (const history of [
    "Until 2026-09-06 the mechanical path ran as `auto-merge.mjs` on the owner's machine.",
    '`auto-merge.mjs` is retired; the queue lands every branch.',
    'Landing no longer goes through the safe-merge workflow.',
    'Never drive `safe-merge` by hand.',
    'The lander used to be `auto-merge.mjs`.',
  ]) {
    assert.deepEqual(findRetired(history, retired), [], history);
    assert.ok(HISTORY_WORDS.test(history));
  }
});

test('the grain is the paragraph, so a wrapped sentence keeps its history word', () => {
  const text = 'The path that landed a branch\nwas `auto-merge.mjs`, which is\nretired.';
  assert.deepEqual(findRetired(text, loadRetired(list)), []);
  assert.equal(paragraphs('a\n\n\nb\nc\n').length, 2);
  assert.equal(paragraphs('a\n\n\nb\nc\n')[1].line, 4);
});

test('a malformed list is refused, never read as nothing retired', () => {
  assert.throws(() => loadRetired(JSON.stringify({ retired: [{ name: 'x' }] })), /`pattern` is required/);
  assert.throws(() => loadRetired(JSON.stringify({ retired: [{ name: 'x', pattern: '(', since: '2026-09-06', replacement: 'y', why: 'z' }] })), /does not compile/);
  assert.throws(() => loadRetired(JSON.stringify({ retired: [{ name: 'x', pattern: 'x', since: 'yesterday', replacement: 'y', why: 'z' }] })), /YYYY-MM-DD/);
  assert.throws(() => loadRetired(JSON.stringify({ retired: 'x' })), /must be an array/);
});
