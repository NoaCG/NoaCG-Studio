// gate: build
// guards: scripts/e2e-build-sources.mjs
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { sourceLookup, sourcesOf } from './e2e-build-sources.mjs';

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const vlq = (n) => {
  let v = n < 0 ? (-n << 1) | 1 : n << 1;
  let out = '';
  do {
    let digit = v & 31;
    v >>>= 5;
    if (v) digit |= 32;
    out += B64[digit];
  } while (v);
  return out;
};
/** Mappings from per-line `[column, sourceIndex]` pairs (source line and column 0). */
const mappings = (lines) => {
  let source = 0;
  return lines.map((segments) => {
    let column = 0;
    return segments.map(([col, src]) => {
      const s = [vlq(col - column), vlq(src - source), vlq(0), vlq(0)].join('');
      column = col;
      source = src;
      return s;
    }).join(',');
  }).join(';');
};

test('a generated position resolves to the source of the last segment at or before it', () => {
  const lookup = sourceLookup({ sources: ['a.ts', 'b.ts'], mappings: mappings([[[0, 0], [10, 1]], [[4, 0]]]) });
  assert.equal(lookup(0, 0), 'a.ts');
  assert.equal(lookup(0, 9), 'a.ts');
  assert.equal(lookup(0, 10), 'b.ts');
  assert.equal(lookup(1, 3), null, 'before the first segment of a line');
  assert.equal(lookup(1, 4), 'a.ts', 'the source index carries across lines');
});

test('offsets in a built chunk answer repo-relative source files, dependencies left out', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'build-sources-'));
  mkdirSync(path.join(root, 'dist-e2e/assets'), { recursive: true });
  const code = 'function a(){}function b(){}\nfunction c(){}';
  writeFileSync(path.join(root, 'dist-e2e/assets/x.js'), code);
  writeFileSync(path.join(root, 'dist-e2e/assets/x.js.map'), JSON.stringify({
    version: 3,
    sources: ['../../src/one.ts', '../../src/two.ts', '../../node_modules/dep/index.js'],
    mappings: mappings([[[0, 0], [14, 1]], [[0, 2]]]),
  }));
  assert.deepEqual(sourcesOf(root, 'dist-e2e', 'assets/x.js', [0, 14, 29]).sort(), ['src/one.ts', 'src/two.ts']);
  assert.deepEqual(sourcesOf(root, 'dist-e2e', 'assets/missing.js', [0]), []);
});
