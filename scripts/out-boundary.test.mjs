// guards: src/blocks/editorOut.ts, src/blocks/animEdit.ts, src/blocks/animEval.ts, src/blocks/animData.ts, src/templates/shared/easeRuntime.ts, src/templates/shared/animRuntime.ts, src/templates/shared/animRuntimeLegacy.ts, src/model/contentHash.ts, e2e/fixtures/interpreter-shared-ease-v1.js, e2e/fixtures/interpreter-whole-ease-v1.js, e2e/fixtures/out-text-and-box.json
//
// R1.2a.1 SET OUT ACROSS THE LAST IN KEY, THE MATHEMATICS (docs/research/editor-r1-2a-1/README.md).
// Moving Out to a boundary b inside the entrance keeps every key and visibility bar at its
// absolute time on the concatenated ruler: each crossed segment splits exactly at b
// (splitKeyframeSegment), the rest of the entrance moves into Out, and In then Out plays what it
// played before. Anything without an exact form refuses the whole move with the input untouched.
// What needs Chromium - the emitted interpreter playing it in the simulator and exported packages,
// and the editor's buttons, history and save - is in e2e/editor-ease.spec.ts and
// e2e/editor-out.spec.ts.
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

const { moveOutBoundary, applyOut } = await load('src/blocks/editorOut.ts');
const { resolveValue } = await load('src/blocks/animEval.ts');
const { parseAnimData } = await load('src/blocks/animData.ts');
const runtime = await load('src/templates/shared/animRuntime.ts'), { emitAnimRegion } = runtime;
const legacy = await load('src/templates/shared/animRuntimeLegacy.ts');
const { contentHash } = await load('src/model/contentHash.ts');

/** The text-and-box entrance the browser spec plays too: back, bounce, cubic-bezier and elastic
 *  keys running past the new Out, a box track that starts after it, and a title Out that begins
 *  where its entrance ends. */
const textAndBox = () => JSON.parse(readFileSync(path.join(root, 'e2e/fixtures/out-text-and-box.json'), 'utf8'));
const templateOf = (data, fps = 25) => ({ html: '<div class="fixture"><div id="box"></div><div id="title"></div></div>', css: '', fields: [], fps, js: emitAnimRegion(data) });

/** The value a layer shows at stored time u when every cue plays straight after the one before:
 *  the cue holding u (the later one at a shared boundary), sampled as the editor samples it. */
function at(data, selector, prop, u) {
  let start = 0;
  for (let i = 0; i < data.steps.length; i++) {
    const end = start + data.steps[i].duration;
    if (u < end || i === data.steps.length - 1) return resolveValue(data, selector, prop, i, u - start);
    start = end;
  }
}
const tracks = (...all) => [...new Set(all.flatMap(d => d.steps.flatMap(s => Object.entries(s.layers).flatMap(([sel, t]) => Object.keys(t).map(p => sel + '\n' + p)))))].map(k => k.split('\n'));
const total = data => data.steps.reduce((sum, s) => sum + s.duration, 0);

/** Every sampled value within one stored quantum on a dense absolute grid. */
function samePlayback(before, after, label) {
  const span = total(before);
  assert.ok(Math.abs(total(after) - span) < 1e-9, `${label}: the exit ends where it ended`);
  for (const [selector, prop] of tracks(before, after)) {
    for (let i = 0; i <= 3000; i++) {
      const u = span * i / 3000, a = at(before, selector, prop, u), b = at(after, selector, prop, u);
      assert.ok(a === b || Math.abs(a - b) <= 1e-3 + 1e-9, `${label}: ${selector} ${prop} at ${u}: ${a} vs ${b}`);
    }
  }
}

/** Span visibility as the interpreter shows it: a cue with intervals for the layer sets them (the
 *  arriving side at its end), one without keeps what the layer had, and the exit applies its
 *  intervals only to a layer visible when it starts (noacgBuildExit gates on the live style). */
function visibleAt(data, selector, u, cues = data.steps.length) {
  const show = (spans, t, d) => spans.some(s => t >= s.start && (t < s.end || t === d && s.end === d));
  let shown = true, start = 0;
  for (let i = 0; i < cues; i++) {
    const step = data.steps[i], exit = i === data.steps.length - 1, end = start + step.duration;
    const spans = step.spans?.[selector];
    if (spans && (!exit || shown)) shown = show(spans, Math.min(u, end) - start, step.duration);
    if (u < end || i === cues - 1) return shown;
    start = end;
  }
}
/** The on-air hold: the pre-Out cue settled at its end, before Out is pressed. */
const held = (data, selector) => visibleAt(data, selector, total(data) - data.steps.at(-1).duration, data.steps.length - 1);

/** A refusal throws with its reason and leaves the input exactly as it was. */
function refuses(data, b, pattern, contains) {
  const frozen = JSON.stringify(data);
  assert.throws(() => moveOutBoundary(data, b, contains), pattern);
  assert.equal(JSON.stringify(data), frozen);
}

test('Set Out across the last In key keeps every absolute value, both velocities at b and the untouched keys', () => {
  const before = textAndBox(), frozen = JSON.stringify(before);
  for (const b of [0.4, 0.6, 0.8, 1, 1.2, 1.44, 1.6, 1.8, 1.96]) {
    const after = moveOutBoundary(before, b);
    assert.equal(JSON.stringify(before), frozen, 'the input is not mutated');
    assert.equal(after.steps[0].duration, b);
    assert.equal(after.steps[1].duration, Math.round((1 + 2 - b) * 1000) / 1000, 'the exit keeps its absolute end');
    samePlayback(before, after, `Out at ${b}`);
    const h = 1e-4, slope = (d, s, p, x, y) => (at(d, s, p, y) - at(d, s, p, x)) / (y - x);
    for (const [selector, prop] of tracks(before)) for (const [x, y] of [[b - h, b], [b, b + h]]) {
      const v0 = slope(before, selector, prop, x, y), v1 = slope(after, selector, prop, x, y);
      assert.ok(Math.abs(v1 - v0) <= 0.02 + Math.abs(v0) * 1e-3, `Out at ${b}: ${selector} ${prop} velocity ${x}..${y} ${v0} vs ${v1}`);
    }
    for (const [selector, layer] of Object.entries(before.steps[0].layers)) for (const [prop, keys] of Object.entries(layer)) {
      const kept = after.steps[0].layers[selector][prop];
      // The entrance keeps every key up to b untouched, plus at most the one key at b.
      for (const key of keys.filter(k => k.time < b - 5e-4)) assert.deepEqual(kept.find(k => k.time === key.time), key, `${selector} ${prop} key ${key.time}`);
      assert.ok(kept.every(k => k.time <= b), `${selector} ${prop} ends by b`);
      if (!keys.some(k => k.time > b + 5e-4)) { assert.deepEqual(kept, keys, `${selector} ${prop} does not cross`); continue; }
      // A crossed track starts the exit from the value it holds at b, and every moved key says its ease.
      const exit = after.steps[1].layers[selector][prop];
      assert.deepEqual(exit[0], { time: 0, value: kept.at(-1).value });
      for (const key of exit.slice(1, 1 + keys.filter(k => k.time > b + 5e-4).length)) assert.equal(typeof key.ease, 'string', `${selector} ${prop} Out key ${key.time} has an explicit ease`);
    }
  }
});

test('the parts it writes: a split, a hold key, moved keys and an exit joined without a jump', () => {
  const after = moveOutBoundary(textAndBox(), 1.2), In = after.steps[0].layers, Out = after.steps[1].layers;
  // back.out(1.6) split at a third of its segment; the rest moves with its slice and explicit ease.
  assert.deepEqual(In['#box'].x.slice(-1), [{ time: 1.2, value: -11.852, ease: 'slice(back.out(1.6),0,0.333333333333)' }]);
  assert.deepEqual(Out['#box'].x, [{ time: 0, value: -11.852 }, { time: 0.8, value: 0, ease: 'slice(back.out(1.6),0.333333333333,1)' }]);
  // Out before the box scales: it holds its first value from the cue start, as the runtime does.
  assert.deepEqual(In['#box'].scaleX, [{ time: 1.2, value: 0.8 }]);
  assert.deepEqual(Out['#box'].scaleX, [{ time: 0, value: 0.8 }, { time: 0.2, value: 0.8, ease: 'power1.inOut' }, { time: 0.7, value: 1, ease: 'back.out(1.6)' }]);
  // The default ease of the In cue follows a moved key that relied on it.
  assert.equal(Out['#title'].scaleX[1].ease, 'slice(power1.inOut,0.571428571429,1)');
  assert.equal(Out['#box'].opacity, undefined, 'a track that ends before b stays in the entrance');
  // The title's own Out starts where its entrance ends, so the gap between them is flat.
  assert.deepEqual(Out['#title'].x, [{ time: 0, value: -24.609 }, { time: 0.4, value: 0, ease: 'slice(bounce.out,0.75,1)' }, { time: 0.8, value: 0 }, { time: 1.8, value: -900, ease: 'power2.in' }]);
  assert.deepEqual(Out['#title'].opacity.map(k => k.time), [0, 0.3, 0.8, 1.8]);
});

test('an exit key on the old boundary merges when it holds the same value, and a jump refuses', () => {
  const merge = textAndBox();
  merge.steps[1].layers['#title'].rotation = [{ time: 0, value: 0 }, { time: 1, value: 30, ease: 'power2.in' }];
  const after = moveOutBoundary(merge, 1.2);
  assert.deepEqual(after.steps[1].layers['#title'].rotation.map(k => [k.time, k.value, k.ease]),
    [[0, -0.195, undefined], [0.8, 0, 'slice(elastic.out(1, 0.7),0.6,1)'], [1.8, 30, 'power2.in']]);
  samePlayback(merge, after, 'merged');
  const jump = textAndBox();
  jump.steps[1].layers['#title'].x[0].value = 50;
  refuses(jump, 1.2, /#title x.*jump/);
  // Nothing crosses the title's x when Out stays after it, so its jump is Out's own, as today.
  assert.doesNotThrow(() => moveOutBoundary(jump, 1.7));
});

test('visibility bars keep their absolute times; a layer Out could not reveal refuses', () => {
  const cases = [
    ['full entrance, no Out bar', [{ start: 0, end: 2 }], undefined],
    ['leaves during the moved part', [{ start: 0.5, end: 1.5 }], undefined],
    ['ends exactly at b', [{ start: 0.2, end: 1.2 }], undefined],
    ['hidden before b, never after', [{ start: 0, end: 0.8 }], undefined],
    ['disjoint, visible at b', [{ start: 0, end: 1.4 }, { start: 1.6, end: 2 }], undefined],
    ['own Out bar', [{ start: 0, end: 2 }], [{ start: 0, end: 0.5 }]],
    ['cut at Out (a body move)', [{ start: 0, end: 2 }], []],
    ['hidden at the old hold, Out bar gated', [{ start: 0, end: 1.5 }], [{ start: 0, end: 1 }]],
  ];
  for (const [label, entrance, exit] of cases) {
    const before = textAndBox();
    before.steps[0].spans = { '#box': entrance };
    if (exit) before.steps[1].spans = { '#box': exit };
    const after = moveOutBoundary(before, 1.2);
    assert.ok(after.steps.every(s => Object.values(s.spans ?? {}).every(list => list.every(span => span.start >= 0 && span.end > span.start && span.end <= s.duration))), `${label}: valid intervals`);
    for (let i = 0; i <= 3000; i++) {
      const u = 3 * i / 3000 + 1e-7;
      assert.equal(visibleAt(after, '#box', u), visibleAt(before, '#box', u), `${label}: visibility at ${u}`);
    }
    // The hold shows the arriving side at b: what the entrance showed just before it.
    assert.equal(held(after, '#box'), visibleAt(before, '#box', 1.2 - 1e-7), `${label}: the hold`);
    samePlayback(before, after, label);
  }
  const joined = textAndBox();
  joined.steps[0].spans = { '#box': [{ start: 0, end: 1.4 }, { start: 1.6, end: 2 }] };
  assert.deepEqual(moveOutBoundary(joined, 1.2).steps[1].spans, { '#box': [{ start: 0, end: 0.2 }, { start: 0.4, end: 1.8 }] });
  for (const entrance of [[{ start: 1.2, end: 2 }], [{ start: 0, end: 1 }, { start: 1.5, end: 2 }]]) {
    const hidden = textAndBox();
    hidden.steps[0].spans = { '#box': entrance };
    refuses(hidden, 1.2, /#box.*reveal/);
  }
});

test('a layer with Out bars but none on the moved cue stays visible over the moved part', () => {
  const cases = [];
  // Bars only on Out, whatever the entrance does.
  const alone = textAndBox();
  alone.steps[1].spans = { '#box': [{ start: 0, end: 0.5 }] };
  cases.push(['Out bars only', alone, 1.2, [{ start: 0, end: 1.3 }]]);
  // Out bars from a trim and a moved cue without any. (Before R1.2a.2 this cue was a Next cue after
  // a trimmed In; nothing moves out of a Next cue now.)
  const trimmed = { version: 2, root: '.g', speed: 1, steps: [
    { name: 'In', duration: 2, ease: 'none', layers: { '#t': { x: [{ time: 0, value: 0 }, { time: 2, value: 100 }] } } },
    { name: 'Out', duration: 0, ease: 'none', spans: { '#t': [] }, layers: {} },
  ] };
  cases.push(['bars on an earlier cue', trimmed, 1.2, [{ start: 0, end: 0.8 }]]);
  for (const [label, before, b, bars] of cases) {
    const selector = Object.keys(before.steps.at(-1).spans)[0], after = moveOutBoundary(before, b);
    assert.deepEqual(after.steps.at(-1).spans[selector], bars, label);
    const span = total(before);
    for (let i = 0; i <= 3000; i++) {
      const u = span * i / 3000 + 1e-7;
      if (u < span) assert.equal(visibleAt(after, selector, u), visibleAt(before, selector, u), `${label}: visibility at ${u}`);
    }
    samePlayback(before, after, label);
  }
});

test('what moves into Out must not sit in a layer hidden there', () => {
  // GSAP hides a layer whose autoAlpha is 0, and Out skips hidden layers: its fade-in would stop.
  const faded = textAndBox();
  faded.steps[0].layers['#box'].autoAlpha = [{ time: 1.4, value: 0 }, { time: 2, value: 1 }];
  refuses(faded, 1.2, /#box.*autoAlpha/);
  // A group hidden at the new Out gates the layers inside it, even one its own bars keep visible.
  const nested = textAndBox();
  nested.steps[0].spans = { '#g': [{ start: 0, end: 1 }], '#box': [{ start: 0, end: 1.5 }] };
  const inside = (ancestor, selector) => ancestor === '#g' && selector === '#box';
  refuses(nested, 1.2, /#box sits inside #g/, inside);
  // Without a document there is nothing to say one layer sits inside another.
  assert.doesNotThrow(() => moveOutBoundary(nested, 1.2));
  // A layer hidden by its own bars at the new Out was never seen moving, so nothing is lost.
  nested.steps[0].spans['#box'] = [{ start: 0, end: 1 }];
  assert.doesNotThrow(() => moveOutBoundary(nested, 1.2, inside));
});

test('a graphic saved with the G01 interpreter upgrades once an exit can end on a slice', () => {
  const { ANIM_INTERPRETER_JS, writeAnimData, writeOutData } = runtime;
  const g01 = readFileSync(path.join(root, 'e2e/fixtures/interpreter-shared-ease-v1.js'), 'utf8').replace(/\r\n/g, '\n');
  assert.equal(contentHash(g01.trim()), legacy.ANIM_INTERPRETER_BEFORE_WHOLE_EASE_HASH, 'the fixture is the recorded body');
  // An interrupted exit plays a sliced last ease as its whole curve, at the one site that stretches it.
  assert.match(ANIM_INTERPRETER_JS, /ease = noacgWholeEase\(last\.ease \|\| step\.ease\)[\s\S]{0,400}tl\.to\(proxy, \{ value: last\.value[^}]+ease: noacgEaseOf\(ease\) \}/);
  assert.ok(!g01.includes('noacgWholeEase'));
  const current = emitAnimRegion(textAndBox()), saved = current.replace(ANIM_INTERPRETER_JS, () => g01);
  assert.notEqual(saved, current);
  const crossed = moveOutBoundary(textAndBox(), 1.2);
  for (const written of [writeAnimData(saved, crossed), writeOutData(saved, crossed)]) assert.ok(written.includes(ANIM_INTERPRETER_JS));
  assert.equal(writeOutData(saved.replace('var noacgStepsPlayed = 0;', 'var noacgStepsPlayed = 0; window.customTail = true;'), crossed), null, 'custom source still refuses');
});

test('a move with nothing after b behaves as before, and bars no longer refuse it', () => {
  const plain = () => ({ version: 2, root: '.g', speed: 1, steps: [
    { name: 'In', duration: 2, ease: 'none', layers: { '#a': { x: [{ time: 0, value: -900 }, { time: 1, value: 0 }] } } },
    { name: 'Out', duration: 1, ease: 'none', layers: { '#a': { x: [{ time: 0.5, value: 0 }, { time: 1, value: -900 }] } } },
  ] });
  // Earlier and later, the exit keys keep their absolute times as they always did.
  assert.deepEqual(moveOutBoundary(plain(), 1.5).steps.map(s => [s.duration, s.layers['#a'].x.map(k => k.time)]), [[1.5, [0, 1]], [1.5, [1, 1.5]]]);
  assert.deepEqual(moveOutBoundary(plain(), 2.3).steps.map(s => [s.duration, s.layers['#a'].x.map(k => k.time)]), [[2.3, [0, 1]], [0.7, [0.2, 0.7]]]);
  assert.throws(() => moveOutBoundary(plain(), 2.6), /Out key/);
  // An exit without keys or bars stays an instant cut.
  const empty = plain(); empty.steps[1] = { name: 'Out', duration: 0, ease: 'none', layers: {} };
  assert.deepEqual(moveOutBoundary(empty, 1.5).steps.map(s => s.duration), [1.5, 0]);
  // A bar across the new Out is clipped and carried, where it used to refuse the move.
  const bar = plain(); bar.steps[0].spans = { '#a': [{ start: 0, end: 2 }] };
  const moved = moveOutBoundary(bar, 1.5);
  assert.deepEqual([moved.steps[0].spans, moved.steps[1].spans], [{ '#a': [{ start: 0, end: 1.5 }] }, { '#a': [{ start: 0, end: 1.5 }] }]);
  samePlayback(bar, moved, 'bar only');
});

test('Set Out moves nothing out of a Next cue until Step/Next editing, and still moves within it', () => {
  // Out pressed before a Next cue would play what moved into Out from it (docs/research/editor-r1-2a-2).
  const before = textAndBox();
  before.steps.splice(1, 0, { name: 'Step 1', duration: 1, ease: 'none', layers: { '#box': {
    rotation: [{ time: 0, value: 0 }, { time: 0.8, value: 90, ease: 'bounce.out' }],
  } } });
  refuses(before, 0.5, /#box rotation out of the Next cue "Step 1"/);
  refuses(before, 0.79, /Next cue/);
  // A bar edge after the boundary is Next-cue behaviour too; a bar running to the cue's end is not.
  const edge = structuredClone(before); edge.steps[1].layers = {}; edge.steps[1].spans = { '#title': [{ start: 0.2, end: 0.7 }] };
  refuses(edge, 0.5, /#title out of the Next cue/);
  edge.steps[1].spans = { '#title': [{ start: 0.6, end: 1 }] };
  refuses(edge, 0.5, /#title out of the Next cue/);
  // Nothing after the boundary: only the cue's still air shortens, and In then Out plays as before.
  for (const b of [0.8, 0.9]) {
    const after = moveOutBoundary(before, b);
    assert.deepEqual(after.steps.slice(0, 2).map(s => s.layers), before.steps.slice(0, 2).map(s => s.layers));
    assert.deepEqual([after.steps[1].duration, after.steps[2].duration], [b, Math.round((1 + 1 - b) * 1000) / 1000]);
    samePlayback(before, after, `Next cue at ${b}`);
  }
  const running = structuredClone(before); running.steps[1].spans = { '#title': [{ start: 0.2, end: 1 }] };
  assert.doesNotThrow(() => moveOutBoundary(running, 0.9));
  // A legacy hide at the cue's end would move to the new boundary.
  const hiding = structuredClone(before); hiding.steps[1].hides = ['#title'];
  refuses(hiding, 0.9, /#title out of the Next cue/);
});

test('every refusal leaves the input untouched and names what could not be kept', () => {
  const refuse = (mutate, b, pattern) => { const data = textAndBox(); mutate(data); refuses(data, b, pattern); };
  const box = d => d.steps[0].layers['#box'];
  refuse(d => { box(d).x[2].ease = 'steps(4)'; }, 1.2, /#box x.*steps\(4\)/);
  refuse(d => { box(d).x[2].ease = 'customEase'; }, 1.2, /#box x.*customEase/);
  refuse(d => { box(d).opacity = [{ time: 0, value: 0 }, { time: 2, value: 1, ease: 'back.out(1.6)' }]; }, 1.2, /#box opacity.*range/);
  refuse(d => { box(d).x[2].ease = 'back.in(1.5)'; }, 1.52, /#box x.*same value/);
  refuse(d => { d.steps[0].layers = { '#box': { x: [{ time: 0, value: 0 }, { time: 1, value: 100, ease: 'back.out(1.6)' }] } }; d.steps[0].duration = 1; }, 0.36, /#box x.*saved precision/);
  // The runtime plays keys stored past a cue's end beyond it, so a boundary cannot split that cue.
  refuse(d => { box(d).x.push({ time: 2.5, value: 50 }); }, 1.2, /#box x.*after the end of its cue/);
  refuse(d => { box(d).x.push({ time: 2.5, value: 50 }); }, 2.2, /#box x.*after the end of its cue/);
  refuse(d => { box(d).filter = [{ time: 0, value: 'blur(8px)' }, { time: 2, value: 'blur(0px)' }]; }, 1.2, /#box filter.*numeric/);
  refuse(d => { d.steps[0].hides = ['#box']; }, 1.2, /#box.*hide/);
  // A Next cue's reveal outside the root, which R1.2a.1 refused on its own, no longer crosses at all.
  const revealed = textAndBox();
  revealed.steps.splice(1, 0, { name: 'Step 1', duration: 1, ease: 'none', reveals: ['#box'], layers: { '#box': { rotation: [{ time: 0, value: 0 }, { time: 1, value: 90 }] } } });
  refuses(revealed, 0.5, /#box rotation out of the Next cue/);
  refuses(revealed, 0.5, /#box rotation out of the Next cue/, ancestor => ancestor === '.fixture');
  refuse(() => {}, Number.NaN, /finite/);
  // The template writer: source is kept byte for byte, and the reason is the same.
  const stepped = textAndBox(); stepped.steps[0].layers['#title'].x[1].ease = 'steps(4)';
  const source = templateOf(stepped), frozen = JSON.stringify(source);
  assert.throws(() => applyOut(source, { kind: 'out.set', time: 1.2 }), /#title x.*steps\(4\)/);
  assert.equal(JSON.stringify(source), frozen);
});

test('applyOut snaps the playhead through speed and writes one lossless region', () => {
  const data = textAndBox(); data.speed = 2;
  // 0.3 effective seconds is frame 9 at 30 fps; at speed 2 that is 0.6 stored seconds.
  const written = parseAnimData(applyOut(templateOf(data, 30), { kind: 'out.set', time: 0.3 + 1 / 90 }).js);
  assert.deepEqual(written, moveOutBoundary(data, 0.6));
  // A one-step entrance gains its Out and crosses into it the same way.
  const single = textAndBox(); single.speed = 2; single.steps.pop();
  const one = parseAnimData(applyOut(templateOf(single, 30), { kind: 'out.set', time: 0.3 }).js);
  assert.deepEqual(one.steps.map(s => [s.name, s.duration]), [['In', 0.6], ['Out', 1.4]]);
  samePlayback({ ...single, steps: [...single.steps, { name: 'Out', duration: 0, ease: 'none', layers: {} }] }, one, 'one step');
});

test('Set Out across a Hold splits it into two held halves and plays as before', () => {
  const before = textAndBox();
  before.steps[0].layers['#box'].x[1].ease = 'hold';
  before.steps[0].layers['#title'].x[1].ease = 'jump';
  before.steps[0].layers['#box'].opacity[1].ease = 'hold';
  for (const b of [0.4, 0.8, 1, 1.2, 1.5]) samePlayback(before, moveOutBoundary(before, b), `Out at ${b}`);
  const after = moveOutBoundary(before, 0.5), In = after.steps[0].layers, Out = after.steps[1].layers;
  assert.deepEqual(In['#box'].x, [{ time: 0, value: -900 }, { time: 0.5, value: -900, ease: 'hold' }]);
  assert.deepEqual(Out['#box'].x.slice(0, 2), [{ time: 0, value: -900 }, { time: 0.3, value: -200, ease: 'hold' }]);
  assert.deepEqual(In['#title'].x, [{ time: 0, value: -900 }, { time: 0.5, value: 0, ease: 'jump' }]);
  assert.deepEqual(Out['#title'].x.slice(0, 2), [{ time: 0, value: 0 }, { time: 1.1, value: 0, ease: 'jump' }]);
  // Reversal writes the mirror: a held entrance leaves by jumping at once.
  const entrance = textAndBox(); entrance.steps.pop();
  entrance.steps[0].layers = { '#box': { x: [{ time: 0, value: -900 }, { time: 0.8, value: -200, ease: 'hold' }, { time: 2, value: 0, ease: 'power2.out' }] } };
  const reversed = parseAnimData(applyOut(templateOf(entrance), { kind: 'out.reverse' }).js);
  assert.deepEqual(reversed.steps[1].layers['#box'].x, [{ time: 0, value: 0 }, { time: 1.2, value: -200, ease: 'power2.in' }, { time: 2, value: -900, ease: 'jump' }]);
  for (let i = 0; i <= 2000; i++) {
    const u = 2 * i / 2000, out = resolveValue(reversed, '#box', 'x', 1, u), into = resolveValue(reversed, '#box', 'x', 0, 2 - u);
    assert.ok(Math.abs(out - into) < 1e-9, `Out at ${u} ${out} is In at ${2 - u} ${into}`);
  }
});

test('a graphic saved with the R1.2a.1 interpreter upgrades once to play a Hold', () => {
  const { ANIM_INTERPRETER_JS, writeAnimData, writeOutData, hasHoldRuntime, dataUsesHoldEase } = runtime;
  const before = readFileSync(path.join(root, 'e2e/fixtures/interpreter-whole-ease-v1.js'), 'utf8').replace(/\r\n/g, '\n');
  assert.equal(contentHash(before.trim()), legacy.ANIM_INTERPRETER_BEFORE_HOLD_HASH, 'the fixture is the recorded body');
  assert.ok(before.includes('function noacgWholeEase(') && !hasHoldRuntime(before) && hasHoldRuntime(ANIM_INTERPRETER_JS));
  const held = textAndBox(); held.steps[0].layers['#box'].x[1].ease = 'hold';
  assert.ok(dataUsesHoldEase(held) && !dataUsesHoldEase(textAndBox()));
  const current = emitAnimRegion(textAndBox()), saved = current.replace(ANIM_INTERPRETER_JS, () => before);
  assert.notEqual(saved, current);
  for (const written of [writeAnimData(saved, held), writeOutData(saved, held)]) assert.ok(written.includes(ANIM_INTERPRETER_JS));
  // Upgraded once: the current body splices the literal and keeps its bytes.
  const once = writeAnimData(saved, held);
  assert.equal(writeAnimData(once, held), once);
  assert.equal(writeOutData(saved.replace('var noacgStepsPlayed = 0;', 'var noacgStepsPlayed = 0; window.customTail = true;'), held), null, 'custom source still refuses');
});
