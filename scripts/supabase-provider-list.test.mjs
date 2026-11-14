// guards: src/backend/supabaseProvider.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

/** The real provider against a client that answers each select from `answers`, and records them. */
function provider(answers) {
  const selects = [];
  const client = { from: (table) => ({ select: (columns) => ({ eq: async (column, kind) => {
    assert.deepEqual([table, column, kind], ['documents', 'kind', 'graphic']);
    selects.push(columns);
    return answers(columns);
  } }) }) };
  const toStoredRecord = (kind, id, body) => ({ kind, id, updatedAt: typeof body.updatedAt === 'string' ? body.updatedAt : 'epoch', deleted: Boolean(body.deleted), body });
  const stubs = {
    './supabase': { getSupabase: async () => client },
    './storage': { isSingleton: () => false, markPutDenied: () => {}, toStoredRecord },
    './assets': {},
    '../model/id': {},
    // Saves in parts (live-publishing G4) are off here: the per-kind listing these tests pin.
    './partialWrites': { partialWritesOn: async () => false, unitPace: async () => {}, noteWritten: () => {} },
    './unitPatch': {},
  };
  const exports = {};
  const compiled = ts.transpileModule(readFileSync(new URL('../src/backend/supabaseProvider.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(compiled, { exports, require: (name) => stubs[name] });
  return { list: () => new exports.SupabaseProvider().list('graphic'), selects };
}

const row = { id: 'a', deleted: true, updatedAt: '2026-11-03T00:00:00.000Z' };

test('a summary reads the copy, and never the body', async () => {
  const p = provider(() => ({ data: [row, { id: 'b', deleted: false, updatedAt: null }], error: null }));
  const [first, second] = await p.list();
  assert.deepEqual([first.id, first.updatedAt, first.deleted, first.summary], ['a', row.updatedAt, true, true]);
  assert.deepEqual([second.updatedAt, second.deleted], ['epoch', false]);
  assert.equal(p.selects.length, 1);
  assert.match(p.selects[0], /updatedAt:body_updated_at/);
  assert.doesNotMatch(p.selects[0], /body->/);
});

test('an instance without the column reads the body as before', async () => {
  const p = provider((columns) => (columns.includes('body_updated_at')
    ? { data: null, error: { code: '42703', message: 'column documents.body_updated_at does not exist' } }
    : { data: [row], error: null }));
  const [only] = await p.list();
  assert.equal(only.updatedAt, row.updatedAt);
  assert.equal(p.selects.length, 2);
  assert.match(p.selects[1], /updatedAt:body->updatedAt/);
});

test('any other failure fails the list, and the expensive read is not tried', async () => {
  const p = provider(() => ({ data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } }));
  await assert.rejects(p.list(), /Cloud list\(graphic\) failed: canceling statement/);
  assert.equal(p.selects.length, 1);
});

/** With parts on (live-publishing G4 section 11): the provider over a client whose listing answers
 *  `answer(since)`, `since` being the `gte('updated_at', …)` bound or null for a full listing. */
function partsProvider(answer) {
  const asked = [];
  const listing = (since) => ({
    gte: (column, value) => { assert.equal(column, 'updated_at'); return listing(value); },
    gt: () => listing(since),
    order: () => listing(since),
    limit: () => listing(since),
    then: (resolve, reject) => { asked.push(since); return Promise.resolve(answer(since)).then(resolve, reject); },
  });
  const client = {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'me' } } } }) },
    from: (table) => ({ select: (columns) => {
      assert.equal(table, 'documents');
      // The per-kind listing, which a failed listing of every kind falls back to.
      if (!/at:updated_at/.test(columns)) return { eq: async () => { asked.push('per kind'); return { data: [], error: null }; } };
      return listing(null);
    } }),
  };
  const toStoredRecord = (kind, id, body) => ({ kind, id, updatedAt: body.updatedAt, deleted: Boolean(body.deleted), body });
  const stubs = {
    './supabase': { getSupabase: async () => client },
    './storage': { isSingleton: () => false, markPutDenied: () => {}, toStoredRecord },
    './assets': {},
    '../model/id': {},
    './partialWrites': { partialWritesOn: async () => true, unitPace: async () => {}, noteWritten: () => {} },
    './unitPatch': {},
  };
  const exports = {};
  const compiled = ts.transpileModule(readFileSync(new URL('../src/backend/supabaseProvider.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(compiled, { exports, require: (name) => stubs[name], Date, Map, Promise });
  const p = new exports.SupabaseProvider();
  return { p, asked };
}

test('with parts on, a pass after a full listing reads only what changed since, with an overlap', async () => {
  const at = '2026-11-14T01:00:00.000000+00:00';
  const { p, asked } = partsProvider((since) => since === null
    ? { data: [
      { id: 'g1', kind: 'graphic', deleted: false, updatedAt: 'v1', at: '2026-11-14T00:59:00.000000+00:00' },
      { id: 's1', kind: 'show', deleted: false, updatedAt: 'v1', at },
    ], error: null }
    : { data: [{ id: 's1', kind: 'show', deleted: false, updatedAt: 'v2', at: '2026-11-14T01:00:05.000000+00:00' }], error: null });
  const plain = (x) => JSON.parse(JSON.stringify(x));
  const first = plain(await Promise.all([p.list('graphic'), p.list('show')]));
  assert.deepEqual(asked, [null], 'one listing for every kind of one pass');
  assert.deepEqual(first.map((rows) => rows.map((r) => r.id)), [['g1'], ['s1']]);
  const second = plain(await Promise.all([p.list('graphic'), p.list('show')]));
  assert.equal(asked.length, 2);
  assert.equal(asked[1], new Date(Date.parse(at) - 60_000).toISOString(), 'from a minute before the newest row seen');
  assert.deepEqual(second[0].map((r) => [r.id, r.updatedAt]), [['g1', 'v1']], 'a row the server did not change is kept');
  assert.deepEqual(second[1].map((r) => [r.id, r.updatedAt]), [['s1', 'v2']], 'a changed row is taken');
});

test('with parts on, a failed listing falls back to the per-kind listing and the next one reads in full', async () => {
  let fail = false;
  const { p, asked } = partsProvider(() => (fail ? { data: null, error: { code: '57014', message: 'timeout' } } : { data: [{ id: 'g1', kind: 'graphic', deleted: false, updatedAt: 'v1', at: '2026-11-14T01:00:00+00:00' }], error: null }));
  await p.list('graphic');
  fail = true;
  await p.list('graphic');
  assert.deepEqual(asked.slice(-2), ['2026-11-14T00:59:00.000Z', 'per kind'], 'an incremental listing failed, then the per-kind one');
  fail = false;
  await p.list('graphic');
  assert.equal(asked[asked.length - 1], null, 'a full listing after the failure');
});

/** The provider with parts on over a table of rows that another page changes between passes. Each
 *  row carries the server's `at` (updated_at); the listing honours `gte('updated_at', …)` as
 *  PostgREST does. `clock` is the page's time, moved by the test. */
function overTable() {
  const table = new Map();
  let serverTime = Date.parse('2026-11-14T01:00:00.000Z');
  const write = (row) => { serverTime += 1_000; table.set(row.id, { ...row, at: new Date(serverTime).toISOString() }); };
  const asked = [];
  /** PostgREST as configured: at most `maxRows` rows an answer, the next page chosen by the last id read. */
  const maxRows = 1000;
  const listing = (since, after = null, limit = Infinity) => ({
    gte: (column, value) => listing(value, after, limit),
    gt: (column, value) => { assert.equal(column, 'id'); return listing(since, value, limit); },
    order: () => listing(since, after, limit),
    limit: (n) => listing(since, after, n),
    then: (resolve) => {
      asked.push(since);
      const rows = [...table.values()].filter((r) => (since === null || Date.parse(r.at) >= Date.parse(since)) && (after === null || r.id > after)).sort((x, y) => (x.id < y.id ? -1 : 1));
      const page = rows.slice(0, Math.min(limit, maxRows));
      return Promise.resolve({ data: page.map((r) => ({ ...r })), error: null }).then(resolve);
    },
  });
  const client = {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'me' } } } }) },
    from: () => ({ select: () => listing(null) }),
  };
  const clock = { now: Date.parse('2026-11-14T01:00:00.000Z') };
  class PageDate extends Date { static now() { return clock.now; } }
  const toStoredRecord = (kind, id, body) => ({ kind, id, updatedAt: body.updatedAt, deleted: Boolean(body.deleted), body });
  const stubs = {
    './supabase': { getSupabase: async () => client },
    './storage': { isSingleton: () => false, markPutDenied: () => {}, toStoredRecord },
    './assets': {},
    '../model/id': {},
    './partialWrites': { partialWritesOn: async () => true, unitPace: async () => {}, noteWritten: () => {} },
    './unitPatch': {},
  };
  const exports = {};
  const compiled = ts.transpileModule(readFileSync(new URL('../src/backend/supabaseProvider.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(compiled, { exports, require: (name) => stubs[name], Date: PageDate, Map, Promise });
  const p = new exports.SupabaseProvider();
  const pass = async () => JSON.parse(JSON.stringify(await p.list('show'))).map((r) => [r.id, r.updatedAt, r.deleted]);
  return { table, write, asked, clock, pass };
}

test('with parts on, another page\'s edit, rename and soft delete show on the next pass', async () => {
  const t = overTable();
  t.write({ id: 'a', kind: 'show', deleted: false, updatedAt: 'a1' });
  t.write({ id: 'b', kind: 'show', deleted: false, updatedAt: 'b1' });
  assert.deepEqual(await t.pass(), [['a', 'a1', false], ['b', 'b1', false]]);
  t.write({ id: 'a', kind: 'show', deleted: false, updatedAt: 'a2' }); // an edit or a rename: a new save of the body
  t.write({ id: 'b', kind: 'show', deleted: true, updatedAt: 'b2' }); // a soft delete: a tombstone save
  t.write({ id: 'c', kind: 'show', deleted: false, updatedAt: 'c1' }); // a new record
  assert.deepEqual(await t.pass(), [['a', 'a2', false], ['b', 'b2', true], ['c', 'c1', false]]);
  assert.notEqual(t.asked[1], null, 'the second pass read only what changed');
});

test('with parts on, a row another page deleted outright is gone by the next full listing, ten minutes on', async () => {
  const t = overTable();
  t.write({ id: 'a', kind: 'show', deleted: true, updatedAt: 'a1' });
  t.write({ id: 'b', kind: 'show', deleted: false, updatedAt: 'b1' });
  await t.pass();
  t.table.delete('a'); // a purge or a removal on another page leaves no row to read
  t.clock.now += 9 * 60_000;
  assert.deepEqual((await t.pass()).map((r) => r[0]), ['a', 'b'], 'held until the full listing');
  t.clock.now += 61_000;
  assert.deepEqual((await t.pass()).map((r) => r[0]), ['b'], 'gone at the full listing');
  assert.equal(t.asked[t.asked.length - 1], null, 'that pass read in full');
});

test('with parts on, a listing longer than the server answers at once is read in pages, every row kept', async () => {
  const t = overTable();
  for (let i = 0; i < 2100; i += 1) t.write({ id: `r${String(i).padStart(5, '0')}`, kind: 'show', deleted: false, updatedAt: 'v1' });
  const rows = await t.pass();
  assert.equal(rows.length, 2100);
  assert.equal(t.asked.length, 3, 'three pages of at most 1000');
});

test('with parts on, a write that committed late shows within the overlap, and an older one at the full listing', async () => {
  const t = overTable();
  t.write({ id: 'a', kind: 'show', deleted: false, updatedAt: 'a1' });
  await t.pass();
  const newest = Date.parse([...t.table.values()][0].at);
  // Committed after the pass, stamped with an earlier transaction start.
  t.table.set('late', { id: 'late', kind: 'show', deleted: false, updatedAt: 'l1', at: new Date(newest - 30_000).toISOString() });
  t.table.set('later', { id: 'later', kind: 'show', deleted: false, updatedAt: 'l1', at: new Date(newest - 120_000).toISOString() });
  assert.deepEqual((await t.pass()).map((r) => r[0]), ['a', 'late'], 'inside the minute of overlap');
  t.clock.now += 10 * 60_000 + 1;
  assert.deepEqual((await t.pass()).map((r) => r[0]).sort(), ['a', 'late', 'later'], 'the full listing has it');
});
