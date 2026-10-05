// guards: src/blocks/arrangementGeometry.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { rolldown } from 'rolldown';
const bundle = await rolldown({ input: 'src/blocks/arrangementGeometry.ts', platform: 'neutral', logLevel: 'silent' });
const { output } = await bundle.generate({ format: 'esm', codeSplitting: false }); await bundle.close();
const { arrangementDeltas } = await import(`data:text/javascript;base64,${Buffer.from(output[0].code).toString('base64')}`);
const parts = [{ selector: '#a', x: -50, y: 30, width: 70, height: 20 }, { selector: '#b', x: 120, y: 95, width: 30, height: 50 }, { selector: '#c', x: 300, y: 190, width: 110, height: 30 }];
test('all alignment edges use rendered selection extent and canvas dimensions', () => {
  for (const axis of ['x', 'y']) for (const [edge, fraction] of [['start', 0], ['center', .5], ['end', 1]]) for (const canvas of [undefined, { width: 1920, height: 1080 }]) {
    const size = axis === 'x' ? 'width' : 'height', start = canvas ? 0 : Math.min(...parts.map(p => p[axis])), end = canvas ? canvas[size] : Math.max(...parts.map(p => p[axis] + p[size]));
    const deltas = arrangementDeltas(parts, { kind: 'align', axis, edge }, canvas);
    deltas.forEach((d, i) => assert.equal(parts[i][axis] + d[axis] + fraction * parts[i][size], start + fraction * (end - start)));
  }
});
test('equal gaps retain endpoints and original ordering without mutating the input', () => {
  const saved = JSON.stringify(parts);
  for (const axis of ['x', 'y']) {
    const size = axis === 'x' ? 'width' : 'height', moved = arrangementDeltas([parts[2], parts[0], parts[1]], { kind: 'distribute', axis });
    assert.equal(moved[0][axis], 0); assert.equal(moved[1][axis], 0);
    const mid = parts[1][axis] + moved[2][axis];
    assert.equal(mid - parts[0][axis] - parts[0][size], parts[2][axis] - mid - parts[1][size]);
  }
  assert.equal(JSON.stringify(parts), saved);
});
test('overlapping artwork has equal negative gaps and thin paths align', () => {
  const overlap = parts.map((p, i) => ({ ...p, x: i * 10, width: 80 }));
  assert.equal(arrangementDeltas(overlap, { kind: 'distribute', axis: 'x' })[1].x, 0);
  const thin = [{ ...parts[0], height: 0 }];
  assert.equal(arrangementDeltas(thin, { kind: 'align', axis: 'y', edge: 'center' }, { width: 1920, height: 1080 })[0].y, 510);
});
test('invalid counts, duplicate identities and nonfinite bounds refuse', () => {
  assert.throws(() => arrangementDeltas(parts.slice(0, 2), { kind: 'distribute', axis: 'x' }), /three/);
  assert.throws(() => arrangementDeltas(parts.slice(0, 1), { kind: 'align', axis: 'x', edge: 'start' }), /two/);
  for (const bad of [[parts[0], parts[0]], [{ ...parts[0], width: -1 }, parts[1]], [{ ...parts[0], x: Infinity }, parts[1]]]) assert.throws(() => arrangementDeltas(bad, { kind: 'align', axis: 'x', edge: 'start' }), /bounds/);
  assert.throws(() => arrangementDeltas(parts, { kind: 'align', axis: 'y', edge: 'end' }, { width: 0, height: 20 }), /dimensions/);
});
test('distribution pins the rendered extremes even when a wider item starts before the last item', () => {
  const bounds = [{selector:'#left',x:0,y:0,width:10,height:10},{selector:'#right',x:30,y:0,width:100,height:10},{selector:'#middle',x:50,y:0,width:10,height:10}];
  const deltas = arrangementDeltas(bounds, {kind:'distribute',axis:'x'});
  assert.equal(deltas[0].x,0); assert.equal(deltas[1].x,0);
  assert.equal(50+deltas[2].x-10,30-(50+deltas[2].x+10));
  assert.throws(() => arrangementDeltas([{...bounds[0],width:200},bounds[1],bounds[2]], {kind:'distribute',axis:'x'}), /outer/);
});
