// guards: src/backend/teamProductions.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as history from '../src/model/rundownHistory.ts';

const source = readFileSync(new URL('../src/backend/teamProductions.ts', import.meta.url), 'utf8');
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};

/** Execute the real save controller with a delayed disk and RPC, without an account/server. */
function harness(pending = true) {
  const disk = deferred();
  const request = deferred();
  const requests = [];
  const answers = [];
  let local = { id: 'show', teamId: 'team', version: 2, name: 'First edit', graphics: [] };
  let retained = local;
  const stubs = {
    './supabase': { getSupabase: async () => ({ rpc: async (_name, args) => { requests.push(args); return answers.length ? answers.shift() : request.promise; } }) },
    './teams': {},
    '../model/shows': {},
    '../model/teamShows': { loadTeamShows: () => [local], applyServerTeamShow: doc => { local = doc; } },
    '../model/rundownHistory': history,
    '../model/teamShowMerge': {},
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
