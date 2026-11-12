// guards: src/model/obsScenes.ts, src/output/sceneScope.ts, src/control/readiness.ts, src/control/livePath.ts
//
// OBS SCENES, THE SCENE LINK (docs/work-specs/obs-scenes/spec.md OS1a, R1 to R12): which graphics a
// scene is, what a scene link builds from a payload, the READY issue of a link whose scene is
// unknown, and the Presence word a scene link carries from OBS's own events. Pure, in Node.

import test from 'node:test';
import assert from 'node:assert/strict';
import './lib/tsResolve.mjs';

const { obsScenesOf, sceneLink } = await import('../src/model/obsScenes.ts');
const { sceneParam, scopePayload, obsEvent, obsState } = await import('../src/output/sceneScope.ts');
const { outputReadiness, outputStateWords, readOutputReady } = await import('../src/control/readiness.ts');
const { readLiveEntry } = await import('../src/control/livePath.ts');

const pool = (id, name) => ({ id, name, template: {} });
const cue = (id, sourceId, folderId) => ({ id, sourceId, label: id, values: {}, ...(folderId ? { folderId } : {}) });

/** Three scenes of two graphics each, a plain folder, a hand cue and a server cue. */
function production(over = {}) {
  return {
    obsScenes: true,
    graphics: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'Hand'].map((n) => pool(`p-${n}`, n)),
    folders: [
      { id: 'scA', name: 'Gameplay', mode: 'manual', obsScene: true },
      { id: 'scB', name: 'Desk', mode: 'manual', obsScene: true },
      { id: 'scC', name: 'Break', mode: 'manual', obsScene: true },
      { id: 'plain', name: 'Plain', mode: 'manual' },
    ],
    cues: [
      cue('a1', 'p-A1', 'scA'),
      cue('a2', 'p-A2', 'scA'),
      // A second cue of a graphic already in the scene names it once.
      cue('a1b', 'p-A1', 'scA'),
      { ...cue('srv', 'item1', 'scA'), source: 'playout' },
      cue('b1', 'p-B1', 'scB'),
      cue('b2', 'p-B2', 'scB'),
      cue('c1', 'p-C1', 'scC'),
      cue('c2', 'p-C2', 'scC'),
      cue('h', 'p-Hand', 'plain'),
    ],
    ...over,
  };
}

test('R1, R3: each scene folder is a scene of its own graphics, in rundown order, once each', () => {
  assert.deepEqual(obsScenesOf(production()), [
    { id: 'scA', name: 'Gameplay', graphics: ['A1', 'A2'] },
    { id: 'scB', name: 'Desk', graphics: ['B1', 'B2'] },
    { id: 'scC', name: 'Break', graphics: ['C1', 'C2'] },
  ]);
  // Renaming the folder keeps its id, so the link keeps working.
  const renamed = production();
  renamed.folders[0].name = 'Game';
  assert.equal(obsScenesOf(renamed)[0].id, 'scA');
});

test('R2, R3, R10: with the switch off there are no scenes, and the flags are kept for later', () => {
  const off = production({ obsScenes: undefined });
  assert.deepEqual(obsScenesOf(off), []);
  assert.equal(off.folders[0].obsScene, true);
  // No folder flagged: no scenes either, so the payload is exactly today's.
  assert.deepEqual(obsScenesOf(production({ folders: production().folders.map((f) => ({ ...f, obsScene: undefined })) })), []);
});

test('the scene link is the output link with &scene=<id>', () => {
  assert.equal(sceneLink('https://noacg.studio/output?production=abc', 'scA'), 'https://noacg.studio/output?production=abc&scene=scA');
  assert.equal(sceneParam('?production=abc&scene=scA'), 'scA');
  assert.equal(sceneParam('?production=abc'), null);
  // An empty or odd id is still a scene link, never the whole production.
  assert.equal(sceneParam('?production=abc&scene='), '');
});

/** A published payload of that production: every graphic, its cues, the scenes. */
function payload(scenes = obsScenesOf(production())) {
  const keys = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'Hand'];
  return {
    v: 1,
    resolution: { width: 1920, height: 1080, label: '1080p' },
    graphics: keys.map((key) => ({ key, html: '', css: '', js: '', assets: [], resolution: { width: 1280, height: 720 }, fps: 50 })),
    cues: keys.map((k) => ({ id: k.toLowerCase(), graphic: k, label: k, values: {} })),
    ver: { n: 3, at: '', h: 'hh', g: Object.fromEntries(keys.map((k) => [k, `d-${k}`])) },
    ...(scenes.length ? { scenes } : {}),
  };
}

test('AC-1, R5: a scene link builds two graphics of its scene; the ordinary link is untouched', () => {
  for (const [id, keys] of [['scA', ['A1', 'A2']], ['scB', ['B1', 'B2']], ['scC', ['C1', 'C2']]]) {
    const scope = scopePayload(payload(), id);
    assert.equal(scope.known, true);
    assert.deepEqual(scope.payload.graphics.map((g) => g.key), keys);
    assert.deepEqual(scope.payload.cues.map((c) => c.graphic), keys);
    assert.deepEqual([...scope.keys], keys);
    assert.equal(scope.faces.size, 0);
    // The stage keeps the production's resolution and the one version stamp.
    assert.deepEqual(scope.payload.resolution, payload().resolution);
    assert.deepEqual(scope.payload.ver, payload().ver);
  }
});

test('AC-1, R5: an unknown, deleted, malformed or switched-off scene builds nothing, never the whole production', () => {
  for (const [p, id] of [
    [payload(), 'nope'],
    [payload(), ''],
    [payload(), 'a/../b'],
    [payload(obsScenesOf(production()).filter((s) => s.id !== 'scB')), 'scB'],
    [payload([]), 'scA'],
  ]) {
    const scope = scopePayload(p, id);
    assert.equal(scope.known, false, `${id} is not known`);
    assert.deepEqual(scope.payload.graphics, []);
    assert.deepEqual(scope.payload.cues, []);
    assert.equal(scope.keys.size, 0);
  }
});

test('a production face shipped with a graphic of another scene is still found by the scene link', () => {
  const p = payload();
  p.graphics[0] = { ...p.graphics[0], assets: [{ path: 'fonts/house.woff2', data: 'data:font/woff2;base64,AA' }, { path: 'img/logo.png', data: 'data:image/png;base64,AA' }] };
  const scope = scopePayload(p, 'scB');
  assert.deepEqual([...scope.faces], [['fonts/house.woff2', 'data:font/woff2;base64,AA']]);
  // The scene's own graphics keep their own files; nothing else of another graphic is held.
  assert.equal(scopePayload(p, 'scA').faces.size, 0);
});

test('AC-1, R6: a graphic removed from the scene leaves its scope at the next publish', () => {
  const before = scopePayload(payload(), 'scA');
  const moved = production();
  moved.cues = moved.cues.map((c) => (c.id === 'a2' ? { ...c, folderId: 'plain' } : c));
  const after = scopePayload(payload(obsScenesOf(moved)), 'scA');
  assert.deepEqual([...before.keys], ['A1', 'A2']);
  assert.deepEqual([...after.keys], ['A1']);
  assert.deepEqual(after.payload.graphics.map((g) => g.key), ['A1']);
});

test('R8: READY of a link whose scene is unknown is not ready, in words, and survives the wire', () => {
  const ready = outputReadiness({ graphics: [], checks: new Map(), version: { n: 3, h: 'hh' }, unknownScene: 'nope' });
  assert.deepEqual(ready.is, [{ k: 'scene', g: 'Scene link', d: 'nope' }]);
  assert.match(outputStateWords(ready), /^Not ready: Scene link \(no such OBS scene\)/);
  assert.deepEqual(readOutputReady(JSON.parse(JSON.stringify(ready))).is, ready.is);
  // A known scene, or the ordinary link, says nothing of the kind.
  assert.deepEqual(outputReadiness({ graphics: [], checks: new Map(), version: null }).is, []);
});

test('R8: OBS events say where the source is; unknown before the first; the last program scene', () => {
  // OBS's own order (docs/OBS_ON_A_REAL_HOST.md §5), each event at a time in ms.
  let t = 0;
  let where = {};
  const hear = (event, after = 50) => {
    t += after;
    where = obsEvent(where, event, t);
  };
  assert.equal(obsState(where), undefined);
  // Onto program: visible, active, then the scene's name.
  hear({ type: 'visible', on: true });
  assert.equal(obsState(where), 'preview');
  hear({ type: 'active', on: true });
  hear({ type: 'scene', name: 'Gameplay' });
  assert.equal(obsState(where), 'program');
  assert.equal(where.last, 'Gameplay');
  // A cut away, much later: the new scene's name first, then visible and active false. The source
  // never aired in Desk, so its last program scene stays Gameplay.
  hear({ type: 'scene', name: 'Desk' }, 60_000);
  assert.equal(where.last, 'Gameplay');
  hear({ type: 'visible', on: false });
  hear({ type: 'active', on: false });
  assert.equal(obsState(where), 'hidden');
  assert.equal(where.last, 'Gameplay');
  // Back on program in another scene holding it.
  hear({ type: 'visible', on: true }, 5000);
  hear({ type: 'active', on: true });
  hear({ type: 'scene', name: 'Replay' });
  assert.equal(where.last, 'Replay');
  // Shown inside the scene already on program, no name following, then cut away later.
  hear({ type: 'active', on: false }, 5000);
  hear({ type: 'active', on: true }, 5000);
  assert.equal(where.last, 'Replay');
  hear({ type: 'scene', name: 'Break' }, 30_000);
  assert.equal(where.last, 'Replay');
});

test('R8: a Presence entry carries the scene report, read back like any other input', () => {
  const entry = readLiveEntry({ kind: 'output', id: 'o1', scene: { id: 'scA', known: true, obs: 'program', last: 'Gameplay' } });
  assert.deepEqual(entry.scene, { id: 'scA', known: true, obs: 'program', last: 'Gameplay' });
  assert.deepEqual(readLiveEntry({ kind: 'output', id: 'o1', scene: { id: 'x', known: false, obs: 'sideways' } }).scene, { id: 'x', known: false });
  assert.equal(readLiveEntry({ kind: 'output', id: 'o1', scene: { id: 3 } }).scene, undefined);
  assert.equal('scene' in readLiveEntry({ kind: 'output', id: 'o1' }), false);
});
