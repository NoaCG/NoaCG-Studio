// guards: src/blocks/pathGeometry.ts, src/blocks/editorPaths.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { rolldown } from 'rolldown';
import { rawSuffix } from './rolldown-raw.mjs';
const bundle = await rolldown({ input: 'src/blocks/pathGeometry.ts', platform: 'neutral', logLevel: 'silent' });
const { output } = await bundle.generate({ format: 'esm', codeSplitting: false });
await bundle.close();
const { parsePath, pathSource, validatePath, movePathPoint, mapPoint, pathBounds } = await import(`data:text/javascript;base64,${Buffer.from(output[0].code).toString('base64')}`);
const writer = await rolldown({ input: 'src/blocks/editorPaths.ts', platform: 'neutral', plugins: [rawSuffix], logLevel: 'silent' });
const emitted = await writer.generate({ format: 'esm', codeSplitting: false }); await writer.close();
const { patchPathAttribute } = await import(`data:text/javascript;base64,${Buffer.from(emitted.output[0].code).toString('base64')}`);
test('native adapter round trips corners, relative repeated segments and cubic closure', () => {
  for (const d of ['M 0 0 L 80 0 L 40 90 Z', 'm 10 20 30 0 0 40', 'M 0 0 C 10 -20 80 -20 100 0 L 50 80 C 30 80 -10 30 0 0 Z']) {
    const p = parsePath(d);
    assert.deepEqual(parsePath(pathSource(p)), p);
  }
  assert.equal(pathSource(parsePath('m 10 20 30 0 0 40')), 'M 10 20 L 40 20 L 40 60');
  const closed = parsePath('M 0 0 C 10 -20 80 -20 100 0 L 50 80 C 30 80 -10 30 0 0 Z');
  assert.equal(closed.points.length, 3);
  assert.deepEqual(closed.points[0].in, { x: -10, y: 30 });
});
test('guards reject unsupported syntax, multiple subpaths, garbage and malformed numbers', () => {
  for (const d of ['', 'M 0 0 Q 10 20 30 40', 'M0 0 A2 2 0 0 1 4 4', 'M0 0 L1 1 M2 2 L3 3', 'M0 0 L1', 'M0 0 L1 2 garbage', 'M0 0 L1 2 @', 'L0 0 L1 1', 'M0 0 L1 1 L2 2 Z L3 3', 'M0 0 L1e999 2']) assert.throws(() => parsePath(d), undefined, d);
  assert.throws(() => parsePath('M0 0 L1'), /incomplete or nonfinite/);
});
test('source token edits preserve quote-independent unrelated attributes and guard ambiguity', () => {
  assert.equal(patchPathAttribute('<path class="a" d=\'M0 0 L1 1\' fill="red" />', 'd', 'M 1 2 L 3 4'), '<path class="a" d="M 1 2 L 3 4" fill="red" />');
  assert.equal(patchPathAttribute('<path d="M0 0 L1 1" />', 'stroke', '#112233'), '<path d="M0 0 L1 1" stroke="#112233" />');
  assert.equal(patchPathAttribute('<path D="M0 0 L1 1" />', 'd', 'M 1 2 L 3 4'), '<path D="M 1 2 L 3 4" />');
  assert.throws(() => patchPathAttribute('<path d="M0 0" D="M1 1" />', 'd', 'M0 0 L1 1'), /duplicate/);
  assert.throws(() => patchPathAttribute('<path d="M0 0" d="M1 1" />', 'd', 'M0 0 L1 1'), /duplicate/);
  assert.throws(() => patchPathAttribute('<path />', 'onclick', 'alert(1)'), /supported/);
  assert.throws(() => patchPathAttribute('<path />', 'fill', '"><script>'), /literal/);
});
test('guards bound completed geometry and every coordinate', () => {
  const line = parsePath('M0 0 L10 10');
  for (const p of [{ ...line, closed: 'yes' }, { points: [], closed: false }, { points: [{ x: 1, y: 2 }], closed: false }, { ...line, closed: true }, { ...line, points: Array(513).fill({ x: 1, y: 2 }) }, { ...line, points: [{ x: Infinity, y: 0 }, line.points[1]] }, { ...line, points: [{ x: 0, y: 0, out: { x: 100001, y: 0 } }, line.points[1]] }]) assert.throws(() => validatePath(p));
  assert.throws(() => pathSource({ ...line, points: [{ x: NaN, y: 0 }] }));
});
test('point movement carries tangents while handle adjustment is independent and immutable', () => {
  const p = parsePath('M 0 0 C 20 0 80 0 100 0 L 80 80');
  const moved = movePathPoint(p, 1, 'point', { x: 110, y: 20 });
  assert.deepEqual(moved.points[1], { x: 110, y: 20, in: { x: 90, y: 20 } });
  const handle = movePathPoint(p, 0, 'out', { x: 20, y: 30 });
  assert.deepEqual(handle.points[0], { x: 0, y: 0, out: { x: 20, y: 30 } });
  assert.equal(p.points[1].x, 100);
  for (const args of [[-1, 'point', { x: 0, y: 0 }], [3, 'point', { x: 0, y: 0 }], [0, 'unknown', { x: 0, y: 0 }], [0, 'point', { x: 0, y: NaN }]]) assert.throws(() => movePathPoint(p, ...args));
});
test('exact cubic bounds put the initial transform frame around the artwork', () => {
  assert.deepEqual(pathBounds(parsePath('M0 0 C0 100 100 100 100 0 L50 -20 Z')), { x: 0, y: -20, width: 100, height: 95 });
  assert.deepEqual(pathBounds(parsePath('M0 0 L100 0')), { x: 0, y: 0, width: 100, height: 1 });
});
test('drawing and transformed parent mappings invert rotation, skew and negative coordinates', () => {
  const m = [1.5, .4, -.7, 2, 60, 900], p = { x: 130, y: -500 };
  const result = mapPoint(m, mapPoint(m, p), true);
  assert.ok(Math.abs(result.x - p.x) < 1e-8); assert.ok(Math.abs(result.y - p.y) < 1e-8);
  for (const bad of [[0, 0, 0, 0, 0, 0], [1, 0, 0, 1, NaN, 0], [1, 2]]) assert.throws(() => mapPoint(bad, p, true));
  assert.deepEqual(mapPoint([0, 0, 0, 0, 20, 30], p), { x: 20, y: 30 });
});
