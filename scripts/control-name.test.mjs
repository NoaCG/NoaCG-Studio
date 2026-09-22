// guards: src/control/controlWords.ts
//
// HOW A ⚡ BUTTON NAMES ITSELF IN ITS OWN HOVER.
//
// Both functions under test exist because of one real graphic: the agent-made proof case's totals
// board labels five separate presses "+1", one per panelist. The hover used to open with the
// machine's event id (`plus3`), which named the button in a vocabulary no operator has seen, and
// then said "moves Points 3 +1 with it", which made them read the same number twice. What the
// operator can see is the section heading drawn over the row, so that is what the name borrows.
//
// These are pure string functions over the declaration, which is why they are worth pinning here
// rather than only through the three surfaces that call them: the Playwright walk proves the
// sentence reaches the button, and this proves the cases that walk has no fixture for. The module
// imports nothing at runtime, which is what makes one `transpileModule` call enough - the same
// reason `combine.ts` stays dependency-free, and this file is what breaks if it stops.
//
// Run: node --test scripts/control-name.test.mjs   (picked up by the scripts/**/*.test.mjs glob)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const source = readFileSync(fileURLToPath(new URL('../src/control/controlWords.ts', import.meta.url)), 'utf8');
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { controlName, labelCarriesDelta } = await import(`data:text/javascript,${encodeURIComponent(js)}`);

// ── controlName: the section is the word the operator can already see ────────────────────────

test('a section names the button, because five presses on a totals board are all labelled "+1"', () => {
  assert.equal(controlName('+1', 'Panelist 3'), 'Panelist 3 +1');
  assert.equal(controlName('+1', 'Panelist 4'), 'Panelist 4 +1');
});

test('no heading over the button means the bare label, never an invented group', () => {
  // A PINNED control is lifted out of its section by `arrangeControls` and drawn with no heading,
  // and the dashboard suppresses a lone "Actions" heading too. A hover must not name a word the
  // operator cannot see, so both of those reach here as undefined.
  assert.equal(controlName('New game'), 'New game');
  assert.equal(controlName('New game', undefined), 'New game');
  assert.equal(controlName('New game', '   '), 'New game');
});

test('a label that already opens with its section does not say it twice', () => {
  assert.equal(controlName('Match final', 'Match'), 'Match final');
  assert.equal(controlName('match final', 'Match'), 'match final');
  assert.equal(controlName('Match  final', 'Match'), 'Match  final');
  // Only a PREFIX counts: a section word buried in the middle still needs saying at the front.
  assert.equal(controlName('Start match', 'Match'), 'Match Start match');
});

// ── labelCarriesDelta: the clause says WHAT moves, the button says how much ───────────────────

test('a "+1" button carries its own delta', () => {
  assert.equal(labelCarriesDelta({ adjust: { f7: 1 } }, '+1'), true);
});

test('the typographic minus a designer types counts as the arithmetic one', () => {
  // U+2212, which is what a label reads as on the totals board's own "−1" presses.
  assert.equal(labelCarriesDelta({ adjust: { f7: -1 } }, '−1'), true);
  assert.equal(labelCarriesDelta({ adjust: { f7: -1 } }, '-1'), true);
});

test('a button whose word says nothing about the amount keeps the number', () => {
  assert.equal(labelCarriesDelta({ adjust: { f7: 1 } }, 'Goal'), false);
  assert.equal(labelCarriesDelta({ adjust: { f7: 3 } }, '+1'), false);
});

test('a press moving two figures needs BOTH deltas in its word, or it carries neither', () => {
  const both = { adjust: { f7: 1, f8: -1 } };
  assert.equal(labelCarriesDelta(both, '+1'), false);
  assert.equal(labelCarriesDelta(both, 'Swap +1 / −1'), true);
});

test('a press that adjusts nothing carries no delta, whatever its word looks like', () => {
  // `newGame` sets five fields to "0" and adjusts none. There is no delta to drop, and the `set`
  // wording ("Points 3 to 0") is not one - a caller reading true here would say nothing at all.
  assert.equal(labelCarriesDelta({ set: { f5: '0', f6: '0' } }, '+1'), false);
  assert.equal(labelCarriesDelta({}, '+1'), false);
});

test('a set-only press carries no delta, so its "to 0" wording keeps its figure', () => {
  // `newGame` puts five scores back to "0" and adjusts nothing. `adjustWords` words that as
  // "Points 3 to 0", which is not a delta and must never be dropped - answering true here would
  // take the figure out of the one sentence whose whole point is the figure.
  assert.equal(labelCarriesDelta({ set: { f5: '0', f6: '0' } }, 'New game'), false);
});
