// guards: src/blocks/soundEdit.ts, src/assets/assetUtils.ts, src/blocks/editorImages.ts, src/components/editorFoundation/operations.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { rolldown } from 'rolldown';
import { rawSuffix } from './rolldown-raw.mjs';
async function load(input) {
  const build = await rolldown({ input, platform: 'neutral', plugins: [rawSuffix], logLevel: 'silent' });
  const { output } = await build.generate({ format: 'esm', codeSplitting: false }); await build.close();
  return import('data:text/javascript;base64,' + Buffer.from(output[0].code).toString('base64'));
}
const { applySound, soundTargets } = await load('src/blocks/soundEdit.ts');
const { emitAnimRegion } = await load('src/templates/shared/animRuntime.ts');
const { parseAnimData } = await load('src/blocks/animData.ts');
const { applyOperations } = await load('src/components/editorFoundation/operations.ts');
const step = name => ({ name, duration: .1, ease: 'none', layers: {} });
function fixture() {
  return { js: emitAnimRegion({ version: 2, root: '#box', speed: 1, steps: [step('In'), step('Reveal'), step('Out')],
    machine: { groups: [{ id: 'main', initial: 'off', defaultPath: ['question', 'answer', 'out'], states: [{ id: 'off' }, { id: 'question' }, { id: 'answer' }, { id: 'out' }, { id: 'running' }],
      transitions: [{ from: 'question', to: 'running', trigger: 'operator', event: 'start' }, { from: 'question', to: 'answer', trigger: 'operator', event: 'correct' }] }] } }),
    html: '<div id="box"></div>', css: '', fields: [], assets: [{ path: 'sounds/tick.wav', data: 'data:audio/wav;base64,AA==' }] };
}
const sound = { id: 'tick', asset: 'sounds/tick.wav', enabled: false, levelDb: -12, mode: 'one-shot' };
test('steps, pose-only states and accepted edges share one descriptor; an imported asset is one patch', () => {
  const template = fixture(), targets = soundTargets(template);
  const operation = { kind: 'sound.set', target: targets[0].key, sound };
  const patch = applyOperations(template, [operation]);
  assert.deepEqual(parseAnimData(patch.template.js).steps[0].sound, sound);
  assert.deepEqual(patch.diff.map(d => d.file), ['js']);
  assert.equal(parseAnimData(template.js).steps[0].sound, undefined);
  const state = targets.find(t => t.key.includes('"state"'));
  const loop = applySound(template, { ...operation, target: state.key, sound: { ...sound, mode: 'loop' } });
  const timeline = parseAnimData(loop.js).machine.groups[0].states.find(s => s.id === 'running').timeline;
  assert.equal(timeline.duration, 0); assert.equal(timeline.sound.mode, 'loop');
  const edge = soundTargets(loop).find(t => t.key.includes('"edge"') && t.key.includes('"running"'));
  assert.match(edge.reason, /loop/);
  assert.throws(() => applySound(loop, { ...operation, target: edge.key }), /loop/);
  const noLoop = applySound(loop, { ...operation, target: state.key, sound: undefined });
  const correct = targets.find(t => t.label.includes('correct'));
  assert.equal(parseAnimData(applySound(noLoop, { ...operation, target: correct.key }).js).machine.groups[0].transitions.find(t => t.event === 'correct').sound.levelDb, -12);
  const imported = applyOperations(template, [{ ...operation, sound: { ...sound, asset: 'sounds/new.wav' }, asset: { path: 'sounds/new.wav', data: 'data:audio/wav;base64,AQ==' } }]);
  assert.deepEqual(imported.diff.map(d => d.file), ['js', 'assets']);
  assert.equal(imported.template.assets.length, 2);
});
test('invalid loop targets, bad levels, duplicate ids and future data are refused without losing source', () => {
  const template = fixture(), targets = soundTargets(template), op = { kind: 'sound.set', target: targets[0].key, sound };
  for (const target of targets.filter(t => !t.loop)) assert.throws(() => applySound(template, { ...op, target: target.key, sound: { ...sound, mode: 'loop' } }), /once/);
  assert.throws(() => applySound(template, { ...op, sound: { ...sound, levelDb: 7 } }), /valid sound/);
  const attached = applySound(template, op);
  assert.throws(() => applySound(attached, { ...op, target: targets[1].key }), /already used/);
  const future = { ...template, js: template.js.replace('"version": 2', '"version": 2, "future": true') };
  assert.deepEqual(soundTargets(future), []); assert.throws(() => applySound(future, op), /preserved/);
});
