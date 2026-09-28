// guards: src/templates/shared/easeRuntime.ts, src/templates/shared/animRuntime.ts, src/blocks/animEval.ts, src/blocks/animEdit.ts, src/blocks/editorOut.ts, src/assets/gsap.min.js
//
// G01 SHARED EASING, THE MATHEMATICS. One ease grammar is emitted into every template's
// interpreter and compiled by the editor (src/templates/shared/easeRuntime.ts). This pins what
// that promise needs without a browser:
//   - every named ease it accepts equals the bundled GSAP 3.15 bit for bit, so handing GSAP the
//     shared function instead of the string changes nothing that already plays;
//   - cubic-bezier is the CSS curve, and nothing it accepts is left for GSAP to default;
//   - E_rev(u) = 1 - E(1 - u) for every mirror it writes, and it refuses what has none;
//   - a split at 40 percent keeps dense samples, endpoints and boundary velocity, leaves the
//     neighbouring key sides alone, and refuses atomically where no exact form exists;
//   - the editor sampler reads the eased, clamped value the runtime renders.
// What needs Chromium - the emitted interpreter driving GSAP in the simulator and exported
// packages - is e2e/editor-ease.spec.ts.
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

const ease = await load('src/templates/shared/easeRuntime.ts');
const { resolveValue } = await load('src/blocks/animEval.ts');
const { splitKeyframeSegment } = await load('src/blocks/animEdit.ts');
const runtime = await load('src/templates/shared/animRuntime.ts');

// The bundled GSAP, as every export ships it. Its UMD wrapper fills `exports`.
const gsapExports = {};
new Function('exports', 'module', readFileSync(path.join(root, 'src/assets/gsap.min.js'), 'utf8'))(gsapExports, {});
const { gsap } = gsapExports;

const GRID = [...Array.from({ length: 4097 }, (_, i) => i / 4096), ...Array.from({ length: 1001 }, (_, i) => i / 1000), 1e-9, 0.5 - 1e-12, 0.5 + 1e-12, 1 - 1e-9];

const FAMILIES = ['linear', 'power0', 'quad', 'power1', 'cubic', 'power2', 'quart', 'power3', 'quint', 'power4', 'strong', 'sine', 'expo', 'circ', 'bounce', 'back', 'elastic'];
const NAMED = [
  'none',
  ...FAMILIES.flatMap(f => [f, `${f}.in`, `${f}.out`, `${f}.inOut`]),
  ...['in', 'out', 'inOut'].flatMap(s => [`back.${s}(1.6)`, `back.${s}(1.4)`, `back.${s}(0)`, `back.${s}(2.4)`, `elastic.${s}(1, 0.7)`, `elastic.${s}(1,0.55)`, `elastic.${s}(2, 0.3)`, `elastic.${s}(0.5, 0.3)`, `elastic.${s}(1.2)`]),
  'back(1.6)', 'elastic(1, 0.7)', 'steps(1)', 'steps(4)', 'steps(3)', 'steps(1,true)', 'steps(4, true)',
];

test('every named ease equals the bundled GSAP 3.15 bit for bit', () => {
  assert.equal(gsap.version, '3.15.0');
  for (const name of NAMED) {
    const ours = ease.easeCurve(name), theirs = gsap.parseEase(name);
    assert.equal(typeof ours, 'function', `${name} is recognized`);
    assert.equal(typeof theirs, 'function', `${name} is a GSAP ease`);
    const differs = GRID.filter(p => !Object.is(ours(p), theirs(p)));
    assert.deepEqual(differs, [], `${name} differs from GSAP at ${differs.slice(0, 3)}`);
  }
});

test('the grammar is strict, never rewrites a string, and leaves the rest to GSAP as before', () => {
  for (const text of [...NAMED, 'cubic-bezier(0.25,0.1,0.25,1)', 'cubic-bezier(0.3, -0.4, 0.6, 1.5)', 'slice(back.out(1.6),0,0.4)', 'slice(cubic-bezier(0.2,0,0.4,1),0.4,1)']) {
    assert.equal(ease.parseEase(text)?.text, text, text);
  }
  // Outside the grammar: legacy names, whitespace, arguments GSAP would silently ignore, the
  // string "false" GSAP reads as true, and anything malformed. These are never recognized, so the
  // interpreter hands them to GSAP exactly as it did before G01.
  for (const text of ['', 'Power2.easeOut', 'Power2', 'power2.OUT', ' power2.out', 'power2.out ', 'power2.out(3)', 'bounce(2)', 'back.out()', 'back.out(1.6',
    'steps(1,false)', 'steps(0)', 'steps()', 'steps(1.5)', 'customEase', 'cubic-bezier(1.2,0,0.5,1)', 'cubic-bezier(0.2,0,-0.1,1)', 'cubic-bezier(0.2,NaN,0.4,1)',
    'cubic-bezier(0.2,0,0.4)', 'cubic-bezier(0.2,Infinity,0.4,1)', 'slice(power2.out,0.4,0.4)', 'slice(power2.out,-0.1,0.4)', 'slice(power2.out,0,1.2)', 'slice(steps(4),0,0.5)',
    'slice(slice(power2.out,0,0.5),0,0.5)', 'slice(bounce.out,0.9090909090909092,1.5)', 'constructor', 'toString.in', '__proto__']) {
    assert.equal(ease.parseEase(text), null, JSON.stringify(text));
    assert.equal(ease.easeCurve(text), null, JSON.stringify(text));
  }
  assert.equal(ease.needsEaseRuntime('cubic-bezier(0.25,0.1,0.25,1)'), true);
  assert.equal(ease.needsEaseRuntime('slice(expo.out,0,0.4)'), true);
  assert.equal(ease.needsEaseRuntime('back.out(1.6)'), false);
  assert.equal(ease.needsEaseRuntime('customEase'), false);
  // The forms only the shared runtime plays really are the ones GSAP would default.
  for (const text of ['cubic-bezier(0.25,0.1,0.25,1)', 'slice(expo.out,0,0.4)']) assert.equal(gsap.parseEase(text), undefined);
});

test('cubic-bezier is the CSS curve, monotonic in time and exact at its ends', () => {
  const standard = ease.easeCurve('cubic-bezier(0.25,0.1,0.25,1)');
  assert.ok(Math.abs(standard(0.5) - 0.8024033877399112) < 1e-9, 'CSS ease at 0.5');
  // Degree-3 GSAP curves are exactly one bezier with x1 = 1/3, x2 = 2/3: an independent check of
  // the solver against GSAP's own formulas, overshoot included.
  const pairs = [['back.out(1.6)', [1 / 3, 1 + 1.6 / 3, 2 / 3, 1]], ['back.in(1.6)', [1 / 3, 0, 2 / 3, -1.6 / 3]], ['power1.out', [1 / 3, 2 / 3, 2 / 3, 1]], ['power2.in', [1 / 3, 0, 2 / 3, 0]]];
  for (const [name, points] of pairs) {
    const bezier = ease.easeCurve(`cubic-bezier(${points.join(',')})`), named = ease.easeCurve(name);
    for (const p of GRID) assert.ok(Math.abs(bezier(p) - named(p)) < 1e-9, `${name} at ${p}`);
  }
  for (const text of ['cubic-bezier(0,0,1,1)', 'cubic-bezier(1,0,0,1)', 'cubic-bezier(0.3,-0.4,0.6,1.5)', 'cubic-bezier(0,1.5,1,-0.5)']) {
    const curve = ease.easeCurve(text);
    assert.equal(curve(0), 0, text); assert.equal(curve(1), 1, text);
    for (const p of GRID) assert.ok(Number.isFinite(curve(p)), `${text} finite at ${p}`);
  }
});

const MIRRORED = [
  ['none', 'none'], ['linear', 'linear'], ['power2.out', 'power2.in'], ['power3.in', 'power3.out'], ['sine.inOut', 'sine.inOut'], ['expo', 'expo.in'],
  ['circ.out', 'circ.in'], ['back.out(1.6)', 'back.in(1.6)'], ['back.in', 'back.out'], ['back(1.6)', 'back.in(1.6)'], ['bounce.out', 'bounce.in'], ['bounce', 'bounce.in'],
  ['bounce.inOut', 'bounce.inOut'], ['elastic.out(1, 0.7)', 'elastic.in(1, 0.7)'], ['elastic.in(2, 0.3)', 'elastic.out(2, 0.3)'],
  ['cubic-bezier(0.3,-0.4,0.6,1.5)', 'cubic-bezier(0.4,-0.5,0.7,1.4)'], ['cubic-bezier(0.25,0.1,0.25,1)', 'cubic-bezier(0.75,0,0.75,0.9)'],
  ['slice(expo.out,0.2,0.9)', 'slice(expo.in,0.1,0.8)'], ['slice(cubic-bezier(0.2,0,0.4,1),0,0.4)', 'slice(cubic-bezier(0.6,0,0.8,1),0.6,1)'], ['slice(bounce.out,0.4,1)', 'slice(bounce.in,0,0.6)'],
];

test('reversal writes the exact mirror E_rev(u) = 1 - E(1 - u), or refuses', () => {
  for (const [text, expected] of MIRRORED) {
    const mirror = ease.mirrorEase(text);
    assert.equal(mirror, expected, text);
    const original = ease.easeCurve(text), reversed = ease.easeCurve(mirror);
    const tolerance = /bezier/.test(text) ? 1e-9 : /slice/.test(text) ? 1e-12 : 2e-15;
    for (const u of GRID) assert.ok(Math.abs(reversed(u) - (1 - original(1 - u))) <= tolerance, `${text} at ${u}: ${reversed(u)} vs ${1 - original(1 - u)}`);
    assert.equal(ease.mirrorEase(mirror).replace(/\s/g, ''), text.replace(/\s/g, '').replace(/^(back|bounce|expo)(\(|$)/, '$1.out$2'), 'mirror of the mirror');
  }
  // GSAP's steps jump on one side of their instant; the reverse would need the other side, and
  // steps(1) -> steps(1,true) is not a mirror at all (max error 1).
  for (const text of ['steps(1)', 'steps(1,true)', 'steps(4)', 'customEase', 'Power2.easeOut']) {
    assert.throws(() => ease.mirrorEase(text), { message: ease.IRREVERSIBLE_EASE }, text);
  }
});

test('a slice is the rescaled part of its ease, and flattens rather than nests', () => {
  for (const [text, a, b] of [['power2.out', 0, 0.4], ['bounce.out', 0.4, 1], ['back.out(1.6)', 0.1, 0.7], ['elastic.out(1, 0.7)', 0.4, 1], ['cubic-bezier(0.3,-0.4,0.6,1.5)', 0.4, 1]]) {
    const whole = ease.easeCurve(text), part = ease.easeCurve(ease.sliceEase(text, a, b));
    for (const u of GRID) assert.ok(Math.abs(part(u) - (whole(a + (b - a) * u) - whole(a)) / (whole(b) - whole(a))) < 1e-12, `${text} at ${u}`);
    assert.equal(part(0), 0); assert.equal(part(1), 1);
  }
  assert.equal(ease.sliceEase('slice(expo.out,0.2,0.7)', 0, 0.4), 'slice(expo.out,0.2,0.4)');
  assert.equal(ease.sliceEase('power2.out', 0, 1), 'power2.out');
  assert.throws(() => ease.sliceEase('steps(4)', 0, 0.4), /no exact split form/);
  assert.throws(() => ease.sliceEase('customEase', 0, 0.4), /no exact split form/);
  // bounce.out touches 1 at p = 1/2.75: nothing between there and the end can be rescaled.
  assert.throws(() => ease.sliceEase('bounce.out', 1 / 2.75, 1), /same value/);
});

// A two-cue fixture: 0 -> 0.8 -> 2 seconds on several eased tracks.
const fixture = () => ({ version: 2, root: '.g', speed: 1, steps: [
  { name: 'In', duration: 2, ease: 'power1.inOut', layers: { '#box': {
    x: [{ time: 0, value: -900 }, { time: 0.8, value: -200, ease: 'power2.out' }, { time: 2, value: 0, ease: 'back.out(1.6)' }],
    y: [{ time: 0, value: 0 }, { time: 0.8, value: -120, ease: 'bounce.out' }, { time: 2, value: 0, ease: 'cubic-bezier(0.3,-0.4,0.6,1.5)' }],
    rotation: [{ time: 0, value: -30 }, { time: 2, value: 0, ease: 'elastic.out(1, 0.7)' }],
    scaleX: [{ time: 0, value: 0.5 }, { time: 0.8, value: 0.6 }, { time: 2, value: 1, ease: 'expo.inOut' }],
    opacity: [{ time: 0, value: 0 }, { time: 1, value: 1, ease: 'back.out(1.6)' }, { time: 2, value: 0.5, ease: 'power2.in' }],
  } } },
  { name: 'Out', duration: 1, ease: 'none', layers: {} },
] });
const sample = (data, prop, t) => resolveValue(data, '#box', prop, 0, t);
const slope = (data, prop, a, b) => (sample(data, prop, b) - sample(data, prop, a)) / (b - a);

test('the editor sampler reads the eased, clamped value the runtime renders', () => {
  // The divergence the 2026-09-17 baseline probe reproduced: power2.out from -80 to 0 read -40 at
  // half time, where the runtime shows -10.
  const probe = { version: 2, root: '.g', speed: 1, steps: [{ name: 'In', duration: 1, ease: 'none', layers: { '#a': { x: [{ time: 0, value: -80 }, { time: 1, value: 0, ease: 'power2.out' }] } } }] };
  assert.equal(resolveValue(probe, '#a', 'x', 0, 0.5), -10);
  assert.equal(resolveValue(probe, '#a', 'x', 0, 0.25), -80 + 80 * gsap.parseEase('power2.out')(0.25));
  const data = fixture();
  // A key without its own ease inherits the step's; scaleX's first segment is power1.inOut.
  assert.equal(sample(data, 'scaleX', 0.4), 0.5 + (0.6 - 0.5) * gsap.parseEase('power1.inOut')(0.5));
  // back.out overshoots opacity past 1; the renderer clamps it and so does the sampler.
  const peak = Math.max(...GRID.map(p => sample(data, 'opacity', p)));
  assert.equal(peak, 1);
  assert.ok(0 + 1 * gsap.parseEase('back.out(1.6)')(0.5) > 1, 'the unclamped curve does overshoot');
  // Unrecognized strings keep the legacy linear reading for display.
  const legacy = { ...probe, steps: [{ ...probe.steps[0], layers: { '#a': { x: [{ time: 0, value: -80 }, { time: 1, value: 0, ease: 'Power2.easeOut' }] } } }] };
  assert.equal(resolveValue(legacy, '#a', 'x', 0, 0.5), -40);
});

const SPLITS = [['x', 0.32], ['x', 1.28], ['y', 0.32], ['y', 1.28], ['rotation', 0.8], ['scaleX', 1.28], ['scaleX', 0.32], ['opacity', 1.4]];

test('a split at 40 percent keeps samples, endpoints, boundary velocity and neighbouring sides', () => {
  const before = fixture();
  for (const [prop, at] of SPLITS) {
    const frozen = JSON.stringify(before);
    const after = splitKeyframeSegment(before, 0, '#box', prop, at);
    assert.equal(JSON.stringify(before), frozen, 'the input is not mutated');
    const keysBefore = before.steps[0].layers['#box'][prop], keysAfter = after.steps[0].layers['#box'][prop];
    const inserted = keysAfter.find(k => k.time === at);
    assert.ok(inserted, `${prop} gains a key at ${at}`);
    // Endpoints: every original key keeps its time and value; the new key is the sampled value.
    for (const key of keysBefore) assert.equal(keysAfter.find(k => k.time === key.time).value, key.value);
    assert.ok(Math.abs(inserted.value - sample(before, prop, at)) <= 0.0005 + 1e-12, `${prop} split value`);
    // Neighbouring sides: only the new key and the split segment's destination key change.
    const next = keysBefore.find(k => k.time > at), previous = [...keysBefore].reverse().find(k => k.time < at);
    for (const key of keysBefore) if (key !== next) assert.equal(keysAfter.find(k => k.time === key.time).ease, key.ease, `${prop} key ${key.time} keeps its side`);
    assert.equal(after.steps[0].ease, before.steps[0].ease, 'the step default is unchanged');
    for (const other of Object.keys(before.steps[0].layers['#box'])) if (other !== prop) assert.deepEqual(after.steps[0].layers['#box'][other], before.steps[0].layers['#box'][other]);
    // Dense samples across the whole cue agree within one stored quantum.
    for (let i = 0; i <= 2000; i++) {
      const t = i / 1000;
      assert.ok(Math.abs(sample(after, prop, t) - sample(before, prop, t)) <= 0.001, `${prop} split at ${at}: sample ${t}`);
    }
    // Boundary velocity on both sides of the split, and just inside the segment's own ends.
    const h = 1e-4;
    for (const [a, b] of [[at - h, at], [at, at + h], [previous.time, previous.time + h], [next.time - h, next.time]]) {
      const v0 = slope(before, prop, a, b), v1 = slope(after, prop, a, b);
      assert.ok(Math.abs(v1 - v0) <= 0.02 + Math.abs(v0) * 1e-3, `${prop} split at ${at}: velocity ${a}..${b} ${v0} vs ${v1}`);
    }
  }
});

test('splits refuse atomically where no exact form exists, and a flat segment always splits', () => {
  const refuse = (mutate, prop, at, pattern) => {
    const data = fixture(); mutate(data);
    const frozen = JSON.stringify(data);
    assert.throws(() => splitKeyframeSegment(data, 0, '#box', prop, at), pattern, `${prop} at ${at}`);
    assert.equal(JSON.stringify(data), frozen);
  };
  const box = d => d.steps[0].layers['#box'];
  refuse(() => {}, 'opacity', 0.4, /outside|range/i);                                       // back.out overshoot: 1.014 > 1
  refuse(d => { box(d).x[2].ease = 'back.in(1.5)'; }, 'x', 1.52, /same value/);             // back.in(1.5) returns to 0 at 0.6
  refuse(d => { box(d).y[1].ease = 'bounce.out'; box(d).y[1].time = 1.1; }, 'y', 0.4, /same value/); // bounce touches 1 at 1/2.75
  refuse(d => { box(d).x[1].ease = 'steps(4)'; }, 'x', 0.32, /no exact split form/);
  refuse(d => { box(d).x[1].ease = 'customEase'; }, 'x', 0.32, /no exact split form/);
  refuse(d => { delete box(d).x[1].ease; d.steps[0].ease = 'customEase'; }, 'x', 0.32, /no exact split form/);
  refuse(() => {}, 'x', 0.8, /strictly inside/);
  refuse(() => {}, 'x', 2.4, /strictly inside/);
  refuse(() => {}, 'x', 0, /strictly inside/);
  refuse(() => {}, 'z', 0.4, /strictly inside/);
  refuse(d => { d.steps[0].loops = { '#box': { x: { repeat: -1 } } }; }, 'x', 0.32, /loop/i);
  refuse(d => { box(d).filter = [{ time: 0, value: 'blur(0px)' }, { time: 1, value: 'blur(8px)', ease: 'power2.out' }]; }, 'filter', 0.4, /numeric/i);
  // A flat segment is constant under ANY ease, so its split is exact even for an unrecognized one.
  const flat = fixture();
  box(flat).y = [{ time: 0, value: 5 }, { time: 1, value: 5, ease: 'customEase' }];
  assert.deepEqual(box(splitKeyframeSegment(flat, 0, '#box', 'y', 0.4)).y, [{ time: 0, value: 5 }, { time: 0.4, value: 5, ease: 'customEase' }, { time: 1, value: 5, ease: 'customEase' }]);
});

test('the interpreter carries the shared source and needs it for exact forms', () => {
  const { ANIM_INTERPRETER_JS, hasEaseRuntime, dataUsesExactEase, writeAnimData, writeOutData, emitAnimRegion } = runtime;
  assert.ok(ANIM_INTERPRETER_JS.includes(ease.NOACG_EASE_JS), 'the interpreter emits the shared source verbatim');
  // No ease reaches GSAP from the data except through the shared resolution.
  const sites = [...ANIM_INTERPRETER_JS.matchAll(/(?:\bease: |\.ease = )([^,};\n]+)/g)].map(m => m[1]);
  assert.ok(sites.length >= 8, 'the ease sites were found');
  assert.deepEqual(sites.filter(value => !/^(noacgEase(Of|ForBuilder)\(|ease\b|'none')/.test(value)), [], 'every data ease is resolved');
  // ES5 for the oldest playout engine, no eval, no template syntax: the text is what ships.
  for (const banned of ['=>', 'let ', 'const ', '`', '?.', '??', 'eval(', 'new Function', '—']) assert.ok(!ease.NOACG_EASE_JS.includes(banned), banned);
  const data = fixture();
  assert.equal(dataUsesExactEase(data), true);
  const plain = JSON.parse(JSON.stringify(data)); plain.steps[0].layers['#box'].y[2].ease = 'power2.out';
  assert.equal(dataUsesExactEase(plain), false);
  const current = emitAnimRegion(data);
  assert.equal(hasEaseRuntime(current), true);
  const legacy = current.replace(ANIM_INTERPRETER_JS, readFileSync(path.join(root, 'e2e/fixtures/interpreter-pre-g01.js'), 'utf8').replace(/\r\n/g, '\n'));
  assert.notEqual(legacy, current);
  assert.equal(hasEaseRuntime(legacy), false);
  // A known older body upgrades; the same body with anything appended is custom and refuses.
  assert.ok(writeAnimData(legacy, data).includes(ANIM_INTERPRETER_JS));
  assert.ok(writeOutData(legacy, data).includes(ANIM_INTERPRETER_JS));
  const custom = legacy.replace('var noacgStepsPlayed = 0;', 'var noacgStepsPlayed = 0; window.customTail = true;');
  assert.equal(writeAnimData(custom, data), null);
  // Without exact forms the older body keeps its literal-only splice, as before G01.
  assert.ok(!writeAnimData(legacy, plain).includes(ANIM_INTERPRETER_JS));
});
