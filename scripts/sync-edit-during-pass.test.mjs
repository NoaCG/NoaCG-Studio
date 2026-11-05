// guards: src/backend/sync.ts
// An edit made on this device while a pass is running, to a record another device saves after
// that pass listed the cloud, is never silently overwritten (#2153). Both versions predate the
// bookmark the pass sets at its end, so the bookmark alone reads neither as changed. The same
// holds for an edit whose push failed in that pass. And none of it may turn an ordinary edit
// into a false conflict.
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

const tick = () => new Promise((resolve) => setTimeout(resolve, 3));
/** A fresh timestamp, strictly later than the last one taken. */
async function now() {
  await tick();
  return new Date().toISOString();
}
const graphic = (id, name, updatedAt) => ({ kind: 'graphic', id, updatedAt, deleted: false, body: { id, name, updatedAt, deleted: false } });

/** One side of the sync. `onPut` runs inside a put, before it lands: the moment to act "during the
 *  pass", after it has listed both sides. `onList` runs as the pass lists graphics, before the
 *  listing is taken. */
function side(records = []) {
  const rows = new Map(records.map((r) => [r.id, r]));
  return {
    rows,
    onPut: null,
    onList: null,
    async list(kind) {
      if (kind === 'graphic') {
        const hook = this.onList;
        this.onList = null;
        await hook?.();
      }
      return [...rows.values()].filter((r) => r.kind === kind);
    },
    async get(kind, id) { return rows.get(id) ?? null; },
    async put(record) {
      const hook = this.onPut;
      this.onPut = null;
      await hook?.(record);
      rows.set(record.id, record);
    },
    async putMany(records) { for (const r of records) rows.set(r.id, r); },
  };
}
const edit = async (where, id, name) => where.rows.set(id, graphic(id, name, await now()));
const names = (where) => [...where.rows.values()].map((r) => r.body.name).sort();

/** Both sides hold `shared` and a synced bookmark; `trigger` is edited here, so the next pass has a
 *  push to make, during which `during` runs. */
async function synced() {
  const engine = loadSync();
  const local = side([graphic('shared', 'Shared', await now()), graphic('trigger', 'Trigger', await now())]);
  const remote = side();
  await engine.runSync(local, remote);
  await edit(local, 'trigger', 'Trigger edited');
  return { ...engine, local, remote };
}

for (const order of ['the other device saves last', 'this device edits last']) {
  test(`an edit during a pass and another device's save of the same record both survive (${order})`, async () => {
    const { runSync, local, remote } = await synced();
    remote.onPut = async () => {
      if (order === 'the other device saves last') {
        await edit(local, 'shared', 'Edit on one');
        await edit(remote, 'shared', 'Edit on two');
      } else {
        await edit(remote, 'shared', 'Edit on two');
        await edit(local, 'shared', 'Edit on one');
      }
    };
    await runSync(local, remote);
    const next = await runSync(local, remote);
    assert.equal(next.conflicts, 1, 'a concurrent edit is a conflict, not last-write-wins');
    assert.deepEqual(names(local), ['Edit on one (conflicted copy)', 'Edit on two', 'Trigger edited']);
    assert.equal(local.rows.get('shared').body.name, 'Edit on two', 'the cloud wins as canonical');
    const settled = await runSync(local, remote);
    assert.deepEqual({ pushed: settled.pushed, pulled: settled.pulled, conflicts: settled.conflicts }, { pushed: 0, pulled: 0, conflicts: 0 });
    assert.deepEqual(names(remote), names(local));
  });
}

test('an edit during a pass, with no save elsewhere, is pushed and is no conflict', async () => {
  const { runSync, local, remote } = await synced();
  remote.onPut = () => edit(local, 'shared', 'Edit on one');
  await runSync(local, remote);
  const next = await runSync(local, remote);
  assert.deepEqual({ pushed: next.pushed, conflicts: next.conflicts }, { pushed: 1, conflicts: 0 });
  assert.equal(remote.rows.get('shared').body.name, 'Edit on one');
});

test('a version saved elsewhere as the pass began, pulled and edited here during it, is pushed: no false conflict', async () => {
  const { runSync, local, remote } = await synced();
  // Dated after the pass started, so a bookmark (or a per-record baseline) dated from the pass's
  // start would read it as a change the next pass, and the edit of it as a conflict.
  remote.onList = () => edit(remote, 'shared', 'Edit on two');
  remote.onPut = () => edit(local, 'shared', 'Edit on one');
  await runSync(local, remote);
  const next = await runSync(local, remote);
  assert.deepEqual({ pushed: next.pushed, conflicts: next.conflicts }, { pushed: 1, conflicts: 0 });
  assert.equal(remote.rows.get('shared').body.name, 'Edit on one');
});

test('a version from a device whose clock runs ahead, edited here during the pass that pulled it, is pushed', async () => {
  const { runSync, local, remote } = await synced();
  remote.rows.set('shared', graphic('shared', 'Edit on two', new Date(Date.now() + 60_000).toISOString()));
  remote.onPut = () => edit(local, 'shared', 'Edit on one');
  await runSync(local, remote);
  const next = await runSync(local, remote);
  assert.deepEqual({ pushed: next.pushed, pulled: next.pulled, conflicts: next.conflicts }, { pushed: 1, pulled: 0, conflicts: 0 });
  assert.equal(remote.rows.get('shared').body.name, 'Edit on one', 'the edit is not undone by the version it was made on');
});

test('a record pushed by a pass, edited during it and saved elsewhere after the push, is a conflict', async () => {
  const { runSync, local, remote } = await synced();
  // The pushed record is `trigger` itself: edited again here, and by the other device once it landed.
  let pushes = 0;
  const put = remote.put.bind(remote);
  remote.put = async (record) => {
    await put(record);
    if (record.id === 'trigger' && pushes++ === 0) {
      await edit(local, 'trigger', 'Trigger on one');
      await edit(remote, 'trigger', 'Trigger on two');
    }
  };
  await runSync(local, remote);
  const next = await runSync(local, remote);
  assert.equal(next.conflicts, 1);
  assert.ok(names(local).includes('Trigger on one (conflicted copy)'));
  assert.equal(local.rows.get('trigger').body.name, 'Trigger on two');
});

test('an edit whose push failed, and a save of it from another device during that pass, both survive', async () => {
  const { runSync, local, remote } = await synced();
  await edit(local, 'shared', 'Edit on one');
  const put = remote.put.bind(remote);
  remote.put = async (record) => {
    if (record.id !== 'shared') return put(record);
    remote.put = put;
    await edit(remote, 'shared', 'Edit on two');
    throw new Error('Cloud put(graphic) failed: the network went away');
  };
  const failed = await runSync(local, remote);
  assert.deepEqual(Array.from(failed.failures, (f) => f.id), ['shared']);
  const next = await runSync(local, remote);
  assert.equal(next.conflicts, 1, 'neither the retried push nor the pull goes over the other edit');
  assert.deepEqual(names(local), ['Edit on one (conflicted copy)', 'Edit on two', 'Trigger edited']);
});
