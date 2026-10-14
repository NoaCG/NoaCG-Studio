// guards: src/components/wizard/shell/doors.ts
//
// THE WIZARD'S FINISH DOORS (docs/work-specs/wizard-structure/spec.md section 3, phase S4).
// Every row of section 3.2, run through `makeDoors` with a scripted `io` that logs each call in
// order: what happens at the press, the writes in order, what a failure says and leaves, and
// where the reader lands. Each row is run with its durable write answering LATE (held until the
// test lets it go), FAILING, and seeing a SECOND PRESS while the first is still held.
//
// The appliers are the modes' own and stay in the shell; here each is a scripted stand-in in
// the shape of the real one: the catalog and AI appliers are async (Prettier runs first), the
// file applier is sync (byte-faithful). A door must treat the three alike.
//
//   node --test scripts/wizard-doors.test.mjs
import nodeTest from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadWizardModule as load } from './wizard-load.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { makeDoors } = await load(path.join(projectRoot, 'src/components/wizard/shell/doors.ts'));

// A door that waits on a write the test never lets go fails here rather than hanging the run.
const test = (name, fn) => nodeTest(name, { timeout: 5000 }, fn);

/** A promise the test resolves when it chooses: a durable write held in flight. */
const held = () => Promise.withResolvers();

/** Let every queued microtask and timer run, so a door that is not held has finished. */
const settle = () => new Promise((r) => setTimeout(r, 0));

const TEMPLATE = { name: 'Built', fields: [] };
const SHOW_WITH_LOOK = { id: 'show-1', name: 'Evening News', look: { palette: 'kept' } };
const SHOW_NO_LOOK = { id: 'show-2', name: 'Match Day' };

/**
 * A scripted studio. `log` records every call as one line, in order. Each write answers as the
 * scenario says: `save` (the library save), `create` and `pool` (the two durable commits),
 * `set` (the set save), as a value or as a held promise.
 */
function studio(script = {}) {
  const log = [];
  const alerts = [];
  const productions = [];
  let commits = 0;
  const answer = (v) => (typeof v === 'function' ? v() : v);
  const io = {
    saveBuiltGraphic: (name) => {
      log.push(`save ${name}`);
      return Promise.resolve(answer(script.save ?? { ok: true, error: null }));
    },
    noteMade: (name, production, landedOn = null) =>
      log.push(`noteMade ${name} ${production} ${landedOn ? landedOn.view : null}`),
    productionPress: { current: false },
    built: () => {
      log.push('built');
      return { template: TEMPLATE, graphicId: 'g-1' };
    },
    openExport: () => log.push('openExport'),
    openEditor: () => log.push('openEditor'),
    requestProductionExport: (id) => log.push(`requestProductionExport ${id}`),
    closeGallery: () => log.push('closeGallery'),
    navigate: (route) => log.push(`navigate ${route.view} ${route.id}`),
    replace: (route) => log.push(`replace ${route.view} ${route.id}`),
    raiseStorageAlert: (alert) => {
      log.push(`alert ${alert.action}`);
      alerts.push(alert);
    },
    publishGate: (template, production) => {
      log.push(`gate ${template.name} ${production}`);
      const refuse = script.refuse?.includes(template.name);
      return refuse ? { ok: false, errors: [{ message: `${template.name} is broken.` }] } : { ok: true, errors: [] };
    },
    loadShows: () => {
      log.push('loadShows');
      return script.shows ?? [SHOW_WITH_LOOK, SHOW_NO_LOOK];
    },
    createShowNamedChecked: (name) => {
      log.push(`createShow ${JSON.stringify(name)}`);
      const show = { id: `new-${productions.length + 1}`, name: name || 'Untitled production' };
      productions.push(show);
      return { show, error: script.createError ?? null };
    },
    commitDurableWrites: () => {
      commits += 1;
      const which = commits === 1 && script.createsFirst ? 'create' : 'pool';
      log.push(`commit ${which}`);
      return Promise.resolve(answer(script[which] ?? null));
    },
    addGraphicToShow: (showId, template, options) => {
      log.push(`pool ${showId} ${template.name} ${options.graphicId}`);
      return { error: script.poolError ?? null };
    },
    setShowLook: (id) => log.push(`setLook ${id}`),
    captureLookFromTemplate: (template) => {
      log.push(`captureLook ${template.name}`);
      return { from: template.name };
    },
    saveTemplateSetToProduction: (templates, fallbackName) => {
      log.push(`saveSet ${templates.map((t) => t.name).join('+')} ${fallbackName}`);
      return Promise.resolve(answer(script.set ?? { id: 'set-show', name: fallbackName }));
    },
    trackEvent: (event, detail) => log.push(`track ${event} ${detail}`),
    setSetBusy: (busy) => log.push(`busy ${busy}`),
    setSetError: (error) => log.push(`setError ${error}`),
  };
  return { io, log, alerts, productions, doors: makeDoors(io) };
}

/** The three appliers, in the shape of the shell's; each logs its build. */
function appliers(log) {
  return {
    catalog: async () => {
      log.push('apply catalog');
      await Promise.resolve();
      return TEMPLATE;
    },
    ai: async () => {
      log.push('apply ai');
      await Promise.resolve();
      return TEMPLATE;
    },
    file: () => {
      log.push('apply file');
      return TEMPLATE;
    },
  };
}
const MODES = ['catalog', 'ai', 'file'];
const NEW_PRODUCTION = { kind: 'new', name: 'Evening News' };
const name = () => 'Guest Strap';

// ── Add to the production (rows 1 to 3) ─────────────────────────────────────────────────────

test('production door, every mode: build, save, gate, create, pool, look, then land', async () => {
  for (const mode of MODES) {
    const s = studio({ createsFirst: true });
    await s.doors.addToProduction(appliers(s.log)[mode], NEW_PRODUCTION, name);
    assert.deepEqual(s.log, [
      `apply ${mode}`,
      'save Guest Strap',
      'built',
      'gate Built true',
      'createShow "Evening News"',
      'commit create',
      'pool new-1 Built g-1',
      'commit pool',
      'captureLook Built',
      'setLook new-1',
      'noteMade Guest Strap Evening News production',
      'closeGallery',
      'replace production new-1',
    ], mode);
    assert.equal(s.alerts.length, 0, mode);
    assert.equal(s.io.productionPress.current, false, `${mode}: the press is released`);
  }
});

test('production door into an existing production: looked up by id, its look kept', async () => {
  const s = studio();
  await s.doors.addToProduction(appliers(s.log).catalog, { kind: 'existing', id: 'show-1' }, name);
  assert.deepEqual(s.log.slice(4), [
    'loadShows',
    'pool show-1 Built g-1',
    'commit pool',
    'noteMade Guest Strap Evening News production',
    'closeGallery',
    'replace production show-1',
  ]);
  // A production with no look yet takes the graphic's.
  const t = studio();
  await t.doors.addToProduction(appliers(t.log).catalog, { kind: 'existing', id: 'show-2' }, name);
  assert.ok(t.log.indexOf('setLook show-2') > t.log.indexOf('commit pool'));
});

test('production door into a production deleted meanwhile: a new UNNAMED one, not the graphic\'s name', async () => {
  const s = studio({ shows: [], createsFirst: true });
  await s.doors.addToProduction(appliers(s.log).file, { kind: 'existing', id: 'gone' }, name);
  assert.deepEqual(s.log.slice(4, 8), ['loadShows', 'createShow ""', 'commit create', 'pool new-1 Built g-1']);
  assert.ok(s.log.includes('replace production new-1'));
});

test('production door, late: the library record lands first, and nothing moves until the rundown has', async () => {
  for (const mode of MODES) {
    const save = held();
    const pool = held();
    const s = studio({ save: () => save.promise, pool: () => pool.promise });
    const pressed = s.doors.addToProduction(appliers(s.log)[mode], { kind: 'existing', id: 'show-1' }, name);
    await settle();
    assert.deepEqual(s.log, [`apply ${mode}`, 'save Guest Strap'], `${mode}: held at the save`);
    save.resolve({ ok: true, error: null });
    await settle();
    assert.equal(s.log.at(-1), 'commit pool', `${mode}: held at the pool`);
    assert.ok(!s.log.includes('closeGallery') && !s.log.some((l) => l.startsWith('replace')), mode);
    assert.equal(s.io.productionPress.current, true, `${mode}: still pressed`);
    pool.resolve(null);
    await pressed;
    assert.deepEqual(s.log.slice(-3), ['noteMade Guest Strap Evening News production', 'closeGallery', 'replace production show-1']);
    assert.equal(s.io.productionPress.current, false, mode);
  }
});

test('production door, late production write: nothing is pooled and nobody moves until it has landed', async () => {
  for (const mode of MODES) {
    const create = held();
    const s = studio({ createsFirst: true, create: () => create.promise });
    const pressed = s.doors.addToProduction(appliers(s.log)[mode], NEW_PRODUCTION, name);
    await settle();
    assert.equal(s.log.at(-1), 'commit create', `${mode}: held at the production write`);
    assert.ok(!s.log.some((l) => /^(pool|closeGallery|replace)/.test(l)), mode);
    create.resolve(null);
    await pressed;
    assert.equal(s.log.at(-1), 'replace production new-1', mode);
  }
});

test('production door, failed save: said, nothing written, the reader stays, a retry works', async () => {
  for (const mode of MODES) {
    const s = studio({ save: { ok: false, error: 'QuotaExceededError' } });
    await s.doors.addToProduction(appliers(s.log)[mode], NEW_PRODUCTION, name);
    assert.deepEqual(s.log, [`apply ${mode}`, 'save Guest Strap', 'alert Adding “Guest Strap” to a production'], mode);
    assert.deepEqual(s.alerts[0], {
      action: 'Adding “Guest Strap” to a production',
      error: 'QuotaExceededError',
      outcome: 'Your graphic is still open in the wizard, unsaved. Free some room, then press “Add to the production” again.',
    });
    assert.equal(s.io.productionPress.current, false, `${mode}: released for the retry`);
  }
  // A failure with no message still says something.
  const t = studio({ save: { ok: false, error: null } });
  await t.doors.addToProduction(appliers(t.log).catalog, NEW_PRODUCTION, name);
  assert.equal(t.alerts[0].error, 'The graphic could not be saved.');
});

test('production door, refused by the publish gate: before any rundown write, the library record kept', async () => {
  const s = studio({ refuse: ['Built'] });
  await s.doors.addToProduction(appliers(s.log).ai, NEW_PRODUCTION, name);
  assert.deepEqual(s.log.slice(-2), ['gate Built true', 'alert Adding “Guest Strap” to a production']);
  assert.deepEqual(s.alerts[0], {
    action: 'Adding “Guest Strap” to a production',
    error: 'Built is broken.',
    outcome: 'The graphic is preserved in your library. Correct it before adding it to the rundown.',
  });
  assert.equal(s.productions.length, 0);
});

test('production door, failed production write or pool: the alert names the retry, the reader stays', async () => {
  for (const [script, action] of [
    [{ createsFirst: true, create: 'quota full' }, 'Creating the production “Evening News”'],
    [{ createError: 'quota full' }, 'Creating the production “Evening News”'],
    [{ createsFirst: true, pool: 'quota full' }, 'Adding “Guest Strap” to “Evening News”'],
    [{ poolError: 'quota full' }, 'Adding “Guest Strap” to “Evening News”'],
  ]) {
    const s = studio(script);
    await s.doors.addToProduction(appliers(s.log).catalog, NEW_PRODUCTION, name);
    const label = JSON.stringify(script);
    assert.equal(s.alerts.length, 1, label);
    assert.deepEqual(s.alerts[0], {
      action,
      error: 'quota full',
      outcome: '“Guest Strap” is saved in your library. Free some room, then press “Add to the production” again.',
    }, label);
    assert.equal(s.log.at(-1), `alert ${action}`, `${label}: nothing after the alert`);
    assert.ok(!s.log.some((l) => /^(noteMade|closeGallery|replace|setLook)/.test(l)), label);
    assert.equal(s.io.productionPress.current, false, label);
  }
  // A failed create stops before the pool.
  const s = studio({ createsFirst: true, create: 'quota full' });
  await s.doors.addToProduction(appliers(s.log).catalog, NEW_PRODUCTION, name);
  assert.ok(!s.log.some((l) => l.startsWith('pool')));
});

test('production door, second press while the first is held: one build, one production (R7)', async () => {
  for (const mode of MODES) {
    const save = held();
    const s = studio({ save: () => save.promise, createsFirst: true });
    const apply = appliers(s.log)[mode];
    const first = s.doors.addToProduction(apply, NEW_PRODUCTION, name);
    await settle();
    const second = s.doors.addToProduction(apply, NEW_PRODUCTION, name);
    await settle();
    assert.equal(s.log.filter((l) => l.startsWith('apply')).length, 1, `${mode}: one build`);
    save.resolve({ ok: true, error: null });
    await Promise.all([first, second]);
    assert.equal(s.productions.length, 1, `${mode}: one production`);
    assert.equal(s.log.filter((l) => l.startsWith('pool')).length, 1, mode);
    // Released by the landing: a later press is a press again.
    await s.doors.addToProduction(apply, NEW_PRODUCTION, name);
    assert.equal(s.productions.length, 2, `${mode}: the press after the landing counts`);
  }
});

test('production door with nothing to build: no write, and the press is released', async () => {
  const s = studio();
  await s.doors.addToProduction(() => null, NEW_PRODUCTION, name);
  await s.doors.addToProduction(async () => null, NEW_PRODUCTION, name);
  assert.deepEqual(s.log, []);
  assert.equal(s.io.productionPress.current, false);
});

// ── Export (rows 4 to 6) ────────────────────────────────────────────────────────────────────

test('export door, every mode: build, save, note, then the window over the wizard; nobody moves', async () => {
  for (const mode of MODES) {
    const s = studio();
    await s.doors.export(appliers(s.log)[mode], name);
    assert.deepEqual(s.log, [`apply ${mode}`, 'save Guest Strap', 'noteMade Guest Strap null null', 'openExport'], mode);
  }
});

test('export door, late: the window opens only once the save has answered', async () => {
  for (const mode of MODES) {
    const save = held();
    const s = studio({ save: () => save.promise });
    const pressed = s.doors.export(appliers(s.log)[mode], name);
    await settle();
    assert.deepEqual(s.log, [`apply ${mode}`, 'save Guest Strap'], mode);
    save.resolve({ ok: true, error: null });
    await pressed;
    assert.equal(s.log.at(-1), 'openExport', mode);
  }
});

test('export door, failed save: said, nothing noted, and the window opens anyway over the unsaved graphic', async () => {
  for (const mode of MODES) {
    const s = studio({ save: { ok: false, error: 'QuotaExceededError' } });
    await s.doors.export(appliers(s.log)[mode], name);
    assert.deepEqual(s.log, [`apply ${mode}`, 'save Guest Strap', 'alert Saving “Guest Strap”', 'openExport'], mode);
    assert.deepEqual(s.alerts[0], {
      action: 'Saving “Guest Strap”',
      error: 'QuotaExceededError',
      outcome: 'It is still open in the wizard, unsaved. You can export it without saving, or free some room and press Export it again.',
    });
  }
  const t = studio({ save: { ok: false, error: null } });
  await t.doors.export(appliers(t.log).file, name);
  assert.equal(t.alerts[0].error, 'The graphic could not be saved.');
});

test('export door, second press while the save is held: today it builds and saves again (no press guard)', async () => {
  // Recorded as today's behaviour (spec R7): S1c gave the production door its guard; a second
  // export saves through the same name, and `saveBuiltGraphic` writes over the record the first
  // press made once it has made it.
  for (const mode of MODES) {
    const save = held();
    const s = studio({ save: () => save.promise });
    const apply = appliers(s.log)[mode];
    const first = s.doors.export(apply, name);
    const second = s.doors.export(apply, name);
    await settle();
    assert.equal(s.log.filter((l) => l.startsWith('save')).length, 2, mode);
    save.resolve({ ok: true, error: null });
    await Promise.all([first, second]);
    assert.equal(s.log.filter((l) => l === 'openExport').length, 2, mode);
  }
});

test('export door with nothing to build: nothing saved, no window', async () => {
  const s = studio();
  await s.doors.export(async () => null, name);
  assert.deepEqual(s.log, []);
});

// ── Edit this graphic (row 7) ───────────────────────────────────────────────────────────────

test('editor door, catalog and file: build, note where it landed, open the editor, close; no save', async () => {
  for (const mode of ['catalog', 'file']) {
    const s = studio();
    await s.doors.editArtwork(appliers(s.log)[mode]);
    assert.deepEqual(s.log, [`apply ${mode}`, 'noteMade Built null editor-foundation', 'openEditor', 'closeGallery'], mode);
  }
});

test('editor door, late build: nothing moves before the build; no build: nothing at all', async () => {
  const build = held();
  const s = studio();
  const pressed = s.doors.editArtwork(() => build.promise);
  await settle();
  assert.deepEqual(s.log, []);
  build.resolve(TEMPLATE);
  await pressed;
  assert.deepEqual(s.log, ['noteMade Built null editor-foundation', 'openEditor', 'closeGallery']);
  const t = studio();
  await t.doors.editArtwork(() => null);
  assert.deepEqual(t.log, []);
});

test('editor door, second press: each press builds (it writes nothing to guard)', async () => {
  const s = studio();
  const apply = appliers(s.log).catalog;
  await Promise.all([s.doors.editArtwork(apply), s.doors.editArtwork(apply)]);
  assert.equal(s.log.filter((l) => l === 'openEditor').length, 2);
  assert.ok(!s.log.some((l) => l.startsWith('save')));
});

// ── The set doors: kit production and export (row 8), the AI package (row 9) ────────────────

const SET = [{ name: 'Lower third' }, { name: 'Scoreboard' }];
const DEST = { kind: 'new', name: 'Derby' };

test('set doors: every member gated, then the set saved, then the production page', async () => {
  for (const activation of ['kit', 'pro']) {
    const s = studio();
    const save = (dest) => s.doors.saveSet(SET, 'Derby', dest, activation);
    await s.doors.openSet(save, DEST);
    assert.deepEqual(s.log, [
      'busy true',
      'setError null',
      'gate Lower third true',
      'gate Scoreboard true',
      'saveSet Lower third+Scoreboard Derby',
      `track activation ${activation}`,
      'busy false',
      'closeGallery',
      'navigate production set-show',
    ], activation);
    const t = studio();
    await t.doors.exportSet((dest) => t.doors.saveSet(SET, 'Derby', dest, activation), DEST);
    assert.deepEqual(t.log.slice(-3), ['requestProductionExport set-show', 'closeGallery', 'navigate production set-show'], activation);
  }
});

test('set doors, one member refused: nothing written, the error says which, the wizard stays', async () => {
  for (const door of ['openSet', 'exportSet']) {
    const s = studio({ refuse: ['Scoreboard'] });
    await s.doors[door]((dest) => s.doors.saveSet(SET, 'Derby', dest, 'kit'), DEST);
    assert.ok(!s.log.some((l) => l.startsWith('saveSet')), door);
    assert.deepEqual(s.log.slice(-2), [
      'setError "Scoreboard" failed validation: Scoreboard is broken.. Fix the graphic before adding this set to a production.',
      'busy false',
    ], door);
  }
});

test('set doors, late: busy from the press until the write answers, nobody moves before it', async () => {
  for (const door of ['openSet', 'exportSet']) {
    const write = held();
    const s = studio({ set: () => write.promise });
    const pressed = s.doors[door]((dest) => s.doors.saveSet(SET, 'Derby', dest, 'kit'), DEST);
    // Busy is raised in the press itself: it is what disables both set doors on the Finish step.
    assert.equal(s.log[0], 'busy true', door);
    await settle();
    assert.ok(!s.log.includes('busy false') && !s.log.includes('closeGallery'), door);
    write.resolve({ id: 'late-show', name: 'Derby' });
    await pressed;
    assert.equal(s.log.at(-1), 'navigate production late-show', door);
    assert.ok(s.log.indexOf('busy false') < s.log.indexOf('closeGallery'), door);
  }
});

test('set doors, failed write: the error line carries it, busy ends, the wizard stays', async () => {
  for (const door of ['openSet', 'exportSet']) {
    const s = studio({ set: () => Promise.reject(new Error('quota full')) });
    await s.doors[door]((dest) => s.doors.saveSet(SET, 'Derby', dest, 'pro'), DEST);
    assert.deepEqual(s.log.slice(-2), ['setError quota full', 'busy false'], door);
    assert.ok(!s.log.some((l) => /^(track|closeGallery|navigate|requestProductionExport)/.test(l)), door);
    const t = studio({ set: () => Promise.reject('not an Error') });
    await t.doors[door]((dest) => t.doors.saveSet(SET, 'Derby', dest, 'kit'), DEST);
    assert.ok(t.log.includes('setError not an Error'), door);
  }
});

test('set doors, second press while held: busy is already up, which is the guard (R7)', async () => {
  // The Finish step's set buttons are disabled while busy (`KitFinishStep`, `disabled={busy}`),
  // and busy is up from the first press until its write answers. The door itself does not
  // refuse a call that bypassed the button: recorded as today's behaviour, not endorsed.
  for (const door of ['openSet', 'exportSet']) {
    const write = held();
    const s = studio({ set: () => write.promise });
    const save = (dest) => s.doors.saveSet(SET, 'Derby', dest, 'kit');
    const first = s.doors[door](save, DEST);
    await settle();
    assert.equal(s.log.lastIndexOf('busy true') > s.log.lastIndexOf('busy false'), true, `${door}: busy at the second press`);
    const second = s.doors[door](save, DEST);
    await settle();
    assert.equal(s.log.filter((l) => l.startsWith('saveSet')).length, 2, door);
    write.resolve({ id: 'set-show', name: 'Derby' });
    await Promise.all([first, second]);
    assert.equal(s.log.at(-1), 'navigate production set-show', door);
  }
});

test('set doors with nothing to save: no busy, no write, nobody moves', async () => {
  const s = studio();
  await s.doors.openSet((dest) => s.doors.saveSet([], 'Derby', dest, 'kit'), DEST);
  await s.doors.exportSet(async () => null, DEST);
  assert.deepEqual(s.log, []);
});
