// guards: src/control/sceneJoin.ts, src/model/obsScenes.ts
//
// A GRAPHIC THAT JOINS AN OBS SCENE GOES ON AIR (#2489; docs/work-specs/obs-scenes/spec.md
// Behaviour "Scenes"): which graphics a publish brought into a scene, and the Take that follows
// once the scene's open links hold that publish. Pure, in Node.

import test from 'node:test';
import assert from 'node:assert/strict';
import './lib/tsResolve.mjs';

const { joinedScenes, sceneCuesOf, obsScenesOf } = await import('../src/model/obsScenes.ts');
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

test('a publish joins only the graphics a scene did not name in the row it replaced', () => {
  const show = production();
  const before = [{ id: 'scA', name: 'Gameplay', graphics: ['A1'] }];
  assert.deepEqual(joinedScenes(before, obsScenesOf(show)), [
    { scene: 'scA', graphic: 'A2' },
    { scene: 'scB', graphic: 'B1' },
  ]);
  // Published as it stands: nothing joins at the next publish, so a graphic taken out stays out.
  assert.deepEqual(joinedScenes(obsScenesOf(show), obsScenesOf(show)), []);
  // A graphic that moves to another scene joins that scene.
  const moved = production({ cues: [cue('a1', 'p-A1', 'scB'), cue('a2', 'p-A2', 'scA'), cue('b1', 'p-B1', 'scB')] });
  assert.deepEqual(joinedScenes(obsScenesOf(show), obsScenesOf(moved)), [{ scene: 'scB', graphic: 'A1' }]);
});

test('the first publish of a production with scenes joins every scene graphic; with the switch off none', () => {
  assert.deepEqual(joinedScenes([], obsScenesOf(production())).map((j) => j.graphic), ['A1', 'A2', 'B1']);
  assert.deepEqual(joinedScenes([], obsScenesOf(production({ obsScenes: undefined }))), []);
});

test('the cue a join takes is the scene\'s first cue of the graphic as the record is now', () => {
  const ids = (show, joins) => sceneCuesOf(show, joins).map((c) => c?.id ?? null);
  const joins = [{ scene: 'scA', graphic: 'A1' }, { scene: 'scB', graphic: 'B1' }, { scene: 'scB', graphic: 'A1' }];
  // Moved out of the scene since the publish, or the switch turned off: nothing to take.
  assert.deepEqual(ids(production(), joins), ['a1', 'b1', null]);
  assert.deepEqual(ids(production({ obsScenes: undefined }), joins), [null, null, null]);
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

function clockIo(entries, record = production()) {
  let t = 0;
  const taken = [];
  const failures = [];
  const io = {
    published: () => true,
    entries: () => entries(t),
    record: () => record,
    take: async (cue) => {
      if (cue.id === 'h') throw new Error('typed data refused');
      taken.push({ cue: cue.id, at: t });
    },
    failed: (j, e) => failures.push(`${j.graphic}: ${e.message}`),
    live: () => true,
    now: () => t,
    wait: async (ms) => {
      t += ms;
    },
  };
  return { io, taken, failures };
}

test('the Take waits for the scene link to read the publish, then takes each joined graphic, up or not', async () => {
  // The link reads publish 7 after 3 s: before that it would read the Take past (OS1a R6).
  const { io, taken } = clockIo((t) => [link('scA', ready(t >= 3000 ? 7 : 6))]);
  await takeJoined(io, [{ scene: 'scA', graphic: 'A1' }, { scene: 'scA', graphic: 'A2' }], 7);
  assert.deepEqual(taken, [{ cue: 'a1', at: 3000 }, { cue: 'a2', at: 3000 }]);
});

test('a link that never reads the publish delays the Take by the bound only', async () => {
  const { io, taken } = clockIo(() => [link('scA', ready(6))]);
  await takeJoined(io, [{ scene: 'scA', graphic: 'A2' }], 7);
  assert.deepEqual(taken, [{ cue: 'a2', at: JOIN_WAIT_MS }]);
});

test('no link open: the Take goes at once; one that throws is said and the others still go; a page gone takes nothing', async () => {
  // Hand is in a scene here, and its Take throws.
  const withHand = production({ cues: [cue('h', 'p-Hand', 'scA'), cue('a2', 'p-A2', 'scA')] });
  const open = clockIo(() => [], withHand);
  await takeJoined(open.io, [{ scene: 'scA', graphic: 'Hand' }, { scene: 'scA', graphic: 'A2' }, { scene: 'scB', graphic: 'Gone' }], 7);
  assert.deepEqual(open.taken, [{ cue: 'a2', at: 0 }]);
  assert.deepEqual(open.failures, ['Hand: typed data refused']);
  const gone = clockIo(() => [link('scA', ready(6))]);
  gone.io.live = () => false;
  await takeJoined(gone.io, [{ scene: 'scA', graphic: 'A2' }], 7);
  assert.deepEqual(gone.taken, []);
});

test('a first publish: the Take waits for the page to send to the published log, and never goes unpublished', async () => {
  // The page renders its new slug 40 ms after the publish lands.
  const late = clockIo(() => []);
  late.io.published = () => late.io.now() >= 40;
  await takeJoined(late.io, [{ scene: 'scA', graphic: 'A2' }], 1);
  assert.deepEqual(late.taken, [{ cue: 'a2', at: 250 }]);
  // It never does: nothing is sent, and the page says so.
  const never = clockIo(() => []);
  never.io.published = () => false;
  await takeJoined(never.io, [{ scene: 'scA', graphic: 'A2' }], 1);
  assert.deepEqual(never.taken, []);
  assert.deepEqual(never.failures, ['A2: the page did not take the publish in time']);
});
