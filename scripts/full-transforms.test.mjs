// guards: src/blocks/editorAnimation.ts, src/blocks/animEdit.ts, src/blocks/animEval.ts, src/blocks/animData.ts, src/components/editorFoundation/animationAuthoring.ts, src/templates/shared/easeRuntime.ts
//
// R1.2a.6 FULL TRANSFORMS (docs/research/editor-r1-2a-6/README.md). The editor edits the transform
// and visibility channels catalog designs animate: each control reads the runtime's own tracks and
// writes them back in the runtime's units, time edits work on every channel, and a layer's motion
// may live under another selector naming only it. Here the pure rules are checked on catalog-shaped
// data: the channel each control reads and writes, a layer's owner, the data half of every
// animation operation, and the displayed value with its inverse. What needs a DOM or Chromium (the
// catalog sweep, the canvas, playback) is e2e/editor-transforms.spec.ts.
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
const [animation, { displayedBase, nativeValue, transformOperations }, { resolveValue }] = await Promise.all(
  ['src/blocks/editorAnimation.ts', 'src/components/editorFoundation/animationAuthoring.ts', 'src/blocks/animEval.ts'].map(load));
const { writeChannel, armedChannels, isArmed, controlsOf, layerOwner, channelValue, animateLayer } = animation;

const k = (time, value, ease) => ease ? { time, value, ease } : { time, value };
/** Clean Steps (card26) as the catalog emits it, trimmed to three rows: masked rows sliding up by
 *  yPercent, revealed one per Step, and an exit. */
const cleanSteps = () => ({
  version: 2, root: '.info-card', speed: 1, steps: [
    { name: 'Enter', duration: 1.2, ease: 'expo.out', layers: {
      '.info-card-accent': { scaleX: [k(0, 0), k(0.6, 1)] },
      '.info-card-box': { clipPath: [k(0.25, 'inset(0 100% 0 0)'), k(0.9, 'inset(0 0% 0 0)')], opacity: [k(0.25, 0), k(0.9, 1)] },
      '#f0': { yPercent: [k(0.5, 110), k(1.2, 0)] } } },
    { name: 'Step 2', duration: 0.45, ease: 'expo.out', reveals: ['#f1'], layers: { '#f1': { yPercent: [k(0, 110), k(0.45, 0)] } } },
    { name: 'Step 3', duration: 0.45, ease: 'expo.out', reveals: ['#f2'], layers: { '#f2': { yPercent: [k(0, 110), k(0.45, 0)] } } },
    { name: 'Out', duration: 0.9, ease: 'power3.in', layers: {
      '#f0': { yPercent: [k(0, 0), k(0.35, 110)] }, '#f1': { yPercent: [k(0.05, 0), k(0.4, 110)] }, '#f2': { yPercent: [k(0.1, 0), k(0.45, 110)] },
      '.info-card-box': { opacity: [k(0.6, 1), k(0.9, 0)] } } },
  ],
});
/** Frosted Panel (card03): the panel enters by scale, y and opacity. */
const frosted = () => ({
  version: 2, root: '.info-card', speed: 1, steps: [
    { name: 'Enter', duration: 0.89, ease: 'back.out(1.6)', layers: {
      '.info-card-box': { scale: [k(0, 0.9), k(0.6, 1)], y: [k(0, 24), k(0.6, 0)], opacity: [k(0, 0), k(0.6, 1)] },
      '#f0': { y: [k(0.35, 14), k(0.75, 0)], opacity: [k(0.35, 0), k(0.75, 1)] } } },
    { name: 'Out', duration: 0.35, ease: 'power2.in', layers: { '.info-card-box': { scale: [k(0, 1), k(0.35, 0.94)], y: [k(0, 0), k(0.35, 14)], opacity: [k(0, 1), k(0.35, 0)] } } },
  ],
});
/** House Question (aq01): #f1's reveal is stored under its class. */
const houseQuestion = () => ({
  version: 2, root: '.audience', speed: 1, steps: [
    { name: 'Enter', duration: 1.05, ease: 'power3.out', layers: {
      '.audience-box': { opacity: [k(0, 0), k(0.5, 1)], y: [k(0, 22), k(0.5, 0)] },
      '.audience-question': { yPercent: [k(0.35, 110), k(0.9, 0)] } } },
    { name: 'Out', duration: 0.35, ease: 'power2.in', layers: { '.audience-box': { opacity: [k(0, 1), k(0.35, 0)], y: [k(0, 0), k(0.35, -16)] } } },
  ],
});
const one = (layers, duration = 2) => ({ version: 2, root: '.g', speed: 1, steps: [{ name: 'In', duration, ease: 'none', layers }, { name: 'Out', duration: 1, ease: 'none', layers: {} }] });
const key = (selector, step, property, time, value, action = 'set', baseValues) => ({ kind: 'animation.key', selector, step, property, time, value, action, ...baseValues ? { baseValues } : {} });
/** Every layer but `except`, per cue, as JSON: what an edit must leave byte for byte. */
const untouched = (data, except) => JSON.stringify(data.steps.map(s => [s.name, s.duration, s.reveals, Object.entries(s.layers).filter(([sel]) => !except.includes(sel)), Object.entries(s.spans ?? {}).filter(([sel]) => !except.includes(sel))]));
/** A refusal throws with its reason and leaves the input exactly as it was. */
function refuses(run, data, pattern) {
  const frozen = JSON.stringify(data);
  assert.throws(run, pattern);
  assert.equal(JSON.stringify(data), frozen);
}
const frame = 1 / 25;

test('each control reads its channels and writes the one the runtime already animates', () => {
  const cases = [
    [{}, { x: 'x', y: 'y', scaleX: 'scaleX', scaleY: 'scaleY', rotation: 'rotation', opacity: 'opacity' }],
    [{ yPercent: [k(0, 110), k(1, 0)] }, { x: 'x', y: 'yPercent', scaleX: 'scaleX', opacity: 'opacity' }],
    [{ xPercent: [k(0, -100), k(1, 0)] }, { x: 'xPercent', y: 'y' }],
    [{ y: [k(0, 10), k(1, 0)], yPercent: [k(0, 110), k(1, 0)] }, { y: 'y' }],
    [{ scale: [k(0, 0.9), k(1, 1)] }, { scaleX: 'scale', scaleY: 'scale', x: 'x' }],
    [{ scaleX: [k(0, 0), k(1, 1)] }, { scaleX: 'scaleX', scaleY: 'scaleY' }],
    [{ autoAlpha: [k(0, 0), k(1, 1)] }, { opacity: 'autoAlpha' }],
    [{ transform: [k(0, 'translateX(0px)'), k(1, 'translateX(9px)')] }, { opacity: 'opacity' }],
  ];
  for (const [tracks, expected] of cases) for (const [control, channel] of Object.entries(expected)) {
    assert.equal(writeChannel(one({ '#a': tracks }), '#a', control), channel, `${JSON.stringify(tracks)} ${control}`);
  }
  // A track in a later cue arms its control too.
  const later = one({}); later.steps[1].layers['#a'] = { yPercent: [k(0, 0), k(1, 110)] };
  assert.equal(writeChannel(later, '#a', 'y'), 'yPercent');
  assert.deepEqual(armedChannels(one({ '#a': { y: [k(0, 1)], yPercent: [k(0, 1)] } }), '#a', 'y'), ['y', 'yPercent']);
  assert.deepEqual(armedChannels(one({ '#a': { scale: [k(0, 1)] } }), '#a', 'scaleY'), ['scale']);
  assert.equal(isArmed(one({ '#a': { autoAlpha: [k(0, 1)] } }), '#a', 'opacity'), true);
  assert.equal(isArmed(one({ '#a': { yPercent: [k(0, 1)] } }), '#a', 'x'), false);
  assert.deepEqual(controlsOf('scale'), ['scaleX', 'scaleY']);
  assert.deepEqual(controlsOf('yPercent'), ['y']);
  assert.deepEqual(controlsOf('autoAlpha'), ['opacity']);
  assert.deepEqual(controlsOf('clipPath'), []);
});

test('a channel that cannot take a key exactly refuses: a raw transform, or two tracks on one control', () => {
  const transform = one({ '#a': { transform: [k(0, 'translateX(0px)'), k(1, 'translateX(9px)')] } });
  for (const control of ['x', 'y', 'scaleX', 'scaleY', 'rotation']) assert.throws(() => writeChannel(transform, '#a', control), /raw transform string/);
  const scaled = one({ '#a': { scale: [k(0, 1)], scaleX: [k(0, 1)] } });
  for (const control of ['scaleX', 'scaleY']) assert.throws(() => writeChannel(scaled, '#a', control), /both scale and scaleX/);
  assert.throws(() => writeChannel(one({ '#a': { scale: [k(0, 1)], scaleY: [k(0, 1)] } }), '#a', 'scaleX'), /both scale and scaleY/);
  assert.throws(() => writeChannel(one({ '#a': { opacity: [k(0, 1)], autoAlpha: [k(0, 1)] } }), '#a', 'opacity'), /both opacity and autoAlpha/);
  // Other layers' channels never count.
  assert.equal(writeChannel(one({ '#a': { transform: [k(0, 'none')] }, '#b': { yPercent: [k(0, 1)] } }), '#b', 'y'), 'yPercent');
});

test('a layer\'s owner is its own selector or the one other selector naming only it', () => {
  const names = map => key => map[key] ?? 'none';
  assert.equal(layerOwner(houseQuestion(), '#f1', names({ '.audience-question': 'this' })), '.audience-question');
  assert.equal(layerOwner(houseQuestion(), '.audience-box', names({})), '.audience-box');
  assert.equal(layerOwner(houseQuestion(), '#f9', names({})), '#f9');
  // An ancestor's selector selects another element: it is not this layer's.
  assert.equal(layerOwner(cleanSteps(), '#f0', names({ '.info-card-box': 'none', '.info-card-accent': 'none' })), '#f0');
  assert.throws(() => layerOwner(houseQuestion(), '#f1', names({ '.audience-question': 'several' })), /\.audience-question animates #f1 together with other layers, so an edit here would move several layers at once/);
  // Two names for one element, by tracks, by bars, or by a reveal.
  const both = houseQuestion(); both.steps[0].layers['#f1'] = { opacity: [k(0, 0)] };
  assert.throws(() => layerOwner(both, '#f1', names({ '.audience-question': 'this' })), /#f1 is animated under two selectors, #f1 and \.audience-question/);
  const bars = houseQuestion(); bars.steps[1].spans = { '#f1': [{ start: 0, end: 0.35 }] };
  assert.throws(() => layerOwner(bars, '#f1', names({ '.audience-question': 'this' })), /two selectors/);
  const revealed = houseQuestion(); revealed.steps[1].reveals = ['#f1'];
  assert.throws(() => layerOwner(revealed, '#f1', names({ '.audience-question': 'this' })), /two selectors/);
  const spansOnly = one({}); spansOnly.steps[0].spans = { '.solo': [{ start: 0, end: 1 }] };
  assert.equal(layerOwner(spansOnly, '#s', names({ '.solo': 'this' })), '.solo');
});

test('a pose reads a scale track as both Scale axes and autoAlpha as opacity', () => {
  const data = one({ '#a': { scale: [k(0, 0.5), k(1, 1)], autoAlpha: [k(0, 0), k(1, 1)], scaleY: [k(0, 3)] } });
  assert.equal(channelValue(data, '#a', 'scaleX', 0, 0.5), 0.75);
  assert.equal(channelValue(data, '#a', 'scaleY', 0, 0.5), 3);
  assert.equal(channelValue(data, '#a', 'opacity', 0, 0.5), 0.5);
  assert.equal(channelValue(data, '#a', 'yPercent', 0, 0.5), null);
  assert.equal(channelValue(one({ '#a': { opacity: [k(0, 0.2)], autoAlpha: [k(0, 0.9)] } }), '#a', 'opacity', 0, 0), 0.2);
});

test('a key on a catalog channel lands in that channel at the playhead, leaving every other track byte-identical', () => {
  const steps = cleanSteps();
  const set = animateLayer(steps, '#f0', key('#f0', 0, 'yPercent', 0.8, 42.5), frame);
  assert.deepEqual(set.data.steps[0].layers['#f0'].yPercent, [k(0.5, 110), k(0.8, 42.5), k(1.2, 0)]);
  assert.deepEqual(set.ended, []);
  assert.equal(untouched(set.data, ['#f0']), untouched(steps, ['#f0']));
  assert.deepEqual(set.data.steps[3].layers['#f0'], steps.steps[3].layers['#f0']);
  refuses(() => animateLayer(steps, '#f0', key('#f0', 0, 'y', 0.8, 5), frame), steps, /#f0's Position Y is animated as yPercent, so a key on y would compete with it/);
  // The panel's shared scale takes a scale key, and one axis cannot.
  const panel = frosted();
  const scaled = animateLayer(panel, '.info-card-box', key('.info-card-box', 0, 'scale', 0.3, 1.05), frame).data;
  assert.deepEqual(scaled.steps[0].layers['.info-card-box'].scale, [k(0, 0.9), k(0.3, 1.05), k(0.6, 1)]);
  assert.equal(scaled.steps[0].layers['.info-card-box'].scaleX, undefined);
  assert.equal(untouched(scaled, ['.info-card-box']), untouched(panel, ['.info-card-box']));
  refuses(() => animateLayer(panel, '.info-card-box', key('.info-card-box', 0, 'scaleX', 0.3, 1.05), frame), panel, /Scale X is animated as scale/);
  const empty = one({});
  refuses(() => animateLayer(empty, '#a', key('#a', 0, 'scale', 0.3, 1.05), frame), empty, /Scale X is animated as scaleX/);
  // autoAlpha takes an Opacity key, in its range.
  const alpha = one({ '#a': { autoAlpha: [k(0, 0), k(1, 1)] } });
  assert.deepEqual(animateLayer(alpha, '#a', key('#a', 0, 'autoAlpha', 0.5, 0.2), frame).data.steps[0].layers['#a'], { autoAlpha: [k(0, 0), k(0.5, 0.2), k(1, 1)] });
  refuses(() => animateLayer(alpha, '#a', key('#a', 0, 'opacity', 0.5, 0.2), frame), alpha, /Opacity is animated as autoAlpha/);
  refuses(() => animateLayer(alpha, '#a', key('#a', 0, 'autoAlpha', 0.5, 1.2), frame), alpha, /finite numeric value/);
  const raw = one({ '#a': { transform: [k(0, 'none')] } });
  refuses(() => animateLayer(raw, '#a', key('#a', 0, 'x', 0.5, 1), frame), raw, /raw transform string/);
  refuses(() => animateLayer(empty, '#a', key('#a', 0, 'clipPath', 0.5, 1), frame), empty, /finite numeric value/);
  // An aliased layer's key is its owner's.
  const aq = houseQuestion();
  const aliased = animateLayer(aq, '.audience-question', key('#f1', 0, 'yPercent', 0.6, 30), frame).data;
  assert.deepEqual(aliased.steps[0].layers['.audience-question'].yPercent.map(x => x.time), [0.35, 0.6, 0.9]);
  assert.equal(aliased.steps[0].layers['#f1'], undefined);
  // A key past Out's end still lengthens Out.
  assert.equal(animateLayer(frosted(), '#f0', key('#f0', 1, 'y', 0.5, 3), frame).data.steps[1].duration, 0.5);
});

test('the stopwatch and the diamond act on every channel of their control, and keep a percent only where it is 0', () => {
  const both = one({ '#a': { y: [k(0, 10), k(1, 0)], yPercent: [k(0, 110), k(1, 0)] } });
  both.steps[1].layers['#a'] = { yPercent: [k(0, 0), k(0.5, 110)] };
  // Off where yPercent is 0: both channels go everywhere, and Position Y ends there.
  const off = animateLayer(both, '#a', key('#a', 0, 'y', 1, 0, 'disable'), frame);
  assert.deepEqual(off.ended, ['y']);
  assert.equal(off.data.steps.some(s => s.layers['#a']), false);
  // Off where it is not: the offset is a share of the layer's height, so no pixel base keeps it.
  refuses(() => animateLayer(both, '#a', key('#a', 0, 'y', 0.5, 0, 'disable'), frame), both, /Position Y here includes a yPercent offset of 55% of #a's height/);
  const wide = one({ '#a': { xPercent: [k(0, -100), k(1, 0)] } });
  refuses(() => animateLayer(wide, '#a', key('#a', 0, 'x', 0.5, 0, 'disable'), frame), wide, /xPercent offset of -50% of #a's width/);
  // The diamond removes that control's keys at the playhead in each channel; the control ends only with its last key.
  const diamond = animateLayer(both, '#a', key('#a', 0, 'y', 0, 0, 'remove'), frame);
  assert.deepEqual(diamond.data.steps[0].layers['#a'], { y: [k(1, 0)], yPercent: [k(1, 0)] });
  assert.deepEqual(diamond.data.steps[1], both.steps[1], 'a key at the same time in another cue stays');
  assert.deepEqual(diamond.ended, []);
  const last = one({ '#a': { yPercent: [k(1, 0)] } });
  assert.deepEqual(animateLayer(last, '#a', key('#a', 0, 'y', 1, 0, 'remove'), frame).ended, ['y']);
  const offset = one({ '#a': { yPercent: [k(1, 40)] } });
  refuses(() => animateLayer(offset, '#a', key('#a', 0, 'y', 1, 0, 'remove'), frame), offset, /height/);
  // A percent that is not a number is no 0 either.
  const relative = one({ '#a': { yPercent: [k(0, '+=100'), k(1, '+=100')] } });
  refuses(() => animateLayer(relative, '#a', key('#a', 0, 'y', 0.5, 0, 'disable'), frame), relative, /yPercent offset of "\+=100"/);
  refuses(() => animateLayer(both, '#a', key('#a', 0, 'y', 0.5, 0, 'remove'), frame), both, /no key at this time/);
  refuses(() => animateLayer(both, '#a', key('#a', 0, 'yPercent', 0, 0, 'remove'), frame), both, /Name the control/);
  // A shared scale track is both axes: removing its last key ends both.
  const panel = one({ '#a': { scale: [k(0, 0.9)], y: [k(0, 3)] } });
  const scale = animateLayer(panel, '#a', key('#a', 0, 'scaleX', 0, 0.9, 'remove'), frame);
  assert.deepEqual(scale.ended, ['scaleX', 'scaleY']);
  assert.deepEqual(scale.data.steps[0].layers['#a'], { y: [k(0, 3)] });
  // autoAlpha is Opacity's: a key of it goes, but its last key or the stopwatch off refuse, since
  // autoAlpha also sets visibility, which a fixed opacity cannot keep. A raw transform refuses Position.
  const alpha = one({ '#a': { autoAlpha: [k(0, 0), k(1, 1)] } });
  assert.deepEqual(animateLayer(alpha, '#a', key('#a', 0, 'opacity', 0, 0, 'remove'), frame), { data: one({ '#a': { autoAlpha: [k(1, 1)] } }), ended: [] });
  refuses(() => animateLayer(alpha, '#a', key('#a', 0, 'opacity', 0, 0.5, 'disable'), frame), alpha, /#a animates autoAlpha, which also sets its visibility, so a fixed opacity cannot keep where it shows/);
  const twoOpacities = one({ '#a': { opacity: [k(0, 1)], autoAlpha: [k(0, 1)] } });
  refuses(() => animateLayer(twoOpacities, '#a', key('#a', 0, 'opacity', 0, 1, 'disable'), frame), twoOpacities, /autoAlpha/);
  assert.deepEqual(animateLayer(one({ '#a': { opacity: [k(0, 0), k(1, 1)] } }), '#a', key('#a', 0, 'opacity', 0, 0.5, 'disable'), frame).ended, ['opacity']);
  const transform = one({ '#a': { transform: [k(0, 'none')], x: [k(0, 1)] } });
  refuses(() => animateLayer(transform, '#a', key('#a', 0, 'x', 0, 0, 'disable'), frame), transform, /raw transform string/);
  const still = one({});
  refuses(() => animateLayer(still, '#a', key('#a', 0, 'y', 0, 0, 'disable'), frame), still, /no animation to disable/);
});

test('bars move and trim on every channel but autoAlpha\'s, keeping untouched tracks byte-identical', () => {
  // A Clean Steps row's bar moved later by five frames carries its reveal across the next flag.
  const steps = cleanSteps();
  const moved = animateLayer(steps, '#f1', { kind: 'layer.move', selector: '#f1', step: 1, delta: 0.2 }, frame).data;
  assert.deepEqual(moved.steps[1].spans['#f1'], [{ start: 0.2, end: 0.45 }]);
  assert.deepEqual(moved.steps[1].layers['#f1'].yPercent[0], k(0.2, 110));
  assert.equal(moved.steps[2].layers['#f1'].yPercent.at(-1).time, 0.2);
  assert.equal(untouched(moved, ['#f1']), untouched(steps, ['#f1']));
  // Its ruler curve moved by the delta: sampled before and after, it matches everywhere in Step 2 and 3.
  const starts = [0, 1.2, 1.65, 2.1];
  const at = (data, u) => { for (let i = 0; i < 4; i++) if (u <= starts[i + 1] + 1e-9 || i === 3) return Number(resolveValue(data, '#f1', 'yPercent', i, u - starts[i])); };
  // Hidden before its bar starts (0.2 s into Step 2), it is compared where it shows.
  for (let u = 1.41; u <= 2.1; u += 0.01) assert.ok(Math.abs(at(moved, u) - at(steps, u - 0.2)) < 2e-3, `#f1 at ${u.toFixed(2)} s`);
  // Trim keeps every key where it was.
  const trimmed = animateLayer(steps, '#f2', { kind: 'layer.trim', selector: '#f2', step: 2, interval: 0, edge: 'end', time: 0.37 }, frame).data;
  assert.deepEqual(trimmed.steps[2].spans['#f2'], [{ start: 0, end: 0.37 }]);
  assert.equal(JSON.stringify(trimmed.steps.map(s => s.layers)), JSON.stringify(steps.steps.map(s => s.layers)));
  // A scale panel's bar carries scale, y and opacity by one delta. (With its exit keys it could not
  // move later at all: they end with Out, and a move never lengthens Out, R1.2a.5.)
  const panel = frosted();
  refuses(() => animateLayer(panel, '.info-card-box', { kind: 'layer.move', selector: '.info-card-box', step: 0, delta: 0.08 }, frame), panel, /past the end of Out/);
  panel.steps[1].layers = {};
  const shifted = animateLayer(panel, '.info-card-box', { kind: 'layer.move', selector: '.info-card-box', step: 0, delta: 0.08 }, frame).data;
  for (const property of ['scale', 'y', 'opacity']) assert.deepEqual(shifted.steps[0].layers['.info-card-box'][property].map(x => x.time), [0.08, 0.68]);
  assert.equal(untouched(shifted, ['.info-card-box']), untouched(panel, ['.info-card-box']));
  // A raw transform's keys move by time: no value is read.
  const transform = one({ '#a': { transform: [k(0, 'translateX(0px)'), k(1, 'translateX(9px)')] } });
  assert.deepEqual(animateLayer(transform, '#a', { kind: 'layer.move', selector: '#a', step: 0, delta: 0.2 }, frame).data.steps[0].layers['#a'].transform.map(x => x.time), [0.2, 1.2]);
  // An aliased layer's bars and keys are its owner's.
  const aq = houseQuestion();
  const alias = animateLayer(aq, '.audience-question', { kind: 'layer.move', selector: '#f1', step: 0, delta: 0.08 }, frame).data;
  assert.deepEqual(alias.steps[0].layers['.audience-question'].yPercent.map(x => x.time), [0.43, 0.98]);
  assert.deepEqual(alias.steps[0].spans['.audience-question'], [{ start: 0.08, end: 1.05 }]);
  assert.equal(alias.steps.some(s => s.layers['#f1'] || s.spans?.['#f1']), false);
  assert.equal(untouched(alias, ['.audience-question']), untouched(aq, ['.audience-question']));
  // autoAlpha also sets visibility on the same timeline, so its bars refuse.
  const alpha = one({ '#a': { autoAlpha: [k(0, 0), k(1, 1)] } });
  refuses(() => animateLayer(alpha, '#a', { kind: 'layer.move', selector: '#a', step: 0, delta: 0.2 }, frame), alpha, /#a animates autoAlpha, which also sets its visibility/);
  refuses(() => animateLayer(alpha, '#a', { kind: 'layer.trim', selector: '#a', step: 0, interval: 0, edge: 'end', time: 1.5 }, frame), alpha, /autoAlpha/);
  refuses(() => animateLayer(steps, '#f0', { kind: 'layer.move', selector: '#f0', step: 7, delta: 0.2 }, frame), steps, /no longer exists/);
});

test('the displayed value and its inverse agree: a typed value lands where the field says, in the channel\'s own units', () => {
  const base = { x: 40, y: 100, scaleX: 1.2, scaleY: 0.8, rotation: 5 };
  const pose = (motion, size = [300, 50]) => ({ motion: { x: 0, y: 5, xPercent: 0, yPercent: 40, scaleX: 0.9, scaleY: 0.9, rotation: 10, opacity: 1, ...motion },
    initialMotion: { x: 0, y: 0, xPercent: 0, yPercent: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 }, unit: 1.5, size });
  const shown = displayedBase(base, pose({}), 'y');
  assert.ok(Math.abs(shown - (100 + (5 + 40 * 50 / 100) / 1.5)) < 1e-9);
  for (const channel of ['y', 'yPercent']) {
    const value = nativeValue(pose({}), '#a', 'y', channel, shown + 10, shown);
    assert.ok(Math.abs(displayedBase(base, pose({ [channel]: value }), 'y') - (shown + 10)) < 1e-9, channel);
  }
  assert.equal(nativeValue(pose({}), '#a', 'y', 'yPercent', shown + 10, shown), 40 + 10 * 1.5 * 100 / 50);
  const left = displayedBase(base, pose({ xPercent: -20 }), 'x');
  assert.equal(nativeValue(pose({ xPercent: -20 }), '#a', 'x', 'xPercent', left + 6, left), -20 + 6 * 1.5 * 100 / 300, 'xPercent is a share of the width');
  assert.ok(Math.abs(displayedBase(base, pose({ xPercent: nativeValue(pose({ xPercent: -20 }), '#a', 'x', 'xPercent', left - 6, left) }), 'x') - (left - 6)) < 1e-9);
  // Scale multiplies, whichever channel carries it.
  const scaleX = displayedBase(base, pose({}), 'scaleX');
  assert.ok(Math.abs(scaleX - 1.08) < 1e-9);
  for (const channel of ['scaleX', 'scale']) assert.ok(Math.abs(nativeValue(pose({}), '#a', 'scaleX', channel, 1.188, scaleX) - 0.99) < 1e-9);
  assert.throws(() => nativeValue(pose({}, [300, 0]), '#a', 'y', 'yPercent', shown + 10, shown), /#a has no height to measure its yPercent offset against/);
  assert.throws(() => nativeValue(pose({}, null), '#a', 'x', 'xPercent', 1, 0), /no width/);
  assert.throws(() => nativeValue({ ...pose({}), motion: undefined }, '#a', 'y', 'y', 1, 0), /rendered property pose/);
});

test('each control takes its own channel\'s key; the rest move the base by the change, and one scale track keys only a linked change', () => {
  const base = { selector: '#a', target: '#a', mode: 'flow', scaled: true, originX: 0, originY: 0, scaleReason: null, x: 40, y: 100, scaleX: 1, scaleY: 1, rotation: 0 };
  const pose = motion => ({ motion: { x: 0, y: 0, xPercent: 0, yPercent: 20, scaleX: 0.95, scaleY: 0.95, rotation: 0, opacity: 1, ...motion },
    initialMotion: { x: 0, y: 0, xPercent: 0, yPercent: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 }, unit: 2, size: [200, 50] });
  const at = { step: 0, time: 0.4 };
  // A yPercent row: Position Y keys yPercent; X is unarmed and moves the base by the change.
  const row = one({ '#a': { yPercent: [k(0, 110), k(1, 0)] } }), shown = displayedBase(base, pose({}), 'y');
  assert.deepEqual(transformOperations(row, '#a', '#a', base, pose({}), { x: 46, y: shown + 5 }, at), [
    { kind: 'animation.key', selector: '#a', property: 'yPercent', step: 0, time: 0.4, value: 20 + 5 * 2 * 100 / 50, action: 'set' },
    { kind: 'base.set', selector: '#a', values: { x: 46 } },
  ]);
  // Motion the editor does not key (a raw transform's x) stays motion: the base moves by the change only.
  const moved = pose({ x: 60 }), shownX = displayedBase(base, moved, 'x');
  assert.equal(shownX, 40 + 60 / 2);
  assert.deepEqual(transformOperations(one({ '#a': { transform: [k(0, 'translateX(0px)'), k(1, 'translateX(120px)')] } }), '#a', '#a', base, moved, { x: shownX + 10 }, at),
    [{ kind: 'base.set', selector: '#a', values: { x: 50 } }]);
  // A graphic whose sequence the editor does not author edits the base by the change too.
  const machine = { ...one({ '#a': { y: [k(0, 3)] } }), machine: {} };
  assert.deepEqual(transformOperations(machine, '#a', '#a', base, pose({ y: 6 }), { y: displayedBase(base, pose({ y: 6 }), 'y') + 4 }, at), [{ kind: 'base.set', selector: '#a', values: { y: 104 } }]);
  // A shared scale track: a linked change is one scale key; one axis alone or unequal ratios refuse.
  const panel = one({ '#a': { scale: [k(0, 0.9), k(1, 1)] } });
  const sx = displayedBase(base, pose({}), 'scaleX');
  const linked = transformOperations(panel, '#a', '#a', base, pose({}), { scaleX: sx * 1.2, scaleY: sx * 1.2 }, at);
  assert.deepEqual(linked.map(o => [o.property, o.step, o.time]), [['scale', 0, 0.4]]);
  assert.ok(Math.abs(linked[0].value - 0.95 * 1.2) < 1e-9);
  assert.throws(() => transformOperations(panel, '#a', '#a', base, pose({}), { scaleX: sx * 1.2 }, at), /Scale X and Y share one scale track on #a/);
  assert.throws(() => transformOperations(panel, '#a', '#a', base, pose({}), { scaleX: sx * 1.2, scaleY: sx * 1.1 }, at), /share one/);
  // Per-axis scale keys each axis.
  const axes = one({ '#a': { scaleX: [k(0, 0.9)], scaleY: [k(0, 0.9)] } });
  assert.deepEqual(transformOperations(axes, '#a', '#a', base, pose({}), { scaleX: sx * 1.2, scaleY: sx * 1.1 }, at).map(o => o.property), ['scaleX', 'scaleY']);
  // An aliased layer keys under its owner's channels but names the layer.
  assert.deepEqual(transformOperations(houseQuestion(), '#f1', '.audience-question', base, pose({}), { y: shown + 5 }, at).map(o => [o.selector, o.property]), [['#f1', 'yPercent']]);
});
