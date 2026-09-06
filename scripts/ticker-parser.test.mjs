// guards: src/templates/tickers/shared.ts
//
// Self-tests for the ticker text format - the one field a rundown of stories is typed into
// (src/templates/tickers/shared.ts, docs/TICKERS.md).
//
// The parser is authored INSIDE a template literal, so every backslash in it is doubled and a
// rule that reads correctly in the .ts file can still ship broken. These tests therefore read
// the source, cut the parser block out, undo the one escape a template literal applies, and
// run the result - which is character-for-character the JavaScript a generated template ships.
// scripts/credits-parser.test.mjs does the same for the credit roll, and for the same reason.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(path.join(projectRoot, 'src/templates/tickers/shared.ts'), 'utf8');

const start = source.indexOf('var KICKER_LABEL_MAX');
const end = source.indexOf('// tickerItemHtml(item)');
assert.ok(start > 0 && end > start, 'parser block not found in shared.ts');
const block = source.slice(start, end);
// The block is plain text inside a template literal: no interpolation, no backticks, and `\\`
// standing for the single backslash the emitted file gets. Anything else means this extraction
// has drifted from what it is reading, and a silently wrong test is worse than no test.
assert.ok(!block.includes('${') && !block.includes('`'), 'parser block is no longer plain text');

const { parseTickerItems, tickerKickerMark } = new Function(
  `${block.replace(/\\\\/g, '\\')}\nreturn { parseTickerItems: parseTickerItems, tickerKickerMark: tickerKickerMark };`,
)();

const item = (kicker, text) => ({ kicker, text });

test('a colon followed by a space tags the story after it', () => {
  assert.deepEqual(parseTickerItems('SPORT: United win 3-0'), [item('SPORT', 'United win 3-0')]);
});

test('a semicolon is read exactly as a colon is', () => {
  assert.deepEqual(parseTickerItems('SPORT; United win 3-0'), [item('SPORT', 'United win 3-0')]);
});

test('a kicker on its own line tags every story beneath it', () => {
  assert.deepEqual(parseTickerItems('SPORT:\nUnited win 3-0\nCity held at home'), [
    item('SPORT', 'United win 3-0'),
    item('SPORT', 'City held at home'),
  ]);
});

test('the next kicker closes the one above it', () => {
  assert.deepEqual(parseTickerItems('SPORT:\nUnited win 3-0\nWEATHER:\nStorm warning'), [
    item('SPORT', 'United win 3-0'),
    item('WEATHER', 'Storm warning'),
  ]);
});

test('a blank line closes the open kicker', () => {
  assert.deepEqual(parseTickerItems('SPORT:\nUnited win 3-0\n\nStorm warning'), [
    item('SPORT', 'United win 3-0'),
    item('', 'Storm warning'),
  ]);
});

test('a tab says outright which half is which, with no length guard', () => {
  const long = 'A DESK NAME LONGER THAN THE COLON GUARD ALLOWS';
  assert.deepEqual(parseTickerItems(`${long}\tUnited win 3-0`), [item(long, 'United win 3-0')]);
});

// The four cases the space-after rule exists for. Every one of them ships in a real sample
// today, and a length guard alone - which is all the credits parser has - would have turned
// each into a kicker.
test('a score is not a kicker: tk13 writes "United 2:1 City"', () => {
  assert.deepEqual(parseTickerItems('NORTHERN UNITED 2:1 CITY ROVERS'), [
    item('', 'NORTHERN UNITED 2:1 CITY ROVERS'),
  ]);
});

test('a clock is not a kicker, and a real kicker after one still reads', () => {
  assert.deepEqual(parseTickerItems('Polling stations close at 20:00'), [
    item('', 'Polling stations close at 20:00'),
  ]);
  assert.deepEqual(parseTickerItems('TRAVEL: the 20:45 service is cancelled'), [
    item('TRAVEL', 'the 20:45 service is cancelled'),
  ]);
});

test('a link is not a kicker', () => {
  assert.deepEqual(parseTickerItems('Full results at https://example.org/results'), [
    item('', 'Full results at https://example.org/results'),
  ]);
});

test('a sentence long enough to be prose is not a kicker', () => {
  const line = 'The question everyone in the hall was asking was this: who pays for it';
  assert.deepEqual(parseTickerItems(line), [item('', line)]);
  assert.equal(tickerKickerMark(line), -1);
});

// The pipe belongs to tk17, which splits an item into its two languages with it. Giving the
// parser a second meaning for it would have broken that design's own shipped samples.
test('a pipe is NOT a separator here, unlike the credit roll', () => {
  const line = 'Polling stations close at 20:00 | Vaalihuoneistot sulkeutuvat klo 20.00';
  assert.deepEqual(parseTickerItems(line), [item('', line)]);
});

test('a rundown with no marks at all is a plain list of stories', () => {
  assert.deepEqual(parseTickerItems('Storm warning issued\nRail strike suspended'), [
    item('', 'Storm warning issued'),
    item('', 'Rail strike suspended'),
  ]);
});

test('a kicker with nothing under it contributes no item', () => {
  assert.deepEqual(parseTickerItems('SPORT:\n\nStorm warning'), [item('', 'Storm warning')]);
});

test('whitespace-only lines are blank lines, and blank input is no items', () => {
  assert.deepEqual(parseTickerItems('SPORT:\n   \nStorm warning'), [item('', 'Storm warning')]);
  assert.deepEqual(parseTickerItems(''), []);
});

test('the kicker guard is a length, and it is measured before the colon', () => {
  const at32 = 'x'.repeat(32);
  assert.deepEqual(parseTickerItems(`${at32}: story`), [item(at32, 'story')]);
  const at33 = 'x'.repeat(33);
  assert.deepEqual(parseTickerItems(`${at33}: story`), [item('', `${at33}: story`)]);
});

test('a line that is only a colon is a story, never an empty kicker', () => {
  assert.deepEqual(parseTickerItems(': story'), [item('', ': story')]);
});
