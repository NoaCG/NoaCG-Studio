// guards: src/backend/sync.ts, src/backend/syncController.ts
// An expired tombstone never travels to a side that does not hold the record (#2063). The two
// sides purge by different clocks, so one that travels comes back on every pass, and each pass
// rewrites the whole library and starts the next one.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

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
    // The send-time settle (live-publishing W2) is copy-settle.test.mjs's; these records hold no production.
    '../model/copySettle': { needsSettle: () => false, settleGraphics: (graphics) => ({ graphics, changed: false }) },
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
  return exports;
}

const DAY = 86_400_000;
const at = (daysAgo) => new Date(Date.now() - daysAgo * DAY).toISOString();
// The 90-day grace, stated here rather than read from the module, so these tests also fail against
// a build that has no notion of expiry at all.
const cutoff = () => at(90);
const ids = (records) => records.map((r) => r.id).join(',');
const graphic = (id, updatedAt, deleted = false) => ({
  kind: 'graphic', id, updatedAt, deleted, body: { id, name: id, updatedAt, deleted },
});

/** One side of the sync as the providers present it: records by key, plus each row's write time,
 *  which is what the cloud's purge reads. */
function side(records = [], { cloud = false } = {}) {
  const rows = new Map(records.map((r) => [r.id, { record: r, writtenAt: Date.now() }]));
  return {
    rows,
    async list(kind) {
      return [...rows.values()].map((row) => row.record).filter((r) => r.kind === kind)
        .map((r) => (cloud ? { kind: r.kind, id: r.id, updatedAt: r.updatedAt, deleted: r.deleted, body: { updatedAt: r.updatedAt, deleted: r.deleted }, summary: true } : r));
    },
    async getMany(kind, ids) { return ids.map((id) => rows.get(id)?.record).filter(Boolean); },
    async get(kind, id) { return rows.get(id)?.record ?? null; },
    async put(record) { rows.set(record.id, { record, writtenAt: Date.now() }); },
    async putMany(records) { for (const r of records) rows.set(r.id, { record: r, writtenAt: Date.now() }); },
  };
}

/** What syncController does after every pass: this device by the record's own time, the cloud by
 *  its server write time. */
function purge(local, remote, cutoff) {
  for (const [id, row] of local.rows) if (row.record.deleted && row.record.updatedAt < cutoff) local.rows.delete(id);
  for (const [id, row] of remote.rows) if (row.record.deleted && new Date(row.writtenAt).toISOString() < cutoff) remote.rows.delete(id);
}

test('an expired tombstone in the cloud is not pulled, so the next pass has nothing to pull', async () => {
  const { runSync } = loadSync();
  // The production state on 2026-11-04: 27 such rows, written to the cloud that morning.
  const local = side();
  const remote = side([graphic('old-delete', at(200), true)], { cloud: true });
  for (let pass = 1; pass <= 3; pass++) {
    const result = await runSync(local, remote);
    assert.deepEqual({ pass, pulled: result.pulled, pushed: result.pushed }, { pass, pulled: 0, pushed: 0 });
    purge(local, remote, cutoff());
  }
});

test('an expired tombstone held only here is not pushed, so it never becomes a cloud row', async () => {
  const { runSync } = loadSync();
  const local = side([graphic('old-delete', at(200), true)]);
  const remote = side([], { cloud: true });
  const first = await runSync(local, remote);
  assert.equal(first.pushed, 0);
  assert.equal(remote.rows.size, 0);
  purge(local, remote, cutoff());
  const second = await runSync(local, remote);
  assert.deepEqual({ pulled: second.pulled, pushed: second.pushed }, { pulled: 0, pushed: 0 });
});

test('a recent tombstone still travels, and an old one still deletes a copy the other side holds', () => {
  const { reconcile, tombstoneCutoff } = loadSync();
  const before = tombstoneCutoff();
  assert.ok(Math.abs(Date.parse(before) - Date.parse(cutoff())) < 60_000, 'the grace is 90 days');
  assert.equal(ids(reconcile([], [graphic('recent', at(5), true)], at(1), undefined, before).toLocal), 'recent');
  assert.equal(ids(reconcile([graphic('recent', at(5), true)], [], at(1), undefined, before).toRemote), 'recent');
  // An expired delete over an even older live copy still wins: that copy is not resurrected.
  assert.equal(ids(reconcile([graphic('g', at(200), true)], [graphic('g', at(300))], at(1), undefined, before).toRemote), 'g');
  assert.equal(ids(reconcile([graphic('g', at(300))], [graphic('g', at(200), true)], at(1), undefined, before).toLocal), 'g');
});
