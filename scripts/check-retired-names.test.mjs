// The retired-names gate fires on a sentence that INSTRUCTS a retired mechanism and stays quiet on
// one that names it as history. What is pinned: the sentence grain inside a wrapped paragraph, the
// history words, the line number of the match, the file set, and that a malformed list is refused
// rather than read as "nothing retired".
import assert from 'node:assert/strict';
import test from 'node:test';

import { findRetired, HISTORY_WORDS, isInstructionFile, loadRetired, paragraphs, sentenceAround } from './check-retired-names.mjs';

const list = JSON.stringify({
  v: 1,
  retired: [
    { name: 'safe-merge', pattern: 'safe-merge(?!-preflight)', since: '2026-09-06', replacement: 'queue-merge', why: 'the ruleset refuses the push' },
    { name: 'the lander', pattern: 'auto-merge\\.mjs', since: '2026-09-06', replacement: 'the merge queue', why: 'runs on GitHub now' },
  ],
});

test('a sentence instructing a retired mechanism is a finding on the line of the name, carrying the why', () => {
  const text = [
    '# Landing',
    '',
    'Two things, never blended: what landed, and what is queued.',
    '',
    'When the queue refuses, read the reason and then',
    'run the safe-merge workflow in the branch worktree.',
    '',
    // A pattern may carve a name out with a lookahead. Nothing in `contracts/retired.json` does
    // since the preflight was deleted, so the support is pinned here rather than by a live entry.
    'The preflight is `scripts/safe-merge-preflight.mjs`, and this line must stay quiet.',
  ].join('\n');
  const findings = findRetired(text, loadRetired(list));
  assert.equal(findings.length, 1);
  assert.equal(findings[0].line, 6);
  assert.equal(findings[0].name, 'safe-merge');
  assert.equal(findings[0].replacement, 'queue-merge');
  assert.equal(findings[0].why, 'the ruleset refuses the push');
});

test('a sentence that says the mechanism is history passes', () => {
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

test('the grain is the sentence: a wrapped sentence keeps its history word, an unrelated "never" beside it hides nothing', () => {
  const retired = loadRetired(list);
  const wrapped = 'The path that landed a branch\nwas `auto-merge.mjs`, which is\nretired.';
  assert.deepEqual(findRetired(wrapped, retired), []);
  const masked = 'Never invent work to fill a wave. Then run `auto-merge.mjs`\nfor the branch. Nothing else.';
  const findings = findRetired(masked, retired);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].line, 1);
  assert.equal(sentenceAround(masked, masked.indexOf('auto-merge')), 'Then run `auto-merge.mjs`\nfor the branch.');
  // Two mentions in one sentence are one finding; a second sentence is a second finding.
  const twice = 'Run `auto-merge.mjs` and read what `auto-merge.mjs` says. Then run `auto-merge.mjs` again.';
  assert.equal(findRetired(twice, retired).length, 2);
  assert.equal(paragraphs('a\n\n\nb\nc\n').length, 2);
  assert.equal(paragraphs('a\n\n\nb\nc\n')[1].line, 4);
});

test('the instruction surface is the loaded and invoked files, never the evidence', () => {
  for (const file of ['AGENTS.md', 'src/blocks/AGENTS.md', 'supabase/CLAUDE.md', '.agent-workflows/queue-merge.md',
    '.agent-workflows/orchestrator/night.md', '.claude/rules/everywhere.md', '.claude/agents/wave-row.md',
    '.claude/commands/check.md', '.agents/skills/check/SKILL.md', 'contracts/rules/root/x.md', 'contracts/index.md']) {
    assert.ok(isInstructionFile(file), file);
  }
  for (const file of ['contracts/records/root/2026-09-06-x.md', '.agent-workflows/orchestrator/incidents.md',
    'docs/BRANCHING_AND_LANDING.md', 'scripts/jobs.mjs', '.agents/skills/check/agents/openai.yaml']) {
    assert.ok(!isInstructionFile(file), file);
  }
});

test('a malformed list is refused, never read as nothing retired', () => {
  assert.throws(() => loadRetired(JSON.stringify({ retired: [{ name: 'x' }] })), /`pattern` is required/);
  assert.throws(() => loadRetired(JSON.stringify({ retired: [{ name: 'x', pattern: '(', since: '2026-09-06', replacement: 'y', why: 'z' }] })), /does not compile/);
  assert.throws(() => loadRetired(JSON.stringify({ retired: [{ name: 'x', pattern: 'x', since: 'yesterday', replacement: 'y', why: 'z' }] })), /YYYY-MM-DD/);
  assert.throws(() => loadRetired(JSON.stringify({ retired: 'x' })), /must be an array/);
});
