// guards: src/blocks/animEdit.ts, src/blocks/editorAnimation.ts, src/blocks/animEval.ts, src/blocks/animData.ts, src/templates/shared/easeRuntime.ts, src/templates/shared/animRuntime.ts, src/templates/shared/animRuntimeLegacy.ts, src/components/editorFoundation/operations.ts, src/assets/gsap.min.js, e2e/fixtures/interpreter-whole-ease-v1.js
//
// R1.2a.2 KEY-SIDE EASING, THE MATHEMATICS (docs/research/editor-r1-2a-2/README.md). A key's In
// side arrives through the segment stored on it; its Out side departs through the segment stored
// on the next key. Linear and the Easy Ease presets write cubic-bezier points and keep the other
// side exactly or refuse; Bounce and Overshoot set the whole arriving segment; Hold the whole
// departing one. One batch is atomic: anything that cannot be written exactly refuses the whole
// batch with the input untouched. What the presets play in Chromium, in the simulator and every
// export, and the editor's selection, menus and history, are e2e/editor-ease.spec.ts and
// e2e/editor-key-ease.spec.ts.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFileSync } from 'node:fs';
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

const { easeKeys, planKeyEase, KEY_EASE_PRESETS } = await load('src/blocks/animEdit.ts');
const { resolveValue } = await load('src/blocks/animEval.ts');
const { parseAnimData } = await load('src/blocks/animData.ts');
const ease = await load('src/templates/shared/easeRuntime.ts');
const runtime = await load('src/templates/shared/animRuntime.ts');
const { applyOperations } = await load('src/components/editorFoundation/operations.ts');

const gsapExports = {};
new Function('exports', 'module', readFileSync(path.join(root, 'src/assets/gsap.min.js'), 'utf8'))(gsapExports, {});
const { gsap } = gsapExports;

const L = '0.333333333333', L2 = '0.666666666667';
const bezier = (...points) => `cubic-bezier(${points.join(',')})`;
const key = (selector, property, time, step = 0) => ({ step, selector, property, time });

/** The browser spec's selection: first, middle and last keys of several properties on two
 *  layers, at speed 1.3. */
function sided() {
  return { version: 2, root: '.fixture', speed: 1.3, steps: [
    { name: 'In', duration: 2, ease: 'none', layers: {
      '#box': {
        x: [{ time: 0, value: -900 }, { time: 0.8, value: -200, ease: 'power2.out' }, { time: 2, value: 0 }],
        y: [{ time: 0, value: 0 }, { time: 0.8, value: -120, ease: 'cubic-bezier(0.333333333333,0.333333333333,0.6,1.5)' }, { time: 2, value: 0, ease: 'back.out(1.6)' }],
        rotation: [{ time: 0, value: -30 }, { time: 2, value: 0, ease: 'power1.in' }],
        scaleX: [{ time: 0, value: 0.5 }, { time: 1.2, value: 1 }],
        opacity: [{ time: 0, value: 0 }, { time: 1, value: 1, ease: 'none' }, { time: 2, value: 0.5 }],
      },
      '#title': { x: [{ time: 0, value: -900 }, { time: 1.6, value: 0, ease: 'power2.out' }], opacity: [{ time: 0, value: 0 }, { time: 1.5, value: 1 }] },
    } },
    { name: 'Out', duration: 1, ease: 'none', layers: {} },
  ] };
}
const SELECTION = [key('#box', 'x', 0), key('#box', 'x', 0.8), key('#box', 'x', 2), key('#box', 'y', 0.8), key('#box', 'rotation', 0),
  key('#box', 'opacity', 1), key('#title', 'x', 1.6), key('#title', 'opacity', 0)];
/** Every key's ease, per layer and property, for whole-table comparisons. */
const eases = data => Object.fromEntries(Object.entries(data.steps[0].layers).map(([s, t]) => [s, Object.fromEntries(Object.entries(t).map(([p, k]) => [p, k.map(x => x.ease ?? null)]))]));

test('the presets are the seven the plan names, in its order', () => {
  assert.deepEqual(KEY_EASE_PRESETS.map(p => p.label), ['Linear', 'Easy Ease In', 'Easy Ease Out', 'Easy Ease', 'Bounce', 'Overshoot', 'Hold']);
});

test('each preset writes its sides on a mixed selection and leaves every other key side alone', () => {
  const before = sided(), frozen = JSON.stringify(before), original = eases(before);
  // What each key's ease becomes; null is "unchanged, inherits the step default".
  const expected = {
    // x@2 inherits `none` already, and y's kept departure is Linear's point, so its segment is straight.
    linear: { '#box': { x: [null, 'none', null], y: [null, 'none', bezier(L, L, L2, 1)], rotation: [null, bezier(L, L, L2, L)], scaleX: [null, null], opacity: [null, 'none', null] },
      '#title': { x: [null, 'none'], opacity: [null, null] } },
    easeIn: { '#box': { x: [null, bezier(L, L, L2, 1), bezier(L, L, L2, 1)], y: [null, bezier('0.333333333333', '0.333333333333', L2, 1), 'back.out(1.6)'], rotation: [null, 'power1.in'], scaleX: [null, null], opacity: [null, bezier(L, L, L2, 1), null] },
      '#title': { x: [null, bezier(L, L, L2, 1)], opacity: [null, null] } },
    easeOut: { '#box': { x: [null, bezier(L, 0, L2, 1), bezier(L, 0, L2, L2)], y: [null, bezier('0.333333333333', '0.333333333333', '0.6', '1.5'), bezier(L, 0, L2, 1)], rotation: [null, bezier(L, 0, L2, L)], scaleX: [null, null], opacity: [null, 'none', bezier(L, 0, L2, L2)] },
      '#title': { x: [null, 'power2.out'], opacity: [null, bezier(L, 0, L2, L2)] } },
    easyEase: { '#box': { x: [null, bezier(L, 0, L2, 1), bezier(L, 0, L2, 1)], y: [null, bezier('0.333333333333', '0.333333333333', L2, 1), bezier(L, 0, L2, 1)], rotation: [null, bezier(L, 0, L2, L)], scaleX: [null, null], opacity: [null, bezier(L, L, L2, 1), bezier(L, 0, L2, L2)] },
      '#title': { x: [null, bezier(L, L, L2, 1)], opacity: [null, bezier(L, 0, L2, L2)] } },
    bounce: { '#box': { x: [null, 'bounce.out', 'bounce.out'], y: [null, 'bounce.out', 'back.out(1.6)'], rotation: [null, 'power1.in'], scaleX: [null, null], opacity: [null, 'bounce.out', null] },
      '#title': { x: [null, 'bounce.out'], opacity: [null, null] } },
    overshoot: { '#box': { x: [null, 'back.out(1.6)', 'back.out(1.6)'], y: [null, 'back.out(1.6)', 'back.out(1.6)'], rotation: [null, 'power1.in'], scaleX: [null, null], opacity: [null, 'back.out(1.6)', null] },
      '#title': { x: [null, 'back.out(1.6)'], opacity: [null, null] } },
    hold: { '#box': { x: [null, 'hold', 'hold'], y: [null, bezier('0.333333333333', '0.333333333333', '0.6', '1.5'), 'hold'], rotation: [null, 'hold'], scaleX: [null, null], opacity: [null, 'none', 'hold'] },
      '#title': { x: [null, 'power2.out'], opacity: [null, 'hold'] } },
  };
  for (const [preset, want] of Object.entries(expected)) {
    const after = easeKeys(before, SELECTION, preset);
    assert.equal(JSON.stringify(before), frozen, `${preset}: the input is not mutated`);
    assert.deepEqual(eases(after), want, preset);
    // Values, times, the Out cue and the step defaults are untouched.
    assert.deepEqual(after.steps.map(s => [s.duration, s.ease, Object.keys(s.layers)]), before.steps.map(s => [s.duration, s.ease, Object.keys(s.layers)]), preset);
    for (const [s, layer] of Object.entries(after.steps[0].layers)) for (const [p, keys] of Object.entries(layer)) {
      assert.deepEqual(keys.map(k => [k.time, k.value]), before.steps[0].layers[s][p].map(k => [k.time, k.value]), `${preset}: ${s} ${p} keys`);
    }
    // Re-applying is a no-op: nothing to write.
    assert.deepEqual(planKeyEase(after, SELECTION, preset), [], `${preset} again`);
  }
  assert.deepEqual(eases(before), original);
});

test('a kept side is kept exactly: bezier text, and the exact cubic arrival of power1, power2 and back', () => {
  // The exact cubic forms, checked against the bundled GSAP rather than against our own algebra.
  const GRID = Array.from({ length: 2001 }, (_, i) => i / 2000);
  for (const [name, [y1, y2]] of [['power1.in', [0, 1 / 3]], ['quad.out', [2 / 3, 1]], ['power2.in', [0, 0]], ['cubic', [1, 1]], ['power2.out', [1, 1]],
    ['back.in(1.6)', [0, -1.6 / 3]], ['back.out(1.6)', [1 + 1.6 / 3, 1]], ['back', [1 + 1.70158 / 3, 1]], ['back.in(0.5)', [0, -0.5 / 3]], ['linear', [1 / 3, 2 / 3]], ['power0.inOut', [1 / 3, 2 / 3]], ['none', [1 / 3, 2 / 3]]]) {
    const [x2, arrive] = ease.arrivingPoint(name).map(Number);
    assert.equal(x2, Number(L2), name);
    assert.ok(Math.abs(arrive - y2) < 1e-11, `${name} arrives at ${arrive}`);
    const curve = ease.easeCurve(bezier(1 / 3, y1, 2 / 3, y2)), theirs = gsap.parseEase(name);
    for (const p of GRID) assert.ok(Math.abs(curve(p) - theirs(p)) < 1e-9, `${name} is that bezier at ${p}`);
  }
  assert.deepEqual(ease.arrivingPoint('cubic-bezier(0.3, -0.4, 0.60, 1.50)'), ['0.60', '1.50'], 'hand-written text is kept byte for byte');
  assert.deepEqual(ease.departingPoint('cubic-bezier(0.3, -0.4, 0.60, 1.50)'), ['0.3', '-0.4']);
  assert.deepEqual(ease.arrivingPoint('hold'), [L2, L2], 'a Hold only departs');
  assert.deepEqual(ease.departingPoint('jump'), [L, L], 'a jump only arrives');
  // A named curve is the ease INTO its key: it never set a departure of its own.
  for (const text of ['power2.out', 'power3.out', 'bounce.out', 'back.out(1.6)', 'elastic.out(1, 0.7)', 'steps(4)', 'slice(expo.out,0.2,0.9)', 'customEase', 'none']) {
    assert.deepEqual(ease.departingPoint(text), [L, L], text);
  }
  for (const text of ['power3.out', 'power2.inOut', 'back.inOut(1.6)', 'sine.out', 'expo.in', 'circ.out', 'elastic.out(1, 0.7)', 'bounce.out', 'steps(1)', 'slice(power2.out,0.2,1)', 'jump', 'customEase']) {
    assert.equal(ease.arrivingPoint(text), null, text);
  }
  assert.equal(ease.departingPoint('hold'), null, 'a Hold departs as a jump, with no point');
  // Two points on the diagonal are a straight line, written `none`.
  assert.equal(ease.joinPoints([L, L], [L2, L2]), 'none');
  assert.equal(ease.joinPoints(['0.1', '0.1'], ['0.9', '0.9']), 'none');
  assert.equal(ease.joinPoints([L, '0'], ['0.60', '1.50']), bezier(L, 0, '0.60', '1.50'));
  // Only a bezier point off Linear's, or a Hold, is a departure set on its own.
  for (const [text, own] of [[bezier(L, 0, L2, 1), true], [bezier(L, L, '0.6', '1.5'), false], ['cubic-bezier(0.25,0.25,0.6,1)', true], ['hold', true], ['jump', false], ['power2.out', false], ['back.out(1.6)', false], ['none', false]]) {
    assert.equal(ease.departsOnItsOwn(text), own, text);
  }
});

test('both points written from both keys keep nothing, and a straight result is none', () => {
  const data = { version: 2, root: '.g', speed: 1, steps: [{ name: 'In', duration: 2, ease: 'power3.out', layers: { '#a': {
    x: [{ time: 0, value: 0 }, { time: 1, value: 100, ease: 'elastic.out(1, 0.7)' }, { time: 2, value: 50, ease: 'steps(3)' }],
  } } }] };
  const all = [key('#a', 'x', 0), key('#a', 'x', 1), key('#a', 'x', 2)];
  assert.deepEqual(easeKeys(data, all, 'easyEase').steps[0].layers['#a'].x.map(k => k.ease), [undefined, bezier(L, 0, L2, 1), bezier(L, 0, L2, 1)]);
  assert.deepEqual(easeKeys(data, all, 'linear').steps[0].layers['#a'].x.map(k => k.ease), [undefined, 'none', 'none']);
  // A key without an ease of its own follows the step default; a write equal to it changes nothing.
  const inherit = { version: 2, root: '.g', speed: 1, steps: [{ name: 'In', duration: 1, ease: 'none', layers: { '#a': { x: [{ time: 0, value: 0 }, { time: 1, value: 1 }] } } }] };
  assert.deepEqual(planKeyEase(inherit, [key('#a', 'x', 1)], 'linear'), []);
  assert.deepEqual(planKeyEase(inherit, [key('#a', 'x', 1)], 'easeIn'), [{ step: 0, selector: '#a', property: 'x', index: 1, ease: bezier(L, L, L2, 1) }]);
});

test('Bounce and Overshoot keep a departure set on its own; Hold replaces its whole segment', () => {
  const data = ease => ({ version: 2, root: '.g', speed: 1, steps: [{ name: 'In', duration: 1, ease: 'none', layers: { '#a': { x: [{ time: 0, value: 0 }, { time: 1, value: 1, ease }] } } }] });
  for (const preset of ['bounce', 'overshoot']) {
    for (const own of [bezier(L, 0, L2, 1), 'cubic-bezier(0.25,0.25,0.6,1)', 'hold']) refuse(data(own), [key('#a', 'x', 1)], preset, /#a x at 1 s in In.*(departure|holds)/);
    for (const free of ['power2.out', 'back.out(1.6)', bezier(L, L, '0.6', '1.5'), 'jump', 'customEase']) {
      assert.equal(easeKeys(data(free), [key('#a', 'x', 1)], preset).steps[0].layers['#a'].x[1].ease, preset === 'bounce' ? 'bounce.out' : 'back.out(1.6)', `${preset} over ${free}`);
    }
  }
  for (const any of [bezier(L, 0, '0.6', '1.5'), 'bounce.out', 'jump', 'customEase', 'steps(2)']) {
    assert.equal(easeKeys(data(any), [key('#a', 'x', 0)], 'hold').steps[0].layers['#a'].x[1].ease, 'hold', `Hold over ${any}`);
  }
  // A Hold's own departure is replaced by an Out side, its arrival reads as Linear's point.
  assert.equal(easeKeys(data('hold'), [key('#a', 'x', 0)], 'easeOut').steps[0].layers['#a'].x[1].ease, bezier(L, 0, L2, L2));
  refuse(data('hold'), [key('#a', 'x', 1)], 'easeIn', /#a x at 1 s in In.*holds/);
});

/** A refusal throws its reason and leaves the input exactly as it was. */
function refuse(data, keys, preset, pattern) {
  const frozen = JSON.stringify(data);
  assert.throws(() => easeKeys(data, keys, preset), pattern);
  assert.throws(() => planKeyEase(data, keys, preset), pattern);
  assert.equal(JSON.stringify(data), frozen);
}

test('every refusal is whole, names what it could not keep and leaves the input untouched', () => {
  const d = sided;
  refuse(d(), [key('#box', 'x', 0)], 'easeIn', /Nothing to ease/);
  refuse(d(), [key('#title', 'x', 1.6), key('#box', 'x', 2)], 'hold', /Nothing to ease/);
  refuse(d(), [key('#box', 'x', 0.5)], 'linear', /no longer there/);
  refuse(d(), [key('#gone', 'x', 0)], 'linear', /no longer there/);
  // One inexact side anywhere refuses the batch, even with every other side fine.
  const bouncing = d(); bouncing.steps[0].layers['#title'].x[1].ease = 'bounce.out';
  refuse(bouncing, [...SELECTION, key('#title', 'x', 0)], 'easeOut', /#title x at 0 s in In.*bounce\.out/);
  const quartic = d(); quartic.steps[0].layers['#box'].x[1].ease = 'power3.out';
  refuse(quartic, [key('#box', 'x', 0)], 'easyEase', /#box x at 0 s in In.*power3\.out/);
  for (const text of ['power2.inOut', 'slice(power2.out,0.2,1)', 'steps(4)', 'jump', 'customEase']) {
    const other = d(); other.steps[0].layers['#box'].x[1].ease = text;
    refuse(other, [key('#box', 'x', 0)], 'linear', /#box x at 0 s in In/);
  }
  const string = d(); string.steps[0].layers['#box'].filter = [{ time: 0, value: 'blur(8px)' }, { time: 1, value: 'blur(0px)' }];
  refuse(string, [key('#box', 'x', 0.8), key('#box', 'filter', 1)], 'linear', /#box filter.*numeric/);
  const looping = d(); looping.steps[0].loops = { '#box': { x: { repeat: -1 } } };
  refuse(looping, [key('#box', 'x', 0.8)], 'linear', /#box x.*loop/);
  refuse(d(), SELECTION, 'wobble', /Choose one of the key eases/);
});

test('one registry operation writes the batch, upgrades a known older interpreter and refuses a custom one', () => {
  const data = sided();
  const template = { html: '<div class="fixture"><div id="box"></div><div id="title"></div></div>', css: '', fields: [], fps: 25, assets: [], js: runtime.emitAnimRegion(data) + '\n// keep this user code' };
  const patch = applyOperations(template, [{ kind: 'key.ease', keys: SELECTION, preset: 'hold' }]);
  assert.deepEqual(eases(parseAnimData(patch.template.js)), eases(easeKeys(data, SELECTION, 'hold')));
  assert.deepEqual(patch.diff.map(d => d.file), ['js']);
  assert.ok(patch.template.js.endsWith('\n// keep this user code'));
  assert.deepEqual(patch.changedTargets.sort(), ['#box', '#title']);
  // Re-applying is no edit at all.
  assert.deepEqual(applyOperations(patch.template, [{ kind: 'key.ease', keys: SELECTION, preset: 'hold' }]).diff, []);
  // A graphic saved with the R1.2a.1 interpreter cannot play a Hold: the write re-emits the region.
  const before = readFileSync(path.join(root, 'e2e/fixtures/interpreter-whole-ease-v1.js'), 'utf8').replace(/\r\n/g, '\n');
  assert.ok(!before.includes('shared-ease-v2'));
  const saved = { ...template, js: template.js.replace(runtime.ANIM_INTERPRETER_JS, () => before) };
  assert.notEqual(saved.js, template.js);
  const upgraded = applyOperations(saved, [{ kind: 'key.ease', keys: SELECTION, preset: 'hold' }]).template.js;
  assert.ok(upgraded.includes(runtime.ANIM_INTERPRETER_JS) && upgraded.endsWith('\n// keep this user code'));
  const custom = { ...saved, js: saved.js.replace('var noacgStepsPlayed = 0;', 'var noacgStepsPlayed = 0; window.customTail = true;') };
  assert.throws(() => applyOperations(custom, [{ kind: 'key.ease', keys: SELECTION, preset: 'hold' }]), /custom/);
  // A refused batch changes nothing.
  assert.throws(() => applyOperations(template, [{ kind: 'key.ease', keys: [key('#box', 'x', 0)], preset: 'easeIn' }]), /Nothing to ease/);
});

test('the editor samples every preset as its curve, and a Hold holds until its key', () => {
  for (const preset of KEY_EASE_PRESETS.map(p => p.id)) {
    const after = easeKeys(sided(), SELECTION, preset);
    for (const [selector, layer] of Object.entries(after.steps[0].layers)) for (const [prop, keys] of Object.entries(layer)) {
      for (let i = 1; i < keys.length; i++) {
        const a = keys[i - 1], b = keys[i], curve = ease.easeCurve(b.ease || after.steps[0].ease);
        for (const s of [0.1, 0.5, 0.9, 0.99]) {
          const t = a.time + (b.time - a.time) * s, value = resolveValue(after, selector, prop, 0, t);
          const expected = a.value + (b.value - a.value) * curve(s);
          assert.ok(Math.abs(value - (prop === 'opacity' ? Math.min(1, Math.max(0, expected)) : expected)) < 1e-9, `${preset} ${selector} ${prop} at ${t}`);
        }
      }
    }
  }
  const held = easeKeys(sided(), [key('#box', 'x', 0)], 'hold');
  assert.equal(resolveValue(held, '#box', 'x', 0, 0.8 - 1 / 25), -900);
  assert.equal(resolveValue(held, '#box', 'x', 0, 0.8 - 1e-4), -900);
  assert.equal(resolveValue(held, '#box', 'x', 0, 0.8), -200);
  assert.equal(resolveValue(held, '#box', 'opacity', 0, 0.3), resolveValue(sided(), '#box', 'opacity', 0, 0.3), 'opacity unchanged');
});

test('review cases: an instant jump, a departure inside a split curve, the 10 ms floor and names after speed', () => {
  const track = (x, speed = 1) => ({ version: 2, root: '.g', speed, steps: [{ name: 'In', duration: 2, ease: 'none', layers: { '#a': { x } } }] });
  // Two keys at one moment are an instant jump: In arrives at the first, Out leaves from the last,
  // and the empty segment between them is never written.
  const jump = track([{ time: 0, value: 0 }, { time: 1, value: 0 }, { time: 1, value: 100 }, { time: 2, value: 0 }]);
  assert.deepEqual(planKeyEase(jump, [key('#a', 'x', 1)], 'hold'), [{ step: 0, selector: '#a', property: 'x', index: 3, ease: 'hold' }]);
  assert.deepEqual(planKeyEase(jump, [key('#a', 'x', 1)], 'easeIn').map(w => w.index), [1]);
  assert.deepEqual(planKeyEase(jump, [key('#a', 'x', 1)], 'easyEase').map(w => w.index).sort(), [1, 3]);
  // A split keeps the departure the key before set on its own inside a slice: Bounce, Overshoot and
  // a point preset on the arriving side refuse rather than drop it.
  const sliced = track([{ time: 0, value: 0 }, { time: 1, value: 100, ease: `slice(${bezier(L, 0, L2, L2)},0,0.5)` }]);
  for (const preset of ['bounce', 'overshoot']) refuse(sliced, [key('#a', 'x', 1)], preset, /#a x at 1 s in In: the key before it sets its own departure/);
  refuse(sliced, [key('#a', 'x', 1)], 'easeIn', /#a x at 1 s in In: the key before it sets its own departure inside a split curve/);
  assert.ok(ease.departsOnItsOwn(`slice(${bezier(L, 0, L2, L2)},0,0.5)`) && !ease.departsOnItsOwn(`slice(${bezier(L, 0, L2, L2)},0.5,1)`) && !ease.departsOnItsOwn('slice(power2.out,0,0.5)'));
  // Both keys of that segment write both points and keep nothing, as the refusals advise.
  assert.equal(easeKeys(sliced, [key('#a', 'x', 0), key('#a', 'x', 1)], 'easyEase').steps[0].layers['#a'].x[1].ease, bezier(L, 0, L2, 1));
  // A Hold needs 10 ms of played time to land on its key in every player.
  refuse(track([{ time: 0, value: 0 }, { time: 0.005, value: 100 }]), [key('#a', 'x', 0)], 'hold', /#a x at 0 s in In: the segment it would hold lasts 5 ms/);
  assert.equal(easeKeys(track([{ time: 0, value: 0 }, { time: 0.005, value: 100 }], 0.4), [key('#a', 'x', 0)], 'hold').steps[0].layers['#a'].x[1].ease, 'hold');
  // Keys are named as the timeline shows them, after speed, and a missing one is named too.
  refuse(track([{ time: 0, value: 0 }, { time: 1, value: 100, ease: 'power3.out' }], 2), [key('#a', 'x', 0)], 'easeOut', /#a x at 0 s in In/);
  refuse(track([{ time: 0, value: 0 }, { time: 1, value: 100 }, { time: 1.6, value: 0, ease: 'power3.out' }], 2), [key('#a', 'x', 1)], 'easeOut', /#a x at 0\.5 s in In: the segment to its next key uses power3\.out/);
  refuse(track([{ time: 0, value: 0 }, { time: 1, value: 100 }]), [key('#a', 'x', 0.4)], 'linear', /#a x at 0\.4 s in In is no longer there/);
});
