// guards: src/backend/sync.ts, src/model/copySettle.ts
//
// A PERSONAL PRODUCTION IS SETTLED BEFORE IT GOES UP (live-publishing W2, designs/G1.md section 3,
// R4). A record holding a copy no copy-truth build stamped is checked against the cloud's record
// first: a design an older page pulled from the library is dropped, the settled record is written on
// this device as a new revision, and that is what is pushed. A losing edit is settled the same way
// before its "(conflicted copy)" is made. A base that cannot be read keeps the record here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const settle = await import('../src/model/copySettle.ts');

function loadSync() {
  const exports = {};
  const compiled = ts.transpileModule(readFileSync(new URL('../src/backend/sync.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const store = new Map();
  const stubs = {
    './assets': { hasStorageSentinel: () => false },
    './storage': { isPutDenied: () => false, isSingleton: (kind) => kind === 'brand' || kind === 'project' },
    '../model/id': { uuid: () => crypto.randomUUID() },
    '../model/accountScope': { accountKey: (key) => `${key}@owner` },
    '../model/copySettle': settle,
  };
  vm.runInNewContext(compiled, {
    exports,
    require: (name) => {
      assert.ok(name in stubs, `unexpected dependency: ${name}`);
      return stubs[name];
    },
    localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) },
    Date,
    JSON,
  });
  return { ...exports, meta: store };
}

const T0 = '2026-11-01T10:00:00.000Z';
const T1 = '2026-11-02T10:00:00.000Z';
const T2 = '2026-11-03T10:00:00.000Z';
const tpl = (html) => ({ name: 'Strap', html, css: '', js: '', assets: [], fields: [] });
const graphic = (over = {}) => ({ id: 'g1', name: 'Strap', type: 'lower-third', savedAt: T0, template: tpl('<p>base</p>'), graphicId: 'lib-1', layer: 20, ...over });
const production = (updatedAt, graphics, extra = {}) => ({
  kind: 'show', id: 'p1', updatedAt, deleted: false, body: { id: 'p1', name: 'P', version: 2, updatedAt, graphics, cues: [], ...extra },
});

function side(records = [], { failGet = false } = {}) {
  const rows = new Map(records.map((r) => [r.id, r]));
  return {
    rows,
    gets: 0,
    async list(kind) { return [...rows.values()].filter((r) => r.kind === kind); },
    async getMany(kind, ids) { return ids.map((id) => rows.get(id)).filter(Boolean); },
    async get(kind, id) { this.gets += 1; if (failGet) throw new Error('did not answer'); return rows.get(id) ?? null; },
    async put(record) { rows.set(record.id, record); },
    async putMany(records) { for (const r of records) rows.set(r.id, r); },
  };
}

test('a pulled design is dropped before the push, on this device too; a layer edit beside it goes up', async () => {
  const { runSync } = loadSync();
  const remote = side([production(T0, [graphic()])]);
  const local = side([production(T0, [graphic()])]);
  await runSync(local, remote);
  // An older page's publish copied a library design in and moved the layer, then could not push.
  local.rows.set('p1', production(T2, [graphic({ template: tpl('<p>pulled</p>'), savedAt: T1, layer: 31 })]));
  const result = await runSync(local, remote);
  assert.equal(result.pushed, 1);
  const pushed = remote.rows.get('p1');
  assert.equal(pushed.body.graphics[0].template.html, '<p>base</p>');
  assert.equal(pushed.body.graphics[0].layer, 31);
  assert.deepEqual(local.rows.get('p1'), pushed, 'this device holds what went up');
  assert.ok(pushed.updatedAt > T2, 'the settle is a new revision');
});

test('a stamped design (Update) goes up as it is, and a fully stamped record needs no base read', async () => {
  const { runSync } = loadSync();
  const remote = side([production(T0, [graphic({ designAt: T0 })])]);
  const local = side([production(T0, [graphic({ designAt: T0 })])]);
  await runSync(local, remote);
  local.rows.set('p1', production(T2, [graphic({ template: tpl('<p>updated</p>'), savedAt: T2, designAt: T2 })]));
  remote.gets = 0;
  await runSync(local, remote);
  assert.equal(remote.rows.get('p1').body.graphics[0].template.html, '<p>updated</p>');
  assert.equal(remote.gets, 0);
});

test('a base that cannot be read keeps the record here, unsent', async () => {
  const { runSync } = loadSync();
  const remote = side([production(T0, [graphic()])], { failGet: true });
  const local = side([production(T0, [graphic()])]);
  await runSync(local, remote);
  local.rows.set('p1', production(T2, [graphic({ template: tpl('<p>pulled</p>'), savedAt: T1 })]));
  const result = await runSync(local, remote);
  assert.equal(result.pushed, 0);
  assert.equal(remote.rows.get('p1').body.graphics[0].template.html, '<p>base</p>');
  assert.equal(result.failures.length, 1, 'it is reported, and retried next pass');
});

test('a losing edit is settled before its conflicted copy is made', async () => {
  const { runSync } = loadSync();
  const remote = side([production(T0, [graphic()])]);
  const local = side([production(T0, [graphic()])]);
  await runSync(local, remote);
  // Both sides changed: another device adopted (stamped) and this one holds a pulled design.
  // Both edits are later than the pass that just ran, so both read as changed since it.
  const soon = (ms) => new Date(Date.now() + ms).toISOString();
  remote.rows.set('p1', production(soon(1000), [graphic({ designAt: T0 })], { name: 'P' }));
  local.rows.set('p1', production(soon(2000), [graphic({ template: tpl('<p>pulled</p>'), savedAt: T1, layer: 40 })]));
  const result = await runSync(local, remote);
  assert.equal(result.conflicts, 1);
  const copy = [...local.rows.values()].find((r) => r.id !== 'p1');
  assert.ok(copy, 'the conflicted copy exists');
  assert.equal(copy.body.graphics[0].template.html, '<p>base</p>', 'without the pulled design');
  assert.equal(copy.body.graphics[0].layer, 40, 'with this device\'s placement edit');
});

test('an edit saved while the base is read is never written over: the record waits for the next pass (PR review)', async () => {
  const { runSync } = loadSync();
  const remote = side([production(T0, [graphic()])]);
  const local = side([production(T0, [graphic()])]);
  await runSync(local, remote);
  local.rows.set('p1', production(T2, [graphic({ template: tpl('<p>pulled</p>'), savedAt: T1 })]));
  // The operator saves a cue edit while the cloud read is out.
  const edited = production('2026-11-03T11:00:00.000Z', [graphic({ template: tpl('<p>pulled</p>'), savedAt: T1 })], { cues: [{ id: 'c1', label: 'typed meanwhile' }] });
  const read = remote.get.bind(remote);
  remote.get = async (kind, id) => { local.rows.set('p1', edited); return read(kind, id); };
  const result = await runSync(local, remote);
  assert.equal(result.pushed, 0, 'the older snapshot is not pushed');
  assert.equal(local.rows.get('p1').body.cues[0].label, 'typed meanwhile', 'the edit stands on this device');
  assert.equal(remote.rows.get('p1').body.graphics[0].template.html, '<p>base</p>');
  // The next pass settles the newer record and sends it, edit included.
  remote.get = read;
  await runSync(local, remote);
  assert.equal(remote.rows.get('p1').body.cues[0].label, 'typed meanwhile');
  assert.equal(remote.rows.get('p1').body.graphics[0].template.html, '<p>base</p>');
});
