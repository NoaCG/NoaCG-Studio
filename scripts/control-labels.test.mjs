// guards: src/blocks/controlLabels.ts
//
// A ⚡ BUTTON THAT NAMES WHO IT ACTS ON. A duel score's point button reads "+1 ANNA" from the
// player field ON AIR (`+1 {f0|P1}`), and every surface with no on-air values reads "+1 P1". These
// pin the cases the Playwright walk has no fixture for: an empty name, two players with the same
// name, a field never sent, and the plain reading every export carries. The module imports
// nothing, which is what makes one `transpileModule` call enough.
//
// Run: node --test scripts/control-labels.test.mjs   (picked up by the scripts/**/*.test.mjs glob)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const source = readFileSync(fileURLToPath(new URL('../src/blocks/controlLabels.ts', import.meta.url)), 'utf8');
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { labelFields, plainLabel, liveLabels, withLiveLabels } = await import(
  `data:text/javascript,${encodeURIComponent(js)}`
);

const duel = ['+1 {f0|P1}', '+1 {f2|P2}', '−1 {f0|P1}', '−1 {f2|P2}', 'Final', 'Reset 0-0'];

test('a label names its fields in order, with their fallbacks', () => {
  assert.deepEqual(labelFields('+1 {f0|P1}'), [{ key: 'f0', fallback: 'P1' }]);
  assert.deepEqual(labelFields('{a|A} v {b}'), [{ key: 'a', fallback: 'A' }, { key: 'b', fallback: '' }]);
  assert.deepEqual(labelFields('Final'), []);
});

test('the plain reading puts each fallback in place: what exports and the authoring surfaces show', () => {
  assert.equal(plainLabel('+1 {playerA|P1}'), '+1 P1');
  assert.equal(plainLabel('Final'), 'Final');
  // No fallback reads as nothing, never as a raw brace or a field id.
  assert.equal(plainLabel('+1 {f0}'), '+1');
});

test('braces in a name somebody typed stay text: a key starts lower-case, like a field id', () => {
  assert.deepEqual(labelFields('Show {Logo}'), []);
  assert.equal(plainLabel('Sponsor {A}'), 'Sponsor {A}');
});

test('on air, the button names the player the audience sees', () => {
  assert.deepEqual(liveLabels(duel, { f0: 'ANNA', f2: 'SAM' }), ['+1 ANNA', '+1 SAM', '−1 ANNA', '−1 SAM', 'Final', 'Reset 0-0']);
});

test('nothing on air, or an empty name on air, reads the fallback', () => {
  assert.deepEqual(liveLabels(duel, null).slice(0, 2), ['+1 P1', '+1 P2']);
  assert.deepEqual(liveLabels(duel, { f0: '  ', f2: 'SAM' }).slice(0, 2), ['+1 P1', '+1 SAM']);
  // A field the graphic was never sent is empty on air, not the editor's value.
  assert.deepEqual(liveLabels(duel, { f2: 'SAM' }).slice(0, 2), ['+1 P1', '+1 SAM']);
});

test('two players with the same name stay distinguishable: "P1 ANNA" and "P2 ANNA"', () => {
  assert.deepEqual(liveLabels(duel, { f0: 'ANNA', f2: 'Anna' }).slice(0, 4), ['+1 P1 ANNA', '+1 P2 Anna', '−1 P1 ANNA', '−1 P2 Anna']);
  // A name that reads like the other side's fallback is a clash too.
  assert.deepEqual(liveLabels(duel, { f0: 'P2', f2: '' }).slice(0, 2), ['+1 P1 P2', '+1 P2']);
});

test('a name spread over lines or spaces reads as one line', () => {
  assert.equal(liveLabels(['+1 {f0|P1}'], { f0: 'Anna\n  Maria' })[0], '+1 Anna Maria');
});

test('withLiveLabels replaces only the labels that name a field, and keeps the order', () => {
  const buttons = [
    { event: 'pointA', label: '+1 P1', labelTemplate: '+1 {f0|P1}' },
    { event: 'final', label: 'Final' },
  ];
  const out = withLiveLabels(buttons, { f0: 'ANNA' });
  assert.deepEqual(out.map((b) => b.label), ['+1 ANNA', 'Final']);
  assert.equal(out[1], buttons[1]);
  // No field-naming label at all: the same array back, so a memo keyed on it holds.
  const plain = [{ event: 'final', label: 'Final' }];
  assert.equal(withLiveLabels(plain, { f0: 'ANNA' }), plain);
  // A label that would read empty (a field with no fallback, empty on air) keeps its plain one.
  assert.equal(withLiveLabels([{ event: 'who', label: 'who', labelTemplate: '{f0}' }], {})[0].label, 'who');
});
