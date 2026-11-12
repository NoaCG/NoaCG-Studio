// guards: src/backend/teamProductions.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as history from '../src/model/rundownHistory.ts';
import { rolldown } from 'rolldown';
import * as pacing from '../src/backend/pacing.ts';
import * as copySettle from '../src/model/copySettle.ts';

const bundle = await rolldown({ input: 'src/backend/assets.ts', platform: 'neutral', logLevel: 'silent' });
const { output } = await bundle.generate({ format: 'esm', codeSplitting: false });
await bundle.close();
const assets = await import(`data:text/javascript;base64,${Buffer.from(output[0].code).toString('base64')}`);

const source = readFileSync(new URL('../src/backend/teamProductions.ts', import.meta.url), 'utf8');
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};

/** Execute the real save controller with a delayed disk and RPC, without an account/server. */
function harness(pending = true, graphics = [], storage = undefined, settle = { settleGraphics: (graphics) => ({ graphics, changed: false }) }) {
  const disk = deferred();
  const request = deferred();
  const requests = [];
  const answers = [];
  let local = { id: 'show', teamId: 'team', version: 2, name: 'First edit', graphics };
  let retained = local;
  const stubs = {
    './supabase': { getSupabase: async () => ({ storage, rpc: async (_name, args) => { requests.push(args); return answers.length ? answers.shift() : request.promise; } }) },
    './teams': {},
    './assets': assets,
    './pacing': pacing,
    '../model/shows': {},
    '../model/teamShows': { loadTeamShows: () => [local], applyServerTeamShow: doc => { local = doc; } },
    '../model/rundownHistory': history,
    '../model/teamShowMerge': {},
    // The send-time settle (live-publishing W2) is copy-settle.test.mjs's; nothing here differs in design.
    '../model/copySettle': settle,
    '../model/durableStore': { canAuthorAccount: () => true, libraryInUse: () => 'owner', commitDurableWrites: () => disk.promise },
    '../model/teamOutbox': {
      retainTeamEdit: (_owner, _id, edit) => { retained = edit.local; },
      acknowledgeTeamEdit: (_owner, _id, sent) => { if (JSON.stringify(retained) === JSON.stringify(sent)) retained = null; },
    },
  };
  // Only seed the controller's existing revision and announce real edits. No save implementation
  // is duplicated here: flushTeamProduction/pushSave are the production module's own functions.
  const setup = `
    export function seedForTest(doc: Show, pending: boolean) {
      running = { userId: 'owner', stop: () => {} };
      server.set(doc.id, { token: 'base', doc, teamId: 'team', updatedBy: 'owner' });
      if (pending) { dirty.add(doc.id); setSaving(doc.id, 'pending'); }
    }
    export function editForTest(id: string) { scheduleSave(id); }
    export function seedBaseForTest(doc: Show) { server.set(doc.id, { token: 'base', doc, teamId: 'team', updatedBy: 'owner' }); }
    export function pacingForTest() { return { readFailures, readsResumeAt, saveFailures, savesResumeAt }; }
    export function noteReadForTest(failed: boolean) { noteRead(failed); }
    export function noteSaveForTest(failed: boolean) { noteSave(failed); }
  `;
  const compiled = ts.transpileModule(source + setup, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, { exports, require: name => {
    assert.ok(name in stubs, `unexpected dependency: ${name}`);
    return stubs[name];
  }, setTimeout: () => 1, clearTimeout: () => {} });
  exports.seedForTest(local, pending);
  return {
    controller: exports, disk, request, requests, answers,
    local: () => local,
    edit(name) { local = { ...local, name }; exports.editForTest(local.id); },
    retained: () => retained,
  };
}

test('team flush includes an edit made while its browser-storage commit was pending', async () => {
  const h = harness();
  const saving = h.controller.flushTeamProduction('show');
  h.edit('Newest edit');
  h.disk.resolve(null);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].p_doc.name, 'Newest edit');
  h.request.resolve({ data: { saved: true, updated_at: 'confirmed', updated_by: 'owner' }, error: null });
  assert.equal(await saving, null);
  assert.equal(h.retained(), null);
  assert.equal(h.controller.getTeamState().saving.show, undefined);
});

test('per-edit receipt requires an advanced revision and the exact intended rundown', async () => {
  const h = harness();
  const receipt = h.controller.beginTeamRundownEdit('show');
  const intended = history.rundownSlice(h.local());
  const saved = h.controller.commitTeamRundownEdit(receipt, intended);
  h.disk.resolve(null);
  await new Promise(resolve => setImmediate(resolve));
  h.request.resolve({ data: { saved: true, updated_at: 'confirmed' }, error: null });
  assert.equal(await saved, null);
  const wrong = { ...intended, graphics: [{ id: 'other' }] };
  assert.equal(await h.controller.commitTeamRundownEdit(receipt, wrong), history.RUNDOWN_CHANGED);
  assert.match(await h.controller.commitTeamRundownEdit(h.controller.beginTeamRundownEdit('show'), intended), /not been confirmed/);
});

test('strict inverse adopts a conflicting teammate rundown without merging or overwriting it', async () => {
  const h = harness(false), expected = history.rundownSlice(h.local());
  const theirs = { ...h.local(), graphics: [{ id: 'new', name: 'Teammate graphic' }] };
  h.answers.push({ data: { saved: false, updated_at: 'teammate', doc: theirs }, error: null });
  const result = await h.controller.restoreTeamRundown('show', expected, expected, () => true);
  assert.equal(result.status, 'refused'); assert.equal(result.error, history.RUNDOWN_CHANGED);
  assert.equal(h.requests.length, 1); assert.deepEqual(h.local().graphics, theirs.graphics);
});

test('strict inverse retries metadata-only conflict once and preserves newer metadata', async () => {
  const h = harness(false), expected = history.rundownSlice(h.local());
  h.answers.push(
    { data: { saved: false, updated_at: 'metadata', doc: { ...h.local(), name: 'Teammate renamed', data: { score: 9 } } }, error: null },
    { data: { saved: true, updated_at: 'inverse' }, error: null },
  );
  const result = await h.controller.restoreTeamRundown('show', expected, expected, () => true);
  assert.equal(result.status, 'saved'); assert.equal(h.requests.length, 2);
  assert.equal(h.requests[1].p_expected, 'metadata'); assert.equal(h.local().name, 'Teammate renamed'); assert.deepEqual(h.local().data, { score: 9 });
});

test('network/permission failure leaves the expected data and allows a checked retry', async () => {
  const h = harness(false), expected = history.rundownSlice(h.local());
  h.answers.push({ data: null, error: { message: 'permission denied' } });
  const result = await h.controller.restoreTeamRundown('show', expected, expected, () => true);
  assert.equal(result.status, 'failed'); assert.equal(result.error, 'permission denied');
  assert.equal(history.sameRundown(history.rundownSlice(h.local()), expected), true);
  h.answers.push({ data: { saved: true, updated_at: 'retry' }, error: null });
  assert.equal((await h.controller.restoreTeamRundown('show', expected, expected, () => true)).status, 'saved');
});

test('inverse refuses pending writes and never adopts over a newer local edit during RPC', async () => {
  const waiting = harness(), expected = history.rundownSlice(waiting.local());
  assert.equal((await waiting.controller.restoreTeamRundown('show', expected, expected, () => true)).status, 'refused');
  assert.equal(waiting.requests.length, 0);
  const h = harness(false), saving = h.controller.restoreTeamRundown('show', expected, expected, () => true);
  await new Promise(resolve => setImmediate(resolve)); h.edit('Newer local edit');
  h.request.resolve({ data: { saved: true, updated_at: 'inverse' }, error: null });
  assert.equal((await saving).status, 'refused'); assert.equal(h.local().name, 'Newer local edit'); assert.equal(h.retained().name, 'Newer local edit');
  assert.equal(h.controller.beginTeamRundownEdit('show').token, 'base', 'newer work must still conflict and merge against its original base');
});

test('a malformed or newer-format conflict cannot erase the current team document', async () => {
  for (const doc of [null, { version: 3, graphics: [] }]) {
    const h = harness(false), expected = history.rundownSlice(h.local());
    h.answers.push({ data: { saved: false, updated_at: 'unknown', doc }, error: null });
    assert.equal((await h.controller.restoreTeamRundown('show', expected, expected, () => true)).status, 'failed');
    assert.equal(h.local().name, 'First edit');
  }
});

test('team flush refuses cloud confirmation when the browser-storage commit fails', async () => {
  const h = harness();
  const saving = h.controller.flushTeamProduction('show');
  h.disk.resolve('Browser storage is full.');
  assert.equal(await saving, 'Browser storage is full.');
  assert.equal(h.requests.length, 0);
  assert.equal(h.retained().name, 'First edit');
  assert.equal(h.controller.getTeamState().saving.show, 'failed');
});

test('a reference outside this team\'s folder is never downloaded with the reader\'s rights', async () => {
  const private_ = `${assets.STORAGE_SENTINEL}reader-uid/abcd1234`;
  const graphic = data => [{ id: 'g', template: { assets: [{ path: 'a.png', data }] } }];
  const h = harness(false, [], {
    from: () => ({
      upload: async () => ({ error: null }),
      download: async () => { throw new Error('must not read outside the team folder'); },
    }),
  });
  h.answers.push(
    { data: { saved: false, updated_at: 'teammate', doc: { ...h.local(), graphics: graphic(private_) } }, error: null },
    { data: { saved: true, updated_at: 'inverse' }, error: null },
  );
  const expected = history.rundownSlice(h.local());
  await h.controller.restoreTeamRundown('show', expected, expected, () => true);
  assert.equal(h.local().graphics[0].template.assets[0].data, private_);
});

test('a failed save waits longer each time, and one success returns to the normal rate', async () => {
  const h = harness();
  h.answers.push({ data: null, error: { message: 'canceling statement due to statement timeout' } });
  const failing = h.controller.flushTeamProduction('show');
  h.disk.resolve(null);
  await failing;
  const first = h.controller.pacingForTest();
  assert.equal(first.saveFailures, 1);
  assert.ok(first.savesResumeAt > Date.now(), 'the next save must wait');
  assert.equal(h.controller.getTeamState().saving.show, 'failed');
  h.controller.noteSaveForTest(true);
  assert.equal(h.controller.pacingForTest().saveFailures, 2);
  h.controller.noteSaveForTest(false);
  assert.equal(h.controller.pacingForTest().saveFailures, 0);
  assert.equal(h.controller.pacingForTest().savesResumeAt, 0);
});

test('failed reads push the poll back, and one good read restores it', () => {
  const h = harness(false);
  h.controller.noteReadForTest(true);
  const once = h.controller.pacingForTest().readsResumeAt;
  h.controller.noteReadForTest(true);
  h.controller.noteReadForTest(true);
  assert.ok(h.controller.pacingForTest().readsResumeAt > once + 15_000, 'three failures wait longer than one');
  h.controller.noteReadForTest(false);
  assert.equal(h.controller.pacingForTest().readsResumeAt, 0);
  assert.equal(h.controller.pacingForTest().readFailures, 0);
});

test('a save sends references, and a teammate\'s refused document comes back with its files', async () => {
  const uploads = [];
  const png = 'data:image/png;base64,QUJD';
  const key = assets.sharedAssetKey('team/team', png);
  const reference = assets.STORAGE_SENTINEL + key;
  const graphic = data => [{ id: 'g', template: { assets: [{ path: 'a.png', data }] } }];
  const h = harness(false, graphic(png), {
    from: () => ({
      upload: async (uploaded) => { uploads.push(uploaded); return { error: null }; },
      download: async () => { throw new Error('this tab already holds the file'); },
    }),
  });
  h.answers.push(
    { data: { saved: false, updated_at: 'teammate', doc: { ...h.local(), name: 'Theirs', graphics: graphic(reference) } }, error: null },
    { data: { saved: true, updated_at: 'inverse' }, error: null },
  );
  const expected = history.rundownSlice(h.local());
  assert.equal((await h.controller.restoreTeamRundown('show', expected, expected, () => true)).status, 'saved');
  assert.deepEqual(uploads, [key], 'bytes go up once, whatever the number of saves');
  for (const sent of h.requests) assert.equal(sent.p_doc.graphics[0].template.assets[0].data, reference);
  assert.equal(h.local().graphics[0].template.assets[0].data, png, 'the tab keeps real bytes');
  assert.equal(h.local().name, 'Theirs');
});

// live-publishing W2 (designs/G1.md section 3, R4): the save settles the record against the server's
// copy it started from before it sends, and the tab and its retained edit hold what was sent.
test('a team save drops a design an older page pulled from the library, before the first attempt', async () => {
  const tpl = (html) => ({ name: 'Strap', html, css: '', js: '', assets: [], fields: [] });
  const base = { id: 'g1', name: 'Strap', type: 'lower-third', savedAt: '2026-11-01T00:00:00.000Z', designAt: '2026-11-01T00:00:00.000Z', template: tpl('<p>base</p>'), layer: 20 };
  const pulled = { ...base, template: tpl('<p>pulled</p>'), savedAt: '2026-11-02T00:00:00.000Z', designAt: '2026-11-01T00:00:00.000Z', layer: 31 };
  const h = harness(true, [pulled], undefined, copySettle);
  h.controller.seedBaseForTest({ id: 'show', teamId: 'team', version: 2, name: 'First edit', graphics: [base] });
  const saving = h.controller.flushTeamProduction('show');
  h.disk.resolve(null);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.requests.length, 1);
  const sent = h.requests[0].p_doc.graphics[0];
  assert.equal(sent.template.html, '<p>base</p>', 'the pulled design never goes up');
  assert.equal(sent.layer, 31, 'the placement edit beside it does');
  assert.equal(h.local().graphics[0].template.html, '<p>base</p>', 'the tab shows what was sent');
  assert.equal(h.retained().graphics[0].template.html, '<p>base</p>', 'the retained edit is the settled one');
  h.request.resolve({ data: { saved: true, updated_at: 'confirmed', updated_by: 'owner' }, error: null });
  assert.equal(await saving, null);
  assert.equal(h.retained(), null);
});

// A publish or export stops when its flush failed before settling (storage refused): the record still
// owes the settle, and teamSettleOwed says so. Once settled, or with nothing pulled, nothing is owed.
test('a flush that storage refused leaves the settle owed, so a team publish stops on it', async () => {
  const tpl = (html) => ({ name: 'Strap', html, css: '', js: '', assets: [], fields: [] });
  const base = { id: 'g1', name: 'Strap', type: 'lower-third', savedAt: '2026-11-01T00:00:00.000Z', designAt: '2026-11-01T00:00:00.000Z', template: tpl('<p>base</p>'), layer: 20 };
  const pulled = { ...base, template: tpl('<p>pulled</p>'), savedAt: '2026-11-02T00:00:00.000Z', designAt: '2026-11-01T00:00:00.000Z' };
  const h = harness(true, [pulled], undefined, copySettle);
  h.controller.seedBaseForTest({ id: 'show', teamId: 'team', version: 2, name: 'First edit', graphics: [base] });
  assert.equal(h.controller.teamSettleOwed('show'), true);
  const saving = h.controller.flushTeamProduction('show');
  h.disk.resolve('Browser storage is full.');
  assert.equal(await saving, 'Browser storage is full.');
  assert.equal(h.requests.length, 0);
  assert.equal(h.controller.teamSettleOwed('show'), true, 'the failed flush did not settle');

  const clean = harness(true, [base], undefined, copySettle);
  clean.controller.seedBaseForTest({ id: 'show', teamId: 'team', version: 2, name: 'First edit', graphics: [base] });
  assert.equal(clean.controller.teamSettleOwed('show'), false, 'nothing pulled, nothing owed');
});
