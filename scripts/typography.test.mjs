// guards: src/model/fonts.ts, src/components/editorFoundation/transformGestures.ts
//
// R1.2b.2 TYPOGRAPHY AND FIT (docs/research/editor-r1-2b-2/README.md). The pure parts: the weights
// a font really draws, and a text box resized from one side, checked against a model of the rendered
// box (screen = parent x (position + origin) + local x (p - origin)) so the opposite side stays and
// the letters are untouched. What needs a DOM or Chromium (the writers, their refusals, the canvas
// and the inspector) is e2e/editor-typography.spec.ts.
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
const [{ fontWeights }, { apply, invert, multiply, ownLinear, localFrame, resizeBox }] = await Promise.all(
  ['src/model/fonts.ts', 'src/components/editorFoundation/transformGestures.ts'].map(load));

const close = (a, b, tolerance = 1e-9) => Math.abs(a - b) <= tolerance;
const samePoint = (p, q, what = '') => assert.ok(close(p.x, q.x) && close(p.y, q.y), `${what} ${JSON.stringify(p)} vs ${JSON.stringify(q)}`);

test('a font offers the weights it really draws, named as type menus name them', () => {
  const values = family => fontWeights(family).map(w => w.value);
  assert.deepEqual(fontWeights('Inter, sans-serif').map(w => w.label), ['Regular', 'Medium', 'Semibold', 'Bold', 'Extra bold']);
  // A quoted family in a stack, as the browser reports it.
  assert.deepEqual(values('"Space Grotesk", Arial, sans-serif'), [400, 500, 600, 700]);
  assert.deepEqual(fontWeights('"Bebas Neue", sans-serif'), [{ value: 400, label: 'Regular' }]);
  assert.deepEqual(fontWeights('"IBM Plex Sans"').map(w => w.label), ['Thin', 'Extra light', 'Light', 'Regular', 'Medium', 'Semibold', 'Bold']);
  assert.deepEqual(values('Archivo'), [400, 500, 600, 700, 800, 900]);
  // A face the app does not bundle: Regular to Extra bold.
  assert.deepEqual(values('"Some House Face", serif'), [400, 500, 600, 700, 800]);
  assert.deepEqual(values(''), [400, 500, 600, 700, 800]);
});

/** A box w x h whose own transform M turns about `origin` (box units), placed at `position` in a
 *  parent mapped to the screen by `parent`; the corners are what the preview reports. */
function box({ w, h, rotation = 0, scaleX = 1, scaleY = 1, origin = { x: w / 2, y: h / 2 }, position = { x: 0, y: 0 }, parent = [1, 0, 0, 1] }) {
  const own = ownLinear(rotation, scaleX, scaleY);
  const screen = p => { const o = apply(parent, { x: position.x + origin.x, y: position.y + origin.y }), d = apply(multiply(parent, own), { x: p.x - origin.x, y: p.y - origin.y }); return { x: o.x + d.x, y: o.y + d.y }; };
  const corners = [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }].map(screen);
  return { w, h, rotation, scaleX, scaleY, origin, position, parent, screen, corners, local: localFrame(corners, [w, h]) };
}
const mid = (b, side) => b.screen([{ x: b.w / 2, y: 0 }, { x: b.w, y: b.h / 2 }, { x: b.w / 2, y: b.h }, { x: 0, y: b.h / 2 }][side]);

test('a side handle resizes a text box along its own sides and keeps the opposite side where it was', () => {
  for (const rotation of [0, 30, -120]) for (const parent of [[1, 0, 0, 1], [0.5, 0, 0, 0.5], multiply([0.8, 0, 0, 0.8], ownLinear(15, 1, 1))]) for (const scale of [1, 1.5]) for (const fixed of [false, true]) {
    const before = box({ w: 400, h: 120, rotation, scaleX: scale, scaleY: scale, origin: fixed ? { x: 30, y: 20 } : { x: 200, y: 60 }, position: { x: 300, y: 200 }, parent });
    const along = apply(before.local, { x: 1, y: 0 }), down = apply(before.local, { x: 0, y: 1 });
    for (const side of [0, 1, 2, 3]) {
      const what = `rotation ${rotation} scale ${scale} parent ${parent} ${fixed ? 'anchored' : 'default origin'} side ${side}`;
      // The pointer moves 40 box units outward from the dragged side, plus some sideways slip that must not count.
      const out = side === 1 ? along : side === 3 ? { x: -along.x, y: -along.y } : side === 2 ? down : { x: -down.x, y: -down.y };
      const slip = side % 2 ? down : along;
      const delta = { x: out.x * 40 + slip.x * 9, y: out.y * 40 + slip.y * 9 };
      const { size, shift } = resizeBox(before.local, parent, { x: 400, y: 120 }, before.origin, fixed, side, delta);
      assert.deepEqual([close(size.x, side % 2 ? 440 : 400), close(size.y, side % 2 ? 120 : 160)], [true, true], `${what}: ${JSON.stringify(size)}`);
      const origin = fixed ? before.origin : { x: size.x / 2, y: size.y / 2 };
      const after = box({ w: size.x, h: size.y, rotation, scaleX: scale, scaleY: scale, origin, position: { x: 300 + shift.x, y: 200 + shift.y }, parent });
      samePoint(mid(after, (side + 2) % 4), mid(before, (side + 2) % 4), `${what}: opposite side`);
      // The dragged side followed the pointer along the box's own axis.
      const moved = mid(after, side), from = mid(before, side);
      assert.ok(close((moved.x - from.x) * out.x + (moved.y - from.y) * out.y, 40 * (out.x * out.x + out.y * out.y), 1e-6), what);
    }
  }
  // An unturned, default-origin box at the identity widens to the right with no Position change.
  const plain = box({ w: 400, h: 120 });
  const right = resizeBox(plain.local, [1, 0, 0, 1], { x: 400, y: 120 }, plain.origin, false, 1, { x: 25, y: 3 });
  samePoint(right.size, { x: 425, y: 120 }); samePoint(right.shift, { x: 0, y: 0 });
  // From the left, Position follows the left side.
  samePoint(resizeBox(plain.local, [1, 0, 0, 1], { x: 400, y: 120 }, plain.origin, false, 3, { x: -25, y: 0 }).shift, { x: -25, y: 0 });
  // A box never collapses below the minimum, and a box with no area cannot be framed.
  assert.equal(resizeBox(plain.local, [1, 0, 0, 1], { x: 400, y: 120 }, plain.origin, false, 1, { x: -900, y: 0 }).size.x, 1);
  assert.equal(resizeBox(plain.local, [1, 0, 0, 1], { x: 400, y: 120 }, plain.origin, false, 2, { x: 0, y: -500 }, 8).size.y, 8);
  assert.throws(() => resizeBox([0, 0, 0, 1], [1, 0, 0, 1], { x: 400, y: 120 }, plain.origin, false, 1, { x: 5, y: 0 }), /zero scale/);
  assert.ok(invert(plain.local));
});
