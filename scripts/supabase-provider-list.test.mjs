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
