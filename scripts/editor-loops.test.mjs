// guards: src/blocks/animData.ts, src/blocks/animEdit.ts, src/blocks/animEval.ts, src/blocks/animLoopTiming.ts, src/blocks/animMachine.ts, src/blocks/animMigration.ts, src/blocks/editorLoops.ts, src/model/animLoopClock.ts, src/templates/shared/animRuntime.ts, src/templates/shared/animLoopRuntime.ts, src/templates/shared/base.ts, src/assets/gsap.min.js, e2e/fixtures/editor-loops.json
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { rolldown } from 'rolldown';
import { rawSuffix } from './rolldown-raw.mjs';

async function load(file) {
  const bundle = await rolldown({ input: file, platform: 'neutral', plugins: [rawSuffix], logLevel: 'silent' });
  const { output } = await bundle.generate({ format: 'esm', codeSplitting: false });
  await bundle.close();
  return import(`data:text/javascript;base64,${Buffer.from(output[0].code).toString('base64')}`);
}

const [runtime, timing, dataModule, evaluator, machine, edit, migration, loopEditor, scaffold] = await Promise.all([
  'src/templates/shared/animRuntime.ts', 'src/blocks/animLoopTiming.ts', 'src/blocks/animData.ts',
  'src/blocks/animEval.ts', 'src/blocks/animMachine.ts', 'src/blocks/animEdit.ts', 'src/blocks/animMigration.ts',
  'src/blocks/editorLoops.ts', 'src/templates/shared/base.ts',
].map(load));
const gsap = readFileSync(new URL('../src/assets/gsap.min.js', import.meta.url), 'utf8');
const baseline = () => JSON.parse(readFileSync(new URL('../e2e/fixtures/editor-loops.json', import.meta.url), 'utf8'));
const forever = { repeat: -1, yoyo: true, repeatDelay: .25, range: [.1, 1.1], phase: .25 };
const finite = { repeat: 1, repeatDelay: .25, range: [.1, 1.1], phase: .25 };
const addLoop = (data, loop, all = false) => {
  data.steps[0].loops = { '#box': { x: loop, ...(all ? { opacity: loop } : {}) } };
  return data;
};
const authored = (loop = forever) => addLoop(baseline(), loop, true);

function graphic(data, publicWrappers = false) {
  const stage = { opacity: 0, visibility: 'visible', display: 'block', parentElement: null };
  const layer = () => ({ x: 0, y: 0, opacity: 1, visibility: 'visible', display: 'block', parentElement: stage });
  const elements = { '.loop-fixture': stage, '#box': layer(), '#score': layer(), '#late': layer() };
  stage.contains = element => element.parentElement === stage;
  stage.querySelectorAll = () => Object.values(elements).slice(1);
  const document = {
    querySelectorAll: selector => selector === '*' ? Object.values(elements) : elements[selector] ? [elements[selector]] : [],
    querySelector: selector => elements[selector] ?? null,
    createElement: () => ({ style: {} }), createElementNS: () => ({ style: {} }), documentElement: { style: {} }, body: { style: {} },
    getElementById: id => elements['#' + id],
  };
  const w = vm.createContext({ document, getComputedStyle: e => ({ visibility: e.visibility, display: e.display, opacity: String(e.opacity) }),
    requestAnimationFrame: () => 0, cancelAnimationFrame: () => {} });
  w.window = w; w.self = w;
  vm.runInContext(gsap, w);
  const region = runtime.emitAnimRegion(data);
  vm.runInContext(publicWrappers ? scaffold.runtimeJs('Loop oracle', region) : region, w);
  return { w, elements, stage, box: elements['#box'], score: elements['#score'], late: elements['#late'] };
}

const near = (actual, expected, what) => assert.ok(Math.abs(actual - expected) < .002, `${what}: ${actual} expected ${expected}`);
const sample = (tl, time) => tl.pause().time(time, true);

// Observable samples are written out from the fixture's ranges. They include activation with phase,
// delays on each side, both sides of the yoyo turn, the second lap, and a backward seek.
const yoyoSamples = [
  [0, 20, .5], [.05, 20, .5], [.1, 35, .5], [.35, 60, .75], [.85, 100, 1], [1.1, 100, 1],
  [1.35, 85, 1], [1.6, 60, .75], [2.1, 20, .5], [2.35, 20, .5], [2.6, 35, .5],
];

test('the local clock samples unequal layer keys forward and backward at each document speed', () => {
  for (const speed of [.5, 1, 2]) {
    const data = authored();
    data.speed = speed;
    const g = graphic(data);
    const tl = g.w.buildInTimeline();
    for (const [t, x, opacity] of [...yoyoSamples, ...yoyoSamples.toReversed()]) {
      sample(tl, t / speed);
      near(g.box.x, x, 'runtime X at ' + t + ' speed ' + speed);
      near(g.box.opacity, opacity, 'runtime opacity at ' + t);
      near(evaluator.resolveValue(data, '#box', 'x', 0, t), x, 'sampler X');
      near(evaluator.resolveValue(data, '#box', 'opacity', 0, t), opacity, 'sampler opacity');
    }
  }
});

test('finite repeat delay, exact restart seam, extended cue and terminal hold', () => {
  const data = addLoop(baseline(), finite);
  const g = graphic(data);
  const tl = g.w.buildInTimeline();
  for (const [t, x] of [[.1, 35], [.85, 100], [1.1, 100], [1.1001, 20], [1.7, 70], [2.1, 100], [2.5, 100], [1.1, 100], [0, 20]]) {
    sample(tl, t); near(g.box.x, x, 'finite X at ' + t);
  }
  near(timing.authoredCueEnd(data.steps[0]), 2.1, 'derived end');
  near(tl.duration(), 2.1, 'emitted end');
  const probe = g.w.buildStepTimeline({ ...data.steps[0], duration: 0, layers: { '#box': data.steps[0].layers['#box'] } }).pause();
  probe.time(2.1, true);
  near(g.box.x, 100, 'fresh isolated seek to the finite endpoint');
  g.w.noacgSettleCue(tl);
  near(g.box.x, 100, 'settled terminal');
  near(evaluator.resolveValue(data, '#box', 'x', 1, 0), 100, 'terminal pose inherited by next cue');
});

test('Hold, Next, replay and repeatable settling retire the actual loop writer', () => {
  const g = graphic(authored());
  let inCue = g.w.buildInTimeline();
  sample(inCue, 1.35);
  near(g.score.y, 130, 'finite sibling reaches its end');
  near(g.box.x, 85, 'Hold moves');
  sample(inCue, 1.6);
  near(g.box.x, 60, 'Hold continues');
  sample(g.w.revealNextStep(), .4);
  sample(inCue, 2.1);
  near(g.box.x, 60, 'Next leaves old loop frozen');
  inCue = g.w.buildInTimeline();
  near(g.box.x, 20, 'replay returns to authored first frame');
  for (const at of [.35, 2.1, 0]) {
    sample(inCue, at);
    g.w.noacgSettleCue(inCue);
    near(g.box.x, 90, 'finite-end settle');
    near(inCue.time(), 1.3, 'finite end');
  }
  const [main] = g.w.noacgMachine.groups;
  for (let i = 0; i < 2; i++) {
    g.w.noacgSnap({ [main.id]: main.defaultPath[0] }, { timers: false });
    near(g.box.x, 90, 'snap settled pose');
  }
});

test('early and repeated Out use the live sample, hide unreached layers and finish', () => {
  for (const at of [.35, 1.6]) {
    const g = graphic(authored());
    const inCue = g.w.buildInTimeline();
    sample(inCue, at);
    const out = g.w.buildOutTimeline();
    near(g.box.x, 60, 'Out press X');
    near(g.box.opacity, .75, 'Out press opacity');
    assert.strictEqual(g.w.buildOutTimeline(), out);
    assert.equal(g.w.revealNextStep(), null);
    sample(out, .25);
    near(g.box.x, -20, 'Out midpoint');
    near(g.box.opacity, .375, 'Out midpoint opacity');
    sample(inCue, 1.35);
    near(g.box.x, -20, 'retired loop cannot overwrite Out');
    sample(out, .5);
    near(g.box.x, -100, 'Out endpoint');
    near(g.stage.opacity, 0, 'root hidden');
    near(g.late.opacity, 0, 'unreached reveal stays hidden');
    sample(g.w.buildInTimeline(), .35);
    near(g.box.x, 60, 'replay begins fresh');
  }
});

test('Out from a later cue preserves the held loop sample and the authored later exit keys', () => {
  const data = authored();
  const exit = data.steps[2].layers['#box'];
  exit.x.splice(1, 0, { time: .2, value: 30 });
  exit.opacity = [{ time: 0, value: 0 }];
  const g = graphic(data);
  sample(g.w.buildInTimeline(), .35);
  sample(g.w.revealNextStep(), .4);
  const out = g.w.buildOutTimeline();
  near(g.box.x, 60, 'Out begins at the inherited loop position');
  near(g.box.opacity, .75, 'one-key exit starts at the held opacity');
  sample(out, .1);
  near(g.box.x, 45, 'first authored exit segment starts at the live value');
  sample(out, .2);
  near(g.box.x, 30, 'the intermediate authored key keeps its time');
  near(g.box.opacity, .75, 'one-key exit holds before its endpoint');
  sample(out, .5);
  near(g.box.x, -100, 'the last authored key keeps its time');
  near(g.box.opacity, 0, 'the one-key exit completes');

  data.steps[1].layers['#box'] = { x: [{ time: 0, value: 15 }, { time: .4, value: 25 }] };
  // The later author deliberately lands on the same number as the departed loop.
  data.steps[1].layers['#box'].x[1].value = 60;
  const replacement = graphic(data);
  sample(replacement.w.buildInTimeline(), .35);
  sample(replacement.w.revealNextStep(), .4);
  near(replacement.box.x, 60, 'the later track happens to match the held sample');
  replacement.w.buildOutTimeline();
  near(replacement.box.x, 100, 'a later writer keeps the authored Out pose');
  near(replacement.box.opacity, .75, 'only the held loop channel follows the held pose');
});

test('completed finite loops keep their terminal Out pose and unstarted legacy loops do not claim it', () => {
  for (const useMachine of [false, true]) {
    const data = useMachine ? authoredMachine(authored()) : authored();
    const step = data.steps[1];
    step.duration = 1.1;
    step.layers['#box'] = { x: [{ time: 0, value: 20 }, { time: .5, value: 100 }] };
    step.loops = { '#box': { x: { repeat: 1, yoyo: true, range: [0, .5] } } };
    const g = graphic(data);
    sample(g.w.buildInTimeline(), .35);
    sample(g.w.revealNextStep(), 1.1);
    near(g.box.x, 20, 'the completed reverse pass holds the first key');
    const out = g.w.buildOutTimeline();
    near(g.box.x, 20, 'Out begins from the completed loop sample');
    sample(out, .25);
    near(g.box.x, -40, 'Out continues to its authored endpoint');
  }

  const legacy = authored();
  legacy.steps[0].loops['#box'].x = { repeat: -1, yoyo: true };
  const g = graphic(legacy);
  sample(g.w.buildInTimeline(), .05);
  near(g.box.x, 0, 'the legacy loop has not reached its delayed first key');
  sample(g.w.revealNextStep(), .4);
  g.w.buildOutTimeline();
  near(g.box.x, 100, 'unstarted legacy loop does not substitute its channel in Out');
});

test('backward seek before a delayed legacy loop restores the preceding writer', () => {
  for (const precedingLoop of [false, true]) {
    const data = addLoop(baseline(), { repeat: 0, range: [.2, 1] }, false);
    if (!precedingLoop) {
      data.steps[0].loops = { '#box': { opacity: { repeat: 0, range: [.4, .8] } } };
    }
    const step = data.steps[1];
    step.layers['#box'] = { x: [{ time: .2, value: 200 }, { time: .4, value: 300 }] };
    step.loops = { '#box': { x: { repeat: 1, yoyo: true } } };
    const g = graphic(data);
    sample(g.w.buildInTimeline(), 1.3);
    const next = g.w.revealNextStep();
    sample(next, .3);
    near(g.box.x, 250, 'the legacy loop has painted');
    assert.ok(g.w.noacgStillHoldsLoop(g.box, 'x'));
    sample(next, .05);
    near(g.box.x, 100, 'reverse seek restores the visible input before activation');
    assert.equal(g.w.noacgStillHoldsLoop(g.box, 'x'), precedingLoop);
  }
});

test('mixed upgraded cues include finite legacy repeats in their derived endpoint', () => {
  const data = authored({ repeat: 0, range: [.4, .8] });
  data.steps[0].loops['#box'].x = { repeat: 1, yoyo: true };
  near(evaluator.stepSeconds(data, 0), 1.3, 'untouched legacy metadata keeps its authored floor');
  near(evaluator.stepSeconds(data, 0, true), 1.8, 'upgraded cue includes the full legacy yoyo');
  data.steps[2].loops = { '#box': { x: { repeat: 4, yoyo: true } } };
  near(evaluator.stepSeconds(data, 2, true), .5, 'old Out data keeps the finite authored exit');
  near(evaluator.resolveValue(data, '#box', 'x', 1, 0, true), 20, 'later cue inherits the reverse endpoint');
  const g = graphic(data);
  const inCue = g.w.buildInTimeline();
  g.w.noacgSettleCue(inCue);
  near(inCue.time(), 1.8, 'runtime and editing ruler settle at the same time');
  near(g.box.x, 20, 'runtime and inherited pose settle at the same key');

  const upgraded = runtime.emitAnimRegion(data);
  delete data.steps[0].loops['#box'].opacity;
  assert.ok(runtime.hasLoopRuntime(runtime.writeOutData(upgraded, data)), 'removal leaves the exact capability');
});

test('unrelated keys use the visible cue starts and cannot land in the repeat-only tail', () => {
  const data = baseline(), step = data.steps[0];
  step.duration = 1;
  step.loops = { '#box': { x: { repeat: 2, range: [0, 1] } } };
  step.layers['#score'].y = [{ time: 0, value: 4 }, { time: .8, value: 4 }];
  data.steps[1].duration = 1;
  data.steps[1].layers['#score'] = { y: [{ time: .2, value: 4 }, { time: .8, value: 12 }] };
  const key = (cue, time) => ({ step: cue, selector: '#score', property: 'y', time });
  const original = JSON.stringify(data);
  assert.deepEqual(edit.rulerCueStarts(data), [0, 3, 4, 4.5]);
  assert.throws(() => edit.moveKeys(data, [key(0, .8)], .5), /extra time added by a finite loop/);
  assert.throws(() => edit.moveKeys(data, [key(1, .2)], -2.3), /across a flag extended by a finite loop/);
  assert.throws(() => edit.setKeyframe(data, 0, '#box', 'x', 1.5, 50), /extra time added by a finite loop/);
  assert.equal(JSON.stringify(data), original, 'refused writes preserve the full data');
  const moved = edit.moveKeys(data, [key(1, .8)], -.3);
  assert.deepEqual(moved.steps[1].layers['#score'].y.map(k => k.time), [.2, .5]);
  const held = structuredClone(data);
  held.steps[1].layers['#score'].y[1].value = 4;
  const across = edit.moveKeys(held, [key(1, .2)], -2.3);
  assert.deepEqual(across.steps[0].layers['#score'].y.map(k => k.time), [0, .8, .9]);
  const copied = edit.captureKeys(data, [key(0, .8), key(1, .8)]);
  assert.deepEqual(copied.map(k => k.offset), [0, 3]);
  const pasted = edit.pasteKeys(data, copied.slice(0, 1), 1, .5);
  assert.deepEqual(pasted.steps[1].layers['#score'].y.map(k => k.time), [.2, .5, .8]);
});

test('explicit hides and visibility spans keep ownership during loop Hold and backward seek', () => {
  const data = authored();
  data.steps[0].hides = ['#box'];
  const g = graphic(data);
  const cue = g.w.buildInTimeline();
  for (const [at, opacity] of [[1.29, 1], [1.3, 0], [1.6, 0], [.35, .75]]) {
    sample(cue, at);
    near(g.box.opacity, opacity, 'explicit hide at ' + at);
  }

  const spanData = authored();
  const step = spanData.steps[0];
  step.layers['#box'].autoAlpha = step.layers['#box'].opacity;
  delete step.layers['#box'].opacity;
  step.loops['#box'].autoAlpha = step.loops['#box'].opacity;
  delete step.loops['#box'].opacity;
  step.spans = { '#box': [{ start: 0, end: .7 }] };
  const span = graphic(spanData);
  const spanCue = span.w.buildInTimeline();
  for (const [at, visibility] of [[.35, 'visible'], [.75, 'hidden'], [1.6, 'hidden'], [.35, 'visible']]) {
    sample(spanCue, at);
    assert.equal(span.box.visibility, visibility, 'span at ' + at);
  }
});

test('a finite phase can start after the first waveform and consumes only the remaining passes', () => {
  const loop = { ...finite, repeat: 4, phase: 2 };
  const data = addLoop(baseline(), loop);
  assert.ok(dataModule.isAnimData(data));
  const g = graphic(data);
  const cue = g.w.buildInTimeline();
  sample(cue, .1);
  near(g.box.x, 85, 'starts three quarters into the second pass');
  near(cue.duration(), 4.1, 'finite budget subtracts the full phase');
  sample(cue, 4.1);
  near(g.box.x, 100, 'last pass still reaches the endpoint');
  sample(cue, .1);
  near(g.box.x, 85, 'backward seek finds the same activation phase');
});

test('changing the speed of a running loop preserves its phase, then advances at the new rate', () => {
  const g = graphic(authored());
  const cue = g.w.buildInTimeline();
  sample(cue, .35);
  const clock = cue.__noacgLoops[0].animation;
  clock.timeScale(2);
  near(g.box.x, 60, 'pose on scale change');
  near(clock.time(), .35, 'same clock position');
  sample(cue, .4);
  near(g.box.x, 70, 'the next .05 s advances .10 s');
});

test('slowing running loop children preserves the wall time of an explicit hide', () => {
  const data = authored();
  data.steps[0].hides = ['#box'];
  const g = graphic(data);
  g.w.gsap.updateRoot(0);
  const cue = g.w.buildInTimeline();
  const start = cue.startTime();
  const tick = elapsed => g.w.gsap.updateRoot(start + elapsed);
  tick(.35);
  near(g.box.opacity, .75, 'the original rate reaches the first interpolated sample');
  cue.__noacgLoops.forEach(({ animation }) => animation.timeScale(.5));
  near(g.box.opacity, .75, 'changing rate keeps the current opacity');
  tick(1.01);
  near(g.box.opacity, 1, 'the slow clock has reached its endpoint, but the hide is still pending');
  tick(1.29);
  near(g.box.opacity, 1, 'the last pre-hide sample stays visible');
  tick(1.31);
  near(g.box.opacity, 0, 'the cue hides at its authored wall time');
  tick(1.5);
  near(g.box.opacity, 0, 'the loop cannot show the layer again during Hold');
});

function authoredMachine(data, { styled = false, timer = false, outEdge = false } = {}) {
  data.machine = { groups: [{ id: 'main', initial: 'off', defaultPath: ['in', 'reveal', 'out'],
    states: ['off', 'in', 'reveal', 'out'].map(id => ({ id })),
    transitions: [
      { from: 'in', to: 'reveal', trigger: 'operator', event: 'reveal', ...(styled ? { style: 'fade', duration: .6, ease: 'none' } : {}) },
      ...(timer ? [{ from: 'in', to: 'reveal', trigger: 'timer', after: .2 }] : []),
      ...(outEdge ? [{ from: 'reveal', to: 'out', trigger: 'operator', event: 'leave' }] : []),
    ],
  }, { id: 'accent', initial: 'off',
    states: [{ id: 'off' }, { id: 'pulse', timeline: { name: 'Pulse', duration: 1, ease: 'none',
      layers: { '#score': { x: [{ time: 0, value: 0 }, { time: 1, value: 100 }] } },
      loops: { '#score': { x: { repeat: -1, yoyo: true, range: [0, 1] } } } } }],
    transitions: [{ from: 'off', to: 'pulse', trigger: 'operator', event: 'pulse' },
      { from: 'pulse', to: 'off', trigger: 'operator', event: 'quiet' }],
  }] };
  return data;
}

test('styled entry keeps the other group running and an authored edge into Out retires every group', () => {
  const g = graphic(authoredMachine(authored(), { styled: true, outEdge: true }));
  const inCue = g.w.buildInTimeline();
  sample(inCue, .35);
  const pulse = g.w.noacgDispatch('pulse');
  sample(pulse, .45);
  const styled = g.w.revealNextStep();
  styled.pause().progress(1, true);
  near(g.score.x, 45, 'styled swap restores the unrelated group live sample');
  sample(pulse, .65);
  near(g.score.x, 65, 'unrelated group keeps running');
  const live = g.box.x;
  const out = g.w.revealNextStep();
  near(g.box.x, live, 'Next-to-Out captures live sample');
  sample(pulse, .85);
  near(g.score.x, 65, 'Out retires the unrelated group');
  sample(out, .5);
  near(g.stage.opacity, 0, 'Next-to-Out finishes');
});

test('Out follows the last painted channel across overlapping parallel groups', () => {
  const first = authoredMachine(addLoop(baseline(), { repeat: 1, yoyo: true, range: [.2, 1] }));
  const mark = first.machine.groups[1].states[1].timeline;
  mark.layers = { '#box': { x: [{ time: 0, value: 55 }] } };
  delete mark.loops;
  assert.equal(machine.validateMachine(first).errors.length, 0);
  const loopLast = graphic(first);
  loopLast.w.gsap.updateRoot(0);
  const start = loopLast.w.buildInTimeline().startTime();
  const tick = at => loopLast.w.gsap.updateRoot(start + at);
  tick(.6);
  near(loopLast.box.x, 60, 'the main loop is already running');
  loopLast.w.noacgDispatch('pulse');
  near(loopLast.box.x, 55, 'the accent paints its ordinary key on entry');
  tick(.7);
  tick(1.81);
  near(loopLast.box.x, 20, 'the main loop paints last and completes');
  loopLast.w.buildOutTimeline();
  near(loopLast.box.x, 20, 'Out follows the loop that actually painted last');

  const second = authoredMachine(authored({ repeat: 0, range: [.1, 1.1] }));
  const reveal = second.steps[1], accent = second.machine.groups[1].states[1].timeline;
  reveal.duration = 1;
  reveal.layers['#box'] = { x: [{ time: 0, value: 20 }, { time: .5, value: 100 }] };
  reveal.loops = { '#box': { x: { repeat: 1, yoyo: true, range: [0, .5] } } };
  accent.duration = 2;
  accent.layers = { '#box': { x: [{ time: 0, value: 0 }, { time: 2, value: 55 }] } };
  delete accent.loops;
  assert.equal(machine.validateMachine(second).errors.length, 0);
  const ordinaryLast = graphic(second);
  ordinaryLast.w.gsap.updateRoot(0);
  const origin = ordinaryLast.w.buildInTimeline().startTime();
  const advance = at => ordinaryLast.w.gsap.updateRoot(origin + at);
  advance(.05);
  ordinaryLast.w.noacgDispatch('pulse');
  advance(.15);
  ordinaryLast.w.revealNextStep();
  advance(1.16);
  near(ordinaryLast.box.x, 20, 'the newer yoyo completes at its starting key');
  advance(2.1);
  near(ordinaryLast.box.x, 55, 'the older accent then paints its final ordinary key');
  ordinaryLast.w.buildOutTimeline();
  near(ordinaryLast.box.x, 100, 'the authored Out starts when the ordinary writer painted last');
});

test('a styled swap tolerates an unrelated group whose loop has already stopped', () => {
  const g = graphic(authoredMachine(authored(), { styled: true }));
  sample(g.w.buildInTimeline(), .35);
  sample(g.w.noacgDispatch('pulse'), .45);
  g.w.noacgDispatch('quiet');
  const styled = g.w.revealNextStep();
  styled.pause().progress(1, true);
  assert.equal(g.w.noacgMachineState().groups.accent, 'off');
  near(g.stage.opacity, 1, 'styled composition completes');
  near(g.late.opacity, 1, 'styled entry reaches the destination pose');
});

test('repeated styled Stop retains its exit when it interrupts a loop, and Play restarts', () => {
  const data = authoredMachine(authored());
  data.machine.groups[0].transitions.push({ from: 'reveal', to: 'out', trigger: 'lifecycle',
    event: 'stop', style: 'fade', duration: .6, ease: 'none' });
  const g = graphic(data);
  const entry = g.w.buildInTimeline();
  sample(entry, .35);
  const out = g.w.buildOutTimeline();
  near(g.box.x, 60, 'style starts at the live pose');
  sample(entry, 1.6);
  near(g.box.x, 60, 'styled Out retires the loop');
  sample(out, .1);
  assert.ok(g.w.buildOutTimeline() === out, 'repeat keeps the exit timeline');
  out.progress(1, true);
  near(g.stage.opacity, 0, 'styled exit finishes');
  assert.ok(g.w.buildOutTimeline() === out, 'same exit after completion until replay');
  near(g.w.buildInTimeline().time(), 0, 'replay builds a fresh entrance');
  near(g.box.x, 20, 'replay returns to the opening loop sample');
});

test('public one-cue re-entry restarts its loop and the shared event still reaches the parallel group', () => {
  const data = authoredMachine(authored());
  data.steps.length = 1;
  const [main] = data.machine.groups;
  main.defaultPath = ['in'];
  main.states = main.states.filter(state => state.id === 'off' || state.id === 'in');
  main.transitions = [{ from: 'in', to: 'in', trigger: 'operator', event: 'pulse' }];
  assert.deepEqual(machine.validateMachine(data).errors, []);
  const g = graphic(data, true);
  g.w.play();
  const first = g.w.noacgGroupTl.main;
  sample(first, .35);
  near(g.box.x, 60, 'first public Play');
  g.w.noacgDispatch('pulse');
  const again = g.w.noacgGroupTl.main, accent = g.w.noacgGroupTl.accent;
  assert.notStrictEqual(again, first);
  assert.equal(g.w.noacgMachineState().groups.main, 'in');
  assert.equal(g.w.noacgMachineState().groups.accent, 'pulse');
  assert.equal(g.w.noacgOutActive(), false);
  near(g.box.x, 20, 'self-edge starts the new loop at its opening value');
  sample(again, .35);
  near(g.box.x, 60, 're-entered main loop advances');
  sample(first, 1.35);
  near(g.box.x, 60, 'the retired entry cannot repaint');
  sample(accent, .45);
  near(g.score.x, 45, 'the same event starts the accent loop');
  g.w.stop();
  assert.equal(g.w.noacgMachineState().groups.main, 'off');
  assert.equal(g.w.noacgMachineState().groups.accent, 'off');
  g.w.noacgOutTimeline.progress(1, true);
  near(g.stage.opacity, 0, 'public Stop hides the one-cue graphic');
  g.w.play();
  sample(g.w.noacgGroupTl.main, .35);
  near(g.box.x, 60, 'Play after real Stop still restarts');
});

test('the public Stop keeps a styled Out advancing and Play retires it', () => {
  const data = authoredMachine(authored());
  const stop = { from: 'reveal', to: 'out', trigger: 'lifecycle', event: 'stop', style: 'fade', duration: .6, ease: 'none' };
  data.machine.groups[0].transitions.push(stop);
  const g = graphic(data, true);
  g.w.gsap.updateRoot(0);
  g.w.play();
  const entry = g.w.noacgGroupTl.main;
  g.w.gsap.updateRoot(entry.startTime() + .35);
  near(g.box.x, 60, 'public Play reaches a live loop sample');
  g.w.stop();
  const out = g.w.noacgStyledOut, start = out.startTime();
  const tick = at => g.w.gsap.updateRoot(start + at);
  near(g.box.x, 60, 'public Stop keeps the live opening pose');
  tick(.1);
  near(g.stage.opacity, 2 / 3, 'first styled sample');
  g.w.stop();
  assert.strictEqual(g.w.noacgStyledOut, out);
  near(g.stage.opacity, 2 / 3, 'second Stop is continuous');
  tick(.2);
  near(g.stage.opacity, 1 / 3, 'the original fade advances after repeated Stop');
  tick(.4);
  g.w.stop();
  assert.strictEqual(g.w.noacgStyledOut, out);
  near(out.duration(), .6, 'repeated Stop keeps both phases');
  tick(.6);
  near(g.stage.opacity, 0, 'the original exit finishes');
  g.w.play();
  assert.equal(g.w.noacgStyledOut, null);
  sample(g.w.noacgGroupTl.main, .35);
  near(g.box.x, 60, 'public Play restarts the loop');

  g.w.stop();
  const settling = g.w.noacgStyledOut;
  let callbacks = 0;
  settling.call(() => { callbacks++; }, null, .15);
  settling.progress(1, true);
  settling.progress(1, true);
  assert.equal(callbacks, 0);
  near(g.stage.opacity, 0, 'silent settlement reaches the off pose');
  g.w.noacgSnap(null, { timers: false });
  assert.equal(g.w.noacgStyledOut, null);

  const cutData = authoredMachine(authored());
  cutData.machine.groups[0].transitions.push({ ...stop, style: 'cut' });
  const cut = graphic(cutData, true);
  cut.w.play();
  cut.w.stop();
  const cutOut = cut.w.noacgStyledOut;
  cut.w.stop();
  assert.strictEqual(cut.w.noacgStyledOut, cutOut);
  assert.equal(cutOut.duration(), 0);
});

test('a loop state can arm a timer at the finite end and retire on advance', () => {
  const data = authoredMachine(authored(), { timer: true });
  assert.equal(machine.validateMachine(data).errors.length, 0);
  const g = graphic(data);
  const inCue = g.w.buildInTimeline().pause();
  inCue.time(1.29, false);
  assert.equal(g.w.noacgTimers.main, undefined);
  inCue.time(1.31, false);
  const timer = g.w.noacgTimers.main;
  near(timer.delay(), .2, 'timer delay starts at finite end');
  timer.totalTime(1, false);
  assert.equal(g.w.noacgMachineState().groups.main, 'reveal');
  const pose = g.box.x;
  sample(inCue, 2.1);
  near(g.box.x, pose, 'timer exits retiring loop');
});

test('a timer follows the live finite end at both supported rates with an indefinite sibling', () => {
  for (const [rate, end] of [[.5, 3.85], [2, 1.3]]) {
    const data = authoredMachine(addLoop(baseline(), finite), { timer: true });
    data.steps[0].loops['#box'].opacity = forever;
    assert.equal(machine.validateMachine(data).errors.length, 0);
    const g = graphic(data);
    g.w.gsap.updateRoot(0);
    const cue = g.w.buildInTimeline();
    const start = cue.startTime();
    const tick = at => g.w.gsap.updateRoot(start + at);
    tick(.35);
    const clock = cue.__noacgLoops[0].animation;
    assert.equal(clock.timeScale(rate), clock);
    assert.equal(clock.timeScale(), rate);
    near(g.box.x, 60, 'rate change holds the displayed sample');
    tick(end - .01);
    assert.equal(g.w.noacgTimers.main, undefined, 'no arm before the actual finite end');
    tick(end + .01);
    near(g.box.x, 100, 'finite loop has reached its terminal pose at the arm');
    near(g.w.noacgTimers.main.delay(), .2, 'authored timer delay is preserved');
    tick(end + .19);
    assert.equal(g.w.noacgMachineState().groups.main, 'in');
    tick(end + .22);
    assert.equal(g.w.noacgMachineState().groups.main, 'reveal');

    const parked = graphic(data);
    const parkedCue = parked.w.buildInTimeline();
    sample(parkedCue, .35);
    parkedCue.__noacgLoops[0].animation.timeScale(rate);
    parked.w.noacgSettleCue(parkedCue);
    near(parked.box.x, 100, 'suppressed settle reaches the same finite endpoint');
    assert.equal(parked.w.noacgTimers.main, undefined, 'settling never arms the timer');
  }
});

test('a retired entry cannot arm a timer after the same state is replayed', () => {
  const data = authoredMachine(authored());
  data.machine.groups[1].transitions.push({ from: 'pulse', to: 'off', trigger: 'timer', after: .2 });
  const g = graphic(data);
  g.w.buildInTimeline();
  const retired = g.w.noacgDispatch('pulse').pause();
  retired.time(.4, false);
  sample(g.w.buildOutTimeline(), .5);
  g.w.buildInTimeline();
  const fresh = g.w.noacgDispatch('pulse').pause();
  fresh.time(.41, false);
  retired.time(1.01, false);
  assert.equal(g.w.noacgTimers.accent, undefined, 'the old finite-end callback cannot arm the current state');
  fresh.time(1.01, false);
  const timer = g.w.noacgTimers.accent;
  near(timer.delay(), .2, 'the fresh cue arms at its own end');
  timer.totalTime(1, false);
  assert.equal(g.w.noacgMachineState().groups.accent, 'off');
});

test('a shared operator event stops processing groups after the main Out', () => {
  const data = authoredMachine(authored(), { outEdge: true });
  data.machine.groups[1].transitions[0].event = 'leave';
  const g = graphic(data);
  sample(g.w.buildInTimeline(), .35);
  sample(g.w.revealNextStep(), .4);
  const out = g.w.noacgDispatch('leave');
  assert.equal(g.w.noacgMachineState().groups.main, 'off');
  assert.equal(g.w.noacgMachineState().groups.accent, 'off', 'the same event does not restart the accent');
  sample(out, .5);
  near(g.stage.opacity, 0, 'the returned timeline is the main Out');
  near(g.score.x, 0, 'no accent loop starts after retirement');
});

test('known runtime upgrades preserve source, compose with E1 capabilities and keep unrelated legacy bytes', () => {
  assert.equal(createHash('sha256').update(runtime.ANIM_INTERPRETER_JS.replace(/\r\n/g, '\n')).digest('hex'),
    '141e1f264ab80a20acec26cc64e9563cf234d1dbc21ea278d9089a1b2a39035c');
  const legacy = '/* user before */\n' + runtime.emitAnimRegion(addLoop(baseline(), { repeat: -1, yoyo: true })) + '\n/* user after */';
  assert.equal(migration.prepareOutRuntime(legacy), legacy);
  const withPivot = runtime.withAnchorRuntime(runtime.withSvgGroupRuntime(legacy));
  const installed = runtime.writeOutData(withPivot, authored());
  assert.ok(installed.startsWith('/* user before */\n') && installed.endsWith('\n/* user after */'));
  assert.ok(runtime.hasLoopRuntime(installed) && runtime.hasAnchorRuntime(installed) && runtime.hasSvgGroupRuntime(installed));
  assert.equal(migration.prepareOutRuntime(installed), installed);
  assert.deepEqual(dataModule.losslessAnimData(installed), authored());
  const removed = runtime.writeAnimData(installed, baseline());
  assert.ok(runtime.hasLoopRuntime(removed) && runtime.hasSvgGroupRuntime(removed));
  const onlyLoops = runtime.writeOutData(legacy, authored());
  assert.ok(runtime.hasSvgGroupRuntime(runtime.withSvgGroupRuntime(runtime.writeAnimData(onlyLoops, baseline()))));
  const foreign = legacy.replace('function noacgRememberEntrance', '/* custom */\nfunction noacgRememberEntrance');
  assert.equal(runtime.writeOutData(foreign, authored()), null);
  assert.equal(migration.prepareOutRuntime(foreign), foreign);
  const withSpan = baseline();
  withSpan.steps[0].spans = { '#box': [{ start: 0, end: 1.3 }] };
  const custom = runtime.emitAnimRegion(withSpan).replace('/* == END ANIMATION == */',
    '// Custom source retained inside the region.\n/* == END ANIMATION == */');
  const changed = edit.setKeyframe(withSpan, 0, '#box', 'x', .6, 50);
  assert.equal(runtime.writeAnimData(custom, changed), dataModule.spliceAnimData(custom, changed));
  assert.equal(runtime.writeOutData(custom, authored()), null);
});

test('whole layer selects moving tracks and refuses unsupported tracks only when they move', () => {
  const cue = baseline().steps[0];
  const tracks = cue.layers['#box'];
  tracks.opacity = [{ time: 0, value: .5 }, { time: 1.3, value: .5 }];
  tracks.filter = [{ time: 0, value: 'blur(0px)' }, { time: 1.3, value: 'blur(0px)' }];
  assert.deepEqual(loopEditor.loopTracks(cue, '#box'), ['x']);
  const selection = loopEditor.loopSelection(cue, '#box');
  assert.deepEqual(selection.properties, ['x']);
  assert.deepEqual(selection.range, [.2, 1]);
  tracks.filter[1].value = 'blur(2px)';
  assert.equal(loopEditor.loopSelection(cue, '#box'), null);
  assert.deepEqual(loopEditor.loopSelection(cue, '#box', 'x').properties, ['x']);
});

test('range-invalid keys refuse atomically, and resizing preserves or scales the range', () => {
  const data = authored(), original = runtime.emitAnimRegion(data);
  const incompatible = edit.setKeyframe(data, 0, '#box', 'x', 1.2, 110);
  assert.equal(runtime.writeAnimData(original, incompatible), null);
  const flat = edit.setKeyframe(data, 0, '#box', 'x', 1, 20);
  assert.equal(runtime.writeAnimData(original, flat), null);
  assert.deepEqual(dataModule.losslessAnimData(original), data);
  const legacy = addLoop(baseline(), { repeat: -1, yoyo: true });
  const legacySource = runtime.emitAnimRegion(legacy);
  const legacyFlat = edit.setKeyframe(legacy, 0, '#box', 'x', 1, 20);
  assert.equal(runtime.writeAnimData(legacySource, legacyFlat), dataModule.spliceAnimData(legacySource, legacyFlat));
  const unrelated = edit.setKeyframe(data, 0, '#score', 'y', .6, 55);
  assert.ok(runtime.writeAnimData(original, unrelated));
  const preserved = edit.resizeStep(data, 0, 1.05, 'preserve');
  // The fixture also has a finite sibling key at 1.30, so the resize is already at its floor.
  assert.equal(preserved, null);
  const stretched = edit.resizeStep(data, 0, 2.6, 'stretch');
  assert.deepEqual(stretched.steps[0].loops['#box'].x, { repeat: -1, yoyo: true, repeatDelay: .5, range: [.2, 2.2], phase: .5 });
  assert.ok(runtime.writeAnimData(original, stretched));
});

test('new artwork uses derived cue starts and only representable stored spans', () => {
  const data = addLoop(baseline(), finite), original = structuredClone(data);
  const selector = '#new', spans = next => next.steps.map(step => step.spans[selector]);
  const reveal = [[], [{ start: .1, end: .4 }], [{ start: 0, end: .5 }]];
  assert.deepEqual(spans(edit.withPlacedLayer(data, selector, 2.2, true)), reveal);
  assert.deepEqual(spans(edit.withPlacedLayer(data, selector, .6, true)), [
    [{ start: .6, end: 1.3 }], [{ start: 0, end: .4 }], [{ start: 0, end: .5 }],
  ]);
  for (const at of [1.3, 1.6, 2.1]) {
    assert.throws(() => edit.withPlacedLayer(data, selector, at, true), /outside the loop's extra time/);
  }
  assert.deepEqual(data, original);
  assert.deepEqual(spans(edit.withPlacedLayer({ ...data, speed: 2 }, selector, 1.1, true)), reveal);
  assert.deepEqual(spans(edit.withPlacedLayer(baseline(), selector, 1.3, false)), [
    [{ start: 1.299, end: 1.3 }], [{ start: 0, end: .4 }], [{ start: 0, end: .5 }],
  ]);

  const legacy = addLoop(baseline(), { repeat: 2, repeatDelay: .25 });
  assert.deepEqual(spans(edit.withPlacedLayer(legacy, selector, 1.4, false)), reveal);
  assert.deepEqual(spans(edit.withPlacedLayer(legacy, selector, 3.2, true)), reveal);
  assert.throws(() => edit.withPlacedLayer(legacy, selector, 3.1, true), /outside the loop's extra time/);
});

test('ranged loop delays must survive millisecond serialization', () => {
  const data = addLoop(baseline(), forever);
  const { x } = data.steps[0].layers['#box'];
  assert.equal(timing.validAuthoredLoop({ ...forever, repeatDelay: 1e306 }, 1.3, x), false);
  assert.equal(timing.validAuthoredLoop({ ...forever, repeatDelay: Infinity }, 1.3, x), false);
  assert.equal(timing.validAuthoredLoop({ ...forever, repeatDelay: 10 }, 1.3, x), true);
  const valid = runtime.emitAnimRegion(data);
  assert.ok(dataModule.parseAnimData(valid));
  const overflow = valid.replace('"repeatDelay": 0.25', '"repeatDelay": 1e306');
  assert.notEqual(overflow, valid);
  assert.equal(dataModule.parseAnimData(overflow), null);
});
