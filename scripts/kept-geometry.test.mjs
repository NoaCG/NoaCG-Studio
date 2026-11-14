// guards: src/control/keptGeometry.ts, src/control/adjustGeometry.ts, src/control/hostedAdjust.ts
//
// WHAT THE PAGE MEASURED, KEPT ACROSS A RELOAD (live-publishing phase 7 repair, #2532), in Node: a
// page measures its graphic cues, a reload starts a new session over the same browser storage, and
// the first publish there carries every cue's box exactly as the last one did, with no measurement
// owed (so no cue is resent for a box the reload lost). A kept box is taken only for the same
// identity, the same build and a cue the new session has not measured.
// The browser half is the measure harness's `reopened` kind (e2e/configured/measure/baseline.measure.ts).

import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import './lib/tsResolve.mjs';

const K = await import('../src/control/keptGeometry.ts');
const G = await import('../src/control/adjustGeometry.ts');
const H = await import('../src/control/hostedAdjust.ts');
const { storePart } = await import('../src/control/storePart.ts');

const HD = { width: 1920, height: 1080 };
const box = (y) => ({ info: { x: 120, y, w: 410, h: 89 }, paint: { x: 120, y, w: 410, h: 89 }, minText: 26 });

/** A browser's storage and clock, shared by the pages it opens; timers run when `flush` says. */
function browser(build = 'abc1234') {
  const items = new Map();
  let pending = [];
  return {
    items,
    io: (b = build) => ({
      getItem: (k) => items.get(k) ?? null,
      setItem: (k, v) => items.set(k, v),
      setTimeout: (run) => (pending.push(run), run),
      clearTimeout: (t) => (pending = pending.filter((r) => r !== t)),
      now: () => 1,
      build: b,
    }),
    flush: () => {
      const runs = pending;
      pending = [];
      for (const run of runs) run();
    },
  };
}

/** A production: cue id to [pool graphic, identity]. The identity stands for `measureId`. */
const CUES = { c1: ['g1', 'id-c1'], c2: ['g1', 'id-c2'], c3: ['g2', 'id-c3'] };
const graphicsOf = (cues) => new Map(Object.entries(cues).map(([c, [g]]) => [c, g]));
const identities = (cues) => (owed) => Object.entries(cues).filter(([c]) => owed.has(c)).map(([cueId, [graphicId, id]]) => ({ cueId, graphicId, id }));
/** What a publish carries for each cue: the box the page resolves it against. */
const published = (part, cues) =>
  Object.fromEntries(Object.entries(cues).map(([c, [g, id]]) => [c, H.publishedAdjustOf({ id: g }, {}, undefined, G.geometryOf(part, c, g, id).m, HD, HD).box ?? null]));

/** One page: a session's geometry, kept in `b`, with what this page measured. */
function openPage(b, cues = CUES, build) {
  const part = storePart(G.NO_GEOMETRY);
  const kept = K.keepGeometry(part, 'show-1', () => graphicsOf(cues), b.io(build));
  const stop = kept.watch();
  return { part, kept, stop };
}

describe('a reload keeps the boxes a publish carries', () => {
  test('the first publish after a reload carries every box the last one did, and owes no measurement', async () => {
    const b = browser();
    const first = openPage(b);
    first.part.set((p) => G.measured(p, 'c1', 'g1', 'id-c1', box(872)));
    first.part.set((p) => G.measured(p, 'c2', 'g1', 'id-c2', box(900)));
    first.part.set((p) => G.measured(p, 'c3', 'g2', 'id-c3', box(700)));
    const before = published(first.part.get(), CUES);
    b.flush();
    first.stop();

    // The reload: a new session, and a measurer whose document never answers in time.
    const second = openPage(b);
    let measuredAgain = 0;
    const measurer = G.createMeasurer(second.part, { measure: () => (measuredAgain++, new Promise(() => {})) }, () => true, {
      setTimeout: () => 0,
      clearTimeout: () => {},
    });
    second.kept.adopt(identities(CUES));
    assert.deepEqual(published(second.part.get(), CUES), before, 'every cue publishes the box it published before the reload');
    // Publish's wait answers at once: each job's identity is already measured.
    await Promise.all(Object.entries(CUES).map(([cueId, [graphicId, id]]) => measurer.now({ cueId, graphicId, id, input: null }, 8_000)));
    assert.equal(measuredAgain, 0, 'nothing is measured again for an unchanged identity');
  });

  test('a cue whose identity moved, or another build, is measured again rather than taken', () => {
    const b = browser();
    const first = openPage(b);
    first.part.set((p) => G.measured(p, 'c1', 'g1', 'id-c1', box(872)));
    first.part.set((p) => G.measured(p, 'c3', 'g2', 'id-c3', box(700)));
    b.flush();
    first.stop();

    const moved = { ...CUES, c1: ['g1', 'id-c1-edited'] };
    const second = openPage(b, moved);
    second.kept.adopt(identities(moved));
    assert.equal(second.part.get().byCue.c1, undefined, 'an edited cue keeps no box from before the edit');
    assert.deepEqual(second.part.get().byCue.c3, { id: 'id-c3', m: box(700) });

    const third = openPage(b, CUES, 'def5678');
    third.kept.adopt(identities(CUES));
    assert.deepEqual(third.part.get().byCue, {}, 'a box another build measured is never taken');
  });

  test('a cue this session measured keeps its own measurement', () => {
    const b = browser();
    const first = openPage(b);
    first.part.set((p) => G.measured(p, 'c1', 'g1', 'id-c1', box(872)));
    b.flush();
    first.stop();
    const second = openPage(b);
    second.part.set((p) => G.measured(p, 'c1', 'g1', 'id-c1', box(880)));
    second.kept.adopt(identities(CUES));
    assert.deepEqual(second.part.get().byCue.c1.m, box(880));
  });

  test('a removed cue is forgotten, and storage that refuses changes nothing', () => {
    const b = browser();
    const first = openPage(b);
    first.part.set((p) => G.measured(p, 'c1', 'g1', 'id-c1', box(872)));
    first.part.set((p) => G.measured(p, 'c3', 'g2', 'id-c3', box(700)));
    b.flush();
    first.stop();
    const { c3, ...without } = CUES;
    void c3;
    const second = openPage(b, without);
    second.kept.adopt(identities(without));
    second.part.set((p) => G.measured(p, 'c2', 'g1', 'id-c2', box(900)));
    b.flush();
    second.stop();
    assert.deepEqual(Object.keys(K.readKept(b.io(), 'show-1')).sort(), ['c1', 'c2']);

    const part = storePart(G.NO_GEOMETRY);
    const io = { ...b.io(), getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('quota'); } };
    const kept = K.keepGeometry(part, 'show-1', () => graphicsOf(CUES), io);
    const stop = kept.watch();
    kept.adopt(identities(CUES));
    part.set((p) => G.measured(p, 'c1', 'g1', 'id-c1', box(872)));
    b.flush();
    stop();
    assert.deepEqual(part.get().byCue.c1.m, box(872));
  });
});
