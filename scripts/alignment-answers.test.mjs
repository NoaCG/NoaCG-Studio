// The alignment answers ledger: an unanswered question never blocks anything, an answered one is
// pending until the rulings file carries its id, and the block a session appends names that id -
// which is the whole join between what the owner said on Tuesday and what the repository records.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { alignmentState, main, parseAlignmentQuestions, rulingBlock } from './alignment-answers.mjs';

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

test('only the newest weekly file speaks, so last week never reopens a settled question', () => {
  const state = alignmentState(checkout({
    weekly: {
      '2026-09-08-orchestrator-week.local.md': question('ALIGN-2026-09-08-1', 'Old one?', 'Old answer.'),
      '2026-09-15-orchestrator-week.local.md': question('ALIGN-2026-09-15-1', 'New one?', 'New answer.'),
    },
  }));
  assert.equal(state.source, 'docs/handoffs/2026-09-15-orchestrator-week.local.md');
  assert.deepEqual(state.pending.map((entry) => entry.id), ['ALIGN-2026-09-15-1']);
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
