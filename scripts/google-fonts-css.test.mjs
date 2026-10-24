// guards: src/model/googleFonts.ts, src/model/googleFontsCss.ts
//
// Which file of a Google css2 response a picked family EMBEDS (src/model/googleFonts.ts).
//
// Google serves a modern browser one @font-face block per subset, each limited by a
// unicode-range, and lists `latin` LAST: cyrillic-ext first for Montserrat and Roboto,
// latin-ext first for Bebas Neue. A single-file embed that took the FIRST url() shipped a face
// with no ASCII glyphs under the family's name, so every letter fell through to Arial in the
// editor and on air (verified against the live endpoint, 2026-10-24). These tests hold the
// block parser and the choice to the live shape, offline.

import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGoogleFontCss, pickGoogleFontFile } from '../src/model/googleFontsCss.ts';

/** A css2 response as fonts.googleapis.com served it to Chrome on 2026-10-24, subsets in
 *  Google's order, file names shortened. */
const block = (subset, file, range) => `/* ${subset} */
@font-face {
  font-family: 'Montserrat';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url(https://fonts.gstatic.com/s/montserrat/v31/${file}.woff2) format('woff2');
  unicode-range: ${range};
}`;

const MONTSERRAT = [
  block('cyrillic-ext', 'cyr-ext', 'U+0460-052F, U+1C80-1C8A, U+20B4, U+2DE0-2DFF, U+A640-A69F, U+FE2E-FE2F'),
  block('cyrillic', 'cyr', 'U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116'),
  block('vietnamese', 'viet', 'U+0102-0103, U+0110-0111, U+0128-0129, U+1EA0-1EF9, U+20AB'),
  block('latin-ext', 'lat-ext', 'U+0100-02BA, U+02BD-02C5, U+1E00-1E9F, U+2020, U+20A0-20AB, U+A720-A7FF'),
  block('latin', 'lat', 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+2000-206F, U+20AC, U+FFFD'),
].join('\n');

test('every labelled block is read, in order, with its file and range', () => {
  const faces = parseGoogleFontCss(MONTSERRAT);
  assert.deepEqual(
    faces.map((f) => f.subset),
    ['cyrillic-ext', 'cyrillic', 'vietnamese', 'latin-ext', 'latin'],
  );
  assert.equal(faces[0].url, 'https://fonts.gstatic.com/s/montserrat/v31/cyr-ext.woff2');
  assert.match(faces[4].unicodeRange, /^U\+0000-00FF, /);
});

test('the latin block is embedded, not the first one', () => {
  const picked = pickGoogleFontFile(parseGoogleFontCss(MONTSERRAT));
  assert.equal(picked?.subset, 'latin');
  assert.equal(picked?.url, 'https://fonts.gstatic.com/s/montserrat/v31/lat.woff2');
  // The range the chosen file covers includes ASCII and the Western European accents.
  assert.match(picked.unicodeRange, /U\+0000-00FF/);
});

test('latin wins when latin-ext is the first block (Bebas Neue)', () => {
  const css = [block('latin-ext', 'ext', 'U+0100-02BA'), block('latin', 'lat', 'U+0000-00FF')].join('\n');
  assert.equal(pickGoogleFontFile(parseGoogleFontCss(css))?.url, 'https://fonts.gstatic.com/s/montserrat/v31/lat.woff2');
});

test('a single unlabelled block with no range is the whole face and is taken as is', () => {
  const css = `@font-face {
  font-family: 'Stub';
  src: url(https://fonts.gstatic.com/s/stub/v1/all.woff2) format('woff2');
}`;
  const faces = parseGoogleFontCss(css);
  assert.deepEqual(faces, [{ subset: '', url: 'https://fonts.gstatic.com/s/stub/v1/all.woff2', unicodeRange: '' }]);
  assert.equal(pickGoogleFontFile(faces)?.url, 'https://fonts.gstatic.com/s/stub/v1/all.woff2');
});

test('labelled blocks with no latin fall back to the first file rather than nothing', () => {
  const css = [block('devanagari', 'deva', 'U+0900-097F'), block('bengali', 'beng', 'U+0980-09FF')].join('\n');
  assert.equal(pickGoogleFontFile(parseGoogleFontCss(css))?.subset, 'devanagari');
});

test('a quoted src url() is read like an unquoted one', () => {
  const css = `/* latin */
@font-face {
  font-family: 'Stub';
  src: url("https://fonts.gstatic.com/s/stub/v1/lat.woff2") format('woff2');
  unicode-range: U+0000-00FF;
}`;
  assert.equal(parseGoogleFontCss(css)[0]?.url, 'https://fonts.gstatic.com/s/stub/v1/lat.woff2');
});

test('a sheet offering no gstatic file picks nothing', () => {
  assert.equal(parseGoogleFontCss('/* nothing */ body { color: red; }').length, 0);
  assert.equal(pickGoogleFontFile([]), undefined);
});
