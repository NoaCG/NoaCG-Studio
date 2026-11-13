// guards: src/control/obsSceneRows.ts, src/output/sceneScope.ts, src/control/readiness.ts, src/control/livePath.ts
//
// OBS SCENES, MONITORING (docs/work-specs/obs-scenes/spec.md OS3, rules M2 to M6, M9): one row per
// scene from its links' Presence entries and what the page heard since it opened; the walk-through
// fold of OBS's own events, a shared source included; the cap of 16 expected outputs. Pure, in Node.
// The random walk checks every row against an oracle written from the Rules' words, not from the
// module's code.

import test from 'node:test';
import assert from 'node:assert/strict';
import './lib/tsResolve.mjs';

const { sceneRows, watchScenes, loadedScenes, EMPTY_WATCH, obsWords } = await import('../src/control/obsSceneRows.ts');
const { obsEvent, OBS_ARRIVAL_MS, OBS_SHARED_MS, OBS_SEEN_MAX } = await import('../src/output/sceneScope.ts');
const { rememberOutputs, unwatchedOutputs, MAX_EXPECTED_OUTPUTS, NOT_ANSWERING_MS } = await import('../src/control/readiness.ts');
const { readLiveEntry } = await import('../src/control/livePath.ts');

const V = { n: 3, h: 'hhh' };
const SCENES = [
  { id: 'scA', name: 'Gameplay', graphics: ['A1'] },
  { id: 'scB', name: 'Desk', graphics: ['B1'] },
  { id: 'scC', name: 'Break', graphics: ['C1'] },
];

/** A scene link's entry as readLiveEntry hands it on. */
function link(id, scene, over = {}) {
  return {
    kind: 'output',
    id,
    engine: 'OBS · Chromium 127',
    build: 'b',
    proto: 2,
    surface: 'output',
    log: true,
    cmd: true,
    at: 1,
    name: SCENES.find((s) => s.id === scene)?.name,
    ready: { n: 1, of: 1, v: V, is: [] },
    scene: { id: scene, known: true },
    ...over,
  };
}

const rowsOf = (over = {}) =>
  sceneRows({ scenes: SCENES, peers: [], presence: 'joined', watch: EMPTY_WATCH, expected: [], published: V, now: 100_000, ...over });

test('M3, M4: each load state and the OBS position, in the panel words', () => {
  // Nothing loaded yet: grey, no position.
  let { rows } = rowsOf();
  assert.deepEqual(rows.map((r) => [r.name, r.state, r.tone, r.obs]), [
    ['Gameplay', 'Not loaded', 'idle', null],
    ['Desk', 'Not loaded', 'idle', null],
    ['Break', 'Not loaded', 'idle', null],
  ]);
  // Loaded and ready, unknown before any OBS event; preview; program; hidden.
  const peers = [
    link('o1', 'scA'),
    link('o2', 'scB', { scene: { id: 'scB', known: true, obs: 'preview' } }),
    link('o3', 'scC', { scene: { id: 'scC', known: true, obs: 'program', last: 'Break', seen: ['Break'] } }),
  ];
  rows = rowsOf({ peers }).rows;
  assert.deepEqual(rows.map((r) => [r.state, r.tone, r.obs && obsWords(r.obs)]), [
    ['Ready, connected', 'ok', 'OBS: unknown'],
    ['Ready, connected', 'ok', 'Preview'],
    ['Ready, connected', 'ok', 'Program'],
  ]);
  assert.deepEqual(rows.map((r) => r.seen), [[], [], ['Break']]);
  // Not connected to the live channel: the output's own words, amber.
  rows = rowsOf({ peers: [link('o1', 'scA', { log: false })] }).rows;
  assert.equal(rows[0].state, 'Commands may arrive up to 30 s late');
  assert.equal(rows[0].tone, 'warn');
  // Loaded twice, three times: amber, the position furthest on air.
  rows = rowsOf({ peers: [link('o1', 'scA', { scene: { id: 'scA', known: true, obs: 'hidden' } }), link('o2', 'scA', { scene: { id: 'scA', known: true, obs: 'program' } })] }).rows;
  assert.deepEqual([rows[0].state, rows[0].tone, rows[0].obs, rows[0].loaded], ['Loaded twice', 'warn', 'program', 2]);
  rows = rowsOf({ peers: [link('o1', 'scA'), link('o2', 'scA'), link('o3', 'scA')] }).rows;
  assert.equal(rows[0].state, 'Loaded 3 times');
  // A link that loaded before its scene was published.
  rows = rowsOf({ peers: [link('o1', 'scA', { scene: { id: 'scA', known: false } })] }).rows;
  assert.deepEqual([rows[0].state, rows[0].tone], ['Publish to load', 'warn']);
  // This page not joined: nothing can be known; unpublished: nothing can be loaded.
  rows = rowsOf({ peers: [link('o1', 'scA')], presence: 'down' }).rows;
  assert.deepEqual([rows[0].state, rows[0].obs], ['Not known', null]);
  assert.equal(rowsOf({ presence: 'off' }).rows[0].state, 'Not loaded');
});

test('M3, M6: a link that goes away reads not answering, grey and then red; it leaves the Outputs list', () => {
  let watch = watchScenes(EMPTY_WATCH, [link('o1', 'scA', { scene: { id: 'scA', known: true, seen: ['Gameplay', 'Replay'] } })], 1000);
  let out = rowsOf({ peers: [link('o1', 'scA')], watch, now: 1000 });
  assert.deepEqual([...out.claimed], ['o1']);
  // It leaves: the update after it dates the leaving.
  watch = watchScenes(watch, [], 50_000);
  out = rowsOf({ watch, now: 55_000, expected: [{ id: 'o1', name: 'Gameplay', seen: 50_000 }] });
  assert.deepEqual([out.rows[0].state, out.rows[0].tone], ['Not answering (5 s)', 'idle']);
  // The walk-through stays ticked.
  assert.deepEqual(out.rows[0].seen, ['Gameplay', 'Replay']);
  out = rowsOf({ watch, now: 50_000 + NOT_ANSWERING_MS, expected: [{ id: 'o1', name: 'Gameplay', seen: 50_000 }] });
  assert.deepEqual([out.rows[0].state, out.rows[0].tone], ['Not answering (15 s)', 'bad']);
  assert.ok(out.claimed.has('o1'));
  // After this page reloaded (nothing heard), a remembered output called by the scene's name.
  out = rowsOf({ now: 90_000, expected: [{ id: 'x', name: 'Desk', seen: 30_000 }] });
  assert.deepEqual([out.rows[1].state, out.rows[1].tone], ['Not answering (60 s)', 'bad']);
  assert.ok(out.claimed.has('x'));
  // A link to a scene with no row stays in the Outputs list.
  out = rowsOf({ peers: [link('o9', 'gone')] });
  assert.equal(out.claimed.has('o9'), false);
});

test('M8: how many scenes have a link loaded, unknown when the page cannot see', () => {
  const peers = [link('o1', 'scA'), link('o2', 'scA'), link('o3', 'scC'), link('o4', 'other')];
  assert.equal(loadedScenes(rowsOf({ peers }).rows, 'joined'), 2);
  assert.equal(loadedScenes(rowsOf().rows, 'joined'), 0);
  assert.equal(loadedScenes(rowsOf({ presence: 'down' }).rows, 'down'), null);
  assert.equal(loadedScenes(rowsOf({ presence: 'off' }).rows, 'off'), 0);
});

test('M5: the walk-through ticks the OBS scene a source goes on program in, a shared source in each', () => {
  let t = 0;
  let where = {};
  const hear = (event, after = 50) => {
    t += after;
    where = obsEvent(where, event, t);
  };
  const tick = (after) => hear({ type: 'tick' }, after);
  // Onto program in Gameplay (OBS's order: visible, active, the name).
  hear({ type: 'visible', on: true });
  hear({ type: 'active', on: true });
  hear({ type: 'scene', name: 'Gameplay' });
  assert.deepEqual(where.seen, ['Gameplay']);
  // A cut from Gameplay to Desk while this source is in Desk only: it activates while OBS still
  // names Gameplay, then hears Desk. Gameplay is never ticked for it twice, nor Desk early.
  where = {};
  hear({ type: 'scene', name: 'Gameplay' });
  hear({ type: 'visible', on: true }, 5000);
  hear({ type: 'active', on: true });
  assert.equal(where.seen, undefined);
  hear({ type: 'scene', name: 'Desk' });
  tick(OBS_ARRIVAL_MS + 50);
  assert.deepEqual(where.seen, ['Desk']);
  // Shown inside the scene already on program, no name following: that scene, once the window passed.
  where = { current: 'Break' };
  hear({ type: 'active', on: true });
  assert.equal(where.seen, undefined);
  tick(OBS_ARRIVAL_MS + 50);
  assert.deepEqual(where.seen, ['Break']);
  // A cut away: the name, then the source leaves program. Never ticked.
  hear({ type: 'scene', name: 'Replay' }, 30_000);
  hear({ type: 'visible', on: false });
  hear({ type: 'active', on: false });
  tick(OBS_SHARED_MS + 50);
  assert.deepEqual(where.seen, ['Break']);
  // D9's shared source: on program in Break, OBS cuts to Desk, which holds the same source, and it
  // stays on program. Desk is ticked once it stayed, not before.
  hear({ type: 'visible', on: true }, 5000);
  hear({ type: 'active', on: true });
  hear({ type: 'scene', name: 'Break' });
  hear({ type: 'scene', name: 'Desk' }, 20_000);
  tick(OBS_SHARED_MS - 500);
  assert.deepEqual(where.seen, ['Break']);
  tick(600);
  assert.deepEqual(where.seen, ['Break', 'Desk']);
  assert.equal(where.last, 'Desk');
  // A slow transition away: the name, then the source leaves within the shared window. Not ticked.
  hear({ type: 'scene', name: 'Interview' }, 10_000);
  hear({ type: 'active', on: false }, 3000);
  tick(OBS_SHARED_MS);
  assert.deepEqual(where.seen, ['Break', 'Desk']);
  // Bounded: at most OBS_SEEN_MAX names, the newest kept.
  where = {};
  for (let i = 0; i < OBS_SEEN_MAX + 3; i += 1) {
    hear({ type: 'active', on: true }, 5000);
    hear({ type: 'scene', name: `S${i}` });
    hear({ type: 'active', on: false }, 5000);
  }
  assert.equal(where.seen.length, OBS_SEEN_MAX);
  assert.equal(where.seen.at(-1), `S${OBS_SEEN_MAX + 2}`);
});

test('M5: the list rides the scene report, bounded and checked on the way in', () => {
  const many = Array.from({ length: 20 }, (_, i) => `Scene ${i}`);
  const entry = readLiveEntry({ kind: 'output', id: 'o1', scene: { id: 'scA', known: true, seen: [...many, 7, 'Scene 1', 'x'.repeat(200)] } });
  assert.equal(entry.scene.seen.length, 12);
  assert.equal(entry.scene.seen[0], 'Scene 0');
  assert.deepEqual(readLiveEntry({ kind: 'output', id: 'o1', scene: { id: 'scA', known: true, seen: 'Desk' } }).scene, { id: 'scA', known: true });
  assert.deepEqual(readLiveEntry({ kind: 'output', id: 'o1', scene: { id: 'scA', known: true, seen: [] } }).scene, { id: 'scA', known: true });
});

test('M9: the expected outputs never grow past 16; the ones left out are counted', () => {
  const outputs = (n, from = 0) => Array.from({ length: n }, (_, i) => link(`o${from + i}`, 'scA', { name: `Out ${from + i}` }));
  let exp = rememberOutputs([], outputs(MAX_EXPECTED_OUTPUTS + 2), 1);
  assert.equal(exp.length, MAX_EXPECTED_OUTPUTS);
  assert.equal(unwatchedOutputs(exp, outputs(MAX_EXPECTED_OUTPUTS + 2)), 2);
  // Below the cap nothing is counted, even for an output the list has not taken in yet.
  assert.equal(unwatchedOutputs(rememberOutputs([], outputs(3), 1), outputs(4)), 0);
  // A new instance taking a gone output's name still replaces it at the cap.
  const present = outputs(MAX_EXPECTED_OUTPUTS - 1).concat([link('new', 'scA', { name: `Out ${MAX_EXPECTED_OUTPUTS - 1}` })]);
  exp = rememberOutputs(exp.slice(0, MAX_EXPECTED_OUTPUTS), present, 2);
  assert.equal(exp.length, MAX_EXPECTED_OUTPUTS);
  assert.ok(exp.some((e) => e.id === 'new'));
});

// ── The oracle: M3's precedence, from the Rules' words ─────────────────────────────────────────

/** "The first that holds", word for word from M3, over the facts a row is made of. */
function oracle({ presence, links, heard, remembered }) {
  if (presence === 'off') return 'Not loaded';
  if (presence !== 'joined') return 'Not known';
  if (links.length === 0) {
    if (!heard && remembered.length === 0) return 'Not loaded';
    return 'Not answering';
  }
  if (links.length >= 2) return links.length === 2 ? 'Loaded twice' : `Loaded ${links.length} times`;
  if (!links[0].scene.known) return 'Publish to load';
  return links[0].log === false ? 'Commands may arrive up to 30 s late' : 'Ready, connected';
}

test('M3 random walk: every row reads what the Rules say, in the scenes order, never claiming a link to no row', () => {
  let seed = 7;
  const rnd = (n) => {
    seed = (seed * 1103515245 + 12345) % 2 ** 31;
    return seed % n;
  };
  for (let round = 0; round < 400; round += 1) {
    const presence = ['joined', 'joined', 'joined', 'down', 'joining', 'off'][rnd(6)];
    const peers = [];
    const n = rnd(6);
    for (let i = 0; i < n; i += 1) {
      const scene = ['scA', 'scB', 'scC', 'stray'][rnd(4)];
      peers.push(link(`p${i}`, scene, { log: rnd(4) === 0 ? false : true, scene: { id: scene, known: rnd(5) !== 0 } }));
    }
    let watch = EMPTY_WATCH;
    if (rnd(2)) watch = watchScenes(watch, [link('old', ['scA', 'scB', 'scC'][rnd(3)])], 10);
    const expected = rnd(3) === 0 ? [{ id: 'rem', name: ['Gameplay', 'Desk', 'Break', 'Other'][rnd(4)], seen: 20 }] : [];
    const { rows, claimed } = sceneRows({ scenes: SCENES, peers, presence, watch, expected, published: V, now: 100_000 });
    assert.deepEqual(rows.map((r) => r.id), SCENES.map((s) => s.id));
    for (const [i, scene] of SCENES.entries()) {
      const links = presence === 'joined' ? peers.filter((p) => p.scene.id === scene.id) : [];
      const want = oracle({
        presence,
        links,
        heard: !!watch.scenes[scene.id],
        remembered: expected.filter((e) => e.name === scene.name && !peers.some((p) => p.id === e.id)),
      });
      assert.ok(rows[i].state.startsWith(want), `round ${round}, ${scene.name}: ${rows[i].state} for ${want}`);
      // Only a not-loaded or not-known row is grey without a reason to be; Ready is the one green.
      assert.equal(rows[i].tone === 'ok', want === 'Ready, connected');
    }
    for (const id of claimed) {
      const p = peers.find((x) => x.id === id);
      if (p) assert.notEqual(p.scene.id, 'stray');
    }
  }
});
