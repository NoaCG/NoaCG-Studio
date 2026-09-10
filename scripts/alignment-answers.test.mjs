// The alignment answers ledger: an unanswered question never blocks anything, an answered one is
// pending until the rulings file carries its id, and the block a session appends names that id -
// which is the whole join between what the owner said on Tuesday and what the repository records.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { alignmentState, main, mentionsId, parseAlignmentQuestions, rulingBlock } from './alignment-answers.mjs';

const question = (id, q, a = '') => `### ${id}\n**Question:** ${q}\n**Answer:** ${a}\n`;

/** A checkout with one weekly file and one rulings file, so the state can be read off disk. */
function checkout({ weekly = {}, rulings = '# Owner rulings\n' } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'align-'));
  mkdirSync(path.join(root, 'docs', 'handoffs'), { recursive: true });
  for (const [name, text] of Object.entries(weekly)) {
    writeFileSync(path.join(root, 'docs', 'handoffs', name), text);
  }
  writeFileSync(path.join(root, 'docs', 'OWNER_RULINGS.md'), rulings);
  return root;
}

test('an empty Answer line is an open question, a filled one is an answer', () => {
  const parsed = parseAlignmentQuestions(
    `## What needs you\n\n${question('ALIGN-2026-09-15-1', 'Still the top of NOW?', 'Yes.')}\n${question('ALIGN-2026-09-15-2', 'Move P6 up?')}`,
  );
  assert.equal(parsed.length, 2);
  assert.deepEqual(
    parsed.map((entry) => [entry.id, entry.answered]),
    [['ALIGN-2026-09-15-1', true], ['ALIGN-2026-09-15-2', false]],
  );
  assert.equal(parsed[0].answer, 'Yes.');
  assert.equal(parsed[1].answer, '');
});

test('a following heading closes a block, so an answer never bleeds into the next question', () => {
  const parsed = parseAlignmentQuestions(
    `${question('ALIGN-2026-09-15-1', 'One?')}\n## Feedback\n\n**Answer:** twelve arrived\n`,
  );
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].answered, false, 'the Feedback section must not answer the question above it');
});

test('text with no alignment headings parses to nothing rather than throwing', () => {
  assert.deepEqual(parseAlignmentQuestions('# A week\n\nNothing needs you this week.\n'), []);
  assert.deepEqual(parseAlignmentQuestions(undefined), []);
});

test('an answered question is pending until the rulings file carries its id', () => {
  const weekly = { '2026-09-15-orchestrator-week.local.md': question('ALIGN-2026-09-15-1', 'Still the top?', 'Yes.') };
  const before = alignmentState(checkout({ weekly }));
  assert.deepEqual(before.pending.map((entry) => entry.id), ['ALIGN-2026-09-15-1']);
  assert.deepEqual(before.recorded, []);

  const after = alignmentState(checkout({ weekly, rulings: '# Owner rulings\n\n## ALIGN-2026-09-15-1\n\n> Yes.\n' }));
  assert.deepEqual(after.pending, []);
  assert.deepEqual(after.recorded.map((entry) => entry.id), ['ALIGN-2026-09-15-1']);
});

test('an open question is never pending - his to answer, and nothing waits on it', () => {
  const state = alignmentState(checkout({
    weekly: { '2026-09-15-orchestrator-week.local.md': question('ALIGN-2026-09-15-1', 'Move P6 up?') },
  }));
  assert.deepEqual(state.pending, []);
  assert.deepEqual(state.open.map((entry) => entry.id), ['ALIGN-2026-09-15-1']);
});

test('every week is read for answers, newest first, and source names the newest week', () => {
  const state = alignmentState(checkout({
    weekly: {
      '2026-09-08-orchestrator-week.local.md': question('ALIGN-2026-09-08-1', 'Old one?', 'Old answer.'),
      '2026-09-15-orchestrator-week.local.md': question('ALIGN-2026-09-15-1', 'New one?', 'New answer.'),
    },
  }));
  assert.equal(state.source, 'docs/handoffs/2026-09-15-orchestrator-week.local.md');
  assert.deepEqual(
    state.pending.map((entry) => entry.id),
    ['ALIGN-2026-09-15-1', 'ALIGN-2026-09-08-1'],
    'an unrecorded ruling survives however many Tuesdays pass, newest first',
  );
});

test('a checkout with no weekly file is not a fault - CI never has one', () => {
  const state = alignmentState(checkout());
  assert.equal(state.source, null);
  assert.deepEqual(state.pending, []);
  assert.equal(main(['--check'], { root: checkout() }), 0);
});

test('--check fails only while an answer is unrecorded', () => {
  const weekly = { '2026-09-15-orchestrator-week.local.md': question('ALIGN-2026-09-15-1', 'Still the top?', 'Yes.') };
  assert.equal(main(['--check', '--json'], { root: checkout({ weekly }) }), 1);
  assert.equal(main(['--json'], { root: checkout({ weekly }) }), 0, 'without --check it reports and passes');
  assert.equal(
    main(['--check', '--json'], { root: checkout({ weekly, rulings: '## ALIGN-2026-09-15-1\n' }) }),
    0,
  );
});

test('the appendable block carries the id the plan check looks for', () => {
  const block = rulingBlock({ id: 'ALIGN-2026-09-15-1', question: 'Still the top?', answer: 'Yes.' });
  assert.match(block, /^## ALIGN-2026-09-15-1$/m);
  assert.match(block, /Still the top\?/);
  assert.match(block, /^> Yes\.$/m);
});

test('a heading that names its reason after the id still parses - a lost question is a lost ruling', () => {
  const parsed = parseAlignmentQuestions('### ALIGN-2026-09-15-1 - needs: alignment\n**Question:** Q?\n**Answer:** A.\n');
  assert.deepEqual(parsed.map((entry) => entry.id), ['ALIGN-2026-09-15-1']);
  assert.equal(parsed[0].answered, true);
});

test('a wrapped question and a wrapped answer are read whole - the dry run wrapped all three', () => {
  // Measured 2026-09-10, the first time a session ran the weekly procedure cold: every markdown
  // file in this repository wraps at about a hundred columns, so all three questions arrived
  // wrapped and each one parsed down to a fragment ending mid-clause.
  const [entry] = parseAlignmentQuestions(
    '### ALIGN-2026-09-10-1\n'
    + '**Question:** needs: alignment. Three things you asked for a fortnight ago have not been started at\n'
    + 'all, and none of them serves the 25th. Do they still matter?\n'
    + '**Answer:** Drop the video wrapper, it was an idea not a need. The assistant is the one I\n'
    + 'actually want - after the 25th, done properly.\n',
  );
  assert.equal(
    entry.question,
    'needs: alignment. Three things you asked for a fortnight ago have not been started at all, and none of them serves the 25th. Do they still matter?',
  );
  assert.equal(
    entry.answer,
    'Drop the video wrapper, it was an idea not a need. The assistant is the one I actually want - after the 25th, done properly.',
    'the rulings file is composed from this string, so a lost half is a lost ruling',
  );
});

test('an empty Answer stays open when the section prose follows a blank line', () => {
  // The dangerous neighbour of the fix above: joining continuation lines across a blank would
  // invent an answer he never gave, refuse every wave plan over it, and record it as a ruling.
  const parsed = parseAlignmentQuestions(
    '### ALIGN-2026-09-10-1\n**Question:** Does it still matter?\n**Answer:**\n\nNothing else starts this week.\n',
  );
  assert.equal(parsed[0].answered, false);
  assert.equal(parsed[0].answer, '');
});

test('an answer written on the line under **Answer:** is still his answer', () => {
  const parsed = parseAlignmentQuestions(
    '### ALIGN-2026-09-10-1\n**Question:** Does it still matter?\n**Answer:**\nYes, until the students have used it.\n',
  );
  assert.equal(parsed[0].answered, true);
  assert.equal(parsed[0].answer, 'Yes, until the students have used it.');
});

test('an answer from an older week stays pending - reading only the newest file would lose it', () => {
  const state = alignmentState(checkout({
    weekly: {
      '2026-09-08-orchestrator-week.local.md': question('ALIGN-2026-09-08-1', 'Asked a week ago?', 'Answered a week ago.'),
      '2026-09-15-orchestrator-week.local.md': question('ALIGN-2026-09-15-1', 'Asked today?'),
    },
  }));
  assert.deepEqual(state.pending.map((entry) => entry.id), ['ALIGN-2026-09-08-1']);
  assert.equal(state.pending[0].source, 'docs/handoffs/2026-09-08-orchestrator-week.local.md');
  assert.deepEqual(state.open.map((entry) => entry.id), ['ALIGN-2026-09-15-1'], 'only this week is still open');
});

test('the weekly file is read from the primary checkout while the rulings come from this one', () => {
  // The failure this pins, measured 2026-09-08: the weekly session writes an absolute path into
  // the primary checkout and .gitignore keeps the file out of git, so every linked worktree - and
  // every orchestrator session, which is pinned to .claude/worktrees/orchestrator - read an empty
  // folder and reported "no weekly file". The refusal passed every plan for a week.
  const primary = mkdtempSync(path.join(tmpdir(), 'align-primary-'));
  const admin = path.join(primary, '.git', 'worktrees', 'w');
  mkdirSync(admin, { recursive: true });
  // A linked worktree is a pointer file PLUS a `commondir` in the directory it points at, which is
  // what tells it apart from a checkout whose git directory merely lives elsewhere.
  writeFileSync(path.join(admin, 'commondir'), '../..\n');
  mkdirSync(path.join(primary, 'docs', 'handoffs'), { recursive: true });
  writeFileSync(
    path.join(primary, 'docs', 'handoffs', '2026-09-15-orchestrator-week.local.md'),
    question('ALIGN-2026-09-15-1', 'Still the top?', 'Yes.'),
  );
  writeFileSync(path.join(primary, 'docs', 'OWNER_RULINGS.md'), '# Owner rulings\n');

  const worktree = path.join(primary, '.claude', 'worktrees', 'w');
  mkdirSync(path.join(worktree, 'docs', 'handoffs'), { recursive: true });
  writeFileSync(path.join(worktree, '.git'), `gitdir: ${admin}\n`);
  writeFileSync(path.join(worktree, 'docs', 'OWNER_RULINGS.md'), '# Owner rulings\n');

  const before = alignmentState(worktree);
  assert.equal(before.source, 'docs/handoffs/2026-09-15-orchestrator-week.local.md');
  assert.deepEqual(before.pending.map((entry) => entry.id), ['ALIGN-2026-09-15-1']);
  assert.equal(before.dir, path.join(primary, 'docs', 'handoffs'), 'the directory it read is part of the answer');

  // TWO ROOTS, on purpose. The branch that records a ruling has it in ITS working tree and nowhere
  // else, so the rulings side must read this checkout - otherwise the refusal never clears until
  // the branch lands, which is the moment it is no longer needed.
  writeFileSync(path.join(worktree, 'docs', 'OWNER_RULINGS.md'), '# Owner rulings\n\n## ALIGN-2026-09-15-1\n\n> Yes.\n');
  const after = alignmentState(worktree);
  assert.deepEqual(after.pending, []);
  assert.deepEqual(after.recorded.map((entry) => entry.id), ['ALIGN-2026-09-15-1']);
});

test('an id is matched whole - ...-10 in the rulings does not record ...-1', () => {
  assert.equal(mentionsId('## ALIGN-2026-09-15-10\n', 'ALIGN-2026-09-15-1'), false);
  assert.equal(mentionsId('## ALIGN-2026-09-15-1\n', 'ALIGN-2026-09-15-1'), true);
  const state = alignmentState(checkout({
    weekly: { '2026-09-15-orchestrator-week.local.md': question('ALIGN-2026-09-15-1', 'Still the top?', 'Yes.') },
    rulings: '# Owner rulings\n\n## ALIGN-2026-09-15-10\n\n> About a different question entirely.\n',
  }));
  assert.deepEqual(
    state.pending.map((entry) => entry.id),
    ['ALIGN-2026-09-15-1'],
    'a longer id starting with this one must not mark it recorded, which would lose the ruling forever',
  );
});

test('a carried-forward question takes the answered copy, whichever week holds it', () => {
  // The procedure carries a question forward once by writing its block again under the same id, so
  // the answer can land in the older file - the one open in front of whoever heard him say it.
  const state = alignmentState(checkout({
    weekly: {
      '2026-09-08-orchestrator-week.local.md': question('ALIGN-2026-09-08-1', 'Still the top?', 'Yes, until the students have used it.'),
      '2026-09-15-orchestrator-week.local.md': question('ALIGN-2026-09-08-1', 'Still the top?'),
    },
  }));
  assert.deepEqual(state.open, [], 'the newer empty copy must not hide the answer in the older one');
  assert.deepEqual(state.pending.map((entry) => entry.id), ['ALIGN-2026-09-08-1']);
  assert.equal(state.pending[0].answer, 'Yes, until the students have used it.');
  assert.equal(state.pending[0].source, 'docs/handoffs/2026-09-08-orchestrator-week.local.md');
});

test('an unanswered question from an older week is dropped, per the carry-forward-once rule', () => {
  const state = alignmentState(checkout({
    weekly: {
      '2026-09-08-orchestrator-week.local.md': question('ALIGN-2026-09-08-1', 'Never answered?'),
      '2026-09-15-orchestrator-week.local.md': question('ALIGN-2026-09-15-1', 'This week?'),
    },
  }));
  assert.deepEqual(state.open.map((entry) => entry.id), ['ALIGN-2026-09-15-1']);
  assert.deepEqual(state.pending, []);
});
