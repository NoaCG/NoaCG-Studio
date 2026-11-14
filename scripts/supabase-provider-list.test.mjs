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
