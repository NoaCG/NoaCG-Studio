// guards: src/templates/shared/animRuntime.ts, src/templates/shared/animRuntimeLegacy.ts, src/templates/shared/easeRuntime.ts, src/blocks/animMigration.ts, src/blocks/animMachine.ts, src/blocks/animEval.ts, src/blocks/animData.ts, src/model/contentHash.ts, src/assets/gsap.min.js, e2e/fixtures/out-steps.json, e2e/fixtures/interpreter-hold-v1.js
//
// R1.2a.3 OUT FROM ANY STEP (docs/research/editor-r1-2a-3/README.md). Out always leaves from what
// is on screen: at the last step it plays the authored exit from the held pose; at an earlier step
// (a Next cue still unplayed) each visible layer runs the interrupted-Out policy from its live pose
// to its end-of-Out pose, and layers from unreached steps stay hidden. Here the emitted interpreter
// and the bundled GSAP run in a vm context over a stub DOM (plain objects GSAP tweens as it tweens
// any object), so the decision and its timing are checked without a browser. What needs Chromium -
// the simulator, every exported package and the editor's Out button - is e2e/editor-out-step.spec.ts.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import vm from 'node:vm';
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

const runtime = await load('src/templates/shared/animRuntime.ts'), { emitAnimRegion, ANIM_INTERPRETER_JS, writeOutData } = runtime;
const legacy = await load('src/templates/shared/animRuntimeLegacy.ts');
const { easeCurve, parseEase } = await load('src/templates/shared/easeRuntime.ts');
const { resolveValue } = await load('src/blocks/animEval.ts');
const { deriveMachine } = await load('src/blocks/animMachine.ts');
const { prepareOutRuntime } = await load('src/blocks/animMigration.ts');
const { contentHash } = await load('src/model/contentHash.ts');
const GSAP = readFileSync(path.join(root, 'src/assets/gsap.min.js'), 'utf8');

/** In, two Next cues and Out at speed 1.25. The box's Out starts with the motion an R1.2a.1 Set Out
 *  moved out of a Next cue and ends on a slice, the title's ends on a hold and the badge's on a jump.
 *  The badge is revealed by a bar in Step 2, #outside (outside the root) by `reveals` in Step 3. */
const steps = () => JSON.parse(readFileSync(path.join(root, 'e2e/fixtures/out-steps.json'), 'utf8'));
const LAYERS = ['#box', '#title', '#badge', '#outside'], PROPS = ['x', 'y', 'rotation', 'opacity'];
const OUT = 3;

/** The emitted region in a fresh vm context: GSAP resolves selectors through the stub document and
 *  tweens the stub elements' own properties, and getComputedStyle reads them back. */
function graphic(js) {
  const stage = { opacity: 0, visibility: 'visible', display: 'block', parentElement: null };
  const layer = parent => ({ x: 0, y: 0, rotation: 0, opacity: 1, visibility: 'visible', display: 'block', parentElement: parent });
  const els = { '.fixture': stage, '#box': layer(stage), '#title': layer(stage), '#badge': layer(stage), '#outside': layer(null) };
  stage.contains = element => element !== stage && element.parentElement === stage;
  const all = Object.values(els);
  const document = {
    querySelectorAll: selector => selector === '*' ? all : els[selector] ? [els[selector]] : [],
    querySelector: selector => els[selector] ?? null,
    createElement: () => ({ style: {} }), createElementNS: () => ({ style: {} }), documentElement: { style: {} }, body: { style: {} },
  };
  const w = vm.createContext({ document, getComputedStyle: e => ({ visibility: e.visibility, display: e.display, opacity: String(e.opacity) }),
    requestAnimationFrame: () => 0, cancelAnimationFrame: () => {} });
  w.window = w; w.self = w;
  vm.runInContext(GSAP, w);
  vm.runInContext(js, w);
  const pose = () => LAYERS.flatMap(s => PROPS.map(p => Number(els[s][p])));
  const shown = s => els[s].visibility !== 'hidden' && Number(els[s].opacity) > 0;
  // A cue's timeline, paused where the test puts it (the stub ticker never advances anything).
  const cue = tl => { if (tl) tl.pause(); return tl; };
  return { w, els, stage, pose, shown,
    play: () => cue(w.buildInTimeline()), next: () => cue(w.revealNextStep()), out: () => cue(w.buildOutTimeline()) };
}
const templateOf = data => graphic(emitAnimRegion(data));

/** Walk to a position: `nexts` Next cues after In, each settled, the last one stopped at `at` of its
 *  length when given (an interrupted cue). Returns the pose Out is pressed from. */
function walk(g, nexts, at) {
  let tl = g.play();
  for (let i = 0; i <= nexts; i++) {
    if (i > 0) tl = g.next();
    if (i === nexts && at !== undefined) tl.time(tl.duration() * at, true); else tl.progress(1, true);
  }
  return g.pose();
}

/** Exit times on the Out cue's own clock (stored units; they play at u / speed seconds). */
const EXIT = Array.from({ length: 111 }, (_, i) => i / 100);

/** A press-revealed layer outside the root, which Out does not animate, fades with the exit over
 *  0.3 of its units on GSAP's default ease (noacgExitTimeline). */
function outsideFade(data, s, p, live, u) {
  if (s !== '#outside' || p !== 'opacity' || data.steps[OUT].layers[s]) return null;
  return live * (1 - easeCurve('power1.out')(Math.min(1, u / Math.min(.3, data.steps[OUT].duration))));
}

/** The interrupted-Out policy (D02): each track of a layer visible when Out starts tweens from its
 *  live value to its last key over its span, the last ease as its whole curve; a final jump starts
 *  where its own segment starts; a one-key or zero-time track is a cut; untouched tracks hold. */
function interruptedModel(data, held, visible) {
  const exit = data.steps[OUT];
  return EXIT.map(u => LAYERS.flatMap((s, l) => PROPS.map((p, i) => {
    const live = held[l * PROPS.length + i], keys = exit.layers[s]?.[p];
    if (!visible.includes(s)) return live;
    if (!keys) return outsideFade(data, s, p, live, u) ?? live;
    const first = keys[0], last = keys[keys.length - 1];
    if (keys.length < 2 || last.time <= first.time) return first.value;
    const text = last.ease || exit.ease, parsed = parseEase(text);
    const from = parsed?.kind === 'jump' ? keys[keys.length - 2].time : first.time;
    if (u < from) return live;
    const curve = easeCurve(parsed?.kind === 'slice' ? parsed.base.text : text);
    return live + (last.value - live) * curve(Math.min(1, (u - from) / (last.time - from)));
  })));
}
/** The authored exit from the held pose: the editor's own sampling of the Out cue. */
function authoredModel(data, held, visible) {
  return EXIT.map(u => LAYERS.flatMap((s, l) => PROPS.map((p, i) => {
    const keys = data.steps[OUT].layers[s]?.[p], live = held[l * PROPS.length + i];
    if (!visible.includes(s)) return live;
    return keys ? Number(resolveValue(data, s, p, OUT, u)) : outsideFade(data, s, p, live, u) ?? live;
  })));
}

function near(actual, expected, what, tolerance = 1e-6) {
  let worst = { error: 0, at: '' };
  actual.forEach((pose, k) => pose.forEach((v, j) => {
    const error = Math.abs(v - expected[k][j]);
    if (!(error <= tolerance) && !(error <= worst.error)) worst = { error: Number.isNaN(error) ? Infinity : error, at: `u=${EXIT[k]} ${LAYERS[Math.floor(j / PROPS.length)]} ${PROPS[j % PROPS.length]}: ${v} vs ${expected[k][j]}` };
  }));
  assert.equal(worst.error, 0, `${what}: ${worst.at}`);
}

/** Out from `nexts` Next cues in (stopped at `at` of the last one when given). */
function outFrom(data, nexts, at) {
  const g = templateOf(data), held = walk(g, nexts, at);
  const visible = LAYERS.filter(g.shown), exit = g.out(), released = g.pose();
  const hidden = LAYERS.filter(s => !visible.includes(s));
  const seen = [];
  const samples = EXIT.map(u => { exit.time(u / data.speed, true); seen.push(...hidden.filter(g.shown)); return g.pose(); });
  return { g, held, visible, released, samples, appeared: [...new Set(seen)], exit };
}

test('Out parked at an earlier step leaves from the live pose and never shows an unreached step', () => {
  const data = steps();
  for (const [nexts, unreached] of [[0, ['#badge', '#outside']], [1, ['#outside']]]) {
    const run = outFrom(data, nexts);
    const where = nexts === 0 ? 'after In' : 'after Step 2';
    assert.deepEqual(LAYERS.filter(s => !run.visible.includes(s)), unreached, `${where}: the layers of unreached steps are hidden`);
    // No jump at dispatch: before any advance the pose is the one Out was pressed from.
    near([run.released], [run.held], `${where}: the pose at dispatch`);
    near(run.samples, interruptedModel(data, run.held, run.visible), `${where}: the interrupted exit`);
    assert.deepEqual(run.appeared, [], `${where}: nothing from an unreached step appears`);
    assert.equal(run.g.stage.opacity, 0, `${where}: the root is hidden at the end`);
  }
});

test('Out at the last step plays the authored exit from the held pose, as before', () => {
  const data = steps(), run = outFrom(data, 2);
  assert.deepEqual(run.visible, LAYERS);
  near(run.samples, authoredModel(data, run.held, run.visible), 'after Step 3: the authored exit');
  // The authored exit hides the badge by its Out bar at 0.5; the interrupted exit keeps bars off.
  run.exit.time(.6 / data.speed, true);
  assert.equal(run.g.els['#badge'].visibility, 'hidden');
});

test('Out during In or during a Next is interrupted as before', () => {
  const data = steps();
  for (const nexts of [0, 1, 2]) {
    const run = outFrom(data, nexts, .4);
    near([run.released], [run.held], `40% into cue ${nexts}: the pose at dispatch`);
    near(run.samples, interruptedModel(data, run.held, run.visible), `40% into cue ${nexts}: the interrupted exit`);
  }
});

test('Next does nothing once Out has started, until the next play()', () => {
  const data = steps(), g = templateOf(data);
  walk(g, 0);
  const exit = g.out();
  exit.time(.2, true);
  const leaving = g.pose();
  assert.equal(g.next(), null, 'next() during an Out from an earlier step plays no Next cue');
  assert.deepEqual(g.pose(), leaving);
  exit.progress(1, true);
  assert.equal(g.next(), null, 'nor after it');
  // play() takes the graphic on air again and Next walks as before.
  g.play().progress(1, true);
  assert.notEqual(g.next(), null);
});

test('a machine graphic keeps its authored exit from every state', () => {
  const data = steps();
  data.machine = deriveMachine(data);
  const run = outFrom(data, 0);
  // As before: the Out's first keys apply as it starts, here the box's last-step x of 300.
  assert.equal(run.released[0], 300);
  near(run.samples, authoredModel(data, run.held, run.visible), 'machine after In: the authored exit');
});

test('Out before play() and a one-key Out track are as before', () => {
  const data = steps();
  const g = templateOf(data), exit = g.out();
  assert.equal(g.els['#box'].x, 300, 'off air, Out plays the authored exit (its first key)');
  exit.progress(1, true);
  // D02: a one-key or zero-time Out track is an explicit cut, at every step.
  const cut = steps();
  cut.steps[OUT].layers['#box'].opacity = [{ time: .5, value: .25 }];
  for (const nexts of [0, 2]) assert.equal(outFrom(cut, nexts).released[3], .25, `cut from cue ${nexts}`);
});

test('a graphic saved with the R1.2a.2 interpreter upgrades once to leave from any step', () => {
  const before = readFileSync(path.join(root, 'e2e/fixtures/interpreter-hold-v1.js'), 'utf8').replace(/\r\n/g, '\n');
  assert.equal(contentHash(before.trim()), legacy.ANIM_INTERPRETER_BEFORE_STEP_OUT_HASH, 'the fixture is the recorded body');
  assert.ok(runtime.hasHoldRuntime(before) && before.trim() !== ANIM_INTERPRETER_JS.trim());
  const data = steps(), current = emitAnimRegion(data), saved = current.replace(ANIM_INTERPRETER_JS, () => before);
  assert.notEqual(saved, current);
  // The saved body is the reproduction: Out after In jumps to the last step's pose.
  const old = graphic(saved);
  walk(old, 0); old.out();
  assert.equal(old.els['#box'].x, 300);
  const upgraded = prepareOutRuntime(saved);
  assert.equal(upgraded, current, 'preview, save and export re-emit the known body');
  assert.equal(prepareOutRuntime(upgraded), upgraded, 'once');
  assert.equal(writeOutData(saved, data), current);
  assert.equal(writeOutData(saved.replace('var noacgStepsPlayed = 0;', 'var noacgStepsPlayed = 0; window.customTail = true;'), data), null, 'custom source still refuses');
  const now = graphic(upgraded);
  walk(now, 0); now.out();
  assert.equal(now.els['#box'].x, 0, 'upgraded, Out leaves from the live pose');
});
