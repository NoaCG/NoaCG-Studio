// guards: src/templates/shared/textFit.ts, src/blocks/animMigration.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { parse } from 'acorn';
import { TEXT_FIT_RUNTIME_JS, preparePlacedTextOutput } from '../src/templates/shared/textFit.ts';

const old = readFileSync(new URL('../e2e/fixtures/editor-projects/placed-text-fit-v1.txt', import.meta.url), 'utf8');

test('only one complete known old emitted block is prepared, with surrounding bytes intact', () => {
  assert.equal(createHash('sha256').update(old).digest('hex'), 'e98eadc644f079d5287996ffacf8fff8cca8a871ce0ecb1488623d1d19314592');
  for (const newline of ['\n', '\r\n']) {
    const saved = old.replace(/\n/g, newline), live = TEXT_FIT_RUNTIME_JS.replace(/\n/g, newline);
    const before = '// Author $& and mixed line endings\r\nvar privateData = "keep";\n';
    const after = '\r\n// source/animation/field sentinels $` $\'\n';
    assert.equal(preparePlacedTextOutput(before + saved + after), before + live + after);
    assert.equal(preparePlacedTextOutput(before + live + after), before + live + after);
  }
});

test('custom, partial, duplicate, newer, unknown and SVG runtimes stay byte-identical', () => {
  for (const js of [old.replace('var FIT_MIN_RATIO = 0.55;', 'var FIT_MIN_RATIO = 0.6;'), old.slice(30), old + '\n' + old,
    old + '\n' + TEXT_FIT_RUNTIME_JS, TEXT_FIT_RUNTIME_JS, 'function fitPlacedText() { /* mine */ }',
    'function fitSvgText() {}\n' + old, 'function update(data) { return data; }\r\n']) assert.equal(preparePlacedTextOutput(js), js);
});

// Independent renderer oracle: hinted widths are quantized, not proportional to size.
// The contract is containment or the legibility floor, never the fitter's own formula.
function model(runtime, { room = 1043, width = size => Math.round(size) * 22.25, design = 48 } = {}) {
  let reads = 0;
  const size = () => parseFloat(el.style.fontSize) || design;
  const el = { style: { fontSize: '' }, parentNode: { getBoundingClientRect: () => { reads++; return { width: room }; } },
    getBoundingClientRect: () => { reads++; return { width: width(size()) }; } };
  const context = { document: { readyState: 'loading', addEventListener() {}, querySelectorAll: () => [el] },
    window: { getComputedStyle: () => ({ fontSize: String(size()) }) } };
  runInNewContext(runtime, context);
  const fit = () => { reads = 0; context.fitPlacedText(); return { size: size(), width: width(size()), reads }; };
  return { fit, room, design };
}

test('the old runtime fails a hinted-width control; the bounded solver fits and refits deterministically', () => {
  assert.ok(model(old).fit().width > 1043, 'the independent control exposes the original defect');
  const m = model(TEXT_FIT_RUNTIME_JS), first = m.fit();
  assert.ok(first.width <= m.room);
  assert.ok(first.size >= m.design * .55 && first.size <= m.design);
  assert.ok(first.reads <= 18);
  assert.ok(Math.round(first.size + .01) * 22.25 > m.room, 'does not over-shrink past the observed bracket');
  assert.deepEqual(m.fit(), first);
});

test('unfittable content retains the floor, short content the design size; emitted JS stays ES5', () => {
  for (const width of [size => size * 1000, size => size * 2]) {
    const m = model(TEXT_FIT_RUNTIME_JS, { width }), fitted = m.fit();
    assert.ok(fitted.reads <= 18);
    assert.equal(fitted.size, fitted.width > m.room ? m.design * .55 : m.design);
  }
  assert.doesNotThrow(() => parse(TEXT_FIT_RUNTIME_JS, { ecmaVersion: 5 }));
});
