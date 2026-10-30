// guards: src/control/liveControls.ts
//
// PINNED LIVE CONTROLS' PURE HALF (docs/work-specs/pinned-live-controls/spec.md; AC-2, AC-3, AC-4,
// AC-6): the selection a pinned block presses with, the order of the LIVE region's blocks, and
// the one-press pick rule over declarations shaped as the catalog's are. The same rule over every
// catalog graphic, built for real, is scripts/live-controls-catalog.test.mjs; the presses
// themselves are scripts/graphic-verbs.test.mjs.

import test from 'node:test';
import assert from 'node:assert/strict';

const { liveSelection, liveBlocks, pickOptions, pickButton, liveNumberFields, pickFields, PICK_CAP } = await import('../src/control/liveControls.ts');

const cue = (id, graphic, extra = {}) => ({ id, sourceId: `g-${graphic}`, label: id, values: {}, ...extra });

test('a pinned block presses with its own graphic\'s on-air cue, never the selection', () => {
  const cues = [cue('q1', 'Quiz'), cue('b1', 'Banner'), cue('b2', 'Banner')];
  assert.deepEqual(liveSelection('Banner', cues, { Banner: 'b2', Quiz: 'q1' }), {
    selectedCue: cues[2],
    selectedGraphic: 'Banner',
    selectedLayerLive: true,
    selectedPlayoutLive: false,
    editingCue: cues[2],
    editingIsLive: true,
    airCue: cues[2],
  });
});

test('a pinned graphic off air is not live, so no verb sends; a live layer whose cue is gone still reads live', () => {
  const off = liveSelection('Banner', [cue('b1', 'Banner')], { Quiz: 'q1' });
  assert.equal(off.selectedLayerLive, false);
  assert.equal(off.editingIsLive, false);
  assert.equal(off.airCue, null);
  const gone = liveSelection('Banner', [], { Banner: 'deleted' });
  assert.equal(gone.selectedLayerLive, true);
  assert.equal(gone.editingIsLive, false);
  // A graphic named after an Object member is a name.
  assert.equal(liveSelection('constructor', [], {}).selectedLayerLive, false);
});

test('blocks: pins first in pin order, then the selected graphic, never twice; an orphan pin draws nothing (D2, D7)', () => {
  const pool = ['Quiz', 'Banner', 'Clock'];
  assert.deepEqual(liveBlocks([], pool, 'Quiz'), { blocks: [{ graphic: 'Quiz', pinned: false, selected: true }], dropped: [] });
  assert.deepEqual(liveBlocks([], pool, null), { blocks: [], dropped: [] });
  assert.deepEqual(liveBlocks(['Clock', 'Banner'], pool, 'Quiz').blocks.map((b) => b.graphic), ['Clock', 'Banner', 'Quiz']);
  assert.deepEqual(liveBlocks(['Clock', 'Banner'], pool, 'Banner').blocks, [
    { graphic: 'Clock', pinned: true, selected: false },
    { graphic: 'Banner', pinned: true, selected: true },
  ]);
  assert.deepEqual(liveBlocks(['Gone', 'Banner'], pool, null), { blocks: [{ graphic: 'Banner', pinned: true, selected: false }], dropped: ['Gone'] });
});

// A classic answer board's declaration, as qz01 compiles it (src/templates/types/answerBoard.ts):
// `select` off the default path carries Selected answer; `judge` on it carries Correct answer.
const letters = (n) => [{ label: '—', value: '' }, ...'ABCDEFGHIJ'.slice(0, n).split('').map((l) => ({ label: l, value: l }))];
const quiz = {
  descriptors: [
    { key: 'f0', label: 'Question', kind: 'text', defaultValue: '' },
    { key: 'f5', label: 'Correct answer', kind: 'select', defaultValue: 'A', options: letters(4) },
    { key: 'f6', label: 'Selected answer', kind: 'select', defaultValue: '', options: letters(4) },
    { key: 'f7', label: 'Audience', kind: 'number', defaultValue: 0 },
  ],
  buttons: [
    { event: 'select', label: 'Select answer', payload: ['f6'] },
    { event: 'lock', label: 'Lock it in' },
    { event: 'judge', label: 'Reveal correct', payload: ['f5'] },
    { event: 'audience', label: 'Audience', payload: ['f7'] },
  ],
  path: new Set(['judge', 'next']),
};
const picks = (d) => d.buttons.map((b) => pickOptions(b, d.descriptors, d.path, d.buttons));

test('the pick rule: a select payload off the default path is one button per option, "—" left out (AC-3, AC-4)', () => {
  assert.deepEqual(picks(quiz), [{ field: 'f6', options: letters(4).slice(1) }, null, null, null]);
  assert.deepEqual([...pickFields(quiz.buttons, quiz.descriptors, quiz.path)], ['f6']);
});

test('the pick rule leaves a default-path payload alone: Correct answer rides judge, which Continue walks', () => {
  const onPath = { ...quiz, path: new Set(['judge', 'select']) };
  assert.equal(picks(onPath)[0], null);
});

test('the pick rule leaves a number payload (the podium\'s Spotlight), a two-field payload and a moving press alone', () => {
  const d = { ...quiz, buttons: [{ event: 'spot', label: 'Spotlight', payload: ['f7'] }, { event: 'two', label: 'Two', payload: ['f5', 'f6'] }, { event: 'mv', label: 'Move', payload: ['f6'], adjust: { f7: 1 } }] };
  assert.deepEqual(picks(d), [null, null, null]);
});

test('the pick rule leaves a field another control already sets: the quiz show boards keep their own per-option controls', () => {
  const show = { ...quiz, buttons: [...quiz.buttons, { event: 'pickA', label: 'A', set: { f6: 'A' } }] };
  assert.equal(picks(show)[0], null);
});

test(`the pick cap is ${PICK_CAP} options: one more and the control stays a button reading its field (D5)`, () => {
  assert.equal(PICK_CAP, 8);
  const withOptions = (n) => ({ ...quiz, descriptors: quiz.descriptors.map((x) => (x.key === 'f6' ? { ...x, options: letters(n) } : x)) });
  assert.equal(picks(withOptions(8))[0].options.length, 8);
  assert.equal(picks(withOptions(9))[0], null);
  assert.equal(picks(withOptions(0))[0], null);
});

test('a pick press is the event with its field set to the option, the shape a set press has', () => {
  const group = pickOptions(quiz.buttons[0], quiz.descriptors, quiz.path, quiz.buttons);
  assert.deepEqual(pickButton(quiz.buttons[0], group, 'B'), { event: 'select', label: 'Select answer', set: { f6: 'B' } });
});

test('live numbers: number fields no event carries and no live candidate supplies', () => {
  const descriptors = [...quiz.descriptors, { key: 'f8', label: 'Points', kind: 'number', defaultValue: 0 }, { key: 'f9', label: 'Feed', kind: 'number', defaultValue: 0 }];
  assert.deepEqual(liveNumberFields(descriptors, quiz.buttons, ['f9']).map((d) => d.key), ['f8']);
});
