// guards: src/backend/unitPatch.ts
//
// ONLY WHAT CHANGED (docs/work-specs/live-publishing/designs/G4.md section 1, rules R2 and R3).
// Random documents and random edits, checked against the rules' own words: applying the patch to
// the stored document gives exactly the writer's document (R3), a unit whose content did not change
// is never sent (R2), and a patch the stored document cannot take is refused whole (R3).

import test from 'node:test';
import assert from 'node:assert/strict';
import './lib/tsResolve.mjs';

const { diff, unitMap, applyPatch, applyToMap, canonicalJson, keyedBy, PatchRefused } = await import('../src/backend/unitPatch.ts');

/** A small seeded random source, so a failure repeats. */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function docOf(r) {
  const n = 1 + Math.floor(r() * 6);
  const cues = Array.from({ length: n }, (_, i) => ({ id: `c${i}`, label: `Cue ${i}`, values: { f: String(Math.floor(r() * 9)) } }));
  const graphics = Array.from({ length: 1 + Math.floor(r() * 3) }, (_, i) => ({ id: `g${i}`, name: `G${i}`, template: { html: 'x'.repeat(1 + Math.floor(r() * 5)) } }));
  return { id: 'p', name: 'Show', updatedAt: '2026-11-13T00:00:00.000Z', graphics, cues, ...(r() < 0.5 ? { note: 'n' } : {}) };
}

/** One random edit, as an editor makes it: new objects for what changed, the rest kept. */
function edit(doc, r) {
  const next = { ...doc, updatedAt: `2026-11-13T00:00:0${Math.floor(r() * 9)}.000Z` };
  const pick = Math.floor(r() * 8);
  const cues = [...(next.cues ?? [])];
  if (pick === 0 && cues.length) {
    const i = Math.floor(r() * cues.length);
    cues[i] = { ...cues[i], label: `Edited ${r().toFixed(4)}` };
  } else if (pick === 1) cues.push({ id: `n${Math.floor(r() * 1e6)}`, label: 'New', values: {} });
  else if (pick === 2 && cues.length) cues.splice(Math.floor(r() * cues.length), 1);
  else if (pick === 3 && cues.length > 1) cues.reverse();
  else if (pick === 4) next.name = `Show ${r().toFixed(3)}`;
  else if (pick === 5) delete next.note;
  else if (pick === 6) next.extra = { a: [1, 2, { b: r() }] };
  else if (pick === 7 && cues.length) {
    // An element moves and another changes in one edit.
    const [moved] = cues.splice(0, 1);
    cues.push({ ...moved, values: { f: 'moved' } });
  }
  if (cues.length) next.cues = cues;
  else delete next.cues;
  return next;
}

test('R3: the patch applied to the stored document is exactly the writer\'s document', async () => {
  const r = rng(7);
  for (let round = 0; round < 300; round += 1) {
    let stored = docOf(r);
    let map = await unitMap(stored);
    let local = stored;
    for (let step = 0; step < 6; step += 1) {
      local = edit(local, r);
      const { ops, map: next } = await diff(map, local);
      const applied = applyPatch(stored, ops);
      assert.equal(canonicalJson(applied), canonicalJson(local), `round ${round} step ${step}`);
      // The map the server keeps after the patch is the writer's own map of its document.
      assert.equal(canonicalJson(applyToMap(map, ops, applied)), canonicalJson(next));
      stored = applied;
      map = next;
    }
  }
});

test('R2: a unit whose content did not change is never sent', async () => {
  const r = rng(11);
  for (let round = 0; round < 200; round += 1) {
    const stored = docOf(r);
    const local = edit(stored, r);
    const { ops } = await diff(await unitMap(stored), local);
    for (const op of ops) {
      if ('set' in op) assert.notEqual(canonicalJson(op.set), canonicalJson(stored[op.m]), `${op.m} was the same`);
      if ('put' in op) {
        for (const p of op.put) {
          const was = stored[op.m].find((el) => el[op.by] === p.v[op.by]);
          assert.ok(!was || canonicalJson(was) !== canonicalJson(p.v), `${op.m}/${p.v[op.by]} was the same`);
        }
      }
    }
  }
});

test('one cue\'s text edit sends that cue and the save time, nothing else', async () => {
  const stored = docOf(rng(3));
  stored.cues = Array.from({ length: 60 }, (_, i) => ({ id: `c${i}`, label: `Cue ${i}`, values: { text: 'y'.repeat(200) } }));
  stored.graphics = Array.from({ length: 60 }, (_, i) => ({ id: `g${i}`, name: `G${i}`, template: { html: 'z'.repeat(80_000) } }));
  const local = { ...stored, updatedAt: 'later', cues: stored.cues.map((c, i) => (i === 7 ? { ...c, values: { text: 'x'.repeat(2048) } } : c)) };
  const { ops } = await diff(await unitMap(stored), local);
  assert.deepEqual(ops.map((op) => op.m).sort(), ['cues', 'updatedAt']);
  const cueOp = ops.find((op) => op.m === 'cues');
  assert.equal(cueOp.put.length, 1);
  assert.equal(cueOp.order, undefined);
  assert.ok(JSON.stringify(ops).length < 3_000, `${JSON.stringify(ops).length} bytes`);
});

test('no base: every member is set', async () => {
  const doc = docOf(rng(5));
  const { ops } = await diff(null, doc);
  assert.equal(canonicalJson(applyPatch({}, ops)), canonicalJson(doc));
  assert.ok(ops.every((op) => 'set' in op));
});

test('a keyed list is an array of objects with one unique identity: id, else key, else name', () => {
  assert.equal(keyedBy([{ id: 'a' }, { id: 'b' }]), 'id');
  assert.equal(keyedBy([{ id: 'a', key: 'x' }, { id: 'a', key: 'y' }]), 'key');
  assert.equal(keyedBy([{ name: 'a' }, { name: 'b' }]), 'name');
  assert.equal(keyedBy([{ id: 'a' }, { id: 'a' }]), null);
  assert.equal(keyedBy([{ id: 'a' }, 'b']), null);
  assert.equal(keyedBy([]), null);
  assert.equal(keyedBy({ id: 'a' }), null);
});

test('R3: a patch the stored document cannot take is refused, nothing applied', async () => {
  const stored = { cues: [{ id: 'a' }, { id: 'b' }] };
  // The order names an identity the list does not hold.
  assert.throws(() => applyPatch(stored, [{ m: 'cues', by: 'id', put: [], del: [], order: ['a', 'x'], len: 2 }]), PatchRefused);
  // The length does not come out as the writer's.
  assert.throws(() => applyPatch(stored, [{ m: 'cues', by: 'id', put: [{ v: { id: 'c' }, d: '0' }], del: [], len: 2 }]), PatchRefused);
  // The stored member is not a keyed list.
  assert.throws(() => applyPatch({ cues: 'text' }, [{ m: 'cues', by: 'id', put: [], del: [], len: 0 }]), PatchRefused);
  assert.deepEqual(stored, { cues: [{ id: 'a' }, { id: 'b' }] });
});

test('canonical JSON: keys sorted, values written as JSON.stringify writes them', () => {
  assert.equal(canonicalJson({ b: 1, a: [undefined, null, 'x'], c: undefined }), '{"a":[null,null,"x"],"b":1}');
  assert.equal(canonicalJson({ a: { d: 1, c: 2 } }), canonicalJson({ a: { c: 2, d: 1 } }));
});
