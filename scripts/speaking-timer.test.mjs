// guards: src/templates/behaviours/speaking.ts, src/templates/scoreboards/debateFloor.ts, src/templates/importedDesign/behaviour.ts
//
// THE SPEAKING TIMER ON ARTWORK (svg-template-library TL6, Rules P1 to P6): compiled in Node.
//   * the built-in Debate Floor's engine emits the bytes it always did (its parts are now a
//     parameter, defaulting to the built-in board's own);
//   * the imported timer's table names each clock with the `speaking` kind and its side, its
//     holders carry the wire's `data-speaking`, its machine is the built-in's (groups `floor` and
//     `penalty`, events `switch`, `penalty`, `reset`) and its exit stops the clocks;
//   * the allowance follows the drawn clock, and a speaking timer beside a countdown is refused.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rolldown } from 'rolldown';
import { rawSuffix } from './rolldown-raw.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
async function load(rel) {
  const bundle = await rolldown({ input: path.join(root, rel), platform: 'neutral', plugins: [rawSuffix], logLevel: 'silent' });
  const { output } = await bundle.generate({ format: 'esm', codeSplitting: false });
  await bundle.close();
  return import(`data:text/javascript;base64,${Buffer.from(output[0].code, 'utf8').toString('base64')}`);
}

const { debateFloorRuntimeJs } = await load('src/templates/scoreboards/debateFloor.ts');
const { compileBinding } = await load('src/templates/importedDesign/behaviour.ts');
const { parseBehaviourData } = await load('src/blocks/behaviourData.ts');

/** The Debate Floor engine's bytes before TL6 (sha256 of `debateFloorRuntimeJs()` at d69fa42). */
const BUILT_IN_ENGINE = 'f9e93b11f504f6dbcd9448d947aa01fa7d46606f321c5127daf954fded3169be';

const artwork = [
  { field: 'f0', ftype: 'textfield', title: 'Debater A', value: 'Maya' },
  { field: 'f1', ftype: 'textfield', title: 'Time A', value: '03:00' },
  { field: 'f2', ftype: 'textfield', title: 'Time B', value: '03:00' },
];
const binding = { recipe: 'speaking', rows: ['A', 'B'], fields: { time: { A: 1, B: 2 } }, layers: { 'time.speaking': { A: 'c0', B: 'c1' }, penalty: 'c2' } };

test('the built-in Debate Floor engine is the one it always was', () => {
  assert.equal(createHash('sha256').update(debateFloorRuntimeJs()).digest('hex'), BUILT_IN_ENGINE);
});

test('the imported timer: speaking kinds, the wire holders, the built-in machine, the clocks stopped on the exit', () => {
  const bound = compileBinding(artwork, binding);
  const js = bound.js(artwork.length);
  const table = parseBehaviourData(js);
  assert.deepEqual(table.kinds.f1, { kind: 'speaking', side: 'a' });
  assert.deepEqual(table.kinds.f2, { kind: 'speaking', side: 'b' });
  // P1: the allowance follows the drawn clock; both holders carry the wire's attribute (P2, P3).
  const html = bound.html(artwork.length);
  assert.match(html, /<div id="f3" class="[^"]+" data-speaking="allowance">03:00<\/div>/);
  assert.match(html, /<div id="f4" class="[^"]+" data-speaking="penalty">10<\/div>/);
  // The engine drives these fields, and the update hook runs before the fit.
  assert.match(js, /document\.getElementById\(side === 'a' \? 'f1' : 'f2'\)/);
  assert.match(bound.preFitHook, /speakingClockUpdate\(noacgKey, fields\[noacgKey\]\)/);
  // P2: the built-in's groups, states and events, unchanged.
  const type = bound.type({ markup: '' });
  const groups = Object.fromEntries(type.machine.parallel.map((g) => [g.id, g.states.map((s) => s.id)]));
  assert.deepEqual(groups, { floor: ['speakerA', 'speakerB', 'armed'], penalty: ['clear', 'docked'] });
  assert.deepEqual(type.controls.map((c) => c.event), ['switch', 'penalty', 'reset']);
  // The exit stops the clocks: nobody holds the floor off air.
  const data = bound.steps({ steps: [{ name: 'In', duration: 0.5, calls: [], layers: {} }, { name: 'Out', duration: 0.5, calls: [], layers: {} }] });
  assert.deepEqual(data.steps[data.steps.length - 1].calls[0], { time: 0, call: 'holdClocks' });
});

test('an allowance drawn on the artwork is the one the wire reads, and no second holder is made', () => {
  const withAllowance = [...artwork, { field: 'f3', ftype: 'textfield', title: 'Speaking time', value: '04:00' }];
  const bound = compileBinding(withAllowance, { ...binding, fields: { ...binding.fields, allowance: 3 } });
  const html = bound.html(withAllowance.length);
  assert.doesNotMatch(html, /data-speaking="allowance"/);
  assert.match(bound.js(withAllowance.length), /document\.getElementById\('f3'\)/);
});
