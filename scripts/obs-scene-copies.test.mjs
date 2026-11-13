// guards: src/model/obsScenes.ts
//
// OBS SCENES, ONE GRAPHIC PER SCENE (docs/work-specs/obs-scenes/spec.md OS1b, C1 to C6): a graphic
// added to a second scene becomes that scene's own named copy, with the same bindings and its own
// placement, made inside the write that added it. The fixed cases pin the names and members; the
// walk checks random edits against an oracle written from the Rules, never from the algorithm.

import test from 'node:test';
import assert from 'node:assert/strict';
import './lib/tsResolve.mjs';

const { obsScenesOf, sceneSnapshot, separateSceneGraphics, sceneGraphicNames, sceneCopyId } = await import('../src/model/obsScenes.ts');
const { poolPlacement } = await import('../src/model/poolIdentity.ts');

const pool = (id, name, layer, extra = {}) => ({ id, name, type: 'lowerThird', savedAt: 't0', template: { name, fields: [] }, layer, ...extra });
const cue = (id, sourceId, folderId) => ({ id, sourceId, label: id, values: { f0: id }, ...(folderId ? { folderId } : {}) });
const folder = (id, name, scene = true) => ({ id, name, mode: 'manual', ...(scene ? { obsScene: true } : {}) });

function deps(guard) {
  return { freeLayer: (graphics) => Math.max(19, ...graphics.map((g) => g.layer ?? 20)) + 1, ...(guard ? { guard } : {}) };
}
/** The id of a scene's first copy of a graphic, and its next. */
const copyId = (source, scene, n = 0) => sceneCopyId(source, scene, n);

/** One write as shows.ts patchShowChecked runs it: owners read before, separation after. */
function write(show, mutate, d = deps()) {
  const before = sceneSnapshot(show);
  mutate(show);
  const result = separateSceneGraphics(show, before, d);
  if (typeof result === 'string') throw new Error(result);
  return show;
}

function production() {
  return {
    obsScenes: true,
    graphics: [
      pool('lt', 'Lower third', 20, { adjust: { v: 1, x: 10 }, soundConfig: { in: 's' }, graphicId: 'lib-lt' }),
      pool('bug', 'Bug', 21),
    ],
    folders: [folder('desk', 'Desk'), folder('game', 'Gameplay'), folder('plain', 'Plain', false)],
    cues: [cue('d1', 'lt', 'desk'), cue('g1', 'bug', 'game'), cue('p1', 'lt', 'plain'), cue('h1', 'lt')],
    bindings: { 'Lower third': { name: 'player.name' } },
    profile: { v: 1, arrange: { 'Lower third': { show: { name: 'Show' } } } },
  };
}

test('AC-3, C2, C4: adding a graphic to a second scene makes a named copy with its bindings and placement', () => {
  const show = write(production(), (s) => s.cues.push(cue('g2', 'lt', 'game')));
  const copy = show.graphics.find((g) => g.id === copyId('lt', 'game'));
  assert.equal(copy.name, 'Lower third · Gameplay');
  assert.equal(copy.template.name, 'Lower third · Gameplay');
  assert.equal(copy.sceneCopyOf, 'lt');
  assert.deepEqual([copy.adjust, copy.soundConfig, copy.graphicId, copy.type], [{ v: 1, x: 10 }, { in: 's' }, 'lib-lt', 'lowerThird']);
  assert.equal(copy.layer, 22, 'the next free layer: it never replaces another graphic on air');
  assert.deepEqual(show.bindings['Lower third · Gameplay'], { name: 'player.name' }, 'same bindings, under its own name');
  assert.deepEqual(show.profile.arrange['Lower third · Gameplay'], { show: { name: 'Show' } });
  assert.deepEqual(show.graphics.map((g) => g.id), ['lt', copyId('lt', 'game'), 'bug'], 'placed after its source');
  assert.equal(show.cues.find((c) => c.id === 'g2').sourceId, copyId('lt', 'game'));
  assert.equal(show.cues.find((c) => c.id === 'd1').sourceId, 'lt', 'the scene that had it keeps it');
  assert.deepEqual(show.cues.find((c) => c.id === 'g2').values, { f0: 'g2' }, 'the cue keeps its values');
  // Its own placement: a change to one moves nothing in the other.
  copy.adjust.x = 99;
  assert.equal(show.graphics.find((g) => g.id === 'lt').adjust.x, 10);
  assert.deepEqual(obsScenesOf(show).map((s) => s.graphics), [['Lower third'], ['Bug', 'Lower third · Gameplay']]);
});

test('C4: a name already taken gets a number; a second cue of the graphic in the same scene shares its copy', () => {
  const show = production();
  show.graphics.push(pool('x', 'Lower third · Gameplay', 30));
  write(show, (s) => s.cues.push(cue('g2', 'lt', 'game')));
  assert.equal(show.graphics.find((g) => g.id === copyId('lt', 'game')).name, 'Lower third · Gameplay 2');
  // Later, in another write: the scene's copy is found again (C3).
  write(show, (s) => s.cues.push(cue('g3', 'lt', 'game')));
  assert.equal(show.cues.find((c) => c.id === 'g3').sourceId, copyId('lt', 'game'));
  assert.equal(show.graphics.length, 4, 'no second copy');
});

test('C5: cues outside every scene never cause a copy and never move', () => {
  const show = write(production(), (s) => s.cues.push(cue('p2', 'bug', 'plain'), cue('h2', 'bug')));
  assert.equal(show.graphics.length, 2);
  assert.deepEqual(show.cues.map((c) => c.sourceId), ['lt', 'bug', 'lt', 'lt', 'bug', 'bug']);
});

test('C2: a cue moved from one scene to another takes its graphic along, with no copy', () => {
  const show = write(production(), (s) => { s.cues[0].folderId = 'game'; });
  assert.equal(show.graphics.length, 2);
  assert.equal(show.cues[0].sourceId, 'lt');
});

test('C2: the scene that used it before keeps it, whatever the rundown order; the first otherwise', () => {
  // The newer scene is first in the rundown; the older one keeps the graphic.
  const show = production();
  show.cues.unshift(cue('g0', 'bug', 'plain'));
  write(show, (s) => { s.folders.find((f) => f.id === 'plain').obsScene = true; });
  assert.equal(show.cues.find((c) => c.id === 'g1').sourceId, 'bug', 'Gameplay had Bug before');
  assert.equal(show.cues.find((c) => c.id === 'g0').sourceId, copyId('bug', 'plain'));
  assert.equal(show.graphics.find((g) => g.id === copyId('bug', 'plain')).name, 'Bug · Plain');
  // Turning the switch on finds two scenes sharing a graphic, with no owner before: the first keeps it.
  const off = production();
  off.obsScenes = undefined;
  off.cues.push(cue('g2', 'lt', 'game'));
  write(off, (s) => { s.obsScenes = true; });
  assert.equal(off.cues.find((c) => c.id === 'd1').sourceId, 'lt');
  assert.equal(off.cues.find((c) => c.id === 'g2').sourceId, copyId('lt', 'game'));
});

test('C1, C6: with the switch off nothing is copied; turning it off keeps copies and pointers', () => {
  const off = production();
  off.obsScenes = undefined;
  const graphics = JSON.stringify(off.graphics);
  write(off, (s) => s.cues.push(cue('g2', 'lt', 'game')));
  assert.equal(JSON.stringify(off.graphics), graphics, 'no copy');
  assert.equal(off.cues.find((c) => c.id === 'g2').sourceId, 'lt');
  const on = write(production(), (s) => s.cues.push(cue('g2', 'lt', 'game')));
  write(on, (s) => { s.obsScenes = undefined; });
  write(on, (s) => { delete s.folders[1].obsScene; });
  assert.equal(on.graphics.length, 3);
  assert.equal(on.cues.find((c) => c.id === 'g2').sourceId, copyId('lt', 'game'));
  assert.deepEqual([...sceneGraphicNames(on)], [], 'no scene graphics with the switch off');
});

test('C9: the scene graphics are the names every scene uses', () => {
  const show = write(production(), (s) => s.cues.push(cue('g2', 'lt', 'game')));
  assert.deepEqual([...sceneGraphicNames(show)].sort(), ['Bug', 'Lower third', 'Lower third · Gameplay']);
});

// ── The walk: random edits against an oracle written from C2 to C6 ────────────────────────────

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

/** Which scenes each graphic is used by, with no help from the module (C1). */
function usersOf(show) {
  const scenes = new Set(show.obsScenes ? show.folders.filter((f) => f.obsScene).map((f) => f.id) : []);
  const ids = new Set(show.graphics.map((g) => g.id));
  const live = new Set(show.cues.map((c) => c.folderId));
  const users = new Map();
  for (const c of show.cues) {
    if (!c.folderId || !scenes.has(c.folderId) || !live.has(c.folderId) || !ids.has(c.sourceId) || c.source === 'playout') continue;
    users.set(c.sourceId, new Set([...(users.get(c.sourceId) ?? []), c.folderId]));
  }
  return users;
}

test('the walk: after every random edit each graphic is in one scene at most, and the Rules hold', () => {
  for (let seed = 1; seed <= 300; seed += 1) {
    const r = rng(seed);
    const pick = (list) => list[Math.floor(r() * list.length)];
    const show = production();
    show.graphics.push(pool('logo', 'Logo', 23));
    show.folders.push(folder('break', 'Break'));
    // The production's own picture graphic: never copied (C12), so the walk lets it share scenes.
    show.graphics.push({ ...pool('pics', 'Pictures', 24), type: 'picture' });
    const d = deps();
    let next = 0;
    for (let step = 0; step < 25; step += 1) {
      const before = structuredClone(show);
      const users0 = usersOf(before);
      const op = Math.floor(r() * 5);
      const folders = [...show.folders.map((f) => f.id), undefined];
      const mutate = (s) => {
        if (op === 0) s.cues.push(cue(`n${++next}`, pick(s.graphics).id, pick(folders)));
        else if (op === 1) pick(s.cues).folderId = pick(folders);
        else if (op === 2) { const f = pick(s.folders); if (f.obsScene) delete f.obsScene; else f.obsScene = true; }
        else if (op === 3) { if (s.obsScenes) delete s.obsScenes; else s.obsScenes = true; }
        else pick(s.cues).sourceId = pick(s.graphics).id;
      };
      // The record as the edit alone leaves it: what the separation then works on.
      const edited = structuredClone(before);
      mutate(edited);
      for (const key of Object.keys(show)) delete show[key];
      Object.assign(show, structuredClone(edited));
      const result = separateSceneGraphics(show, sceneSnapshot(before), d);
      assert.notEqual(typeof result, 'string');
      const where = `seed ${seed} step ${step} op ${op}`;
      const users = usersOf(show);
      if (show.obsScenes) {
        for (const [g, scenes] of users) if (g !== 'pics') assert.ok(scenes.size <= 1, `${where}: ${g} in ${[...scenes]}`);
      } else assert.deepEqual(show, edited, `${where}: switch off changes nothing`);
      // No graphic is ever removed, and names stay unique.
      for (const g of edited.graphics) assert.ok(show.graphics.some((x) => x.id === g.id), where);
      assert.equal(new Set(show.graphics.map((g) => g.name)).size, show.graphics.length, where);
      const editedUsers = usersOf(edited);
      for (const c of show.cues) {
        const was = edited.cues.find((x) => x.id === c.id);
        if (c.sourceId === was.sourceId) continue;
        // Only a scene cue moves, to a copy of what it had, made for this scene (C3, C5).
        const copy = show.graphics.find((g) => g.id === c.sourceId);
        assert.equal(copy.sceneCopyOf, was.sourceId, where);
        assert.ok(edited.obsScenes && show.folders.find((f) => f.id === c.folderId)?.obsScene, where);
        // C2: the scene that held the source before, if it still uses it, never loses it.
        assert.notEqual(was.sourceId, 'pics', `${where}: the own picture graphic is never copied`);
        const owner = [...users0].find(([g]) => g === was.sourceId)?.[1];
        const stillThere = owner && [...owner].find((s) => editedUsers.get(was.sourceId)?.has(s));
        if (stillThere && users0.get(was.sourceId).size === 1) assert.notEqual(c.folderId, stillThere, `${where}: the owner scene moved`);
      }
      // A new copy carries its source's bindings under its own name and a layer no one else has.
      for (const g of show.graphics.filter((x) => !edited.graphics.some((y) => y.id === x.id))) {
        const source = show.graphics.find((x) => x.id === g.sceneCopyOf);
        assert.ok(g.name.startsWith(`${source.name} · `), where);
        assert.deepEqual(show.bindings[g.name], show.bindings[source.name], where);
        assert.equal(show.graphics.filter((x) => x.layer === g.layer).length, 1, where);
      }
    }
  }
});

test('C3: the same write on the same record makes the same copy, so a rebased pass and two devices meet one copy', () => {
  const a = write(production(), (s) => s.cues.push(cue('g2', 'lt', 'game')));
  const b = write(production(), (s) => s.cues.push(cue('g2', 'lt', 'game')));
  assert.deepEqual(a, b);
  assert.match(copyId('lt', 'game'), /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.notEqual(copyId('lt', 'game'), copyId('lt', 'desk'));
  assert.notEqual(copyId('lt', 'game'), copyId('lt', 'game', 1));
});

test('C3, C6: a copy left behind is taken up again by its scene; one another scene now uses is not', () => {
  const show = write(production(), (s) => s.cues.push(cue('g2', 'lt', 'game')));
  write(show, (s) => { s.cues = s.cues.filter((c) => c.id !== 'g2'); });
  assert.equal(show.graphics.length, 3, 'the copy stays in the pool');
  write(show, (s) => s.cues.push(cue('g3', 'lt', 'game')));
  assert.equal(show.cues.find((c) => c.id === 'g3').sourceId, copyId('lt', 'game'));
  assert.equal(show.graphics.length, 3, 'no second copy');
  // The Gameplay copy's cue moves to Break: Break takes the copy along; a new Hairline cue in
  // Gameplay then needs a copy of its own, the next stable id.
  const moved = write(production(), (s) => s.cues.push(cue('g2', 'lt', 'game')));
  moved.folders.push(folder('break', 'Break'));
  write(moved, (s) => { s.cues.find((c) => c.id === 'g2').folderId = 'break'; });
  assert.equal(moved.cues.find((c) => c.id === 'g2').sourceId, copyId('lt', 'game'));
  write(moved, (s) => s.cues.push(cue('g4', 'lt', 'game')));
  assert.equal(moved.cues.find((c) => c.id === 'g4').sourceId, copyId('lt', 'game', 1));
});

test('C10, C11: a cue the guard holds stops the whole separation, and nothing changes', () => {
  const show = production();
  const before = sceneSnapshot(show);
  show.cues.push(cue('g2', 'lt', 'game'));
  const snapshot = JSON.stringify(show);
  const refused = separateSceneGraphics(show, before, deps((c) => (c.id === 'g2' ? 'Take "g2" off air first.' : null)));
  assert.equal(refused, 'Take "g2" off air first.');
  assert.equal(JSON.stringify(show), snapshot);
  // The guard is asked only about cues that would move: a cue staying with its graphic is not.
  const asked = [];
  write(production(), (s) => s.cues.push(cue('g2', 'lt', 'game')), deps((c) => (asked.push(c.id), null)));
  assert.deepEqual(asked, ['g2']);
});

test('C12: the production\'s own picture graphic is never copied; a library picture graphic is', () => {
  const show = production();
  show.graphics.push({ ...pool('pics', 'Pictures', 24), type: 'picture' }, { ...pool('libpic', 'Sponsor', 25), type: 'picture', graphicId: 'lib-sp' });
  write(show, (s) => s.cues.push(cue('dp', 'pics', 'desk'), cue('gp', 'pics', 'game'), cue('ds', 'libpic', 'desk'), cue('gs', 'libpic', 'game')));
  assert.equal(show.cues.find((c) => c.id === 'gp').sourceId, 'pics');
  assert.equal(show.cues.find((c) => c.id === 'gs').sourceId, copyId('libpic', 'game'));
});

test('re-adding a library graphic replaces the original, never a scene copy that shares its link', () => {
  const pool2 = [
    { name: 'Lower third · Gameplay', type: 'lowerThird', graphicId: 'lib-lt', sceneCopyOf: 'lt' },
    { name: 'Lower third', type: 'lowerThird', graphicId: 'lib-lt' },
  ];
  assert.equal(poolPlacement(pool2, { name: 'Lower third', type: 'lowerThird', graphicId: 'lib-lt' }).replace, 1);
});

test('C10: a held cue the write did not touch stays as it came, and the write lands; one it moved refuses it', () => {
  // A record that came shared (an older build, a sync): Desk and Gameplay both use the lower third.
  const shared = production();
  shared.obsScenes = undefined;
  shared.cues.push(cue('g2', 'lt', 'game'));
  shared.obsScenes = true;
  const onAir = deps((c) => (c.id === 'g2' ? 'held' : null));
  const before = sceneSnapshot(shared);
  shared.cues.find((c) => c.id === 'h1').label = 'renamed';
  assert.equal(separateSceneGraphics(shared, before, onAir), false, 'an unrelated edit lands');
  assert.equal(shared.cues.find((c) => c.id === 'g2').sourceId, 'lt');
  // Moving a held cue into a scene is the write's own doing: refused.
  const fresh = production();
  fresh.cues.push(cue('g2', 'lt'));
  const was = sceneSnapshot(fresh);
  fresh.cues.find((c) => c.id === 'g2').folderId = 'game';
  assert.equal(separateSceneGraphics(fresh, was, onAir), 'held');
});

test('C5: a copy left behind that a cue outside the scenes now uses is not taken up by a scene', () => {
  const show = write(production(), (s) => s.cues.push(cue('g2', 'lt', 'game')));
  // Its cue leaves the scenes, still on the copy.
  write(show, (s) => { delete s.cues.find((c) => c.id === 'g2').folderId; });
  write(show, (s) => s.cues.push(cue('g3', 'lt', 'game')));
  assert.equal(show.cues.find((c) => c.id === 'g2').sourceId, copyId('lt', 'game'));
  assert.equal(show.cues.find((c) => c.id === 'g3').sourceId, copyId('lt', 'game', 1));
});

test('C4: the copy takes the layer the record says is free', () => {
  const show = write(production(), (s) => s.cues.push(cue('g2', 'lt', 'game')), { freeLayer: () => 57 });
  assert.equal(show.graphics.find((g) => g.id === copyId('lt', 'game')).layer, 57);
});

test('re-adding a library graphic whose original is gone adds it again, and no scene copy is replaced', () => {
  const copies = [
    { name: 'Lower third · Desk', type: 'lowerThird', graphicId: 'lib-lt', sceneCopyOf: 'lt' },
    { name: 'Lower third · Gameplay', type: 'lowerThird', graphicId: 'lib-lt', sceneCopyOf: 'lt' },
  ];
  assert.deepEqual(poolPlacement(copies, { name: 'Lower third', type: 'lowerThird', graphicId: 'lib-lt' }), { replace: -1, name: 'Lower third', rename: null });
});
