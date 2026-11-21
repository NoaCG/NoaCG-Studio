// guards: src/backend/teamProductions.ts
//
// The save orchestration of a team record without its designs (live-publishing G5, issue #2614):
// the real save controller (teamProductions.ts) with the real teamDesigns.ts, against a scripted
// server whose answers are written from G5 section 2, not from the code under test. It checks the
// page's rules that live in the controller: the state is read again every 30 s whatever it answered
// (G5 section 7), a save splits only while installed and on (R10), `off` and a second `missing` save
// whole, a `replaced` patch is stored, and a state call that fails while the answer is unknown fails
// the save rather than guessing (G5 section 3).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { rolldown } from 'rolldown';
import * as history from '../src/model/rundownHistory.ts';
import * as teamMerge from '../src/model/teamShowMerge.ts';
import * as pacing from '../src/backend/pacing.ts';
import * as unitPatch from '../src/backend/unitPatch.ts';

async function bundled(input) {
  const bundle = await rolldown({ input, platform: 'neutral', logLevel: 'silent' });
  const { output } = await bundle.generate({ format: 'esm', codeSplitting: false });
  await bundle.close();
  return import(`data:text/javascript;base64,${Buffer.from(output[0].code).toString('base64')}`);
}
const assets = await bundled('src/backend/assets.ts');
const designs = await bundled('src/backend/teamDesigns.ts');
const source = readFileSync(new URL('../src/backend/teamProductions.ts', import.meta.url), 'utf8');

const ABSENT = { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } };

/** The real controller against a scripted server. `state` answers team_designs_state; `store` and
 *  `patch` may be given answers to hand out first, after which the server answers as G5 says. */
function harness({ state, inParts = false }) {
  const clock = { now: 1_000_000 };
  const calls = [];
  const queued = { store: [], patch: [] };
  const BASE = '2026-11-21T00:00:00.000Z';
  let token = BASE;
  let seq = 0;
  const stored = { doc: null, designs: new Map() };
  const graphics = [
    { id: 'g1', name: 'A', template: { html: '<p>a</p>', fields: [] } },
    { id: 'g2', name: 'B', template: { html: '<p>b</p>', fields: [] } },
  ];
  let local = { id: 'show', teamId: 'team', version: 2, name: 'First', graphics, cues: [{ id: 'c1', sourceId: 'g1', values: { f0: 'x' } }] };
  const landed = (doc) => {
    stored.doc = doc;
    token = new Date(Date.parse(BASE) + ++seq).toISOString();
    return { data: { saved: true, updated_at: token, updated_by: 'owner', rev: seq }, error: null };
  };
  const rpc = async (name, args) => {
    calls.push(name);
    switch (name) {
      case 'team_designs_state': return state();
      case 'team_designs_put':
        return { data: args.p_bodies.map((b) => { const n = `d${JSON.stringify(b).length}-${stored.designs.size}`; stored.designs.set(n, b); return n; }), error: null };
      case 'team_production_store':
        if (queued.store.length) return queued.store.shift();
        return args.p_expected === token ? landed(args.p_doc) : { data: { saved: false, updated_at: token, updated_by: 'mate', rev: seq }, error: null };
      case 'team_production_patch_v2':
        if (queued.patch.length) return queued.patch.shift();
        return { data: { saved: false, replaced: true, updated_at: token, updated_by: 'owner', rev: seq }, error: null };
      case 'team_production_save_v2':
        return args.p_expected === token ? landed(args.p_doc) : { data: { saved: false, updated_at: token, updated_by: 'mate', rev: seq }, error: null };
      case 'team_production_units_set': return { data: true, error: null };
      default: throw new Error(`unexpected call ${name}`);
    }
  };
  const from = () => ({
    // readTeamBase (G4): a base map for the token, so a patch is tried.
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { rev: seq, doc_units: { f: 1, m: {}, rev: seq }, updated_at: token }, error: null }) }) }),
  });
  const storage = { from: () => ({ exists: async () => ({ data: true }), upload: async () => ({ error: null }) }) };
  const stubs = {
    './supabase': { getSupabase: async () => ({ rpc, from, storage }) },
    './teams': {},
    './assets': assets,
    './pacing': pacing,
    './partialWrites': { partialWritesOn: async () => inParts, unitPace: async () => {}, noteWritten: () => {} },
    './unitPatch': unitPatch,
    './teamDesigns': designs,
    '../model/shows': { separateMergedScenes: (show) => show },
    '../model/teamShows': { loadTeamShows: () => [local], applyServerTeamShow: (doc) => { local = doc; }, clearTeamShows: () => {} },
    '../model/rundownHistory': history,
    '../model/teamShowMerge': teamMerge,
    '../model/copySettle': { settleGraphics: (g) => ({ graphics: g, changed: false }) },
    '../model/durableStore': { canAuthorAccount: () => true, libraryInUse: () => 'owner', commitDurableWrites: async () => null },
    '../model/teamOutbox': { retainTeamEdit: () => {}, pendingTeamEdits: () => ({}), acknowledgeTeamEdit: () => {} },
  };
  const setup = `
    export function seedForTest(doc: Show) {
      running = { userId: 'owner', stop: () => {} };
      server.set(doc.id, { token: '2026-11-21T00:00:00.000Z', doc, teamId: 'team', updatedBy: 'owner' });
      dirty.add(doc.id);
    }
    export function markDirtyForTest(id: string) { dirty.add(id); }
  `;
  const compiled = ts.transpileModule(source + setup, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  class ClockDate extends Date { static now() { return clock.now; } }
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    require: (name) => { assert.ok(name in stubs, `unexpected dependency: ${name}`); return stubs[name]; },
    setTimeout: () => 1, clearTimeout: () => {}, Date: ClockDate, crypto: globalThis.crypto, TextEncoder, Blob, atob, btoa,
  });
  exports.seedForTest(local);
  return {
    clock, calls, queued, stored,
    async save(name) {
      local = { ...local, name };
      exports.markDirtyForTest('show');
      calls.length = 0;
      return exports.flushTeamProduction('show');
    },
  };
}

const splitIn = (doc) => doc.graphics.every((g) => typeof g.designRef === 'string' && !('template' in g));

test('a page that heard "not installed" asks again after 30 s and then splits', async () => {
  let answer = ABSENT;
  const h = harness({ state: () => answer });
  assert.equal(await h.save('one'), null);
  assert.ok(h.calls.includes('team_production_save_v2') && !h.calls.includes('team_production_store'), 'saved whole while absent');
  answer = { data: { installed: true, mark: true, on: true }, error: null };
  h.clock.now += 10_000;
  assert.equal(await h.save('two'), null);
  assert.ok(!h.calls.includes('team_designs_state') && !h.calls.includes('team_production_store'), 'within 30 s the last answer stands');
  h.clock.now += 30_000;
  assert.equal(await h.save('three'), null);
  assert.ok(h.calls.includes('team_designs_state'), 'asked again after 30 s');
  assert.ok(h.calls.includes('team_production_store'), 'then saved split');
  assert.ok(splitIn(h.stored.doc));
});

test('the switch off: a store answered off saves whole in the same attempt, and later saves stay whole', async () => {
  const h = harness({ state: () => ({ data: { installed: true, mark: true, on: true }, error: null }) });
  h.queued.store.push({ data: { saved: false, off: true, updated_at: '2026-11-21T00:00:00.000Z', updated_by: 'owner', rev: 0 }, error: null });
  assert.equal(await h.save('one'), null);
  assert.deepEqual(h.calls.filter((c) => c !== 'team_designs_put'), ['team_designs_state', 'team_production_store', 'team_production_save_v2']);
  assert.ok(!splitIn(h.stored.doc), 'stored whole');
  assert.equal(await h.save('two'), null);
  assert.ok(!h.calls.includes('team_production_store'), 'the page keeps off until its next read');
});

test('missing once: the designs are put again; missing twice: the record goes whole', async () => {
  const h = harness({ state: () => ({ data: { installed: true, mark: true, on: true }, error: null }) });
  const missing = () => ({ data: { saved: false, missing: ['gone'], updated_at: '2026-11-21T00:00:00.000Z', updated_by: 'owner', rev: 0 }, error: null });
  h.queued.store.push(missing());
  assert.equal(await h.save('one'), null);
  assert.equal(h.calls.filter((c) => c === 'team_production_store').length, 2, 'stored again after a missing answer');
  assert.ok(splitIn(h.stored.doc));
  h.queued.store.push(missing(), missing());
  assert.equal(await h.save('two'), null);
  assert.ok(h.calls.includes('team_production_save_v2'), 'a second missing saves whole');
  assert.ok(!splitIn(h.stored.doc));
});

test('a patch answered replaced is stored split', async () => {
  const h = harness({ state: () => ({ data: { installed: true, mark: true, on: true }, error: null }), inParts: true });
  assert.equal(await h.save('one'), null);
  const patch = h.calls.indexOf('team_production_patch_v2');
  assert.ok(patch >= 0 && h.calls.indexOf('team_production_store') > patch, `patch then store: ${h.calls}`);
  assert.ok(splitIn(h.stored.doc));
});

test('a state call that fails while the answer is unknown fails the save; it never guesses', async () => {
  let fail = true;
  const h = harness({ state: () => (fail ? { data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } } : { data: { installed: true, mark: true, on: true }, error: null }) });
  const error = await h.save('one');
  assert.match(String(error), /statement timeout/);
  assert.ok(!h.calls.some((c) => c.startsWith('team_production_')), 'nothing was saved');
  fail = false;
  assert.equal(await h.save('two'), null);
  assert.ok(h.calls.includes('team_production_store') && splitIn(h.stored.doc));
});
