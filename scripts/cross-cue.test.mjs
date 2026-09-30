// guards: src/blocks/animEdit.ts, src/blocks/editorOut.ts, src/blocks/editorAnimation.ts, src/blocks/animEval.ts, src/blocks/animData.ts, src/blocks/animMigration.ts, src/templates/shared/animRuntime.ts, src/templates/shared/animRuntimeLegacy.ts, src/templates/shared/easeRuntime.ts, src/model/contentHash.ts, src/assets/gsap.min.js, e2e/fixtures/cross-cue.json, e2e/fixtures/interpreter-one-key-hold-v1.js
//
// R1.2a.5 CROSS-CUE MOVES AND THE OUT FLAG (docs/research/editor-r1-2a-5/README.md). The owner's
// 2026-09-30 decision: the exit belongs to the Out flag, keeping its own timing from where it starts,
// so pressing Out plays it at once whichever way the flag moves; Out set inside motion carries that
// motion into Out, where it plays first and the exit starts as it ends. Keys and bar bodies dragged
// across a Step or Out flag land in the other cue at their absolute times. Here the pure operations
// and the emitted interpreter (over the stub DOM of scripts/out-step.test.mjs) are checked densely;
// what needs Chromium - every exported package and the editor's drags - is e2e/editor-cross-cue.spec.ts.
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
const [edit, { moveOutBoundary, applyOut }, animation, { resolveValue }, animData, runtime, legacy, { prepareOutRuntime }, { contentHash }, { easeCurve }] = await Promise.all([
  'src/blocks/animEdit.ts', 'src/blocks/editorOut.ts', 'src/blocks/editorAnimation.ts', 'src/blocks/animEval.ts', 'src/blocks/animData.ts',
  'src/templates/shared/animRuntime.ts', 'src/templates/shared/animRuntimeLegacy.ts', 'src/blocks/animMigration.ts', 'src/model/contentHash.ts',
  'src/templates/shared/easeRuntime.ts'].map(load));
const { moveKeys, moveLayerSpan, splitCue } = edit;
const { emitAnimRegion, ANIM_INTERPRETER_JS, writeOutData } = runtime;
const GSAP = readFileSync(path.join(root, 'src/assets/gsap.min.js'), 'utf8');

/** In (1.2 s, still after 0.8), Step 2 (1 s, still after 0.6) revealing the badge and the tag, and
 *  an exit with a designed beat: the title leaves at once, the box 0.2 s later. */
const fixture = () => JSON.parse(readFileSync(path.join(root, 'e2e/fixtures/cross-cue.json'), 'utf8'));
const html = '<div class="fixture"><div id="box"></div><div id="title"></div><div id="badge"></div><div id="tag"></div></div><div id="outside"></div>';
const templateOf = data => ({ html, css: '', fields: [], fps: 25, settings: {}, js: emitAnimRegion(data) });
const round = n => Math.round(n * 1000) / 1000;
const starts = data => data.steps.reduce((acc, s, i) => [...acc, round(acc[i] + s.duration)], [0]);
const tracks = (...all) => [...new Set(all.flatMap(d => d.steps.flatMap(s => Object.entries(s.layers).flatMap(([sel, t]) => Object.keys(t).map(p => sel + '\n' + p)))))].map(k => k.split('\n'));
const near = (a, b, tolerance = 1e-3) => a === b || Math.abs(a - b) <= tolerance + 1e-9;

/** The value a layer shows at stored ruler time u when every cue plays straight after the one
 *  before: the cue holding u (the arriving one at a flag), sampled as the editor samples it. */
function ruler(data, selector, prop, u) {
  const s = starts(data);
  for (let i = 0; i < data.steps.length; i++) if (u <= s[i + 1] + 1e-9 || i === data.steps.length - 1) return resolveValue(data, selector, prop, i, Math.max(0, u - s[i]));
}
/** A refusal throws with its reason and leaves the input exactly as it was. */
function refuses(run, data, pattern) {
  const frozen = JSON.stringify(data);
  assert.throws(run, pattern);
  assert.equal(JSON.stringify(data), frozen);
}

/** The owner's rule, sampled as the editor samples it: pressing Out at the last step of `after` (Out
 *  moved to b on the last pre-Out cue's clock) plays the original's cue from b up to where Out's
 *  carried motion ends, then the original exit from its start, with no pause; the hold at b is what
 *  the original showed there. */
function exitPlays(before, after, b, label) {
  const at = before.steps.length - 2, out = after.steps.length - 1, carry = after.steps[out].carried ?? 0;
  for (const [selector, prop] of tracks(before, after)) {
    assert.ok(near(resolveValue(after, selector, prop, at, b), resolveValue(before, selector, prop, at, Math.min(b, before.steps[at].duration))), `${label}: ${selector} ${prop} at the hold`);
    for (let i = 0; i <= 1000; i++) {
      const u = after.steps[out].duration * i / 1000, got = resolveValue(after, selector, prop, out, u);
      const want = u < carry - 1e-9 ? resolveValue(before, selector, prop, at, b + u) : resolveValue(before, selector, prop, before.steps.length - 1, u - carry);
      assert.ok(near(got, want), `${label}: ${selector} ${prop} at ${u} of Out: ${got} vs ${want}`);
    }
  }
}

test('carried is an optional number on a step that round-trips and is refused out of range', () => {
  const data = moveOutBoundary(fixture(), 0.32), js = emitAnimRegion(data);
  assert.equal(data.steps[2].carried, 0.28);
  assert.match(js, /"ease": "none",\n\s+"carried": 0\.28,/);
  assert.deepEqual(animData.parseAnimData(js), data);
  assert.ok(animData.losslessAnimData(js));
  for (const carried of [0, -1, 5, '0.2']) {
    const bad = structuredClone(data); bad.steps[2].carried = carried;
    assert.equal(animData.parseAnimData(emitAnimRegion(bad).replace(/"carried": [^,]+,/, `"carried": ${JSON.stringify(carried)},`)), null, `carried ${carried}`);
  }
});

test('Out later or into still air keeps the exit on its own clock, and into motion carries the rest first', () => {
  const before = fixture();
  for (const b of [1.2, 1.6, 0.8, 0.64]) {
    const after = moveOutBoundary(before, b);
    assert.deepEqual([after.steps[1].duration, after.steps[2]], [b, before.steps[2]], `Out at ${b}: the exit is untouched`);
    exitPlays(before, after, b, `Out at ${b}`);
  }
  // Out where the tag's bar ends shows it at the hold (its arriving side), so Out hides it at the press.
  assert.deepEqual(moveOutBoundary(before, 0.6).steps[2].spans, { '#tag': [] });
  for (const b of [0.24, 0.32, 0.5, 0.56]) {
    const after = moveOutBoundary(before, b), carry = round(0.6 - b);
    assert.deepEqual([after.steps[1].duration, after.steps[2].carried, after.steps[2].duration], [b, carry, round(carry + 0.9)], `Out at ${b}`);
    // The exit's own keys keep their timing from where it now starts: the title leaves at once.
    assert.deepEqual(after.steps[2].layers['#title'].x.map(k => k.time), [carry, round(carry + 0.6)]);
    exitPlays(before, after, b, `Out at ${b}`);
  }
  // In an entrance with still air after its motion, Out inside it ends where the motion does.
  const entrance = { version: 2, root: '.fixture', speed: 1, steps: [{ name: 'In', duration: 2, ease: 'none', layers: { '#box': { x: [{ time: 0, value: -900 }, { time: 1, value: 0 }] } } }] };
  const cut = moveOutBoundary(entrance, 0.4);
  assert.deepEqual(cut.steps.map(s => [s.duration, s.carried]), [[0.4, undefined], [0.6, 0.6]]);
  exitPlays({ ...entrance, steps: [...entrance.steps, { name: 'Out', duration: 0, ease: 'none', layers: {} }] }, cut, 0.4, 'into the entrance');
});

test('moving Out again starts from the whole motion: any two moves equal one, and back is the source', () => {
  const before = fixture();
  assert.deepEqual(moveOutBoundary(moveOutBoundary(before, 0.32), 1), before, 'inside Step 2 and back');
  for (const [first, second] of [[0.32, 0.5], [0.32, 0.24], [0.5, 0.24], [0.32, 0.8], [0.24, 1.4], [1.4, 0.32], [0.8, 0.32]]) {
    assert.deepEqual(moveOutBoundary(moveOutBoundary(before, first), second), moveOutBoundary(before, second), `Out at ${first} then ${second}`);
  }
  // A key moved across the end of the carried motion no longer tells it from the exit.
  const carried = moveOutBoundary(before, 0.32);
  carried.steps[2].layers['#box'].rotation[1].time = 0.4;
  refuses(() => moveOutBoundary(carried, 0.5), carried, /#box rotation moves across the end of the motion Out carries/);
});

test('Set Out refuses what the runtime could not play exactly, leaving the source as it was', () => {
  const at = (mutate, b, pattern) => { const data = fixture(); mutate(data); refuses(() => moveOutBoundary(data, b), data, pattern); };
  at(d => { d.steps[1].layers['#box'].rotation[1].ease = 'steps(4)'; }, 0.32, /#box rotation.*steps\(4\)/);
  at(d => { d.steps[1].hides = ['#title']; }, 0.32, /#title leaves at the end of this cue \(a legacy hide\)/);
  at(d => { d.steps[1].spans['#tag'] = [{ start: 0.4, end: 0.6 }]; }, 0.32, /#tag is hidden at this Out and visible after it/);
  at(d => { d.steps[2].layers['#box'].rotation = [{ time: 0, value: 45 }, { time: 0.5, value: 0 }]; }, 0.32, /#box rotation jumps where Out starts/);
  at(d => { d.steps[1].layers['#box'].rotation.push({ time: 1.5, value: 0 }); }, 1.6, /#box rotation has keys after the end of its cue/);
  // Moving Out later needs nothing else: even an exit starting on a key keeps its timing.
  assert.doesNotThrow(() => moveOutBoundary(fixture(), 3));
});

// ---- The emitted interpreter over a stub DOM (as scripts/out-step.test.mjs) ----

const LAYERS = ['#box', '#title', '#badge', '#tag', '#outside'], PROPS = ['x', 'y', 'rotation', 'opacity'];
function graphic(js) {
  const stage = { opacity: 0, visibility: 'visible', display: 'block', parentElement: null };
  const layer = parent => ({ x: 0, y: 0, rotation: 0, opacity: 1, visibility: 'visible', display: 'block', parentElement: parent });
  const els = Object.fromEntries([['.fixture', stage], ...LAYERS.map(s => [s, layer(s === '#outside' ? null : stage)])]);
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
  const pose = () => LAYERS.flatMap(s => PROPS.map(p => Number(els[s][p])).concat(els[s].visibility === 'hidden' ? 0 : 1));
  const cue = tl => { if (tl) tl.pause(); return tl; };
  return { els, stage, pose, play: () => cue(w.buildInTimeline()), next: () => cue(w.revealNextStep()), out: () => cue(w.buildOutTimeline()) };
}
/** Out pressed after `nexts` Next cues, each settled: the exit sampled at `times` seconds. */
function pressOut(js, nexts, times) {
  const g = graphic(js);
  let tl = g.play();
  for (let i = 0; i <= nexts; i++) { if (i > 0) tl = g.next(); tl.progress(1, true); }
  const held = g.pose(), exit = g.out();
  return { held, released: g.pose(), samples: times.map(t => { exit.time(t, true); return g.pose(); }), duration: exit.duration() };
}
/** The fixture with a layer outside the root that Step 2 reveals through older source, which Out
 *  fades as the exit starts. */
const outside = () => {
  const data = fixture();
  data.steps[1].reveals = ['#outside'];
  data.steps[1].layers['#outside'] = { opacity: [{ time: 0, value: 0 }, { time: 0.3, value: 1 }] };
  return data;
};
function samePoses(actual, expected, what, tolerance = 1e-6) {
  actual.forEach((pose, k) => pose.forEach((v, j) => assert.ok(Math.abs(v - expected[k][j]) <= tolerance,
    `${what}: sample ${k} ${LAYERS[Math.floor(j / 5)]} ${[...PROPS, 'visible'][j % 5]}: ${v} vs ${expected[k][j]}`)));
}

test('pressing Out after Set Out inside Step 2 plays the rest of its motion, then the exit at once', () => {
  const before = outside(), after = moveOutBoundary(before, 0.32), carry = 0.28;
  const exit = Array.from({ length: 119 }, (_, i) => round(i / 100));
  // The original, played on: the rest of Step 2 from 0.32, then its Out from the press.
  const g = graphic(emitAnimRegion(before));
  let tl = g.play(); tl.progress(1, true); tl = g.next();
  const rest = exit.filter(u => u < carry).map(u => { tl.time(0.32 + u, true); return g.pose(); });
  tl.progress(1, true);
  const original = pressOut(emitAnimRegion(before), 1, exit.filter(u => u >= carry).map(u => round(u - carry)));
  const moved = pressOut(emitAnimRegion(after), 1, exit);
  assert.equal(moved.duration, 1.18);
  // Within one stored unit: the split values are stored at three decimals.
  samePoses(moved.samples, [...rest, ...original.samples], 'the carried motion, then the exit', 1e-3);
  // The title's exit moves as soon as the carried motion ends.
  const title = exit.findIndex(u => moved.samples[exit.indexOf(u)][5] !== 0);
  assert.equal(exit[title], 0.29);
});

test('Out pressed at an earlier step skips the carried time: the exit starts at the press', () => {
  const before = outside(), after = moveOutBoundary(before, 0.32), exit = Array.from({ length: 90 }, (_, i) => round(i / 100));
  const original = pressOut(emitAnimRegion(before), 0, exit), moved = pressOut(emitAnimRegion(after), 0, exit);
  assert.equal(moved.duration, original.duration);
  samePoses([moved.released], [original.released], 'the pose at the press');
  samePoses(moved.samples, original.samples, 'the exit from the press');
  // The R1.2a.4 interpreter, the reproduction: its exit waits out the carried time.
  const before4 = readFileSync(path.join(root, 'e2e/fixtures/interpreter-one-key-hold-v1.js'), 'utf8').replace(/\r\n/g, '\n');
  const old = pressOut(emitAnimRegion(after).replace(ANIM_INTERPRETER_JS, () => before4), 0, exit);
  assert.equal(old.samples[20][5], 0, 'the old body has not moved the title 0.2 s after the press');
  assert.notEqual(moved.samples[20][5], 0);
});

test('a layer outside the root fades where the exit starts: after the carried motion, or at an earlier press', () => {
  const after = moveOutBoundary(outside(), 0.32), opacity = s => s[4 * 5 + 3];
  const last = pressOut(emitAnimRegion(after), 1, [0, 0.27, 0.28, 0.4]);
  assert.deepEqual(last.samples.slice(0, 3).map(opacity), [1, 1, 1], 'on screen through the carried motion');
  assert.ok(opacity(last.samples[3]) < 1, 'fading once the exit starts');
  const early = pressOut(emitAnimRegion(after), 0, [0, 0.12]);
  assert.equal(opacity(early.samples[0]), 0, 'unreached from an earlier step');
});

test('a graphic saved with the R1.2a.4 interpreter upgrades once, and custom source still refuses', () => {
  const before = readFileSync(path.join(root, 'e2e/fixtures/interpreter-one-key-hold-v1.js'), 'utf8').replace(/\r\n/g, '\n');
  assert.equal(contentHash(before.trim()), legacy.ANIM_INTERPRETER_BEFORE_CARRIED_HASH, 'the fixture is the recorded body');
  assert.ok(!before.includes('step.carried') && ANIM_INTERPRETER_JS.includes('step.carried'));
  const data = moveOutBoundary(fixture(), 0.32), current = emitAnimRegion(data), saved = current.replace(ANIM_INTERPRETER_JS, () => before);
  assert.notEqual(saved, current);
  const upgraded = prepareOutRuntime(saved);
  assert.equal(upgraded, current, 'preview, save and export re-emit the known body');
  assert.equal(prepareOutRuntime(upgraded), upgraded, 'once');
  assert.equal(runtime.writeAnimData(saved, data), current, 'a carried Out re-emits it on any write');
  assert.equal(writeOutData(saved.replace('var noacgStepsPlayed = 0;', 'var noacgStepsPlayed = 0; window.customTail = true;'), data), null, 'custom source still refuses');
});

// ---- Keys across flags ----

const key = (step, selector, property, time) => ({ step, selector, property, time });
/** Every sampled value of every track on a dense ruler grid equal to `curve` where given, else to the
 *  original, within one stored unit. */
function playsOnRuler(before, after, curves, label) {
  const end = starts(before).at(-1);
  for (const [selector, prop] of tracks(before, after)) for (let i = 0; i <= 2400; i++) {
    const u = end * i / 2400, curve = curves[selector + ' ' + prop];
    const want = curve ? curve(u) : ruler(before, selector, prop, u), got = ruler(after, selector, prop, u);
    assert.ok(near(got, want), `${label}: ${selector} ${prop} at ${u}: ${got} vs ${want}`);
  }
}
const backOut = easeCurve('back.out(1.6)'), inOut = easeCurve('power1.inOut');

test('a key dragged across a Step flag lands at its absolute time and the curve is cut at the flag', () => {
  const before = fixture(), after = moveKeys(before, [key(0, '#title', 'x', 0.8)], 0.8);
  assert.deepEqual(after.steps.map(s => s.duration), [1.2, 1, 0.9]);
  assert.deepEqual(after.steps[0].layers['#title'].x.map(k => [k.time, k.ease]), [[0, undefined], [1.2, 'slice(back.out(1.6),0,0.75)']]);
  assert.deepEqual(after.steps[1].layers['#title'].x.map(k => [k.time, k.ease]), [[0, undefined], [0.4, 'slice(back.out(1.6),0.75,1)']]);
  playsOnRuler(before, after, { '#title x': u => u <= 1.6 ? -600 + 600 * backOut(u / 1.6) : ruler(before, '#title', 'x', u) }, 'title across Step 2');
  // Nothing else moved, byte for byte.
  for (const [i, step] of before.steps.entries()) for (const selector of Object.keys(step.layers)) if (selector !== '#title') assert.deepEqual(after.steps[i].layers[selector], step.layers[selector]);
  // Dragged back, the flag's split key rejoins and the source is what it was.
  assert.deepEqual(moveKeys(after, [key(1, '#title', 'x', 0.4)], -0.8), before);
  // A nudge on the far side retimes the whole segment, cut again at the flag.
  const nudged = moveKeys(after, [key(1, '#title', 'x', 0.4)], 0.04);
  playsOnRuler(before, nudged, { '#title x': u => u <= 1.64 ? -600 + 600 * backOut(u / 1.64) : ruler(before, '#title', 'x', u) }, 'nudged');
});

test('a key dragged across the Out flag lands in Out, and one past its end lengthens it', () => {
  const before = fixture(), after = moveKeys(before, [key(1, '#box', 'rotation', 0.6)], 0.6);
  assert.deepEqual([after.steps[1].layers['#box'].rotation.map(k => k.time), after.steps[2].layers['#box'].rotation.map(k => k.time), after.steps[2].duration], [[0, 1], [0, 0.2], 0.9]);
  playsOnRuler(before, after, { '#box rotation': u => u < 1.2 ? 0 : u <= 2.4 ? 90 * inOut((u - 1.2) / 1.2) : 90 }, 'rotation into Out');
  assert.deepEqual(moveKeys(after, [key(2, '#box', 'rotation', 0.2)], -0.6), before);
  const past = moveKeys(before, [key(2, '#box', 'x', 0.8), key(2, '#box', 'opacity', 0.8)], 0.3);
  assert.equal(past.steps[2].duration, 1.1);
});

test('keys keep their order and their cue defaults, and a boundary key moves as one', () => {
  const before = fixture();
  // Within a cue only the moved key changes.
  const within = moveKeys(before, [key(0, '#box', 'opacity', 0.4)], 0.2);
  assert.deepEqual(within.steps[0].layers['#box'].opacity, [{ time: 0, value: 0 }, { time: 0.6, value: 1 }]);
  assert.deepEqual({ ...within.steps[0].layers, '#box': undefined }, { ...before.steps[0].layers, '#box': undefined });
  // A key moving between cues whose default eases differ says which it relied on.
  const eased = structuredClone(before); eased.steps[0].ease = 'power2.out'; eased.steps[0].layers['#box'].opacity[1].ease = undefined;
  delete eased.steps[0].layers['#box'].opacity[1].ease;
  const moved = moveKeys(eased, [key(0, '#box', 'opacity', 0.4)], 0.9);
  assert.equal(moved.steps[1].layers['#box'].opacity.at(-1).ease, 'slice(power2.out,0.923076923077,1)');
  // The key a cue ends on and the next cue's copy of it are one key: either moves both.
  const split = splitCue(before, 0, 0.4, 0.04);
  assert.deepEqual(split.steps[1].layers['#box'].x[0].value, split.steps[0].layers['#box'].x.at(-1).value);
  for (const ref of [key(0, '#box', 'x', 0.4), key(1, '#box', 'x', 0)]) {
    const pair = moveKeys(split, [ref], -0.1);
    assert.deepEqual([pair.steps[0].layers['#box'].x.map(k => k.time), pair.steps[1].layers['#box'].x.map(k => k.time)], [[0, 0.3, 0.4], [0, 0.2]], JSON.stringify(ref));
  }
  // An Add Step cut is part of its flag: a key passes it and the curve is cut there anew.
  const across = moveKeys(split, [key(1, '#box', 'x', 0.2)], 0.3);
  playsOnRuler(before, across, { '#box x': u => u <= 0.9 ? -900 + 900 * easeCurve('power2.out')(u / 0.9) : ruler(before, '#box', 'x', u) }, 'past an Add Step cut');
});

test('a key move the runtime could not play exactly refuses, leaving the source as it was', () => {
  const at = (mutate, keys, delta, pattern) => { const data = fixture(); mutate(data); refuses(() => moveKeys(data, keys, delta), data, pattern); };
  // A key authored on a flag stays a key, and keys keep their order.
  at(d => { d.steps[0].layers['#title'].x.push({ time: 1.2, value: 0 }); }, [key(0, '#title', 'x', 0.8)], 0.8, /#title x would pass its key at 1.20 s/);
  at(() => {}, [key(0, '#box', 'opacity', 0.4)], 2.2, /#box opacity would pass its key at 2.40 s/);
  at(() => {}, [key(0, '#box', 'opacity', 0.4)], -0.5, /before In starts/);
  // One curve has no instant jump at a flag, before the move or after it.
  at(d => { d.steps[1].layers['#title'] = { x: [{ time: 0, value: 50 }, { time: 0.5, value: 0 }] }; }, [key(1, '#title', 'x', 0.5)], -0.2, /#title x changes at once at the flag of Step 2/);
  // The title's y starts In at 5 and goes on in Step 2: moved out of In, In would show its design value.
  at(d => { d.steps[0].layers['#title'].y = [{ time: 0.4, value: 5 }]; d.steps[1].layers['#title'] = { y: [{ time: 0.2, value: 5 }, { time: 0.5, value: 10 }] }; },
    [key(0, '#title', 'y', 0.4)], 0.9, /#title y would change at once at the flag of Step 2/);
  at(d => { d.steps[0].layers['#title'].x[1].ease = 'steps(4)'; }, [key(0, '#title', 'x', 0.8)], 0.8, /split #title x at the flag of Step 2.*steps\(4\)/);
  at(d => { d.steps[0].layers['#title'].x.push({ time: 1.5, value: 0 }); }, [key(0, '#title', 'x', 0.8)], 0.1, /#title x has keys after the end of its cue/);
  at(d => { d.steps[0].loops = { '#title': { x: { repeat: -1 } } }; }, [key(0, '#title', 'x', 0.8)], 0.1, /#title x loops/);
  at(() => {}, [key(0, '#title', 'x', 0.7)], 0.1, /no longer exists/);
});

// ---- Bars across flags ----

test('a bar body dragged across a Step flag moves its visibility and keys, and back is the source', () => {
  const before = fixture(), after = moveLayerSpan(before, 1, '#tag', -0.5);
  assert.deepEqual([after.steps[0].spans['#tag'], after.steps[1].spans['#tag'], after.steps[2].spans], [[{ start: 0.9, end: 1.2 }], [{ start: 0, end: 0.1 }], undefined]);
  playsOnRuler(before, after, { '#tag x': u => u < 0.9 ? -50 : u <= 1.3 ? -50 + 50 * easeCurve('power2.out')((u - 0.9) / 0.4) : 0 }, 'tag earlier');
  // The pieces either side of the flag are one bar: dragged from either, it moves back whole.
  for (const index of [0, 1]) assert.deepEqual(moveLayerSpan(after, index, '#tag', 0.5), before, `back from cue ${index}`);
  // A layer on screen throughout moves as a whole, and Out lengthens to keep its end.
  const box = moveLayerSpan(before, 0, '#box', 0.2);
  assert.deepEqual(box.steps.map(s => [s.duration, s.spans['#box']]), [[1.2, [{ start: 0.2, end: 1.2 }]], [1, [{ start: 0, end: 1 }]], [1.1, [{ start: 0, end: 1.1 }]]]);
  assert.deepEqual(box.steps[2].layers['#box'].x.map(k => k.time), [0.4, 1]);
});

test('a bar move the runtime could not play exactly refuses, leaving the source as it was', () => {
  const data = fixture();
  refuses(() => moveLayerSpan(data, 1, '#tag', -1.5), data, /#tag would move before In starts/);
  const shown = fixture(); shown.steps[0].spans['#tag'] = [{ start: 0.9, end: 1 }];
  refuses(() => moveLayerSpan(shown, 1, '#tag', -0.5), shown, /#tag would overlap its own visibility in In/);
  refuses(() => moveLayerSpan(data, 1, '#tag', 0.85), data, /#tag would appear only after the Out flag/);
  // On screen at the hold, it may go on into Out.
  assert.deepEqual(moveLayerSpan(data, 1, '#tag', 0.7).steps.slice(1).map(s => s.spans['#tag']), [[{ start: 0.9, end: 1 }], [{ start: 0, end: 0.3 }]]);
  const hiding = fixture(); hiding.steps[1].hides = ['#badge']; delete hiding.steps[1].spans['#badge'];
  refuses(() => moveLayerSpan(hiding, 1, '#badge', 0.1), hiding, /legacy layer hides/);
});

test('a legacy reveal follows the layer to the cue it now first appears in', () => {
  const data = fixture();
  data.steps.splice(2, 0, { name: 'Step 3', duration: 0.5, ease: 'none', layers: {} });
  data.steps[1].reveals = ['#tag'];
  const later = moveLayerSpan(data, 1, '#tag', 0.9);
  assert.deepEqual([later.steps[1].reveals, later.steps[2].reveals, later.steps[2].spans['#tag']], [undefined, ['#tag'], [{ start: 0.1, end: 0.5 }]]);
  // Into In only inside the root, whose hide clears it at the end of Out.
  const inside = (ancestor, selector) => ancestor === '.fixture' && selector === '#tag';
  assert.equal(moveLayerSpan(data, 1, '#tag', -0.5, inside).steps[1].reveals, undefined);
  refuses(() => moveLayerSpan(data, 1, '#tag', -0.5), data, /#tag appears with Step 2 through older source outside the graphic's root/);
});

test('the key move operation writes one lossless region and refuses machines, calls and custom bodies', () => {
  const t = templateOf(fixture()), moved = animation.applyKeyMove(t, { kind: 'key.move', keys: [key(0, '#title', 'x', 0.8)], delta: 0.8 });
  assert.deepEqual(animData.parseAnimData(moved.js), moveKeys(fixture(), [key(0, '#title', 'x', 0.8)], 0.8));
  assert.ok(animData.losslessAnimData(moved.js));
  assert.equal(animation.applyKeyMove(t, { kind: 'key.move', keys: [key(0, '#title', 'x', 0.8)], delta: 0 }), t);
  const called = fixture(); called.steps[1].calls = [{ time: 0, call: 'startClock' }];
  assert.throws(() => animation.applyKeyMove(templateOf(called), { kind: 'key.move', keys: [key(0, '#title', 'x', 0.8)], delta: 0.1 }), /calls, measured motion, loops/);
  const custom = { ...t, js: t.js.replace('var noacgStepsPlayed = 0;', 'var noacgStepsPlayed = 0; window.customTail = true;') };
  assert.throws(() => animation.applyKeyMove(custom, { kind: 'key.move', keys: [key(1, '#box', 'rotation', 0.6)], delta: 0.6 }), /custom source/);
  // Out through the template: the playhead snaps and the region is lossless too.
  const out = applyOut(t, { kind: 'out.set', time: 1.52 });
  assert.equal(animData.parseAnimData(out.js).steps[2].carried, 0.28);
});
