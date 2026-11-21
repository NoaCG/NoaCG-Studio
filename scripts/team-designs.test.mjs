// guards: src/backend/teamDesigns.ts
//
// The page's half of a team record without its designs (live-publishing G5, issue #2614), against
// a small REFERENCE MODEL written from G5 sections 2 to 4, not from the code under test:
//   - the fake server names a design by a hash of its stored text and stores it with its keys in
//     another order (as jsonb does), never twice; it answers only names it holds;
//   - the model of a page holds whole records only and keeps nothing but what reads and puts told it.
// Random sequences of saves, cue edits, design changes, reloads and reads check R1 (a stored record
// reads back as the whole record), R8 (after a reload a cue edit puts no design), R10 (who splits),
// R11 (an unknown form or name is never held) and R15 (put and read sizes). Nothing here proves the
// SQL: the server's rules are the migration's self-check and the configured spec.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { rolldown } from 'rolldown';

const bundle = await rolldown({ input: 'src/backend/teamDesigns.ts', platform: 'neutral', logLevel: 'silent' });
const { output } = await bundle.generate({ format: 'esm', codeSplitting: false });
await bundle.close();
const D = await import(`data:text/javascript;base64,${Buffer.from(output[0].code).toString('base64')}`);

// ── The reference model ───────────────────────────────────────────────────────────────────────────

/** Keys sorted, as the model's own notion of equal content (independent of the module's). */
const sorted = (v) => (Array.isArray(v) ? v.map(sorted) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sorted(v[k])])) : v);
const same = (a, b) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
/** jsonb keeps object keys in its own order: reversed here, so text matching cannot lean on order. */
const reordered = (v) => (Array.isArray(v) ? v.map(reordered) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().reverse().map((k) => [k, reordered(v[k])])) : v);

function fakeServer() {
  const designs = new Map(); // production -> name -> body
  const calls = { put: [], read: [] };
  return {
    calls,
    designs,
    server: {
      async put(id, bodies) {
        calls.put.push({ id, count: bodies.length, bytes: bodies.reduce((n, b) => n + JSON.stringify(b).length, 0) });
        const held = designs.get(id) ?? new Map();
        designs.set(id, held);
        return bodies.map((b) => {
          const stored = reordered(JSON.parse(JSON.stringify(b)));
          const name = createHash('sha256').update(JSON.stringify(sorted(stored))).digest('hex');
          if (!held.has(name)) held.set(name, stored);
          return name;
        });
      },
      async read(id, names) {
        calls.read.push({ id, count: names.length });
        const held = designs.get(id) ?? new Map();
        return names.filter((n) => held.has(n)).map((n) => ({ name: n, body: JSON.parse(JSON.stringify(held.get(n))) }));
      },
    },
  };
}

/** A seeded generator, so a failure names its seed and repeats. */
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

const design = (name, size, version = 0) => ({ name, html: `<div class="${name}">${'x'.repeat(size)}</div>`, css: `.${name}{opacity:${version}}`, fields: [{ id: 'f0', title: 'Name' }], assets: [{ path: 'logo.png', data: `spx-storage:team/t/s256-${name}-${version}` }], scale: 1.5 });
const record = (k, size = 200) => ({
  id: 'p',
  name: 'Show',
  version: 2,
  graphics: Array.from({ length: k }, (_, i) => ({ id: `g${i}`, name: `G${i}`, type: 'lower-third', layer: 20 + i, template: design(`d${i}`, size) })),
  cues: Array.from({ length: k }, (_, i) => ({ id: `c${i}`, sourceId: `g${i}`, label: `Cue ${i}`, values: { f0: `t${i}` } })),
});

// ── Tests ─────────────────────────────────────────────────────────────────────────────────────────

test('R1, R8, R15: random saves, edits, design changes and reloads keep the whole record and put a design only when new', async () => {
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    D.forgetDesigns();
    const r = rng(seed);
    const { server, calls } = fakeServer();
    let page = record(6 + Math.floor(r() * 10), 50_000 + Math.floor(r() * 200_000));
    let stored = null;
    let known = new Set(); // the model: canonical designs this page has been told a name for
    const designVersion = new Map();
    for (let step = 0; step < 40; step++) {
      const roll = r();
      if (roll < 0.15 && stored) {
        // A reload: a new page knows nothing, then reads the stored record.
        D.forgetDesigns();
        known = new Set();
        page = await D.resolveRecord('p', stored, 1, server);
        for (const g of page.graphics) known.add(JSON.stringify(sorted(g.template)));
        continue;
      }
      if (roll < 0.35) {
        const i = Math.floor(r() * page.graphics.length);
        const v = (designVersion.get(i) ?? 0) + 1;
        designVersion.set(i, v);
        page = { ...page, graphics: page.graphics.map((g, j) => (j === i ? { ...g, template: design(`d${i}`, 50_000, v) } : g)) };
      } else {
        const i = Math.floor(r() * page.cues.length);
        page = { ...page, cues: page.cues.map((c, j) => (j === i ? { ...c, values: { f0: `edit ${step}` } } : c)) };
      }
      const expectedNew = new Set(page.graphics.map((g) => JSON.stringify(sorted(g.template))).filter((t) => !known.has(t)));
      const before = calls.put.reduce((n, c) => n + c.count, 0);
      const split = await D.splitRecord('p', page, server);
      const put = calls.put.reduce((n, c) => n + c.count, 0) - before;
      assert.equal(put, expectedNew.size, `seed ${seed} step ${step}: designs put`);
      for (const t of expectedNew) known.add(t);
      assert.ok(split.graphics.every((g) => typeof g.designRef === 'string' && !('template' in g)), `seed ${seed}: every graphic names its design and carries none (R16)`);
      assert.ok(JSON.stringify(split).length < 30_000, `seed ${seed}: the split record is kilobytes (${JSON.stringify(split).length})`);
      stored = JSON.parse(JSON.stringify(split));
      // R1: a fresh page reads exactly what this page holds.
      D.forgetDesigns();
      const back = await D.resolveRecord('p', stored, 1, server);
      assert.ok(same(back, page), `seed ${seed} step ${step}: the stored record reads back whole`);
      // The fresh read taught that page every name, as a reload does.
      known = new Set(page.graphics.map((g) => JSON.stringify(sorted(g.template))));
    }
    for (const c of calls.put) assert.ok(c.count === 1 || c.bytes <= D.PUT_BYTES, `seed ${seed}: a put of ${c.count} designs carried ${c.bytes} bytes (R15)`);
    for (const c of calls.read) assert.ok(c.count <= D.READ_NAMES, `seed ${seed}: a read named ${c.count} designs (R15)`);
  }
});

test('R8: after a reload and a read, a cue edit puts no design', async () => {
  D.forgetDesigns();
  const { server, calls } = fakeServer();
  const page = record(60, 85_000);
  const stored = await D.splitRecord('p', page, server);
  assert.ok(calls.put.length > 1, 'sixty designs went up in more than one put');
  D.forgetDesigns();
  const read = await D.resolveRecord('p', JSON.parse(JSON.stringify(stored)), 1, server);
  assert.ok(calls.read.every((c) => c.count <= 8));
  const puts = calls.put.length;
  const edited = { ...read, cues: read.cues.map((c, i) => (i === 3 ? { ...c, values: { f0: 'new text' } } : c)) };
  const again = await D.splitRecord('p', edited, server);
  assert.equal(calls.put.length, puts, 'no design was put for a cue edit');
  assert.ok(JSON.stringify(again).length < 40_000, `a 60-graphic cue edit stores ${JSON.stringify(again).length} bytes`);
});

test('R11: an unknown form or an unanswered name is never held', async () => {
  D.forgetDesigns();
  const { server } = fakeServer();
  const stored = await D.splitRecord('p', record(3), server);
  await assert.rejects(() => D.resolveRecord('p', stored, 2, server), /newer version/);
  D.forgetDesigns();
  const broken = { ...stored, graphics: stored.graphics.map((g, i) => (i === 1 ? { ...g, designRef: 'nope' } : g)) };
  await assert.rejects(() => D.resolveRecord('p', broken, 1, server), /could not be read/);
  // A whole record reads as it is, with or without a known form (R2).
  const whole = record(2);
  assert.equal(await D.resolveRecord('p', whole, null, server), whole);
  assert.equal(await D.resolveRecord('p', whole, undefined, server), whole);
});

test('a missing answer: the forgotten names are put again', async () => {
  D.forgetDesigns();
  const { server, calls, designs } = fakeServer();
  const page = record(4);
  const first = await D.splitRecord('p', page, server);
  // The server lost a design the page had a name for (the model of a `missing` answer).
  const lost = first.graphics[2].designRef;
  designs.get('p').delete(lost);
  D.forgetDesigns('p', [lost]);
  const puts = calls.put.length;
  const second = await D.splitRecord('p', page, server);
  assert.equal(calls.put.length, puts + 1);
  assert.ok(designs.get('p').has(second.graphics[2].designRef));
});

test('a record that cannot be split is saved whole', async () => {
  D.forgetDesigns();
  const { server } = fakeServer();
  assert.equal(await D.splitRecord('p', { ...record(2), graphics: [{ id: 'g0' }] }, server), null);
  const empty = await D.splitRecord('p', { name: 'x', cues: [] }, server);
  assert.deepEqual(empty, { name: 'x', cues: [] });
  assert.equal(D.isSplit(empty), false);
});

test('R10: only an installed server with the switch on, on a page with Web Crypto, splits saves', () => {
  for (const installed of [null, false, true]) for (const on of [false, true]) for (const webCrypto of [false, true]) {
    assert.equal(D.savesSplit({ installed, on, webCrypto }), installed === true && on && webCrypto, JSON.stringify({ installed, on, webCrypto }));
  }
});
