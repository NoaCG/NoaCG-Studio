// guards: src/control/audiencePickers.ts
// guards: src/model/joinCues.ts
// guards: src/control/messageStaging.ts
//
// THE AUDIENCE PICKERS (docs/work-specs/svg-template-library/spec.md D6, "Pickers and targets";
// phase TL1, AC-4, AC-9, AC-10), in Node. Pinned: the order (production, saved, built-in); a saved
// design offered only where staging would take it, and once (its production copy stands for it);
// every accessible name distinct; a saved design copied in under a free name and reused by
// identity; the seeded cue a pick fills; the Join card choice (none, one, several, remembered,
// deleted, replaced, synced) with one Join cue per card holding the current link; and the message
// rule that leaves quiz boards out while a remembered choice keeps working.

import assert from 'node:assert/strict';
import test from 'node:test';
import './lib/tsResolve.mjs';

const { pickerItems, fitsPicker, savedCopyPlan, seededCue, linkedCopy } = await import('../src/control/audiencePickers.ts');
const { planJoinCue, joinCardOf, joinLinkField } = await import('../src/model/joinCues.ts');
const { messageDestinations, destinationRefusal, rememberedDestination, takesMessages } = await import('../src/control/messageStaging.ts');

const f = (field, title) => ({ field, title, ftype: 'textfield' });
const graphic = (id, name, fields, extra = {}) => ({ id, name, type: 'x', savedAt: '', template: { name, fields }, ...extra });
const saved = (id, name, fields, extra = {}) => ({ id, name, template: { name, fields }, ...extra });

const JOIN = [f('f0', 'Instructions'), f('f1', 'Join link')];
const VOTE = [f('f0', 'Question'), f('f1', 'Options'), f('f2', 'Vote count'), f('f3', 'Vote status'), f('f4', 'Live figures')];
const MESSAGE = [f('f0', 'Message'), f('f1', 'Name')];
const QUIZ = [f('f0', 'Question'), f('f1', 'Answer A'), f('f2', 'Correct answer'), f('f3', 'Selected answer')];
const WORDS = [f('f0', 'Question'), f('f1', 'Words')];

test('each picker lists the production first, then saved designs, then built-ins', () => {
  const show = { graphics: [graphic('p1', 'Results band', VOTE), graphic('p2', 'Lower third', [f('f0', 'Name')])] };
  const library = [saved('s1', 'Vote results', VOTE), saved('s2', 'Message', MESSAGE), saved('s3', 'Join card', JOIN)];
  const results = pickerItems(show, library, 'results');
  assert.deepEqual(results.slice(0, 3).map((i) => [i.group, i.id]), [['production', 'p1'], ['saved', 's1'], ['built-in', 'pl01']]);
  assert.deepEqual(new Set(results.map((i) => i.group)), new Set(['production', 'saved', 'built-in']));
  assert.deepEqual(pickerItems(show, library, 'message').filter((i) => i.group !== 'built-in').map((i) => i.id), ['s2']);
  assert.deepEqual(pickerItems(show, library, 'join').map((i) => [i.group, i.id]), [['saved', 's3'], ['built-in', 'jc01']]);
  assert.deepEqual(pickerItems(show, [saved('w', 'Cloud', WORDS)], 'words').map((i) => i.group), ['saved', 'built-in']);
});

test('a saved design is offered where staging takes it, never a deleted one, a quiz or one already in the production', () => {
  assert.equal(fitsPicker('message', QUIZ), false, 'a quiz board has a Question but is not a message destination');
  assert.equal(fitsPicker('message', [f('f0', 'Question')]), true, 'a Question-only card still is');
  assert.equal(fitsPicker('message', VOTE), false);
  assert.equal(fitsPicker('results', MESSAGE), false);
  assert.equal(fitsPicker('join', VOTE), false);
  const show = { graphics: [graphic('p1', 'My results', VOTE, { graphicId: 's1' })] };
  const library = [saved('s1', 'Vote results', VOTE), saved('s2', 'Gone', VOTE, { deleted: true }), saved('s3', 'Quiz', QUIZ)];
  const items = pickerItems(show, library, 'results');
  assert.deepEqual(items.filter((i) => i.group !== 'built-in').map((i) => [i.group, i.id]), [['production', 'p1']], 'its copy stands for it, once');
  assert.equal(pickerItems(show, library, 'message').some((i) => i.group === 'saved'), false);
});

test('every button in a picker has its own accessible name, naming the design and where it comes from', () => {
  const show = { graphics: [graphic('p1', 'House Vote', VOTE)] };
  const library = [saved('s1', 'House Vote', VOTE), saved('s2', 'House Vote', VOTE)];
  const items = pickerItems(show, library, 'results');
  const labels = items.map((i) => i.label);
  assert.equal(new Set(labels).size, labels.length, labels.join(' / '));
  assert.equal(items[0].label, 'Results on House Vote, in this production');
  assert.equal(items[1].label, 'Results on House Vote, saved design');
  assert.equal(items[2].label, 'Results on House Vote, saved design 2');
  assert.ok(items.some((i) => i.label === 'Results on House Vote, built-in'));
});

test('a saved design is copied under a free name and reused by identity, never by name', () => {
  const show = { graphics: [graphic('p1', 'Vote results', VOTE), graphic('p2', 'Vote results 2', MESSAGE)] };
  assert.deepEqual(savedCopyPlan(show, { id: 's1', name: 'Vote results' }), { name: 'Vote results 3' });
  assert.deepEqual(savedCopyPlan(show, { id: 's1', name: 'Fresh' }), { name: 'Fresh' });
  const linked = { graphics: [...show.graphics, graphic('p3', 'Renamed in the pool', VOTE, { graphicId: 's1' })] };
  assert.deepEqual(savedCopyPlan(linked, { id: 's1', name: 'Vote results' }), { reuse: 'p3' });
  // An OBS scene's copy shares the link but is not the production's copy.
  assert.equal(linkedCopy({ graphics: [graphic('c', 'x', VOTE, { graphicId: 's1', sceneCopyOf: 'p' })] }, 's1'), null);
});

test('a pick fills the one seeded cue of a design just brought in, and nothing an operator touched', () => {
  const seed = { f0: '', f1: 'Yes | 0' };
  const cue = (id, values, sourceId = 'g') => ({ id, sourceId, label: 'x', values });
  assert.equal(seededCue({ cues: [cue('c1', { ...seed })] }, 'g', seed), 'c1');
  assert.equal(seededCue({ cues: [cue('c1', { f0: 'typed', f1: 'Yes | 0' })] }, 'g', seed), null, 'edited');
  assert.equal(seededCue({ cues: [cue('c1', seed), cue('c2', seed)] }, 'g', seed), null, 'two cues: none is the seed');
  assert.equal(seededCue({ cues: [cue('c1', seed)], resultCues: { q1: 'c1' } }, 'g', seed), null, 'a result cue');
  assert.equal(seededCue({ cues: [cue('c1', seed, 'other')] }, 'g', seed), null);
});

test('Join: none offers the picker, one is used, several ask once and the pick is remembered', () => {
  const card = (id, name = id) => graphic(id, name, JOIN);
  assert.equal(joinLinkField(JOIN), 'f1');
  assert.deepEqual(planJoinCue({ graphics: [graphic('v', 'Vote', VOTE)], cues: [] }), { kind: 'none' });
  const one = { graphics: [card('j1')], cues: [{ id: 'c1', sourceId: 'j1', values: {} }] };
  assert.deepEqual(planJoinCue(one), { kind: 'update', cueId: 'c1', graphicId: 'j1' }, 'one Join cue per card: updated, never a second');
  assert.deepEqual(planJoinCue({ graphics: [card('j1')], cues: [] }), { kind: 'add', graphicId: 'j1' });
  const several = { graphics: [card('j1'), card('j2')], cues: [{ id: 'c2', sourceId: 'j2', values: {} }] };
  assert.deepEqual(planJoinCue(several), { kind: 'choose' });
  assert.deepEqual(planJoinCue(several, 'j2'), { kind: 'update', cueId: 'c2', graphicId: 'j2' });
  // Reload or another operator's synced record: the remembered card decides, no question.
  assert.deepEqual(planJoinCue({ ...several, joinTarget: 'j2' }), { kind: 'update', cueId: 'c2', graphicId: 'j2' });
  // A just-copied design's seeded cue is the one filled.
  assert.deepEqual(planJoinCue({ graphics: [card('j1')], cues: [{ id: 'a', sourceId: 'j1' }, { id: 'b', sourceId: 'j1' }] }, 'j1', 'b'), { kind: 'update', cueId: 'b', graphicId: 'j1' });
});

test('Join: a deleted remembered card falls back, a replaced card keeps its id and stays the target', () => {
  const card = (id) => graphic(id, id, JOIN);
  // Deleted: the remembered id is gone, so the only card left is used; with two left, it asks.
  assert.equal(joinCardOf({ graphics: [card('j1')], joinTarget: 'gone' }), 'j1');
  assert.equal(joinCardOf({ graphics: [card('j1'), card('j2')], joinTarget: 'gone' }), 'choose');
  // Replaced by name keeps the pool id (model/shows.ts addGraphicToShow), so it stays the target...
  assert.equal(joinCardOf({ graphics: [card('j1'), graphic('j2', 'j2', JOIN)], joinTarget: 'j2' }), 'j2');
  // ...unless the new design dropped its Join link: then it is not a Join card any more.
  assert.equal(joinCardOf({ graphics: [card('j1'), graphic('j2', 'j2', MESSAGE)], joinTarget: 'j2' }), 'j1');
});

test('Message: a quiz board is no destination, a Question-only card is, and a remembered choice survives', () => {
  const pool = [graphic('quiz', 'Quiz', QUIZ), graphic('ask', 'Ask', [f('f0', 'Question')])];
  assert.deepEqual(messageDestinations({ graphics: pool }).map((d) => d.graphicId), ['ask']);
  assert.match(destinationRefusal({ graphics: pool }, 'quiz'), /no message field/);
  assert.equal(takesMessages(QUIZ), false);
  // Saved before this rule: the operator chose the quiz board, and it keeps working.
  const remembered = { graphics: pool, messageTarget: 'quiz' };
  assert.deepEqual(messageDestinations(remembered).map((d) => d.graphicId), ['quiz', 'ask']);
  assert.equal(rememberedDestination(remembered)?.graphicId, 'quiz');
  assert.equal(destinationRefusal(remembered, 'quiz'), null);
});
