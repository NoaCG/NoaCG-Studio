// guards: src/templates/shared/lookEntrance.ts, src/blocks/behaviourLook.ts, src/components/editorFoundation/operations.ts
// DOM persistence and real GSAP SVG restoration are covered in editor-fidelity-trim.spec.ts.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/templates/shared/lookEntrance.ts', import.meta.url), 'utf8');
const runtime = source.slice(source.indexOf('`') + 1, source.lastIndexOf('`'));
function fixture() {
  const tweens = [], restored = [], legacy = [];
  const context = {
    motionSpeed: () => 2,
    gsap: {
      getProperty: (_, property) => property === 'opacity' ? .6 : 1,
      fromTo: (el, from, to) => tweens.push({ el, from, to }),
      context: run => { run(); return { revert: () => restored.push(true) }; },
    },
    noacgLookShow: (el, on) => { const landed = on && !el.on; el.on = on; return landed; },
    noacgPop: el => legacy.push(el),
    noacgSnap: el => { context.noacgLookShow(el, true); context.noacgPop(el); return 'snapped'; },
    noacgResetGraphic: () => 'reset', noacgResetPointers: () => 'rest',
    play: () => 'play', stop: () => 'stop',
  };
  vm.runInNewContext(runtime, context);
  const node = entrance => ({ on: false, getAttribute: () => entrance });
  return { context, tweens, restored, legacy, node };
}

test('configured entrances land once; repaints stay quiet and state re-entry can replay', () => {
  const { context: w, tweens, restored, node } = fixture(), el = node('fade');
  assert.equal(w.noacgLookShow(el, true), true); w.noacgPop(el);
  assert.equal(tweens.length, 1);
  assert.equal(tweens[0].from.opacity, 0); assert.equal(tweens[0].to.opacity, .6);
  assert.equal(tweens[0].to.duration, .125);
  w.noacgLookShow(el, true); w.noacgLookShow(el, true);
  assert.equal(tweens.length, 1);
  w.noacgPop(el);
  assert.equal(tweens.length, 2); assert.equal(restored.length, 1);
  w.noacgLookShow(el, false); assert.equal(restored.length, 2);
  w.noacgLookShow(el, true); assert.equal(tweens.length, 3);
  tweens[2].to.onComplete(); assert.equal(restored.length, 3);
});

test('cut suppresses legacy pops; unconfigured saved looks keep theirs', () => {
  const { context: w, tweens, legacy, node } = fixture();
  const cut = node('cut'), original = node(null);
  for (const el of [cut, original]) { w.noacgLookShow(el, true); w.noacgPop(el); w.noacgLookShow(el, true); w.noacgPop(el); }
  assert.equal(tweens.length, 0); assert.deepEqual(legacy, [original, original]);
});

test('snap is immediate; hide, Out, reset and replay restore interrupted entrances', () => {
  const { context: w, tweens, restored, node } = fixture(), el = node('pop');
  assert.equal(w.noacgSnap(el), 'snapped'); assert.equal(tweens.length, 0);
  for (const cancel of ['stop', 'play', 'noacgResetGraphic', 'noacgResetPointers']) {
    w.noacgLookShow(el, false); w.noacgLookShow(el, true);
    assert.equal(tweens.at(-1).from.scaleX, 1.04);
    w[cancel]();
  }
  assert.equal(tweens.length, 4); assert.equal(restored.length, 4);
});
