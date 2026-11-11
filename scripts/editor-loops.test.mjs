// guards: src/blocks/animData.ts, src/blocks/animEdit.ts, src/blocks/animEval.ts, src/blocks/animLoopTiming.ts, src/blocks/animMachine.ts, src/blocks/animMigration.ts, src/templates/shared/animRuntime.ts, src/templates/shared/animLoopRuntime.ts, src/assets/gsap.min.js, e2e/fixtures/editor-loops.json
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

const [runtime, timing, dataModule, evaluator, machine, edit, migration] = await Promise.all([
  'src/templates/shared/animRuntime.ts', 'src/blocks/animLoopTiming.ts', 'src/blocks/animData.ts',
  'src/blocks/animEval.ts', 'src/blocks/animMachine.ts', 'src/blocks/animEdit.ts', 'src/blocks/animMigration.ts',
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

function graphic(data) {
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
  vm.runInContext(runtime.emitAnimRegion(data), w);
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
});

test('range-invalid keys refuse atomically, and resizing preserves or scales the range', () => {
  const data = authored(), original = runtime.emitAnimRegion(data);
  const incompatible = edit.setKeyframe(data, 0, '#box', 'x', 1.2, 110);
  assert.equal(runtime.writeAnimData(original, incompatible), null);
  const unrelated = edit.setKeyframe(data, 0, '#score', 'y', .6, 55);
  assert.ok(runtime.writeAnimData(original, unrelated));
  const preserved = edit.resizeStep(data, 0, 1.05, 'preserve');
  // The fixture also has a finite sibling key at 1.30, so the resize is already at its floor.
  assert.equal(preserved, null);
  const stretched = edit.resizeStep(data, 0, 2.6, 'stretch');
  assert.deepEqual(stretched.steps[0].loops['#box'].x, { repeat: -1, yoyo: true, repeatDelay: .5, range: [.2, 2.2], phase: .5 });
  assert.ok(runtime.writeAnimData(original, stretched));
});
