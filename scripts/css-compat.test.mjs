// guards: src/assets/cssCompat.ts
//
// The `inset` shorthand rewritten into longhands for CasparCG 2.3.x's Chromium 71, which drops
// `inset` while parsing: a full-frame stage written `inset: 0` had no size there, so a picture
// showed at its pixel size in a corner and a full-frame graphic showed nothing.

import test from 'node:test';
import assert from 'node:assert/strict';

const { expandInset, expandInsetInMarkup } = await import('../src/assets/cssCompat.ts');

test('one to four values become top, right, bottom and left, as the shorthand means them', () => {
  assert.equal(expandInset('#s { position: absolute; inset: 0; }'), '#s { position: absolute; top: 0; right: 0; bottom: 0; left: 0; }');
  assert.equal(expandInset('a{inset:10px 20px}'), 'a{top: 10px; right: 20px; bottom: 10px; left: 20px}');
  assert.equal(expandInset('a { inset: 1px 2px 3px; }'), 'a { top: 1px; right: 2px; bottom: 3px; left: 2px; }');
  assert.equal(expandInset('a { inset: 1px 2px 3px 4px }'), 'a { top: 1px; right: 2px; bottom: 3px; left: 4px }');
  assert.equal(expandInset('a {\n  inset: calc(100% - 4px) auto;\n}'), 'a {\n  top: calc(100% - 4px); right: auto; bottom: calc(100% - 4px); left: auto;\n}');
});

test('!important is kept on every longhand', () => {
  assert.equal(expandInset('a { inset: 0 !important; }'), 'a { top: 0 !important; right: 0 !important; bottom: 0 !important; left: 0 !important; }');
});

test('nothing else named inset is touched', () => {
  for (const css of [
    'a { box-shadow: inset 0 0 4px #000; }',
    'a { --inset: 4px; }',
    'a { inset-inline-start: 0; }',
    '@supports (inset: 0) { a { color: red; } }',
    'a { top: 0; }',
  ]) {
    assert.equal(expandInset(css), css, css);
  }
});

test('inline style attributes get the same rewrite, and nothing outside them changes', () => {
  assert.equal(
    expandInsetInMarkup('<div class="inset" style="position:absolute;inset:0">inset: 0</div>'),
    '<div class="inset" style="position:absolute;top: 0; right: 0; bottom: 0; left: 0">inset: 0</div>',
  );
});
