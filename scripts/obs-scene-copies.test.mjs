// guards: src/model/obsScenes.ts
//
// OBS SCENES, ONE GRAPHIC PER SCENE (docs/work-specs/obs-scenes/spec.md OS1b, C1 to C6): a graphic
// added to a second scene becomes that scene's own named copy, with the same bindings and its own
// placement, made inside the write that added it. The fixed cases pin the names and members; the
// walk checks random edits against an oracle written from the Rules, never from the algorithm.

import test from 'node:test';
import assert from 'node:assert/strict';
import './lib/tsResolve.mjs';

const { obsScenesOf, sceneOwners, separateSceneGraphics, sceneGraphicNames } = await import('../src/model/obsScenes.ts');

const pool = (id, name, layer, extra = {}) => ({ id, name, type: 'lowerThird', savedAt: 't0', template: { name, fields: [] }, layer, ...extra });
const cue = (id, sourceId, folderId) => ({ id, sourceId, label: id, values: { f0: id }, ...(folderId ? { folderId } : {}) });
const folder = (id, name, scene = true) => ({ id, name, mode: 'manual', ...(scene ? { obsScene: true } : {}) });

function deps() {
  let n = 0;
  return { mint: () => `copy${++n}`, freeLayer: (graphics) => Math.max(19, ...graphics.map((g) => g.layer ?? 20)) + 1 };
}

/** One write as shows.ts patchShowChecked runs it: owners read before, separation after. */
function write(show, mutate, d = deps()) {
  const before = sceneOwners(show);
  mutate(show);
  separateSceneGraphics(show, before, d);
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
  const copy = show.graphics.find((g) => g.id === 'copy1');
  assert.equal(copy.name, 'Lower third · Gameplay');
  assert.equal(copy.template.name, 'Lower third · Gameplay');
  assert.equal(copy.sceneCopyOf, 'lt');
  assert.deepEqual([copy.adjust, copy.soundConfig, copy.graphicId, copy.type], [{ v: 1, x: 10 }, { in: 's' }, 'lib-lt', 'lowerThird']);
  assert.equal(copy.layer, 22, 'the next free layer: it never replaces another graphic on air');
  assert.deepEqual(show.bindings['Lower third · Gameplay'], { name: 'player.name' }, 'same bindings, under its own name');
  assert.deepEqual(show.profile.arrange['Lower third · Gameplay'], { show: { name: 'Show' } });
  assert.deepEqual(show.graphics.map((g) => g.id), ['lt', 'copy1', 'bug'], 'placed after its source');
  assert.equal(show.cues.find((c) => c.id === 'g2').sourceId, 'copy1');
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
  assert.equal(show.graphics.find((g) => g.id === 'copy1').name, 'Lower third · Gameplay 2');
  // Later, in another write: the scene's copy is found again (C3).
  write(show, (s) => s.cues.push(cue('g3', 'lt', 'game')));
  assert.equal(show.cues.find((c) => c.id === 'g3').sourceId, 'copy1');
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
  assert.equal(show.cues.find((c) => c.id === 'g0').sourceId, 'copy1');
  assert.equal(show.graphics.find((g) => g.id === 'copy1').name, 'Bug · Plain');
  // Turning the switch on finds two scenes sharing a graphic, with no owner before: the first keeps it.
  const off = production();
  off.obsScenes = undefined;
  off.cues.push(cue('g2', 'lt', 'game'));
  write(off, (s) => { s.obsScenes = true; });
  assert.equal(off.cues.find((c) => c.id === 'd1').sourceId, 'lt');
  assert.equal(off.cues.find((c) => c.id === 'g2').sourceId, 'copy1');
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
  assert.equal(on.cues.find((c) => c.id === 'g2').sourceId, 'copy1');
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
      Object.assign(show, structuredClone(edited));
      separateSceneGraphics(show, sceneOwners(before), d);
      const where = `seed ${seed} step ${step} op ${op}`;
      const users = usersOf(show);
      if (show.obsScenes) for (const [g, scenes] of users) assert.ok(scenes.size <= 1, `${where}: ${g} in ${[...scenes]}`);
      else assert.deepEqual(show, edited, `${where}: switch off changes nothing`);
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
