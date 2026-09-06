// guards: src/templates/endCredits/shared.ts
//
// Self-tests for the end-credits text format - the one field an operator pastes a whole
// credit list into (src/templates/endCredits/shared.ts, docs/END_CREDITS.md).
//
// The parser is authored INSIDE a template literal, so every backslash in it is doubled and a
// rule that reads correctly in the .ts file can still ship broken. These tests therefore read
// the source, cut the parser block out, undo the one escape a template literal applies, and
// run the result - which is character-for-character the JavaScript a generated template ships.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(path.join(projectRoot, 'src/templates/endCredits/shared.ts'), 'utf8');

const start = source.indexOf('var ROLE_LABEL_MAX');
const end = source.indexOf('// rebuildCredits()');
assert.ok(start > 0 && end > start, 'parser block not found in shared.ts');
const block = source.slice(start, end);
// The block is plain text inside a template literal: no interpolation, no backticks, and `\\`
// standing for the single backslash the emitted file gets. Anything else means this extraction
// has drifted from what it is reading, and a silently wrong test is worse than no test.
assert.ok(!block.includes('${') && !block.includes('`'), 'parser block is no longer plain text');

const { parseCredits, creditGroupRows } = new Function(
  'escapeHtml',
  `${block.replace(/\\\\/g, '\\')}\nreturn { parseCredits: parseCredits, creditGroupRows: creditGroupRows };`,
)((s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'));

/** The entries of a single-section list, which is what most of these cases are. */
function only(text) {
  const sections = parseCredits(text);
  assert.equal(sections.length, 1, `expected one section, got ${sections.length}`);
  return sections[0];
}

test('a role ending in a colon collects every name beneath it', () => {
  assert.deepEqual(only('Camera:\nJonas Berg\nLena Fors\nPetri Salo'), [
    { type: 'group', role: 'Camera', names: ['Jonas Berg', 'Lena Fors', 'Petri Salo'] },
  ]);
});

test('a semicolon is read exactly as a colon is', () => {
  assert.deepEqual(only('Camera;\nJonas Berg'), [
    { type: 'group', role: 'Camera', names: ['Jonas Berg'] },
  ]);
});

test('the inline form is the same rule with the name on the same line', () => {
  assert.deepEqual(only('Director: Alex Rivera'), [
    { type: 'group', role: 'Director', names: ['Alex Rivera'] },
  ]);
});

test('the next role closes the one above it', () => {
  assert.deepEqual(only('Director:\nAlex Rivera\nProducer:\nSam Chen'), [
    { type: 'group', role: 'Director', names: ['Alex Rivera'] },
    { type: 'group', role: 'Producer', names: ['Sam Chen'] },
  ]);
});

test('a tab separates role from name - what a Google Doc table pastes as', () => {
  assert.deepEqual(only('Director\tAlex Rivera'), [
    { type: 'group', role: 'Director', names: ['Alex Rivera'] },
  ]);
});

test('the original pipe form still parses', () => {
  assert.deepEqual(only('Director | Alex Rivera'), [
    { type: 'group', role: 'Director', names: ['Alex Rivera'] },
  ]);
});

test('a hash line is a department heading and closes the role above it', () => {
  assert.deepEqual(only('Camera:\nJonas Berg\n# POST\nEditor: Sam Chen'), [
    { type: 'group', role: 'Camera', names: ['Jonas Berg'] },
    { type: 'heading', text: 'POST' },
    { type: 'group', role: 'Editor', names: ['Sam Chen'] },
  ]);
});

test('a blank line starts a new section and closes the open role', () => {
  const sections = parseCredits('Camera:\nJonas Berg\n\nSam Chen');
  assert.equal(sections.length, 2);
  assert.deepEqual(sections[0], [{ type: 'group', role: 'Camera', names: ['Jonas Berg'] }]);
  assert.deepEqual(sections[1], [{ type: 'entry', text: 'Sam Chen' }]);
});

test('a list pasted with no marks at all still reads - the floor', () => {
  assert.deepEqual(only('Anna Lind\nBengt Ohlsson\nCecilia Ruiz'), [
    { type: 'entry', text: 'Anna Lind' },
    { type: 'entry', text: 'Bengt Ohlsson' },
    { type: 'entry', text: 'Cecilia Ruiz' },
  ]);
});

// The bug the marked-heading rule exists to kill: nearly every credit roll ends on a sentence,
// and while headings were promoted by POSITION that sentence was set in accent caps.
test('the sentence a roll ends on is a plain line, not a heading', () => {
  const thanks = 'Special thanks to everyone who made this show possible';
  assert.deepEqual(only(thanks), [{ type: 'entry', text: thanks }]);
});

test('a sentence that happens to contain a colon is not a job title', () => {
  const long = 'And now the moment every one of us has been waiting for: the credits';
  assert.deepEqual(only(`Camera:\nJonas Berg\n${long}`), [
    { type: 'group', role: 'Camera', names: ['Jonas Berg', long] },
  ]);
});

test('a name keeps a colon that arrives after the role mark', () => {
  assert.deepEqual(only('Music: Theme: A Long Way Home'), [
    { type: 'group', role: 'Music', names: ['Theme: A Long Way Home'] },
  ]);
});

test('a line that is only a colon is not a role', () => {
  assert.deepEqual(only(':'), [{ type: 'entry', text: ':' }]);
});

test('every value is escaped on the way out of the parser', () => {
  assert.deepEqual(only('Camera <b>:\n<script>alert(1)</script>'), [
    {
      type: 'group',
      role: 'Camera &lt;b&gt;',
      names: ['&lt;script&gt;alert(1)&lt;/script&gt;'],
    },
  ]);
});

test('trailing whitespace from a paste does not hide the role mark', () => {
  assert.deepEqual(only('  Camera:  \n  Jonas Berg  '), [
    { type: 'group', role: 'Camera', names: ['Jonas Berg'] },
  ]);
});

test('creditGroupRows says a group in the original row vocabulary', () => {
  assert.deepEqual(
    creditGroupRows({ type: 'group', role: 'Camera', names: ['Jonas', 'Lena'] }),
    [
      { type: 'credit', role: 'Camera', name: 'Jonas' },
      { type: 'entry', text: 'Lena' },
    ],
  );
  assert.deepEqual(
    creditGroupRows({ type: 'group', role: 'Camera', names: [] }),
    [{ type: 'heading', text: 'Camera' }],
  );
});
