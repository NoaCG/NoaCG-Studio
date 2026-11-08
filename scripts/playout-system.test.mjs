// guards: src/model/outputSetup.ts, src/model/shows.ts, src/components/home/ProductionPage.tsx, src/components/home/useProductionPublish.ts
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  outputChoice, outputSetupForFirstPublish, playoutSystem, readOutputSetup,
  wantsAccountOutputDefault, withCasparSwitch, withPlayoutSystem,
} from '../src/model/outputSetup.ts';
import './lib/tsResolve.mjs';

const { createShowNamedChecked, loadShows, productionPlayoutSystem, setShowOutputSetup } = await import('../src/model/shows.ts');

const unset = outputChoice(null, false);
const browser = { id: 'browser', profile: 'browser' };
const base = { setup: unset, serverCues: false, vmixCues: false, legacyActivity: false, accountDefault: null };

test('explicit choice wins and legacy records retain the old inference', () => {
  const busy = { serverCues: true, vmixCues: true, legacyActivity: true, accountDefault: true };
  const cases = [
    ['explicit CasparCG on', { ...busy, setup: withCasparSwitch(unset, true) }, 'casparcg'],
    ['explicit neither', { ...busy, setup: withCasparSwitch(unset, false) }, null],
    ['explicit vMix', { ...busy, setup: withPlayoutSystem(unset, 'vmix') }, 'vmix'],
    ['unset', {}, null],
    ['old CasparCG destination', { setup: outputChoice('browser', true) }, 'casparcg'],
    ['old vMix Browser profile', { setup: outputChoice('vmix', false) }, null],
    ['old vMix Browser profile with CasparCG', { setup: outputChoice('vmix', true) }, 'casparcg'],
    ['new production with account default', { accountDefault: true }, 'casparcg'],
    ['new production with account default off', { accountDefault: false }, null],
    ['configured Browser ignores account default', { setup: outputChoice('browser', false), accountDefault: true }, null],
    ['absent setup ignores account default', { setup: undefined, accountDefault: true }, null],
    ['absent setup follows legacy activity', { setup: undefined, legacyActivity: true }, 'casparcg'],
  ];
  for (const [label, input, expected] of cases) {
    assert.equal(playoutSystem({ ...base, ...input }), expected, label);
  }
});

test('only a playout cue referring to a vMix item infers vMix', () => {
  const cue = (sourceId, source = 'playout') => ({ sourceId, source });
  const show = {
    outputSetup: unset,
    playoutItems: [{ id: 'vm', adapter: 'vmix' }, { id: 'caspar', adapter: 'casparcg' }, { id: 'legacy' }],
  };
  assert.equal(productionPlayoutSystem({ ...show, cues: [cue('vm')] }, false, null), 'vmix');
  assert.equal(productionPlayoutSystem({ ...show, cues: [cue('vm')] }, false, true), 'casparcg');
  assert.equal(productionPlayoutSystem({ ...show, cues: [cue('vm', 'graphic')] }, false, null), null);
  assert.equal(productionPlayoutSystem({ ...show, cues: [cue('vm'), cue('caspar')] }, false, null), 'casparcg');
  assert.equal(productionPlayoutSystem({ ...show, cues: [cue('legacy')] }, false, null), 'casparcg');
  assert.equal(productionPlayoutSystem({ ...show, cues: [cue('missing')] }, false, null), 'casparcg');
});

test('writing a single choice keeps the Browser profile and the old stored CasparCG shapes', () => {
  const legacy = outputChoice('vmix', true);
  const [legacyBrowser, caspar] = legacy.destinations;
  const vmix = withPlayoutSystem(legacy, 'vmix');
  assert.deepEqual(vmix, { v: 1, destinations: [legacyBrowser], caspar: false, vmix: true });
  assert.deepEqual(readOutputSetup(vmix), vmix);
  assert.deepEqual(readOutputSetup({ ...legacy, caspar: true, vmix: true }), vmix);
  assert.deepEqual(readOutputSetup({ ...legacy, vmix: false }), legacy);
  assert.deepEqual(readOutputSetup({ ...legacy, vmix: 'true' }), legacy);
  assert.deepEqual(withCasparSwitch(vmix, false), vmix);
  assert.deepEqual(withCasparSwitch(vmix, true), { v: 1, destinations: [legacyBrowser, caspar], caspar: true });
  assert.deepEqual(withPlayoutSystem(vmix, null), { v: 1, destinations: [legacyBrowser], caspar: false });
});

test('first Publish preserves a saved vMix selection and never turns inferred vMix into an explicit choice', () => {
  const oldStorage = globalThis.localStorage;
  const stored = new Map();
  globalThis.localStorage = {
    getItem: (key) => stored.get(key) ?? null,
    setItem: (key, value) => stored.set(key, String(value)),
    removeItem: (key) => stored.delete(key),
  };
  try {
    const { show, error } = createShowNamedChecked('vMix production');
    assert.equal(error, null);
    const explicit = { v: 1, destinations: [], caspar: false, vmix: true };
    assert.equal(setShowOutputSetup(show.id, explicit).error, null);
    const saved = loadShows().find((candidate) => candidate.id === show.id);
    assert.deepEqual(saved.outputSetup, explicit);
    const system = productionPlayoutSystem(saved, true, true);
    assert.equal(system, 'vmix');
    assert.equal(wantsAccountOutputDefault(saved.outputSetup), false);
    assert.equal(outputSetupForFirstPublish(saved.outputSetup, system), null);
    assert.deepEqual(loadShows().find((candidate) => candidate.id === show.id).outputSetup, explicit);
  } finally {
    globalThis.localStorage = oldStorage;
  }

  assert.deepEqual(outputSetupForFirstPublish(unset, 'casparcg'), withCasparSwitch(unset, true));
  assert.deepEqual(outputSetupForFirstPublish(unset, null), withCasparSwitch(unset, false));
  assert.equal(outputSetupForFirstPublish(undefined, 'casparcg'), null);
  const inferred = outputSetupForFirstPublish(unset, 'vmix');
  assert.deepEqual(inferred, { v: 1, destinations: [browser] });
  assert.equal(wantsAccountOutputDefault(inferred), false);
  assert.equal(playoutSystem({ ...base, setup: inferred, vmixCues: true, accountDefault: true }), 'vmix');
});
