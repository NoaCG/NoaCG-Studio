// guards: src/control/sceneJoin.ts, src/model/obsScenes.ts
//
// A GRAPHIC THAT JOINS AN OBS SCENE GOES ON AIR (#2489; docs/work-specs/obs-scenes/spec.md
// Behaviour "Scenes"): which graphics a publish brought into a scene, and the Take that follows
// once the scene's open links hold that publish. Pure, in Node.

import test from 'node:test';
import assert from 'node:assert/strict';
import './lib/tsResolve.mjs';

const { joinedSceneCues, obsScenesOf } = await import('../src/model/obsScenes.ts');
const { takeJoined, sceneLinksHold, JOIN_WAIT_MS } = await import('../src/control/sceneJoin.ts');

const pool = (id, name) => ({ id, name, template: {} });
const cue = (id, sourceId, folderId) => ({ id, sourceId, label: id, values: {}, ...(folderId ? { folderId } : {}) });

function production(over = {}) {
  return {
    obsScenes: true,
    graphics: ['A1', 'A2', 'B1', 'Hand'].map((n) => pool(`p-${n}`, n)),
    folders: [
      { id: 'scA', name: 'Gameplay', mode: 'manual', obsScene: true },
      { id: 'scB', name: 'Desk', mode: 'manual', obsScene: true },
      { id: 'plain', name: 'Plain', mode: 'manual' },
    ],
    cues: [cue('a1', 'p-A1', 'scA'), cue('a1b', 'p-A1', 'scA'), cue('a2', 'p-A2', 'scA'), cue('b1', 'p-B1', 'scB'), cue('h', 'p-Hand', 'plain')],
    ...over,
  };
}

test('a publish joins only the graphics a scene did not name at the last publish, each with its first cue', () => {
  const show = production();
  const before = [{ id: 'scA', name: 'Gameplay', graphics: ['A1'] }];
  assert.deepEqual(joinedSceneCues(before, show), [
    { scene: 'scA', graphic: 'A2', cueId: 'a2' },
    { scene: 'scB', graphic: 'B1', cueId: 'b1' },
  ]);
  // Published as it stands: nothing joins at the next publish, a graphic taken out stays out.
  assert.deepEqual(joinedSceneCues(obsScenesOf(show), show), []);
  // A graphic that moves to another scene joins that scene.
  const moved = production({ cues: [cue('a1', 'p-A1', 'scB'), cue('a2', 'p-A2', 'scA'), cue('b1', 'p-B1', 'scB')] });
  assert.deepEqual(joinedSceneCues(obsScenesOf(show), moved), [{ scene: 'scB', graphic: 'A1', cueId: 'a1' }]);
});

test('the first publish of a production with scenes takes every scene graphic; an unknown last publish takes none', () => {
  assert.deepEqual(joinedSceneCues([], production()).map((j) => j.graphic), ['A1', 'A2', 'B1']);
  assert.deepEqual(joinedSceneCues(null, production()), []);
});

test('with the OBS scenes switch off nothing joins', () => {
  assert.deepEqual(joinedSceneCues([], production({ obsScenes: undefined })), []);
});

const link = (scene, ready) => ({ kind: 'output', scene: { id: scene, known: true }, ...(ready ? { ready } : {}) });
const ready = (n, chg) => ({ n: 1, of: 1, v: { n, h: 'h' }, is: [], ...(chg ? { chg: { s: 'preparing', v: { n: chg, h: 'h2' }, of: 1, n: 0 } } : {}) });

test('a scene link holds a publish once it reports that version, or is preparing it', () => {
  const scenes = new Set(['scA']);
  assert.equal(sceneLinksHold([link('scA', ready(4))], scenes, 5), false);
  assert.equal(sceneLinksHold([link('scA')], scenes, 5), false);
  assert.equal(sceneLinksHold([link('scA', ready(5))], scenes, 5), true);
  assert.equal(sceneLinksHold([link('scA', ready(4, 5))], scenes, 5), true);
  // Another scene's link, the ordinary link and an operator never hold it back.
  assert.equal(sceneLinksHold([link('scB', ready(1)), { kind: 'output', ready: ready(1) }, { kind: 'operator' }], scenes, 5), true);
});

function clockIo(entries, onAir = new Set()) {
  let t = 0;
  const taken = [];
  const io = {
    entries: () => entries(t),
    onAir: (g) => onAir.has(g),
    take: async (id) => {
      taken.push({ id, at: t });
    },
    live: () => true,
    now: () => t,
    wait: async (ms) => {
      t += ms;
    },
  };
  return { io, taken };
}

test('the Take waits for the scene link to hold the publish, then takes each joined graphic not on air', async () => {
  // The link takes publish 7 after 3 s: before that it would read the Take past (OS1a R6).
  const { io, taken } = clockIo((t) => [link('scA', ready(t >= 3000 ? 7 : 6))], new Set(['A1']));
  const joins = [
    { scene: 'scA', graphic: 'A1', cueId: 'a1' },
    { scene: 'scA', graphic: 'A2', cueId: 'a2' },
  ];
  await takeJoined(io, joins, 7);
  assert.deepEqual(taken, [{ id: 'a2', at: 3000 }]);
});

test('a link that never takes the publish delays the Take by the bound only', async () => {
  const { io, taken } = clockIo(() => [link('scA', ready(6))]);
  await takeJoined(io, [{ scene: 'scA', graphic: 'A2', cueId: 'a2' }], 7);
  assert.deepEqual(taken, [{ id: 'a2', at: JOIN_WAIT_MS }]);
});

test('no link open: the Take goes at once; a page that left the production takes nothing', async () => {
  const open = clockIo(() => []);
  await takeJoined(open.io, [{ scene: 'scA', graphic: 'A2', cueId: 'a2' }], 7);
  assert.deepEqual(open.taken, [{ id: 'a2', at: 0 }]);
  const gone = clockIo(() => [link('scA', ready(6))]);
  gone.io.live = () => false;
  await takeJoined(gone.io, [{ scene: 'scA', graphic: 'A2', cueId: 'a2' }], 7);
  assert.deepEqual(gone.taken, []);
});
