// guards: src/blocks/behaviourKeys.ts, src/templates/importedDesign/shared.ts, src/templates/importedDesign/reimport.ts, src/blocks/behaviourData.ts, src/templates/behaviours/recipe.ts, src/templates/behaviours/clock.ts, src/templates/behaviours/countdown.ts, src/templates/behaviours/credits.ts, src/templates/importedDesign/svg.ts, src/templates/importedDesign/behaviourRuntime.ts
//
// KEYS ON A BEHAVIOUR GRAPHIC (#1982, docs/research/editor-behaviour-keys/README.md). The pure
// ownership rule: which owned sequences open to keys (K1, K2), what the recipe's paint table
// claims on the artwork (K4, K5), which channel a claim refuses (K4 to K6), and the proof an edit
// stayed inside the user's tracks (K7). Data is shaped as the wizard emits it on main (the
// four-team scoreboard, the quiz board, the credits fixtures). The DOM half, playback, save,
// reopen and packages are e2e/editor-fidelity-trim.spec.ts.
//
//   node --test scripts/behaviour-keys.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
const keys = await load('src/blocks/behaviourKeys.ts');
const { behaviourSequenceReason, recipeClaims, claimReason, requireUserTracksOnly, sequenceOwned, KNOWN_CALLS, CREDITS_CALLS,
  SEQUENCE_REFUSAL, CREDITS_REFUSAL, LOOK_REFUSAL, GEOMETRY_REFUSAL } = keys;
const source = (rel) => readFileSync(path.join(root, rel), 'utf8');

const k = (time, value) => ({ time, value });
const box = { '.imported-design-box': { opacity: [k(0, 0), k(0.8, 1)] } };
const repaint = { time: 0, call: 'noacgRepaint' };
/** The four-team scoreboard as the wizard emits it: two cues, a main walk and two parallel groups
 *  whose states only repaint. */
const score = () => ({
  version: 2, root: '.imported-design', speed: 1,
  steps: [
    { name: 'On air', duration: 0.8, ease: 'power2.out', calls: [repaint], layers: structuredClone(box) },
    { name: 'Out', duration: 0.45, ease: 'power2.in', layers: { '.imported-design-box': { opacity: [k(0, 1), k(0.45, 0)] } } },
  ],
  machine: { groups: [
    { id: 'main', initial: 'off', defaultPath: ['on-air', 'out'], states: [{ id: 'off' }, { id: 'on-air' }, { id: 'out' }], transitions: [] },
    { id: 'flag', initial: 'none', states: ['none', 'shown'].map(id => ({ id, timeline: { name: id, duration: 0.2, ease: 'out', calls: [repaint], layers: {} } })), transitions: [] },
  ], controls: [{ event: 'score1', adjust: { f2: 1 } }] },
});
const scoreTable = { version: 1, recipe: 'score', rows: { team: ['1', '2', '3', '4'] },
  fields: { team: { 1: 'f1', 2: 'f3', 3: 'f5', 4: 'f7' }, score: { 1: 'f2', 2: 'f4', 3: 'f6', 4: 'f8' } },
  paint: [{ look: 'team.flash', rows: 'team', when: { state: ['flag/shown'], facts: ['score:moved'] }, enter: 'pop' }, { look: 'final', when: { state: ['result/final'] } }] };
const quizTable = { version: 1, recipe: 'quiz', rows: { answer: ['A', 'B'] }, fields: { question: 'f0', answer: { A: 'f1', B: 'f2' }, selectedAnswer: 'f6' },
  paint: [{ look: 'answer.selected', rows: 'answer', when: { facts: ['selectedAnswer:picked'] }, default: 'row-highlight', anchor: 'answer' }, { look: 'locked', default: 'badge:Locked in' }] };
const stamp = (token) => `[data-noacg-role~=${JSON.stringify(token)}]`;

test('the calls the rule knows are the builders\' own names', () => {
  assert.match(source('src/templates/behaviours/recipe.ts'), /export const REPAINT_CALL = 'noacgRepaint';/);
  const engine = /const ENGINE_CALLS = \[([^\]]*)\]/.exec(source('src/templates/behaviours/clock.ts'))[1].match(/'(\w+)'/g).map(s => s.slice(1, -1));
  for (const call of engine) assert.ok(KNOWN_CALLS.includes(call), call);
  const svg = source('src/templates/importedDesign/svg.ts');
  for (const call of ['startClock', 'stopClock']) { assert.match(svg, new RegExp(`call: '${call}'`)); assert.ok(KNOWN_CALLS.includes(call)); }
  assert.match(source('src/templates/importedDesign/behaviourRuntime.ts'), /function noacgClockReset\(\)/);
  // Every call the countdown recipe keeps beside its repaint.
  const countdown = /\[('\w+'(?:, '\w+')*)\],\s*\);\s*\}\s*export const countdownRecipe/.exec(source('src/templates/behaviours/countdown.ts'))[1].match(/'(\w+)'/g).map(s => s.slice(1, -1));
  assert.deepEqual(countdown.sort(), ['noacgClockReset', 'pauseClock', 'resumeClock']);
  for (const call of countdown) assert.ok(KNOWN_CALLS.includes(call), call);
  assert.match(source('src/templates/behaviours/credits.ts'), /export const CREDITS_ROLL_CALL = 'noacgCreditsRoll';/);
  assert.match(svg, /call: 'stopCreditsRoll'/);
  assert.deepEqual([...CREDITS_CALLS], ['noacgCreditsRoll', 'stopCreditsRoll']);
});

test('K1, K2: an owned sequence opens only where every writer is a known recipe writer', () => {
  assert.equal(sequenceOwned({ ...score(), machine: undefined, steps: score().steps.map(s => ({ ...s, calls: undefined })) }), false);
  assert.equal(sequenceOwned(score()), true);
  assert.equal(behaviourSequenceReason(score(), scoreTable, true), null);
  // The countdown clock's lifecycle and the match clock's engine are known writers.
  const clock = score(); clock.steps[0].calls.push({ time: 0.8, call: 'startClock' }, { time: 0, call: 'startMatchClock' }); clock.steps[1].calls = [{ time: 0, call: 'stopClock' }];
  clock.machine.groups[1].states[0].timeline.calls.push({ time: 0, call: 'pauseClock' }); clock.machine.groups[1].states[1].timeline.calls.push({ time: 0, call: 'resumeClock' });
  assert.equal(behaviourSequenceReason(clock, scoreTable, true), null);
  // No runtime, no table, an unknown call: refused whole, as before.
  assert.equal(behaviourSequenceReason(score(), scoreTable, false), SEQUENCE_REFUSAL);
  assert.equal(behaviourSequenceReason(score(), null, true), SEQUENCE_REFUSAL);
  const catalog = score(); catalog.steps[0].calls.push({ time: 0, call: 'applySelection' });
  assert.equal(behaviourSequenceReason(catalog, scoreTable, true), SEQUENCE_REFUSAL);
  const hidden = score(); hidden.machine.groups[1].states[1].timeline.calls.push({ time: 0, call: 'paintSomething' });
  assert.equal(behaviourSequenceReason(hidden, scoreTable, true), SEQUENCE_REFUSAL);
  // Measured motion and loops, on a cue or a state.
  const dyn = score(); dyn.steps[0].dynamics = [{ build: 'roll', target: '#r' }];
  assert.equal(behaviourSequenceReason(dyn, scoreTable, true), SEQUENCE_REFUSAL);
  const loop = score(); loop.machine.groups[1].states[0].timeline.loops = { '#a': { opacity: { repeat: -1 } } };
  assert.equal(behaviourSequenceReason(loop, scoreTable, true), SEQUENCE_REFUSAL);
  // A machine state outside the walk that keys layers is motion the rule does not model (K3).
  const keyed = score(); keyed.machine.groups[1].states[1].timeline.layers = { '#f2': { x: [k(0, 0), k(0.2, 5)] } };
  assert.equal(behaviourSequenceReason(keyed, scoreTable, true), SEQUENCE_REFUSAL);
  // So would one on the walk itself, which the shape never carries.
  const walk = score(); walk.machine.groups[0].states[1].timeline = { name: 'x', duration: 1, ease: 'none', layers: { '#f2': { x: [k(0, 0)] } } };
  assert.equal(behaviourSequenceReason(walk, scoreTable, true), SEQUENCE_REFUSAL);
  // The credits roll keeps the whole sequence, with its own reason, table or not.
  const credits = score(); credits.steps[0].calls.unshift({ time: 0, call: 'noacgCreditsRoll' }); credits.steps[1].calls = [{ time: 0, call: 'stopCreditsRoll' }];
  assert.equal(behaviourSequenceReason(credits, { version: 1, recipe: 'credits', paint: [] }, true), CREDITS_REFUSAL);
  assert.equal(behaviourSequenceReason(credits, null, false), CREDITS_REFUSAL);
});

test('K4, K5: the paint table\'s claims', () => {
  assert.deepEqual(recipeClaims(scoreTable, () => true), [
    ...['1', '2', '3', '4'].map(key => ({ selector: stamp('team.flash/' + key), kind: 'look' })), { selector: stamp('final'), kind: 'look' }]);
  // A drawn quiz claims only its looks; an undrawn row's own look claims its anchor and its group.
  assert.deepEqual(recipeClaims(quizTable, () => true).map(c => c.kind), ['look', 'look', 'look']);
  const undrawn = recipeClaims(quizTable, token => token !== 'answer.selected/B');
  assert.deepEqual(undrawn.filter(c => c.kind === 'geometry').map(c => c.selector), [keys.ARTWORK]);
  // The artwork the runtime measures in is the one the claim names.
  assert.match(source('src/templates/importedDesign/shared.ts'), /export const PREFIX = 'imported-design';/);
  assert.match(source('src/templates/importedDesign/reimport.ts'), /svg\.\$\{PREFIX\}-art/);
  // A badge with no anchor is drawn on the artwork's own box, which no layer key moves.
  assert.equal(recipeClaims({ ...quizTable, paint: [quizTable.paint[1]] }, () => false).filter(c => c.kind === 'geometry').length, 0);
  const vote = { version: 1, recipe: 'vote', rows: { option: ['A'] }, fields: { votes: { A: 'f3' } },
    paint: [{ gauge: 'option.bar', rows: 'option', from: 'votes:share' }, { write: 'option.percent', rows: 'option', from: 'votes:percent' }] };
  assert.deepEqual(recipeClaims(vote, () => true), [{ selector: stamp('option.bar/A'), kind: 'geometry' }]);
  const standings = { version: 1, recipe: 'ranking', rows: { entry: ['1', '2'] }, fields: { name: { 1: 'f1', 2: 'f3' }, points: { 1: 'f2', 2: 'f4' } },
    paint: [{ place: 'entry', rows: 'entry', from: 'points:slot', anchor: 'name' }] };
  assert.deepEqual(recipeClaims(standings, () => true).map(c => c.selector), [stamp('entry/1'), stamp('name/1'), '[id="f1"]', stamp('entry/2'), stamp('name/2'), '[id="f3"]']);
});

test('K4 to K6: what each claim refuses', () => {
  const look = { selector: 'L', kind: 'look' }, geometry = { selector: 'G', kind: 'geometry' };
  assert.equal(claimReason([{ claim: look, relations: ['self'] }], 'opacity'), LOOK_REFUSAL);
  assert.equal(claimReason([{ claim: look, relations: ['self'] }], 'x'), LOOK_REFUSAL);
  // A layer inside a look, or holding one, is the user's.
  assert.equal(claimReason([{ claim: look, relations: ['contains', 'inside'] }], 'x'), null);
  for (const relation of ['self', 'inside', 'contains']) {
    for (const channel of ['x', 'y', 'xPercent', 'scale', 'scaleX', 'rotation', 'skewX', 'transform', 'filter', 'clipPath']) {
      assert.equal(claimReason([{ claim: geometry, relations: [relation] }], channel), GEOMETRY_REFUSAL, relation + ' ' + channel);
    }
    assert.equal(claimReason([{ claim: geometry, relations: [relation] }], 'opacity'), null);
    assert.equal(claimReason([{ claim: geometry, relations: [relation] }], 'autoAlpha'), null);
  }
  assert.equal(claimReason([{ claim: geometry, relations: ['none'] }, { claim: look, relations: ['none'] }], 'x'), null);
  assert.equal(claimReason([], 'rotation'), null);
});

test('K7: an edit may change only the user\'s tracks', () => {
  const free = (owner) => owner !== '#owned';
  const before = score();
  const keyed = structuredClone(before); keyed.steps[0].layers['#f2'] = { x: [k(0, 0), k(0.4, 20)] };
  requireUserTracksOnly(before, keyed, free);
  const owned = structuredClone(before); owned.steps[0].layers['#owned'] = { x: [k(0.4, 20)] };
  assert.throws(() => requireUserTracksOnly(before, owned, free), /would change what the behaviour owns/);
  // Out may lengthen for a key past its end; nothing else may change length.
  const longer = structuredClone(keyed); longer.steps[1].duration = 0.6; longer.steps[1].layers['#f2'] = { x: [k(0.6, 0)] };
  requireUserTracksOnly(before, longer, free);
  const shorter = structuredClone(before); shorter.steps[1].duration = 0.3;
  assert.throws(() => requireUserTracksOnly(before, shorter, free));
  const cue = structuredClone(before); cue.steps[0].duration = 1;
  assert.throws(() => requireUserTracksOnly(before, cue, free));
  for (const mutate of [
    (d) => { d.steps[0].calls = []; },
    (d) => { d.steps[0].spans = { '#f2': [{ start: 0, end: 0.4 }] }; },
    (d) => { d.steps[0].reveals = ['#f2']; },
    (d) => { d.steps[0].ease = 'none'; },
    (d) => { d.machine.controls = []; },
    (d) => { d.machine.groups[1].states[1].timeline.calls = []; },
    (d) => { d.steps.push({ name: 'Extra', duration: 1, ease: 'none', layers: {} }); },
    (d) => { d.speed = 2; },
  ]) {
    const after = structuredClone(keyed); mutate(after);
    assert.throws(() => requireUserTracksOnly(before, after, free), String(mutate));
  }
});
