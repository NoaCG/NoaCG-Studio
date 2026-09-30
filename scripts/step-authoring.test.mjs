// guards: src/blocks/editorSteps.ts, src/blocks/animEdit.ts, src/blocks/editorOut.ts, src/blocks/animEval.ts, src/blocks/animData.ts, src/blocks/animMachine.ts, src/blocks/animMigration.ts, src/templates/shared/animRuntime.ts, src/templates/shared/animRuntimeLegacy.ts, src/templates/shared/easeRuntime.ts, src/model/spxDefinition.ts, src/model/contentHash.ts, src/assets/gsap.min.js, e2e/fixtures/steps-authoring.json, e2e/fixtures/interpreter-step-out-v1.js
//
// R1.2a.4 STEP AUTHORING (docs/research/editor-r1-2a-4/README.md). Add Step at the playhead, Delete
// and flag drags repartition cues without moving anything on the concatenated ruler: every key and
// visibility bar keeps its absolute time, crossed segments split exactly (splitKeyframeSegment),
// and whatever has no exact form refuses the whole operation with the input untouched. Add Step
// then Delete, and a drag and its reverse, give back the source byte for byte. The emitted
// interpreter holds a one-key or zero-time Out track at its live value when Out is pressed from an
// earlier step (owner decision 2026-09-30). What needs Chromium - five playout targets and the
// editor's own controls - is e2e/editor-steps.spec.ts.
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

const [steps, edit, runtime, legacy, { resolveValue }, { parseAnimData, serializeAnimData }, { deriveMachine, spxSteps }, { prepareOutRuntime }, { contentHash }, { easeCurve, parseEase }, { replaceDefinitionInHtml }] = await Promise.all([
  'src/blocks/editorSteps.ts', 'src/blocks/animEdit.ts', 'src/templates/shared/animRuntime.ts', 'src/templates/shared/animRuntimeLegacy.ts',
  'src/blocks/animEval.ts', 'src/blocks/animData.ts', 'src/blocks/animMachine.ts', 'src/blocks/animMigration.ts', 'src/model/contentHash.ts',
  'src/templates/shared/easeRuntime.ts', 'src/model/spxDefinition.ts'].map(load));
const { applyStep } = steps, { splitCue, joinCues, moveStepFlag } = edit;
const { emitAnimRegion, ANIM_INTERPRETER_JS, writeOutData } = runtime;
const GSAP = readFileSync(path.join(root, 'src/assets/gsap.min.js'), 'utf8');

/** In with an eased box, a title held flat then on a Hold, and a badge whose bar starts inside In;
 *  Step 2 with a tag whose bar starts at its flag; Out with a one-key track. Speed 1.25, 25 fps:
 *  a frame is 0.05 stored. */
const fixture = () => JSON.parse(readFileSync(path.join(root, 'e2e/fixtures/steps-authoring.json'), 'utf8'));
const FRAME = 0.05;
/** A template around the literal with the SPX definition a saved graphic carries. */
const templateOf = (data, fps = 25) => {
  const settings = { description: 'Steps', steps: String(spxSteps(data)) };
  return { html: replaceDefinitionInHtml('<!doctype html><html><head></head><body><div class="fixture"><div id="box"></div><div id="title"></div><div id="badge"></div><div id="tag"></div></div></body></html>', settings, []),
    css: '', fields: [], fps, settings, js: emitAnimRegion(data) };
};
/** The canonical source text of a literal: what the writer would store. */
const text = data => serializeAnimData(data);
/** Layers inside the fixture's root, for the checks that need the document. */
const inRoot = (ancestor, selector) => ancestor === '.fixture' && selector !== '#outside';
const clone = value => JSON.parse(JSON.stringify(value));
const round = n => Math.round(n * 1000) / 1000;

// ---- The ruler, as the editor samples it ----

/** Cue starts on the stored ruler (speed cancels: every cue shares it). */
const startsOf = data => data.steps.reduce((acc, s, i) => [...acc, round(acc[i] + s.duration)], [0]);
/** A layer's visibility as the interpreter shows it at local time t of cue c: a cue with bars for it
 *  sets them (the arriving side at its end), a legacy reveal shows it from its cue and pre-hides it
 *  before, a legacy hide takes it off at its cue's end, and a cue without either keeps what it had. */
function shown(data, selector, c, t) {
  const show = (spans, time, d) => spans.some(s => time >= s.start && (time < s.end || time === d && s.end === d));
  let visible = !data.steps.slice(1, -1).some(s => s.reveals?.includes(selector));
  for (let i = 0; i <= c; i++) {
    const step = data.steps[i], local = i === c ? t : step.duration;
    if (step.reveals?.includes(selector)) visible = true;
    if (step.spans?.[selector]) visible = show(step.spans[selector], local, step.duration);
    else if (step.hides?.includes(selector) && local >= step.duration) visible = false;
  }
  return visible;
}
const selectorsOf = (...all) => [...new Set(all.flatMap(d => d.steps.flatMap(s => [...Object.keys(s.layers), ...Object.keys(s.spans ?? {}), ...(s.reveals ?? []), ...(s.hides ?? [])])))];
const tracksOf = (...all) => [...new Set(all.flatMap(d => d.steps.flatMap(s => Object.entries(s.layers).flatMap(([sel, t]) => Object.keys(t).map(p => sel + '\n' + p)))))].map(k => k.split('\n'));
/** Every sample key of a graphic on the given stored points: 'a' the arriving side (a cue's end at
 *  its flag, else the left limit) and 'd' the departing side (a cue's start at its flag, else the
 *  value there), before Out. */
function ruler(data, points) {
  const starts = startsOf(data), last = data.steps.length - 1, samples = {};
  const value = (sel, prop, c, t) => resolveValue(data, sel, prop, c, t);
  for (const u of points) {
    const flag = starts.findIndex((s, i) => i > 0 && i <= last && Math.abs(s - u) < 1e-9);
    const sides = flag > 0 ? [['a', flag - 1, data.steps[flag - 1].duration], ...(flag < last ? [['d', flag, 0]] : [])]
      : (c => [['a', c, u - starts[c], true], ['d', c, u - starts[c]]])(starts.findIndex((s, i) => i < last && u >= s - 1e-9 && u < starts[i + 1]));
    for (const [side, c, t, left] of sides) {
      const key = u.toFixed(4) + ':' + side;
      samples[key] = Object.fromEntries([
        ...tracksOf(data).map(([s, p]) => [s + ' ' + p, value(s, p, c, t)]),
        ...selectorsOf(data).map(s => [s + ' shown', shown(data, s, c, left ? Math.max(0, t - 1e-6) : t)]),
      ]);
    }
  }
  return samples;
}
/** The same playback on the concatenated ruler: every track's value within one stored quantum and
 *  every layer's visibility, on both sides of both graphics' flags and a dense grid. */
function samePlayback(before, after, label) {
  const end = startsOf(before).at(-2);
  assert.ok(Math.abs(startsOf(after).at(-2) - end) < 1e-9, `${label}: Out stays where it was`);
  const points = [...new Set([...Array.from({ length: Math.round(end / 0.01) + 1 }, (_, i) => round(i * 0.01)), ...startsOf(before).slice(1, -1), ...startsOf(after).slice(1, -1)])].sort((a, b) => a - b);
  const a = ruler(before, points), b = ruler(after, points);
  for (const key of Object.keys(a)) for (const [name, v] of Object.entries(a[key])) {
    const w = b[key]?.[name], NUMBER = /-?[\d.]+(?:e-?\d+)?/g, numbers = x => String(x).match(NUMBER)?.map(Number) ?? [];
    const ok = v === w || typeof v === 'number' && typeof w === 'number' && Math.abs(v - w) <= 1e-3 + 1e-9 ||
      typeof v === 'string' && typeof w === 'string' && v.replace(NUMBER, '#') === w.replace(NUMBER, '#') && numbers(v).every((n, i) => Math.abs(n - numbers(w)[i]) <= 1e-3);
    assert.ok(ok, `${label}: ${name} at ${key}: ${v} vs ${w}`);
  }
  assert.deepEqual(after.steps.at(-1), before.steps.at(-1), `${label}: Out is untouched`);
}
/** A refusal throws with its reason and leaves the input exactly as it was. */
function refuses(fn, input, pattern) {
  const frozen = JSON.stringify(input);
  assert.throws(fn, pattern);
  assert.equal(JSON.stringify(input), frozen, 'the input is untouched');
}
const addAt = (data, frame) => {
  const starts = startsOf(data), u = round(frame * FRAME), at = starts.findIndex((s, i) => i < data.steps.length - 1 && u > s && u < starts[i + 1]);
  return splitCue(data, at, round(u - starts[at]), FRAME);
};

// ---- Add Step ----

test('Add Step at every frame inside a cue plays as before on the ruler, and Delete gives back the source', () => {
  const data = fixture(), frozen = JSON.stringify(data), source = text(data), refused = [];
  for (let frame = 1; frame < 36; frame++) {
    if (frame === 24) continue; // Step 2's own flag
    let added;
    try { added = addAt(data, frame); } catch (error) { refused.push([frame, error.message]); assert.equal(JSON.stringify(data), frozen); continue; }
    assert.equal(JSON.stringify(data), frozen, 'the input is not mutated');
    assert.equal(added.steps.length, data.steps.length + 1);
    samePlayback(data, added, `Add Step at frame ${frame}`);
    const at = startsOf(added).findIndex(s => Math.abs(s - round(frame * FRAME)) < 1e-9);
    assert.equal(text(joinCues(added, at - 1)), source, `Add Step at frame ${frame}, then Delete`);
  }
  // Every refusal names what could not be split; none of the positions the browser spec plays.
  for (const [frame, reason] of refused) assert.match(reason, /preserved/, `frame ${frame}`);
  assert.deepEqual(refused.map(([frame]) => frame).filter(f => [6, 10, 14, 18, 28].includes(f)), []);
});

test('the parts Add Step writes: on a key, on a bar edge, inside held and flat segments, before a first key', () => {
  const data = fixture();
  // Frame 10, stored 0.5: on the box's opacity key.
  const onKey = addAt(data, 10), [a, b] = onKey.steps;
  assert.deepEqual(onKey.steps.map(s => [s.name, s.duration, s.ease]), [['In', 0.5, 'none'], ['Step 2', 0.7, 'none'], ['Step 3', 0.6, 'none'], ['Out', 1, 'none']]);
  assert.deepEqual(a.layers['#box'].opacity, data.steps[0].layers['#box'].opacity, 'a track ending on the flag stays whole');
  assert.equal(b.layers['#box'].opacity, undefined);
  // The box's power2.out splits in two slices; the rest keeps its own ease text in the new cue.
  assert.deepEqual(a.layers['#box'].x, [{ time: 0, value: -900 }, { time: 0.5, value: -225, ease: 'slice(power2.out,0,0.5)' }]);
  assert.deepEqual(b.layers['#box'].x, [{ time: 0, value: -225 }, { time: 0.5, value: 0, ease: 'slice(power2.out,0.5,1)' }]);
  // Inside the title's Hold (0.4 to 1.2): the first part holds, so it stays out of In; the rest
  // holds on from the flag and jumps at its key.
  assert.deepEqual(a.layers['#title'].y, [{ time: 0, value: 20 }, { time: 0.4, value: 20 }]);
  assert.deepEqual(b.layers['#title'].y, [{ time: 0, value: 20 }, { time: 0.7, value: 0, ease: 'hold' }]);
  // Before the badge's first key: In holds its first value from the start, as the runtime does.
  assert.deepEqual(a.layers['#badge'].opacity, [{ time: 0.5, value: 0 }]);
  assert.deepEqual(b.layers['#badge'].opacity, [{ time: 0, value: 0 }, { time: 0.2, value: 0 }, { time: 0.5, value: 1 }]);
  assert.deepEqual([a.spans['#badge'], b.spans['#badge']], [[], [{ start: 0.2, end: 0.7 }]]);
  assert.deepEqual([a.spans['#tag'], b.spans['#tag']], [[], []]);
  // Frame 14, stored 0.7: on the badge's bar edge. Its bar starts the new cue.
  const edge = addAt(data, 14);
  assert.deepEqual([edge.steps[0].spans['#badge'], edge.steps[1].spans['#badge']], [[], [{ start: 0, end: 0.5 }]]);
  assert.deepEqual(edge.steps[0].layers['#badge'].y, [{ time: 0.7, value: 30 }]);
  // Frame 6, stored 0.3: inside the title's flat segment, which needs no key at the flag.
  const flat = addAt(data, 6);
  assert.deepEqual(flat.steps[0].layers['#title'].y, [{ time: 0, value: 20 }]);
  assert.deepEqual(flat.steps[1].layers['#title'].y, [{ time: 0, value: 20 }, { time: 0.1, value: 20 }, { time: 0.9, value: 0, ease: 'hold' }]);
  // Inside Step 2, default names renumber and a renamed step keeps its name.
  const named = clone(data); named.steps[1].name = 'Scores';
  const inner = addAt(named, 28);
  assert.deepEqual(inner.steps.map(s => s.name), ['In', 'Scores', 'Step 3', 'Out']);
  const twice = addAt(addAt(data, 28), 10);
  assert.deepEqual(twice.steps.map(s => s.name), ['In', 'Step 2', 'Step 3', 'Step 4', 'Out']);
});

test('Add Step refuses on a flag, within a frame of one, and where a split is not exact', () => {
  const data = fixture();
  refuses(() => splitCue(data, 0, 0, FRAME), data, /flag/);
  refuses(() => splitCue(data, 0, 1.2, FRAME), data, /flag/);
  refuses(() => splitCue(data, 0, 0.03, FRAME), data, /frame/);
  refuses(() => splitCue(data, 1, 0.58, FRAME), data, /frame/);
  const stepped = fixture(); stepped.steps[0].layers['#box'].x[1].ease = 'steps(4)';
  refuses(() => splitCue(stepped, 0, 0.5, FRAME), stepped, /#box x.*steps\(4\).*preserved/);
  const past = fixture(); past.steps[0].layers['#box'].x.push({ time: 1.5, value: 50 });
  refuses(() => splitCue(past, 0, 0.5, FRAME), past, /#box x.*after the end of its cue.*preserved/);
  const text = fixture(); text.steps[0].layers['#box'].filter = [{ time: 0, value: 'blur(4px)' }, { time: 1, value: 'blur(0px)' }];
  refuses(() => splitCue(text, 0, 0.5, FRAME), text, /#box filter.*numeric.*preserved/);
  // A string track the flag does not cut through moves without a split.
  const whole = fixture(); whole.steps[0].layers['#box'].filter = [{ time: 0, value: 'blur(4px)' }, { time: 0.5, value: 'blur(0px)' }, { time: 1, value: 'blur(2px)' }];
  samePlayback(whole, splitCue(whole, 0, 0.5, FRAME), 'a string track split on its key');
});

test('legacy reveals stay with the first part and legacy hides move to the second', () => {
  const data = fixture();
  data.steps.splice(1, 0, { name: 'Step 2', duration: 0.6, ease: 'none', reveals: ['#note'], hides: ['#title'], layers: { '#note': { opacity: [{ time: 0, value: 0 }, { time: 0.4, value: 1 }] } } });
  data.steps[2].name = 'Step 3';
  const added = splitCue(data, 1, 0.2, FRAME);
  assert.deepEqual([added.steps[1].reveals, added.steps[2].reveals], [['#note'], undefined]);
  assert.deepEqual([added.steps[1].hides, added.steps[2].hides], [undefined, ['#title']]);
  samePlayback(data, added, 'legacy reveal and hide');
  assert.equal(text(joinCues(added, 1)), text(data), 'and Delete gives them back');
});

// ---- Delete ----

test('Delete joins a Step into the cue before at its absolute times', () => {
  const data = fixture(), joined = joinCues(data, 0);
  assert.deepEqual(joined.steps.map(s => [s.name, s.duration]), [['In', 1.8], ['Out', 1]]);
  samePlayback(data, joined, 'Delete Step 2');
  // The tag appears where Step 2 began; its x starts there and holds backward, hidden.
  assert.deepEqual(joined.steps[0].spans['#tag'], [{ start: 1.2, end: 1.8 }]);
  assert.deepEqual(joined.steps[0].spans['#badge'], [{ start: 0.7, end: 1.8 }]);
  assert.deepEqual(joined.steps[0].layers['#tag'].x, [{ time: 1.2, value: -200 }, { time: 1.6, value: 0, ease: 'power2.out' }]);
  // The box's Step 2 motion starts at the old flag from the value In ended on.
  assert.deepEqual(joined.steps[0].layers['#box'].x.map(k => k.time), [0, 1, 1.2, 1.8]);
});

test('Delete next to a cue with another default ease writes explicit eases and plays the same', () => {
  const data = fixture(); data.steps[1].ease = 'power2.inOut';
  delete data.steps[1].layers['#tag'].x[1].ease;
  const joined = joinCues(data, 0);
  assert.equal(joined.steps[0].ease, 'none');
  assert.equal(joined.steps[0].layers['#tag'].x[1].ease, 'power2.inOut');
  assert.equal(joined.steps[0].layers['#box'].rotation[1].ease, 'power2.inOut');
  assert.equal(joined.steps[0].layers['#box'].x.at(-1).ease, 'power1.inOut', 'a key with its own ease keeps it');
  samePlayback(data, joined, 'another default ease');
});

test('Delete refuses a jump at the flag, a legacy hide before it, and keys past a cue end', () => {
  const jump = fixture(); jump.steps[1].layers['#box'].x[0].value = 40;
  refuses(() => joinCues(jump, 0), jump, /#box x.*jumps.*preserved/);
  // A layer hidden through the cue before may start from any value: nothing shows it.
  const hidden = fixture(); hidden.steps[1].layers['#tag'].x[0].value = -500;
  samePlayback(hidden, joinCues(hidden, 0), 'a hidden layer');
  // A layer on screen before the flag without keys there would take its Step value early.
  const early = fixture(); early.steps[1].layers['#title'] = { rotation: [{ time: 0, value: 10 }, { time: 0.6, value: 0 }] };
  refuses(() => joinCues(early, 0), early, /#title rotation.*jumps.*preserved/);
  const hide = fixture(); hide.steps[0].hides = ['#title'];
  refuses(() => joinCues(hide, 0), hide, /#title.*leaves.*preserved/);
  const past = fixture(); past.steps[1].layers['#box'].rotation.push({ time: 0.9, value: 120 });
  refuses(() => joinCues(past, 0), past, /#box rotation.*after the end of its cue.*preserved/);
});

test('Delete converts a legacy reveal to bars so the layer appears where its step began', () => {
  // In, Step 2, Step 3 revealing #note (legacy), then the fixture's Step 2 as Step 4.
  const data = fixture();
  data.steps.splice(1, 0, { name: 'Step 2', duration: 0.4, ease: 'none', layers: { '#box': { y: [{ time: 0, value: 0 }, { time: 0.4, value: 10 }] } } },
    { name: 'Step 3', duration: 0.6, ease: 'none', reveals: ['#note'], layers: { '#note': { opacity: [{ time: 0, value: 0 }, { time: 0.4, value: 1 }] } } });
  data.steps[3].name = 'Step 4';
  const joined = joinCues(data, 1);
  assert.deepEqual(joined.steps.map(s => s.spans?.['#note']), [[], [{ start: 0.4, end: 1 }], [{ start: 0, end: 0.6 }], [{ start: 0, end: 1 }]]);
  assert.deepEqual(joined.steps[1].reveals, ['#note'], 'the marker moves to the cue where its bar starts');
  samePlayback(data, joined, 'a legacy reveal joined into a Step');
  // Joined into In the marker has no cue to stay on: a layer inside the root is cleared by the
  // root's hide at the end of Out, so it goes; one the document cannot place inside the root refuses.
  const first = joinCues(joinCues(data, 1), 0, inRoot);
  assert.deepEqual(first.steps[0].spans['#note'], [{ start: 1.6, end: 2.2 }]);
  assert.equal(first.steps.some(s => s.reveals?.length), false);
  samePlayback(data, first, 'a legacy reveal joined into In');
  const into = joinCues(data, 1);
  refuses(() => joinCues(into, 0), into, /#note.*root.*preserved/);
  refuses(() => joinCues(into, 0, () => false), into, /#note.*root.*preserved/);
  const keyless = clone(data); delete keyless.steps[2].layers['#note'];
  refuses(() => joinCues(keyless, 1), keyless, /#note.*own keys.*preserved/);
});

// ---- Flag drags ----

test('a Step flag drag to any legal frame plays as before, and its reverse gives back the source', () => {
  const data = fixture(), source = text(data);
  for (let frame = 1; frame < 36; frame++) {
    const b = round(frame * FRAME);
    if (frame === 24) { assert.equal(moveStepFlag(data, 1, b, FRAME), data, 'no move, no change'); continue; }
    let moved;
    try { moved = moveStepFlag(data, 1, b, FRAME); } catch (error) { assert.match(error.message, /preserved/, `frame ${frame}`); continue; }
    samePlayback(data, moved, `Step 2 flag at frame ${frame}`);
    assert.deepEqual([moved.steps[1].name, moved.steps[1].ease], ['Step 2', 'none']);
    assert.equal(text(moveStepFlag(moved, 1, 1.2, FRAME)), source, `frame ${frame} and back`);
  }
});

test('flags stay ordered: onto or past a neighbour, or within a frame of one, refuses', () => {
  const data = addAt(fixture(), 10); // flags at 0.5 (Step 2) and 1.2 (Step 3), Out at 1.8
  for (const b of [0, -0.05, 0.03, 1.2, 1.18, 1.3, 1.8, 2]) refuses(() => moveStepFlag(data, 1, b, FRAME), data, /frame/);
  refuses(() => moveStepFlag(data, 0, 0.3, FRAME), data, /In/);
  refuses(() => moveStepFlag(data, 3, 1.5, FRAME), data, /Out/);
  samePlayback(data, moveStepFlag(data, 1, 1.15, FRAME), 'one frame before the next flag');
  samePlayback(data, moveStepFlag(data, 2, 0.05, FRAME), 'one frame after the flag before');
});

// ---- The template writer ----

test('applyStep snaps the playhead, keeps the step count and the SPX definition, and refuses atomically', () => {
  const data = fixture(), t = templateOf(data);
  // 0.4 s is frame 10; 0.41 snaps there too.
  const added = applyStep(t, { kind: 'step.add', time: 0.41 });
  assert.deepEqual(parseAnimData(added.js), addAt(data, 10));
  assert.equal(added.settings.steps, '3');
  assert.match(added.html, /"steps":\s*"3"/);
  const removed = applyStep(added, { kind: 'step.delete', step: 1 });
  assert.deepEqual([removed.js, removed.html, removed.settings], [t.js, t.html, t.settings]);
  const renamed = applyStep(added, { kind: 'step.rename', step: 1, name: '  Headline ' });
  assert.equal(parseAnimData(renamed.js).steps[1].name, 'Headline');
  assert.equal(renamed.html, added.html);
  assert.equal(applyStep(added, { kind: 'step.rename', step: 1, name: 'Step 2' }), added, 'an unchanged name changes nothing');
  const moved = applyStep(added, { kind: 'step.move', step: 1, time: 0.48 });
  assert.deepEqual(parseAnimData(moved.js).steps.map(s => s.duration), [0.6, 0.6, 0.6, 1]);
  for (const [operation, pattern] of [
    [{ kind: 'step.add', time: 0 }, /flag/], [{ kind: 'step.add', time: 0.96 }, /flag/], [{ kind: 'step.add', time: 1.44 }, /flag/],
    [{ kind: 'step.add', time: 1.6 }, /after Out/], [{ kind: 'step.add', time: Number.NaN }, /finite/],
    [{ kind: 'step.rename', step: 0, name: 'Start' }, /In and Out/], [{ kind: 'step.rename', step: 2, name: 'Stop' }, /In and Out/],
    [{ kind: 'step.rename', step: 1, name: '   ' }, /name/], [{ kind: 'step.rename', step: 1, name: 'x'.repeat(41) }, /40/],
    [{ kind: 'step.delete', step: 0 }, /In and Out/], [{ kind: 'step.delete', step: 2 }, /In and Out/], [{ kind: 'step.delete', step: 7 }, /no longer/],
    [{ kind: 'step.move', step: 1, time: 1.44 }, /frame/], [{ kind: 'step.move', step: 1, time: 0 }, /frame/],
  ]) refuses(() => applyStep(t, operation), t, pattern);
});

test('a legacy one-step graphic gains its Out first; machines, loops, calls, dynamics and custom bodies refuse', () => {
  const single = fixture(); single.steps = [single.steps[0]];
  const added = parseAnimData(applyStep(templateOf(single), { kind: 'step.add', time: 0.4 }).js);
  assert.deepEqual(added.steps.map(s => [s.name, s.duration]), [['In', 0.5], ['Step 2', 0.7], ['Out', 0]]);
  const machine = fixture(); machine.machine = deriveMachine(machine);
  refuses(() => applyStep(templateOf(machine), { kind: 'step.add', time: 0.4 }), machine, /state-machine/);
  const looped = fixture(); looped.steps[0].loops = { '#box': { x: { repeat: -1 } } };
  refuses(() => applyStep(templateOf(looped), { kind: 'step.delete', step: 1 }), looped, /loops/);
  const t = templateOf(fixture()), custom = { ...t, js: t.js.replace('var noacgStepsPlayed = 0;', 'var noacgStepsPlayed = 0; window.customTail = true;') };
  refuses(() => applyStep(custom, { kind: 'step.add', time: 0.4 }), custom, /custom/);
});

// ---- The one-key Out hold, in the emitted interpreter ----

/** The emitted region in a fresh vm context over a stub DOM (the harness of out-step.test.mjs). */
function graphic(js) {
  const stage = { opacity: 0, visibility: 'visible', display: 'block', parentElement: null };
  const layer = parent => ({ x: 0, y: 0, rotation: 0, opacity: 1, visibility: 'visible', display: 'block', parentElement: parent });
  const els = { '.fixture': stage, '#box': layer(stage), '#title': layer(stage), '#badge': layer(stage), '#tag': layer(stage) };
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
  const cue = tl => { if (tl) tl.pause(); return tl; };
  return { els, stage, play: () => cue(w.buildInTimeline()), next: () => cue(w.revealNextStep()), out: () => cue(w.buildOutTimeline()) };
}
/** Out after `nexts` Next cues (stopped at `at` of the last one when given): the badge's y at the
 *  exit's start, a third of the way, and its end. */
function badgeOut(js, data, nexts, at) {
  const g = graphic(js);
  let tl = g.play();
  for (let i = 0; i <= nexts; i++) {
    if (i > 0) tl = g.next();
    if (i === nexts && at !== undefined) tl.time(tl.duration() * at, true); else tl.progress(1, true);
  }
  const live = g.els['#badge'].y, exit = g.out(), end = data.steps.at(-1).duration / data.speed, seen = [];
  for (const t of [0, end / 3, end]) { exit.time(t, true); seen.push(g.els['#badge'].y); }
  return { live, seen };
}

test('a one-key Out track holds its live value from an earlier step and cuts at the last', () => {
  const data = fixture(), js = emitAnimRegion(data);
  // Parked on Step 2's flag the badge is on screen at y 0: an earlier step, so it holds until the end.
  const early = badgeOut(js, data, 0);
  assert.deepEqual(early.seen, [early.live, early.live, -40]);
  // Out during In of a graphic with a later Next cue is an earlier step too.
  const during = badgeOut(js, data, 0, 0.9);
  assert.deepEqual(during.seen, [during.live, during.live, -40]);
  // At the last step, and during its cue, the track cuts as Out starts, as before.
  assert.deepEqual(badgeOut(js, data, 1).seen, [-40, -40, -40]);
  assert.deepEqual(badgeOut(js, data, 1, 0.5).seen, [-40, -40, -40]);
  // A zero-time track (every key at one moment) holds the same way.
  const zero = fixture(); zero.steps.at(-1).layers['#badge'].y = [{ time: 0.2, value: -10 }, { time: 0.2, value: -40 }];
  const z = badgeOut(emitAnimRegion(zero), zero, 0);
  assert.deepEqual(z.seen, [z.live, z.live, -40]);
  // A machine graphic keeps its authored exit from every state.
  const machine = fixture(); machine.machine = deriveMachine(machine);
  assert.deepEqual(badgeOut(emitAnimRegion(machine), machine, 0).seen, [-40, -40, -40]);
});

test('a graphic saved with the R1.2a.3 interpreter upgrades once to hold a one-key Out track', () => {
  const before = readFileSync(path.join(root, 'e2e/fixtures/interpreter-step-out-v1.js'), 'utf8').replace(/\r\n/g, '\n');
  assert.equal(contentHash(before.trim()), legacy.ANIM_INTERPRETER_BEFORE_ONE_KEY_HOLD_HASH, 'the fixture is the recorded body');
  assert.ok(before.includes('if (!NOACG_ANIM.machine && noacgStepsPlayed > 0') && before.trim() !== ANIM_INTERPRETER_JS.trim());
  const data = fixture(), current = emitAnimRegion(data), saved = current.replace(ANIM_INTERPRETER_JS, () => before);
  assert.notEqual(saved, current);
  // The saved body is the reproduction: from an earlier step the one-key track cuts.
  assert.deepEqual(badgeOut(saved, data, 0).seen, [-40, -40, -40]);
  const upgraded = prepareOutRuntime(saved);
  assert.equal(upgraded, current, 'preview, save and export re-emit the known body');
  assert.equal(prepareOutRuntime(upgraded), upgraded, 'once');
  assert.equal(writeOutData(saved, data), current);
  assert.equal(writeOutData(saved.replace('var noacgStepsPlayed = 0;', 'var noacgStepsPlayed = 0; window.customTail = true;'), data), null, 'custom source still refuses');
  const early = badgeOut(upgraded, data, 0);
  assert.deepEqual(early.seen, [early.live, early.live, -40]);
});

// The shared ease grammar is what makes a rejoined slice exact; keep the dependency visible.
test('split slices rejoin into the curve they were cut from', () => {
  const curve = easeCurve('power2.out'), half = easeCurve('slice(power2.out,0,0.5)');
  assert.ok(Math.abs(half(1) - 1) < 1e-12 && Math.abs(curve(0.5) - 0.75) < 1e-12);
  assert.equal(parseEase('slice(power2.out,0.5,1)').base.text, 'power2.out');
});
