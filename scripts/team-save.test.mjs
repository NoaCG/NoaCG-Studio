// guards: src/backend/teamProductions.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../src/backend/teamProductions.ts', import.meta.url), 'utf8');
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};

/** Execute the real save controller with a delayed disk and RPC, without an account/server. */
function harness() {
  const disk = deferred();
  const request = deferred();
  const requests = [];
  let local = { id: 'show', teamId: 'team', version: 2, name: 'First edit', graphics: [] };
  let retained = local;
  const stubs = {
    './supabase': { getSupabase: async () => ({ rpc: async (_name, args) => { requests.push(args); return request.promise; } }) },
    './teams': {},
    '../model/shows': {},
    '../model/teamShows': { loadTeamShows: () => [local] },
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
    export function seedForTest(doc: Show) {
      running = { userId: 'owner', stop: () => {} };
      server.set(doc.id, { token: 'base', doc, teamId: 'team', updatedBy: 'owner' });
      dirty.add(doc.id); setSaving(doc.id, 'pending');
    }
    export function editForTest(id: string) { scheduleSave(id); }
  `;
  const compiled = ts.transpileModule(source + setup, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, { exports, require: name => {
    assert.ok(name in stubs, `unexpected dependency: ${name}`);
    return stubs[name];
  }, setTimeout: () => 1, clearTimeout: () => {} });
  exports.seedForTest(local);
  return {
    controller: exports, disk, request, requests,
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

test('team flush refuses cloud confirmation when the browser-storage commit fails', async () => {
  const h = harness();
  const saving = h.controller.flushTeamProduction('show');
  h.disk.resolve('Browser storage is full.');
  assert.equal(await saving, 'Browser storage is full.');
  assert.equal(h.requests.length, 0);
  assert.equal(h.retained().name, 'First edit');
  assert.equal(h.controller.getTeamState().saving.show, 'failed');
});
