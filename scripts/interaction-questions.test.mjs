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
    { id: 'w', type: 'word', text: 'One word', maxLength: 25 },
    { id: 'c', type: 'choice', text: 'Vote', options: ['A', 3, 'B'] },
    null,
  ];
  const read = q.readQuestions(stored);
  assert.deepEqual(read.map((x) => x.id), ['ok', 'w', 'c']);
  assert.deepEqual(read[1], { id: 'w', type: 'word', text: 'One word', maxLength: 25 }, 'a newer build keeps what it wrote');
  assert.deepEqual(read[2].options, ['A', 'B']);
  assert.equal(q.questionLocked(read[1], { live: false, answers: 0 }), true);
  assert.ok('error' in q.editQuestion(read, 'w', { text: 'Changed' }, false));
  assert.deepEqual(q.readQuestions(undefined), []);
});

test('the Interaction view keeps its persisted key and its inbox key (AC-1, R17)', () => {
  // The view is called Interaction on screen; its route, saved in links and open tabs, is still
  // `audience`, and the kept inbox is still under its old storage key.
  assert.deepEqual(parseRoute('#/production/p1/audience'), { view: 'production', id: 'p1', sub: 'audience' });
  assert.equal(routeHash({ view: 'production', id: 'p1', sub: 'audience' }), '#/production/p1/audience');
  assert.deepEqual(parseRoute('#/production/p1/interaction'), { view: 'production', id: 'p1' }, 'no second key');
  assert.equal(LOCAL_INBOX_KEY, 'spx-gfx-audience-inbox');
});
