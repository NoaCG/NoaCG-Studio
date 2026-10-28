// guards: src/control/cueStyle.ts, src/control/appearanceRuntime.ts, src/control/exportAppearance.ts, src/control/localReceiver.ts, src/model/adjust.ts, src/control/cueAdjust.ts, src/control/adjustGeometry.ts, src/model/teamShowMerge.ts, src/model/cueClipboard.ts, src/model/rundownHistory.ts, src/control/cueItems.ts, src/control/airState.ts, src/model/shows.ts
//
// PLACE AND SIZE FROM RECORD TO AIR (docs/work-specs/playout-adjustments/spec.md, phase 1), in Node:
// the record and its one reader, the fold of a cue over its graphic member by member (AC-4), the
// presets, nudges and pivot in production px (AC-1, AC-2), the readability estimate (AC-3), the
// wire's four rules (AC-8, AC-9, AC-10), the doors and the lifecycle (AC-4), and both merge probes.
// Phase 1b, documents that are the page: the export resolver (graphic default and cue fold, each
// against the graphic's own page), the bake, the root runtime's rect mapping, and the relay
// receiver's bytes for a production nobody adjusted (AC-9, AC-10).
// The browser halves are e2e/playout-adjust.spec.ts (the measurement and the stage's frame) and the
// journey in e2e/production-controls.spec.ts.

import test, { after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { rolldown } from 'rolldown';
import { rawSuffix } from './rolldown-raw.mjs';
import './lib/tsResolve.mjs';

const adjust = await import('../src/model/adjust.ts');
const A = await import('../src/control/cueAdjust.ts');
const G = await import('../src/control/adjustGeometry.ts');
const St = await import('../src/control/cueStyle.ts');
const TextFit = await import('../src/templates/shared/textFit.ts');
const { fontById, fontStack, LATIN_EXT_RANGE } = await import('../src/model/fonts.ts');
const { mergeTeamShow } = await import('../src/model/teamShowMerge.ts');
const { copyClip, pasteCopies } = await import('../src/model/cueClipboard.ts');
const { liveRundownRefusal } = await import('../src/model/rundownHistory.ts');
const { takeCueItems } = await import('../src/control/cueItems.ts');
const { rememberAired, restoreItems, seedFromResolve } = await import('../src/control/airState.ts');
const { NO_AIR } = await import('../src/control/playoutSession.ts');
const { storePart } = await import('../src/control/storePart.ts');

const HD = { width: 1920, height: 1080 };
const eff = (g, c) => A.effectiveAdjust(g, c);
/** lt01 as the receipt measured it: a strap at left 120, bottom 961, 410 px wide. */
const LT = { x: 120, y: 872, w: 410, h: 89 };
const strap = (box = LT, minText = 30) => ({ info: box, paint: box, minText });
const composed = (box, frame) => A.composeRect(box, frame);
const right = (r) => r.x + r.w;
const bottom = (r) => r.y + r.h;
const near = (a, b, msg) => assert.ok(Math.abs(a - b) <= 1, `${msg}: ${a} vs ${b}`);

describe('the record and its reader', () => {
  test('absent, this version, and a later one kept read-only', () => {
    assert.deepEqual(adjust.readAdjust(undefined), { status: 'none' });
    assert.deepEqual(adjust.readAdjust({ v: 1, place: 'br', x: -12, scale: 0.95, anchor: 'bl', later: 1 }), {
      status: 'ok',
      record: { v: 1, place: 'br', x: -12, scale: 0.95, anchor: 'bl' },
    });
    assert.deepEqual(adjust.readAdjust({ v: 2, place: 'br' }), { status: 'read-only' });
    assert.deepEqual(adjust.readAdjust({ v: 1, place: 'nowhere', x: 'a', scale: -1 }).record, { v: 1 }, 'bad members are not read');
    assert.equal(adjust.readAdjust({ v: 1, scale: 99 }).record.scale, 4, 'the size stops at 400 %');
    assert.equal(adjust.readAdjust({ v: 1, scale: 0.01 }).record.scale, 0.25, 'and at 25 %');
  });

  test('a patch writes over the record, keeps members it does not know, and a null removes one', () => {
    assert.deepEqual(adjust.patchAdjust({ v: 1, place: 'bl', vars: { accent: '#f00' } }, { x: 4, place: null }), { v: 1, x: 4, vars: { accent: '#f00' } });
    assert.equal(adjust.patchAdjust({ v: 1, x: 4 }, { x: null }), undefined, 'nothing left at this scope');
    assert.equal(adjust.patchAdjust({ v: 2, x: 4 }, { x: 5 }), adjust.ADJUST_READ_ONLY);
    // x 0 written at a scope is a member: it overrides an inherited x.
    assert.deepEqual(adjust.patchAdjust(undefined, { x: 0 }), { v: 1, x: 0 });
  });
});

describe('AC-4: the fold is member by member, narrowest wins, identity after', () => {
  test('a cue that sets place alone still inherits x; the default\'s place leaves it', () => {
    const graphic = { v: 1, place: 'bl', x: 0 };
    const cue2 = { v: 1, place: 'br' };
    assert.equal(eff(graphic, cue2).place, 'br');
    assert.equal(eff(graphic, cue2).x, 0);
    assert.deepEqual(eff(graphic, cue2).own, ['place']);
    // The default's x moves by 10: cue 1 (no record) and cue 2 (inherits x) both move.
    const moved = { ...graphic, x: 10 };
    assert.equal(eff(moved, undefined).x, 10);
    assert.equal(eff(moved, cue2).x, 10);
    // The default's place changes: cue 2 keeps its own.
    assert.equal(eff({ ...graphic, place: 'tl' }, cue2).place, 'br');
    // Stop the exception: the default is what is left.
    assert.equal(eff(moved, undefined).place, 'bl');
  });

  test('a later version\'s record applies nothing and makes the fold read-only', () => {
    const e = eff({ v: 2, place: 'br' }, undefined);
    assert.equal(e.place, undefined);
    assert.equal(e.readOnly, true);
    assert.equal(e.any, true);
  });
});

describe('AC-1: a lower third moves to the other side and nudges precisely', () => {
  test('bottom-right puts its right edge on the right safe inset; three 1 px and one 10 px nudge move it 13 px', () => {
    const anchored = { v: 1, ...A.withAnchor(eff(undefined, undefined), strap(), HD, { place: 'br' }) };
    assert.equal(anchored.anchor, 'bl', 'the anchor is the authored zone, taken once');
    const placed = A.resolveFrame(eff(anchored, undefined), strap(), HD, HD);
    near(right(composed(LT, placed)), 1920 - 120, 'right edge on the inset');
    near(bottom(composed(LT, placed)), 961, 'bottom stays');
    const nudged = A.resolveFrame(eff({ ...anchored, x: -1 - 1 - 1 - 10 }, undefined), strap(), HD, HD);
    near(right(composed(LT, nudged)), 1800 - 13, 'moved 13 px left');
  });

  test('the presets are the safe area of base.ts zoneDecls: left and right 120, top 86, bottom 119 at 1080p', () => {
    assert.deepEqual(A.presetPoint('tl', HD), { x: 120, y: 86 });
    assert.deepEqual(A.presetPoint('br', HD), { x: 1800, y: 961 });
    assert.deepEqual(A.presetPoint('mc', HD), { x: 960, y: 540 });
    assert.deepEqual(A.presetPoint('br', { width: 3840, height: 2160 }), { x: 3600, y: 1922 }, 'scaled with the stage');
  });

  test('a longer name re-measured keeps the right edge on the inset and the anchor unchanged', () => {
    const record = { v: 1, place: 'br', anchor: 'bl' };
    const longer = { ...LT, w: 520 };
    const frame = A.resolveFrame(eff(record, undefined), strap(longer), HD, HD);
    near(right(composed(longer, frame)), 1800, 'still on the inset');
    // The anchor never follows the box: the record keeps the one written first.
    assert.deepEqual(A.withAnchor(eff(record, undefined), strap(longer), HD, { x: 3 }), { x: 3 });
  });

  test('a nudge never takes a frame off the stage', () => {
    const frame = A.resolveFrame(eff({ v: 1, x: 99999 }, undefined), strap(), HD, HD);
    assert.equal(frame.dx, 1912, 'at most the stage width less 8 px');
  });
});

describe('AC-2: about five percent smaller, with no pivot drift', () => {
  test('lt01 at 95 % keeps its left and bottom edges and shrinks 5 %', () => {
    const frame = A.resolveFrame(eff({ v: 1, scale: 0.95, anchor: 'bl' }, undefined), strap(), HD, HD);
    const out = composed(LT, frame);
    near(out.x, 120, 'left edge');
    near(bottom(out), 961, 'bottom edge');
    near(out.w, LT.w * 0.95, 'width');
  });

  test('a centred board keeps its centre', () => {
    const board = { x: 512, y: 396, w: 895, h: 287 };
    const frame = A.resolveFrame(eff({ v: 1, scale: 0.95 }, undefined), strap(board), HD, HD);
    const out = composed(board, frame);
    near(out.x + out.w / 2, board.x + board.w / 2, 'centre x');
    near(out.y + out.h / 2, board.y + board.h / 2, 'centre y');
  });

  test('every one of the nine anchors is the fixed point of the size', () => {
    for (const zone of adjust.ZONES) {
      const box = { x: 300, y: 200, w: 400, h: 100 };
      const frame = A.resolveFrame(eff({ v: 1, scale: 0.5, anchor: zone }, undefined), strap(box), HD, HD);
      const before = A.pointOf(box, zone);
      const after = A.pointOf(composed(box, frame), zone);
      near(after.x, before.x, `${zone} x`);
      near(after.y, before.y, `${zone} y`);
    }
  });

  test('a 720p and a portrait graphic pivot on their own boxes at the stage origin', () => {
    const p720 = { x: 80, y: 581, w: 273, h: 59 };
    const f720 = A.resolveFrame(eff({ v: 1, scale: 0.95 }, undefined), strap(p720), { width: 1280, height: 720 }, HD);
    near(composed(p720, f720).x, 80, '720p left edge');
    near(bottom(composed(p720, f720)), 640, '720p bottom edge');
    const portrait = { x: 60, y: 1500, w: 900, h: 200 };
    const fp = A.resolveFrame(eff({ v: 1, scale: 0.95 }, undefined), strap(portrait), { width: 1080, height: 1920 }, { width: 1920, height: 1920 });
    near(bottom(composed(portrait, fp)), 1700, 'portrait bottom edge');
  });

  test('lt63 spans the frame: no size, no horizontal preset, a vertical nudge moves it', () => {
    const m = { info: { x: 120, y: 900, w: 1672, h: 60 }, paint: { x: 0, y: 880, w: 1920, h: 100 }, minText: 30 };
    assert.equal(A.geometryLimit(m, HD), 'spans');
    assert.equal(A.resolveFrame(eff({ v: 1, scale: 0.9, place: 'br', x: 40 }, undefined), m, HD, HD), null, 'size, preset and x do nothing');
    const frame = A.resolveFrame(eff({ v: 1, y: -30 }, undefined), m, HD, HD);
    assert.deepEqual([frame.dx, frame.dy, frame.s], [0, -30, 1]);
  });

  test('a ticker with no information box takes no preset; with no measurement the size acts about the frame', () => {
    const ticker = { info: null, paint: { x: 0, y: 1000, w: 1920, h: 60 }, minText: null };
    assert.equal(A.geometryLimit({ ...ticker, paint: { x: 100, y: 1000, w: 600, h: 60 } }, HD), 'no-presets');
    assert.equal(A.geometryLimit(null, HD), 'none');
    const frame = A.resolveFrame(eff({ v: 1, place: 'tr', scale: 0.5 }, undefined), null, HD, HD);
    assert.deepEqual([frame.dx, frame.dy, frame.ox, frame.oy], [0, 0, 960, 540], 'no preset, about the centre');
  });
});

describe('AC-3: the oversized quiz assessed per board', () => {
  test('qz01 at 0.84 is amber, the agent votes board at 0.47 is red with the remedy, qz05 is fine', () => {
    assert.equal(A.floorEstimate(21.9, 0.84, 'quiz').tone, 'amber');
    assert.equal(A.floorEstimate(21.9, 0.84, 'quiz').px, 18.4);
    const votes = A.floorEstimate(26, 0.47, 'quiz');
    assert.deepEqual([votes.tone, votes.px], ['red', 12.2]);
    assert.equal(A.floorEstimate(26, 1, 'quiz').tone, 'ok');
    // Red below 16 px whatever the category; 16 itself is amber under the 20 px floor.
    assert.equal(A.floorEstimate(15.9, 1, 'quiz').tone, 'red');
    assert.equal(A.floorEstimate(16, 1, 'quiz').tone, 'amber');
    assert.equal(A.floorEstimate(19.9, 1, 'quiz').tone, 'amber');
    assert.equal(A.floorEstimate(20, 1, 'quiz').tone, 'ok');
    assert.equal(A.floorEstimate(null, 1, 'quiz'), null);
    // The floor moves with the category's (model/designRules.ts): a corner bug answers to 16.
    assert.equal(A.floorEstimate(17, 1, 'corner-bug').tone, 'ok');
  });
});

describe('the wire: the four rules', () => {
  const look = { v: 1, frame: { dx: 10, dy: 0, s: 1, ox: 0, oy: 0 } };
  test('rule 1: an update without an appearance, an event and a stop keep the one applied', () => {
    let looks = A.lookAfter({}, 'L3', { t: 'update', data: {}, appearance: look });
    assert.deepEqual(looks.L3, look);
    for (const msg of [{ t: 'update', data: { f0: 'x' } }, { t: 'event', event: 'goal', payload: { s: '1' } }, { t: 'stop' }, { t: 'play' }]) {
      assert.equal(A.lookAfter(looks, 'L3', msg), looks, msg.t);
    }
  });

  test('rule 3: an appearance replaces the one applied (never multiplies), the identity clears it', () => {
    const other = { v: 1, frame: { dx: 0, dy: 0, s: 0.9, ox: 120, oy: 961 } };
    let looks = A.lookAfter({ L3: look }, 'L3', { t: 'update', data: {}, appearance: other });
    assert.deepEqual(looks.L3, other);
    looks = A.lookAfter(looks, 'L3', { t: 'update', data: {}, appearance: A.IDENTITY });
    assert.equal('L3' in looks, false);
    // A later version's appearance is not understood: what was applied stays (rollback).
    assert.equal(A.lookAfter({ L3: look }, 'L3', { t: 'update', data: {}, appearance: { v: 2, frame: {} } }).L3, look);
  });

  test('rule 2 and AC-10: no record, no field; an emptied record sends the identity; a resolved one itself', () => {
    assert.equal(A.appearanceToSend(null, eff(undefined, undefined), undefined), undefined, 'a never-adjusted graphic sends nothing');
    assert.deepEqual(A.appearanceToSend(null, eff({ v: 1, x: 0 }, undefined), undefined), A.IDENTITY);
    assert.deepEqual(A.appearanceToSend(null, eff(undefined, undefined), look), A.IDENTITY, 'reset with an old one applied');
    assert.deepEqual(A.appearanceToSend(null, eff(undefined, undefined), undefined, true), A.IDENTITY, 'another cue of it has one');
    assert.deepEqual(A.appearanceToSend(look.frame, eff({ v: 1, x: 10 }, undefined), undefined), look);
    // The Take's items are exactly what they were without one.
    assert.deepEqual(takeCueItems({ id: 'c', graphic: 'L3', values: { f0: 'a' } })[0], { graphic: 'L3', msg: { t: 'update', data: { f0: 'a' } } });
    assert.deepEqual(takeCueItems({ id: 'c', graphic: 'L3', values: { f0: 'a' }, appearance: look })[0].msg.appearance, look);
  });

  test('the hosted page applies the published appearance, and an identity only when something holds one', () => {
    const cues = [{ graphic: 'L3' }, { graphic: 'L3', appearance: look }, { graphic: 'Bug' }];
    assert.deepEqual(A.publishedAppearance(cues[1], cues, undefined), look);
    assert.deepEqual(A.publishedAppearance(cues[0], cues, undefined), A.IDENTITY);
    assert.equal(A.publishedAppearance(cues[2], cues, undefined), undefined);
    assert.deepEqual(A.publishedAppearance(cues[2], cues, look), A.IDENTITY);
  });

  test('rule 4: what the page remembers and what rebuilds PROGRAM is what was applied, never preparation', () => {
    let air = { ...NO_AIR, liveCue: { L3: 'c1' } };
    air = rememberAired(air, [{ graphic: 'L3', msg: { t: 'update', data: { f0: 'a' }, appearance: look } }]);
    assert.deepEqual(air.looks.L3, look);
    air = rememberAired(air, [{ graphic: 'L3', msg: { t: 'update', data: { f0: 'b' } } }]);
    assert.deepEqual(air.looks.L3, look, 'a partial update keeps it');
    const { items } = restoreItems(air, {}, { clocks: new Map(), pairs: new Map() });
    assert.deepEqual(items[0].msg.appearance, look);
    // A boot seeds it from the renderer's report, then the rows after it.
    const seeded = seedFromResolve(
      NO_AIR,
      { liveCue: { L3: 'c1' }, live: { L3: { data: { f0: 'a' }, state: { groups: { main: 'in' }, appearance: look }, event: 5 } } },
      [],
      { moves: 0, commands: 0 },
      [{ id: 'c1', values: { f0: 'a' } }],
      { clocks: new Map(), pairs: new Map() },
    );
    assert.deepEqual(seeded.looks.L3, look);
    assert.deepEqual(A.reportedLook({ state: { appearance: look } }), look);
    assert.equal(A.reportedLook({ state: { groups: {} } }), null);
  });
});

test('a re-resolve takes each report as the renderer\'s word: a report with no appearance clears an older one', () => {
  const look = { v: 1, frame: { dx: 10, dy: 0, s: 1, ox: 0, oy: 0 } };
  const air = { ...NO_AIR, looks: { L3: look, Bug: look } };
  const seeded = seedFromResolve(
    air,
    { liveCue: { L3: 'c1' }, live: { L3: { data: {}, state: { groups: {} }, event: 5 } } },
    [],
    { moves: 0, commands: 0 },
    [{ id: 'c1', values: {} }],
    { clocks: new Map(), pairs: new Map() },
  );
  assert.equal('L3' in seeded.looks, false, 'reset elsewhere: cleared');
  assert.deepEqual(seeded.looks.Bug, look, 'a graphic with no report keeps what this page aired');
  // And a rebuild after an identity sent here never falls back to the boot report's old look.
  const rebuilt = restoreItems({ ...NO_AIR, liveCue: { L3: 'c1' }, aired: { L3: {} }, looks: {}, reports: { L3: { state: { appearance: look } } } }, {}, { clocks: new Map(), pairs: new Map() });
  assert.equal(rebuilt.items[0].msg.appearance, undefined);
});

test('a command applied while the read was out keeps what this page believes is applied', () => {
  const look = { v: 1, frame: { dx: 10, dy: 0, s: 1, ox: 0, oy: 0 } };
  const seeded = seedFromResolve(
    { ...NO_AIR, looks: { L3: look }, commands: 1 },
    { liveCue: { L3: 'c1' }, live: { L3: { data: {}, state: {}, event: 5 } } },
    [],
    { moves: 0, commands: 0 },
    [{ id: 'c1', values: {} }],
    { clocks: new Map(), pairs: new Map() },
  );
  assert.deepEqual(seeded.looks.L3, look, 'the older report does not clear it');
});

describe('measurements: identified and qualified', () => {
  test('one qualify rule for both measurers: agree, ask again, or give up after three', () => {
    const a = { info: { x: 0, y: 0, w: 100, h: 10 }, paint: null, minText: 20 };
    const b = { ...a, info: { ...a.info, x: 30 } };
    assert.deepEqual(A.qualifyStep(null, a, 0), { again: a, tries: 0 });
    assert.deepEqual(A.qualifyStep(a, a, 0), { done: a });
    assert.deepEqual(A.qualifyStep(a, b, 0), { again: b, tries: 1 });
    assert.deepEqual(A.qualifyStep(a, b, 2), { giveUp: true });
    assert.equal(A.QUALIFY_GAP_MS, 250);
  });

  test('a longer name, a new copy or another stage is another identity', () => {
    const id = A.measureId('g', 't1', 'c', { f0: 'Ann' }, HD);
    assert.notEqual(A.measureId('g', 't1', 'c', { f0: 'Annabel' }, HD), id);
    assert.notEqual(A.measureId('g', 't2', 'c', { f0: 'Ann' }, HD), id);
    assert.equal(A.measureId('g', 't1', 'c', { f0: 'Ann' }, HD), id);
  });

  test('two answers keep only what agrees within 1 px', () => {
    const a = { info: { x: 0, y: 0, w: 100, h: 10 }, paint: { x: 0, y: 0, w: 200, h: 20 }, minText: 20 };
    const moving = { info: { x: 40, y: 0, w: 100, h: 10 }, paint: { x: 0, y: 0, w: 200.5, h: 20 }, minText: 20 };
    assert.deepEqual(A.qualify(a, moving), { info: null, paint: moving.paint, minText: 20 });
    const off = (n) => ({ ...a, info: { ...a.info, x: n } });
    assert.notEqual(A.qualify(a, off(1)).info, null, '1 px agrees');
    assert.equal(A.qualify(a, off(1.5)).info, null, '1.5 px does not');
  });

  test('the session keeps the last measurement of a cue while its new identity is measured', () => {
    let part = G.NO_GEOMETRY;
    part = G.measured(part, 'c1', 'g', 'id1', strap());
    assert.deepEqual(G.geometryOf(part, 'c1', 'g', 'id1'), { m: strap(), fresh: true });
    assert.deepEqual(G.geometryOf(part, 'c1', 'g', 'id2'), { m: strap(), fresh: false }, 'stale: the last placement');
    assert.deepEqual(G.geometryOf(part, 'c2', 'g', 'x'), { m: strap(), fresh: false }, 'never measured: its graphic\'s newest');
  });

  test('a change waits while what a Take would send differs from what is applied; nothing waits unadjusted', () => {
    const look = { v: 1, frame: { dx: 10, dy: 0, s: 1, ox: 0, oy: 0 } };
    assert.equal(G.placeWaiting({ send: undefined }, undefined), false);
    assert.equal(G.placeWaiting({ send: look }, look), false);
    assert.equal(G.placeWaiting({ send: look }, undefined), true);
    assert.equal(G.placeWaiting({ send: A.IDENTITY }, look), true, 'a reset waits too');
    assert.equal(G.placeWaiting({ send: A.IDENTITY }, undefined), false);
  });

  test('a Take of a placed cue nothing measured yet is measured first, and waits only so long', async () => {
    const part = storePart(G.NO_GEOMETRY);
    const asked = [];
    const answers = new Map();
    const measurer = G.createMeasurer(part, {
      measure: (input) => {
        asked.push(input);
        return new Promise((resolve) => answers.set(input, () => resolve(strap())));
      },
    });
    // Three cues waiting; the first is being measured when the Take of the third arrives.
    measurer.want(['a', 'b', 'c'].map((id) => ({ cueId: id, graphicId: 'g', id: `${id}1`, input: id })));
    let done = false;
    const taking = measurer.now({ cueId: 'c', graphicId: 'g', id: 'c1', input: 'c' }, 1000).then(() => (done = true));
    answers.get('a')();
    await new Promise((r) => setTimeout(r, 0));
    assert.deepEqual(asked, ['a', 'c'], 'the Take\'s cue goes before b');
    assert.equal(done, false, 'another cue\'s answer does not release it');
    answers.get('c')();
    await taking;
    assert.equal(part.get().byCue.c.id, 'c1');
    // A document that never answers holds a Take for the cap only.
    const stuck = G.createMeasurer(storePart(G.NO_GEOMETRY), { measure: () => new Promise(() => {}) });
    const t = Date.now();
    await stuck.now({ cueId: 'x', graphicId: 'g', id: 'x1', input: 1 }, 40);
    assert.ok(Date.now() - t < 1000);
  });

  test('a Take waits for its own identity, not an older attempt of the same cue', async () => {
    const part = storePart(G.NO_GEOMETRY);
    const answers = new Map();
    const measurer = G.createMeasurer(part, { measure: (input) => new Promise((resolve) => answers.set(input, () => resolve(strap()))) });
    // The first identity is being measured when the values change and a Take asks for the new one.
    measurer.want([{ cueId: 'c', graphicId: 'g', id: 'old', input: 'old' }]);
    let done = false;
    const taking = measurer.now({ cueId: 'c', graphicId: 'g', id: 'new', input: 'new' }, 1000).then(() => (done = true));
    answers.get('old')();
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(done, false, 'the old attempt ending does not release the Take');
    answers.get('new')();
    await taking;
    assert.equal(part.get().byCue.c.id, 'new');
  });

  test('a longer name typed just before a Take is measured first, and the edge lands on the inset', async () => {
    const graphic = { id: 'g', savedAt: 's1', adjust: { v: 1, place: 'br', anchor: 'bl' } };
    const cue = { id: 'c' };
    const idOf = (values) => A.measureId('g', 's1', 'c', values, HD);
    const stateOf = (values, part) => G.cueAdjustState(graphic, cue, HD, HD, values, part.get(), undefined, false);
    const longer = { ...LT, w: 520 };
    const part = storePart(G.measured(G.NO_GEOMETRY, 'c', 'g', idOf({ name: 'Ann' }), strap()));
    assert.equal(G.pressWaitsForBox(stateOf({ name: 'Ann' }, part)), false, 'measured for these values: no wait');
    const typed = { name: 'Annabel Longname' };
    const stale = stateOf(typed, part);
    assert.equal(G.pressWaitsForBox(stale), true, 'a box for other values makes the press wait');
    assert.ok(right(composed(longer, stale.send.frame)) > 1800 + 100, 'the old box would put the wider strap past the inset');
    const measurer = G.createMeasurer(part, { measure: async () => strap(longer) });
    await measurer.now({ cueId: 'c', graphicId: 'g', id: idOf(typed), input: typed }, 1000);
    const fresh = stateOf(typed, part);
    assert.equal(fresh.fresh, true);
    near(right(composed(longer, fresh.send.frame)), 1800, 'measured again, the edge sits on the inset');
    assert.equal(G.pressWaitsForBox({ eff: eff({ v: 1, x: 4 }, undefined), fresh: false }), false, 'a nudge alone never waits');
    assert.equal(G.pressWaitsForBox({ eff: eff({ v: 1, scale: 0.95 }, undefined), fresh: false }), true, 'a size resolves about the box too');
  });

  test('a press job survives a render that re-wants the background list', async () => {
    const part = storePart(G.NO_GEOMETRY);
    const answers = new Map();
    const measurer = G.createMeasurer(part, { measure: (input) => new Promise((resolve) => answers.set(input, () => resolve(strap()))) });
    measurer.want([{ cueId: 'c', graphicId: 'g', id: 'page', input: 'page' }]);
    // Publish asks for the refreshed design; a render then wants the page's own list again.
    const publishing = measurer.now({ cueId: 'c', graphicId: 'g', id: 'fresh', input: 'fresh' }, 1000);
    measurer.want([{ cueId: 'c', graphicId: 'g', id: 'page', input: 'page' }]);
    answers.get('page')();
    await new Promise((r) => setTimeout(r, 0));
    assert.ok(answers.has('fresh'), 'the press job is still measured');
    answers.get('fresh')();
    await publishing;
    assert.equal(part.get().byCue.c.id, 'fresh', 'and its answer is kept');
  });

  test('a press: at once when nothing waits, after a queued Adjust write (capped), then after a measurement', async () => {
    const look = (dx) => ({ v: 1, frame: { dx, dy: 0, s: 1, ox: 0, oy: 0 } });
    const state = (send, extra = {}) => ({ eff: eff({ v: 1, x: 4 }, undefined), fresh: true, send, ...extra });
    const io = (over) => ({
      pendingWrites: () => 0,
      settleWrites: () => Promise.resolve(),
      rendered: () => 'rendered',
      stored: () => 'stored',
      stateOf: (record) => state(look(record === 'stored' ? 5 : 4)),
      jobOf: () => undefined,
      now: () => Promise.resolve(),
      setTimeout: (run, ms) => setTimeout(run, ms),
      ...over,
    });
    const caps = { writeMs: 30, measureMs: 30 };
    assert.deepEqual(G.pressAppearance(io({}), caps), look(4), 'nothing queued: the rendered record, with no promise');
    assert.equal(G.pressAppearance(io({ stateOf: () => null }), caps), undefined, 'a production nobody adjusts');
    let settled = false;
    const afterWrite = G.pressAppearance(io({ pendingWrites: () => 1, settleWrites: () => new Promise((r) => setTimeout(() => ((settled = true), r()), 5)) }), caps);
    assert.ok(afterWrite instanceof Promise);
    assert.deepEqual(await afterWrite, look(5), 'a queued write: the stored record');
    assert.equal(settled, true, 'read after the write landed');
    const t = Date.now();
    assert.deepEqual(await G.pressAppearance(io({ pendingWrites: () => 1, settleWrites: () => new Promise(() => {}) }), caps), look(5), 'a write that never lands holds it only so long');
    assert.ok(Date.now() - t < 1000);
    // A preset with a box for other values waits for the measurement, then reads again.
    let measuredNow = false;
    const placed = (fresh) => ({ eff: eff({ v: 1, place: 'br' }, undefined), fresh, send: look(fresh ? 9 : 1) });
    const waited = await G.pressAppearance(
      io({ stateOf: () => placed(measuredNow), jobOf: () => ({ cueId: 'c', graphicId: 'g', id: 'x', input: 1 }), now: async () => void (measuredNow = true) }),
      caps,
    );
    assert.deepEqual(waited, look(9));
  });

  test('Publish waits for the measurer only so long', async () => {
    const part = storePart(G.NO_GEOMETRY);
    const measurer = G.createMeasurer(part, { measure: () => new Promise(() => {}) });
    measurer.want([{ cueId: 'c1', graphicId: 'g', id: 'x', input: 1 }]);
    const t = Date.now();
    await measurer.drain(30);
    assert.ok(Date.now() - t < 1000);
  });

  test('the background measurer drops an answer for an identity no longer wanted', async () => {
    const part = storePart(G.NO_GEOMETRY);
    const answers = [];
    const measurer = G.createMeasurer(part, { measure: (input) => new Promise((resolve) => answers.push(() => resolve(strap({ ...LT, w: input })))) });
    measurer.want([{ cueId: 'c1', graphicId: 'g', id: 'old', input: 100 }]);
    measurer.want([{ cueId: 'c1', graphicId: 'g', id: 'new', input: 200 }]);
    answers.shift()();
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(part.get().byCue.c1, undefined, 'the old answer is not kept');
    answers.shift()();
    await measurer.drain(1000);
    assert.equal(part.get().byCue.c1.id, 'new');
    assert.equal(part.get().byCue.c1.m.info.w, 200);
  });
});

describe('the merge never deletes a cue exception (both probes)', () => {
  const AT = '2026-10-25T00:00:00.000Z';
  const doc = (graphicAdjust, cueAdjust, extra = {}) => ({
    id: 's',
    name: 'Show',
    updatedAt: '2026-10-24T00:00:00.000Z',
    graphics: [{ id: 'g', name: 'Strap', layer: 20, ...(graphicAdjust ? { adjust: graphicAdjust } : {}), ...(extra.layer ? { layer: extra.layer } : {}) }],
    cues: [{ id: 'c1', sourceId: 'g', label: extra.label ?? 'One', values: {}, ...(cueAdjust ? { adjust: cueAdjust } : {}) }],
  });
  const exception = { v: 1, place: 'br' };

  test('a promotion against a concurrent pool-layer edit keeps the exception', () => {
    const base = doc(undefined, exception);
    const ours = doc(exception, undefined);
    const theirs = doc(undefined, exception, { layer: 30 });
    const { doc: merged, lost } = mergeTeamShow(base, ours, theirs, AT);
    assert.equal(merged.graphics[0].layer, 30, 'their layer stands');
    assert.deepEqual(merged.cues[0].adjust, exception, 'the exception is kept, not deleted');
    assert.ok(lost.length > 0, 'the loss of the default is named');
  });

  test('a promotion against a concurrent cue-text edit keeps the new default and the old exception', () => {
    const base = doc(undefined, exception);
    const ours = doc(exception, undefined);
    const theirs = doc(undefined, exception, { label: 'Renamed' });
    const { doc: merged } = mergeTeamShow(base, ours, theirs, AT);
    assert.deepEqual(merged.graphics[0].adjust, exception);
    assert.deepEqual(merged.cues[0].adjust, exception, 'kept: it equals the default and one press clears it');
  });

  test('an operator\'s own reset is not undone by a merge', () => {
    const base = doc(undefined, exception);
    const ours = doc(undefined, undefined);
    const theirs = doc(undefined, exception, { layer: 30 });
    assert.equal(mergeTeamShow(base, ours, theirs, AT).doc.cues[0].adjust, undefined);
  });
});

describe('lifecycle: copy and paste, undo of a graphic on air', () => {
  test('copy and paste copies the cue record', () => {
    const record = { id: 's', cues: [{ id: 'a', sourceId: 'g', label: 'A', values: {}, adjust: { v: 1, place: 'br' } }], folders: [], graphics: [{ id: 'g' }] };
    const out = pasteCopies(record, copyClip(record, ['a']), { after: 'a' }, () => 'n1');
    assert.deepEqual(out.cues[1].adjust, { v: 1, place: 'br' });
  });

  test('undoing an adjustment of a graphic on air is allowed; another change of it is not', () => {
    const slice = (adj, layer = 20) => ({ cues: [], folders: [], graphics: [{ id: 'g', name: 'G', layer, ...(adj ? { adjust: adj } : {}) }], playoutItems: [] });
    const live = { cues: new Set(), sources: new Set(['g']), folders: new Set(), unidentifiedServer: false };
    assert.equal(liveRundownRefusal(slice({ v: 1, x: 3 }), slice(undefined), live), null);
    assert.match(liveRundownRefusal(slice(undefined), slice(undefined, 21), live), /off air/);
  });
});

// ── The doors on the record (model/shows.ts), bundled for Node as legacy-sheet-block.test.mjs does ──
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = mkdtempSync(path.join(tmpdir(), 'cue-adjust-'));
after(() => rmSync(dir, { recursive: true, force: true }));

async function loadShowsModule() {
  const bundle = await rolldown({ input: path.join(root, 'src/model/shows.ts'), platform: 'node', plugins: [rawSuffix], logLevel: 'silent' });
  const { output } = await bundle.generate({ format: 'esm', codeSplitting: false });
  await bundle.close();
  const file = path.join(dir, 'shows.mjs');
  writeFileSync(file, output[0].code);
  return import(pathToFileURL(file).href);
}

test('the doors: graphic default, cue exception, promotion in one write, reset, and a later version refused at each', async () => {
  const stored = new Map();
  const previous = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: (k) => stored.get(k) ?? null,
    setItem: (k, v) => stored.set(k, String(v)),
    removeItem: (k) => stored.delete(k),
    key: (i) => [...stored.keys()][i] ?? null,
    get length() {
      return stored.size;
    },
  };
  try {
    const shows = await loadShowsModule();
    const template = { name: 'Strap', type: 'lowerThird', resolution: { width: 1920, height: 1080, label: '1080p' }, fps: 50, html: '<div></div>', css: '', js: '', fields: [{ field: 'f0', ftype: 'textfield', title: 'Name', value: '' }], settings: {}, assets: [], layers: [] };
    const show = shows.createShowNamed('Adjust');
    shows.addGraphicToShow(show.id, template);
    const read = () => shows.loadShows().find((s) => s.id === show.id);
    const g = read().graphics[0];
    const [c1] = read().cues;
    shows.addShowCue(show.id, g.id);
    const c2 = read().cues[1];

    assert.equal(shows.setGraphicAdjust(show.id, g.id, { place: 'bl', anchor: 'bl' }).error, null);
    assert.equal(shows.setCueAdjust(show.id, c2.id, { place: 'br' }).error, null);
    assert.deepEqual(read().cues[1].adjust, { v: 1, place: 'br' });

    // Promotion from cue 2: one write (one stamp), default takes its members, its record goes.
    const before = read().updatedAt;
    await new Promise((r) => setTimeout(r, 2));
    assert.equal(shows.promoteCueAdjust(show.id, c2.id).error, null);
    const promoted = read();
    assert.notEqual(promoted.updatedAt, before);
    assert.deepEqual(promoted.graphics[0].adjust, { v: 1, place: 'br', anchor: 'bl' });
    assert.equal(promoted.cues[1].adjust, undefined);

    // Re-adding the graphic by name keeps its record, as it keeps its layer.
    shows.addGraphicToShow(show.id, { ...template, html: '<div>new</div>' });
    assert.deepEqual(read().graphics[0].adjust, { v: 1, place: 'br', anchor: 'bl' });
    // Publish's refresh replaces the template and keeps the record.
    shows.refreshGraphicCopies(show.id, () => ({ template: { ...template, html: '<div>pub</div>' }, updatedAt: '2099-01-01T00:00:00.000Z' }));
    assert.deepEqual(read().graphics[0].adjust, { v: 1, place: 'br', anchor: 'bl' });
    // A duplicate carries every record.
    shows.setCueAdjust(show.id, c1.id, { y: -20 });
    const copy = shows.duplicateShowChecked(show.id).show;
    assert.deepEqual(copy.graphics[0].adjust, read().graphics[0].adjust);
    assert.deepEqual(copy.cues[0].adjust, { v: 1, y: -20 });

    // Steps add to the record as it stands when each write runs: three quick presses are 3 px,
    // at the cue's scope from the inherited x, and a size step from the inherited scale.
    shows.setGraphicAdjust(show.id, g.id, { x: 10, scale: 0.9 });
    for (let i = 0; i < 3; i++) shows.stepAdjust(show.id, c1.id, 'cue', { x: -1 });
    shows.stepAdjust(show.id, c1.id, 'cue', { scale: -0.05 });
    assert.deepEqual(read().cues[0].adjust, { v: 1, y: -20, x: 7, scale: 0.85 });
    shows.setCueAdjust(show.id, c1.id, { x: null, scale: null });

    // Reset at the graphic reveals as designed; the cue's own stays.
    shows.setGraphicAdjust(show.id, g.id, null);
    assert.equal(read().graphics[0].adjust, undefined);
    assert.deepEqual(read().cues[0].adjust, { v: 1, y: -20 });

    // A later version's record is refused at every door.
    const all = JSON.parse(stored.get('spx-gfx-shows'));
    const mine = all.find((s) => s.id === show.id);
    mine.graphics[0].adjust = { v: 2, place: 'tr' };
    mine.cues[0].adjust = { v: 2, place: 'tr' };
    stored.set('spx-gfx-shows', JSON.stringify(all));
    assert.equal(shows.setGraphicAdjust(show.id, g.id, { x: 1 }).error, adjust.ADJUST_READ_ONLY);
    assert.equal(shows.setGraphicAdjust(show.id, g.id, null).error, adjust.ADJUST_READ_ONLY);
    assert.equal(shows.setCueAdjust(show.id, c1.id, { x: 1 }).error, adjust.ADJUST_READ_ONLY);
    assert.equal(shows.setCueAdjust(show.id, c1.id, null).error, adjust.ADJUST_READ_ONLY);
    assert.equal(shows.promoteCueAdjust(show.id, c1.id).error, adjust.ADJUST_READ_ONLY);
    assert.deepEqual(read().graphics[0].adjust, { v: 2, place: 'tr' }, 'kept as it was');
  } finally {
    globalThis.localStorage = previous;
  }
});

// ── Phase 1b: documents that are the page ───────────────────────────────────────────────────────

const X = await import('../src/control/exportAppearance.ts');
const R = await import('../src/control/appearanceRuntime.ts');
const { localReceiverJs } = await import('../src/control/localReceiver.ts');
const { createHash } = await import('node:crypto');

describe('the export resolver (phase 1b)', () => {
  const HD720 = { width: 1280, height: 720 };
  const frames = { a: HD, b: HD, p: HD720 };
  const show = {
    graphics: [{ id: 'a', adjust: { v: 1, place: 'br', scale: 0.9, anchor: 'bl' } }, { id: 'b' }, { id: 'p', adjust: { v: 1, place: 'br' } }],
    cues: [
      { id: 'a1', sourceId: 'a' },
      { id: 'a2', sourceId: 'a', adjust: { v: 1, place: 'bl', scale: 1 } },
      { id: 'b1', sourceId: 'b' },
      { id: 'clip', sourceId: 'a', source: 'playout' },
      { id: 'p1', sourceId: 'p' },
    ],
  };
  const measured = { graphics: { a: strap(), p: strap({ x: 80, y: 581, w: 300, h: 60 }) }, cues: { a1: strap(), a2: strap(LT) } };
  const out = X.exportAppearances(show, (id) => frames[id], measured);

  test('a production nobody adjusted gets nothing, so every package stays what it was', () => {
    assert.equal(X.exportAppearances({ graphics: [{ id: 'b' }], cues: [{ id: 'b1', sourceId: 'b' }] }, () => HD, { graphics: {}, cues: {} }), undefined);
    assert.equal(out.graphics.b, undefined, 'an unadjusted graphic beside adjusted ones bakes nothing');
    assert.equal(out.cues.b1, undefined, 'and its cues carry no field (rule 2: never adjusted, nothing sent)');
    assert.equal(out.cues.clip, undefined, 'a playout-server clip has no appearance');
  });

  test('the graphic level is the default alone, the cue level the fold, each against its own box', () => {
    const g = out.graphics.a.frame;
    const c = composed(LT, g);
    near(right(c), 1920 - 120, 'the default puts the strap\'s right edge at the safe inset');
    near(c.w, LT.w * 0.9, 'and shrinks it 10 %');
    assert.deepEqual(out.cues.a1, out.graphics.a, 'a cue with no exception carries the default');
    const own = composed(LT, out.cues.a2.frame);
    near(own.x, 120, 'the exception\'s place');
    near(own.w, LT.w, 'and its own size');
  });

  test('a graphic in a package is its own page: a 720p graphic places against its own safe area', () => {
    const c = composed({ x: 80, y: 581, w: 300, h: 60 }, out.graphics.p.frame);
    near(right(c), 1280 - 80, '720p safe inset is 120 x 1280/1920');
    near(bottom(c), 720 - 119 * (720 / 1080), 'and its bottom inset');
  });

  test('an identity travels when the fold moves nothing, and a later version applies nothing', () => {
    const s = { graphics: [{ id: 'a', adjust: { v: 1, x: 0 } }, { id: 'n', adjust: { v: 2, place: 'tr' } }], cues: [{ id: 'n1', sourceId: 'n' }] };
    const r = X.exportAppearances(s, () => HD, { graphics: {}, cues: {} });
    assert.deepEqual(r.graphics.a, { v: 1 });
    assert.deepEqual(r.graphics.n, { v: 1 }, 'a record from a later build is kept on the show and moves nothing here');
    assert.deepEqual(r.cues.n1, { v: 1 });
  });

  test('a preset, a size or a sideways nudge needs a box; a nudge down does not', () => {
    assert.equal(X.needsBox({ v: 1, y: 4 }), false);
    assert.equal(X.needsBox({ v: 1, x: 0 }), false);
    assert.equal(X.needsBox({ v: 1, x: 4 }, { v: 1, scale: 0.95 }), true);
    assert.equal(X.needsBox(undefined, { v: 1, place: 'tl' }), true);
    assert.equal(X.needsBox({ v: 1, scale: 1 }), false);
  });

  test('a band spanning the frame drops a sideways nudge in a package, as on the stage', () => {
    assert.equal(X.needsBox({ v: 1, x: 40 }), true, 'so the export measures it');
    const band = { info: { x: 0, y: 900, w: 1920, h: 120 }, paint: { x: 0, y: 900, w: 1920, h: 120 } };
    const r = X.exportAppearances({ graphics: [{ id: 'w', adjust: { v: 1, x: 40, y: -20 } }] }, () => HD, { graphics: { w: band }, cues: {} });
    assert.equal(r.graphics.w.frame.dx, 0, 'no horizontal move: it would cut the band\'s edge');
    assert.equal(r.graphics.w.frame.dy, -20, 'the nudge up still applies');
  });
});

describe('the bake and the root runtime (phase 1b)', () => {
  test('a package nobody adjusted bakes nothing; an adjusted one bakes one tagged script', () => {
    assert.deepEqual(R.bakeAppearance(undefined), []);
    assert.deepEqual(R.bakeAppearance({ v: 1 }), [], 'an identity bakes nothing');
    const look = { v: 1, frame: { dx: -40, dy: 12, s: 0.9, ox: 120, oy: 961 } };
    const [bake, ...rest] = R.bakeAppearance(look);
    assert.equal(rest.length, 0);
    assert.equal(bake.id, R.APPEARANCE_SCRIPT_ID);
    assert.ok(bake.js.endsWith(`noacgApplyAppearance(${JSON.stringify(look)});`));
    assert.doesNotThrow(() => new Function(bake.js), 'it parses');
  });

  test('what the bake and the relay receiver emit is ES5, for CasparCG 2.3\'s Chromium 71', () => {
    const look = { v: 1, frame: { dx: 1, dy: 2, s: 0.5, ox: 3, oy: 4 } };
    for (const [what, js] of [['the bake', R.bakeAppearance(look)[0].js], ['the relay receiver', localReceiverJs('X', { appearance: true })]]) {
      // No arrows, let/const, template strings or optional chaining (scripts/spx-text.test.mjs).
      assert.doesNotMatch(js, /=>|\blet\b|\bconst\b|`|\?\./, what);
    }
  });

  test('the relay receiver of a production nobody adjusted keeps its bytes (AC-10)', () => {
    // The block every overlay package carried before phase 1b, byte for byte: a change here is a
    // change to every package nobody adjusted. Pinned on main 9866960 before this row's edit.
    const plain = localReceiverJs('Anchor Strap');
    assert.equal(createHash('sha256').update(plain).digest('hex'), '055ccc2ba4661d16caffc1a775b4410199c166836fb4b35928d5a361c43d907e');
    assert.ok(!plain.includes('noacgApplyAppearance'), 'it ignores an appearance on a row (the rollback rule)');
    const placed = localReceiverJs('Anchor Strap', { appearance: true });
    assert.ok(placed.includes('noacgApplyAppearance(m.appearance)'));
    assert.doesNotThrow(() => new Function(placed));
  });

  test('the transformed root maps every rect read back to its untransformed box', () => {
    // A minimal DOM: elements report rects through the host's transform, as Chromium does; the
    // runtime must answer the box the element had before it, in a document of its own (k 1, at 0)
    // and inside a renderer page that scales and offsets the host itself (an OGraf canvas).
    const saved = { Element: globalThis.Element, Range: globalThis.Range, DOMRect: globalThis.DOMRect, document: globalThis.document };
    try {
      globalThis.DOMRect = class { constructor(x, y, w, h) { Object.assign(this, { left: x, top: y, width: w, height: h }); } };
      let place = { k: 1, x: 0, y: 0 };
      let host;
      const transformed = (r) => {
        const f = host.f;
        const t = (v, o, d) => (f ? o + d + f.s * (v - o) : v);
        const x1 = t(r.x, f?.ox, f?.dx), y1 = t(r.y, f?.oy, f?.dy);
        const w = f ? r.w * f.s : r.w, h = f ? r.h * f.s : r.h;
        return new DOMRect(place.x + place.k * x1, place.y + place.k * y1, place.k * w, place.k * h);
      };
      globalThis.Element = class {
        constructor(parent, box) { this.parentNode = parent; this.box = box; this.nodeType = 1; this.isConnected = true; this.style = {}; }
        getRootNode() { return 'doc'; }
        contains(n) { for (let p = n; p; p = p.parentNode) if (p === this) return true; return false; }
        get offsetWidth() { return this.box.w; }
        getBoundingClientRect() { return transformed(this.box); }
        getClientRects() { return [transformed(this.box)]; }
      };
      globalThis.Range = class {
        constructor(node, box) { this.commonAncestorContainer = node; this.box = box; }
        getBoundingClientRect() { return transformed(this.box); }
        getClientRects() { return [transformed(this.box)]; }
      };
      host = new globalThis.Element(null, { x: 0, y: 0, w: 1920, h: 1080 });
      globalThis.document = { documentElement: host };
      const apply = new Function(`${R.APPEARANCE_RUNTIME_JS}\nreturn noacgApplyAppearance;`)();
      const child = new globalThis.Element(host, { x: 120, y: 872, w: 410, h: 89 });
      const text = { nodeType: 3, parentNode: child };
      const outside = new globalThis.Element(null, { x: 5, y: 6, w: 7, h: 8 });
      const same = (r, b, msg) => ['left', 'top', 'width', 'height'].forEach((k, i) => near(r[k], [b.x, b.y, b.w, b.h][i], `${msg} ${k}`));

      const f = { dx: -137, dy: -61, s: 0.85, ox: 600, oy: 900 };
      assert.equal(apply({ v: 1, frame: f }), true);
      host.f = f;
      assert.equal(host.style.transform, 'translate(-137px, -61px) scale(0.85)');
      assert.equal(host.style.transformOrigin, '600px 900px');
      assert.equal(host.style.clipPath, 'inset(0)');
      same(child.getBoundingClientRect(), child.box, 'element rect');
      same(child.getClientRects()[0], child.box, 'element client rect');
      same(new globalThis.Range(text, child.box).getBoundingClientRect(), child.box, 'range rect');
      same(host.getBoundingClientRect(), host.box, 'the root itself');
      // A renderer that draws the host at half size, 100 px in: the inverse holds through it.
      place = { k: 0.5, x: 100, y: 50 };
      const r = child.getBoundingClientRect();
      same({ left: (r.left - 100) / 0.5, top: (r.top - 50) / 0.5, width: r.width / 0.5, height: r.height / 0.5 }, child.box, 'inside a scaled renderer');
      place = { k: 1, x: 0, y: 0 };
      // An element outside the host is never touched.
      host.f = f;
      assert.deepEqual(outside.getBoundingClientRect(), transformed(outside.box));

      // Rule 3: a second appearance replaces the first; an identity clears it; an unknown version
      // or a malformed frame is ignored and the call says so.
      const g = { dx: 10, dy: 0, s: 1, ox: 0, oy: 0 };
      assert.equal(apply({ v: 1, frame: g }), true);
      host.f = g;
      assert.equal(host.style.transform, 'translate(10px, 0px) scale(1)');
      same(child.getBoundingClientRect(), child.box, 'after a replace');
      assert.equal(apply({ v: 2, frame: f }), false);
      assert.equal(apply({ v: 1, frame: { dx: 1 } }), false);
      assert.equal(apply.readable({ v: 1, frame: { dx: 1 } }), false, 'what the relay receiver keeps in its baseline');
      assert.equal(apply.readable({ v: 1 }), true);
      // A host that left the page leaves the list at the next apply (an OGraf offline render
      // claims a canvas per frame and reads no rect in this realm).
      const hosts = globalThis.Element.prototype.__noacgAppearanceHosts;
      const canvas = new globalThis.Element(null, { x: 0, y: 0, w: 100, h: 100 });
      apply({ v: 1, frame: g }, canvas);
      canvas.isConnected = false;
      const before = hosts.length;
      apply({ v: 1, frame: g });
      assert.equal(hosts.length, before - 1, 'the detached canvas is gone');
      assert.equal(host.style.transform, 'translate(10px, 0px) scale(1)', 'what was applied stays');
      assert.equal(apply({ v: 1 }), true);
      host.f = undefined;
      assert.equal(host.style.transform, '');
      assert.equal(host.style.clipPath, '');
      same(child.getBoundingClientRect(), child.box, 'untransformed reads are the plain ones');
    } finally {
      Object.assign(globalThis, saved);
    }
  });
});

describe('type and colour (phase 2): the record, the fold, the resolve', () => {
  const archivo = { fontId: 'archivo' };
  const brand = { family: 'Brand Sans', assetPath: 'fonts/brand-sans.woff2' };

  test('the reader keeps style members it can apply and drops the rest', () => {
    const read = adjust.readAdjust({
      v: 1,
      vars: { accent: '#ff7a00', 'text-color': '', 'font-heading': 'Comic', bogus: '1', 'panel-bg': 'red; } body { x', 'display-weight': '700' },
      font: archivo,
      keepStyle: true,
    });
    assert.deepEqual(read.record, { v: 1, vars: { accent: '#ff7a00', 'text-color': '', 'display-weight': '700' }, font: archivo, keepStyle: true },
      'font-heading follows font, an unknown name and a value that could leave its declaration are not read; an empty value (as designed) is');
    assert.deepEqual(adjust.readAdjust({ v: 1, font: 'designed' }).record.font, 'designed');
    assert.equal(adjust.readAdjust({ v: 1, font: { family: 'X', assetPath: '../../etc' } }).record.font, undefined, 'an asset path outside fonts/');
    assert.equal(adjust.readAdjust({ v: 1, font: { fontId: 'Archivo Black!' } }).record.font, undefined);
  });

  test('a patch merges variables key by key; a null removes one key, then the member', () => {
    let r = adjust.patchAdjust(undefined, { vars: { accent: '#f00' } });
    r = adjust.patchAdjust(r, { vars: { 'text-color': '#fff' }, font: archivo });
    assert.deepEqual(r, { v: 1, vars: { accent: '#f00', 'text-color': '#fff' }, font: archivo });
    r = adjust.patchAdjust(r, { vars: { accent: null, 'text-color': null } });
    assert.deepEqual(r, { v: 1, font: archivo });
    assert.equal(adjust.patchAdjust(r, { font: null }), undefined);
    assert.equal(adjust.patchAdjust({ v: 2 }, { vars: { accent: '#f00' } }), adjust.ADJUST_READ_ONLY, 'a later record is refused');
  });

  test('AC-6: a cue overrides the graphic per property, inherits the rest, and its reset reveals the graphic', () => {
    const graphic = { v: 1, vars: { accent: '#ff7a00', 'display-weight': '800' }, font: archivo };
    const cueAccent = { v: 1, vars: { accent: '#00aaff' } };
    let e = eff(graphic, cueAccent);
    assert.deepEqual(e.vars, { accent: '#00aaff', 'display-weight': '800' }, 'the cue sets the accent alone');
    assert.deepEqual(e.font, archivo, 'and still takes the graphic\'s face');
    assert.ok(e.own.includes('vars') && !e.own.includes('font'));
    // "As designed" at the cue: the cue masks the graphic's value with an empty one.
    e = eff(graphic, { v: 1, vars: { accent: '' }, font: 'designed', keepStyle: true });
    const style = St.resolveStyle(e, []);
    assert.deepEqual(style.vars, { 'display-weight': '800' }, 'the design\'s accent and face, the graphic\'s weight');
    assert.equal(style.fonts, undefined);
    // Reset of the cue (its record removed) reveals the graphic's.
    e = eff(graphic, undefined);
    assert.equal(St.resolveStyle(e, []).vars.accent, '#ff7a00');
    // Promotion moves the cue's style onto the graphic in one record.
    assert.deepEqual(adjust.patchAdjust(graphic, { vars: { accent: '#00aaff' } }).vars, { accent: '#00aaff', 'display-weight': '800' });
  });

  test('a bundled face resolves to its stack, its numbers and both its files; never bytes', () => {
    const style = St.resolveStyle(eff({ v: 1, font: archivo }, undefined), []);
    assert.equal(style.vars['font-heading'], fontStack(fontById('archivo')));
    assert.equal(style.vars['font-numeric'], 'var(--font-heading)', 'Archivo holds a digit\'s width itself');
    assert.deepEqual(style.fonts, [
      { family: 'Archivo', src: 'fonts/archivo.woff2', weight: [400, 900] },
      { family: 'Archivo', src: 'fonts/archivo-latin-ext.woff2', weight: [400, 900], unicodeRange: LATIN_EXT_RANGE },
    ]);
    // Oswald's numbers are set in its paired sibling, which ships too.
    const oswald = St.resolveStyle(eff({ v: 1, font: { fontId: 'oswald' } }, undefined), []);
    assert.deepEqual(oswald.fonts.map((f) => f.src), ['fonts/oswald.woff2', 'fonts/oswald-latin-ext.woff2', 'fonts/saira.woff2', 'fonts/saira-latin-ext.woff2']);
    assert.match(oswald.vars['font-numeric'], /Saira/);
    // A static face declares every weight, so no request is a synthesised bold (phase 0 item 2).
    const bebas = St.resolveStyle(eff({ v: 1, font: { fontId: 'bebas-neue' } }, undefined), []);
    assert.deepEqual(bebas.fonts[0].weight, [100, 900]);
  });

  test('the heading weight goes as written; an imported face declares 100-900 and offers Regular', () => {
    const w = (font, weight, imported = []) =>
      St.resolveStyle(eff({ v: 1, font, vars: { 'display-weight': weight } }, undefined), imported).vars['display-weight'];
    // Never clamped: the token weights a sibling's numbers too (Saira under Oswald reaches 900),
    // and a static face declares every weight, so 800 on Bebas Neue is drawn as the file is.
    assert.equal(w({ fontId: 'oswald' }, '800'), '800');
    assert.equal(w({ fontId: 'bebas-neue' }, '800'), '800');
    const imported = [{ family: 'Brand Sans', assetPath: 'fonts/brand-sans.woff2' }];
    assert.deepEqual(St.weightsFor({ family: 'Brand Sans', assetPath: 'fonts/brand-sans.woff2' }, {}, imported).map((x) => x.value), [400], 'the Type row offers Regular');
    assert.deepEqual(St.weightsFor({ fontId: 'bebas-neue' }, {}, []).map((x) => x.value), [400]);
    assert.deepEqual(St.weightsFor({ fontId: 'archivo' }, {}, []).map((x) => x.value), [400, 500, 600, 700, 800, 900]);
    const style = St.resolveStyle(eff({ v: 1, font: brand }, undefined), imported);
    // Its digits are not measured even, so the numbers go to the bundled mono, which ships with it.
    assert.match(style.vars['font-numeric'], /JetBrains Mono/);
    assert.deepEqual(style.fonts.map((f) => f.src), ['fonts/brand-sans.woff2', 'fonts/jetbrains-mono.woff2', 'fonts/jetbrains-mono-latin-ext.woff2']);
    assert.deepEqual(style.fonts[0], { family: 'Brand Sans', src: 'fonts/brand-sans.woff2', weight: [100, 900] });
    const even = St.resolveStyle(eff({ v: 1, font: brand }, undefined), [{ ...imported[0], tabularFigures: true }]);
    assert.deepEqual(even.fonts.map((f) => f.src), ['fonts/brand-sans.woff2'], 'even digits stay in the face, so no mono ships');
    assert.equal(St.resolveStyle(eff({ v: 1, font: brand }, undefined), []), null, 'a face no pool graphic ships any more resolves to nothing');
  });

  test('a face pick drops a weight the new face cannot draw, masking the graphic\'s at cue scope', () => {
    const bebas = { fontId: 'bebas-neue' };
    const pick = (weight, scope, graphic) => St.facePickPatch(bebas, weight, scope, graphic, {}, []);
    assert.deepEqual(St.facePickPatch({ fontId: 'oswald' }, '700', 'graphic', {}, {}, []), { font: { fontId: 'oswald' } }, 'a weight the face draws stays');
    assert.deepEqual(pick('', 'cue', {}), { font: bebas }, 'no weight in effect: nothing to drop');
    assert.deepEqual(pick('700', 'graphic', { v: 1, vars: { 'display-weight': '700' } }), { font: bebas, vars: { 'display-weight': null } });
    // The cue inherits the graphic's Extra bold: removing the cue's own key would leave it showing.
    assert.deepEqual(pick('800', 'cue', { v: 1, vars: { 'display-weight': '800' } }), { font: bebas, vars: { 'display-weight': '' } });
    assert.deepEqual(pick('800', 'cue', {}), { font: bebas, vars: { 'display-weight': null } }, 'the cue\'s own weight, nothing under it');
  });

  test('the asset road: bundled files by path, an imported face by its bytes, a face with none left out', () => {
    const style = St.resolveStyle(eff({ v: 1, font: brand }, undefined), [{ family: 'Brand Sans', assetPath: 'fonts/brand-sans.woff2' }]);
    const css = St.facesCss(style.fonts, (src) => (src === 'fonts/brand-sans.woff2' ? 'data:font/woff2;base64,AAAA' : null));
    assert.match(css, /font-family: "Brand Sans"; src: url\("data:font\/woff2;base64,AAAA"\); font-weight: 100 900;/);
    assert.doesNotMatch(St.facesCss(style.fonts, () => null), /Brand Sans/, 'no bytes: no dead declaration (the bundled mono for its numbers stays)');
    const bundled = St.facesCss(St.resolveStyle(eff({ v: 1, font: archivo }, undefined), []).fonts);
    assert.match(bundled, /url\("fonts\/archivo\.woff2"\)/);
    assert.match(bundled, /url\("fonts\/archivo-latin-ext\.woff2"\)[^}]*unicode-range: U\+0100/);
    // An upload keeps its file name, so one called archivo.woff2 is still the imported face: its bytes,
    // never the bundled file of that name.
    const clash = St.resolveStyle(eff({ v: 1, font: { family: 'Custom Archivo', assetPath: 'fonts/archivo.woff2' } }, undefined), [{ family: 'Custom Archivo', assetPath: 'fonts/archivo.woff2' }]);
    assert.match(St.facesCss(clash.fonts, (src) => (src === 'fonts/archivo.woff2' ? 'data:font/woff2;base64,BBBB' : null)), /font-family: "Custom Archivo"; src: url\("data:font\/woff2;base64,BBBB"\)/);
    const pool = [{ css: `/* Imported font (your file). */\n@font-face {\n  font-family: "Brand Sans";\n  src: url("fonts/brand-sans.woff2") format("woff2");\n}`, assets: [{ path: 'fonts/brand-sans.woff2' }] }];
    assert.deepEqual(St.importedFacesOf(pool), [{ family: 'Brand Sans', assetPath: 'fonts/brand-sans.woff2' }]);
    assert.deepEqual(St.importedFacesOf([{ ...pool[0], assets: [] }]), [], 'a face whose file the graphic does not carry is not offered');
    const spaced = 'fonts/My Font.ttf';
    assert.deepEqual(St.importedFacesOf([{ css: pool[0].css.replace('fonts/brand-sans.woff2', spaced), assets: [{ path: spaced }] }]), [], 'a file a record cannot name is not offered');
  });

  test('the wire carries names and numbers only, and a reader keeps what it knows', () => {
    const style = St.resolveStyle(eff({ v: 1, font: archivo, vars: { accent: '#ff7a00' } }, undefined), []);
    const sent = A.appearanceOf({ dx: 10, dy: 0, s: 1, ox: 0, oy: 0 }, style);
    assert.deepEqual(A.readAppearance(JSON.parse(JSON.stringify({ ...sent, later: { tween: 200 } }))), sent, 'round trip, an unknown member ignored');
    assert.equal(JSON.stringify(sent).includes('base64'), false, 'never bytes');
    assert.equal(A.isIdentity(A.appearanceOf(null, style)), false, 'a style alone is not the identity');
    assert.equal(A.readAppearance({ v: 1, vars: { accent: 'red;}x' } }), null, 'a value that could leave its declaration');
    for (const fetches of ['url(x.png)', 'image-set("https://x/y.png" 1x)', '-webkit-image-set("y.png" 1x)', 'image("y.png")', 'src("y.png")']) {
      assert.equal(A.readAppearance({ v: 1, vars: { 'panel-bg': fetches } }), null, `a value that fetches: ${fetches}`);
      assert.equal(adjust.readAdjust({ v: 1, vars: { 'panel-bg': fetches } }).record.vars, undefined, `nor kept in a record: ${fetches}`);
    }
    assert.deepEqual(A.readAppearance({ v: 1, frame: { dx: 10, dy: 0, s: 1, ox: 0, oy: 0 }, vars: { 'later-var': '1', accent: '#f00' } }), { v: 1, frame: { dx: 10, dy: 0, s: 1, ox: 0, oy: 0 }, vars: { accent: '#f00' } }, 'a variable a later build adds is dropped, never the place and size');
    assert.equal(A.readAppearance({ v: 1, fonts: [{ family: 'A', src: 'https://x/y.woff2', weight: [400, 400] }] }), null, 'a src off the asset road');
    assert.ok(!A.appearanceEquals(sent, A.appearanceOf(sent.frame, null)), 'a change of style alone is a change');
    assert.ok(A.appearanceEquals(sent, A.readAppearance(JSON.parse(JSON.stringify(sent)))));
  });

  test('rule 2 with style: a styled cue sends its style; resetting every scope sends the identity', () => {
    const graphic = { id: 'g1', savedAt: 't', adjust: { v: 1, vars: { accent: '#ff7a00' } } };
    const cue = { id: 'c1' };
    const state = G.cueAdjustState(graphic, cue, HD, HD, {}, G.NO_GEOMETRY, null, false, St.styleContextFor([]));
    assert.deepEqual(state.send, { v: 1, vars: { accent: '#ff7a00' } });
    const reset = G.cueAdjustState({ ...graphic, adjust: undefined }, cue, HD, HD, {}, G.NO_GEOMETRY, state.send, false, St.styleContextFor([]));
    assert.deepEqual(reset.send, A.IDENTITY, 'the applied style is taken off with an explicit identity');
    assert.ok(G.placeWaiting(state, null), 'a style not yet sent waits');
    // The measurement is the style's too: another face reflows the box.
    assert.notEqual(state.styleId, '');
    // A colour moves no text: the box measured in one accent holds for another, so a colour pick
    // never holds a Take for a new measurement. A face or a weight is part of the box's identity.
    const ctx = St.styleContextFor([]);
    const stateWith = (adjust) => G.cueAdjustState({ ...graphic, adjust }, cue, HD, HD, {}, G.NO_GEOMETRY, null, false, ctx);
    assert.equal(state.measureStyleId, '', 'a colour alone is not part of the identity');
    assert.equal(stateWith({ v: 1, vars: { accent: '#00a3ff', 'text-dim': '#ccc' } }).measureStyleId, '');
    const archivo = stateWith({ v: 1, font: { fontId: 'archivo' } }).measureStyleId;
    assert.notEqual(archivo, '');
    assert.equal(stateWith({ v: 1, font: { fontId: 'archivo' }, vars: { accent: '#00a3ff' } }).measureStyleId, archivo, 'a colour beside a face changes nothing');
    assert.notEqual(stateWith({ v: 1, font: { fontId: 'archivo' }, vars: { 'display-weight': '800' } }).measureStyleId, archivo, 'a weight does');
    assert.notEqual(A.measureId('g', 't', 'c', {}, HD, archivo), A.measureId('g', 't', 'c', {}, HD));
  });
});

describe('what an author and an agent learn is adjustable (phase 2)', () => {
  const pack = JSON.parse(readFileSync(new URL('../e2e/fixtures/agent-made/vote-show.noacgpack.json', import.meta.url), 'utf8'));

  test('an agent-made board that paints with the contract is adjustable in what it paints, and validate is quiet', () => {
    assert.equal(pack.graphics.length, 2);
    for (const g of pack.graphics) {
      const reach = St.styleReach(g);
      const line = St.adjustableLine(g);
      assert.ok(line.startsWith('place and size, '), `${g.name}: ${line}`);
      assert.equal(line.includes('typeface'), reach.family, g.name);
      for (const c of St.COLOUR_VARS) assert.equal(reach.colours.includes(c), St.adjustableLine({ ...g, css: g.css.replaceAll(`var(--${c})`, 'red') }) !== line, `${g.name} ${c}`);
      assert.equal(St.styleContractUnpainted(g), null, g.name);
    }
  });

  test('a stylesheet that paints none of it says so in one line, and validate gives one non-blocking finding', () => {
    const css = ':root { --accent: #f00; --font-heading: "Inter"; }\n.box { color: #fff; background: #123; font-family: Arial; }';
    const t = { css, js: '' };
    assert.equal(St.adjustableLine(t), 'place and size; type and colour stay as designed (its stylesheet paints with none of the contract variables)');
    assert.equal(St.styleContractUnpainted(t)?.rule, 'style-contract-unpainted');
    assert.equal(St.adjustableLine(null), St.adjustableLine(t), 'an OGraf manifest read on its own: place and size');
  });

  test('an imported SVG reaches none: its text carries the artwork\'s own face, whatever the canvas reset inherits', () => {
    const css = ':root { --font-heading: "Inter"; --accent: #f00; }\nhtml, body { font-family: var(--font-heading); }';
    assert.equal(St.styleReach({ css, js: '' }).family, true, 'an HTML design inherits the face from the reset');
    assert.equal(St.reachesAny(St.styleReach({ css, js: 'function fitSvgText(el) {}' })), false);
    assert.equal(St.SVG_DESIGN_MARKER, TextFit.SVG_TEXT_FIT_MARKER, 'the marker the imported SVG design emits');
  });
});

describe('the Type row\'s weights (phase 2)', () => {
  const design = (numbers) => ({ 'font-heading': '"Archivo", Arial, sans-serif', ...(numbers ? { 'font-numeric': '"Archivo", Arial, sans-serif' } : {}) });
  const values = (font, d) => St.weightsFor(font, d, []).map((w) => w.value);

  test('a face with one weight offers its numbers\' sibling\'s weights where the design draws live numbers', () => {
    assert.deepEqual(values({ fontId: 'anton' }, design(true)), [400, 500, 600, 700, 800, 900], 'Anton heading, Saira numbers');
    assert.deepEqual(values({ fontId: 'anton' }, design(false)), [400], 'no live numbers: Anton alone, so the row is hidden');
    assert.deepEqual(values({ fontId: 'bebas-neue' }, design(false)), [400]);
    assert.deepEqual(values(undefined, design(false)), values({ fontId: 'archivo' }, design(false)), 'as designed reads the design\'s own face');
  });
});

describe('type and colour in a package (phase 2)', () => {
  test('the export resolves a style alone, with no box, for the graphic and each cue', () => {
    const show = {
      graphics: [{ id: 'g', adjust: { v: 1, vars: { accent: '#ff7a00' }, font: { fontId: 'archivo' } } }],
      cues: [{ id: 'c1', sourceId: 'g' }, { id: 'c2', sourceId: 'g', adjust: { v: 1, vars: { accent: '' } } }],
    };
    const out = X.exportAppearances(show, () => HD, { graphics: {}, cues: {} });
    assert.equal(out.graphics.g.vars.accent, '#ff7a00');
    assert.equal(out.graphics.g.frame, undefined);
    assert.equal(out.cues.c1.vars.accent, '#ff7a00', 'a cue inherits the default');
    assert.equal(out.cues.c2.vars.accent, undefined, 'a cue as designed carries no accent, so the relay takes the default off');
    assert.match(out.cues.c2.vars['font-heading'], /Archivo/);
    assert.equal(X.needsBox(show.graphics[0].adjust), false, 'nothing is measured for a style');
  });

  test('a style alone bakes one tagged script, ES5', () => {
    const [bake, ...rest] = R.bakeAppearance({ v: 1, vars: { accent: '#ff7a00' } });
    assert.equal(rest.length, 0);
    assert.equal(bake.id, R.APPEARANCE_SCRIPT_ID);
    assert.doesNotMatch(bake.js, /=>|\blet\b|\bconst\b|`|\?\./);
  });

  test('the runtime sets the variables on the host and replaces them; a value it cannot set changes nothing', () => {
    const saved = { Element: globalThis.Element, Range: globalThis.Range, document: globalThis.document };
    try {
      const props = new Map();
      const host = { style: { setProperty: (k, v) => props.set(k, v), removeProperty: (k) => props.delete(k) }, isConnected: true };
      globalThis.Element = class {};
      globalThis.Range = class {};
      globalThis.document = { documentElement: host };
      const apply = new Function(`${R.APPEARANCE_RUNTIME_JS}\nreturn noacgApplyAppearance;`)();
      assert.equal(apply({ v: 1, vars: { accent: '#ff7a00', 'font-heading': '"Archivo", Arial, sans-serif' } }), true);
      assert.deepEqual(Object.fromEntries(props), { '--accent': '#ff7a00', '--font-heading': '"Archivo", Arial, sans-serif' });
      // Rule 3: a cue's style from the relay replaces the baked one, never stacks on it.
      apply({ v: 1, vars: { 'text-color': '#fff' } });
      assert.deepEqual(Object.fromEntries(props), { '--text-color': '#fff' });
      assert.equal(apply({ v: 1, vars: { accent: 'red; } body { display: none' } }), false);
      assert.equal(apply({ v: 1, vars: { 'panel-bg': 'image-set("https://x/y.png" 1x)' } }), false, 'a value that fetches');
      assert.deepEqual(Object.fromEntries(props), { '--text-color': '#fff' }, 'kept what it had');
      apply({ v: 1 });
      assert.equal(props.size, 0, 'the identity puts the design back');
    } finally {
      Object.assign(globalThis, saved);
    }
  });

  test('every face a package\'s appearances name ships in it: bundled by reference, imported with its bytes', () => {
    const style = St.resolveStyle(eff({ v: 1, font: { fontId: 'oswald' } }, undefined), []);
    const t = { css: ':root { --font-heading: "Inter", Arial; }', assets: [] };
    const out = St.withAppearanceFaces(t, style.fonts, []);
    for (const f of ['oswald.woff2', 'oswald-latin-ext.woff2', 'saira.woff2', 'saira-latin-ext.woff2']) assert.ok(out.css.includes(`fonts/${f}`), f);
    assert.equal(St.withAppearanceFaces(out, style.fonts, []).css, out.css, 'idempotent');
    const asset = { path: 'fonts/brand.woff2', data: 'data:font/woff2;base64,AAAA' };
    const imported = St.withAppearanceFaces(t, [{ family: 'Brand', src: 'fonts/brand.woff2', weight: [100, 900] }], [{ assets: [asset] }]);
    assert.match(imported.css, /\/\* Imported font[\s\S]*font-family: "Brand";[\s\S]*url\("fonts\/brand\.woff2"\)/);
    assert.deepEqual(imported.assets, [asset], 'the file travels with the graphic that names it');
    assert.equal(St.withAppearanceFaces(t, [{ family: 'Gone', src: 'fonts/gone.woff2', weight: [100, 900] }], []), t, 'no bytes anywhere: nothing declared');
    // An upload named like a bundled file is still the upload: its family and its bytes ship.
    const named = { path: 'fonts/archivo.woff2', data: 'data:font/woff2;base64,BBBB' };
    const upload = St.withAppearanceFaces(t, [{ family: 'Custom Archivo', src: 'fonts/archivo.woff2', weight: [100, 900] }], [{ assets: [named] }]);
    assert.match(upload.css, /font-family: "Custom Archivo";/);
    assert.deepEqual(upload.assets, [named]);
  });
});

// ── Cross-feature cases (docs/work-specs/playout-expanded-acceptance/spec.md E8.1a, AC-2) ───────
// The fold half of two cases the run names: a production look over an imported OGraf package
// beside a native graphic (L2.3 with E3), and a bound cue with its own typeface under that look
// (L2.2 with L2.3 and C1). The press halves are in scripts/graphic-verbs.test.mjs's section of the
// same name.

describe('cross-feature cases (E8.1a)', () => {
  const look = { vars: { accent: '#ff7a00' }, font: { fontId: 'archivo' } };
  const lookOn = () => St.styleContextFor([], () => look);
  const nudged = { v: 1, x: 40 };
  const frame = { dx: 40, dy: 0, s: 1, ox: 960, oy: 540 };

  test('an active look reaches a native graphic and never an imported OGraf package, which keeps its place and size alone (L2.3 with E3, #1784)', () => {
    const native = G.cueAdjustState({ id: 'g', savedAt: 't', adjust: nudged }, { id: 'c' }, HD, HD, {}, G.NO_GEOMETRY, null, false, lookOn());
    assert.equal(native.send.vars.accent, '#ff7a00', 'the look is laid under the native graphic');
    assert.equal(native.send.fonts[0].family, 'Archivo');
    // The same records on a package: the frame goes, no variable and no face.
    const pkg = G.cueAdjustState({ id: 'g', savedAt: 't', adjust: nudged, template: { foreign: {} } }, { id: 'c', adjust: { v: 1, font: { fontId: 'oswald' } } }, HD, HD, {}, G.NO_GEOMETRY, null, false, lookOn());
    assert.equal(pkg.style, null);
    assert.deepEqual(pkg.send, { v: 1, frame });
    assert.equal(pkg.styleId, '', 'and nothing of a style names its measurement');
    // A package that held a look's appearance is sent the frame alone: the style comes off.
    const held = G.cueAdjustState({ id: 'g', savedAt: 't', adjust: nudged, template: { foreign: {} } }, { id: 'c' }, HD, HD, {}, G.NO_GEOMETRY, native.send, false, lookOn());
    assert.deepEqual(held.send, { v: 1, frame });
  });

  test('a bound cue with its own typeface under an active look: a source moving its value re-measures the box, never the face, the look or the style it sends (L2.2, L2.3 with C1)', () => {
    const graphic = { id: 'g', savedAt: 't', adjust: { v: 1, place: 'bl', anchor: 'bl' } };
    const cue = { id: 'c', adjust: { v: 1, font: { fontId: 'oswald' } } };
    const before = { f0: 'Home 1 - 0 Away' };
    const after = { f0: 'Home 12 - 10 Away' };
    const at = (values, geometry) => G.cueAdjustState(graphic, cue, HD, HD, values, geometry, null, false, lookOn());
    const first = at(before, G.NO_GEOMETRY);
    const geometry = { byCue: { c: { id: A.measureId('g', 't', 'c', before, HD, first.measureStyleId), m: { info: LT, paint: LT, minText: 30 } } }, byGraphic: {} };
    const measuredNow = at(before, geometry);
    const moved = at(after, geometry);
    assert.equal(measuredNow.fresh, true);
    assert.equal(moved.fresh, false, 'the box measured for the old value is not taken for the new one');
    assert.match(moved.style.vars['font-heading'], /^"Oswald"/, 'the cue\'s face wins over the look\'s');
    assert.equal(moved.style.vars.accent, '#ff7a00', 'and the look still colours it');
    assert.deepEqual(moved.style, measuredNow.style);
    assert.equal(moved.styleId, measuredNow.styleId);
    assert.equal(moved.measureStyleId, measuredNow.measureStyleId);
    // Air holds the cue's styled appearance; an update the source sends carries none (rule 1), so
    // the face stays applied.
    let air = rememberAired({ ...NO_AIR }, takeCueItems({ id: 'c', graphic: 'Score', values: before, appearance: measuredNow.send }));
    air = rememberAired(air, [{ graphic: 'Score', msg: { t: 'update', data: after } }]);
    assert.deepEqual(air.looks.Score, measuredNow.send);
    assert.equal(air.aired.Score.f0, after.f0);
  });
});
