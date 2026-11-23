// guards: src/model/questions.ts
// guards: src/app/router.ts
//
// THE QUESTION LIST (docs/work-specs/interaction/spec.md AC-1, AC-2; the Rules R8, R10, R11, R17 in
// its phase 1 notes), in Node over the pure list model. Pinned: questions are added, edited,
// reordered, duplicated and deleted without touching the list they came from; a duplicate gets a
// new id right after the original; a live or answered question keeps its words, and no edit
// changes a type; a newer build's question type is kept whole and read-only; and the Interaction
// view keeps its persisted key, `audience`, so a saved link or tab opens the same view.

import assert from 'node:assert/strict';
import test from 'node:test';

const q = await import('../src/model/questions.ts');
const { parseRoute, routeHash } = await import('../src/app/router.ts');
const { LOCAL_INBOX_KEY } = await import('../src/audience/localAudience.ts');

const made = (id, type, text, options) => {
  const out = q.makeQuestion(id, type, text, options);
  assert.ok('question' in out, out.error);
  return out.question;
};

test('Open and Multiple choice questions are made with their caps, and refused without their words', () => {
  assert.deepEqual(made('a', 'open', '  Ask the guest  '), { id: 'a', type: 'open', text: 'Ask the guest' });
  assert.deepEqual(made('b', 'choice', 'Who wins?', [' Home ', '', 'Away']), { id: 'b', type: 'choice', text: 'Who wins?', options: ['Home', 'Away'] });
  assert.equal(q.makeQuestion('c', 'open', '   ').error, 'Write the question first.');
  assert.equal(q.makeQuestion('d', 'choice', 'Only one?', ['Yes']).error, 'A vote needs two options at least.');
  assert.ok('error' in q.makeQuestion('not ok!', 'open', 'Bad id'));
  const long = made('e', 'choice', 'x'.repeat(300), Array.from({ length: 12 }, (_, i) => `${i}`.repeat(80)));
  assert.equal(long.text.length, q.QUESTION_LIMITS.text);
  assert.equal(long.options.length, q.QUESTION_LIMITS.maxOptions);
  assert.ok(long.options.every((o) => o.length === q.QUESTION_LIMITS.option));
});

test('add, edit, reorder, duplicate and delete return new lists and leave the old one alone', () => {
  const one = made('q1', 'open', 'First');
  const two = made('q2', 'choice', 'Second', ['A', 'B']);
  const three = made('q3', 'open', 'Third');
  let list = q.addQuestion(q.addQuestion(q.addQuestion([], one), two), three);
  const before = JSON.stringify(list);
  assert.deepEqual(list.map((x) => x.id), ['q1', 'q2', 'q3']);
  assert.deepEqual(q.addQuestion(list, one).map((x) => x.id), ['q1', 'q2', 'q3'], 'an id is in the list once');

  const edited = q.editQuestion(list, 'q2', { text: 'Second, reworded', options: ['A', 'B', 'C'] }, false);
  assert.deepEqual(edited.list[1], { id: 'q2', type: 'choice', text: 'Second, reworded', options: ['A', 'B', 'C'] });
  assert.equal(JSON.stringify(list), before, 'the edit made a new list');

  assert.deepEqual(q.moveQuestion(list, 'q3', 0).map((x) => x.id), ['q3', 'q1', 'q2']);
  assert.deepEqual(q.moveQuestion(list, 'q1', 99).map((x) => x.id), ['q2', 'q3', 'q1'], 'moves clamp');
  assert.deepEqual(q.moveQuestion(list, 'q1', -1).map((x) => x.id), ['q1', 'q2', 'q3']);

  const dup = q.duplicateQuestion(list, 'q2', 'q2-copy');
  assert.deepEqual(dup.map((x) => x.id), ['q1', 'q2', 'q2-copy', 'q3'], 'the copy sits right after its original');
  assert.deepEqual({ ...dup[2], id: 'q2' }, list[1], 'same words and type');
  assert.notEqual(dup[2].options, list[1].options, 'its options are its own');
  assert.deepEqual(q.duplicateQuestion(list, 'q2', 'q1').map((x) => x.id), ['q1', 'q2', 'q3'], 'never under an id in use');

  list = q.removeQuestion(list, 'q2');
  assert.deepEqual(list.map((x) => x.id), ['q1', 'q3']);
});

test('a live or answered question keeps its words, and no edit changes a type (R8)', () => {
  const vote = made('v', 'choice', 'Which?', ['A', 'B']);
  assert.equal(q.questionLocked(vote, { live: true, answers: 0 }), true, 'locked while live, even with no answers');
  assert.equal(q.questionLocked(vote, { live: false, answers: 1 }), true, 'locked once it has answers');
  assert.equal(q.questionLocked(vote, { live: false, answers: 0 }), false);
  const refused = q.editQuestion([vote], 'v', { text: 'Which now?' }, true);
  assert.match(refused.error, /Duplicate it/);
  // There is no way to ask for a type: the edit keeps the original's.
  const kept = q.editQuestion([vote], 'v', { text: 'Which now?', type: 'open' }, false);
  assert.equal(kept.list[0].type, 'choice');
});

test('a stored list is read safely: damaged entries drop, a newer type is kept whole and read-only', () => {
  const stored = [
    { id: 'ok', type: 'open', text: 'Fine' },
    { id: 'ok', type: 'open', text: 'Duplicate id' },
    { type: 'open', text: 'No id' },
    // Word became a known type in phase 6, so the newer type here is one no build has yet.
    { id: 'w', type: 'rating', text: 'Rate it', scale: 5 },
    { id: 'c', type: 'choice', text: 'Vote', options: ['A', 3, 'B'] },
    null,
  ];
  const read = q.readQuestions(stored);
  assert.deepEqual(read.map((x) => x.id), ['ok', 'w', 'c']);
  assert.deepEqual(read[1], { id: 'w', type: 'rating', text: 'Rate it', scale: 5 }, 'a newer build keeps what it wrote');
  assert.deepEqual(read[2].options, ['A', 'B']);
  assert.equal(q.questionLocked(read[1], { live: false, answers: 0 }), true);
  assert.ok('error' in q.editQuestion(read, 'w', { text: 'Changed' }, false));
  assert.deepEqual(q.readQuestions(undefined), []);
  // An additive field a newer build put on a known type survives reading and an edit.
  const later = q.readQuestions([{ id: 'x', type: 'open', text: 'Kept', resultTarget: 'g1' }]);
  assert.equal(later[0].resultTarget, 'g1');
  assert.equal(q.editQuestion(later, 'x', { text: 'Edited' }, false).list[0].resultTarget, 'g1');
});

test('the Interaction view keeps its persisted key and its inbox key (AC-1, R17)', () => {
  // The view is called Interaction on screen; its route, saved in links and open tabs, is still
  // `audience`, and the kept inbox is still under its old storage key.
  assert.deepEqual(parseRoute('#/production/p1/audience'), { view: 'production', id: 'p1', sub: 'audience' });
  assert.equal(routeHash({ view: 'production', id: 'p1', sub: 'audience' }), '#/production/p1/audience');
  assert.deepEqual(parseRoute('#/production/p1/interaction'), { view: 'production', id: 'p1' }, 'no second key');
  assert.equal(LOCAL_INBOX_KEY, 'spx-gfx-audience-inbox');
});

test('a vote carries its change policy: on unless set off, stored only when off, locked with the words (owner, 2026-11-23)', () => {
  const free = made('f', 'choice', 'Which?', ['A', 'B']);
  assert.equal('allowChange' in free, false, 'the default is not stored');
  assert.equal(q.toLive(free).allowChange, true, 'Go live sends it, as on');
  const out = q.makeQuestion('x', 'choice', 'Which?', ['A', 'B'], false);
  assert.equal(out.question.allowChange, false);
  assert.equal(q.toLive(out.question).allowChange, false);
  assert.equal('allowChange' in q.makeQuestion('o', 'open', 'Ask', [], false).question, false, 'only a vote has one');
  assert.equal('allowChange' in q.toLive(made('o', 'open', 'Ask')), false);

  // An edit turns it off and back on; on again stores nothing, so no stale false survives.
  const off = q.editQuestion([free], 'f', { allowChange: false }, false).list[0];
  assert.equal(off.allowChange, false);
  const on = q.editQuestion([off], 'f', { allowChange: true }, false).list[0];
  assert.equal('allowChange' in on, false);
  // An edit of the words alone keeps it.
  assert.equal(q.editQuestion([off], 'f', { text: 'Which now?' }, false).list[0].allowChange, false);
  // Locked like the words: no edit while live or answered.
  assert.match(q.editQuestion([off], 'f', { allowChange: true }, true).error, /Duplicate it/);
  // A duplicate keeps the policy it was asked under.
  assert.equal(q.duplicateQuestion([off], 'f', 'g')[1].allowChange, false);

  // Read back: false is kept on a vote, anything else drops.
  const read = q.readQuestions([
    { id: 'a', type: 'choice', text: 'A?', options: ['1', '2'], allowChange: false },
    { id: 'b', type: 'choice', text: 'B?', options: ['1', '2'], allowChange: 'no' },
    { id: 'c', type: 'open', text: 'C?', allowChange: false },
  ]);
  assert.equal(read[0].allowChange, false);
  assert.equal('allowChange' in read[1], false);
  assert.equal('allowChange' in read[2], false);
});

test('the option rows: two to start, add and remove inside the limits, move, and a paste of several lines makes rows (P3)', () => {
  const { maxOptions, minOptions, option } = q.QUESTION_LIMITS;
  assert.deepEqual(q.startOptionRows(), ['', '']);
  assert.deepEqual(q.startOptionRows(['Yes']), ['Yes', '']);
  assert.deepEqual(q.startOptionRows(['A', 'B', 'C']), ['A', 'B', 'C']);
  assert.deepEqual([0, 1, 25].map(q.optionLetter), ['A', 'B', 'Z']);

  // Add goes after the row it is asked from; the limits refuse rather than trim.
  assert.deepEqual(q.addOptionRow(['A', 'B'], 0), ['A', '', 'B']);
  assert.deepEqual(q.addOptionRow(['A', 'B'], 1), ['A', 'B', '']);
  const full = Array.from({ length: maxOptions }, (_, i) => `o${i}`);
  assert.equal(q.addOptionRow(full, 3), null);
  assert.deepEqual(q.removeOptionRow(['A', 'B', 'C'], 1), ['A', 'C']);
  assert.equal(q.removeOptionRow(['A', 'B'], 0), null);
  assert.equal(minOptions, 2);

  // Move, clamped at both ends, never changing the list it was given.
  const rows = ['A', 'B', 'C'];
  assert.deepEqual(q.moveItem(rows, 2, 0), ['C', 'A', 'B']);
  assert.deepEqual(q.moveItem(rows, 0, 1), ['B', 'A', 'C']);
  assert.deepEqual(q.moveItem(rows, 0, -1), ['A', 'B', 'C']);
  assert.deepEqual(q.moveItem(rows, 2, 9), ['A', 'B', 'C']);
  assert.deepEqual(rows, ['A', 'B', 'C']);

  // A plain paste stays the field's own.
  assert.equal(q.pasteOptionRows(['', ''], 0, 'Just one'), null);
  // Several lines into the first of two empty rows: one row each, cleaned as cleanOptions cleans,
  // and the empty row that was room to type goes.
  assert.deepEqual(q.pasteOptionRows(['', ''], 0, ' Home \r\n\r\nAway\nDraw\n'), { rows: ['Home', 'Away', 'Draw'], focus: 2, dropped: 0 });
  // At its place among the others, which keep theirs; a long line is capped like a typed one.
  const long = 'x'.repeat(option + 5);
  assert.deepEqual(q.pasteOptionRows(['Red', 'Bl', '', 'Green'], 1, `Blue\n${long}`), { rows: ['Red', 'Blue', 'x'.repeat(option), 'Green'], focus: 2, dropped: 0 });
  // Past the most a vote takes, the options already written stay and the rest of the paste is dropped.
  const twelve = Array.from({ length: 12 }, (_, i) => `p${i}`).join('\n');
  const capped = q.pasteOptionRows(['First', '', 'Last'], 1, twelve);
  assert.equal(capped.rows.length, maxOptions);
  assert.deepEqual(capped.rows, ['First', 'p0', 'p1', 'p2', 'p3', 'p4', 'p5', 'Last']);
  assert.equal(capped.dropped, 6);
  assert.equal(capped.focus, 6);
  // Only blank lines: the rows go back to two empty ones.
  assert.deepEqual(q.pasteOptionRows(['', ''], 0, '\n \n'), { rows: ['', ''], focus: 0, dropped: 0 });
  // Saved through cleanOptions, the rows are exactly the options written.
  assert.deepEqual(q.cleanOptions(capped.rows), capped.rows);
});
