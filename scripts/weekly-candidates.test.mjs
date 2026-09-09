// The weekly review's candidate rows: they are found in the PRIMARY checkout from any worktree,
// they carry an id derived from the file rather than one a session has to write, and a plan that
// turns one down with a reason passes while a plan that says nothing about it does not. The last
// pair is the whole rule - the 2026-09-08 plans were silent, and silence read as fine.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  WINDOW_DAYS,
  candidateProblems,
  parseCandidateRows,
  parseCandidateSection,
  planDate,
  summaryLine,
  weeklyCandidates,
} from './weekly-candidates.mjs';

/** The shape the 2026-09-08 review actually wrote: a bold title, then bulleted bold keys. */
const REAL = `# Orchestrator week - 2026-09-01 .. 2026-09-08

## 5. Improve

Three candidate rows for the next \`/orchestrator\`.

**Row: the wave plan outlives its worktree**

- **GOAL** - a wave plan is written where it survives.
- **WHY** - this week's page reports 0 waves while nine rows landed.
- **TOUCHES** - \`scripts/orchestrator-week.mjs\`
- **POOL** - opus

**Row: one walk covers a route, not an item**

- **GOAL** - \`/walk\` groups the queue by the route an item opens.
- **WHY** - 90 items filed this week against a drain of one at a time.
- **POOL** - opus
`;

/** A primary checkout holding one weekly file, plus a linked worktree pointing at its git dir. */
function machine(weekly = { '2026-09-08-orchestrator-week.local.md': REAL }) {
  const primary = mkdtempSync(path.join(tmpdir(), 'weekly-'));
  mkdirSync(path.join(primary, '.git', 'worktrees', 'w'), { recursive: true });
  mkdirSync(path.join(primary, 'docs', 'handoffs'), { recursive: true });
  for (const [name, text] of Object.entries(weekly)) {
    writeFileSync(path.join(primary, 'docs', 'handoffs', name), text);
  }
  const worktree = path.join(primary, '.claude', 'worktrees', 'w');
  mkdirSync(path.join(worktree, 'docs', 'handoffs'), { recursive: true });
  writeFileSync(path.join(worktree, '.git'), `gitdir: ${path.join(primary, '.git', 'worktrees', 'w')}\n`);
  return { primary, worktree };
}

test('a candidate row is identified by its week and its position, and keeps its written title', () => {
  const rows = parseCandidateRows(REAL, '2026-09-08');
  assert.deepEqual(rows.map((row) => row.id), ['WEEK-2026-09-08-1', 'WEEK-2026-09-08-2']);
  assert.deepEqual(rows.map((row) => row.title), [
    'the wave plan outlives its worktree',
    'one walk covers a route, not an item',
  ]);
  assert.match(rows[0].goal, /^a wave plan is written where it survives/);
});

test('a row with no title line is still a row, named by its goal', () => {
  const rows = parseCandidateRows('GOAL: re-probe the capabilities on a clock\nPOOL: sonnet\n', '2026-09-08');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].title, 're-probe the capabilities on a clock');
});

test('the bold markers a session writes never end up inside the goal text', () => {
  const rows = parseCandidateRows('- **GOAL:** re-probe on a clock\n- **GOAL** - and again**\n', '2026-09-08');
  assert.deepEqual(rows.map((row) => row.goal), ['re-probe on a clock', 'and again']);
});

test('text with no GOAL line proposes nothing rather than throwing', () => {
  assert.deepEqual(parseCandidateRows('# A week\n\nNothing to improve.\n', '2026-09-08'), []);
  assert.deepEqual(parseCandidateRows(undefined, '2026-09-08'), []);
});

test('the weekly file is read from the primary checkout, from inside a linked worktree', () => {
  const { primary, worktree } = machine();
  const fromWorktree = weeklyCandidates(worktree, '2026-09-09');
  assert.equal(fromWorktree.source, '2026-09-08-orchestrator-week.local.md');
  assert.equal(fromWorktree.owed.length, 2, 'a linked worktree owes the same rows the primary checkout does');
  assert.equal(fromWorktree.dir, path.join(primary, 'docs', 'handoffs'));
  // And the same answer from the primary checkout itself, so the resolution added nothing but reach.
  assert.deepEqual(weeklyCandidates(primary, '2026-09-09').owed.map((row) => row.id), fromWorktree.owed.map((row) => row.id));
});

test('the window is the week after the review, and every verdict outside it says why', () => {
  const { worktree } = machine();
  assert.equal(weeklyCandidates(worktree, '2026-09-15').owed.length, 2, `${WINDOW_DAYS} days after is still owed`);

  const stale = weeklyCandidates(worktree, '2026-09-20');
  assert.deepEqual(stale.owed, []);
  assert.match(stale.reason, /past the 7-day window/);

  const earlier = weeklyCandidates(worktree, '2026-09-01');
  assert.deepEqual(earlier.owed, []);
  assert.match(earlier.reason, /written after this plan/);
});

test('an empty handoff folder owes nothing and names the folder it read', () => {
  const { primary, worktree } = machine({});
  const state = weeklyCandidates(worktree, '2026-09-09');
  assert.deepEqual(state.owed, []);
  assert.equal(state.source, null);
  // The directory in the sentence is the point: "nothing is owed" and "I read the wrong folder"
  // printed the same line for a week, which is how the miss survived.
  assert.ok(summaryLine(state).includes(path.join(primary, 'docs', 'handoffs')));
});

test('a plan section classifies rows in all three ways, and a heading closes it', () => {
  const classified = parseCandidateSection(`## Weekly review

- planned: WEEK-2026-09-08-1 -> row F
- deferred: WEEK-2026-09-08-2 - the route grouping has to land first
- rejected: \`WEEK-2026-09-08-3\` - landed on 2026-09-09 as claude/x-capability-reprobe

## Handoffs

- planned: WEEK-2026-09-08-4 -> row Z
`);
  assert.deepEqual([...classified.keys()], ['WEEK-2026-09-08-1', 'WEEK-2026-09-08-2', 'WEEK-2026-09-08-3']);
  assert.equal(classified.get('WEEK-2026-09-08-1').cls, 'planned');
  assert.equal(classified.get('WEEK-2026-09-08-2').trace, 'the route grouping has to land first');
});

test('SILENCE FAILS and a refusal with a reason PASSES - the distinction the rule exists for', () => {
  const owed = parseCandidateRows(REAL, '2026-09-08');
  const letters = new Set(['F']);

  const silent = candidateProblems(owed, parseCandidateSection('## Wave table\n\n| L | goal |\n'), letters);
  assert.equal(silent.length, 2);
  assert.match(silent[0], /WEEK-2026-09-08-1 \("the wave plan outlives its worktree"\) is not classified/);

  const answered = parseCandidateSection(`## Weekly review

- planned: WEEK-2026-09-08-1 -> row F
- rejected: WEEK-2026-09-08-2 - the walk rewrite is one route grouping away and this wave has no slot
`);
  assert.deepEqual(candidateProblems(owed, answered, letters), []);
});

test('a refusal with no reason behind it is not a refusal', () => {
  const owed = parseCandidateRows(REAL, '2026-09-08');
  const problems = candidateProblems(owed, parseCandidateSection('## Weekly review\n\n- rejected: WEEK-2026-09-08-1\n- deferred: WEEK-2026-09-08-2\n'), null);
  assert.equal(problems.length, 2);
  assert.match(problems[0], /rejected with no reason/);
  assert.match(problems[1], /deferred with no reason/);
});

test('a row planned into a letter the wave table does not have is caught', () => {
  const owed = parseCandidateRows(REAL, '2026-09-08').slice(0, 1);
  const named = parseCandidateSection('## Weekly review\n\n- planned: WEEK-2026-09-08-1 -> row Q\n');
  assert.match(candidateProblems(owed, named, new Set(['F']))[0], /planned as row Q, and the wave table has no row Q/);
  assert.deepEqual(candidateProblems(owed, named, new Set(['Q'])), []);

  const nameless = parseCandidateSection('## Weekly review\n\n- planned: WEEK-2026-09-08-1 - will do it\n');
  assert.match(candidateProblems(owed, nameless, new Set(['F']))[0], /planned but names no row/);

  // A lowercase letter named the row; refusing over the case would teach nothing.
  const lower = parseCandidateSection('## Weekly review\n\n- planned: WEEK-2026-09-08-1 -> row f\n');
  assert.deepEqual(candidateProblems(owed, lower, new Set(['F'])), []);
});

test('a plan file name gives the date the window is measured from', () => {
  assert.equal(planDate('/store/2026-09-09-day-wave-plan.local.md'), '2026-09-09');
  assert.equal(planDate('notes.md'), null);
  assert.equal(planDate(null), null);
});
