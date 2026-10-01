// guards: src/components/editorFoundation/transformGestures.ts, src/components/editorFoundation/animationAuthoring.ts, src/blocks/editorAnimation.ts, src/blocks/baseEdits.ts
//
// R1.2b.1 CANVAS TRANSFORM TOOLS (docs/research/editor-r1-2b-1/README.md). The rotation handle, the
// edge scale handles and the anchor point are pure geometry over what the preview renders, and every
// gesture writes the operations the numeric fields write. Here the geometry is checked against a
// model of the rendered layer (screen = parent x (position + anchor + R S (p - anchor))): an unwrapped
// rotation, scale ratios in a rotated layer's own axes, the pivot a scale keeps, the pose an anchor
// move keeps, and the operations each writes (keys where animated, the base elsewhere). What needs a
// DOM or Chromium (the anchor's CSS and its refusals, the canvas, the inspector) is
// e2e/editor-canvas-transforms.spec.ts.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rolldown } from 'rolldown';
import { rawSuffix } from './rolldown-raw.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
async function load(entry) {
  const bundle = await rolldown({ input: path.join(root, entry), platform: 'neutral', plugins: [rawSuffix], logLevel: 'silent' });
  const { output } = await bundle.generate({ format: 'esm', codeSplitting: false });
  await bundle.close();
  return import(`data:text/javascript;base64,${Buffer.from(output[0].code, 'utf8').toString('base64')}`);
}
const [gestures, { anchorOperations, shownAnchor, transformOperations, displayedBase }] = await Promise.all(
  ['src/components/editorFoundation/transformGestures.ts', 'src/components/editorFoundation/animationAuthoring.ts'].map(load));
const { apply, invert, multiply, localFrame, edgePoints, rotationKnob, sweep, snapRotation, handleRatios, pivotShift, ownLinear, anchorShift } = gestures;

const k = (time, value) => ({ time, value });
const one = layers => ({ version: 2, root: '.g', speed: 1, steps: [{ name: 'In', duration: 2, ease: 'none', layers }, { name: 'Out', duration: 1, ease: 'none', layers: {} }] });
const close = (a, b, tolerance = 1e-9) => Math.abs(a - b) <= tolerance;
const samePoint = (p, q, tolerance = 1e-9, what = '') => assert.ok(close(p.x, q.x, tolerance) && close(p.y, q.y, tolerance), `${what} ${JSON.stringify(p)} vs ${JSON.stringify(q)}`);

/**
 * A rendered layer: a w x h box whose own transform (rotation, then scale) turns about `anchor` (box
 * pixels), placed at `position` in its parent, whose units map to the screen by `parent`. This is how
 * CSS and GSAP draw a layer, and what the preview's corners and anchor report.
 */
function layer({ w = 300, h = 120, rotation = 0, scaleX = 1, scaleY = 1, anchor = { x: w / 2, y: h / 2 }, position = { x: 0, y: 0 }, parent = [1, 0, 0, 1] }) {
  const own = ownLinear(rotation, scaleX, scaleY);
  const screen = p => apply(parent, { x: position.x + anchor.x + apply(own, { x: p.x - anchor.x, y: p.y - anchor.y }).x, y: position.y + anchor.y + apply(own, { x: p.x - anchor.x, y: p.y - anchor.y }).y });
  const corners = [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }].map(screen);
  return { w, h, rotation, scaleX, scaleY, anchor, position, parent, screen, corners, anchorAt: screen(anchor), frame: localFrame(corners, [w, h]) };
}

test('a turn of the rotation handle is unwrapped, follows the pointer through a mirrored parent, and Shift snaps to 15 degrees', () => {
  const at = (deg, r = 50) => ({ x: r * Math.cos(deg * Math.PI / 180), y: r * Math.sin(deg * Math.PI / 180) });
  const origin = { x: 0, y: 0 }, identity = [1, 0, 0, 1];
  assert.ok(close(sweep(identity, origin, at(0), at(90)), 90));
  // Crossing the back of the circle is a small step, never a jump of 360.
  assert.ok(close(sweep(identity, origin, at(170), at(-170)), 20));
  assert.ok(close(sweep(identity, origin, at(-170), at(170)), -20));
  // Two full turns in 10 degree steps sum to 720, not 0.
  let total = 0;
  for (let deg = 0; deg < 720; deg += 10) total += sweep(identity, origin, at(deg), at(deg + 10));
  assert.ok(close(total, 720, 1e-9), String(total));
  // Read in the parent's coordinates: a mirrored parent turns the layer the other way, a uniformly
  // scaled or rotated one does not change the angle.
  assert.ok(close(sweep([-1, 0, 0, 1], origin, at(0), at(30)), -30));
  assert.ok(close(sweep(multiply([2, 0, 0, 2], ownLinear(40, 1, 1)), origin, at(10), at(55)), 45, 1e-9));
  assert.equal(sweep(identity, origin, origin, at(30)), 0, 'a pointer on the pivot has no angle');
  assert.throws(() => sweep([0, 0, 0, 1], origin, at(0), at(30)), /zero scale/);
  assert.deepEqual([37, 38, -7, 722, 7.5, -22.6].map(v => snapRotation(v)), [30, 45, 0, 720, 15, -30]);
  assert.ok(Object.is(snapRotation(-3), 0), 'no negative zero');
});

test('scale handles measure the pointer in the layer\'s own axes and keep the opposite side or corner in place', () => {
  for (const rotation of [0, 30, -120]) for (const parent of [[0.57, 0, 0, 0.57], multiply([0.5, 0, 0, 0.5], ownLinear(-15, 1, 1))]) {
    const l = layer({ rotation, scaleX: 1.25, scaleY: 0.8, parent, position: { x: 400, y: 200 } });
    const edges = edgePoints(l.corners), axis = apply(l.frame, { x: 1, y: 0 }), down = apply(l.frame, { x: 0, y: 1 });
    const unit = v => { const n = Math.hypot(v.x, v.y); return { x: v.x / n, y: v.y / n }; };
    // The right side dragged 40 px outward along the layer's own X: X scales by the side's ratio, Y does not.
    const out = unit(axis), push = { x: out.x * 40, y: out.y * 40 };
    const side = Math.hypot(axis.x, axis.y) * l.w;
    const ratios = handleRatios(l.frame, edges[1], edges[3], push, 'x', false);
    assert.ok(close(ratios.x, 1 + 40 / side, 1e-9), `${rotation}: ${ratios.x}`);
    assert.equal(ratios.y, 1);
    // Along the side itself it does nothing.
    assert.ok(close(handleRatios(l.frame, edges[1], edges[3], { x: unit(down).x * 25, y: unit(down).y * 25 }, 'x', false).x, 1, 1e-9));
    // Shift (uniform) scales both by the side's ratio; a corner linked takes the larger change.
    assert.deepEqual(handleRatios(l.frame, edges[2], edges[0], { x: unit(down).x * 30, y: unit(down).y * 30 }, 'y', true).x,
      handleRatios(l.frame, edges[2], edges[0], { x: unit(down).x * 30, y: unit(down).y * 30 }, 'y', true).y);
    const free = handleRatios(l.frame, l.corners[2], l.corners[0], { x: push.x + unit(down).x * 10, y: push.y + unit(down).y * 10 }, 'xy', false);
    const tied = handleRatios(l.frame, l.corners[2], l.corners[0], { x: push.x + unit(down).x * 10, y: push.y + unit(down).y * 10 }, 'xy', true);
    assert.ok(free.x !== free.y && tied.x === tied.y && tied.x === (Math.abs(free.x - 1) >= Math.abs(free.y - 1) ? free.x : free.y));
    // Applying the ratios with pivotShift keeps the left side exactly where it was.
    const shift = pivotShift(parent, l.frame, ratios, edges[3], l.anchorAt);
    const after = layer({ rotation, scaleX: 1.25 * ratios.x, scaleY: 0.8 * ratios.y, parent, position: { x: 400 + shift.x, y: 200 + shift.y } });
    samePoint(after.corners[0], l.corners[0], 1e-9, `${rotation} top-left`);
    samePoint(after.corners[3], l.corners[3], 1e-9, `${rotation} bottom-left`);
    // A corner keeps the opposite corner; about the anchor (Alt), the anchor stays and Position does not move.
    const cornerShift = pivotShift(parent, l.frame, free, l.corners[0], l.anchorAt);
    samePoint(layer({ rotation, scaleX: 1.25 * free.x, scaleY: 0.8 * free.y, parent, position: { x: 400 + cornerShift.x, y: 200 + cornerShift.y } }).corners[0], l.corners[0], 1e-9, 'corner');
    samePoint(pivotShift(parent, l.frame, free, l.anchorAt, l.anchorAt), { x: 0, y: 0 });
    // About the anchor (Alt) the pivot is off the side's line: a side still scales its own axis only.
    const aside = handleRatios(l.frame, edges[1], l.screen({ x: 40, y: 10 }), { x: push.x + unit(down).x * 15, y: push.y + unit(down).y * 15 }, 'x', false);
    assert.ok(aside.x !== 1 && aside.y === 1, JSON.stringify(aside));
    const low = handleRatios(l.frame, edges[2], l.screen({ x: 40, y: 10 }), { x: push.x + unit(down).x * 15, y: push.y + unit(down).y * 15 }, 'y', false);
    assert.ok(low.y !== 1 && low.x === 1, JSON.stringify(low));
    // An SVG element's axes are its parent's turned by its rotation; the ratios are the same.
    const svgFrame = multiply(parent, ownLinear(rotation, 1, 1));
    assert.ok(close(handleRatios(svgFrame, edges[1], edges[3], push, 'x', false).x, ratios.x, 1e-9));
  }
  // An unrotated layer gets what R1.1a's parent-frame arithmetic gave.
  const l = layer({ scaleX: 1.5, parent: [0.5, 0, 0, 0.5] }), handle = l.corners[2], pivot = l.corners[0], delta = { x: 30, y: 12 };
  const start = apply(invert(l.parent), { x: handle.x - pivot.x, y: handle.y - pivot.y }), change = apply(invert(l.parent), delta);
  const ratios = handleRatios(l.frame, handle, pivot, delta, 'xy', false);
  assert.ok(close(ratios.x, (start.x + change.x) / start.x) && close(ratios.y, (start.y + change.y) / start.y));
  const offset = apply(invert(l.parent), { x: l.anchorAt.x - pivot.x, y: l.anchorAt.y - pivot.y });
  samePoint(pivotShift(l.parent, l.frame, ratios, pivot, l.anchorAt), { x: (ratios.x - 1) * offset.x, y: (ratios.y - 1) * offset.y });
  // A handle on the pivot's own line leaves that axis alone; a box with no area cannot be framed.
  assert.equal(handleRatios(l.frame, l.corners[1], l.corners[0], { x: 0, y: 30 }, 'xy', false).y, 1);
  assert.throws(() => localFrame(l.corners, [300, 0]), /no area/);
  assert.throws(() => invert(localFrame([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }], [3, 3])), /zero scale/);
});

test('the rotation handle sits outside the top side, away from the centre, however the layer turns', () => {
  for (const rotation of [0, 90, 200]) {
    const l = layer({ rotation }), { from, at } = rotationKnob(l.corners, 24), centre = l.screen({ x: l.w / 2, y: l.h / 2 });
    samePoint(from, edgePoints(l.corners)[0]);
    assert.ok(close(Math.hypot(at.x - from.x, at.y - from.y), 24));
    assert.ok(Math.hypot(at.x - centre.x, at.y - centre.y) > Math.hypot(from.x - centre.x, from.y - centre.y));
  }
  // A box without height still gets a handle off its top side.
  const flat = [{ x: 0, y: 10 }, { x: 100, y: 10 }, { x: 100, y: 10 }, { x: 0, y: 10 }];
  assert.ok(close(Math.hypot(rotationKnob(flat, 24).at.x - 50, rotationKnob(flat, 24).at.y - 10), 24));
});

test('moving the anchor with compensation keeps every point of the pose; numerically it moves only the pivot', () => {
  for (const [rotation, scaleX, scaleY] of [[30, 1.5, 0.8], [0, 1, 1], [-90, 2, 2], [720, 1, 1], [45, -1, 1]]) {
    const before = layer({ rotation, scaleX, scaleY, anchor: { x: 0, y: 0 }, position: { x: 700, y: 380 } });
    const anchor = { x: 150, y: 60 }, shift = anchorShift(ownLinear(rotation, scaleX, scaleY), { x: 150, y: 60 });
    const after = layer({ rotation, scaleX, scaleY, anchor, position: { x: 700 + shift.x, y: 380 + shift.y } });
    for (let i = 0; i < 4; i++) samePoint(after.corners[i], before.corners[i], 1e-9, `${rotation} corner ${i}`);
  }
  samePoint(anchorShift(ownLinear(90, 1, 1), { x: 10, y: 0 }), { x: -10, y: 10 });
  samePoint(anchorShift(ownLinear(720, 1, 1), { x: 10, y: 4 }), { x: 0, y: 0 });
});

test('anchor operations: one base write unanimated, a key where Position is animated, only the pivot when typed, and never a guess', () => {
  const base = { selector: '#a', target: '#a', mode: 'flow', scaled: true, originX: 0, originY: 0, scaleReason: null, anchorReason: null, anchor: null, x: 40, y: 100, scaleX: 1, scaleY: 1, rotation: 0 };
  const pose = (motion, extra = {}) => ({ motion: { x: 0, y: 0, xPercent: 0, yPercent: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1, ...motion },
    initialMotion: { x: 0, y: 0, xPercent: 0, yPercent: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 }, unit: 2, size: [300, 120], box: [300, 120], origin: [300, 120], ...extra });
  const at = { step: 0, time: 0.4 };
  // The shown anchor: the rendered pivot in layer pixels, or the declared one.
  assert.deepEqual(shownAnchor(base, pose({})), { x: 150, y: 60 });
  assert.deepEqual(shownAnchor({ ...base, anchor: { x: 3, y: 4 } }, pose({})), { x: 3, y: 4 });
  assert.equal(shownAnchor(base, pose({}, { origin: undefined })), null);
  assert.throws(() => anchorOperations(one({}), '#a', '#a', base, pose({}, { origin: undefined }), { x: 0, y: 0 }, true, at), /Wait for the rendered anchor/);
  // Typed: the pivot only, whatever turns about it.
  assert.deepEqual(anchorOperations(one({}), '#a', '#a', { ...base, rotation: 30 }, pose({ rotation: 0 }), { x: 0, y: 7 }, false, at),
    [{ kind: 'base.set', selector: '#a', values: { anchorX: 0, anchorY: 7 } }]);
  // Nothing turns or scales: no Position change at all.
  assert.deepEqual(anchorOperations(one({}), '#a', '#a', base, pose({}), { x: 0, y: 0 }, true, at), [{ kind: 'base.set', selector: '#a', values: { anchorX: 0, anchorY: 0 } }]);
  // Rotated 90 on the base: (M - I) x (-150, -60) = (150 - 60, 60 + 150) layer pixels, all on the base.
  const turned = { ...base, rotation: 90 }, shift = anchorShift(ownLinear(90, 1, 1), { x: -150, y: -60 });
  const ops = anchorOperations(one({}), '#a', '#a', turned, pose({}), { x: 0, y: 0 }, true, at);
  assert.equal(ops.length, 1);
  assert.equal(ops[0].kind, 'base.set');
  assert.ok(close(ops[0].values.x, 40 + shift.x) && close(ops[0].values.y, 100 + shift.y) && ops[0].values.anchorX === 0 && ops[0].values.anchorY === 0);
  // Frosted Panel at 0.28 s: scale 0.95 and y animated. y keys at the playhead (in its pixels), x moves the base.
  const panel = one({ '#a': { scale: [k(0, 0.9), k(1, 1)], y: [k(0, 24), k(1, 0)] } }), posed = pose({ scaleX: 0.95, scaleY: 0.95, y: 12 });
  const keyed = anchorOperations(panel, '#a', '#a', base, posed, { x: 100, y: 30 }, true, at);
  const move = anchorShift(ownLinear(0, 0.95, 0.95), { x: -50, y: -30 });
  assert.deepEqual(keyed.map(o => o.kind), ['animation.key', 'base.set']);
  assert.equal(keyed[0].property, 'y');
  assert.ok(close(keyed[0].value, 12 + move.y * 2), String(keyed[0].value));
  assert.deepEqual(Object.keys(keyed[1].values).sort(), ['anchorX', 'anchorY', 'x']);
  assert.ok(close(keyed[1].values.x, 40 + move.x));
  // A shown scale or rotation is the base and the motion together (displayedBase), as rendered.
  assert.ok(close(displayedBase(base, posed, 'scaleX'), 0.95));
  // Where rotation and scale never move (a Clean Steps row animates yPercent only), M is the same at
  // every time: the base moves, keeping the whole path, and no Position key is added.
  const row = one({ '#a': { yPercent: [k(0.5, 110), k(1.2, 0)] } }), turnedRow = { ...base, rotation: 90 };
  const whole = anchorOperations(row, '#a', '#a', turnedRow, pose({ yPercent: 40 }), { x: 0, y: 0 }, true, at);
  assert.deepEqual(whole.map(o => o.kind), ['base.set']);
  assert.ok(close(whole[0].values.x, 40 + shift.x) && close(whole[0].values.y, 100 + shift.y));
  // A raw transform string can turn or scale, so it is motion too: only the pose at the playhead can
  // be kept, by a Position key, which a raw transform refuses (R1.2a.6), so the drag refuses.
  assert.throws(() => anchorOperations(one({ '#a': { transform: [k(0, 'rotate(0deg)'), k(1, 'rotate(40deg)')], y: [k(0, 0), k(1, 10)] } }), '#a', '#a', turnedRow, pose({}), { x: 0, y: 0 }, true, at), /raw transform/);
  // The rendered own transform wins over the shown Rotation and Scale: a CSS skew of the layer's own.
  const skew = [1, 0, Math.tan(-8 * Math.PI / 180), 1];
  const skewed = anchorOperations(one({}), '#a', '#a', base, pose({}, { own: skew }), { x: 150, y: 260 }, true, at);
  assert.ok(close(skewed[0].values.x, 40 + Math.tan(-8 * Math.PI / 180) * 200) && close(skewed[0].values.y, 100), JSON.stringify(skewed));
});

test('a handle gesture writes what typing writes: a turn keys an animated rotation unwrapped, else the base, which a raw transform leaves to the base write', () => {
  const base = { selector: '#a', target: '#a', mode: 'absolute', scaled: false, originX: 0, originY: 0, scaleReason: null, anchorReason: null, anchor: null, x: 700, y: 380, scaleX: 1, scaleY: 1, rotation: 0 };
  const pose = rotation => ({ motion: { x: 0, y: 0, xPercent: 0, yPercent: 0, scaleX: 1, scaleY: 1, rotation, opacity: 1 },
    initialMotion: { x: 0, y: 0, xPercent: 0, yPercent: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 }, unit: 1 });
  const at = { step: 0, time: 0.4 };
  // Two turns on the base stay 720.
  assert.deepEqual(transformOperations(one({}), '#a', '#a', base, pose(0), { rotation: 720 }, at), [{ kind: 'base.set', selector: '#a', values: { rotation: 720 } }]);
  // Animated: the key at the playhead is the shown value plus the turn, in degrees, unwrapped.
  assert.deepEqual(transformOperations(one({ '#a': { rotation: [k(0, 0), k(1, 40)] } }), '#a', '#a', base, pose(16), { rotation: 16 + 720 }, at),
    [{ kind: 'animation.key', selector: '#a', property: 'rotation', step: 0, time: 0.4, value: 736, action: 'set' }]);
  // A raw transform's Rotation is not a channel the editor keys: it goes to the base, whose write refuses
  // it (editBase, in the browser spec), since the transform string would replace a base rotation.
  assert.deepEqual(transformOperations(one({ '#a': { transform: [k(0, 'rotate(0deg)'), k(1, 'rotate(40deg)')] } }), '#a', '#a', base, pose(0), { rotation: 30 }, at),
    [{ kind: 'base.set', selector: '#a', values: { rotation: 30 } }]);
  // A side handle on a layer keying only scaleX keys that axis; the other axis is left alone.
  const accent = one({ '#a': { scaleX: [k(0, 0), k(0.6, 1)] } });
  assert.deepEqual(transformOperations(accent, '#a', '#a', base, pose(0), { scaleX: 1.2, scaleY: 1 }, at).map(o => [o.kind, o.property ?? Object.keys(o.values)]), [['animation.key', 'scaleX']]);
});
